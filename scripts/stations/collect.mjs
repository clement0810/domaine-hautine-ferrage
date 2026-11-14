import { parseStationPage } from './observations.mjs';

const stationIds = process.argv.length > 2 ? process.argv.slice(2) : ['IHOUYE10', 'IHOUYE15', 'IHOUYE4'];
if (!stationIds.length || stationIds.some(id => !/^[A-Z0-9]{3,20}$/.test(id)) || new Set(stationIds).size !== stationIds.length) {
  console.error('Usage: npm run collect --prefix scripts/stations -- IHOUYE10 IHOUYE15');
  process.exitCode = 1;
} else {
  const observations = [];
  for (const stationId of stationIds) {
    try {
      const response = await fetch(`https://www.wunderground.com/dashboard/pws/${stationId}`, {
        headers: { 'User-Agent': 'Hautine-Ferrage station research/1.0', 'Accept-Language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      observations.push(parseStationPage(await response.text(), stationId));
    } catch (error) {
      observations.push({ station_id: stationId, status: 'unavailable', error: error.message });
      process.exitCode = 1;
    }
  }
  console.log(JSON.stringify({ observations }, null, 2));
}