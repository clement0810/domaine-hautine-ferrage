import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromFile } from 'geotiff';
import proj4 from 'proj4';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = resolve(root, 'scripts/terrain/domain.mjs');
const args = process.argv.slice(2);
const includeStations = args[0] === '--include-stations';
if (includeStations) args.shift();
const expectedInvalidArgument = args.find(arg => arg.startsWith('--expect-invalid-pixels='));
if (expectedInvalidArgument) args.splice(args.indexOf(expectedInvalidArgument), 1);
const expectedInvalid = expectedInvalidArgument ? Number(expectedInvalidArgument.slice('--expect-invalid-pixels='.length)) : 0;
const output = args[0];
if (args.length !== 1 || !output || !Number.isSafeInteger(expectedInvalid) || expectedInvalid < 0 || (expectedInvalidArgument && !/^--expect-invalid-pixels=\d+$/.test(expectedInvalidArgument))) throw new Error('Usage: node scripts/terrain/test-domain.mjs [--include-stations] [--expect-invalid-pixels=N] /absolute/path/to/domain.tif');

for (const args of [[], [resolve(root, 'domain-test.tif')], [resolve(output)]]) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, `Expected rejection: ${args}`);
}
const temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'hautine-domain-test-'));
try {
  const link = resolve(temporaryDirectory, 'domain.tif');
  await symlink(resolve(temporaryDirectory, 'missing.tif'), link);
  const result = spawnSync(process.execPath, [script, link], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Output already exists/);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

const rasterName = 'RELIEF_WALLONIE_MNT_1M_2021_2022.tif';
const paths = [resolve(output), ...['houyet', 'beauraing'].map(name => resolve(root, `relief_${name}/${rasterName}`))];
const files = [];
try {
  for (const path of paths) files.push(await fromFile(path));
  const images = await Promise.all(files.map(file => file.getImage()));
  const [domain, ...sources] = images;
  assert.equal(domain.getGeoKeys().ProjectedCSTypeGeoKey, 3812);
  assert.deepEqual(domain.getResolution().slice(0, 2), [1, -1]);
  const expectedBounds = includeStations ? [686105, 592526, 697552, 599289] : [690958, 592576, 696256, 597907];
  assert.deepEqual(domain.getBoundingBox(), expectedBounds);
  if (includeStations) {
    const projection = '+proj=lcc +lat_0=50.797815 +lon_0=4.359215833333333 +lat_1=49.8333333333333 +lat_2=51.1666666666667 +x_0=649328 +y_0=665262 +ellps=GRS80 +units=m +no_defs';
    for (const point of [[5.020, 50.151], [4.988, 50.194], [4.888, 50.168], [4.95611, 50.1518], [4.95611, 50.1815], [5.00187, 50.1518], [5.00187, 50.1815]]) {
      const [x, y] = proj4('WGS84', projection, point);
      assert.ok(x - expectedBounds[0] >= 1000 && expectedBounds[2] - x >= 1000 && y - expectedBounds[1] >= 1000 && expectedBounds[3] - y >= 1000, `Insufficient margin for ${point}`);
    }
  }
  assert.equal(domain.getGDALNoData(), -9999);
  const width = domain.getWidth();
  const height = domain.getHeight();
  let count = 0;
  let invalid = 0;
  for (let top = 0; top < height; top += 128) {
    const values = await domain.readRasters({ window: [0, top, width, Math.min(top + 128, height)], samples: [0], interleave: true });
    for (const value of values) {
      if (!Number.isFinite(value) || value === -9999) invalid++;
      count++;
    }
  }
  assert.equal(count, width * height);
  assert.equal(invalid, expectedInvalid, 'Unexpected number of invalid domain pixels');
  let compared = 0;
  const [left, , , top] = domain.getBoundingBox();
  for (let rowIndex = 0; rowIndex < 9; rowIndex++) {
    for (let columnIndex = 0; columnIndex < 9; columnIndex++) {
      const column = Math.floor((width - 1) * columnIndex / 8);
      const row = Math.floor((height - 1) * rowIndex / 8);
      const x = left + column + 0.5;
      const y = top - row - 0.5;
      const actual = (await domain.readRasters({ window: [column, row, column + 1, row + 1], samples: [0], interleave: true }))[0];
      let expected;
      for (const source of sources) {
        const [originX, originY] = source.getOrigin();
        const sourceColumn = Math.round(x - originX);
        const sourceRow = Math.round(originY - y);
        if (sourceColumn < 0 || sourceRow < 0 || sourceColumn >= source.getWidth() || sourceRow >= source.getHeight()) continue;
        const value = (await source.readRasters({ window: [sourceColumn, sourceRow, sourceColumn + 1, sourceRow + 1], samples: [0], interleave: true }))[0];
        if (Number.isFinite(value) && value !== source.getGDALNoData()) { expected = value; break; }
      }
      assert.equal(actual, expected === undefined ? -9999 : expected, `Incorrect source pixel at ${x}, ${y}`);
      compared++;
    }
  }
  console.log(`Domain test passed: ${count} pixels scanned, ${invalid} invalid, ${compared} source comparisons, CRS/extent and output safeguards.`);
} finally {
  await Promise.all(files.map(file => file.close()));
}