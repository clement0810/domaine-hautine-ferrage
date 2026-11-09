import { clipPolyline } from "./vendor/lineclip/index.js";

export const MAP_CENTER = Object.freeze({
  longitude: 4.9790,
  latitude: 50.1666,
});

export const MAP_BOUNDS = Object.freeze({
  west: 4.95611,
  south: 50.1518,
  east: 5.00187,
  north: 50.1815,
});

function imageryTileBounds(bounds, zoom) {
  const tileCount = 2 ** zoom;
  const tileX = (longitude) => (longitude + 180) / 360 * tileCount;
  const tileY = (latitude) => (1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2 * tileCount;
  const longitude = (tile) => tile / tileCount * 360 - 180;
  const latitude = (tile) => Math.atan(Math.sinh(Math.PI * (1 - 2 * tile / tileCount))) * 180 / Math.PI;
  return [
    longitude(Math.floor(tileX(bounds.west))),
    latitude(Math.ceil(tileY(bounds.south))),
    longitude(Math.ceil(tileX(bounds.east))),
    latitude(Math.floor(tileY(bounds.north))),
  ];
}

const statusElement = document.querySelector("#map-status");
const setStatus = (message) => {
  statusElement.textContent = message;
};
const featureSheet = document.querySelector("#feature-bottom-sheet");
const featureSheetTitle = document.querySelector("#bottom-sheet-title");
const featureSheetContent = document.querySelector("#bottom-sheet-content");
const featureSheetGrabber = document.querySelector(".bottom-sheet-grabber");
const featureSheetHeader = document.querySelector(".bottom-sheet-header");

function featureSheetHeightLimits() {
  const minimum = featureSheetGrabber.offsetHeight + featureSheetHeader.offsetHeight + 24;
  const bottom = parseFloat(getComputedStyle(featureSheet).bottom) || 0;
  const maximum = Math.max(minimum, Math.min(window.innerHeight * 0.8, window.innerHeight - bottom - 12));
  return { minimum, maximum };
}

function resizeFeatureSheet(height) {
  const { minimum, maximum } = featureSheetHeightLimits();
  const nextHeight = Math.max(minimum, Math.min(maximum, height));
  featureSheet.style.setProperty("--sheet-height", `${nextHeight}px`);
}

new ResizeObserver(() => {
  const { minimum, maximum } = featureSheetHeightLimits();
  const value = (featureSheet.offsetHeight - minimum) / (maximum - minimum || 1) * 100;
  featureSheetGrabber.setAttribute("aria-valuenow", String(Math.round(Math.max(0, Math.min(100, value)))));
}).observe(featureSheet);

let sheetDrag = null;
featureSheetGrabber.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  sheetDrag = { pointerId: event.pointerId, startY: event.clientY, height: featureSheet.getBoundingClientRect().height };
  featureSheetGrabber.setPointerCapture(event.pointerId);
});
featureSheetGrabber.addEventListener("pointermove", (event) => {
  if (sheetDrag?.pointerId !== event.pointerId) return;
  resizeFeatureSheet(sheetDrag.height + sheetDrag.startY - event.clientY);
});
featureSheetGrabber.addEventListener("lostpointercapture", () => { sheetDrag = null; });
featureSheetGrabber.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  resizeFeatureSheet(featureSheet.getBoundingClientRect().height + (event.key === "ArrowUp" ? 40 : -40));
});

const weatherElements = {
  banner: document.querySelector("#weather-banner"),
  updated: document.querySelector("#weather-updated"),
  error: document.querySelector("#weather-error"),
  icon: document.querySelector("#current-icon"),
  temperature: document.querySelector("#current-temperature"),
  description: document.querySelector("#current-description"),
  wind: document.querySelector("#current-wind"),
  direction: document.querySelector("#current-direction"),
  sunrise: document.querySelector("#sunrise"),
  sunset: document.querySelector("#sunset"),
  dawn: document.querySelector("#dawn"),
  twilight: document.querySelector("#twilight"),
  hourly: document.querySelector("#hourly-forecast"),
  forecast: document.querySelector("#forecast-table-body"),
};

