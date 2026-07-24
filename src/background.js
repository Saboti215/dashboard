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

// chrome.notifications can't decode SVG icons (the create() call silently fails with "Unable to
// download all specified images" and no notification ever appears), so this points at one of the
// packaged raster icons instead of assets/dashboard.svg.
const NOTIFICATION_ICON = chrome.runtime.getURL("assets/icon-128.png");

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

// ---------------------------------------------------------------------------------------------
// Toolbar badge — shows the Pomodoro countdown in whole minutes on the extension's toolbar icon,
// so it's glanceable without opening the popup. chrome.alarms' minimum period for a recurring
// alarm is 1 minute, which conveniently matches the badge's own minute-granularity display: a
// dedicated alarm re-renders it once a minute while running (like POMODORO_ALARM_NAME above, this
// keeps counting down with no page/popup open at all).
// ---------------------------------------------------------------------------------------------

const POMODORO_BADGE_ALARM_NAME = "pomodoro-badge-tick";
const BADGE_COLOR_RUNNING = "#6366f1"; // matches --accent-color in src/dashboard.css
const BADGE_COLOR_PAUSED = "#64748b"; // matches --text-secondary in src/dashboard.css

// Stays empty for a freshly-reset/never-started phase (remainingMs still equals the full phase
// duration) — nothing worth glancing at yet — so the badge doesn't show e.g. "25" the moment the
// extension is installed, before the user has ever pressed Start.
async function updateBadge(state, settings) {
    const remainingMs = getPomodoroRemainingMs(state, Date.now());
    const fullDurationMs = getPomodoroPhaseDurationMs(state.phase, settings);

    if (!state.running && remainingMs >= fullDurationMs) {
        await clearBadge();
        return;
    }

    const minutes = Math.max(0, Math.ceil(remainingMs / 60000));
    await chrome.action.setBadgeText({ text: String(minutes) });
    await chrome.action.setBadgeBackgroundColor({
        color: state.running ? BADGE_COLOR_RUNNING : BADGE_COLOR_PAUSED
    });
}

async function clearBadge() {
    await chrome.action.setBadgeText({ text: "" });
}

async function syncBadgeAlarm(state, settings) {
    await chrome.alarms.clear(POMODORO_BADGE_ALARM_NAME);
    if (state.running) {
        chrome.alarms.create(POMODORO_BADGE_ALARM_NAME, { periodInMinutes: 1 });
    }
    await updateBadge(state, settings);
}

