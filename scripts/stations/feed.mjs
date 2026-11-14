import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const stationIds = ['IHOUYE10', 'IHOUYE15', 'IHOUYE4'];

export function prepareSnapshot(snapshot, generatedAt = new Date()) {
  if (!Array.isArray(snapshot?.observations) || snapshot.observations.length !== stationIds.length) throw new Error('Expected three station results');
  const found = new Set();
  for (const observation of snapshot.observations) {
    if (!stationIds.includes(observation.station_id) || found.has(observation.station_id)) throw new Error('Invalid or duplicate station');
    found.add(observation.station_id);
    if (!['recent', 'stale', 'future', 'disconnected', 'unavailable'].includes(observation.status)) throw new Error('Invalid station status');
    if (observation.status !== 'unavailable' && (!Number.isFinite(Date.parse(observation.observed_at)) ||
        !Number.isFinite(observation.wind_speed_kmh) || observation.wind_speed_kmh < 0 || observation.wind_speed_kmh > 250 ||
        (observation.wind_from_degrees !== null && (!Number.isFinite(observation.wind_from_degrees) || observation.wind_from_degrees < 0 || observation.wind_from_degrees >= 360)))) throw new Error('Invalid wind observation');
  }
  return { generated_at: generatedAt.toISOString(), source: 'Weather Underground', observations: snapshot.observations };
}

async function main() {
  if (process.argv.length !== 5) throw new Error('Usage: node feed.mjs observations.json forecast.json output-directory');
  const snapshot = prepareSnapshot(JSON.parse(await readFile(process.argv[2], 'utf8')));
    const forecastText = await readFile(process.argv[3], 'utf8');
    const forecast = forecastText.trim() ? JSON.parse(forecastText) : null;
    if (forecast && (!Number.isFinite(Date.parse(forecast.valid_at_utc)) || !Number.isFinite(forecast.wind_speed_kmh) ||
      !Number.isFinite(forecast.wind_from_degrees))) throw new Error('Invalid forecast snapshot');
  const directory = resolve(process.argv[4]);
  const historyDirectory = join(directory, 'history');
  await mkdir(historyDirectory, { recursive: true });
  const date = snapshot.generated_at.slice(0, 10);
  const historyPath = join(historyDirectory, `${date}.jsonl`);
  let history = '';
  try { history = await readFile(historyPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const record = JSON.stringify({ ...snapshot, forecast });
  await writeFile(historyPath, `${history}${record}\n`);
  await writeFile(join(directory, 'latest.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}