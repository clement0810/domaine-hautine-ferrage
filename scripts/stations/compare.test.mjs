import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSnapshots } from './compare.mjs';

const forecast = { valid_at_utc: '2026-11-11T12:00Z', wind_speed_kmh: 10, wind_from_degrees: 350 };
const station = { station_id: 'TEST', status: 'recent', observed_at: '2026-11-11T12:10Z', wind_speed_kmh: 12, wind_from_degrees: 10 };
const compare = observation => compareSnapshots({ observations: [observation] }, forecast).stations[0];

test('compares directions across north and preserves signed speed difference', () => {
  assert.equal(compare(station).direction_difference_degrees, 20);
  assert.equal(compare(station).speed_difference_kmh, 2);
});

test('does not compare stale, disconnected or time-mismatched observations', () => {
  assert.equal(compare({ ...station, status: 'stale' }).comparable, false);
  assert.equal(compare({ ...station, status: 'disconnected' }).comparable, false);
  assert.equal(compare({ ...station, observed_at: '2026-11-11T13:00Z' }).comparable, false);
});

test('does not report angular difference for calm wind', () => {
  assert.equal(compare({ ...station, wind_speed_kmh: 0 }).direction_difference_degrees, null);
  assert.equal(compare({ ...station, wind_from_degrees: null }).direction_difference_degrees, null);
});