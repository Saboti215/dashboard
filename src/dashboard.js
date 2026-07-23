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

document.addEventListener("alpine:init", () => {
    Alpine.data("dashboardRoot", () => ({
        ...pomodoroMethods,

        settingsForm: {},
        meetingForm: defaultMeetingForm(),

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
            store.loadWeather();
            store.loadHolidays();
            store.loadQuote();
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
                worldClock1: WORLD_CLOCK_ZONES[settings.worldClock1] ? settings.worldClock1 : "",
                worldClock2: WORLD_CLOCK_ZONES[settings.worldClock2] ? settings.worldClock2 : "",
                radioEnabled: settings.radioEnabled !== false,
                tuneInId: settings.tuneInId || "",
                meetingsEnabled: settings.meetingsEnabled !== false,
                pomodoroEnabled: settings.pomodoroEnabled !== false,
                pomodoroWorkMinutes: settings.pomodoroWorkMinutes || 25,
                pomodoroShortBreakMinutes: settings.pomodoroShortBreakMinutes || 5,
                pomodoroLongBreakMinutes: settings.pomodoroLongBreakMinutes || 15,
                pomodoroRoundsUntilLongBreak: settings.pomodoroRoundsUntilLongBreak || 4
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
                calendarIframe: (f.calendarIframe || "").trim(),
                weatherLocation: (f.weatherLocation || "").trim(),
                holidayCountry: (f.holidayCountry || "").trim(),
                quoteEnabled: !!f.quoteEnabled,
                worldClock1: f.worldClock1,
                worldClock2: f.worldClock2,
                tuneInId: (f.tuneInId || "").trim(),
                radioEnabled: !!f.radioEnabled,
                meetingsEnabled: !!f.meetingsEnabled,
                pomodoroEnabled: !!f.pomodoroEnabled,
                pomodoroWorkMinutes: Number(f.pomodoroWorkMinutes) || 25,
                pomodoroShortBreakMinutes: Number(f.pomodoroShortBreakMinutes) || 5,
                pomodoroLongBreakMinutes: Number(f.pomodoroLongBreakMinutes) || 15,
                pomodoroRoundsUntilLongBreak: Number(f.pomodoroRoundsUntilLongBreak) || 4
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
