/**
 * Background service worker — the single source of truth for the Pomodoro timer.
 *
 * Why a service worker at all: the dashboard's New Tab page isn't kept open all the time, so a
 * timer that only lived there would silently stop (no notification, no sound) the moment that tab
 * closes. chrome.alarms survives closed tabs *and* browser restarts, and wakes this service worker
 * up exactly when a phase ends, so the notification always fires regardless of what's open.
 *
 * Every UI surface (the dashboard's floating panel, the standalone pomodoro.html popup) is a thin
 * client: it renders chrome.storage.local's "pomodoroState" and sends action messages here instead
 * of mutating state itself. That keeps a single writer and avoids two open surfaces racing each
 * other or scheduling conflicting alarms.
 */

importScripts("i18n.js", "pomodoro-logic.js");

const POMODORO_ALARM_NAME = "pomodoro";

const POMODORO_SETTINGS_DEFAULTS = {
    language: detectDefaultLanguage(),
    pomodoroWorkMinutes: 25,
    pomodoroShortBreakMinutes: 5,
    pomodoroLongBreakMinutes: 15,
    pomodoroRoundsUntilLongBreak: 4
};

async function getPomodoroSettings() {
    return chrome.storage.sync.get(POMODORO_SETTINGS_DEFAULTS);
}

async function getPomodoroState(settings) {
    const stored = await chrome.storage.local.get({ pomodoroState: null });
    return stored.pomodoroState || getInitialPomodoroState(settings);
}

async function savePomodoroState(state) {
    await chrome.storage.local.set({ pomodoroState: state });
}

// Keeps the alarm in sync with whatever state was just saved: exactly one pending alarm while
// running, none while paused/waiting for a manual start.
async function syncAlarmWithState(state) {
    await chrome.alarms.clear(POMODORO_ALARM_NAME);
    if (state.running && state.endsAt) {
        chrome.alarms.create(POMODORO_ALARM_NAME, { when: state.endsAt });
    }
}

function notifyPhaseEnd(finishedPhase, settings) {
    setLanguage(settings.language);
    const workDone = finishedPhase === POMODORO_PHASES.WORK;

    chrome.notifications.create(`pomodoro-${Date.now()}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("assets/dashboard.svg"),
        title: t(workDone ? "pomodoro.notify.workDoneTitle" : "pomodoro.notify.breakDoneTitle"),
        message: t(workDone ? "pomodoro.notify.workDoneBody" : "pomodoro.notify.breakDoneBody"),
        priority: 1
    });
}

// The beep itself needs a real page (Web Audio API isn't available in a service worker), so just
// broadcast to whichever extension pages happen to be open; if none are listening, this is a no-op.
function broadcastBeep() {
    chrome.runtime.sendMessage({ type: "pomodoro:beep" }).catch(() => {});
}

// A phase's timer ran out on its own — advance to the next phase, persist it, reschedule (or not)
// and let the user know.
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== POMODORO_ALARM_NAME) return;

    const settings = await getPomodoroSettings();
    const state = await getPomodoroState(settings);
    const finishedPhase = state.phase;

    const nextState = advancePomodoroPhase(state, settings);
    await savePomodoroState(nextState);
    await syncAlarmWithState(nextState);

    notifyPhaseEnd(finishedPhase, settings);
    broadcastBeep();
});

// Action messages from any open UI surface (dashboard panel or the popup window).
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string" || !message.type.startsWith("pomodoro:")) return undefined;

    handlePomodoroMessage(message.type)
        .then(() => sendResponse({ ok: true }))
        .catch(error => sendResponse({ ok: false, error: String(error) }));

    return true; // keep the message channel open for the async response above
});

async function handlePomodoroMessage(type) {
    if (type === "pomodoro:disable") {
        // The feature was turned off in Settings — stop ticking towards a notification nobody wants.
        await chrome.alarms.clear(POMODORO_ALARM_NAME);
        return;
    }

    const settings = await getPomodoroSettings();
    const state = await getPomodoroState(settings);
    const now = Date.now();

    let nextState;
    switch (type) {
        case "pomodoro:start":
            nextState = startPomodoroState(state, settings, now);
            break;
        case "pomodoro:pause":
            nextState = pausePomodoroState(state, now);
            break;
        case "pomodoro:skip":
            nextState = advancePomodoroPhase(state, settings);
            break;
        case "pomodoro:reset":
            nextState = resetPomodoroState(settings);
            break;
        default:
            return;
    }

    await savePomodoroState(nextState);
    await syncAlarmWithState(nextState);
}