const weatherUrl = "https://api.open-meteo.com/v1/forecast?latitude=50.1666&longitude=4.9790&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,weather_code,wind_speed_10m,rain&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,weather_code&timezone=Europe%2FBrussels&forecast_days=3";
const weatherCacheKey = "hautine_weather_cache";

function describeWeather(code) {
  if (code === 0) return "Onbewolkt";
  if (code === 1) return "Overwegend helder";
  if (code === 2) return "Gedeeltelijk bewolkt";
  if (code === 3) return "Bewolkt";
  if (code === 45 || code === 48) return "Mist";
  if (code >= 51 && code <= 57) return "Motregen";
  if (code >= 61 && code <= 67) return "Regen";
  if (code >= 71 && code <= 77) return "Sneeuw";
  if (code >= 80 && code <= 82) return "Regenbuien";
  if (code === 85 || code === 86) return "Sneeuwbuien";
  if (code >= 95 && code <= 99) return "Onweer";
  return "Weerbeeld onbekend";
}

function getWeatherSvg(code, isNight = false) {
  let iconClass;
  let paths;

  if (code === 0 || code === 1) {
    if (isNight) {
      iconClass = "weather-svg-moon";
      paths = '<path d="M20.3 15.1A8.5 8.5 0 0 1 8.9 3.7 8.6 8.6 0 1 0 20.3 15.1Z"/>';
    } else {
      iconClass = "weather-svg-sun";
      paths = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>';
    }
  } else if (code === 2 || code === 3) {
    iconClass = "weather-svg-cloud";
    paths = '<path d="M7 18h10.5a4.5 4.5 0 0 0 .4-9A6.5 6.5 0 0 0 5.2 10.5 3.8 3.8 0 0 0 7 18Z"/>';
  } else if (code === 45 || code === 48) {
    iconClass = "weather-svg-fog";
    paths = '<path d="M7 13h10.5a4.5 4.5 0 0 0 .4-9A6.5 6.5 0 0 0 5.2 5.5 3.8 3.8 0 0 0 7 13Zm-3 4h16m-14 3h12"/>';
  } else if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    iconClass = "weather-svg-snow";
    paths = '<path d="M7 12h10.5a4.5 4.5 0 0 0 .4-9A6.5 6.5 0 0 0 5.2 4.5 3.8 3.8 0 0 0 7 12Zm1 4v5m-2.2-3.8 4.4 2.6m0-2.6-4.4 2.6m10.2-3.8v5m-2.2-3.8 4.4 2.6m0-2.6-4.4 2.6"/>';
  } else if (code >= 95 && code <= 99) {
    iconClass = "weather-svg-storm";
    paths = '<path d="M7 13h10.5a4.5 4.5 0 0 0 .4-9A6.5 6.5 0 0 0 5.2 5.5 3.8 3.8 0 0 0 7 13Zm5-1-3 5h3l-1 5 5-7h-3l2-3"/>';
  } else {
    iconClass = "weather-svg-rain";
    paths = '<path d="M7 12h10.5a4.5 4.5 0 0 0 .4-9A6.5 6.5 0 0 0 5.2 4.5 3.8 3.8 0 0 0 7 12Zm1 3-1 2m6-2-1 2m6-2-1 2m-9 3-1 1m6-1-1 1"/>';
  }

  return `<svg class="weather-svg ${iconClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function windDirection(degrees) {
  if (!Number.isFinite(degrees)) return "Onbekend";
  const directions = ["N", "NNO", "NO", "ONO", "O", "OZO", "ZO", "ZZO", "Z", "ZZW", "ZW", "WZW", "W", "WNW", "NW", "NNW"];
  return directions[Math.round(degrees / 22.5) % directions.length];
}

function markerColorForFeature(feature) {
  const properties = feature.properties ?? {};
  if (properties.type === "parking") return "#3b82f6";
  if (properties.type === "stand") {
    const name = String(properties.name ?? "").trim().toUpperCase();
    if (name.endsWith("L")) return "#eab308";
    if (name.endsWith("H")) return "#22c55e";
  }
  return "#ef4444";
}

const DEFAULT_WIND_FROM_DEGREES = 270;
const EARTH_RADIUS_METERS = 6371008.8;

function readCachedWind() {
  try {
    const stored = JSON.parse(localStorage.getItem(weatherCacheKey));
    const data = stored?.data ?? stored;
    const direction = data?.current?.wind_direction_10m;
    const speed = data?.current?.wind_speed_10m;
    const hasDirection = Number.isFinite(direction);
    return {
      from: hasDirection ? direction : DEFAULT_WIND_FROM_DEGREES,
      to: ((hasDirection ? direction : DEFAULT_WIND_FROM_DEGREES) + 180) % 360,
      speed: Number.isFinite(speed) ? speed : null,
      fetchedAt: stored?.timestamp ?? data?.fetched_at ?? null,
      isDefault: !hasDirection,
    };
  } catch {
    return {
      from: DEFAULT_WIND_FROM_DEGREES,
      to: (DEFAULT_WIND_FROM_DEGREES + 180) % 360,
      speed: null,
      fetchedAt: null,
      isDefault: true,
    };
  }
}

function destinationPoint(longitude, latitude, bearingDegrees, distanceMeters) {
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = bearingDegrees * Math.PI / 180;
  const latitude1 = latitude * Math.PI / 180;
  const longitude1 = longitude * Math.PI / 180;
  const latitude2 = Math.asin(
    Math.sin(latitude1) * Math.cos(angularDistance)
      + Math.cos(latitude1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const longitude2 = longitude1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude1),
    Math.cos(angularDistance) - Math.sin(latitude1) * Math.sin(latitude2),
  );
  return [longitude2 * 180 / Math.PI, latitude2 * 180 / Math.PI];
}

function createScentConeGeometry(coordinates, downwindBearing, radiusMeters = 100) {
  const [longitude, latitude] = coordinates;
  const origin = [longitude, latitude];

  function sectorFeature(sector, startBearing, arcWidth, arcSegments) {
    const ring = [origin];
    for (let segment = 0; segment <= arcSegments; segment += 1) {
      const bearing = startBearing + arcWidth * segment / arcSegments;
      ring.push(destinationPoint(longitude, latitude, bearing, radiusMeters));
    }
    ring.push(origin);
    return {
      type: "Feature",
      properties: { sector },
      geometry: { type: "Polygon", coordinates: [ring] },
    };
  }

  return {
    type: "FeatureCollection",
    features: [
      sectorFeature("hazard", downwindBearing - 15, 30, 12),
      sectorFeature("safe", downwindBearing + 15, 330, 66),
    ],
  };
}

const EMPTY_SCENT_CONE = { type: "FeatureCollection", features: [] };
function clearScentCone() {
  map.getSource("scent-cone-source")?.setData(EMPTY_SCENT_CONE);
}

function showScentCone(feature, wind) {
  const coordinates = feature.geometry.coordinates;
  map.getSource("scent-cone-source")?.setData(createScentConeGeometry(coordinates, wind.to));
}

function shiftTime(time, minutes) {
  if (!time) return "--";
  const [hour, minute] = time.split("T")[1].split(":").map(Number);
  const shiftedMinutes = (hour * 60 + minute + minutes + 1440) % 1440;
  return `${String(Math.floor(shiftedMinutes / 60)).padStart(2, "0")}:${String(shiftedMinutes % 60).padStart(2, "0")}`;
}

function formatForecastDate(date) {
  return new Intl.DateTimeFormat("nl-BE", { weekday: "long", day: "numeric", month: "short", timeZone: "Europe/Brussels" }).format(new Date(`${date}T12:00:00`));
}

function isNightAt(time, daily) {
  if (!time || !daily?.time || !daily?.sunrise || !daily?.sunset) return false;
  const date = time.slice(0, 10);
  const dayIndex = daily.time.indexOf(date);
  if (dayIndex < 0 || !daily.sunrise[dayIndex] || !daily.sunset[dayIndex]) return false;
  return time < daily.sunrise[dayIndex] || time >= daily.sunset[dayIndex];
}

function renderWeather(data, fetchedAt, offline = false) {
  const current = data.current;
  const hourly = data.hourly;
  const daily = data.daily;
  const currentCode = Number(current.weather_code);
  const currentWeather = describeWeather(currentCode);
  weatherElements.icon.innerHTML = getWeatherSvg(currentCode, isNightAt(current.time, daily));
  weatherElements.temperature.textContent = `${Math.round(current.temperature_2m)}°C`;
  weatherElements.description.textContent = currentWeather;
  weatherElements.wind.textContent = `${Math.round(current.wind_speed_10m)} km/u`;
  weatherElements.direction.textContent = `${windDirection(current.wind_direction_10m)} (${Math.round(current.wind_direction_10m)}°)`;
  weatherElements.sunrise.textContent = daily.sunrise?.[0]?.slice(-5) ?? "--";
  weatherElements.sunset.textContent = daily.sunset?.[0]?.slice(-5) ?? "--";
  weatherElements.dawn.textContent = shiftTime(daily.sunrise?.[0], -30);
  weatherElements.twilight.textContent = shiftTime(daily.sunset?.[0], 30);
  weatherElements.updated.textContent = `Bijgewerkt: ${new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(fetchedAt))}`;

  weatherElements.hourly.replaceChildren();
  const currentHour = current.time.slice(0, 13);
  const exactStart = hourly.time.findIndex((time) => time.slice(0, 13) === currentHour);
  const startIndex = exactStart >= 0
    ? exactStart
    : hourly.time.findIndex((time) => time >= current.time);
  const endIndex = Math.min(startIndex + 12, hourly.time.length - 1);
  for (let index = startIndex; startIndex >= 0 && index <= endIndex; index += 1) {
    const time = hourly.time[index];
    const item = document.createElement("article");
    item.className = "hourly-item";
    item.setAttribute("role", "listitem");
    const timeLabel = document.createElement("span");
    timeLabel.className = "hourly-time";
    timeLabel.textContent = time.slice(11, 16);
    const icon = document.createElement("span");
    icon.className = "hourly-icon";
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", describeWeather(Number(hourly.weather_code[index])));
    icon.innerHTML = getWeatherSvg(Number(hourly.weather_code[index]), isNightAt(time, daily));
    const temperature = document.createElement("strong");
    temperature.className = "hourly-temperature";
    temperature.textContent = `${Math.round(hourly.temperature_2m[index])}°`;
    const wind = document.createElement("span");
    wind.className = "hourly-wind";
    wind.textContent = `${Math.round(hourly.wind_speed_10m[index])} km/u`;
    item.append(timeLabel, icon, temperature, wind);
    const rainAmount = Number(hourly.rain?.[index] ?? 0);
    if (rainAmount > 0) {
      const rain = document.createElement("span");
      rain.className = "hourly-rain";
      rain.textContent = `${rainAmount.toLocaleString("nl-BE", { maximumFractionDigits: 1 })} mm`;
      item.append(rain);
    }
    weatherElements.hourly.append(item);
  }

  weatherElements.forecast.replaceChildren();
  for (let index = 1; index <= 2; index += 1) {
    const tableRow = document.createElement("tr");
    const day = document.createElement("strong");
    day.textContent = formatForecastDate(daily.time[index]);
    const dayCell = document.createElement("th");
    dayCell.scope = "row";
    dayCell.append(day);

    const weatherCell = document.createElement("td");
    weatherCell.className = "forecast-weather";
    const weatherCode = Number(daily.weather_code[index]);
    const weatherIcon = document.createElement("span");
    weatherIcon.className = "weather-pictogram";
    weatherIcon.innerHTML = getWeatherSvg(weatherCode);
    weatherCell.append(weatherIcon, describeWeather(weatherCode));

    const temperaturesCell = document.createElement("td");
    temperaturesCell.textContent = `${Math.round(daily.temperature_2m_max[index])}° / ${Math.round(daily.temperature_2m_min[index])}°C`;

    const dailyWinds = hourly.time
      .map((time, hourIndex) => time.startsWith(daily.time[index]) ? Number(hourly.wind_speed_10m[hourIndex]) : NaN)
      .filter(Number.isFinite);
    const windCell = document.createElement("td");
    windCell.className = "forecast-wind";
    windCell.textContent = dailyWinds.length
      ? `max. ${Math.round(Math.max(...dailyWinds))} km/u`
      : "Onbekend";

    tableRow.append(dayCell, weatherCell, temperaturesCell, windCell);
    weatherElements.forecast.append(tableRow);
  }

  weatherElements.banner.hidden = !offline;
  if (offline) {
    const timestamp = new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(fetchedAt));
    weatherElements.banner.textContent = `Offline modus: Toont opgeslagen gegevens van ${timestamp}`;
  }
  weatherElements.error.hidden = true;
}

async function loadWeather() {
  try {
    const response = await fetch(weatherUrl);
    if (!response.ok) throw new Error(`Weerbericht ophalen mislukt (${response.status})`);
    const data = await response.json();
    data.fetched_at = new Date().toISOString();
    localStorage.setItem(weatherCacheKey, JSON.stringify(data));
    renderWeather(data, data.fetched_at);
  } catch (error) {
    try {
      const cached = JSON.parse(localStorage.getItem(weatherCacheKey));
      const cachedData = cached?.data ?? cached;
      const fetchedAt = cached?.timestamp ?? cached?.fetched_at;
      if (!cachedData?.current || !cachedData?.hourly || !cachedData?.daily || !fetchedAt) {
        throw new Error("Geen opgeslagen weerbericht gevonden.");
      }
      renderWeather(cachedData, fetchedAt, true);
    } catch (cacheError) {
      weatherElements.error.textContent = `Weer niet beschikbaar. ${cacheError.message || error.message}`;
      weatherElements.error.hidden = false;
    }
  }
}

function selectView(view) {
  const showWeather = view === "weather";
  document.querySelector("#map").hidden = showWeather;
  document.querySelector("#weather-panel").hidden = !showWeather;
  document.querySelector("#map-tab").setAttribute("aria-selected", String(!showWeather));
  document.querySelector("#weather-tab").setAttribute("aria-selected", String(showWeather));
  if (showWeather) {
    hideFeatureSheet();
    loadWeather();
  } else {
    map?.resize();
  }
}

document.querySelector("#map-tab").addEventListener("click", () => selectView("map"));
document.querySelector("#weather-tab").addEventListener("click", () => selectView("weather"));

const protocol = new globalThis.pmtiles.Protocol();
const maplibregl = globalThis.maplibregl;
maplibregl.addProtocol("pmtiles", protocol.tile);

const archiveUrl = new URL("./data/hautine_full.pmtiles", document.baseURI).href;
const map = new maplibregl.Map({
  container: "map",
  center: [MAP_CENTER.longitude, MAP_CENTER.latitude],
  zoom: 12,
  minZoom: 12,
  maxZoom: 17,
  attributionControl: false,
  style: {
    version: 8,
    sources: {
      territory: {
        type: "raster",
        url: `pmtiles://${archiveUrl}`,
        tileSize: 256,
        attribution: "© SPW Wallonie",
      },
    },
    layers: [{ id: "territory-imagery", type: "raster", source: "territory" }],
  },
});

const themeToggle = document.querySelector("#theme-toggle");
const themeStorageKey = "hautine_dark_mode";
let darkMode = false;
try {
  darkMode = localStorage.getItem(themeStorageKey) === "true";
} catch (error) {
  console.warn("Theme preference unavailable:", error);
}

function applyTheme() {
  document.body.classList.toggle("dark-mode", darkMode);
  const label = darkMode ? "Nachtmodus uitschakelen" : "Nachtmodus inschakelen";
  themeToggle.setAttribute("aria-label", label);
  themeToggle.setAttribute("aria-pressed", String(darkMode));
  themeToggle.title = label;
  themeToggle.firstElementChild.textContent = darkMode ? "☀" : "☾";
  document.querySelector('meta[name="theme-color"]').content = darkMode ? "#09090b" : "#24352d";
  if (map.getLayer("territory-imagery")) {
    map.setPaintProperty("territory-imagery", "raster-brightness-max", darkMode ? 0.35 : 1);
  }
}

themeToggle.addEventListener("click", () => {
  darkMode = !darkMode;
  try {
    localStorage.setItem(themeStorageKey, String(darkMode));
  } catch (error) {
    console.warn("Theme preference could not be saved:", error);
  }
  applyTheme();
});
applyTheme();
map.on("style.load", applyTheme);

map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showAccuracyCircle: true,
}), "top-right");
map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

const layerMenu = document.querySelector(".layer-menu");
for (const eventType of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click", "dblclick", "wheel"]) {
  layerMenu.addEventListener(eventType, (event) => event.stopPropagation());
}

let featuresLoaded = false;
map.on("error", (event) => {
  console.error("Map error:", event.error);
  if (!featuresLoaded) {
    setStatus(`Kaart laden mislukt: ${event.error?.message ?? "controleer de verbinding en kaartbestanden"}`);
  }
});

function hideFeatureSheet() {
  featureSheet.classList.remove("is-open");
  featureSheet.setAttribute("aria-hidden", "true");
  featureSheet.style.removeProperty("--sheet-height");
  featureSheetContent.replaceChildren();
  featureSheetTitle.textContent = "";
  clearScentCone();
}

document.querySelector("#bottom-sheet-close").addEventListener("click", (event) => {
  event.stopPropagation();
  hideFeatureSheet();
});

function showFeatureSheet(event) {
  const feature = event.features?.[0];
  if (!feature) return;

  const properties = feature.properties ?? {};
  const isStand = properties.type === "stand" && feature.geometry?.type === "Point";
  const isParking = properties.type === "parking" && feature.geometry?.type === "Point";
  if (!isStand && !isParking) {
    hideFeatureSheet();
    return;
  }

  const wind = isStand ? readCachedWind() : null;
  if (isStand) showScentCone(feature, wind);
  else clearScentCone();

  featureSheetTitle.textContent = properties.name ?? "Locatie";
  featureSheetContent.replaceChildren();
  const content = featureSheetContent;
  const type = document.createElement("div");
  type.className = "bottom-sheet-type";
  const standName = String(properties.name ?? "").trim().toUpperCase();
  const isBattuePost = isStand && (standName.endsWith("H") || standName.endsWith("L"));
  type.textContent = isParking ? "Parkeerplaats" : isBattuePost ? "Battue Post" : "Jachtpost / mirador";
  content.append(type);

  if (properties.type === "stand" && properties.image) {
    const image = document.createElement("img");
    image.className = "stand-photo";
    image.src = properties.image;
    image.alt = `${properties.name ?? "Stand"} view`;
    image.addEventListener("error", () => image.remove(), { once: true });
    content.append(image);
  }

  if (isStand) {
    const adviceSection = document.createElement("section");
    adviceSection.className = "wind-advice";
    const adviceHeading = document.createElement("h3");
    adviceHeading.className = "wind-advice-heading";
    adviceHeading.textContent = "Wind & Geuradvies";
    const windSummary = document.createElement("p");
    windSummary.className = "wind-advice-reading";
    const speedText = wind.speed === null ? "snelheid onbekend" : `${Math.round(wind.speed)} km/u`;
    windSummary.textContent = wind.isDefault
      ? `Wind uit ${windDirection(wind.from)} (${Math.round(wind.from)}°), ${speedText} · standaardwaarde`
      : `Wind uit ${windDirection(wind.from)} (${Math.round(wind.from)}°), ${speedText}`;
    const drift = document.createElement("p");
    drift.className = "wind-advice-drift";
    drift.textContent = `Rood: 30° directe geurdrift naar ${windDirection(wind.to)} (${Math.round(wind.to)}°), straal 100 m.`;
    const safeSector = document.createElement("p");
    safeSector.className = "wind-advice-safe";
    safeSector.textContent = "Groen: overige 330° buiten de directe geurdrift.";
    const recommendation = document.createElement("p");
    recommendation.className = "wind-advice-recommendation";
    if (wind.isDefault) {
      recommendation.textContent = "Geen opgeslagen windgegevens; controleer de wind ter plaatse.";
    } else if (wind.speed !== null && wind.speed < 5) {
      recommendation.textContent = "Weinig wind: geur kan onvoorspelbaar verspreiden. Controleer de wind ter plaatse.";
    } else {
      recommendation.textContent = `De groene sector toont mogelijke benaderingsrichtingen. Benader indien mogelijk vanaf de loefzijde (${windDirection(wind.from)}); controleer de wind ter plaatse.`;
    }
    adviceSection.append(adviceHeading, windSummary, drift, safeSector, recommendation);
    content.append(adviceSection);
  }

  if (isParking) {
    const [longitude, latitude] = feature.geometry.coordinates;
    const coordinates = `${latitude},${longitude}`;
    const googleMapsUrl = new URL("https://www.google.com/maps/search/");
    googleMapsUrl.searchParams.set("api", "1");
    googleMapsUrl.searchParams.set("query", coordinates);

    const navigationOptions = document.createElement("div");
    navigationOptions.className = "navigation-options";
    const prompt = document.createElement("span");
    prompt.className = "navigation-options-title";
    prompt.textContent = "Navigeer met Google Maps";
    navigationOptions.append(prompt);

    const link = document.createElement("a");
    link.className = "navigation-option";
    link.href = googleMapsUrl.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open route";
    navigationOptions.append(link);
    content.append(navigationOptions);
  }

  featureSheet.setAttribute("aria-hidden", "false");
  featureSheet.classList.add("is-open");
}

