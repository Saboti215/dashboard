# Personal Dashboard New Tab

*[Deutsche Version](README.de.md)*

A browser extension (Manifest V3, works in Brave and other Chromium-based browsers) that replaces
the new tab page with a personal dashboard: your bookmarks with icons, a configurable search bar,
a calendar embed, a meeting quick-join widget, a Pomodoro timer, a radio player, and a clock — all
styled as a single glass-morphism dashboard.

Everything is configured **inside the app** through the Settings modal (the gear icon, top right).
There is no config file to edit and no build step — it's plain HTML/CSS/JS plus jQuery.

## Features

- **Bookmarks** — reads your browser's bookmarks bar directly. Each folder becomes a category
  (mirroring how the old static "quick links" used to be grouped); bookmarks placed loose on the
  bar (not inside a folder) land in a "General" category. Icons come from Chromium's built-in
  favicon cache (`chrome://favicon`-style), so they load instantly and are never re-fetched from
  the web.
- **Search bar** — pick your search engine (Brave, Google, DuckDuckGo, Bing, Startpage, Ecosia) in
  Settings. Auto-focused on load, since this page is meant to be used as your browser's start page.
- **Calendar** — paste any `<iframe>` embed code (e.g. from Google Calendar's "Integrate calendar"
  settings) into Settings and it renders on the left.
- **Meeting quick-join** — manage recurring (weekly) or one-off (dated) Zoom / MS Teams meetings
  from a small modal (the calendar icon, bottom left). 15 minutes before a meeting starts, a
  "join now" card appears; joining copies the password (if you set one) to your clipboard and opens
  the meeting link.
- **Pomodoro timer** — configurable focus/short-break/long-break durations and rounds, from a
  floating panel (bottom center). Breaks start automatically; the next focus session always needs
  a manual start. A background service worker (`chrome.alarms`) does the actual timekeeping, so it
  reliably notifies you even if the New Tab tab isn't open — you don't have to keep it around. You
  can also pop the timer out into its own small window (button inside the panel) to keep it visible
  while you work elsewhere. The custom chime only plays from an open dashboard tab or popup window
  (browser notifications can't play custom audio from the background); if neither is open when a
  phase ends, you still get the browser notification, just with the OS's own notification sound.
- **Radio player** — embeds a TuneIn station by ID, toggled from a floating button (bottom right).
- **Clock + optional greeting** — set your name in Settings for a time-of-day greeting ("Good
  morning, ...").
- **Appearance** — set an accent color and, optionally, upload a background image. Without an
  image, only the background color is used.
- **AI assistant shortcut** — a small button next to the search bar opens a new chat with the
  assistant of your choice (Gemini, ChatGPT, Claude, Copilot, or Perplexity), picked in Settings.
- **Bilingual UI** — German and English, switchable at any time in Settings; takes effect
  immediately, no reload needed.
- Radio, the meeting widget, and the Pomodoro timer can each be turned off entirely if you don't
  need them.

## Installation

1. Clone or download this repository.
2. Open `brave://extensions` (or `chrome://extensions`).
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the project folder.
5. Open a new tab — the dashboard replaces it.

There is nothing to build or install via npm; the extension ships as plain source files.

## Configuration

Click the gear icon (top right) to open **Settings**:

| Setting | What it does |
|---|---|
| Language | Switches the whole UI between German and English. |
| Your name | Shows a time-of-day greeting next to the clock. Leave empty to hide it. |
| Search engine | Which engine the search bar submits to. |
| AI assistant | Which assistant the AI button (next to the search bar) opens. |
| Accent color | The dashboard's highlight color (buttons, focus states, active toggles). |
| Background image | Upload an image to use as the page background; "Remove" clears it back to a plain color. Stored locally in the browser, never uploaded anywhere. |
| Calendar embed | Paste an `<iframe>` embed snippet here to show a calendar; leave empty to hide the calendar widget entirely. |
| Show radio player | Toggles the floating radio button/panel. |
| TuneIn station ID | The station ID from a TuneIn station's URL, e.g. `s34682` from `tunein.com/radio/.../s34682`. |
| Show meeting quick-join | Toggles the meeting button, modal, and the "join now" card. |
| Show Pomodoro timer | Toggles the Pomodoro button/panel and stops its background alarm. |
| Focus duration (min) | Length of a focus session. |
| Short break (min) | Length of a short break, taken after every focus session except the last of a cycle. |
| Long break (min) | Length of the long break, taken after the configured number of rounds. |
| Rounds until long break | How many focus sessions make up one cycle before a long break. |

Meetings themselves are managed separately, from their own modal (the calendar-shaped button,
bottom left): add a name, meeting type (Zoom or MS Teams), the full join link, an optional
password, a start/end time, and either a weekday (recurs weekly) or a specific date (one-off).

## Permissions explained

- **`bookmarks`** — read-only access to your bookmarks bar, used to render the Bookmarks widget.
- **`favicon`** — lets the extension request already-cached favicons from Chromium's local favicon
  store, instead of re-downloading each site's icon.
- **`storage`** — stores your settings and meetings via `chrome.storage.sync` (roams across your
  signed-in browser profiles).
- **`unlimitedStorage`** — lifts the default quota so an uploaded background image (which can be a
  few MB as a data URL) fits comfortably in `chrome.storage.local`.
- **`alarms`** — lets the background service worker schedule the exact moment a Pomodoro phase
  ends (`chrome.alarms`), so the timer keeps running and notifying even while no dashboard tab or
  popup window is open.
- **`notifications`** — lets the background service worker show a browser notification when a
  Pomodoro phase ends.

## Privacy

All configuration and data (settings, meetings, the background image) stays in your browser's own
`chrome.storage` — nothing is sent to any server operated by this project. The only outbound
requests this dashboard makes are the ones you'd expect from its features: your chosen search
engine when you search, the calendar/radio iframes you configure yourself, and favicon lookups
against Chromium's local cache.

## Development

Plain HTML/CSS/JS, no build step:

- `index.html` — page structure and widget markup.
- `src/dashboard.js` — all dashboard behavior (settings, bookmarks, search, calendar, radio,
  meetings, clock).
- `src/i18n.js` — the German/English translation dictionary and the `t()` helper.
- `src/dashboard.css` — styling (shared by `index.html` and `pomodoro.html`).
- `pomodoro.html` + `src/pomodoro-window.js` — the standalone Pomodoro popup window.
- `src/pomodoro-ui.js` — Pomodoro widget rendering/controls, shared by the dashboard panel and the
  popup window (both are "thin clients" — see below).
- `src/pomodoro-logic.js` — pure Pomodoro state-transition logic with no DOM/`chrome.*` dependency,
  shared by the background service worker and both pages.
- `src/background.js` — background service worker; the single source of truth for the Pomodoro
  timer via `chrome.alarms`, so it keeps running and notifying independent of any open page.
- `manifest.json` — extension manifest (Manifest V3).

To add a UI string: add a key under both `de` and `en` in `src/i18n.js`, then either add a
`data-i18n="your.key"` attribute to the element in `index.html` (for static text; use
`data-i18n-title`/`data-i18n-placeholder` for attributes), or call `t("your.key")` directly from
`dashboard.js` for anything rendered dynamically.
