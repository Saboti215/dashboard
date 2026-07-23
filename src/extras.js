/**
 * Weather, holidays, and world-clock data helpers — the "extras" row on the dashboard's Today
 * card, plus the world-clock zone table. These are pure data/network functions with no
 * DOM/jQuery/Alpine of their own; src/stores.js's Alpine.store('dashboard') methods
 * (loadWeather/loadHolidays/refreshWorldClockSlot) call into these and write the results into
 * reactive store properties, which index.html's templates bind to directly.
 *
 * Weather and holidays are the only outbound network requests in the whole extension; both
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

// ---------------------------------------------------------------------------------------------
// Public holidays (Nager.Date — https://date.nager.at, free, no API key)
// ---------------------------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------------------------
// World clock zone table — fully offline (Intl.DateTimeFormat); the actual rendering lives in
// src/stores.js's refreshWorldClockSlot(), driven by the 1-second clock tick.
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
