/**
 * Dashboard behavior.
 *
 * Everything the user can configure (search engine, calendar embed, accent color, background
 * image, radio station, meetings on/off, language, ...) lives in chrome.storage and is edited
 * through the Settings modal (#settings-toggle / #settings-modal) — there is no config file to
 * edit anymore. See README.md for the full list of settings and what each one does.
 */

// Populated once getSettings() resolves; kept up to date after every save so functions that run
// on an interval (the clock, the meeting checker) always see the latest values.
let AppSettings = {};

// Background image upload state, held only while the Settings modal is open:
//   undefined -> untouched (don't touch storage on save)
//   null      -> user clicked "Remove" (delete the stored image on save)
//   data URL  -> user picked a new file (store it on save)
let pendingBackgroundImage;

// One-time event-binding guards. The apply/load functions below get called again every time
// settings change (so a toggle can take effect without a reload) but their click/submit handlers
// must only be attached once, or they'd fire multiple times per click after a second call.
let meetingsModalWired = false;
let settingsModalWired = false;
let radioWired = false;
let pomodoroWired = false;
let meetingsInterval = null;

$(document).ready(() => {
    $(document.body).attr("data-copy-right", `© ${new Date().getFullYear()} Tobias Schlößer`);

    initModals();

    // Settings-independent widgets can start immediately.
    loadClock();

    // Everything else depends on the user's stored settings, which load asynchronously.
    getSettings(settings => {
        AppSettings = settings;

        applyLanguage(settings.language);
        applyAccentColor(settings.accentColor);
        applyAiAssistant(settings.aiAssistant);
        applyBackground();
        loadCalendar(settings);
        loadSearch(settings);
        loadWeather(settings);
        loadHolidays(settings);
        loadQuote(settings);
        loadWorldClock(settings);
        loadRadio(settings);
        loadMeetings(settings);
        loadPomodoro(settings);
        applyGreeting(settings.userName);
        loadSettingsModal(settings);
    });
});

// ---------------------------------------------------------------------------------------------
// Settings storage (chrome.storage.sync, so settings roam across the user's signed-in devices)
// ---------------------------------------------------------------------------------------------

