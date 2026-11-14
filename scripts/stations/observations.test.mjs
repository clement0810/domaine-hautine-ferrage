import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStationPage } from './observations.mjs';

const timestamp = 'Wed Nov 11 2026 17:16:23 GMT+0000 (Coordinated Universal Time)';
const html = (options = {}) => `<pws-status data-pws-id="IHOUYE10" data-status="${options.status ?? 'connected'}" data-obs-time-utc="${options.time ?? timestamp}"></pws-status><wind-widget-view data-pws-id="IHOUYE10" data-status="connected" data-unit="${options.unit ?? 'm'}" data-wind-speed="${options.speed ?? '1.4'}" data-wind-gust="1.8" data-wind-dir="${options.direction ?? '206'}"></wind-widget-view>`;
const now = new Date('2026-11-11T17:20:00Z');

test('reads metric observation and UTC timestamp', () => {
  const result = parseStationPage(html(), 'IHOUYE10', now);
  assert.equal(result.wind_speed_kmh, 1.4);
  assert.equal(result.wind_from_degrees, 206);
  assert.equal(result.observed_at, '2026-11-11T17:16:23.000Z');
  assert.equal(result.status, 'recent');
});

test('flags old, future and disconnected observations', () => {
  assert.equal(parseStationPage(html(), 'IHOUYE10', new Date('2026-11-11T18:00:00Z')).status, 'stale');
  assert.equal(parseStationPage(html(), 'IHOUYE10', new Date('2026-11-11T17:00:00Z')).status, 'future');
  assert.equal(parseStationPage(html({ status: 'disconnected' }), 'IHOUYE10', now).status, 'disconnected');
});

test('rejects invalid units, timestamps, speeds and station IDs', () => {
  assert.throws(() => parseStationPage(html({ unit: 'e' }), 'IHOUYE10', now));
  assert.throws(() => parseStationPage(html({ time: 'invalid' }), 'IHOUYE10', now));
  assert.throws(() => parseStationPage(html({ speed: '' }), 'IHOUYE10', now));
  assert.throws(() => parseStationPage(html({ direction: '999' }), 'IHOUYE10', now));
  assert.throws(() => parseStationPage(html(), 'IHOUYE15', now));
  assert.throws(() => parseStationPage('<html></html>', 'IHOUYE10', now));
});