# Terrain sampling prototype

Requires Node.js 20 or newer, npm, the two original local TIFFs in `relief_houyet/` and `relief_beauraing/`, and `data/hunting-data.geojson`. Run from the repository root:

```sh
npm ci --prefix scripts/terrain
npm run sample --prefix scripts/terrain
npm run sample --prefix scripts/terrain -- --write
npm test --prefix scripts/terrain
```

The first sample command prints JSON; only `--write` creates or replaces `data/terrain-summary.json`. The TIFFs are read only and are not included in the output. Paths are resolved relative to this repository, regardless of the current directory.

The script checks the embedded EPSG:3812, PixelIsPoint, 1 m resolution, and nodata metadata, transforms WGS84 coordinates to Belgian Lambert 2008, and samples the nearest pixel center without interpolation. WGS84 is treated as ETRS89, an approximation; neither datum epoch differences nor vertical datum transformations are applied. A regular 21 by 16 longitude/latitude grid includes the stated bounding box edges, so its counts are sample coverage, not an area-weighted coverage estimate. Each raster is reported separately; combined samples prefer Houyet when valid, then Beauraing.

Each actual point also has a `terrain` estimate. The center and four positions 10 m north, south, east and west in EPSG:3812 are sampled independently with the same preference. If any of these five samples is outside or nodata in both rasters, slope and aspect are null. Otherwise central differences over 20 m give east and north elevation gradients; slope is the arctangent of their magnitude, and downhill aspect is clockwise from grid north. Both are rounded to 0.1 degree; aspect is null for an exactly flat gradient. A rounded zero slope can still have an aspect when the underlying gradient is nonzero.

These are local prototype estimates, not conservative error bounds. Pixel rounding, raster accuracy, point location, datum approximation and switching sources between offsets can affect them; no smoothing or uncertainty quantification is applied. Grid north differs from true north, and no grid convergence correction is made. The output summarizes elevation and ground terrain only; it is not used by the operational wind model and supports no claims about wind, forest, or safety. Original raster terms and provenance remain in the relief folders.

Source: Service public de Wallonie (SPW), Relief de la Wallonie - Modele Numerique de Terrain - 1m (MNT) 2021-2022, 2024-01-23, https://geodata.wallonie.be/id/fe13bc84-e371-46ca-9632-8ad4139f1ee5, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).

The test checks synthetic planar and flat surfaces and invalid inputs, then re-reads every center, offset and grid pixel individually using the projection WKT embedded in each TIFF. It independently compares point elevations, terrain estimates and aggregate coverage with the batched sampler, and can take longer than sampling. The compact JSON contains no timestamps and is reproducible with the same inputs and dependency versions.

## Satellite land-cover reference

`node scripts/terrain/landcover.mjs --write` downloads the needed pixel window of ESA WorldCover 2021 v200 (10 m) and writes `data/landcover-summary.json`. It records the class at each point, not the surrounding canopy, tree height, current conditions, or a verified local classification. This 2021 product is coarse, can be wrong, and must not be used as an automatic wind correction. The ESA dataset is CC BY 4.0: https://esa-worldcover.org/en/data-access; citation: https://doi.org/10.5281/zenodo.7254221. LifeWatch Wallonia's 2 m 2022 land-cover dataset is a possible finer candidate, but has not been downloaded or locally validated.

## Experimental WindNinja domain

`domain.mjs` builds a rectangular DEM around the map bounds in `app.js`, not a surveyed property boundary. It projects densely sampled rectangle edges from WGS84 to EPSG:3812, takes their projected bounding rectangle, expands it by 1,000 m on each side and aligns it to the 1 m grid. WGS84 is treated as ETRS89. The 1 km buffer is an experimental choice, not a demonstrated sufficient model buffer.

GDAL mosaics the original 1 m PixelIsPoint DEMs with nearest-neighbor sampling. Valid Houyet pixels take precedence over valid Beauraing pixels; there is no nodata filling or elevation interpolation. The resulting 1 m PixelIsArea raster is scanned in full for nodata and non-finite values. The builder requires an existing output directory outside this repository, refuses an existing output file, and returns a nonzero exit status if verification fails. A failed operation may leave an incomplete output file; choose a fresh path for a retry.

