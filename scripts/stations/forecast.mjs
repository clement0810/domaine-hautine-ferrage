const forecastUrl = 'https://api.open-meteo.com/v1/forecast?latitude=50.1666&longitude=4.9790&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=GMT';

try {
  const response = await fetch(forecastUrl, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Forecast HTTP ${response.status}`);
  const data = await response.json();
  const current = data.current;
  if (!current || !Number.isFinite(current.wind_speed_10m) || !Number.isFinite(current.wind_direction_10m) ||
      !current.time || data.utc_offset_seconds !== 0 || data.current_units?.wind_speed_10m !== 'km/h') {
    throw new Error('Invalid forecast response');
  }
  console.log(JSON.stringify({
    source: 'Open-Meteo forecast; not a station observation',
    requested_location: { latitude: 50.1666, longitude: 4.9790 },
    grid_location: { latitude: data.latitude, longitude: data.longitude },
    fetched_at: new Date().toISOString(),
    valid_at_utc: `${current.time}Z`,
    wind_speed_kmh: current.wind_speed_10m,
    wind_from_degrees: current.wind_direction_10m,
    wind_gust_kmh: Number.isFinite(current.wind_gusts_10m) ? current.wind_gusts_10m : null,
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}