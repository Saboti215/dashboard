/**
 * Central reactive store — the single source of truth for the dashboard's chrome.storage-backed
 * settings/meetings, feature-visibility, and UI (modal/panel open) state. Registered inside
 * `alpine:init` so it exists before Alpine attaches to the DOM (see index.html/pomodoro.html for
 * load order — this file loads before src/alpine-csp.min.js, which is always last).
 *
 * Both index.html (the New Tab page) and pomodoro.html (the standalone popup) load this file and
 * share the same store definition; pomodoro.html only ever touches the "pomodoro" slice.
 *
 * Everything the user can configure (search engine, calendar embed, accent color, background
 * image, radio station, meetings on/off, language, ...) lives in chrome.storage and is edited
 * through the Settings modal — there is no config file to edit. See README.md for the full list
 * of settings and what each one does.
 *
 * Alpine's CSP build forbids inline expressions in directives (no "!x", "x === y", ternaries,
 * template strings, ...) — only bare identifiers/dotted paths and bare method references are
 * allowed. That's why every conditional/derived value used in a template lives here as a named
 * getter or method instead of inline in index.html/pomodoro.html.
 */

// ---------------------------------------------------------------------------------------------
// Search engines & AI assistant quick-start button
// ---------------------------------------------------------------------------------------------

const SEARCH_ENGINES = {
    brave: { name: "Brave", url: "https://search.brave.com/search", param: "q" },
    google: { name: "Google", url: "https://www.google.com/search", param: "q" },
    duckduckgo: { name: "DuckDuckGo", url: "https://duckduckgo.com/", param: "q" },
    bing: { name: "Bing", url: "https://www.bing.com/search", param: "q" },
    startpage: { name: "Startpage", url: "https://www.startpage.com/sp/search", param: "query" },
    ecosia: { name: "Ecosia", url: "https://www.ecosia.org/search", param: "q" }
};

const AI_ASSISTANTS = {
    gemini: { name: "Gemini", url: "https://gemini.google.com/app" },
    chatgpt: { name: "ChatGPT", url: "https://chatgpt.com/" },
    claude: { name: "Claude", url: "https://claude.ai/new" },
    copilot: { name: "Copilot", url: "https://copilot.microsoft.com/" },
    perplexity: { name: "Perplexity", url: "https://www.perplexity.ai/" }
};

// ---------------------------------------------------------------------------------------------
// Small pure helpers (clock formatting, colors, dates, favicons, clipboard)
// ---------------------------------------------------------------------------------------------

