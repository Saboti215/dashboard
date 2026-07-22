/**
 * Pure Pomodoro state logic — no DOM, no chrome.* calls. Shared by three very different contexts,
 * loaded via importScripts() in the background service worker (src/background.js) and via plain
 * <script> tags in index.html and pomodoro.html, so it has to stay dependency-free and side-effect
 * free (just data in, data out) to work unmodified in all three.
 *
 * State shape (persisted as chrome.storage.local's "pomodoroState"):
 *   {
 *     phase: "work" | "shortBreak" | "longBreak",
 *     round: 1,            // which work session we're in/just finished, within the current cycle
 *     running: boolean,
 *     endsAt: number|null,     // epoch ms the current phase ends at, while running
 *     remainingMs: number|null // ms left, while paused/not yet started (mutually exclusive with endsAt)
 *   }
 */

const POMODORO_PHASES = { WORK: "work", SHORT_BREAK: "shortBreak", LONG_BREAK: "longBreak" };

function getPomodoroPhaseDurationMs(phase, settings) {
    const minutes = phase === POMODORO_PHASES.WORK ? settings.pomodoroWorkMinutes
        : phase === POMODORO_PHASES.SHORT_BREAK ? settings.pomodoroShortBreakMinutes
        : settings.pomodoroLongBreakMinutes;
    return Math.max(1, minutes || 1) * 60 * 1000;
}

function getInitialPomodoroState(settings) {
    return {
        phase: POMODORO_PHASES.WORK,
        round: 1,
        running: false,
        endsAt: null,
        remainingMs: getPomodoroPhaseDurationMs(POMODORO_PHASES.WORK, settings)
    };
}

// Called both when a phase finishes naturally and when the user clicks "Skip" — in both cases the
// current phase is treated as over. Breaks are set to start running immediately; a fresh work
// phase is left stopped, waiting for a manual start (the confirmed "pause automatic, work manual"
// rule).
function advancePomodoroPhase(state, settings) {
    const roundsUntilLongBreak = Math.max(1, settings.pomodoroRoundsUntilLongBreak || 4);
    let nextPhase;
    let nextRound = state.round;

    if (state.phase === POMODORO_PHASES.WORK) {
        nextPhase = state.round >= roundsUntilLongBreak ? POMODORO_PHASES.LONG_BREAK : POMODORO_PHASES.SHORT_BREAK;
    } else if (state.phase === POMODORO_PHASES.SHORT_BREAK) {
        nextPhase = POMODORO_PHASES.WORK;
        nextRound = state.round + 1;
    } else {
        // longBreak -> back to the start of a fresh cycle
        nextPhase = POMODORO_PHASES.WORK;
        nextRound = 1;
    }

    const durationMs = getPomodoroPhaseDurationMs(nextPhase, settings);
    const autoStart = nextPhase !== POMODORO_PHASES.WORK;

    return {
        phase: nextPhase,
        round: nextRound,
        running: autoStart,
        endsAt: autoStart ? Date.now() + durationMs : null,
        remainingMs: autoStart ? null : durationMs
    };
}

function startPomodoroState(state, settings, now) {
    if (state.running) return state;
    const remaining = state.remainingMs != null ? state.remainingMs : getPomodoroPhaseDurationMs(state.phase, settings);
    return { ...state, running: true, endsAt: now + remaining, remainingMs: null };
}

function pausePomodoroState(state, now) {
    if (!state.running) return state;
    const remaining = Math.max(0, (state.endsAt || now) - now);
    return { ...state, running: false, endsAt: null, remainingMs: remaining };
}

function resetPomodoroState(settings) {
    return getInitialPomodoroState(settings);
}

// How much time is left right now, whether running (computed from the endsAt timestamp, so it
// never drifts) or paused (the stored remainingMs).
function getPomodoroRemainingMs(state, now) {
    if (state.running && state.endsAt) {
        return Math.max(0, state.endsAt - now);
    }
    return Math.max(0, state.remainingMs || 0);
}

function formatPomodoroTime(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
