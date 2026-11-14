import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import { fromFile } from 'geotiff';
import proj4 from 'proj4';

const root = fileURLToPath(new URL('../../', import.meta.url));
const rasterName = 'RELIEF_WALLONIE_MNT_1M_2021_2022.tif';
const sources = {
  houyet: `relief_houyet/${rasterName}`,
  beauraing: `relief_beauraing/${rasterName}`,
};
const outputPath = resolve(root, 'data/terrain-summary.json');
const bounds = { west: 4.94, south: 50.14, east: 5.02, north: 50.20 };
const columns = 21;
const rows = 16;
const lambert2008 = '+proj=lcc +lat_0=50.797815 +lon_0=4.359215833333333 +lat_1=49.8333333333333 +lat_2=51.1666666666667 +x_0=649328 +y_0=665262 +ellps=GRS80 +units=m +no_defs';
const offset = 10;

export function terrainFromSamples(center, north, south, east, west) {
  if ([center, north, south, east, west].some(sample => sample.status !== 'valid' || !Number.isFinite(sample.elevation_m))) {
    return { slope_degrees: null, downhill_aspect_grid_degrees: null };
  }
  const eastGradient = (east.elevation_m - west.elevation_m) / (2 * offset);
  const northGradient = (north.elevation_m - south.elevation_m) / (2 * offset);
  const magnitude = Math.hypot(eastGradient, northGradient);
  const slope = Math.atan(magnitude) * 180 / Math.PI;
  const aspect = (Math.atan2(-eastGradient, -northGradient) * 180 / Math.PI + 360) % 360;
  return {
    slope_degrees: Number(slope.toFixed(1)),
    downhill_aspect_grid_degrees: magnitude === 0 ? null : Number(aspect.toFixed(1)) % 360,
  };
}

async function sampleRaster(path, points) {
  const tiff = await fromFile(resolve(root, path));
  try {
    const image = await tiff.getImage();
    const keys = image.getGeoKeys();
    if (keys.ProjectedCSTypeGeoKey !== 3812 || keys.GTRasterTypeGeoKey !== 2) {
      throw new Error(`${path}: expected EPSG:3812 PixelIsPoint raster`);
    }
    const [originX, originY] = image.getOrigin();
    const [resolutionX, resolutionY] = image.getResolution();
    const tiepoints = image.fileDirectory.getValue('ModelTiepoint');
    if (resolutionX !== 1 || resolutionY !== -1 || image.fileDirectory.getValue('ModelTransformation') ||
        !tiepoints || tiepoints.length !== 6 || tiepoints[0] !== 0 || tiepoints[1] !== 0) {
      throw new Error(`${path}: unsupported raster transform`);
    }
    const nodata = image.getGDALNoData();
    if (nodata !== -9999) throw new Error(`${path}: expected nodata -9999, found ${nodata}`);
    const width = image.getWidth();
    const height = image.getHeight();
    const stripHeight = image.getTileHeight();
    const results = points.map(() => ({ elevation_m: null, status: 'outside' }));
    const strips = new Map();
    points.forEach(([x, y], index) => {
      const column = Math.round((x - originX) / resolutionX);
      const row = Math.round((y - originY) / resolutionY);
      if (column < 0 || row < 0 || column >= width || row >= height) return;
      const strip = Math.floor(row / stripHeight);
      if (!strips.has(strip)) strips.set(strip, []);
      strips.get(strip).push({ index, column, row });
    });
    for (const entries of strips.values()) {
      const left = Math.min(...entries.map(entry => entry.column));
      const right = Math.max(...entries.map(entry => entry.column)) + 1;
      const top = Math.min(...entries.map(entry => entry.row));
      const bottom = Math.max(...entries.map(entry => entry.row)) + 1;
      const values = await image.readRasters({ window: [left, top, right, bottom], samples: [0], interleave: true });
      for (const { index, column, row } of entries) {
        const value = values[(row - top) * (right - left) + column - left];
        results[index] = Number.isFinite(value) && value !== nodata
          ? { elevation_m: value, status: 'valid' }
          : { elevation_m: null, status: 'nodata' };
      }
    }
    return results;
  } finally {
    await tiff.close();
  }
}

