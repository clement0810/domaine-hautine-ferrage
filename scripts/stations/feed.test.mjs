import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareSnapshot } from './feed.mjs';

const valid = id => ({ station_id: id, status: 'recent', observed_at: '2026-11-11T12:00:00Z', wind_speed_kmh: 5, wind_from_degrees: 90 });
const snapshot = () => ({ observations: [valid('IHOUYE10'), valid('IHOUYE15'), valid('IHOUYE4')] });

test('preserves individual observations and generation time', () => {
  const result = prepareSnapshot(snapshot(), new Date('2026-11-11T12:05:00Z'));
  assert.equal(result.observations.length, 3);
  assert.equal(result.generated_at, '2026-11-11T12:05:00.000Z');
});

test('allows an unavailable station without inventing a value', () => {
  const data = snapshot();
  data.observations[0] = { station_id: 'IHOUYE10', status: 'unavailable' };
  assert.equal(prepareSnapshot(data).observations[0].wind_speed_kmh, undefined);
});

test('rejects duplicate stations and invalid observations', () => {
  const duplicate = snapshot();
  duplicate.observations[0] = valid('IHOUYE15');
  assert.throws(() => prepareSnapshot(duplicate));
  const invalid = snapshot();
  invalid.observations[0].wind_from_degrees = 361;
  assert.throws(() => prepareSnapshot(invalid));
  assert.throws(() => prepareSnapshot({ observations: [] }));
});

test('writes latest and appends history even when the forecast is unavailable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hautine-feed-'));
  try {
    const observationsPath = join(directory, 'input.json');
    const forecastPath = join(directory, 'forecast.json');
    const output = join(directory, 'output');
    await writeFile(observationsPath, JSON.stringify(snapshot()));
    await writeFile(forecastPath, '');
    const script = fileURLToPath(new URL('./feed.mjs', import.meta.url));
    execFileSync(process.execPath, [script, observationsPath, forecastPath, output]);
    execFileSync(process.execPath, [script, observationsPath, forecastPath, output]);
    const latest = JSON.parse(await readFile(join(output, 'latest.json'), 'utf8'));
    const history = (await readFile(join(output, 'history', `${latest.generated_at.slice(0, 10)}.jsonl`), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(latest.observations.length, 3);
    assert.equal(history.length, 2);
    assert.equal(history[0].forecast, null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});