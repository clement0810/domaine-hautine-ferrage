import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const MAX_TIME_DIFFERENCE_MS = 30 * 60 * 1000;
const MIN_DIRECTION_SPEED_KMH = 5;

export function compareSnapshots(stationSnapshot, forecast) {
  if (!Array.isArray(stationSnapshot?.observations) || !forecast ||
      !Number.isFinite(forecast.wind_speed_kmh) || forecast.wind_speed_kmh < 0 ||
      !Number.isFinite(forecast.wind_from_degrees) || forecast.wind_from_degrees < 0 || forecast.wind_from_degrees > 360 ||
      !Number.isFinite(Date.parse(forecast.valid_at_utc))) throw new Error('Invalid snapshot or forecast');
  const forecastTime = Date.parse(forecast.valid_at_utc);
  return {
    forecast_valid_at: forecast.valid_at_utc,
    disclaimer: 'Station and regional forecast comparison only; not validation of wind at any post.',
    stations: stationSnapshot.observations.map(observation => {
      const observedTime = Date.parse(observation.observed_at);
      const timeDifferenceMinutes = (observedTime - forecastTime) / 60000;
      const usable = observation.status === 'recent' && Number.isFinite(observedTime) &&
        Math.abs(observedTime - forecastTime) <= MAX_TIME_DIFFERENCE_MS &&
        Number.isFinite(observation.wind_speed_kmh) && observation.wind_speed_kmh >= 0;
      const directionUsable = usable && observation.wind_speed_kmh >= MIN_DIRECTION_SPEED_KMH &&
        forecast.wind_speed_kmh >= MIN_DIRECTION_SPEED_KMH && Number.isFinite(observation.wind_from_degrees) &&
        observation.wind_from_degrees >= 0 && observation.wind_from_degrees <= 360;
      return {
        station_id: observation.station_id,
        observed_at: observation.observed_at ?? null,
        status_at_collection: observation.status,
        time_difference_minutes: Number.isFinite(timeDifferenceMinutes) ? Math.round(timeDifferenceMinutes * 10) / 10 : null,
        comparable: usable,
        speed_difference_kmh: usable ? Math.round((observation.wind_speed_kmh - forecast.wind_speed_kmh) * 10) / 10 : null,
        direction_difference_degrees: directionUsable
          ? ((observation.wind_from_degrees - forecast.wind_from_degrees + 540) % 360) - 180 : null,
      };
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node compare.mjs station-observations.json forecast.json');
    const stations = JSON.parse(await readFile(process.argv[2], 'utf8'));
    const forecast = JSON.parse(await readFile(process.argv[3], 'utf8'));
    console.log(JSON.stringify(compareSnapshots(stations, forecast), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}