Example with Conda/Mamba on macOS, with all large outputs outside the repository:

```sh
mamba create -y -p "$HOME/hautine-wind-work/gdal-env" -c conda-forge gdal
export PATH="$HOME/hautine-wind-work/gdal-env/bin:$PATH"
node scripts/terrain/domain.mjs "$HOME/hautine-wind-work/hautine-buffer-1km.tif"
node scripts/terrain/test-domain.mjs "$HOME/hautine-wind-work/hautine-buffer-1km.tif"
gdalinfo -stats "$HOME/hautine-wind-work/hautine-buffer-1km.tif"
```

The domain test independently scans every output pixel, checks the fixed extent and CRS, compares 81 pixels with the source rasters, and checks output safeguards. It requires the same source rasters and an already-built domain. It checks samples rather than proving every source pixel selection; the full scan checks validity of every output pixel.

Observed with GDAL 3.13.3: bounds `[690958, 592576, 696256, 597907]` in EPSG:3812, 5,298 by 5,331 Float32 cells, 28,243,638 valid cells and zero nodata/non-finite cells. Elevation range 115.28 to 289.87 m. The output is about 46 MB. Input SHA-256: Houyet `8950cf24c1407a681d32157d7a01aafc7cc097c84d39fcee3444d3eb2e7dbcf2`; Beauraing `3f341db3985d950a3d3685f1d73670082059d8c16d2730c5c156ecf398f47a83`.

### Station-inclusive domain experiment

The optional `--include-stations` flag extends the projected map bounds to include the published, rounded WGS84 positions of Hour `[5.020, 50.151]`, Herhet `[4.988, 50.194]`, and Vidocq `[4.888, 50.168]` before applying the same 1 km buffer. It does not change the default domain. These coordinates are approximate and have not been independently geolocated; the margin and datum approximation do not establish the true station positions or their suitability for comparison.

Use a unique external directory; the build below is expected to fail with the two current source rasters. The explicit test count checks this particular observed failure, not that the raster is usable:

```sh
export PATH="$HOME/hautine-wind-work/gdal-env/bin:$PATH"
workdir=$(mktemp -d "$HOME/hautine-wind-work/station-domain-XXXXXXXX")
node scripts/terrain/domain.mjs --include-stations "$workdir/domain.tif"
node scripts/terrain/test-domain.mjs --include-stations --expect-invalid-pixels=8803928 "$workdir/domain.tif"
```

Observed with the two rasters above: extent `[686105, 592526, 697552, 599289]` in EPSG:3812, 11,447 by 6,763 cells, 77,416,061 cells scanned, including 8,803,928 nodata cells (11.37%) and zero non-finite cells. The builder exited nonzero and left the failed raster for inspection. An independent scan reproduced the count and checked 81 source cells; the approximate station cells each have finite elevations, but that does not make the surrounding domain complete. The gaps are mainly in the north and west. Source bounding boxes overlap the area, but their valid-data footprints do not cover the whole rectangle.

Do not run WindNinja on this incomplete raster or fill its missing values. Obtain additional compatible SPW MNT 2021-2022 elevation coverage for the missing northern and western areas, inspect its CRS, resolution, nodata and licensing, extend the mosaic sources, and rebuild into a new external path. Repeat the full scan and only consider a model run when it reports zero invalid pixels. This is coverage preparation, not station calibration or validation.

## Experimental WindNinja runs

On Apple Silicon, upstream WindNinja 4.0.0 (commit `f1ec520882ae50a08e5a3b251311aa7314e12443`) was built from source outside the repository. The CLI-only diagnostic build excludes GUI, OpenFOAM/NinjaFOAM, NOMADS, OpenMP and phone-home queries. This machine used AppleClang 21 and Conda dependencies; the CLI's final link needed Shapelib explicitly. An Xcode command-line compiler and git are also required:

