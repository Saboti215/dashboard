/**
 * Minimal, runtime-switchable i18n helper.
 *
 * Unlike chrome.i18n (which is fixed to the browser's UI language at install time), this lets the
 * user pick German or English from the Settings modal and see the change applied immediately,
 * without reloading the extension.
 *
 * Usage:
 *   - t("some.path")                  -> translated string for the current language
 *   - t("some.path", { name: "Ada" }) -> string with {name} placeholders replaced
 *   - t("weekdays")                   -> non-string values (arrays) are returned as-is
 *   - setLanguage("en") / getLanguage()
 *   - applyStaticTranslations()       -> sweeps the DOM for data-i18n(-title|-placeholder) attributes
 */

const TRANSLATIONS = {
    de: {
        widgets: {
            calendar: "Kalender",
            bookmarks: "Lesezeichen",
            today: "Heute",
            news: "News",
            tasks: "Fokus heute"
        },
        bookmarks: {
            general: "Allgemein",
            misc: "Sonstiges"
        },
        tasks: {
            placeholder: "Aufgabe ..."
        },
        extras: {
            loading: "Lädt...",
            weather: {
                error: "Wetter nicht verfügbar",
                condition: {
                    clear: "Klar",
                    mostlyClear: "Meist klar",
                    partlyCloudy: "Teilweise bewölkt",
                    overcast: "Bewölkt",
                    fog: "Nebel",
                    drizzle: "Nieselregen",
                    rain: "Regen",
                    heavyRain: "Starker Regen",
                    snow: "Schnee",
                    heavySnow: "Starker Schneefall",
                    showers: "Schauer",
                    heavyShowers: "Starke Schauer",
                    thunderstorm: "Gewitter"
                }
            },
            holiday: {
                error: "Feiertage nicht verfügbar",
                today: "Heute: {name}",
                next: "Nächster Feiertag: {name} ({date})",
                none: "Keine weiteren Feiertage dieses Jahr"
            },
            rss: {
                error: "News nicht verfügbar",
                empty: "Keine Schlagzeilen gefunden"
            }
        },
        search: {
            placeholder: "Mit {engine} suchen..."
        },
        ai: {
            title: "Neuer KI-Chat"
        },
        zen: {
            toggleTitle: "Zen-Modus"
        },
        popup: {
            openDashboard: "Dashboard öffnen"
        },
        wellness: {
            water: {
                title: "Zeit für Wasser",
                body: "Gönn dir ein Glas Wasser."
            },
            eyes: {
                title: "Augen-Pause",
                body: "Schau 20 Sekunden lang auf etwas, das 20 Fuß (ca. 6 m) entfernt ist."
            },
            desk: {
                sit: {
                    title: "Zeit zum Sitzen",
                    body: "Wechsle zurück in die Sitzposition."
                },
                stand: {
                    title: "Zeit zum Stehen",
                    body: "Wechsle in die Stehposition."
                }
            }
        },
        radio: {
            panelTitle: "TuneIn Radio",
            toggleTitle: "Musik-Player",
            tab: "TuneIn"
        },
        spotify: {
            panelTitle: "Spotify",
            tab: "Spotify"
        },
        pomodoro: {
            toggleTitle: "Pomodoro-Timer",
            panelTitle: "Pomodoro",
            openWindow: "In eigenem Fenster öffnen",
            phase: {
                work: "Arbeiten",
                shortBreak: "Kurze Pause",
                longBreak: "Lange Pause"
            },
            round: "Runde {current} von {total}",
            start: "Start",
            pause: "Pause",
            skip: "Überspringen",
            reset: "Zurücksetzen",
            notify: {
                workDoneTitle: "Arbeitsphase beendet",
                workDoneBody: "Zeit für eine Pause.",
                breakDoneTitle: "Pause beendet",
                breakDoneBody: "Bereit für die nächste Runde? Starte sie manuell."
            }
        },
        close: "Schließen",
        weekdays: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
        greeting: {
            morning: "Guten Morgen, {name}",
            afternoon: "Guten Tag, {name}",
            evening: "Guten Abend, {name}"
        },
        meetings: {
            toggleTitle: "Meetings verwalten",
            modalTitle: "Meetings verwalten",
            empty: "Noch keine Meetings angelegt.",
            edit: "Bearbeiten",
            delete: "Löschen",
            active: "AKTIVES MEETING",
            join: "Beitreten",
            todayTime: "Heute {start} - {end} Uhr",
            form: {
                name: "Name",
                type: "Typ",
                password: "Passwort (optional)",
                link: "Link",
                start: "Start",
                end: "Ende",
                recurrence: "Wiederholung",
                weekly: "Wöchentlich",
                once: "Einmalig",
                weekday: "Wochentag",
                date: "Datum",
                cancel: "Neu / Zurücksetzen",
                save: "Speichern"
            }
        },
        settings: {
            toggleTitle: "Einstellungen",
            modalTitle: "Einstellungen",
            section: {
                general: "Allgemein",
                search: "Suche & KI",
                calendar: "Kalender",
                weather: "Wetter",
                holidays: "Feiertage",
                quote: "Zitat des Tages",
                tasks: "Fokus heute",
                rss: "News",
                worldClock: "Weltuhr",
                radio: "Radio",
                spotify: "Spotify",
                meetings: "Meetings",
                pomodoro: "Pomodoro",
                wellness: "Wellness"
            },
            language: "Sprache",
            userName: "Dein Name",
            searchEngine: "Suchmaschine",
            aiAssistant: "KI-Assistent",
            accentColor: "Akzentfarbe",
            background: "Hintergrundbild",
            backgroundHint: "Ohne Bild wird nur die Hintergrundfarbe verwendet.",
            backgroundRemove: "Entfernen",
            calendarIframe: "Kalender-Einbettung",
            calendarHint: "Google Kalender → Einstellungen → \"Kalender integrieren\" → den Code aus dem <iframe>-Feld hier einfügen.",
            weatherLocation: "Ort",
            weatherHint: "Ortsname, z. B. \"Berlin\" oder \"Neuss\". Wetterdaten kommen von Open-Meteo (kostenlos, ohne Anmeldung, ohne Tracking).",
            holidayCountry: "Länder-Code",
            holidayHint: "Zweistelliger Ländercode, z. B. \"DE\" für Deutschland, \"AT\" für Österreich, \"CH\" für die Schweiz, \"US\" für die USA.",
            quoteEnabled: "Zitat des Tages anzeigen",
            tasksEnabled: "Aufgaben-Widget anzeigen",
            rssEnabled: "News-Karte anzeigen",
            rssFeeds: "RSS-Feeds",
            rssHint: "Eine Feed-URL pro Zeile, z. B. https://www.tagesschau.de/xml/rss2/.",
            worldClock1: "Weltuhr 1",
            worldClock2: "Weltuhr 2",
            worldClockNone: "— Keine —",
            radioEnabled: "Radio-Player anzeigen",
            tuneInId: "TuneIn Sender-ID",
            tuneInHint: "Die Sender-ID aus der URL eines TuneIn-Senders, z. B. \"s34682\" aus tunein.com/radio/.../s34682.",
            spotifyEnabled: "Spotify-Player anzeigen",
            spotifyUri: "Spotify-Link oder ID",
            spotifyHint: "Link, URI oder ID zu Playlist, Album, Titel oder Künstler, z. B. https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M.",
            meetingsEnabled: "Meeting Quick-Join anzeigen",
            pomodoroEnabled: "Pomodoro-Timer anzeigen",
            pomodoroWork: "Arbeitsdauer (Min.)",
            pomodoroShortBreak: "Kurze Pause (Min.)",
            pomodoroLongBreak: "Lange Pause (Min.)",
            pomodoroRounds: "Runden bis lange Pause",
            waterEnabled: "Wasser-Erinnerung",
            eyesEnabled: "Augen-Pause",
            deskEnabled: "Steh-Erinnerung",
            wellnessInterval: "Intervall (Min.)",
            cancel: "Abbrechen",
            save: "Speichern"
        }
    },
    en: {
        widgets: {
            calendar: "Calendar",
            bookmarks: "Bookmarks",
            today: "Today",
            news: "News",
            tasks: "Today's focus"
        },
        bookmarks: {
            general: "General",
            misc: "Other"
        },
        tasks: {
            placeholder: "Task ..."
        },
        extras: {
            loading: "Loading...",
            weather: {
                error: "Weather unavailable",
                condition: {
                    clear: "Clear",
                    mostlyClear: "Mostly clear",
                    partlyCloudy: "Partly cloudy",
                    overcast: "Overcast",
                    fog: "Fog",
                    drizzle: "Drizzle",
                    rain: "Rain",
                    heavyRain: "Heavy rain",
                    snow: "Snow",
                    heavySnow: "Heavy snow",
                    showers: "Showers",
                    heavyShowers: "Heavy showers",
                    thunderstorm: "Thunderstorm"
                }
            },
            holiday: {
                error: "Holidays unavailable",
                today: "Today: {name}",
                next: "Next holiday: {name} ({date})",
                none: "No more holidays this year"
            },
            rss: {
                error: "News unavailable",
                empty: "No headlines found"
            }
        },
        search: {
            placeholder: "Search with {engine}..."
        },
        ai: {
            title: "New AI chat"
        },
        zen: {
            toggleTitle: "Zen mode"
        },
        popup: {
            openDashboard: "Open dashboard"
        },
        wellness: {
            water: {
                title: "Time for water",
                body: "Grab a glass of water."
            },
            eyes: {
                title: "Eye break",
                body: "Look at something 20 feet (about 6 m) away for 20 seconds."
            },
            desk: {
                sit: {
                    title: "Time to sit",
                    body: "Switch back to sitting."
                },
                stand: {
                    title: "Time to stand",
                    body: "Switch to standing."
                }
            }
        },
        radio: {
            panelTitle: "TuneIn Radio",
            toggleTitle: "Music player",
            tab: "TuneIn"
        },
        spotify: {
            panelTitle: "Spotify",
            tab: "Spotify"
        },
        pomodoro: {
            toggleTitle: "Pomodoro timer",
            panelTitle: "Pomodoro",
            openWindow: "Open in separate window",
            phase: {
                work: "Focus",
                shortBreak: "Short break",
                longBreak: "Long break"
            },
            round: "Round {current} of {total}",
            start: "Start",
            pause: "Pause",
            skip: "Skip",
            reset: "Reset",
            notify: {
                workDoneTitle: "Focus session done",
                workDoneBody: "Time for a break.",
                breakDoneTitle: "Break's over",
                breakDoneBody: "Ready for the next round? Start it manually."
            }
        },
        close: "Close",
        weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        greeting: {
            morning: "Good morning, {name}",
            afternoon: "Good afternoon, {name}",
            evening: "Good evening, {name}"
        },
        meetings: {
            toggleTitle: "Manage meetings",
            modalTitle: "Manage meetings",
            empty: "No meetings added yet.",
            edit: "Edit",
            delete: "Delete",
            active: "ACTIVE MEETING",
            join: "Join",
            todayTime: "Today {start} - {end}",
            form: {
                name: "Name",
                type: "Type",
                password: "Password (optional)",
                link: "Link",
                start: "Start",
                end: "End",
                recurrence: "Recurrence",
                weekly: "Weekly",
                once: "One-off",
                weekday: "Weekday",
                date: "Date",
                cancel: "New / Reset",
                save: "Save"
            }
        },
        settings: {
            toggleTitle: "Settings",
            modalTitle: "Settings",
            section: {
                general: "General",
                search: "Search & AI",
                calendar: "Calendar",
                weather: "Weather",
                holidays: "Holidays",
                quote: "Quote of the day",
                tasks: "Today's focus",
                rss: "News",
                worldClock: "World clock",
                radio: "Radio",
                spotify: "Spotify",
                meetings: "Meetings",
                pomodoro: "Pomodoro",
                wellness: "Wellness"
            },
            language: "Language",
            userName: "Your name",
            searchEngine: "Search engine",
            aiAssistant: "AI assistant",
            accentColor: "Accent color",
            background: "Background image",
            backgroundHint: "Without an image, only the background color is used.",
            backgroundRemove: "Remove",
            calendarIframe: "Calendar embed",
            calendarHint: "Google Calendar → Settings → \"Integrate calendar\" → paste the code from the <iframe> field here.",
            weatherLocation: "Location",
            weatherHint: "A place name, e.g. \"Berlin\" or \"New York\". Weather data comes from Open-Meteo (free, no sign-up, no tracking).",
            holidayCountry: "Country code",
            holidayHint: "Two-letter country code, e.g. \"DE\" for Germany, \"AT\" for Austria, \"CH\" for Switzerland, \"US\" for the United States.",
            quoteEnabled: "Show quote of the day",
            tasksEnabled: "Show tasks widget",
            rssEnabled: "Show news card",
            rssFeeds: "RSS feeds",
            rssHint: "One feed URL per line, e.g. https://www.tagesschau.de/xml/rss2/.",
            worldClock1: "World clock 1",
            worldClock2: "World clock 2",
            worldClockNone: "— None —",
            radioEnabled: "Show radio player",
            tuneInId: "TuneIn station ID",
            tuneInHint: "The station ID from a TuneIn station's URL, e.g. \"s34682\" from tunein.com/radio/.../s34682.",
            spotifyEnabled: "Show Spotify player",
            spotifyUri: "Spotify link or ID",
            spotifyHint: "A link, URI, or ID for a playlist, album, track, or artist, e.g. https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M.",
            meetingsEnabled: "Show meeting quick-join",
            pomodoroEnabled: "Show Pomodoro timer",
            pomodoroWork: "Focus duration (min)",
            pomodoroShortBreak: "Short break (min)",
            pomodoroLongBreak: "Long break (min)",
            pomodoroRounds: "Rounds until long break",
            waterEnabled: "Water reminder",
            eyesEnabled: "Eye break reminder",
            deskEnabled: "Standing reminder",
            wellnessInterval: "Interval (min)",
            cancel: "Cancel",
            save: "Save"
        }
    }
};

