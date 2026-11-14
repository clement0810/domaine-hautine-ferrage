import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromFile } from 'geotiff';
import proj4 from 'proj4';
import { terrainFromSamples } from './sample.mjs';

const valid = elevation_m => ({ elevation_m, status: 'valid' });
const flat = [valid(100), valid(100), valid(100), valid(100), valid(100)];
assert.deepEqual(terrainFromSamples(...flat), { slope_degrees: 0, downhill_aspect_grid_degrees: null });
for (const [north, south, east, west, aspect] of [
  [110, 90, 100, 100, 180],
  [90, 110, 100, 100, 0],
  [100, 100, 110, 90, 270],
  [100, 100, 90, 110, 90],
  [110, 90, 110, 90, 225],
  [110, 90, 90, 110, 135],
]) {
  const expectedSlope = Number((Math.atan(Math.hypot((east - west) / 20, (north - south) / 20)) * 180 / Math.PI).toFixed(1));
  assert.deepEqual(terrainFromSamples(valid(100), valid(north), valid(south), valid(east), valid(west)),
    { slope_degrees: expectedSlope, downhill_aspect_grid_degrees: aspect });
}
for (let index = 0; index < flat.length; index++) {
  for (const invalid of [{ elevation_m: null, status: 'nodata' }, { elevation_m: null, status: 'outside' }, valid(NaN)]) {
    const samples = [...flat];
    samples[index] = invalid;
    assert.deepEqual(terrainFromSamples(...samples), { slope_degrees: null, downhill_aspect_grid_degrees: null });
  }
}

const root = fileURLToPath(new URL('../../', import.meta.url));
const summary = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('sample.mjs', import.meta.url))], { encoding: 'utf8' }));
const points = summary.points.map(point => point.coordinates);
const { bounds, rows, columns } = summary.grid;
const grid = [];
for (let row = 0; row < rows; row++) {
  for (let column = 0; column < columns; column++) {
    grid.push([bounds.west + column * (bounds.east - bounds.west) / (columns - 1), bounds.south + row * (bounds.north - bounds.south) / (rows - 1)]);
  }
}
const results = {};
for (const [source, path] of Object.entries(summary.sources)) {
  const tiff = await fromFile(resolve(root, path));
  try {
    const image = await tiff.getImage();
    const wkt = image.getGeoKeys().PCSCitationGeoKey.replace(/^ESRI PE String = /, '');
    const [originX, originY] = image.getOrigin();
    const [scaleX, scaleY] = image.getResolution();
    results[source] = [];
    const projectedPoints = points.map(coordinates => proj4('WGS84', wkt, coordinates));
    const projected = [...projectedPoints, ...grid.map(coordinates => proj4('WGS84', wkt, coordinates)),
      ...projectedPoints.flatMap(([x, y]) => [[x, y + 10], [x, y - 10], [x + 10, y], [x - 10, y]])];
    for (const [x, y] of projected) {
      const column = Math.round((x - originX) / scaleX);
      const row = Math.round((y - originY) / scaleY);
      let sample = { elevation_m: null, status: 'outside' };
      if (column >= 0 && column < image.getWidth() && row >= 0 && row < image.getHeight()) {
        const [value] = await image.readRasters({ window: [column, row, column + 1, row + 1], samples: [0], interleave: true });
        sample = Number.isFinite(value) && value !== image.getGDALNoData()
          ? { elevation_m: value, status: 'valid' }
          : { elevation_m: null, status: 'nodata' };
      }
      results[source].push(sample);
    }
  } finally {
    await tiff.close();
  }
}
const combined = results.houyet.map((sample, index) => {
  const other = results.beauraing[index];
  if (sample.status === 'valid') return { ...sample, source: 'houyet' };
  if (other.status === 'valid') return { ...other, source: 'beauraing' };
  return { elevation_m: null, status: sample.status === 'nodata' || other.status === 'nodata' ? 'nodata' : 'outside', source: null };
});
for (let index = 0; index < points.length; index++) {
  assert.deepEqual(summary.points[index].houyet, results.houyet[index]);
  assert.deepEqual(summary.points[index].beauraing, results.beauraing[index]);
  assert.deepEqual(summary.points[index].combined, combined[index]);
  const neighbors = combined.slice(points.length + grid.length + index * 4, points.length + grid.length + index * 4 + 4);
  let expected = { slope_degrees: null, downhill_aspect_grid_degrees: null };
  if ([combined[index], ...neighbors].every(sample => sample.status === 'valid')) {
    const [north, south, east, west] = neighbors.map(sample => sample.elevation_m);
    const eastGradient = (east - west) / 20;
    const northGradient = (north - south) / 20;
    const magnitude = Math.hypot(eastGradient, northGradient);
    expected = {
      slope_degrees: Number((Math.atan(magnitude) * 180 / Math.PI).toFixed(1)),
      downhill_aspect_grid_degrees: magnitude === 0 ? null : Number(((Math.atan2(-eastGradient, -northGradient) * 180 / Math.PI + 360) % 360).toFixed(1)) % 360,
    };
  }
  assert.deepEqual(summary.points[index].terrain, expected);
}
for (const [name, samples] of Object.entries({ ...results, combined })) {
  for (const [coverage, selected] of [
    [summary.points_coverage[name], samples.slice(0, points.length)],
    [summary.grid.coverage[name], samples.slice(points.length, points.length + grid.length)],
  ]) {
    const valid = selected.filter(sample => sample.status === 'valid');
    assert.equal(coverage.total, selected.length);
    assert.equal(coverage.valid, valid.length);
    assert.equal(coverage.nodata, selected.filter(sample => sample.status === 'nodata').length);
    assert.equal(coverage.outside, selected.filter(sample => sample.status === 'outside').length);
    assert.equal(coverage.valid_percent, Number((100 * valid.length / selected.length).toFixed(2)));
    assert.equal(coverage.min_m, valid.length ? Math.min(...valid.map(sample => sample.elevation_m)) : null);
    assert.equal(coverage.max_m, valid.length ? Math.max(...valid.map(sample => sample.elevation_m)) : null);
  }
}
assert.equal(points.length, 30);
assert.ok(grid.length >= 200);
assert.ok(summary.points.some(point => point.terrain.slope_degrees !== null));
console.log(`Synthetic terrain tests and direct single-pixel comparisons passed for ${points.length} points, ${points.length * 4} offsets, and ${grid.length} grid samples in each raster.`);