/**
 * Shared Pomodoro widget wiring — used by both the dashboard's floating panel (index.html /
 * src/dashboard.js) and the standalone pomodoro.html popup window. Both pages use the same set of
 * element IDs: #pomodoro-time, #pomodoro-phase, #pomodoro-round, #pomodoro-play-pause,
 * #pomodoro-skip, #pomodoro-reset. #pomodoro-toggle (the floating open/close button) only exists
 * on the dashboard page; selecting it here on the popup page is a harmless no-op.
 *
 * This is a "thin client": it never writes chrome.storage.local's "pomodoroState" itself. Button
 * clicks send action messages to the background service worker (src/background.js), the only
 * writer, and this file just renders whatever state comes back — so the dashboard panel and the
 * popup window always agree, however many of them happen to be open.
 */

let pomodoroSettingsCache = null;
let pomodoroAudioContext = null;
let pomodoroWidgetWired = false;

function initPomodoroWidget() {
    if (!$("#pomodoro-time").length) return; // this page doesn't have the widget

    renderPomodoroTick();

    // The dashboard page calls this again after every settings save (so re-enabling the feature
    // without a reload works); guard against re-registering the interval/listeners/click handlers
    // each time, which would otherwise double up (e.g. the beep playing twice).
    if (pomodoroWidgetWired) return;
    pomodoroWidgetWired = true;

    window.setInterval(renderPomodoroTick, 1000);

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.pomodoroState) {
            renderPomodoroTick();
        }

        // Settings are stored as flat top-level keys (not nested under one "settings" key), so
        // check the specific duration/round keys this widget actually cares about.
        const durationKeys = [
            "pomodoroWorkMinutes", "pomodoroShortBreakMinutes",
            "pomodoroLongBreakMinutes", "pomodoroRoundsUntilLongBreak"
        ];
        if (area === "sync" && durationKeys.some(key => changes[key])) {
            pomodoroSettingsCache = null; // refetch on next render
            renderPomodoroTick();
        }
    });

    // The background broadcasts this when a phase ends; only pages that are actually open hear it.
    chrome.runtime.onMessage.addListener(message => {
        if (message && message.type === "pomodoro:beep") playPomodoroBeep();
    });

    $("#pomodoro-play-pause").on("click", () => {
        unlockPomodoroAudio();
        getPomodoroStateForRender(state => {
            sendPomodoroAction(state.running ? "pomodoro:pause" : "pomodoro:start");
        });
    });

    $("#pomodoro-skip").on("click", () => {
        unlockPomodoroAudio();
        sendPomodoroAction("pomodoro:skip");
    });

    $("#pomodoro-reset").on("click", () => sendPomodoroAction("pomodoro:reset"));
}

function sendPomodoroAction(type) {
    chrome.runtime.sendMessage({ type });
}

function getPomodoroSettingsCached(cb) {
    if (pomodoroSettingsCache) {
        cb(pomodoroSettingsCache);
        return;
    }

    chrome.storage.sync.get({
        pomodoroWorkMinutes: 25,
        pomodoroShortBreakMinutes: 5,
        pomodoroLongBreakMinutes: 15,
        pomodoroRoundsUntilLongBreak: 4
    }, settings => {
        pomodoroSettingsCache = settings;
        cb(settings);
    });
}

function getPomodoroStateForRender(cb) {
    chrome.storage.local.get({ pomodoroState: null }, data => {
        getPomodoroSettingsCached(settings => {
            cb(data.pomodoroState || getInitialPomodoroState(settings));
        });
    });
}

function renderPomodoroTick() {
    getPomodoroStateForRender(state => {
        getPomodoroSettingsCached(settings => {
            const remainingMs = getPomodoroRemainingMs(state, Date.now());

            $("#pomodoro-time").text(formatPomodoroTime(remainingMs));
            $("#pomodoro-phase").text(t(`pomodoro.phase.${state.phase}`));
            $("#pomodoro-round").text(t("pomodoro.round", {
                current: state.round,
                total: settings.pomodoroRoundsUntilLongBreak || 4
            }));

            $("#pomodoro-play-pause")
                .text(t(state.running ? "pomodoro.pause" : "pomodoro.start"))
                .toggleClass("running", state.running);

            // ".running" (not ".active", which the dashboard page uses for "panel is open") so the
            // pulse indicator and the open/close state never fight over the same class.
            $("#pomodoro-toggle").toggleClass("running", state.running);

            // Only present on the dashboard page (a no-op on the popup, which has no #pomodoro-toggle
            // and thus no #pomodoro-badge either). Shown only while running AND the panel is closed —
            // the panel itself already shows the full countdown once it's open.
            const panelOpen = $("#pomodoro-panel").hasClass("active");
            $("#pomodoro-badge")
                .text(formatPomodoroTime(remainingMs))
                .toggleClass("visible", state.running && !panelOpen);
        });
    });
}

function unlockPomodoroAudio() {
    if (!pomodoroAudioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        pomodoroAudioContext = new AudioCtx();
    }
    if (pomodoroAudioContext.state === "suspended") {
        pomodoroAudioContext.resume();
    }
}

// A short two-tone chime; synthesized so the extension doesn't need to ship an audio asset.
function playPomodoroBeep() {
    unlockPomodoroAudio();
    const ctx = pomodoroAudioContext;
    const now = ctx.currentTime;

    [880, 1175].forEach((freq, i) => {
        const offset = i * 0.18;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.2, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);

        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.2);
    });
}
