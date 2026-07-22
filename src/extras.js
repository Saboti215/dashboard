/**
 * Four small, independently toggleable "extra info" features: weather, public holidays, the quote
 * of the day, and a world clock. Each has its own loadX(settings) entry point, called from
 * src/dashboard.js's ready()/settings-save flow exactly like loadRadio()/loadCalendar()/
 * loadMeetings() — same feature-hidden toggling, same re-render-on-language-change pattern.
 *
 * Weather and holidays are the only new outbound network requests in the whole extension; both
 * Open-Meteo and Nager.Date are free, keyless, and support CORS for direct browser calls, so no
 * extra manifest permission is needed. Both are cached in chrome.storage.local to avoid re-fetching
 * on every single page load. The quote of the day is bundled offline (src/quotes-data.js) on
 * purpose — no network dependency, no rate limits, always available even offline.
 */

// ---------------------------------------------------------------------------------------------
// Weather (Open-Meteo — https://open-meteo.com, free, no API key, no tracking)
// ---------------------------------------------------------------------------------------------

const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Maps Open-Meteo's WMO weather codes to a small icon key + i18n condition label.
const WEATHER_CODE_MAP = {
    0: { icon: "sun", label: "clear" },
    1: { icon: "sun", label: "mostlyClear" },
    2: { icon: "cloudSun", label: "partlyCloudy" },
    3: { icon: "cloud", label: "overcast" },
    45: { icon: "fog", label: "fog" },
    48: { icon: "fog", label: "fog" },
    51: { icon: "drizzle", label: "drizzle" },
    53: { icon: "drizzle", label: "drizzle" },
    55: { icon: "drizzle", label: "drizzle" },
    61: { icon: "rain", label: "rain" },
    63: { icon: "rain", label: "rain" },
    65: { icon: "rain", label: "heavyRain" },
    71: { icon: "snow", label: "snow" },
    73: { icon: "snow", label: "snow" },
    75: { icon: "snow", label: "heavySnow" },
    80: { icon: "rain", label: "showers" },
    81: { icon: "rain", label: "showers" },
    82: { icon: "rain", label: "heavyShowers" },
    95: { icon: "storm", label: "thunderstorm" },
    96: { icon: "storm", label: "thunderstorm" },
    99: { icon: "storm", label: "thunderstorm" }
};

const WEATHER_ICONS = {
    sun: '<circle cx="12" cy="12" r="4"/><path stroke-linecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    cloudSun: '<path stroke-linecap="round" stroke-linejoin="round" d="M9.5 3v1.5M4.6 5.6l1.06 1.06M3 11h1.5M15.5 8.5A4 4 0 019.5 4.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M7 20a4 4 0 110-8 5 5 0 019.9 1.05A3.5 3.5 0 0117 20H7z"/>',
    cloud: '<path stroke-linecap="round" stroke-linejoin="round" d="M7 19a4 4 0 110-8 5 5 0 019.9 1.05A3.5 3.5 0 0117 19H7z"/>',
    fog: '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13a4 4 0 114-4.9M3 17h18M3 21h18"/>',
    drizzle: '<path stroke-linecap="round" stroke-linejoin="round" d="M7 15a4 4 0 110-8 5 5 0 019.9 1.05A3.5 3.5 0 0117 15H7z"/><path stroke-linecap="round" d="M8 19v1M12 19v1M16 19v1"/>',
    rain: '<path stroke-linecap="round" stroke-linejoin="round" d="M7 14a4 4 0 110-8 5 5 0 019.9 1.05A3.5 3.5 0 0117 14H7z"/><path stroke-linecap="round" d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
    snow: '<path stroke-linecap="round" stroke-linejoin="round" d="M7 14a4 4 0 110-8 5 5 0 019.9 1.05A3.5 3.5 0 0117 14H7z"/><path stroke-linecap="round" d="M8 19v2M12 19v2M16 19v2M7 21h1M11 21h1M15 21h1"/>',
    storm: '<path stroke-linecap="round" stroke-linejoin="round" d="M7 13a4 4 0 110-8 5 5 0 019.9 1.05A3.5 3.5 0 0117 13H7z"/><path stroke-linecap="round" stroke-linejoin="round" d="M13 15l-3 4h3l-2 4"/>'
};