map.on("load", async () => {
  map.resize();
  try {
    setStatus("Kaart geladen. Locaties ophalen...");
    const response = await fetch("./data/hunting-data.geojson");
    if (!response.ok) throw new Error(`Locatiegegevens ophalen mislukt (${response.status})`);
    const featureCollection = await response.json();
    featureCollection.features = featureCollection.features.map((feature) => ({
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        marker_color: markerColorForFeature(feature),
      },
    }));

    map.addSource("hautine-paths", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      attribution: "© OpenStreetMap contributors",
    });
    fetch("./data/paths.geojson")
      .then((response) => {
        if (!response.ok) throw new Error(`Wegen ophalen mislukt (${response.status})`);
        return response.json();
      })
      .then((paths) => {
        const bounds = imageryTileBounds(MAP_BOUNDS, 13);
        paths.features = paths.features.flatMap((feature) => {
          const geometry = feature.geometry;
          const lines = geometry?.type === "LineString" ? [geometry.coordinates]
            : geometry?.type === "MultiLineString" ? geometry.coordinates : [];
          const clipped = lines.flatMap((line) => line.length > 1 ? clipPolyline(line, bounds) : []);
          if (!clipped.length) return [];
          return [{
            ...feature,
            geometry: clipped.length === 1
              ? { type: "LineString", coordinates: clipped[0] }
              : { type: "MultiLineString", coordinates: clipped },
          }];
        });
        map.getSource("hautine-paths").setData(paths);
      })
      .catch((error) => console.error("Path load error:", error));
    const isWaterway = ["any", ["has", "waterway"], ["==", ["get", "natural"], "water"], ["has", "water"]];
    const isRailway = ["in", ["get", "railway"], ["literal", ["rail", "light_rail", "tram", "narrow_gauge", "subway", "funicular", "preserved"]]];
    const isTrack = ["any",
      ["in", ["get", "highway"], ["literal", ["track", "path", "footway", "cycleway", "bridleway", "steps"]]],
      ["in", ["get", "surface"], ["literal", ["unpaved", "dirt", "earth", "ground", "mud", "grass", "gravel", "fine_gravel", "sand"]]],
    ];
    map.addLayer({
      id: "hautine-waterways",
      type: "line",
      source: "hautine-paths",
      filter: isWaterway,
      paint: { "line-color": "#3b82f6", "line-opacity": 0.6, "line-width": 2 },
    });
    map.addLayer({
      id: "hautine-railways",
      type: "line",
      source: "hautine-paths",
      filter: ["all", ["!", isWaterway], isRailway],
      paint: { "line-color": "#111827", "line-opacity": 0.7, "line-width": 2.5, "line-dasharray": [4, 4] },
    });
    map.addLayer({
      id: "hautine-roads",
      type: "line",
      source: "hautine-paths",
      filter: ["all", ["!", isWaterway], ["!", isRailway], ["has", "highway"], ["!", isTrack]],
      paint: { "line-color": "#f8fafc", "line-opacity": 0.7, "line-width": 3 },
    });
    map.addLayer({
      id: "hautine-tracks",
      type: "line",
      source: "hautine-paths",
      filter: ["all", ["!", isWaterway], ["!", isRailway], ["has", "highway"], isTrack],
      paint: { "line-color": "#d97706", "line-opacity": 0.65, "line-width": 2, "line-dasharray": [3, 2] },
    });
    for (const checkbox of document.querySelectorAll("[data-map-layer]")) {
      checkbox.addEventListener("change", () => {
        map.setLayoutProperty(checkbox.dataset.mapLayer, "visibility", checkbox.checked ? "visible" : "none");
      });
      checkbox.disabled = false;
    }
    map.addSource("hunting-data", { type: "geojson", data: featureCollection });
    map.addSource("scent-cone-source", { type: "geojson", data: EMPTY_SCENT_CONE });
    map.addLayer({
      id: "scent-hazard-layer",
      type: "fill",
      source: "scent-cone-source",
      filter: ["==", ["get", "sector"], "hazard"],
      paint: { "fill-color": "rgba(239, 68, 68, 0.25)" },
    });
    map.addLayer({
      id: "scent-hazard-outline",
      type: "line",
      source: "scent-cone-source",
      filter: ["==", ["get", "sector"], "hazard"],
      paint: { "line-color": "#ef4444", "line-width": 2, "line-dasharray": [2, 1.5] },
    });
    map.addLayer({
      id: "scent-safe-layer",
      type: "fill",
      source: "scent-cone-source",
      filter: ["==", ["get", "sector"], "safe"],
      paint: { "fill-color": "rgba(34, 197, 94, 0.2)" },
    });
    map.addLayer({
      id: "scent-safe-outline",
      type: "line",
      source: "scent-cone-source",
      filter: ["==", ["get", "sector"], "safe"],
      paint: { "line-color": "#16a34a", "line-width": 1, "line-opacity": 0.65 },
    });
    map.addLayer({
      id: "shooting-zone-fill",
      type: "fill",
      source: "hunting-data",
      filter: ["==", ["get", "type"], "shooting_zone"],
      paint: { "fill-color": "#d6764f", "fill-opacity": 0.2 },
    });
    map.addLayer({
      id: "shooting-zone-outline",
      type: "line",
      source: "hunting-data",
      filter: ["==", ["get", "type"], "shooting_zone"],
      paint: { "line-color": "#a64b34", "line-width": 2 },
    });
    map.addLayer({
      id: "approach-routes",
      type: "line",
      source: "hunting-data",
      filter: ["==", ["get", "type"], "approach_route"],
      paint: { "line-color": "#315940", "line-width": 4, "line-dasharray": [1.5, 1] },
    });
    map.addLayer({
      id: "hunting-dots",
      type: "circle",
      source: "hunting-data",
      filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 5, 17, 9],
        "circle-color": ["get", "marker_color"],
        "circle-stroke-color": "#f9f7ef",
        "circle-stroke-width": 2,
      },
    });

    map.addLayer({
      id: "hunting-labels",
      type: "symbol",
      source: "hunting-data",
      minzoom: 14,
      filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
      layout: {
        "text-field": ["coalesce", ["get", "name"], ""],
        "text-font": ["Open Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 14, 11, 17, 14],
        "text-offset": [0, 1.15],
        "text-anchor": "top",
        "text-optional": true,
      },
      paint: {
        "text-color": "#202b25",
        "text-halo-color": "#f9f7ef",
        "text-halo-width": 1.5,
      },
    });

    for (const layerId of ["hunting-dots", "hunting-labels", "approach-routes", "shooting-zone-fill", "shooting-zone-outline"]) {
      map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
    }

    map.on("click", (event) => {
      const features = map.queryRenderedFeatures(event.point, {
        layers: ["hunting-dots", "hunting-labels"],
      });
      const pointFeature = features.find((feature) => ["stand", "parking"].includes(feature.properties?.type));
      if (pointFeature) showFeatureSheet({ features: [pointFeature], lngLat: event.lngLat });
      else hideFeatureSheet();
    });

    featuresLoaded = true;
    setStatus(`Kaart gereed · ${featureCollection.features.length} locaties`);
  } catch (error) {
    console.error("Feature load error:", error);
    setStatus(`Locaties laden mislukt: ${error.message}`);
  }
});