function combinedSample(houyet, beauraing) {
  if (houyet.status === 'valid') return { ...houyet, source: 'houyet' };
  if (beauraing.status === 'valid') return { ...beauraing, source: 'beauraing' };
  return { elevation_m: null, status: houyet.status === 'nodata' || beauraing.status === 'nodata' ? 'nodata' : 'outside', source: null };
}

function stats(samples) {
  const valid = samples.filter(sample => sample.status === 'valid');
  const elevations = valid.map(sample => sample.elevation_m);
  return {
    total: samples.length,
    valid: valid.length,
    nodata: samples.filter(sample => sample.status === 'nodata').length,
    outside: samples.filter(sample => sample.status === 'outside').length,
    valid_percent: Number((100 * valid.length / samples.length).toFixed(2)),
    min_m: valid.length ? Math.min(...elevations) : null,
    max_m: valid.length ? Math.max(...elevations) : null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--write') || args.length > 1) throw new Error('Usage: npm run sample -- [--write]');
  const geojson = JSON.parse(await readFile(resolve(root, 'data/hunting-data.geojson'), 'utf8'));
  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features) || !geojson.features.length) throw new Error('Expected non-empty GeoJSON FeatureCollection');
  const posts = geojson.features.map((feature, index) => {
    const coordinates = feature.geometry?.coordinates;
    if (feature.geometry?.type !== 'Point' || !Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.slice(0, 2).every(Number.isFinite)) {
      throw new Error(`Feature ${index} is not a valid point`);
    }
    return { name: feature.properties?.name ?? null, type: feature.properties?.type ?? null, coordinates: coordinates.slice(0, 2) };
  });
  const grid = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      grid.push([bounds.west + (bounds.east - bounds.west) * column / (columns - 1), bounds.south + (bounds.north - bounds.south) * row / (rows - 1)]);
    }
  }
  const projected = coordinates => proj4('WGS84', lambert2008, coordinates);
  const pointCoordinates = posts.map(post => projected(post.coordinates));
  const coordinates = [...pointCoordinates, ...grid.map(projected), ...pointCoordinates.flatMap(([x, y]) => [
    [x, y + offset], [x, y - offset], [x + offset, y], [x - offset, y],
  ])];
  const houyet = await sampleRaster(sources.houyet, coordinates);
  const beauraing = await sampleRaster(sources.beauraing, coordinates);
  const combined = houyet.map((sample, index) => combinedSample(sample, beauraing[index]));
  const coverage = (start, end) => ({
    houyet: stats(houyet.slice(start, end)),
    beauraing: stats(beauraing.slice(start, end)),
    combined: stats(combined.slice(start, end)),
  });
  const summary = {
    sources,
    methods: {
      input_coordinates: 'WGS84 longitude, latitude (EPSG:4326)',
      raster_coordinates: 'ETRS89 / Belgian Lambert 2008 (EPSG:3812); WGS84 treated as ETRS89',
      sampling: 'nearest pixel center, band 1, no interpolation; -9999 and non-finite values are nodata',
      combined: 'first valid sample: houyet, then beauraing; nodata when either raster has nodata and neither is valid; otherwise outside',
      elevations: 'source raster values in meters, unmodified',
      terrain: 'point only: center and 10 m N/S/E/W offsets in EPSG:3812, each sampled independently using combined preference; any invalid sample makes both fields null; central differences over 20 m; slope in degrees and downhill aspect clockwise from grid north, rounded to 0.1 degree; aspect null on exactly flat terrain',
      uncertainty: 'prototype estimate, not a bound: raster, positioning, datum, pixel rounding and possible source seams affect results; grid north differs from true north; not for operational wind or forest inference',
    },
    grid: { bounds, columns, rows, sampling: 'regular longitude/latitude grid including bounds', coverage: coverage(posts.length, posts.length + grid.length) },
    points_coverage: coverage(0, posts.length),
    points: posts.map((post, index) => ({
      ...post, houyet: houyet[index], beauraing: beauraing[index], combined: combined[index],
      terrain: terrainFromSamples(combined[index], ...combined.slice(posts.length + grid.length + index * 4, posts.length + grid.length + index * 4 + 4)),
    })),
  };
  const json = `${JSON.stringify(summary)}\n`;
  if (args.includes('--write')) {
    await writeFile(outputPath, json);
    console.error(`Wrote ${relative(root, outputPath)}`);
  } else {
    process.stdout.write(json);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}