/**
 * Root Alpine component for the New Tab page (index.html). Holds only what's genuinely
 * page-local: ephemeral settings/meeting form drafts (not shared/global state — they mirror the
 * original fillSettingsForm()/fillMeetingForm() pattern of "populate on open, read on submit"),
 * DOM refs, and the event-handler methods index.html's directives call by bare name. Everything
 * shared/persisted lives in Alpine.store('dashboard') (src/stores.js).
 */

// Shape shared by the initial draft and every reset — kept as a plain function (not a component
// method) so it can be used as the x-data factory's initial value too.
function defaultMeetingForm() {
    return {
        id: "",
        name: "",
        type: "zoom",
        link: "",
        password: "",
        start_time: "",
        end_time: "",
        recurrence: "weekly",
        weekday: 1,
        date: ""
    };
}

// -----------------------------------------------------------------------------------
// Confetti (src/canvas-confetti.min.js), used by the "Top 3 tasks" widget below when all three
// tasks are checked off. Built as our own confetti.create() instance (useWorker: false) instead of
// calling the bundled confetti() global directly — that global lazily spins up a blob: Worker on
// first use, which risks running into Manifest V3's default script-src 'self' CSP (no worker-src
// override in manifest.json); a plain canvas + main-thread instance sidesteps that entirely. Built
// lazily on first use (not at page load), so a session that never finishes the tasks never touches
// the DOM for it.
// -----------------------------------------------------------------------------------
let taskConfettiInstance = null;

function fireTaskConfetti() {
    if (typeof confetti === "undefined") return; // library failed to load — degrade silently

    if (!taskConfettiInstance) {
        const canvas = document.createElement("canvas");
        canvas.style.position = "fixed";
        canvas.style.inset = "0";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.pointerEvents = "none";
        canvas.style.zIndex = "1200"; // above modals (1100) so it's never hidden behind one
        document.body.appendChild(canvas);
        taskConfettiInstance = confetti.create(canvas, { resize: true, useWorker: false });
    }

    taskConfettiInstance({ particleCount: 120, spread: 70, origin: { y: 0.7 } });
}

// -----------------------------------------------------------------------------------
// "Top 3 tasks" widget (index.html's #today-tasks, nested inside the "Today" card). A small,
// self-contained Alpine component: its own chrome.storage.sync key ("dailyTasks"), separate from
// the shared `settings` object, since it isn't part of the Settings modal's read-modify-write
// round trip — only whether the widget is SHOWN is a setting (tasksEnabled, see stores.js).
// -----------------------------------------------------------------------------------
const TASK_COUNT = 3;

function emptyTasks() {
    return Array.from({ length: TASK_COUNT }, () => ({ text: "", done: false }));
}

// Local calendar date as "YYYY-MM-DD" (formatDateForStorage lives in src/stores.js, loaded before
// this file) — used to detect "it's a new day" for the daily reset.
function todayStamp() {
    return formatDateForStorage(new Date());
}

document.addEventListener("alpine:init", () => {
    Alpine.data("taskWidget", () => ({
        tasks: emptyTasks(),
        // Tracks the previous "all done" state so the watcher below only fires confetti on the
        // false -> true transition (the 3rd box being checked) — not on every save, and not when a
        // tab loads with an already-complete list.
        prevAllDone: false,

        init() {
            if (typeof chrome === "undefined" || !chrome.storage) {
                this.prevAllDone = this.allDone();
                this.watchTasks();
                return;
            }

            this.$store.dashboard.getSyncStorage().get({ dailyTasks: null }, data => {
                const saved = data.dailyTasks;
                const stamp = todayStamp();

                if (saved && saved.lastUpdated === stamp && Array.isArray(saved.tasks)) {
                    this.tasks = emptyTasks().map((task, i) => saved.tasks[i]
                        ? { text: saved.tasks[i].text || "", done: !!saved.tasks[i].done }
                        : task);
                } else {
                    // First run, or the saved list is from an earlier day — start the day fresh.
                    this.tasks = emptyTasks();
                    this.save();
                }

                this.prevAllDone = this.allDone();
                this.watchTasks(); // registered only after the initial load, so it never fires on it
            });
        },

        watchTasks() {
            this.$watch("tasks", () => this.onTasksChanged());
        },

        updateTaskText(event) {
            this.tasks[Number(event.target.dataset.index)].text = event.target.value;
        },

        toggleTask(event) {
            this.tasks[Number(event.target.dataset.index)].done = event.target.checked;
        },

        allDone() {
            return this.tasks.every(task => task.done);
        },

        onTasksChanged() {
            this.save();

            const done = this.allDone();
            if (done && !this.prevAllDone) fireTaskConfetti();
            this.prevAllDone = done;
        },

        save() {
            if (typeof chrome === "undefined" || !chrome.storage) return;
            this.$store.dashboard.getSyncStorage().set({
                dailyTasks: {
                    lastUpdated: todayStamp(),
                    tasks: this.tasks.map(task => ({ text: task.text, done: task.done }))
                }
            });
        }
    }));
});

document.addEventListener("alpine:init", () => {
    Alpine.data("dashboardRoot", () => ({
        ...pomodoroMethods,

        settingsForm: {},
        meetingForm: defaultMeetingForm(),

        // Spotlight math result: null while the search bar doesn't hold a valid arithmetic
        // expression, a finite number once it does (see src/calc.js's evaluateMathExpression()).
        mathResult: null,

        // Spotlight bookmark search: the raw query (mirrors #search-input's value) plus which
        // suggestion row is currently keyboard-highlighted.
        searchQuery: "",
        highlightedIndex: 0,

        // Background image upload state, held only while the Settings modal is open:
        //   undefined -> untouched (don't touch storage on save)
        //   null      -> user clicked "Remove" (delete the stored image on save)
        //   data URL  -> user picked a new file (store it on save)
        pendingBackgroundImage: undefined,
        previewSrc: null,

        // -----------------------------------------------------------------------------------
        // Bootstrap
        // -----------------------------------------------------------------------------------
        init() {
            document.body.setAttribute("data-copy-right", `© ${new Date().getFullYear()} Tobias Schlößer`);

            const store = this.$store.dashboard;

            // Settings-independent widgets can start immediately.
            store.refreshClock();
            window.setInterval(() => store.refreshClock(), 1000);
            window.setInterval(() => store.updateActiveMeeting(), 60 * 1000); // reload every minute

            // Close the radio/pomodoro floating panels when clicking outside them. Registered once
            // here (rather than re-wired every settings save, like the original's *Wired guards)
            // since declarative bindings mean there's nothing left to double-bind.
            document.addEventListener("click", event => {
                if (!event.target.closest("#radio-panel, #radio-toggle")) store.closeRadioPanel();
            });
            document.addEventListener("click", event => {
                if (!event.target.closest("#pomodoro-panel, #pomodoro-toggle")) store.closePomodoroPanel();
            });

            // Everything else depends on the user's stored settings, which load asynchronously.
            store.loadSettings(settings => {
                this.applyEverything(settings);
                this.fillSettingsForm(settings);
            });
        },

        // Applies every affected widget after load or after a settings save — mirrors the
        // original applyEverything()/bootstrap list in src/dashboard.js exactly.
        applyEverything(settings) {
            const store = this.$store.dashboard;

            store.settings = settings;
            store.applyLanguage(settings.language);
            store.applyAccentColor(settings.accentColor);
            store.applyBackground();
            store.applyZenMode();
            store.loadWeather();
            store.loadHolidays();
            store.loadQuote();
            store.loadRss();
            store.refreshGreeting(); // immediate effect, not just on the next 1s clock tick
            store.refreshWorldClock();
            store.loadMeetings(() => store.updateActiveMeeting());

            if (store.pomodoroEnabled) {
                installPomodoroSync(store);
            } else if (typeof chrome !== "undefined" && chrome.runtime) {
                // The feature was turned off in Settings — stop ticking towards a notification
                // nobody wants.
                chrome.runtime.sendMessage({ type: "pomodoro:disable" });
            }

            this.focusSearch();
        },

        focusSearch() {
            // Ensure the search bar has focus even if the browser tries to focus the omnibox
            // instead — this page is meant to be used as the browser's start page.
            if (this.$refs.searchInput) this.$refs.searchInput.focus();
        },

        // -----------------------------------------------------------------------------------
        // Spotlight search: an offline calculator + bookmark quick-open layered on top of the
        // existing search bar. The <form> itself is still a plain native GET form (see
        // index.html) — these handlers only intercept input to show a live result/suggestions,
        // and conditionally stop the submit when the query is a math expression or has a
        // bookmark match, rather than falling through to a real web search.
        // -----------------------------------------------------------------------------------
        onSearchInput(event) {
            this.searchQuery = event.target.value;
            this.mathResult = evaluateMathExpression(this.searchQuery);
            this.highlightedIndex = 0; // every keystroke reshuffles the match list — re-anchor to the top
        },

        onSearchSubmit(event) {
            if (this.mathResult !== null) {
                event.preventDefault();
                copyToClipboard(String(this.mathResult));
                return;
            }

            const matches = this.bookmarkMatches;
            if (matches.length > 0) {
                event.preventDefault();
                const target = matches[this.highlightedIndex] || matches[0];
                window.location.href = target.href;
                return;
            }

            // Neither a math expression nor a bookmark match -> let the native GET search run.
        },

        get mathResultText() {
            return this.mathResult !== null ? `= ${this.mathResult}` : "";
        },

        get mathResultVisibleClass() {
            return { visible: this.mathResult !== null };
        },

        // Bookmarks whose name contains the current query (case-insensitive), capped at 5 rows.
        // Suppressed entirely while a math expression is active, so the two overlays never fight
        // for the same spot below the search bar. Each match carries its own precomputed
        // "rowClass" object rather than the template comparing index === highlightedIndex inline
        // — the CSP build's safe evaluator only accepts bare dotted-path expressions in
        // directives, same reasoning as the *Class getters in src/stores.js.
        get bookmarkMatches() {
            if (this.mathResult !== null) return [];

            const query = this.searchQuery.trim().toLowerCase();
            if (!query) return [];

            const allBookmarks = this.$store.dashboard.bookmarkCategories.flatMap(cat => cat.links);
            const matches = allBookmarks.filter(link => link.name.toLowerCase().includes(query)).slice(0, 5);

            return matches.map((link, index) => ({
                ...link,
                rowClass: { highlighted: index === this.highlightedIndex }
            }));
        },

        get hasBookmarkMatches() {
            return this.bookmarkMatches.length > 0;
        },

        highlightNextBookmarkMatch() {
            if (!this.hasBookmarkMatches) return;
            this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.bookmarkMatches.length - 1);
        },

        highlightPrevBookmarkMatch() {
            if (!this.hasBookmarkMatches) return;
            this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
        },

        // -----------------------------------------------------------------------------------
        // Thin wrappers around Alpine.store('dashboard') methods.
        //
        // The CSP build's safe expression evaluator only auto-invokes a directive expression
        // with the correct `this` when it's a BARE, no-dot identifier resolved directly on the
        // enclosing x-data scope — a dotted path like "$store.dashboard.toggleRadioPanel" used
        // directly in x-on/x-on:keydown either loses its `this` binding at call time or fails to
        // parse outright (confirmed empirically; see https://alpinejs.dev/advanced/csp). Every
        // directive in index.html that needs to reach the store therefore calls one of these
        // bare wrapper methods instead, which are free to reference $store.* from real JS.
        // -----------------------------------------------------------------------------------
        closeAllModals() {
            this.$store.dashboard.closeAllModals();
        },

        toggleZenMode() {
            this.$store.dashboard.toggleZenMode();
        },

        // Bound to the global Escape key (see index.html's x-on:keydown.escape.window). Modals take
        // priority over zen mode, and typing Escape while the search bar has focus (e.g. to clear a
        // native "x" affordance) shouldn't unexpectedly toggle zen mode out from under the user.
        onEscape() {
            const store = this.$store.dashboard;

            if (store.ui.settingsModalOpen || store.ui.meetingsModalOpen) {
                store.closeAllModals();
                return;
            }

            if (document.activeElement === this.$refs.searchInput) return;

            store.toggleZenMode();
        },

        toggleRadioPanel() {
            this.$store.dashboard.toggleRadioPanel();
        },

        togglePomodoroPanel() {
            this.$store.dashboard.togglePomodoroPanel();
        },

        joinActiveMeeting() {
            this.$store.dashboard.joinActiveMeeting();
        },

        // -----------------------------------------------------------------------------------
        // Settings modal
        // -----------------------------------------------------------------------------------
        openSettings() {
            const store = this.$store.dashboard;
            // Re-fetch on every open so the form always reflects the latest saved state, even if
            // it was changed in a different tab/window in the meantime.
            store.loadSettings(current => {
                this.fillSettingsForm(current);
                store.openSettingsModal();
            });
        },

        cancelSettings() {
            this.$store.dashboard.closeSettingsModal();
        },

        fillSettingsForm(settings) {
            this.settingsForm = {
                language: settings.language,
                userName: settings.userName || "",
                searchEngine: SEARCH_ENGINES[settings.searchEngine] ? settings.searchEngine : "brave",
                aiAssistant: AI_ASSISTANTS[settings.aiAssistant] ? settings.aiAssistant : "gemini",
                accentColor: settings.accentColor || "#6366f1",
                calendarIframe: settings.calendarIframe || "",
                weatherLocation: settings.weatherLocation || "",
                holidayCountry: settings.holidayCountry || "",
                quoteEnabled: settings.quoteEnabled !== false,
                tasksEnabled: settings.tasksEnabled !== false,
                rssEnabled: settings.rssEnabled !== false,
                rssFeeds: settings.rssFeeds || "",
                worldClock1: WORLD_CLOCK_ZONES[settings.worldClock1] ? settings.worldClock1 : "",
                worldClock2: WORLD_CLOCK_ZONES[settings.worldClock2] ? settings.worldClock2 : "",
                radioEnabled: settings.radioEnabled !== false,
                tuneInId: settings.tuneInId || "",
                meetingsEnabled: settings.meetingsEnabled !== false,
                pomodoroEnabled: settings.pomodoroEnabled !== false,
                pomodoroWorkMinutes: settings.pomodoroWorkMinutes || 25,
                pomodoroShortBreakMinutes: settings.pomodoroShortBreakMinutes || 5,
                pomodoroLongBreakMinutes: settings.pomodoroLongBreakMinutes || 15,
                pomodoroRoundsUntilLongBreak: settings.pomodoroRoundsUntilLongBreak || 4,
                waterEnabled: !!settings.waterEnabled,
                waterIntervalMinutes: settings.waterIntervalMinutes || 60,
                eyesEnabled: !!settings.eyesEnabled,
                eyesIntervalMinutes: settings.eyesIntervalMinutes || 20,
                deskEnabled: !!settings.deskEnabled,
                deskIntervalMinutes: settings.deskIntervalMinutes || 50
            };

            this.pendingBackgroundImage = undefined;
            if (this.$refs.backgroundFile) this.$refs.backgroundFile.value = "";
            this.$store.dashboard.getBackgroundImage(dataUrl => { this.previewSrc = dataUrl; });
        },

        // Generic settings-form field updater — the CSP build's safe evaluator can't parse an
        // assignment expression like "settingsForm.userName = ..." (what x-model would generate
        // internally), so every field instead pairs a read-only x-bind:value/x-bind:checked with
        // this one bare x-on:input/x-on:change handler; each input carries data-field="<key>" to
        // say which settingsForm property it writes to.
        updateSettingsField(event) {
            const el = event.target;
            const field = el.dataset.field;
            this.settingsForm[field] = el.type === "checkbox" ? el.checked
                : el.type === "number" ? Number(el.value)
                : el.value;
        },

        get previewVisibleClass() {
            return { visible: !!this.previewSrc };
        },

        onBackgroundFileChange(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                this.pendingBackgroundImage = reader.result; // data URL, stored only once saved
                this.previewSrc = this.pendingBackgroundImage;
            };
            reader.readAsDataURL(file);
        },

        removeBackgroundImage() {
            this.pendingBackgroundImage = null; // queued for removal on save
            if (this.$refs.backgroundFile) this.$refs.backgroundFile.value = "";
            this.previewSrc = null;
        },

        submitSettings() {
            const f = this.settingsForm;
            const store = this.$store.dashboard;

            const newSettings = {
                language: f.language,
                userName: (f.userName || "").trim(),
                accentColor: f.accentColor,
                searchEngine: f.searchEngine,
                aiAssistant: f.aiAssistant,
                // Not exposed in the Settings modal — toggled directly via the zen button/Escape —
                // so it has to be carried over explicitly, or this save would silently reset it.
                zenMode: store.settings.zenMode,
                calendarIframe: (f.calendarIframe || "").trim(),
                weatherLocation: (f.weatherLocation || "").trim(),
                holidayCountry: (f.holidayCountry || "").trim(),
                quoteEnabled: !!f.quoteEnabled,
                tasksEnabled: !!f.tasksEnabled,
                rssEnabled: !!f.rssEnabled,
                rssFeeds: (f.rssFeeds || "").trim(),
                worldClock1: f.worldClock1,
                worldClock2: f.worldClock2,
                tuneInId: (f.tuneInId || "").trim(),
                radioEnabled: !!f.radioEnabled,
                meetingsEnabled: !!f.meetingsEnabled,
                pomodoroEnabled: !!f.pomodoroEnabled,
                pomodoroWorkMinutes: Number(f.pomodoroWorkMinutes) || 25,
                pomodoroShortBreakMinutes: Number(f.pomodoroShortBreakMinutes) || 5,
                pomodoroLongBreakMinutes: Number(f.pomodoroLongBreakMinutes) || 15,
                pomodoroRoundsUntilLongBreak: Number(f.pomodoroRoundsUntilLongBreak) || 4,
                waterEnabled: !!f.waterEnabled,
                waterIntervalMinutes: Number(f.waterIntervalMinutes) || 60,
                eyesEnabled: !!f.eyesEnabled,
                eyesIntervalMinutes: Number(f.eyesIntervalMinutes) || 20,
                deskEnabled: !!f.deskEnabled,
                deskIntervalMinutes: Number(f.deskIntervalMinutes) || 50
            };

            // Applies every affected widget immediately, without requiring a page reload.
            const finish = () => {
                this.applyEverything(newSettings);
                store.closeSettingsModal();
            };

            store.saveSettings(newSettings, () => {
                if (this.pendingBackgroundImage !== undefined) {
                    store.saveBackgroundImage(this.pendingBackgroundImage, () => {
                        this.pendingBackgroundImage = undefined;
                        finish();
                    });
                } else {
                    finish();
                }
            });
        },

        // -----------------------------------------------------------------------------------
        // Meetings modal
        // -----------------------------------------------------------------------------------
        openMeetings() {
            const store = this.$store.dashboard;
            store.loadMeetings(() => store.openMeetingsModal());
        },

        closeMeetings() {
            this.$store.dashboard.closeMeetingsModal();
        },

        get isWeekly() {
            return this.meetingForm.recurrence === "weekly";
        },
        get isOnce() {
            return this.meetingForm.recurrence === "once";
        },
        get weeklyButtonClass() {
            return { active: this.isWeekly };
        },
        get onceButtonClass() {
            return { active: this.isOnce };
        },
        setRecurrenceWeekly() {
            this.meetingForm.recurrence = "weekly";
        },
        setRecurrenceOnce() {
            this.meetingForm.recurrence = "once";
        },

        resetMeetingForm() {
            this.meetingForm = defaultMeetingForm();
        },

        cancelMeetingForm() {
            this.resetMeetingForm();
        },

        // Same generic-updater pattern as updateSettingsField() above, for the meeting form.
        // #meeting-weekday is a <select> (not <input type="number">) but still needs numeric
        // coercion, hence the extra data-number check.
        updateMeetingField(event) {
            const el = event.target;
            const field = el.dataset.field;
            this.meetingForm[field] = el.type === "checkbox" ? el.checked
                : (el.type === "number" || el.dataset.number !== undefined) ? Number(el.value)
                : el.value;
        },

        submitMeetingForm() {
            const f = this.meetingForm;

            const meeting = {
                id: f.id || crypto.randomUUID(),
                name: (f.name || "").trim(),
                type: f.type,
                link: (f.link || "").trim(),
                password: (f.password || "").trim(),
                start_time: f.start_time,
                end_time: f.end_time,
                recurrence: f.recurrence,
                weekday: Number(f.weekday),
                date: f.date
            };

            if (!meeting.name || !meeting.link || !meeting.start_time || !meeting.end_time) return;
            if (meeting.recurrence === "once" && !meeting.date) return;

            this.$store.dashboard.addOrUpdateMeeting(meeting, () => this.resetMeetingForm());
        },

        editMeeting(event) {
            const id = event.currentTarget.dataset.edit;
            this.$store.dashboard.getMeetingById(id, meeting => {
                if (!meeting) return;

                this.meetingForm = {
                    id: meeting.id,
                    name: meeting.name,
                    type: meeting.type,
                    link: meeting.link,
                    password: meeting.password || "",
                    start_time: meeting.start_time,
                    end_time: meeting.end_time,
                    recurrence: meeting.recurrence,
                    weekday: meeting.weekday,
                    date: meeting.date || ""
                };

                this.$nextTick(() => {
                    if (this.$refs.meetingName) this.$refs.meetingName.focus();
                });
            });
        },

        deleteMeetingRow(event) {
            const id = event.currentTarget.dataset.delete;
            this.$store.dashboard.deleteMeeting(id);
        }
    }));
});