function getClockTime() {
    const today = new Date();
    return today.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getClockDate() {
    const weekdays = t("weekdays");
    const today = new Date();
    return `${weekdays[today.getDay()]}, ${today.getDate()}.${today.getMonth() + 1}.${today.getFullYear()}`;
}

function hexToRgba(hex, alpha) {
    const clean = (hex || "").replace("#", "");
    const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean;
    const value = parseInt(full, 16);

    if (full.length !== 6 || Number.isNaN(value)) return `rgba(99, 102, 241, ${alpha})`; // default accent

    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatDateForStorage(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function formatDateForDisplay(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    return `${d}.${m}.${y}`;
}

function getFaviconUrl(pageUrl) {
    // Uses Chromium's built-in favicon store (requires the "favicon" permission),
    // so icons are served from the browser's local cache instead of being re-fetched from the web.
    const url = new URL(chrome.runtime.getURL("/_favicon/"));
    url.searchParams.set("pageUrl", pageUrl);
    url.searchParams.set("size", "64");
    return url.toString();
}

function copyToClipboard(str) {
    const el = document.createElement('textarea');
    el.value = str;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
}

function getDefaultSettings() {
    return {
        language: detectDefaultLanguage(), // from i18n.js; falls back to the browser's language
        userName: "",
        accentColor: "#6366f1",
        searchEngine: "brave",
        aiAssistant: "gemini",
        calendarIframe: "",
        weatherLocation: "",
        holidayCountry: "",
        quoteEnabled: true,
        worldClock1: "",
        worldClock2: "",
        tuneInId: "",
        radioEnabled: true,
        meetingsEnabled: true,
        pomodoroEnabled: true,
        pomodoroWorkMinutes: 25,
        pomodoroShortBreakMinutes: 5,
        pomodoroLongBreakMinutes: 15,
        pomodoroRoundsUntilLongBreak: 4
    };
}

document.addEventListener("alpine:init", () => {
    Alpine.store("dashboard", {
        // ---- raw state ------------------------------------------------------------------------
        settings: getDefaultSettings(),
        meetings: [],
        backgroundImage: null,
        // Reactive mirror of i18n.js's getLanguage(). t() itself isn't reactive, so every getter
        // below that produces translated text reads `this.lang` first (registering it as a
        // dependency) before calling t(...) — that's the reactivity bridge for language switches.
        lang: getLanguage(),

        clock: { time: "--:--:--", date: "..." },
        greetingText: "",
        worldClock1Text: "",
        worldClock2Text: "",
        worldClock1Visible: false,
        worldClock2Visible: false,

        weatherIconHtml: "",
        weatherText: "",
        holidayText: "",
        quoteText: "",
        quoteAuthor: "",

        bookmarkCategories: [],
        activeMeeting: null,

        pomodoro: {
            timeText: "25:00",
            phaseLabel: "",
            roundLabel: "",
            playPauseLabel: "",
            running: false
        },

        ui: {
            radioPanelOpen: false,
            pomodoroPanelOpen: false,
            meetingsModalOpen: false,
            settingsModalOpen: false
        },

        // ---- feature-enabled getters (derived from settings) ----------------------------------
        get radioEnabled() {
            return this.settings.radioEnabled !== false && !!this.settings.tuneInId;
        },
        get pomodoroEnabled() {
            const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.runtime;
            return !!hasChrome && this.settings.pomodoroEnabled !== false;
        },
        // Visibility only depends on the setting (matches the original's toggleClass logic
        // exactly) — unlike pomodoroEnabled, chrome-availability is NOT part of this gate; the
        // data methods below (loadMeetings/updateActiveMeeting/...) each guard chrome separately,
        // so a missing extension context degrades to an empty, harmless modal instead of hiding
        // the toggle button outright.
        get meetingsEnabled() {
            return this.settings.meetingsEnabled !== false;
        },
        get calendarHtml() {
            return (this.settings.calendarIframe || "").trim();
        },
        get calendarEnabled() {
            return !!this.calendarHtml;
        },
        get weatherVisible() {
            return !!(this.settings.weatherLocation || "").trim();
        },
        get holidayVisible() {
            return !!(this.settings.holidayCountry || "").trim();
        },
        get quoteVisible() {
            return this.settings.quoteEnabled !== false;
        },
        get todayVisible() {
            return this.weatherVisible || this.holidayVisible || this.quoteVisible;
        },
        get hasGreeting() {
            return !!this.settings.userName;
        },
        get hasMeetings() {
            return this.meetings.length > 0;
        },
        get noMeetings() {
            return !this.hasMeetings;
        },

        // ---- class-object getters ("no inline object literals/operators in directives" under
        // the CSP build means every load-bearing class combination needs its own named getter) --
        get radioClass() {
            return { "feature-hidden": !this.radioEnabled, active: this.ui.radioPanelOpen };
        },
        get pomodoroPanelClass() {
            return { "feature-hidden": !this.pomodoroEnabled, active: this.ui.pomodoroPanelOpen };
        },
        get pomodoroToggleClass() {
            return {
                "feature-hidden": !this.pomodoroEnabled,
                active: this.ui.pomodoroPanelOpen,
                running: this.pomodoro.running
            };
        },
        get pomodoroPlayPauseClass() {
            return { running: this.pomodoro.running };
        },
        get pomodoroBadgeVisible() {
            return this.pomodoro.running && !this.ui.pomodoroPanelOpen;
        },
        get pomodoroBadgeClass() {
            return { visible: this.pomodoroBadgeVisible };
        },
        get calendarContainerClass() {
            return { "feature-hidden": !this.calendarEnabled };
        },
        get dashboardGridClass() {
            return { "no-calendar": !this.calendarEnabled };
        },
        get meetingsToggleClass() {
            return { "feature-hidden": !this.meetingsEnabled };
        },
        get meetingPortalClass() {
            return { "feature-hidden": !this.meetingsEnabled, visible: !!this.activeMeeting };
        },
        get meetingsModalClass() {
            return { active: this.ui.meetingsModalOpen };
        },
        get settingsModalClass() {
            return { active: this.ui.settingsModalOpen };
        },
        get todayContainerClass() {
            return { "feature-hidden": !this.todayVisible };
        },
        get weatherWidgetClass() {
            return { "feature-hidden": !this.weatherVisible };
        },
        get holidayWidgetClass() {
            return { "feature-hidden": !this.holidayVisible };
        },
        get quoteWidgetClass() {
            return { "feature-hidden": !this.quoteVisible };
        },
        get worldClock1Class() {
            return { "feature-hidden": !this.worldClock1Visible };
        },
        get worldClock2Class() {
            return { "feature-hidden": !this.worldClock2Visible };
        },

        // ---- search / AI assistant (derived, read-only) ---------------------------------------
        get searchEngineKey() {
            return SEARCH_ENGINES[this.settings.searchEngine] ? this.settings.searchEngine : "brave";
        },
        get searchAction() {
            return SEARCH_ENGINES[this.searchEngineKey].url;
        },
        get searchParam() {
            return SEARCH_ENGINES[this.searchEngineKey].param;
        },
        get searchPlaceholder() {
            void this.lang;
            return t("search.placeholder", { engine: SEARCH_ENGINES[this.searchEngineKey].name });
        },
        get aiHref() {
            const assistant = AI_ASSISTANTS[this.settings.aiAssistant] || AI_ASSISTANTS.gemini;
            return assistant.url;
        },

        // ---- radio (TuneIn embed) --------------------------------------------------------------
        get radioFrameSrc() {
            return this.settings.tuneInId ? `https://tunein.com/embed/player/s${this.settings.tuneInId}/` : "";
        },
        toggleRadioPanel() {
            this.ui.radioPanelOpen = !this.ui.radioPanelOpen;
        },
        closeRadioPanel() {
            this.ui.radioPanelOpen = false;
        },

        // ---- pomodoro panel/modal open state (the countdown itself is driven by
        // src/pomodoro-ui.js's installPomodoroSync(), which writes into `this.pomodoro`) ---------
        togglePomodoroPanel() {
            this.ui.pomodoroPanelOpen = !this.ui.pomodoroPanelOpen;
        },
        closePomodoroPanel() {
            this.ui.pomodoroPanelOpen = false;
        },

        // ---- modals -----------------------------------------------------------------------------
        openMeetingsModal() {
            this.ui.meetingsModalOpen = true;
        },
        closeMeetingsModal() {
            this.ui.meetingsModalOpen = false;
        },
        openSettingsModal() {
            this.ui.settingsModalOpen = true;
        },
        closeSettingsModal() {
            this.ui.settingsModalOpen = false;
        },
        closeAllModals() {
            this.ui.meetingsModalOpen = false;
            this.ui.settingsModalOpen = false;
        },

        // ---- settings storage (chrome.storage.sync, so settings roam across the user's
        // signed-in devices; meetings share the same store) -------------------------------------
        getSyncStorage() {
            return chrome.storage.sync || chrome.storage.local;
        },

        loadSettings(cb) {
            if (typeof chrome === "undefined" || !chrome.storage) {
                this.settings = getDefaultSettings();
                if (cb) cb(this.settings);
                return;
            }

            // Passing the defaults object as the "keys" argument makes chrome.storage fill in any
            // key that isn't in storage yet, so callers always get a complete settings object.
            this.getSyncStorage().get(getDefaultSettings(), settings => {
                this.settings = settings;
                if (cb) cb(settings);
            });
        },

        saveSettings(newSettings, cb) {
            if (typeof chrome === "undefined" || !chrome.storage) {
                if (cb) cb();
                return;
            }

            this.getSyncStorage().set(newSettings, () => {
                if (cb) cb();
            });
        },

        // The background image is a potentially large data URL, so it's kept in its own
        // storage.local key instead of the small, synced settings object (chrome.storage.sync has
        // an ~8KB per-item quota).
        getBackgroundImage(cb) {
            if (typeof chrome === "undefined" || !chrome.storage) {
                cb(null);
                return;
            }
            chrome.storage.local.get({ backgroundImage: null }, data => cb(data.backgroundImage));
        },

        saveBackgroundImage(dataUrl, cb) {
            if (typeof chrome === "undefined" || !chrome.storage) {
                if (cb) cb();
                return;
            }

            if (dataUrl) {
                chrome.storage.local.set({ backgroundImage: dataUrl }, cb);
            } else {
                chrome.storage.local.remove("backgroundImage", cb);
            }
        },

        applyBackground() {
            this.getBackgroundImage(dataUrl => {
                this.backgroundImage = dataUrl;
                document.body.style.backgroundImage = dataUrl ? `url(${dataUrl})` : "none";
            });
        },

        applyAccentColor(hex) {
            if (!hex) return;
            document.documentElement.style.setProperty("--accent-color", hex);
            document.documentElement.style.setProperty("--accent-glow", hexToRgba(hex, 0.15));
        },

        // Called on load and again after every settings save, in case the language changed. Static
        // texts are re-swept via data-i18n attributes (i18n.js); dynamic content that isn't tied to
        // a DOM attribute (bookmarks, clock date, world clock) is re-rendered explicitly. Meetings,
        // the active-meeting card, search placeholder, and pomodoro labels update automatically —
        // they're reactive getters (or written by a tick that itself calls t()) keyed off `lang`.
        applyLanguage(lang) {
            setLanguage(lang);
            applyStaticTranslations();
            this.lang = getLanguage();

            this.refreshClock();
            this.loadBookmarks();

            const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.runtime;
            if (hasChrome) renderPomodoroTick(this); // from pomodoro-ui.js; re-renders phase/round/button labels

            // Re-renders from their existing cache (no re-fetch) purely to pick up the new language.
            this.loadWeather();
            this.loadHolidays();
            this.loadQuote();
        },

        // ---- bookmarks (rendered from the browser's bookmarks bar; see README for the
        // folder->category rule) -----------------------------------------------------------------
        loadBookmarks() {
            if (typeof chrome === "undefined" || !chrome.bookmarks) return;

            chrome.bookmarks.getTree(nodes => {
                const root = nodes[0];
                const bar = (root.children || []).find(n => n.id === "1") || (root.children || [])[0];
                if (!bar || !bar.children) { this.bookmarkCategories = []; return; }

                const folders = [];
                const loose = [];

                bar.children.forEach(node => {
                    if (node.children) {
                        folders.push(node);
                    } else if (node.url) {
                        loose.push(node);
                    }
                });

                const categories = [];

                // Loose bookmarks directly on the bookmarks bar (not in a folder)
                if (loose.length) {
                    categories.push(this.buildBookmarkCategory(t("bookmarks.general"), loose));
                }

                // Every folder becomes its own category, so the bar's structure is the only place
                // a user needs to organize their quick links.
                folders.forEach(folder => {
                    const bookmarks = folder.children.filter(n => n.url);
                    if (bookmarks.length) {
                        categories.push(this.buildBookmarkCategory(folder.title || t("bookmarks.misc"), bookmarks));
                    }
                });

                this.bookmarkCategories = categories;
            });
        },

        buildBookmarkCategory(title, bookmarks) {
            return {
                title,
                links: bookmarks.map(b => ({
                    href: b.url,
                    name: b.title || b.url,
                    style: `background-image: url(${getFaviconUrl(b.url)});`
                }))
            };
        },

        // ---- clock, greeting, world clock -------------------------------------------------------
        refreshClock() {
            this.clock.time = getClockTime();
            this.clock.date = getClockDate();
            this.refreshGreeting();
            this.refreshWorldClock();
        },

        // Shows a time-of-day greeting ("Good morning, <name>") once a name is set in Settings ->
        // General; hidden entirely otherwise (see the hasGreeting getter).
        refreshGreeting() {
            const name = this.settings.userName;
            if (!name) {
                this.greetingText = "";
                return;
            }

            const hour = new Date().getHours();
            const key = hour < 11 ? "greeting.morning" : hour < 18 ? "greeting.afternoon" : "greeting.evening";
            this.greetingText = t(key, { name });
        },

        refreshWorldClock() {
            this.refreshWorldClockSlot(1, this.settings.worldClock1);
            this.refreshWorldClockSlot(2, this.settings.worldClock2);
        },

        refreshWorldClockSlot(slot, zoneKey) {
            const zone = WORLD_CLOCK_ZONES[zoneKey];

            if (!zone) {
                this[`worldClock${slot}Visible`] = false;
                this[`worldClock${slot}Text`] = "";
                return;
            }

            // Hardcoded to "de-DE" (24h format) to match the main clock (getClockTime() above),
            // which always shows 24h regardless of the UI language.
            const time = new Intl.DateTimeFormat("de-DE", {
                timeZone: zone.zone,
                hour: "2-digit",
                minute: "2-digit"
            }).format(new Date());

            this[`worldClock${slot}Visible`] = true;
            this[`worldClock${slot}Text`] = `${zone.label} · ${time}`;
        },

        // ---- weather (Open-Meteo) ---------------------------------------------------------------
        loadWeather() {
            if (!this.weatherVisible) {
                this.weatherIconHtml = "";
                this.weatherText = "";
                return;
            }

            const location = this.settings.weatherLocation.trim();

            getWeatherCache(cache => {
                const fresh = cache && cache.query === location && (Date.now() - cache.fetchedAt) < WEATHER_CACHE_TTL_MS;
                if (fresh) {
                    this.renderWeather(cache);
                    return;
                }

                this.weatherIconHtml = "";
                this.weatherText = t("extras.loading");
                fetchWeather(location)
                    .then(data => {
                        saveWeatherCache(data);
                        this.renderWeather(data);
                    })
                    .catch(() => {
                        this.weatherIconHtml = "";
                        this.weatherText = t("extras.weather.error");
                    });
            });
        },

        renderWeather(data) {
            const code = data.current ? data.current.weather_code : undefined;
            const condition = WEATHER_CODE_MAP[code] || WEATHER_CODE_MAP[3];
            const temp = data.current ? Math.round(data.current.temperature_2m) : null;
            const max = data.daily && data.daily.temperature_2m_max ? Math.round(data.daily.temperature_2m_max[0]) : null;
            const min = data.daily && data.daily.temperature_2m_min ? Math.round(data.daily.temperature_2m_min[0]) : null;

            this.weatherIconHtml = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">${WEATHER_ICONS[condition.icon]}</svg>`;

            const parts = [];
            if (temp !== null) parts.push(`${temp}°C`);
            parts.push(t(`extras.weather.condition.${condition.label}`));
            if (min !== null && max !== null) parts.push(`${min}°/${max}°`);

            this.weatherText = `${data.name} · ${parts.join(" · ")}`;
        },

        // ---- public holidays (Nager.Date) --------------------------------------------------------
        loadHolidays() {
            if (!this.holidayVisible) {
                this.holidayText = "";
                return;
            }

            const country = this.settings.holidayCountry.trim().toUpperCase();
            const year = new Date().getFullYear();

            getHolidayCache(cache => {
                const fresh = cache && cache.year === year && cache.country === country;
                if (fresh) {
                    this.renderHolidays(cache.holidays);
                    return;
                }

                this.holidayText = t("extras.loading");
                fetchHolidays(year, country)
                    .then(holidays => {
                        saveHolidayCache({ year, country, holidays });
                        this.renderHolidays(holidays);
                    })
                    .catch(() => {
                        this.holidayText = t("extras.holiday.error");
                    });
            });
        },

        renderHolidays(holidays) {
            const todayStr = formatDateForStorage(new Date());
            const today = holidays.find(h => h.date === todayStr);

            if (today) {
                this.holidayText = t("extras.holiday.today", { name: today.localName });
                return;
            }

            const next = holidays
                .filter(h => h.date >= todayStr)
                .sort((a, b) => a.date.localeCompare(b.date))[0];

            this.holidayText = next
                ? t("extras.holiday.next", { name: next.localName, date: formatDateForDisplay(next.date) })
                : t("extras.holiday.none");
        },

        // ---- quote of the day — bundled offline (src/quotes-data.js), rotates once per day ----
        loadQuote() {
            if (!this.quoteVisible) {
                this.quoteText = "";
                this.quoteAuthor = "";
                return;
            }
            this.renderQuote();
        },

        renderQuote() {
            const start = new Date(new Date().getFullYear(), 0, 0);
            const diff = Date.now() - start.getTime();
            const dayOfYear = Math.floor(diff / (24 * 60 * 60 * 1000));
            const quote = QUOTES[dayOfYear % QUOTES.length];

            this.quoteText = `"${quote[getLanguage()]}"`;
            this.quoteAuthor = `— ${quote.author}`;
        },

        // ---- meetings (stored in chrome.storage; managed through the Meetings modal) ----------
        loadMeetings(cb) {
            if (typeof chrome === "undefined" || !chrome.storage) {
                // No extension context to re-fetch from — keep whatever's already in memory
                // (e.g. from a prior saveMeetingsList()) instead of wiping it on every call.
                if (cb) cb(this.meetings);
                return;
            }

            this.getSyncStorage().get({ meetings: [] }, data => {
                this.meetings = data.meetings || [];
                if (cb) cb(this.meetings);
            });
        },

        saveMeetingsList(meetings, cb) {
            this.meetings = meetings;

            if (typeof chrome === "undefined" || !chrome.storage) {
                if (cb) cb();
                return;
            }

            this.getSyncStorage().set({ meetings }, () => {
                if (cb) cb();
            });
        },

        getMeetingById(id, cb) {
            this.loadMeetings(meetings => cb(meetings.find(m => m.id === id) || null));
        },

        addOrUpdateMeeting(meeting, cb) {
            this.loadMeetings(meetings => {
                const list = meetings.slice();
                const existingIndex = list.findIndex(m => m.id === meeting.id);
                if (existingIndex >= 0) {
                    list[existingIndex] = meeting;
                } else {
                    list.push(meeting);
                }

                this.saveMeetingsList(list, () => {
                    // Refresh the active-meeting card in case the change affects it right now.
                    this.activeMeeting = null;
                    this.updateActiveMeeting();
                    if (cb) cb();
                });
            });
        },

        deleteMeeting(id, cb) {
            this.loadMeetings(meetings => {
                const filtered = meetings.filter(m => m.id !== id);
                this.saveMeetingsList(filtered, () => {
                    this.activeMeeting = null;
                    this.updateActiveMeeting();
                    if (cb) cb();
                });
            });
        },

        // Re-fetches from storage directly (rather than trusting the in-memory `meetings` array)
        // so a meeting added/edited from a different window/tab is still picked up here — this
        // runs on its own 60-second interval independent of whether the meetings modal is open.
        updateActiveMeeting() {
            if (typeof chrome === "undefined" || !chrome.storage) {
                this.activeMeeting = null;
                return;
            }

            this.getSyncStorage().get({ meetings: [] }, data => {
                const meetings = data.meetings || [];

                // Check if there is a meeting in the next 15 minutes or right now
                const today = new Date();
                const now = today.getHours() * 60 + today.getMinutes();
                const todayStr = formatDateForStorage(today);

                const meeting = meetings.find(m => {
                    const startHour = parseInt(m.start_time.split(":")[0]);
                    const endHour = parseInt(m.end_time.split(":")[0]);
                    const startMin = parseInt(m.start_time.split(":")[1]);
                    const endMin = parseInt(m.end_time.split(":")[1]);
                    const start = startHour * 60 + startMin - 15; // 15 minutes before the start
                    const end = endHour * 60 + endMin;

                    const isToday = m.recurrence === "once"
                        ? m.date === todayStr
                        : Number(m.weekday) === today.getDay();

                    return isToday && start <= now && now < end;
                });

                this.activeMeeting = meeting || null;
            });
        },

        // ---- meeting list / active-meeting view-models (reactive getters) ----------------------
        get meetingRows() {
            void this.lang;
            const weekdays = t("weekdays");

            return this.meetings
                .slice()
                .sort((a, b) => a.start_time.localeCompare(b.start_time))
                .map(m => {
                    const when = m.recurrence === "once"
                        ? formatDateForDisplay(m.date)
                        : weekdays[Number(m.weekday)];
                    const typeLabel = m.type === "teams" ? "MS Teams" : "Zoom";

                    return {
                        id: m.id,
                        name: m.name,
                        metaText: `${typeLabel} · ${when} · ${m.start_time}-${m.end_time}`,
                        editTitle: t("meetings.edit"),
                        deleteTitle: t("meetings.delete")
                    };
                });
        },
        get activeMeetingBadge() {
            void this.lang;
            if (!this.activeMeeting) return "";
            const typeLabel = this.activeMeeting.type === "teams" ? "MS Teams" : "Zoom";
            return `${t("meetings.active")} · ${typeLabel}`;
        },
        get activeMeetingTime() {
            void this.lang;
            if (!this.activeMeeting) return "";
            return t("meetings.todayTime", { start: this.activeMeeting.start_time, end: this.activeMeeting.end_time });
        },
        get joinMeetingLabel() {
            void this.lang;
            return t("meetings.join");
        },

        joinActiveMeeting() {
            const meeting = this.activeMeeting;
            if (!meeting) return;

            // Copy the password (if any) and join via the stored link
            if (meeting.password) {
                copyToClipboard(meeting.password);
            }

            window.location.href = meeting.link;
        }
    });
});