let currentLanguage = detectDefaultLanguage();

function detectDefaultLanguage() {
    const browserLang = (typeof navigator !== "undefined" && navigator.language) || "en";
    return browserLang.toLowerCase().startsWith("de") ? "de" : "en";
}

function setLanguage(lang) {
    currentLanguage = TRANSLATIONS[lang] ? lang : detectDefaultLanguage();
}

function getLanguage() {
    return currentLanguage;
}

function getPath(obj, path) {
    return path.split(".").reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

// Looks up `key` (dot-path, e.g. "meetings.form.save") in the current language, falling back to
// English and then to the key itself so a missing translation never renders as "undefined".
function t(key, vars) {
    const value = getPath(TRANSLATIONS[currentLanguage], key);
    const resolved = value !== undefined ? value : getPath(TRANSLATIONS.en, key);
    if (resolved === undefined) return key;
    if (typeof resolved !== "string" || !vars) return resolved;
    return resolved.replace(/\{(\w+)\}/g, (match, name) => (vars[name] !== undefined ? vars[name] : match));
}

// Translates every element carrying a data-i18n(-title|-placeholder) attribute in one sweep.
// Call this whenever the language changes; dynamic content (rendered via t() elsewhere) needs to
// be re-rendered separately since it isn't tied to a DOM attribute.
function applyStaticTranslations() {
    document.documentElement.lang = currentLanguage;

    document.querySelectorAll("[data-i18n]").forEach(el => {
        el.textContent = t(el.getAttribute("data-i18n"));
    });

    document.querySelectorAll("[data-i18n-title]").forEach(el => {
        el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
        el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
}
