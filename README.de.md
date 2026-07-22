# Personal Dashboard New Tab

*[English version](README.md)*

Eine Browser-Erweiterung (Manifest V3, läuft in Brave und anderen Chromium-Browsern), die die
New-Tab-Seite durch ein persönliches Dashboard ersetzt: Lesezeichen mit Icons, eine konfigurierbare
Suchleiste, ein Kalender-Embed, ein Meeting-Quick-Join-Widget, ein Pomodoro-Timer, ein Radio-Player
und eine Uhr – alles im gleichen Glass-Look.

Die gesamte Konfiguration erfolgt **in der Anwendung selbst** über das Einstellungs-Modal
(Zahnrad-Symbol, oben rechts). Es gibt keine Konfigurationsdatei zu bearbeiten und keinen
Build-Schritt – reines HTML/CSS/JS plus jQuery.

## Features

- **Lesezeichen** – liest direkt die Lesezeichenleiste des Browsers. Jeder Ordner wird zu einer
  Kategorie (wie früher die statischen "Quick Links"); lose Lesezeichen direkt in der Leiste landen
  in einer Kategorie "Allgemein". Icons kommen aus dem eingebauten Favicon-Cache von Chromium und
  werden dadurch nie erneut aus dem Netz geladen.
- **Suchleiste** – Suchmaschine (Brave, Google, DuckDuckGo, Bing, Startpage, Ecosia) frei wählbar
  in den Einstellungen. Beim Laden automatisch fokussiert, da die Seite als Browser-Startseite
  gedacht ist.
- **Kalender** – beliebigen `<iframe>`-Embed-Code (z. B. aus den Google-Kalender-Einstellungen
  "Kalender integrieren") in den Einstellungen einfügen; er erscheint links im Dashboard.
- **Meeting Quick-Join** – wiederkehrende (wöchentliche) oder einmalige (datierte) Zoom-/MS-Teams-
  Meetings über ein kleines Modal (Kalender-Symbol, unten links) verwalten. 15 Minuten vor
  Meetingbeginn erscheint eine Beitreten-Karte; das Passwort (falls gesetzt) landet dabei in der
  Zwischenablage, der Link öffnet im gleichen Tab.
- **Pomodoro-Timer** – konfigurierbare Arbeits-/Kurze-Pause-/Lange-Pause-Dauern und Rundenzahl,
  über ein schwebendes Panel (unten mittig). Pausen starten automatisch; die nächste Arbeitsphase
  muss immer manuell gestartet werden. Die eigentliche Zeitmessung übernimmt ein
  Hintergrund-Service-Worker (`chrome.alarms`), sodass die Benachrichtigung zuverlässig kommt, auch
  wenn der New-Tab-Tab gar nicht offen ist – man muss ihn also nicht offenhalten. Der Timer lässt
  sich zusätzlich in ein eigenes kleines Fenster auslagern (Button im Panel), um ihn z. B. auf einem
  zweiten Monitor sichtbar zu halten. Der eigene Signalton spielt nur, wenn gerade ein
  Dashboard-Tab oder das Popup-Fenster offen ist (Browser-Benachrichtigungen können im Hintergrund
  keinen eigenen Ton abspielen); ist keines von beiden offen, kommt trotzdem die
  Browser-Benachrichtigung – nur eben mit dem systemeigenen Benachrichtigungston.
- **Radio-Player** – bindet einen TuneIn-Sender per ID ein, umschaltbar über einen schwebenden
  Button (unten rechts).
- **Uhr + optionale Begrüßung** – Name in den Einstellungen setzen für eine zeitabhängige
  Begrüßung ("Guten Morgen, ...").
- **Aussehen** – Akzentfarbe einstellen und optional ein Hintergrundbild hochladen. Ohne Bild wird
  nur die Hintergrundfarbe verwendet.
- **KI-Schnellzugriff** – ein kleiner Knopf neben der Suchleiste öffnet einen neuen Chat mit dem
  in den Einstellungen gewählten Assistenten (Gemini, ChatGPT, Claude, Copilot oder Perplexity).
- **Zweisprachige Oberfläche** – Deutsch und Englisch, jederzeit umschaltbar in den Einstellungen;
  wirkt sofort, kein Neuladen nötig.
- Radio, das Meeting-Widget und der Pomodoro-Timer lassen sich jeweils komplett deaktivieren, falls
  nicht benötigt.

## Installation

1. Repository klonen oder herunterladen.
2. `brave://extensions` (bzw. `chrome://extensions`) öffnen.
3. **Entwicklermodus** aktivieren (oben rechts).
4. **Entpackte Erweiterung laden** klicken und den Projektordner auswählen.
5. Einen neuen Tab öffnen – das Dashboard ersetzt ihn.

Es muss nichts über npm gebaut oder installiert werden; die Erweiterung besteht aus reinem
Quellcode.

## Konfiguration

Zahnrad-Symbol (oben rechts) öffnet die **Einstellungen**:

| Einstellung | Wirkung |
|---|---|
| Sprache | Schaltet die gesamte Oberfläche zwischen Deutsch und Englisch um. |
| Dein Name | Zeigt eine zeitabhängige Begrüßung bei der Uhr. Leer lassen, um sie auszublenden. |
| Suchmaschine | An welche Suchmaschine die Suchleiste die Anfrage sendet. |
| KI-Assistent | Welchen Assistenten der KI-Knopf (neben der Suchleiste) öffnet. |
| Akzentfarbe | Die Hervorhebungsfarbe des Dashboards (Buttons, Fokus-Zustände, aktive Umschalter). |
| Hintergrundbild | Bild hochladen, das als Seitenhintergrund dient; "Entfernen" setzt wieder auf reine Farbe zurück. Wird lokal im Browser gespeichert, nirgendwo hochgeladen. |
| Kalender-Einbettung | Hier einen `<iframe>`-Embed-Schnipsel einfügen, um einen Kalender anzuzeigen; leer lassen, um das Kalender-Widget komplett auszublenden. |
| Radio-Player anzeigen | Schaltet den schwebenden Radio-Button/das Panel um. |
| TuneIn Sender-ID | Die Sender-ID aus der URL eines TuneIn-Senders, z. B. `s34682` aus `tunein.com/radio/.../s34682`. |
| Meeting Quick-Join anzeigen | Schaltet Meeting-Button, -Modal und die Beitreten-Karte um. |
| Pomodoro-Timer anzeigen | Schaltet Pomodoro-Button/-Panel um und stoppt dessen Hintergrund-Alarm. |
| Arbeitsdauer (Min.) | Länge einer Arbeitsphase. |
| Kurze Pause (Min.) | Länge einer kurzen Pause, nach jeder Arbeitsphase außer der letzten eines Zyklus. |
| Lange Pause (Min.) | Länge der langen Pause nach der eingestellten Rundenzahl. |
| Runden bis lange Pause | Wie viele Arbeitsphasen einen Zyklus bilden, bevor eine lange Pause folgt. |

Die Meetings selbst werden über ein eigenes Modal verwaltet (der kalenderförmige Button unten
links): Name, Meeting-Typ (Zoom oder MS Teams), vollständiger Beitritts-Link, optionales Passwort,
Start-/Endzeit sowie entweder ein Wochentag (wöchentlich wiederkehrend) oder ein konkretes Datum
(einmalig).

## Berechtigungen erklärt

- **`bookmarks`** – Lesezugriff auf die Lesezeichenleiste, für das Lesezeichen-Widget.
- **`favicon`** – erlaubt das Abrufen bereits gecachter Favicons aus dem lokalen Favicon-Speicher
  von Chromium, statt sie erneut herunterzuladen.
- **`storage`** – speichert Einstellungen und Meetings über `chrome.storage.sync` (synchronisiert
  über angemeldete Browser-Profile).
- **`unlimitedStorage`** – hebt das Standard-Kontingent an, damit ein hochgeladenes
  Hintergrundbild (als Data-URL durchaus einige MB groß) problemlos in `chrome.storage.local`
  passt.
- **`alarms`** – erlaubt dem Hintergrund-Service-Worker, den genauen Zeitpunkt für das Ende einer
  Pomodoro-Phase zu planen (`chrome.alarms`), sodass der Timer auch ohne offenen Dashboard-Tab
  oder Popup-Fenster zuverlässig weiterläuft und benachrichtigt.
- **`notifications`** – erlaubt dem Hintergrund-Service-Worker, bei Ende einer Pomodoro-Phase eine
  Browser-Benachrichtigung anzuzeigen.

## Datenschutz

Sämtliche Konfiguration und Daten (Einstellungen, Meetings, Hintergrundbild) bleiben im
`chrome.storage` des eigenen Browsers – nichts wird an einen Server dieses Projekts gesendet. Die
einzigen ausgehenden Anfragen sind die, die man von den Features ohnehin erwartet: die gewählte
Suchmaschine bei einer Suche, die selbst konfigurierten Kalender-/Radio-iframes sowie
Favicon-Abfragen gegen den lokalen Cache von Chromium.

## Entwicklung

Reines HTML/CSS/JS, kein Build-Schritt:

- `index.html` – Seitenstruktur und Widget-Markup.
- `src/dashboard.js` – sämtliches Dashboard-Verhalten (Einstellungen, Lesezeichen, Suche, Kalender,
  Radio, Meetings, Uhr).
- `src/i18n.js` – das Deutsch/Englisch-Übersetzungswörterbuch und der `t()`-Helfer.
- `src/dashboard.css` – Styling (gemeinsam genutzt von `index.html` und `pomodoro.html`).
- `pomodoro.html` + `src/pomodoro-window.js` – das eigenständige Pomodoro-Popup-Fenster.
- `src/pomodoro-ui.js` – Rendering/Steuerung des Pomodoro-Widgets, gemeinsam genutzt vom
  Dashboard-Panel und dem Popup-Fenster (beide sind "dumme" Clients – siehe unten).
- `src/pomodoro-logic.js` – reine Pomodoro-Zustandslogik ohne DOM-/`chrome.*`-Abhängigkeit,
  gemeinsam genutzt vom Hintergrund-Service-Worker und beiden Seiten.
- `src/background.js` – Hintergrund-Service-Worker; alleinige Quelle der Wahrheit für den
  Pomodoro-Timer über `chrome.alarms`, läuft dadurch unabhängig von offenen Seiten weiter.
- `manifest.json` – Extension-Manifest (Manifest V3).

Um einen UI-Text zu ergänzen: einen Key sowohl unter `de` als auch `en` in `src/i18n.js`
hinzufügen, dann entweder ein `data-i18n="euer.key"`-Attribut am Element in `index.html` ergänzen
(für statischen Text; `data-i18n-title`/`data-i18n-placeholder` für Attribute), oder für dynamisch
gerenderte Inhalte direkt `t("euer.key")` in `dashboard.js` aufrufen.