// Shared by both the settings object and the meetings list: both are small enough to live in
// chrome.storage.sync (so they roam across the user's signed-in devices), falling back to
// storage.local if sync is unavailable for some reason.
function getSyncStorage() {
    return chrome.storage.sync || chrome.storage.local;
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

function getSettings(cb) {
    if (typeof chrome === "undefined" || !chrome.storage) {
        cb(getDefaultSettings());
        return;
    }

    // Passing the defaults object as the "keys" argument makes chrome.storage fill in any key
    // that isn't in storage yet, so callers always get a complete settings object.
    getSyncStorage().get(getDefaultSettings(), cb);
}

function saveSettings(settings, cb) {
    if (typeof chrome === "undefined" || !chrome.storage) {
        if (cb) cb();
        return;
    }

    getSyncStorage().set(settings, () => {
        if (cb) cb();
    });
}

// The background image is a potentially large data URL, so it's kept in its own storage.local key
// instead of the small, synced "settings" object (chrome.storage.sync has an ~8KB per-item quota).
function getBackgroundImage(cb) {
    if (typeof chrome === "undefined" || !chrome.storage) {
        cb(null);
        return;
    }

    chrome.storage.local.get({ backgroundImage: null }, data => cb(data.backgroundImage));
}

function saveBackgroundImage(dataUrl, cb) {
    if (typeof chrome === "undefined" || !chrome.storage) {
        if (cb) cb();
        return;
    }

    if (dataUrl) {
        chrome.storage.local.set({ backgroundImage: dataUrl }, cb);
    } else {
        chrome.storage.local.remove("backgroundImage", cb);
    }
}

// ---------------------------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------------------------

// Called on load and again after every settings save, in case the language changed. Static texts
// are re-swept via data-i18n attributes; anything rendered dynamically (dates, bookmark category
// names, the meeting list, the active-meeting card, the search placeholder) is re-rendered
// explicitly since it isn't tied to a DOM attribute i18n can find on its own.
function applyLanguage(lang) {
    setLanguage(lang);
    applyStaticTranslations();

    $("#clock-date").text(getClockDate());
    applyGreeting(AppSettings.userName);
    updateSearchPlaceholder(AppSettings.searchEngine);
    loadBookmarks();
    renderMeetingsList();
    updateMeetings();
    renderPomodoroTick(); // from pomodoro-ui.js; re-renders phase/round/button labels

    // Re-renders from their existing cache (no re-fetch) purely to pick up the new language.
    loadWeather(AppSettings);
    loadHolidays(AppSettings);
    loadQuote(AppSettings);
    loadWorldClock(AppSettings);
}

// ---------------------------------------------------------------------------------------------
// Bookmarks (rendered from the browser's bookmarks bar; see README for the folder->category rule)
// ---------------------------------------------------------------------------------------------

function loadBookmarks() {
    if (typeof chrome === "undefined" || !chrome.bookmarks) return;

    chrome.bookmarks.getTree(nodes => {
        const root = nodes[0];
        const bar = (root.children || []).find(n => n.id === "1") || (root.children || [])[0];
        if (!bar || !bar.children) return;

        const folders = [];
        const loose = [];

        bar.children.forEach(node => {
            if (node.children) {
                folders.push(node);
            } else if (node.url) {
                loose.push(node);
            }
        });

        let html = "";

        // Loose bookmarks directly on the bookmarks bar (not in a folder)
        if (loose.length) {
            html += renderBookmarkCategory(t("bookmarks.general"), loose);
        }

        // Every folder becomes its own category, so the bar's structure is the only place a
        // user needs to organize their quick links.
        folders.forEach(folder => {
            const bookmarks = folder.children.filter(n => n.url);
            if (bookmarks.length) {
                html += renderBookmarkCategory(folder.title || t("bookmarks.misc"), bookmarks);
            }
        });

        $("#apps-wrapper").html(html);
    });
}

function renderBookmarkCategory(title, bookmarks) {
    const links = bookmarks.map(b => {
        const name = escapeHtml(b.title || b.url);
        const url = escapeHtml(b.url);
        const icon = escapeHtml(getFaviconUrl(b.url));
        return `<a href="${url}" data-name="${name}" style="background-image: url(${icon});"></a>`;
    }).join("");

    return `
        <div class="app-category">
            <div class="category-title">${escapeHtml(title)}</div>
            <div class="app-grid">${links}</div>
        </div>
    `;
}

function getFaviconUrl(pageUrl) {
    // Uses Chromium's built-in favicon store (requires the "favicon" permission),
    // so icons are served from the browser's local cache instead of being re-fetched from the web.
    const url = new URL(chrome.runtime.getURL("/_favicon/"));
    url.searchParams.set("pageUrl", pageUrl);
    url.searchParams.set("size", "64");
    return url.toString();
}

// ---------------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------------

const SEARCH_ENGINES = {
    brave: { name: "Brave", url: "https://search.brave.com/search", param: "q" },
    google: { name: "Google", url: "https://www.google.com/search", param: "q" },
    duckduckgo: { name: "DuckDuckGo", url: "https://duckduckgo.com/", param: "q" },
    bing: { name: "Bing", url: "https://www.bing.com/search", param: "q" },
    startpage: { name: "Startpage", url: "https://www.startpage.com/sp/search", param: "query" },
    ecosia: { name: "Ecosia", url: "https://www.ecosia.org/search", param: "q" }
};

function loadSearch(settings) {
    const engineKey = SEARCH_ENGINES[settings.searchEngine] ? settings.searchEngine : "brave";
    const engine = SEARCH_ENGINES[engineKey];

    $("#search-form").attr("action", engine.url);
    $("#search-input").attr("name", engine.param);
    updateSearchPlaceholder(engineKey);

    // Ensure the search bar has focus even if the browser tries to focus the omnibox instead
    $("#search-input").trigger("focus");
}

function updateSearchPlaceholder(engineKey) {
    const engine = SEARCH_ENGINES[engineKey] || SEARCH_ENGINES.brave;
    $("#search-input").attr("placeholder", t("search.placeholder", { engine: engine.name }));
}

// ---------------------------------------------------------------------------------------------
// AI assistant quick-start button
// ---------------------------------------------------------------------------------------------

const AI_ASSISTANTS = {
    gemini: { name: "Gemini", url: "https://gemini.google.com/app" },
    chatgpt: { name: "ChatGPT", url: "https://chatgpt.com/" },
    claude: { name: "Claude", url: "https://claude.ai/new" },
    copilot: { name: "Copilot", url: "https://copilot.microsoft.com/" },
    perplexity: { name: "Perplexity", url: "https://www.perplexity.ai/" }
};

function applyAiAssistant(assistantKey) {
    const assistant = AI_ASSISTANTS[assistantKey] || AI_ASSISTANTS.gemini;
    $("#ai-btn").attr("href", assistant.url);
}

// ---------------------------------------------------------------------------------------------
// Radio (TuneIn embed)
// ---------------------------------------------------------------------------------------------

function loadRadio(settings) {
    const enabled = settings.radioEnabled !== false && !!settings.tuneInId;
    $("#radio-panel, #radio-toggle").toggleClass("feature-hidden", !enabled);

    if (!enabled) {
        $("#radio-panel, #radio-toggle").removeClass("active");
        return;
    }

    $("#radio-frame").attr("src", `https://tunein.com/embed/player/s${settings.tuneInId}/`);

    if (radioWired) return;
    radioWired = true;

    // Toggle player panel visibility
    $("#radio-toggle").on("click", function() {
        $("#radio-panel").toggleClass("active");
        $(this).toggleClass("active");
    });

    // Close player when clicking outside it
    $(document).on("click", function(event) {
        if (!$(event.target).closest("#radio-panel, #radio-toggle").length) {
            $("#radio-panel").removeClass("active");
            $("#radio-toggle").removeClass("active");
        }
    });
}

// ---------------------------------------------------------------------------------------------
// Pomodoro timer
//
// The actual timekeeping (chrome.alarms) and notification live in the background service worker
// (src/background.js) so the timer keeps running and notifies even when this panel — or the whole
// New Tab page — isn't open. This function only shows/hides the widget and wires up its controls;
// the countdown rendering and button-click handling are shared with pomodoro.html via
// initPomodoroWidget() (src/pomodoro-ui.js).
// ---------------------------------------------------------------------------------------------

function loadPomodoro(settings) {
    // initPomodoroWidget() (src/pomodoro-ui.js) calls chrome.storage/chrome.runtime directly with
    // no guard of its own, so treat a missing extension context (e.g. the file opened directly,
    // outside the extension) the same as "disabled" here rather than letting it throw.
    const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.runtime;
    const enabled = hasChrome && settings.pomodoroEnabled !== false;
    $("#pomodoro-toggle, #pomodoro-panel").toggleClass("feature-hidden", !enabled);

    if (!enabled) {
        $("#pomodoro-panel, #pomodoro-toggle").removeClass("active");
        if (hasChrome) {
            chrome.runtime.sendMessage({ type: "pomodoro:disable" });
        }
        return;
    }

    initPomodoroWidget();

    if (pomodoroWired) return;
    pomodoroWired = true;

    // Toggle panel visibility
    $("#pomodoro-toggle").on("click", function() {
        $("#pomodoro-panel").toggleClass("active");
        $(this).toggleClass("active");
        renderPomodoroTick(); // updates the badge immediately instead of waiting for the next tick
    });

    // Close panel when clicking outside it
    $(document).on("click", function(event) {
        if (!$(event.target).closest("#pomodoro-panel, #pomodoro-toggle").length) {
            const wasOpen = $("#pomodoro-panel").hasClass("active");
            $("#pomodoro-panel").removeClass("active");
            $("#pomodoro-toggle").removeClass("active");
            if (wasOpen) renderPomodoroTick();
        }
    });

    $("#pomodoro-open-window").on("click", () => {
        chrome.windows.create({
            url: chrome.runtime.getURL("pomodoro.html"),
            type: "popup",
            width: 320,
            height: 330
        });
    });
}

// ---------------------------------------------------------------------------------------------
// Calendar (arbitrary iframe embed the user pastes in Settings, e.g. from Google Calendar)
// ---------------------------------------------------------------------------------------------

function loadCalendar(settings) {
    const iframe = (settings.calendarIframe || "").trim();
    $("#calendar-wrapper").html(iframe);
    $("#calendar-container").toggleClass("feature-hidden", !iframe);
    // Without a calendar, #dashboard would auto-place .right-column into the first (wider) grid
    // track, leaving dead space on the right. This class switches to a centered single column.
    $("#dashboard").toggleClass("no-calendar", !iframe);
}

// ---------------------------------------------------------------------------------------------
// Clock & greeting
// ---------------------------------------------------------------------------------------------

function loadClock() {
    $("#clock-time").text(getClockTime());
    $("#clock-date").text(getClockDate());

    window.setInterval(() => {
        $("#clock-time").text(getClockTime());
        $("#clock-date").text(getClockDate());
        applyGreeting(AppSettings.userName);
        loadWorldClock(AppSettings); // from src/extras.js
    }, 1000);
}

function getClockTime() {
    const today = new Date();
    return today.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getClockDate() {
    const weekdays = t("weekdays");
    const today = new Date();
    return `${weekdays[today.getDay()]}, ${today.getDate()}.${today.getMonth() + 1}.${today.getFullYear()}`;
}

// Shows a time-of-day greeting ("Good morning, <name>") next to the clock once a name is set in
// Settings -> General; hidden entirely otherwise.
function applyGreeting(name) {
    const el = $("#greeting");

    if (!name) {
        el.hide().empty();
        return;
    }

    const hour = new Date().getHours();
    const key = hour < 11 ? "greeting.morning" : hour < 18 ? "greeting.afternoon" : "greeting.evening";
    el.text(t(key, { name })).show();
}

function applyBackground() {
    getBackgroundImage(dataUrl => {
        $(document.body).css("background-image", dataUrl ? `url(${dataUrl})` : "none");
    });
}

function applyAccentColor(hex) {
    if (!hex) return;
    document.documentElement.style.setProperty("--accent-color", hex);
    document.documentElement.style.setProperty("--accent-glow", hexToRgba(hex, 0.15));
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

// ---------------------------------------------------------------------------------------------
// Meetings (stored in chrome.storage; managed through the Meetings modal)
// ---------------------------------------------------------------------------------------------

function getMeetings(cb) {
    getSyncStorage().get({ meetings: [] }, data => cb(data.meetings || []));
}

function saveMeetings(meetings, cb) {
    getSyncStorage().set({ meetings }, () => {
        if (cb) cb();
    });
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

function loadMeetings(settings) {
    const enabled = settings.meetingsEnabled !== false;
    $("#meetings-toggle, #meeting-portal").toggleClass("feature-hidden", !enabled);

    if (meetingsInterval) {
        clearInterval(meetingsInterval);
        meetingsInterval = null;
    }

    if (!enabled || typeof chrome === "undefined" || !chrome.storage) {
        $("#meetings-modal").removeClass("active");
        $("#meeting-portal").removeClass("visible").empty();
        return;
    }

    updateMeetings();
    meetingsInterval = window.setInterval(updateMeetings, 60 * 1000); // Reload every minute

    loadMeetingsModal();
}

function updateMeetings() {
    if (typeof chrome === "undefined" || !chrome.storage) return;

    getMeetings(meetings => {
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

            // Return whether this meeting is now or not
            return (isToday && start <= now && now < end);
        });

        if (!meeting) {
            $("#meeting-portal").removeClass("visible").empty();
            return;
        }

        // Check if the meeting alert is already rendered
        if ($("#active-meeting").length === 0) {
            const typeLabel = meeting.type === "teams" ? "MS Teams" : "Zoom";
            const meetingHtml = `
                <div class="meeting-card" id="active-meeting">
                    <div class="meeting-header">
                        <span class="pulse-dot"></span>
                        <span class="meeting-badge">${escapeHtml(t("meetings.active"))} &middot; ${escapeHtml(typeLabel)}</span>
                    </div>
                    <div class="meeting-title">${escapeHtml(meeting.name)}</div>
                    <div class="meeting-time">${escapeHtml(t("meetings.todayTime", { start: meeting.start_time, end: meeting.end_time }))}</div>
                    <button class="meeting-btn" id="join-meeting-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="btn-icon">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        ${escapeHtml(t("meetings.join"))}
                    </button>
                </div>
            `;
            $("#meeting-portal").html(meetingHtml).addClass("visible");

            $("#join-meeting-btn").on("click", () => {
                // Copy the password (if any) and join via the stored link
                if (meeting.password) {
                    copyToClipboard(meeting.password);
                }

                window.location.href = meeting.link;
            });
        }
    });
}

function loadMeetingsModal() {
    renderMeetingsList();

    if (meetingsModalWired) return;
    meetingsModalWired = true;

    $("#meetings-toggle").on("click", () => {
        renderMeetingsList();
        $("#meetings-modal").addClass("active");
    });

    // Toggle between "weekly" (weekday select) and "once" (date picker)
    $("#recurrence-toggle button").on("click", function() {
        const value = $(this).data("value");
        $("#meeting-recurrence").val(value);
        $("#recurrence-toggle button").removeClass("active");
        $(this).addClass("active");
        $("#weekday-row").toggle(value === "weekly");
        $("#date-row").toggle(value === "once");
    });

    $("#meeting-form-cancel").on("click", () => resetMeetingForm());

    $("#meeting-form").on("submit", (e) => {
        e.preventDefault();

        const meeting = {
            id: $("#meeting-id").val() || crypto.randomUUID(),
            name: $("#meeting-name").val().trim(),
            type: $("#meeting-type").val(),
            link: $("#meeting-link").val().trim(),
            password: $("#meeting-password").val().trim(),
            start_time: $("#meeting-start").val(),
            end_time: $("#meeting-end").val(),
            recurrence: $("#meeting-recurrence").val(),
            weekday: Number($("#meeting-weekday").val()),
            date: $("#meeting-date").val()
        };

        if (!meeting.name || !meeting.link || !meeting.start_time || !meeting.end_time) return;
        if (meeting.recurrence === "once" && !meeting.date) return;

        getMeetings(meetings => {
            const existingIndex = meetings.findIndex(m => m.id === meeting.id);
            if (existingIndex >= 0) {
                meetings[existingIndex] = meeting;
            } else {
                meetings.push(meeting);
            }

            saveMeetings(meetings, () => {
                resetMeetingForm();
                renderMeetingsList();
                // Refresh the active-meeting card in case the change affects it right now
                $("#meeting-portal").removeClass("visible").empty();
                updateMeetings();
            });
        });
    });

    $("#meetings-list").on("click", "[data-edit]", function() {
        const id = $(this).data("edit");
        getMeetings(meetings => {
            const meeting = meetings.find(m => m.id === id);
            if (meeting) fillMeetingForm(meeting);
        });
    });

    $("#meetings-list").on("click", "[data-delete]", function() {
        const id = $(this).data("delete");
        getMeetings(meetings => {
            const filtered = meetings.filter(m => m.id !== id);
            saveMeetings(filtered, () => {
                renderMeetingsList();
                $("#meeting-portal").removeClass("visible").empty();
                updateMeetings();
            });
        });
    });
}

function renderMeetingsList() {
    if (typeof chrome === "undefined" || !chrome.storage) return;

    getMeetings(meetings => {
        if (!meetings.length) {
            $("#meetings-list").html(`<div class="meetings-empty">${escapeHtml(t("meetings.empty"))}</div>`);
            return;
        }

        const weekdays = t("weekdays");

        const rows = meetings
            .slice()
            .sort((a, b) => a.start_time.localeCompare(b.start_time))
            .map(m => {
                const when = m.recurrence === "once"
                    ? formatDateForDisplay(m.date)
                    : weekdays[Number(m.weekday)];
                const typeLabel = m.type === "teams" ? "MS Teams" : "Zoom";

                return `
                    <div class="meeting-row">
                        <div class="meeting-row-info">
                            <div class="meeting-row-name">${escapeHtml(m.name)}</div>
                            <div class="meeting-row-meta">${escapeHtml(typeLabel)} &middot; ${escapeHtml(when)} &middot; ${escapeHtml(m.start_time)}-${escapeHtml(m.end_time)}</div>
                        </div>
                        <div class="meeting-row-actions">
                            <button type="button" data-edit="${escapeHtml(m.id)}" title="${escapeHtml(t("meetings.edit"))}">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            </button>
                            <button type="button" data-delete="${escapeHtml(m.id)}" title="${escapeHtml(t("meetings.delete"))}">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            }).join("");

        $("#meetings-list").html(rows);
    });
}

function fillMeetingForm(meeting) {
    $("#meeting-id").val(meeting.id);
    $("#meeting-name").val(meeting.name);
    $("#meeting-type").val(meeting.type);
    $("#meeting-link").val(meeting.link);
    $("#meeting-password").val(meeting.password || "");
    $("#meeting-start").val(meeting.start_time);
    $("#meeting-end").val(meeting.end_time);
    $("#meeting-recurrence").val(meeting.recurrence);
    $("#meeting-weekday").val(meeting.weekday);
    $("#meeting-date").val(meeting.date || "");

    $("#recurrence-toggle button").removeClass("active");
    $(`#recurrence-toggle button[data-value="${meeting.recurrence}"]`).addClass("active");
    $("#weekday-row").toggle(meeting.recurrence === "weekly");
    $("#date-row").toggle(meeting.recurrence === "once");

    $("#meeting-name").trigger("focus");
}

function resetMeetingForm() {
    $("#meeting-form")[0].reset();
    $("#meeting-id").val("");
    $("#meeting-recurrence").val("weekly");
    $("#recurrence-toggle button").removeClass("active");
    $("#recurrence-toggle button[data-value=weekly]").addClass("active");
    $("#weekday-row").show();
    $("#date-row").hide();
}

// ---------------------------------------------------------------------------------------------
// Settings modal
// ---------------------------------------------------------------------------------------------

function loadSettingsModal(settings) {
    fillSettingsForm(settings);

    if (settingsModalWired) return;
    settingsModalWired = true;

    $("#settings-toggle").on("click", () => {
        // Re-fetch on every open so the form always reflects the latest saved state, even if it
        // was changed in a different tab/window in the meantime.
        getSettings(current => {
            fillSettingsForm(current);
            $("#settings-modal").addClass("active");
        });
    });

    $("#settings-form-cancel").on("click", () => {
        $("#settings-modal").removeClass("active");
    });

    $("#settings-background-file").on("change", function() {
        const file = this.files && this.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            pendingBackgroundImage = reader.result; // data URL, only stored once the form is saved
            showBackgroundPreview(pendingBackgroundImage);
        };
        reader.readAsDataURL(file);
    });

    $("#settings-background-remove").on("click", () => {
        pendingBackgroundImage = null; // queued for removal on save
        $("#settings-background-file").val("");
        showBackgroundPreview(null);
    });

    // Hide each feature's detail fields while its own "show ..." checkbox is unchecked, so the
    // form only shows settings that currently do anything.
    $("#settings-radio-enabled").on("change", function() {
        $("#settings-radio-details").toggle(this.checked);
    });

    $("#settings-pomodoro-enabled").on("change", function() {
        $("#settings-pomodoro-details").toggle(this.checked);
    });

    $("#settings-form").on("submit", (e) => {
        e.preventDefault();

        const newSettings = {
            language: $("#settings-language").val(),
            userName: $("#settings-user-name").val().trim(),
            accentColor: $("#settings-accent-color").val(),
            searchEngine: $("#settings-search-engine").val(),
            aiAssistant: $("#settings-ai-assistant").val(),
            calendarIframe: $("#settings-calendar-iframe").val().trim(),
            weatherLocation: $("#settings-weather-location").val().trim(),
            holidayCountry: $("#settings-holiday-country").val().trim(),
            quoteEnabled: $("#settings-quote-enabled").is(":checked"),
            worldClock1: $("#settings-world-clock-1").val(),
            worldClock2: $("#settings-world-clock-2").val(),
            tuneInId: $("#settings-tunein-id").val().trim(),
            radioEnabled: $("#settings-radio-enabled").is(":checked"),
            meetingsEnabled: $("#settings-meetings-enabled").is(":checked"),
            pomodoroEnabled: $("#settings-pomodoro-enabled").is(":checked"),
            pomodoroWorkMinutes: Number($("#settings-pomodoro-work").val()) || 25,
            pomodoroShortBreakMinutes: Number($("#settings-pomodoro-short-break").val()) || 5,
            pomodoroLongBreakMinutes: Number($("#settings-pomodoro-long-break").val()) || 15,
            pomodoroRoundsUntilLongBreak: Number($("#settings-pomodoro-rounds").val()) || 4
        };

        // Applies every affected widget immediately, without requiring a page reload.
        const applyEverything = () => {
            AppSettings = newSettings;
            applyLanguage(newSettings.language);
            applyAccentColor(newSettings.accentColor);
            applyAiAssistant(newSettings.aiAssistant);
            applyBackground();
            loadCalendar(newSettings);
            loadSearch(newSettings);
            loadWeather(newSettings);
            loadHolidays(newSettings);
            loadQuote(newSettings);
            loadWorldClock(newSettings);
            loadRadio(newSettings);
            loadMeetings(newSettings);
            loadPomodoro(newSettings);
            applyGreeting(newSettings.userName);
            $("#settings-modal").removeClass("active");
        };

        saveSettings(newSettings, () => {
            if (pendingBackgroundImage !== undefined) {
                saveBackgroundImage(pendingBackgroundImage, () => {
                    pendingBackgroundImage = undefined;
                    applyEverything();
                });
            } else {
                applyEverything();
            }
        });
    });
}

function fillSettingsForm(settings) {
    $("#settings-language").val(settings.language);
    $("#settings-user-name").val(settings.userName || "");
    $("#settings-search-engine").val(SEARCH_ENGINES[settings.searchEngine] ? settings.searchEngine : "brave");
    $("#settings-ai-assistant").val(AI_ASSISTANTS[settings.aiAssistant] ? settings.aiAssistant : "gemini");
    $("#settings-accent-color").val(settings.accentColor || "#6366f1");
    $("#settings-calendar-iframe").val(settings.calendarIframe || "");
    $("#settings-weather-location").val(settings.weatherLocation || "");
    $("#settings-holiday-country").val(settings.holidayCountry || "");
    $("#settings-quote-enabled").prop("checked", settings.quoteEnabled !== false);
    $("#settings-world-clock-1").val(WORLD_CLOCK_ZONES[settings.worldClock1] ? settings.worldClock1 : "");
    $("#settings-world-clock-2").val(WORLD_CLOCK_ZONES[settings.worldClock2] ? settings.worldClock2 : "");
    $("#settings-radio-enabled").prop("checked", settings.radioEnabled !== false);
    $("#settings-radio-details").toggle(settings.radioEnabled !== false);
    $("#settings-tunein-id").val(settings.tuneInId || "");
    $("#settings-meetings-enabled").prop("checked", settings.meetingsEnabled !== false);
    $("#settings-pomodoro-enabled").prop("checked", settings.pomodoroEnabled !== false);
    $("#settings-pomodoro-details").toggle(settings.pomodoroEnabled !== false);
    $("#settings-pomodoro-work").val(settings.pomodoroWorkMinutes || 25);
    $("#settings-pomodoro-short-break").val(settings.pomodoroShortBreakMinutes || 5);
    $("#settings-pomodoro-long-break").val(settings.pomodoroLongBreakMinutes || 15);
    $("#settings-pomodoro-rounds").val(settings.pomodoroRoundsUntilLongBreak || 4);

    pendingBackgroundImage = undefined;
    $("#settings-background-file").val("");
    getBackgroundImage(dataUrl => showBackgroundPreview(dataUrl));
}

function showBackgroundPreview(dataUrl) {
    const preview = $("#settings-background-preview");
    if (dataUrl) {
        preview.attr("src", dataUrl).addClass("visible");
    } else {
        preview.removeAttr("src").removeClass("visible");
    }
}

// ---------------------------------------------------------------------------------------------
// Modals (shared open/close behavior for both #meetings-modal and #settings-modal)
// ---------------------------------------------------------------------------------------------

function initModals() {
    $(document).on("click", ".modal-close, .modal-backdrop", function() {
        $(this).closest(".modal").removeClass("active");
    });

    $(document).on("keydown", (e) => {
        if (e.key === "Escape") $(".modal.active").removeClass("active");
    });
}

// ---------------------------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------------------------

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function copyToClipboard(str) {
    const el = document.createElement('textarea');
    el.value = str;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
}
