# Wind Data and Terrain Plan

## Current State

- The PWA uses an Open-Meteo regional forecast. Its red cone is an indicative fixed 30-degree, 100 m sector; an unknown direction shows a yellow uncertainty ring. Station readings do not steer the cone.
- The public station-page collector can read Hour (`IHOUYE10`), Herhet (`IHOUYE15`) and Vidocq (`IHOUYE4`). A local, timestamp-aware comparison script keeps observations separate from forecasts.
- The optional GitHub Actions workflow can store a latest snapshot and daily JSONL history on a separate public `wind-observations` branch. That branch is not created yet. GitHub Actions artifacts alone are private/authenticated workflow outputs and are not an app data endpoint.
- GitHub Actions collection is gated by repository variable `TWC_WU_AUTOMATION_APPROVED=true`. Station-owner permission is not necessarily permission to automate extraction from Weather Underground, modify/derive its feed data, or redistribute it publicly. Set the variable only after confirming those rights directly with The Weather Company. The repository and data branch are public.
- ESA WorldCover 2021 v200 samples the 10 m pixel containing each of the 30 mapped points. All currently classify as tree cover. This is a coarse, dated land-cover reference, not verification of local canopy, shelter, or current vegetation.
- The supplied 1 m SPW terrain rasters produce elevations and slope/aspect samples at the posts. The app displays elevation as context only.
- WindNinja 4.0.0 has been run for eight directions at 5 m/s with a uniform tree assumption, plus one uniform grass comparison. These are assumption-sensitivity experiments, not validated predictions. The existing map-area domain is no-data-free but excludes the observation stations.
- An expanded domain including the approximate station coordinates has 11.4% nodata. WindNinja must not be run on it until the gaps are resolved without inventing elevation.

## Steps

### 1. Keep the PWA honest and useful

Show the forecast-based cone with source/time and retain it for calm or stale forecasts with an uncertainty warning. Show station observations separately, including station name, observation time, age, status, wind-from direction, speed and gust. Do not average low-speed directions or imply a green/safe sector.

**Acceptance:** missing/stale/calm readings are visibly identified; forecast and observations remain distinguishable; offline mode displays last saved values with their original timestamps.

### 2. Confirm data-use rights and enable collection

Before enabling automated Weather Underground page collection, obtain confirmation that the permitted use covers automated fetching, retention, comparison/derivation and public redistribution. The station owners' permission is important but does not by itself settle the platform's terms. If those rights are not available, request a direct feed from station owners or use an authorized provider.

After rights are clear, enable GitHub Actions in repository settings, add repository variable `TWC_WU_AUTOMATION_APPROVED=true`, and run the workflow manually once. It initializes `wind-observations` if needed and stores timestamped observations and forecast snapshots. Review Actions run logs/artifacts and the raw branch feed. The schedule is 15 minutes; GitHub may delay runs and disables schedules for inactive public repositories after 60 days.

**Acceptance:** repeated successful runs update `latest.json` and append daily history; unavailable stations are recorded as unavailable, not omitted; timestamps and status are preserved; the PWA falls back to localStorage offline.

### 3. Compare station network with forecast

Use the timestamp-aware comparison utility on retained station/forecast pairs. Keep stations separate: they differ in distance, elevation and exposure. Report sample counts, age, speed bias/MAE and circular direction error. Exclude stale/calm direction samples and hold out entire dates for evaluation. This checks regional forecast agreement, not wind at a post.

**Acceptance:** enough varied wind cases exist across multiple weeks, and comparisons reproduce from archived inputs. Do not tune a model against the same dates used to report its accuracy.

### 4. Resolve terrain coverage before station-driven modeling

The approximate stations (Hour, Herhet, Vidocq) lie outside the current model domain. Expanding the current high-resolution DEM produces 11.4% nodata. First request the missing SPW LiDAR tiles around the expanded region. If they cannot be obtained, evaluate a complete public 25–30 m terrain DEM for the larger domain. Preserve its native resolution; do not upsample coarse data and imply extra detail, and do not silently interpolate nodata. Record source, license, CRS, resolution and vertical datum, then scan every model input cell for validity.

The current station coordinates are rounded dashboard coordinates. Do not use station point comparisons until exact locations and sensor heights/exposure metadata are confirmed. A model domain also needs an outer buffer so boundary effects do not contaminate the evaluation area.

**Acceptance:** complete DEM covers the selected posts and independent check stations with a documented buffer; no nodata/non-finite pixels; each station's location and elevation are within the domain.

### 5. Treat land cover as a separate model assumption

WorldCover's 2021 10 m class can help map broad land-cover context but cannot establish tree height, canopy density, seasonal state or wind shelter. Seek the SPW 2022 2 m land-cover product and inspect its classes, coverage and license. Compare classified samples with independent recent imagery; report agreement and uncertainty. WindNinja's current CLI setup uses one vegetation type for the whole grid, so a spatial land-cover raster is not yet a valid WindNinja input.

Run controlled uniform-grass, uniform-trees and other defensible scenarios. Treat their spread as sensitivity to assumptions, not as a probability interval or calibrated correction. Do not let land-cover classes silently alter the operational cone.

### 6. Validate a terrain model independently before app integration

Acquire matching station observations and forecast forcing, with compatible timestamps, wind averaging period and height above ground/vegetation. Run held-out cases across several wind speeds and directions. Compare WindNinja output at independent stations and separately at posts. Report speed bias/MAE, gust limitations, circular direction error, valid sample counts and uncertainty. Stations used to drive a run cannot also count as independent validation points.

**Acceptance:** complete inputs, repeatable runs, independent held-out observations and a documented improvement over the unadjusted forecast. Until then, keep WindNinja outputs research-only and out of the cone.

## Reproducible Checks

```sh
npm test --prefix scripts/stations
npm test --prefix scripts/terrain
node scripts/stations/collect.mjs
node scripts/stations/forecast.mjs
```

The last two commands perform one read of the public pages/model and do not publish or retain results unless the workflow/feed writer is explicitly run.