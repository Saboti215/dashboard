/**
 * Bootstrap for the toolbar popup (popup.html, manifest.json's action.default_popup). Combines
 * the same shared Pomodoro sync used by pomodoro-window.js with quick, instant-apply toggles for
 * the three wellness reminders — no draft-form/Speichern step like the Settings modal, since a
 * popup that closes on outside click has no natural moment for one.
 */

document.addEventListener("alpine:init", () => {
    Alpine.data("popupRoot", () => ({
        ...pomodoroMethods,

        init() {
            const store = this.$store.dashboard;

            store.loadSettings(settings => {
                setLanguage(settings.language);
                applyStaticTranslations();
                this.applyAccentColor(settings.accentColor);
                installPomodoroSync(store);
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
