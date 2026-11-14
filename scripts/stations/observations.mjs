import { load } from 'cheerio';

export const MAX_AGE_MS = 30 * 60 * 1000;
export const MAX_FUTURE_MS = 5 * 60 * 1000;

function numberAttribute(element, attribute) {
  const raw = element.attr(attribute)?.trim();
  if (!raw || !/^-?\d+(?:\.\d+)?$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function parseStationPage(html, stationId, checkedAt = new Date()) {
  const document = load(html);
  const status = document('pws-status');
  const wind = document('wind-widget-view');
  if (status.length !== 1 || wind.length !== 1 ||
      status.attr('data-pws-id') !== stationId || wind.attr('data-pws-id') !== stationId) {
    throw new Error('Station page or wind widget unavailable');
  }

  const rawTime = status.attr('data-obs-time-utc');
  const timeMs = rawTime ? Date.parse(rawTime) : NaN;
  if (!Number.isFinite(timeMs) || !/GMT\+0000\b/.test(rawTime)) {
    throw new Error('Missing or invalid UTC observation time');
  }
  if (wind.attr('data-unit') !== 'm') throw new Error('Expected metric wind units');
  const speed = numberAttribute(wind, 'data-wind-speed');
  const gust = numberAttribute(wind, 'data-wind-gust');
  const direction = numberAttribute(wind, 'data-wind-dir');
  if (speed === null || speed < 0 || speed > 250 ||
      (gust !== null && (gust < 0 || gust > 300)) ||
      (direction !== null && (direction < 0 || direction > 360))) {
    throw new Error('Missing or invalid wind data');
  }

  const ageMs = checkedAt.getTime() - timeMs;
  const connected = status.attr('data-status') === 'connected' && wind.attr('data-status') === 'connected';
  return {
    station_id: stationId,
    source: 'Weather Underground public station page',
    source_url: `https://www.wunderground.com/dashboard/pws/${stationId}`,
    observed_at: new Date(timeMs).toISOString(),
    checked_at: checkedAt.toISOString(),
    age_seconds: Math.round(ageMs / 1000),
    status: !connected ? 'disconnected' : ageMs < -MAX_FUTURE_MS ? 'future' : ageMs > MAX_AGE_MS ? 'stale' : 'recent',
    wind_speed_kmh: speed,
    wind_gust_kmh: gust,
    wind_from_degrees: direction === 360 ? 0 : direction,
  };
}