function loadWeather(settings) {
    const location = (settings.weatherLocation || "").trim();
    const enabled = !!location;
    $("#weather-widget").toggleClass("feature-hidden", !enabled);
    updateTodayCardVisibility(settings);
    if (!enabled) return;

    getWeatherCache(cache => {
        const fresh = cache && cache.query === location && (Date.now() - cache.fetchedAt) < WEATHER_CACHE_TTL_MS;
        if (fresh) {
            renderWeather(cache);
            return;
        }

        renderWeatherLoading();
        fetchWeather(location)
            .then(data => {
                saveWeatherCache(data);
                renderWeather(data);
            })
            .catch(() => renderWeatherError());
    });
}

function getWeatherCache(cb) {
    if (typeof chrome === "undefined" || !chrome.storage) { cb(null); return; }
    chrome.storage.local.get({ weatherCache: null }, data => cb(data.weatherCache));
}

function saveWeatherCache(data) {
    if (typeof chrome === "undefined" || !chrome.storage) return;
    chrome.storage.local.set({ weatherCache: data });
}

async function fetchWeather(location) {
    const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geoUrl.searchParams.set("name", location);
    geoUrl.searchParams.set("count", "1");
    geoUrl.searchParams.set("language", getLanguage());

    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    const place = geoData.results && geoData.results[0];
    if (!place) throw new Error("Location not found");

    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.searchParams.set("latitude", place.latitude);
    forecastUrl.searchParams.set("longitude", place.longitude);
    forecastUrl.searchParams.set("current", "temperature_2m,weather_code");
    forecastUrl.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weather_code");
    forecastUrl.searchParams.set("timezone", "auto");

    const forecastRes = await fetch(forecastUrl);
    const forecastData = await forecastRes.json();

    return {
        query: location,
        name: place.name,
        current: forecastData.current,
        daily: forecastData.daily,
        fetchedAt: Date.now()
    };
}

function renderWeatherLoading() {
    $("#weather-icon").html("");
    $("#weather-text").text(t("extras.loading"));
}

function renderWeatherError() {
    $("#weather-icon").html("");
    $("#weather-text").text(t("extras.weather.error"));
}

function renderWeather(data) {
    const code = data.current ? data.current.weather_code : undefined;
    const condition = WEATHER_CODE_MAP[code] || WEATHER_CODE_MAP[3];
    const temp = data.current ? Math.round(data.current.temperature_2m) : null;
    const max = data.daily && data.daily.temperature_2m_max ? Math.round(data.daily.temperature_2m_max[0]) : null;
    const min = data.daily && data.daily.temperature_2m_min ? Math.round(data.daily.temperature_2m_min[0]) : null;

    $("#weather-icon").html(
        `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">${WEATHER_ICONS[condition.icon]}</svg>`
    );

    const parts = [];
    if (temp !== null) parts.push(`${temp}°C`);
    parts.push(t(`extras.weather.condition.${condition.label}`));
    if (min !== null && max !== null) parts.push(`${min}°/${max}°`);

    $("#weather-text").text(`${escapeHtml(data.name)} · ${parts.join(" · ")}`);
}

// ---------------------------------------------------------------------------------------------
// Public holidays (Nager.Date — https://date.nager.at, free, no API key)
// ---------------------------------------------------------------------------------------------

function loadHolidays(settings) {
    const country = (settings.holidayCountry || "").trim().toUpperCase();
    const enabled = !!country;
    $("#holiday-widget").toggleClass("feature-hidden", !enabled);
    updateTodayCardVisibility(settings);
    if (!enabled) return;

    const year = new Date().getFullYear();

    getHolidayCache(cache => {
        const fresh = cache && cache.year === year && cache.country === country;
        if (fresh) {
            renderHolidays(cache.holidays);
            return;
        }

        $("#holiday-text").text(t("extras.loading"));
        fetchHolidays(year, country)
            .then(holidays => {
                saveHolidayCache({ year, country, holidays });
                renderHolidays(holidays);
            })
            .catch(() => $("#holiday-text").text(t("extras.holiday.error")));
    });
}

function getHolidayCache(cb) {
    if (typeof chrome === "undefined" || !chrome.storage) { cb(null); return; }
    chrome.storage.local.get({ holidayCache: null }, data => cb(data.holidayCache));
}

function saveHolidayCache(data) {
    if (typeof chrome === "undefined" || !chrome.storage) return;
    chrome.storage.local.set({ holidayCache: data });
}