function notifyPhaseEnd(finishedPhase, settings) {
    setLanguage(settings.language);
    const workDone = finishedPhase === POMODORO_PHASES.WORK;

    chrome.notifications.create(`pomodoro-${Date.now()}`, {
        type: "basic",
        iconUrl: NOTIFICATION_ICON,
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

// ---------------------------------------------------------------------------------------------
// Wellness pings (water / eyes / standing desk) — independent, periodic chrome.alarms, each
// firing its own native notification. Modeled directly on the Pomodoro timer above: alarms
// survive closed tabs and browser restarts, so the reminders keep coming whether or not the
// dashboard tab is open. Unlike Pomodoro there's no running/paused state to persist — each type
// is just "on + an interval", so an alarm existing *is* the state.
// ---------------------------------------------------------------------------------------------

const WELLNESS_TYPES = {
    water: { alarmName: "wellness-water", enabledKey: "waterEnabled", intervalKey: "waterIntervalMinutes" },
    eyes: { alarmName: "wellness-eyes", enabledKey: "eyesEnabled", intervalKey: "eyesIntervalMinutes" },
    desk: { alarmName: "wellness-desk", enabledKey: "deskEnabled", intervalKey: "deskIntervalMinutes" }
};

const WELLNESS_SETTINGS_DEFAULTS = {
    language: detectDefaultLanguage(),
    waterEnabled: false,
    waterIntervalMinutes: 60,
    eyesEnabled: false,
    eyesIntervalMinutes: 20,
    deskEnabled: false,
    deskIntervalMinutes: 50
};

async function getWellnessSettings() {
    return chrome.storage.sync.get(WELLNESS_SETTINGS_DEFAULTS);
}

function getWellnessTypeByAlarmName(alarmName) {
    return Object.keys(WELLNESS_TYPES).find(type => WELLNESS_TYPES[type].alarmName === alarmName) || null;
}

// Reconciles all three wellness alarms with the latest settings: clears each one first (so a
// disabled/removed reminder actually stops), then recreates it if it's enabled with a valid
// interval. Safe to call as often as needed — chrome.alarms.create() replaces any alarm with the
// same name, so this never double-schedules.
async function syncWellnessAlarms() {
    const settings = await getWellnessSettings();

    for (const type of Object.keys(WELLNESS_TYPES)) {
        const { alarmName, enabledKey, intervalKey } = WELLNESS_TYPES[type];
        await chrome.alarms.clear(alarmName);

        const interval = Math.max(1, Number(settings[intervalKey]) || 0);
        if (settings[enabledKey] && interval >= 1) {
            chrome.alarms.create(alarmName, { periodInMinutes: interval, delayInMinutes: interval });
        }
    }
}

// The standing-desk reminder alternates sit/stand on every fire rather than always saying the
// same thing; which one comes next is the only piece of state this feature needs, kept in
// storage.local so it survives service-worker restarts between alarms.
async function getDeskStandNext() {
    const data = await chrome.storage.local.get({ deskStandNext: true });
    return data.deskStandNext;
}

async function notifyWellness(type, settings) {
    setLanguage(settings.language);

    if (type === "desk") {
        const standNext = await getDeskStandNext();
        await chrome.storage.local.set({ deskStandNext: !standNext });

        chrome.notifications.create(`wellness-desk-${Date.now()}`, {
            type: "basic",
            iconUrl: NOTIFICATION_ICON,
            title: t(standNext ? "wellness.desk.stand.title" : "wellness.desk.sit.title"),
            message: t(standNext ? "wellness.desk.stand.body" : "wellness.desk.sit.body"),
            priority: 1
        });
        return;
    }

    chrome.notifications.create(`wellness-${type}-${Date.now()}`, {
        type: "basic",
        iconUrl: NOTIFICATION_ICON,
        title: t(`wellness.${type}.title`),
        message: t(`wellness.${type}.body`),
        priority: 1
    });
}

// Establish the wellness alarms as soon as the service worker has a reason to run: right after
// install (first-ever settings are the defaults, all disabled, so this is a no-op until the user
// opts in) and on every browser startup (alarms don't persist across a full browser restart on
// all platforms, so this re-arms them). Settings changes while already running are covered by the
// chrome.storage.onChanged listener further down.
chrome.runtime.onInstalled.addListener(() => { syncWellnessAlarms(); initBadgeOnStartup(); });
chrome.runtime.onStartup.addListener(() => { syncWellnessAlarms(); initBadgeOnStartup(); });

// Same "alarms don't survive a full browser restart on all platforms" concern applies to the
// badge alarm — re-arm it (or just redraw a paused/stopped badge) from whatever state was last
// persisted, so the toolbar icon is correct immediately rather than stale until the next action.
async function initBadgeOnStartup() {
    const settings = await getPomodoroSettings();
    const state = await getPomodoroState(settings);
    await syncBadgeAlarm(state, settings);
}

const WELLNESS_SETTING_KEYS = Object.values(WELLNESS_TYPES).flatMap(({ enabledKey, intervalKey }) => [enabledKey, intervalKey]);

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && WELLNESS_SETTING_KEYS.some(key => changes[key])) {
        syncWellnessAlarms();
    }
});

// A phase's timer ran out on its own — advance to the next phase, persist it, reschedule (or not)
// and let the user know. Also handles wellness alarms, which need no phase machinery: firing the
// alarm and showing its notification is the entire "state transition".
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === POMODORO_ALARM_NAME) {
        const settings = await getPomodoroSettings();
        const state = await getPomodoroState(settings);
        const finishedPhase = state.phase;

        const nextState = advancePomodoroPhase(state, settings);
        await savePomodoroState(nextState);
        await syncAlarmWithState(nextState);
        await syncBadgeAlarm(nextState, settings);

        notifyPhaseEnd(finishedPhase, settings);
        broadcastBeep();
        return;
    }

    if (alarm.name === POMODORO_BADGE_ALARM_NAME) {
        const settings = await getPomodoroSettings();
        const state = await getPomodoroState(settings);
        await updateBadge(state, settings);
        return;
    }

    const wellnessType = getWellnessTypeByAlarmName(alarm.name);
    if (wellnessType) {
        const settings = await getWellnessSettings();
        await notifyWellness(wellnessType, settings);
    }
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
        await chrome.alarms.clear(POMODORO_BADGE_ALARM_NAME);
        await clearBadge();
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
    await syncBadgeAlarm(nextState, settings);
}