```sh
mamba install -y -p "$HOME/hautine-wind-work/gdal-env" -c conda-forge cmake ninja libboost-devel libnetcdf shapelib pkg-config
git clone --depth 1 --branch 4.0.0 https://github.com/firelab/windninja.git "$HOME/hautine-wind-work/windninja-src"
export PATH="$HOME/hautine-wind-work/gdal-env/bin:$PATH"
export PKG_CONFIG_PATH="$HOME/hautine-wind-work/gdal-env/lib/pkgconfig"
cmake -S "$HOME/hautine-wind-work/windninja-src" -B "$HOME/hautine-wind-work/windninja-build" -G Ninja \
	-DCMAKE_PREFIX_PATH="$HOME/hautine-wind-work/gdal-env" -DCMAKE_BUILD_TYPE=Release \
	-DNINJA_GUI=OFF -DNINJA_CLI=ON -DNINJAFOAM=OFF -DWITH_NOMADS_SUPPORT=OFF \
	-DPHONE_HOME_QUERIES=OFF -DOPENMP_SUPPORT=OFF -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
	-DCMAKE_CXX_STANDARD_LIBRARIES="$HOME/hautine-wind-work/gdal-env/lib/libshp.dylib"
cmake --build "$HOME/hautine-wind-work/windninja-build" --target WindNinja_cli --parallel 4
```

Two hypothetical domain-average scenarios use 5 m/s from 270 degrees and 0 degrees, respectively; trees everywhere; 10 m above vegetation for both input and output; a 100 m mesh and output grid; one thread; and default neutral, non-diurnal settings. These are assumptions, not measurements. Run each direction into a separate existing external directory:

```sh
export WINDNINJA_DATA="$HOME/hautine-wind-work/windninja-src/data"
export GDAL_DATA="$HOME/hautine-wind-work/gdal-env/share/gdal"
export PROJ_DATA="$HOME/hautine-wind-work/gdal-env/share/proj"
mkdir -p "$HOME/hautine-wind-work/scenarios/west" "$HOME/hautine-wind-work/scenarios/north"
for scenario in west:270 north:0; do
	name="${scenario%:*}"
	direction="${scenario#*:}"
	"$HOME/hautine-wind-work/windninja-build/src/cli/WindNinja_cli" \
		--elevation_file "$HOME/hautine-wind-work/hautine-buffer-1km.tif" \
		--initialization_method domainAverageInitialization --input_speed 5 --input_speed_units mps \
		--input_direction "$direction" --input_wind_height 10 --units_input_wind_height m \
		--output_wind_height 10 --units_output_wind_height m --output_speed_units mps \
		--vegetation trees --mesh_resolution 100 --units_mesh_resolution m --num_threads 1 \
		--write_ascii_output true --ascii_out_resolution 100 --units_ascii_out_resolution m \
		--output_path "$HOME/hautine-wind-work/scenarios/$name"
done
```

Both runs completed and produced ASCII speed and direction grids plus projection sidecars. GDAL reported 100% valid for each 53 by 54 grid. Across the complete output grid, west speed was 3.26-6.07 m/s (mean 4.931 m/s); north speed was 3.16-7.05 m/s (mean 4.933 m/s). These include boundary cells and are not site-specific predictions. GDAL recognizes the projection parameters as Belgian Lambert 2008, although the generated sidecar does not include an EPSG authority ID. The output grid extends 69 m north and 2 m east beyond the DEM; treat boundary cells cautiously. Direction is circular, so ordinary arithmetic angle averages are not meaningful near north.

An additional local experiment ran eight directions at 45-degree intervals with uniform trees and one west-wind run with uniform grass, using the same domain and 5 m/s input. All output cells were finite. For west winds, the grass-minus-trees speed difference averaged 0.028 m/s across the complete grid, with cell differences from -0.200 to 0.240 m/s. These are assumption-sensitivity tests, not validation. Both heights are above the selected vegetation, and the single vegetation setting is uniform; land-cover classes have not been used as a spatial vegetation field.

Neither the domain size, assumed uniform vegetation, model mesh, wind forcing, nor outputs have been validated against local measurements. Terrain-only modeling cannot resolve canopy, gusts, turbulence, or stand-scale conditions. Do not use these results for safety or operational decisions. No weather observation, local calibration, or model validation is implied.