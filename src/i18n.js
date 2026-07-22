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
            bookmarks: "Lesezeichen"
        },
        bookmarks: {
            general: "Allgemein",
            misc: "Sonstiges"
        },
        search: {
            placeholder: "Mit {engine} suchen..."
        },
        gemini: {
            title: "Neuer Gemini-Chat"
        },
        radio: {
            panelTitle: "TuneIn Radio",
            toggleTitle: "Radio-Player"
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
            language: "Sprache",
            userName: "Dein Name",
            searchEngine: "Suchmaschine",
            accentColor: "Akzentfarbe",
            background: "Hintergrundbild",
            backgroundHint: "Ohne Bild wird nur die Hintergrundfarbe verwendet.",
            backgroundRemove: "Entfernen",
            calendarIframe: "Kalender-Einbettung",
            calendarHint: "Google Kalender → Einstellungen → \"Kalender integrieren\" → den Code aus dem <iframe>-Feld hier einfügen.",
            radioEnabled: "Radio-Player anzeigen",
            tuneInId: "TuneIn Sender-ID",
            meetingsEnabled: "Meeting Quick-Join anzeigen",
            cancel: "Abbrechen",
            save: "Speichern"
        }
    },
    en: {
        widgets: {
            calendar: "Calendar",
            bookmarks: "Bookmarks"
        },
        bookmarks: {
            general: "General",
            misc: "Other"
        },
        search: {
            placeholder: "Search with {engine}..."
        },
        gemini: {
            title: "New Gemini Chat"
        },
        radio: {
            panelTitle: "TuneIn Radio",
            toggleTitle: "Radio Player"
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
            language: "Language",
            userName: "Your name",
            searchEngine: "Search engine",
            accentColor: "Accent color",
            background: "Background image",
            backgroundHint: "Without an image, only the background color is used.",
            backgroundRemove: "Remove",
            calendarIframe: "Calendar embed",
            calendarHint: "Google Calendar → Settings → \"Integrate calendar\" → paste the code from the <iframe> field here.",
            radioEnabled: "Show radio player",
            tuneInId: "TuneIn station ID",
            meetingsEnabled: "Show meeting quick-join",
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
