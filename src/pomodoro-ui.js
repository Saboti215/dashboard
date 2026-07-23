/**
 * Shared Pomodoro widget logic — used by both the dashboard's floating panel (index.html /
 * src/dashboard.js) and the standalone pomodoro.html popup window (src/pomodoro-window.js). Both
 * pages render the same Alpine.store('dashboard') "pomodoro" slice, so the dashboard panel and the
 * popup window always agree, however many of them happen to be open.
 *
 * This is a "thin client": it never writes chrome.storage.local's "pomodoroState" itself. Button
 * clicks send action messages to the background service worker (src/background.js), the only
 * writer, and this file just renders whatever state comes back into the store — index.html's and
 * pomodoro.html's templates bind to store.pomodoro.* directly.
 */

let pomodoroSettingsCache = null;
let pomodoroAudioContext = null;
let pomodoroWidgetWired = false;

// Mixed into both Alpine.data('dashboardRoot') and Alpine.data('pomodoroWindow') root components
// (via Object.assign / spread) so their pomodoro buttons can call these directly, e.g.
// x-on:click="playPause".
const pomodoroMethods = {
    playPause() {
        unlockPomodoroAudio();
        getPomodoroStateForRender(state => {
            sendPomodoroAction(state.running ? "pomodoro:pause" : "pomodoro:start");
        });
    },
    skip() {
        unlockPomodoroAudio();
        sendPomodoroAction("pomodoro:skip");
    },
    reset() {
        sendPomodoroAction("pomodoro:reset");
    },
    openPomodoroWindow() {
        chrome.windows.create({
            url: chrome.runtime.getURL("pomodoro.html"),
            type: "popup",
            width: 320,
            height: 330
        });
    }
};

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

// Installs the 1-second render tick + cross-context sync listeners, writing results into the
// given Alpine store instead of the DOM. Guarded so re-enabling the feature from Settings (which
// calls this again) doesn't double up intervals/listeners — e.g. the beep playing twice.
function installPomodoroSync(store) {
    renderPomodoroTick(store);

    if (pomodoroWidgetWired) return;
    pomodoroWidgetWired = true;

    window.setInterval(() => renderPomodoroTick(store), 1000);

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.pomodoroState) {
            renderPomodoroTick(store);
        }

        // Settings are stored as flat top-level keys (not nested under one "settings" key), so
        // check the specific duration/round keys this widget actually cares about.
        const durationKeys = [
            "pomodoroWorkMinutes", "pomodoroShortBreakMinutes",
            "pomodoroLongBreakMinutes", "pomodoroRoundsUntilLongBreak"
        ];
        if (area === "sync" && durationKeys.some(key => changes[key])) {
            pomodoroSettingsCache = null; // refetch on next render
            renderPomodoroTick(store);
        }
    });

    // The background broadcasts this when a phase ends; only pages that are actually open hear it.
    chrome.runtime.onMessage.addListener(message => {
        if (message && message.type === "pomodoro:beep") playPomodoroBeep();
    });
}

function renderPomodoroTick(store) {
    getPomodoroStateForRender(state => {
        getPomodoroSettingsCached(settings => {
            const remainingMs = getPomodoroRemainingMs(state, Date.now());

            store.pomodoro.timeText = formatPomodoroTime(remainingMs);
            store.pomodoro.phaseLabel = t(`pomodoro.phase.${state.phase}`);
            store.pomodoro.roundLabel = t("pomodoro.round", {
                current: state.round,
                total: settings.pomodoroRoundsUntilLongBreak || 4
            });
            store.pomodoro.playPauseLabel = t(state.running ? "pomodoro.pause" : "pomodoro.start");
            // ".running" (not ".active", which the dashboard page uses for "panel is open") so the
            // pulse indicator and the open/close state never fight over the same class — see the
            // pomodoroToggleClass/pomodoroPlayPauseClass getters in src/stores.js.
            store.pomodoro.running = state.running;
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
