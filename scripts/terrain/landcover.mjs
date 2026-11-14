import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { fromUrl } from 'geotiff';

const root = fileURLToPath(new URL('../../', import.meta.url));
const url = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N48E003_Map.tif';
const classes = { 10: 'tree cover', 20: 'shrubland', 30: 'grassland', 40: 'cropland', 50: 'built-up', 60: 'bare or sparse vegetation', 70: 'snow and ice', 80: 'permanent water', 90: 'herbaceous wetland', 95: 'mangroves', 100: 'moss and lichen' };

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => arg !== '--write')) throw new Error('Usage: node landcover.mjs [--write]');
  const data = JSON.parse(await readFile(resolve(root, 'data/hunting-data.geojson'), 'utf8'));
  const features = data.features.filter(feature => feature.geometry?.type === 'Point');
  const raster = await fromUrl(url);
  try {
    const image = await raster.getImage();
    if (image.getGeoKeys().GeographicTypeGeoKey !== 4326) throw new Error('Unexpected WorldCover projection');
    const [west, north] = image.getOrigin();
    const [pixelWidth, pixelHeight] = image.getResolution();
    const points = features.map(feature => {
      const [longitude, latitude] = feature.geometry.coordinates;
      const column = Math.floor((longitude - west) / pixelWidth);
      const row = Math.floor((latitude - north) / pixelHeight);
      if (column < 0 || column >= image.getWidth() || row < 0 || row >= image.getHeight()) throw new Error('Point outside WorldCover tile');
      return { name: feature.properties?.name, type: feature.properties?.type, coordinates: [longitude, latitude], column, row };
    });
    const left = Math.min(...points.map(point => point.column));
    const top = Math.min(...points.map(point => point.row));
    const right = Math.max(...points.map(point => point.column)) + 1;
    const bottom = Math.max(...points.map(point => point.row)) + 1;
    const values = await image.readRasters({ window: [left, top, right, bottom], samples: [0], interleave: true });
    const output = {
      source: 'ESA WorldCover 2021 v200, 10 m, CC BY 4.0',
      attribution: 'ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium',
      citation: 'https://doi.org/10.5281/zenodo.7254221',
      source_url: url,
      method: 'Class at the pixel containing each point; no local accuracy validation or wind inference.',
      points: points.map(({ column, row, ...point }) => {
        const code = values[(row - top) * (right - left) + column - left];
        return { ...point, class_code: classes[code] ? code : null, land_cover: classes[code] ?? null };
      }),
    };
    const json = `${JSON.stringify(output, null, 2)}\n`;
    if (args.includes('--write')) await writeFile(resolve(root, 'data/landcover-summary.json'), json);
    else process.stdout.write(json);
  } finally {
    await raster.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });