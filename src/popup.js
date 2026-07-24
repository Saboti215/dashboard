/**
 * Bootstrap for the toolbar popup (popup.html, manifest.json's action.default_popup). Combines
 * the same shared Pomodoro sync used by pomodoro-window.js with quick, instant-apply toggles for
 * the three wellness reminders — no draft-form/Speichern step like the Settings modal, since a
 * popup that closes on outside click has no natural moment for one.
 */

// Maps each wellness type to the chrome.alarms name background.js schedules it under (its
// WELLNESS_TYPES). Duplicated here rather than shared, same rationale as hexToRgba below — not
// worth a shared file for three name strings.
const WELLNESS_ALARM_NAMES = {
    water: "wellness-water",
    eyes: "wellness-eyes",
    desk: "wellness-desk"
};

document.addEventListener("alpine:init", () => {
    Alpine.data("popupRoot", () => ({
        ...pomodoroMethods,

        wellnessNext: { water: "", eyes: "", desk: "" },

        init() {
            const store = this.$store.dashboard;

            store.loadSettings(settings => {
                setLanguage(settings.language);
                applyStaticTranslations();
                this.applyAccentColor(settings.accentColor);
                installPomodoroSync(store);

                this.refreshWellnessNext();
                window.setInterval(() => this.refreshWellnessNext(), 10000);
            });
        },

        // Reads each wellness reminder's scheduled chrome.alarms fire time and renders it as a
        // "in N Min." countdown; empty string (renders nothing) while a reminder is off, since
        // background.js clears its alarm the moment it's disabled.
        refreshWellnessNext() {
            if (typeof chrome === "undefined" || !chrome.alarms) return;

            chrome.alarms.getAll(alarms => {
                const alarmsByName = {};
                alarms.forEach(alarm => { alarmsByName[alarm.name] = alarm; });

                Object.keys(WELLNESS_ALARM_NAMES).forEach(type => {
                    const alarm = alarmsByName[WELLNESS_ALARM_NAMES[type]];
                    if (!alarm) {
                        this.wellnessNext[type] = "";
                        return;
                    }

                    const minutes = Math.max(1, Math.ceil((alarm.scheduledTime - Date.now()) / 60000));
                    this.wellnessNext[type] = t("wellness.nextIn", { minutes });
                });
            });
        },

        applyAccentColor(hex) {
            if (!hex) return;
            document.documentElement.style.setProperty("--accent-color", hex);
            document.documentElement.style.setProperty("--accent-glow", hexToRgba(hex, 0.15));
        },

        // Same generic-updater pattern as updateSettingsField() in src/dashboard.js, but writes
        // straight to the store/chrome.storage.sync instead of a settingsForm draft — background.js
        // already watches these keys (WELLNESS_SETTING_KEYS) and resyncs its wellness alarms.
        toggleWellnessField(event) {
            const el = event.target;
            const field = el.dataset.field;
            const store = this.$store.dashboard;

            store.settings[field] = el.checked;
            store.saveSettings({ [field]: el.checked });

            // background.js resyncs its alarm asynchronously off the storage write above, so give
            // it a moment before reading the new (or now-cleared) scheduled time back.
            window.setTimeout(() => this.refreshWellnessNext(), 300);
        },

        openDashboard() {
            chrome.tabs.create({});
        }
    }));
});

// Small, intentionally duplicated copy of src/stores.js's hexToRgba — not worth sharing a whole
// utility file across contexts for a single helper function (same rationale as pomodoro-window.js).
function hexToRgba(hex, alpha) {
    const clean = (hex || "").replace("#", "");
    const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean;
    const value = parseInt(full, 16);

    if (full.length !== 6 || Number.isNaN(value)) return `rgba(99, 102, 241, ${alpha})`;

    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
