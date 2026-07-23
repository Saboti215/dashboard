/**
 * Bootstrap for the standalone Pomodoro popup window (pomodoro.html). Applies the user's stored
 * language and accent color for visual consistency with the main dashboard, then installs the
 * shared pomodoro sync (src/pomodoro-ui.js) against the same Alpine.store('dashboard') used on
 * the New Tab page — the actual countdown/state logic is entirely shared, only the surrounding
 * page differs.
 */

document.addEventListener("alpine:init", () => {
    Alpine.data("pomodoroWindow", () => ({
        ...pomodoroMethods,

        init() {
            const store = this.$store.dashboard;

            chrome.storage.sync.get({
                language: detectDefaultLanguage(),
                accentColor: "#6366f1"
            }, settings => {
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
        }
    }));
});

// Small, intentionally duplicated copy of src/stores.js's hexToRgba — not worth sharing a whole
// utility file across contexts for a single helper function.
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