async function fetchHolidays(year, country) {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`);
    if (!res.ok) throw new Error("Holiday lookup failed");
    return res.json();
}

function renderHolidays(holidays) {
    const todayStr = formatDateForStorage(new Date());
    const today = holidays.find(h => h.date === todayStr);

    if (today) {
        $("#holiday-text").text(t("extras.holiday.today", { name: today.localName }));
        return;
    }

    const next = holidays
        .filter(h => h.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date))[0];

    if (next) {
        $("#holiday-text").text(t("extras.holiday.next", { name: next.localName, date: formatDateForDisplay(next.date) }));
    } else {
        $("#holiday-text").text(t("extras.holiday.none"));
    }
}

// ---------------------------------------------------------------------------------------------
// Quote of the day — bundled offline (src/quotes-data.js), rotates once per calendar day
// ---------------------------------------------------------------------------------------------

function loadQuote(settings) {
    const enabled = settings.quoteEnabled !== false;
    $("#quote-widget").toggleClass("feature-hidden", !enabled);
    updateTodayCardVisibility(settings);
    if (!enabled) return;

    renderQuote();
}

function renderQuote() {
    const start = new Date(new Date().getFullYear(), 0, 0);
    const diff = Date.now() - start.getTime();
    const dayOfYear = Math.floor(diff / (24 * 60 * 60 * 1000));
    const quote = QUOTES[dayOfYear % QUOTES.length];

    $("#quote-text").text(`"${quote[getLanguage()]}"`);
    $("#quote-author").text(`— ${quote.author}`);
}

// Shows/hides the whole #today-container: only worth showing if at least one of its three parts
// is actually configured/enabled.
function updateTodayCardVisibility(settings) {
    const anyEnabled = !!(settings.weatherLocation || "").trim()
        || !!(settings.holidayCountry || "").trim()
        || settings.quoteEnabled !== false;
    $("#today-container").toggleClass("feature-hidden", !anyEnabled);
}

// ---------------------------------------------------------------------------------------------
// World clock — extra timezones next to the local time, fully offline (Intl.DateTimeFormat)
// ---------------------------------------------------------------------------------------------

// Labels are deliberately the common international (English) city names in both UI languages —
// they're all widely recognized either way, and it avoids needing per-city translations.
const WORLD_CLOCK_ZONES = {
    los_angeles: { label: "Los Angeles", zone: "America/Los_Angeles" },
    new_york: { label: "New York", zone: "America/New_York" },
    sao_paulo: { label: "São Paulo", zone: "America/Sao_Paulo" },
    london: { label: "London", zone: "Europe/London" },
    berlin: { label: "Berlin", zone: "Europe/Berlin" },
    paris: { label: "Paris", zone: "Europe/Paris" },
    moscow: { label: "Moscow", zone: "Europe/Moscow" },
    cairo: { label: "Cairo", zone: "Africa/Cairo" },
    dubai: { label: "Dubai", zone: "Asia/Dubai" },
    mumbai: { label: "Mumbai", zone: "Asia/Kolkata" },
    bangkok: { label: "Bangkok", zone: "Asia/Bangkok" },
    singapore: { label: "Singapore", zone: "Asia/Singapore" },
    tokyo: { label: "Tokyo", zone: "Asia/Tokyo" },
    sydney: { label: "Sydney", zone: "Australia/Sydney" },
    auckland: { label: "Auckland", zone: "Pacific/Auckland" }
};

// Called both on settings load/save and from the existing 1-second clock interval in
// src/dashboard.js (loadClock()), so the extra timezones tick along with the main clock.
function loadWorldClock(settings) {
    renderWorldClockSlot("#world-clock-1", settings.worldClock1);
    renderWorldClockSlot("#world-clock-2", settings.worldClock2);
}

function renderWorldClockSlot(selector, zoneKey) {
    const zone = WORLD_CLOCK_ZONES[zoneKey];
    const el = $(selector);

    if (!zone) {
        el.addClass("feature-hidden").empty();
        return;
    }

    // Hardcoded to "de-DE" (24h format) to match the main clock (getClockTime() in
    // src/dashboard.js), which always shows 24h regardless of the UI language.
    const time = new Intl.DateTimeFormat("de-DE", {
        timeZone: zone.zone,
        hour: "2-digit",
        minute: "2-digit"
    }).format(new Date());

    el.removeClass("feature-hidden").text(`${zone.label} · ${time}`);
}
