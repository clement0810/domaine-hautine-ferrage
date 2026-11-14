import { lstat, realpath, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromFile } from 'geotiff';
import proj4 from 'proj4';

const root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const rasterName = 'RELIEF_WALLONIE_MNT_1M_2021_2022.tif';
const sources = ['beauraing', 'houyet'].map(name => resolve(root, `relief_${name}/${rasterName}`));
const projection = '+proj=lcc +lat_0=50.797815 +lon_0=4.359215833333333 +lat_1=49.8333333333333 +lat_2=51.1666666666667 +x_0=649328 +y_0=665262 +ellps=GRS80 +units=m +no_defs';
const bounds = { west: 4.95611, south: 50.1518, east: 5.00187, north: 50.1815 };
const stations = [[5.020, 50.151], [4.988, 50.194], [4.888, 50.168]];
const buffer = 1000;

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

async function main() {
  const args = process.argv.slice(2);
  const includeStations = args[0] === '--include-stations';
  if (includeStations) args.shift();
  if (args.length !== 1 || !isAbsolute(args[0])) throw new Error('Usage: node scripts/terrain/domain.mjs [--include-stations] /absolute/existing-directory/domain.tif');
  const output = resolve(await realpath(dirname(args[0])), args[0].split('/').at(-1));
  const withinRoot = relative(root, output);
  if (!withinRoot.startsWith('..' + '/') && withinRoot !== '..') throw new Error('Output must be outside the repository');
  if (!output.toLowerCase().endsWith('.tif')) throw new Error('Output must end in .tif');
  try { await lstat(output); throw new Error('Output already exists; choose a new path'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const source of sources) {
    const file = await fromFile(source);
    try {
      const image = await file.getImage();
      const keys = image.getGeoKeys();
      const [x, y] = image.getResolution();
      if (keys.ProjectedCSTypeGeoKey !== 3812 || keys.GTRasterTypeGeoKey !== 2 || x !== 1 || y !== -1 || image.getGDALNoData() !== -9999) throw new Error(`Unexpected raster metadata: ${source}`);
    } finally { await file.close(); }
  }
  const edgePoints = [];
  for (let index = 0; index <= 1000; index++) {
    const fraction = index / 1000;
    const longitude = bounds.west + fraction * (bounds.east - bounds.west);
    const latitude = bounds.south + fraction * (bounds.north - bounds.south);
    edgePoints.push([longitude, bounds.south], [longitude, bounds.north], [bounds.west, latitude], [bounds.east, latitude]);
  }
  if (includeStations) edgePoints.push(...stations);
  const projected = edgePoints.map(point => proj4('WGS84', projection, point));
  const extent = [
    Math.floor(Math.min(...projected.map(point => point[0])) - buffer),
    Math.floor(Math.min(...projected.map(point => point[1])) - buffer),
    Math.ceil(Math.max(...projected.map(point => point[0])) + buffer),
    Math.ceil(Math.max(...projected.map(point => point[1])) + buffer),
  ];
  const vrt = `${output}.${process.pid}.vrt`;
  try {
    run('gdalbuildvrt', ['-srcnodata', '-9999', '-vrtnodata', '-9999', vrt, ...sources]);
    run('gdalwarp', ['-of', 'GTiff', '-t_srs', 'EPSG:3812', '-te', ...extent.map(String), '-tr', '1', '1', '-tap', '-r', 'near', '-dstnodata', '-9999', '-co', 'TILED=YES', '-co', 'COMPRESS=DEFLATE', '-co', 'PREDICTOR=3', vrt, output]);
  } finally { await unlink(vrt).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  const file = await fromFile(output);
  try {
    const image = await file.getImage();
    const keys = image.getGeoKeys();
    const [x, y] = image.getResolution();
    if (keys.ProjectedCSTypeGeoKey !== 3812 || x !== 1 || y !== -1 || image.getGDALNoData() !== -9999) throw new Error('Unexpected output raster metadata');
    const width = image.getWidth();
    const height = image.getHeight();
    let invalid = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let top = 0; top < height; top += 256) {
      const values = await image.readRasters({ window: [0, top, width, Math.min(top + 256, height)], samples: [0], interleave: true });
      for (const value of values) {
        if (!Number.isFinite(value) || value === -9999) invalid++;
        else { min = Math.min(min, value); max = Math.max(max, value); }
      }
    }
    console.log(JSON.stringify({ output, crs: 'EPSG:3812', include_stations: includeStations, buffer_m: buffer, extent, width, height, pixels: width * height, invalid_pixels: invalid, min_m: min, max_m: max }, null, 2));
    if (invalid) throw new Error('Domain contains nodata or non-finite pixels');
  } finally { await file.close(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });