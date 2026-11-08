# Hunting Map PWA: Build Plan

This document turns the initial concept in [handoff.md](handoff.md) into a staged implementation plan. It is intentionally decision-first: confirm the important constraints before investing in map data or app code, then build a small pilot that can be tested in the field.

## 1. Product Goal

Build a mobile-friendly, installable web app for viewing hunting stands, shooting areas, parking locations, and approach routes in the Beauraing area. It should remain useful when the phone has no network connection, show when weather data was last updated, and be straightforward for its maintainer to update without editing application code.

### Success means

- A user can open the map, identify a feature, and read its essential details on a phone.
- After a clearly explained preparation step, the agreed map area and app data can be used without a network connection.
- The app distinguishes current, stale, unavailable, and uncertain weather information instead of implying false precision.
- Map imagery, feature data, and photos have known sources, attribution, and update procedures.
- A data change can be checked and published without changing the map application.
- The privacy and access model is explicit. Sensitive locations are not accidentally published to an unrestricted URL.

### Not part of the first release

- Multi-user editing, accounts, chat, tracking, or background GPS recording.
- Guaranteed offline availability across every browser and device. Mobile browsers may evict stored data.
- Legal, safety, or hunting decisions made automatically by the app.
- A generalized mapping platform for multiple regions before one region has been proven in field use.

## 2. Decisions To Make Before Building

The project is a small, private app for one hunting group with one developer. The decisions below use that scope and favor a direct manual workflow for v1.0.

| Decision | Recommended starting point | How to verify it |
| --- | --- | --- |
| Who can see the locations? | Private access for the hunting group using Cloudflare Access. | Test the deployed URL signed out and verify that the app, GeoJSON, photos, and PMTiles archive are all behind Access. |
| What does “offline” mean? | v1.0 uses one PMTiles file and keeps the app/data experience simple; no custom quota manager or fallback system. | Test install, reload, and map navigation in airplane mode on target phones. PMTiles alone does not guarantee offline availability; the pilot must prove the selected delivery and caching path. |
| Which phones and browsers are supported? | Select the actual iPhone/Android models and current browsers used by the group. | Make a short device matrix and test storage, installation, service worker updates, location permissions, and offline behavior on each. |
| How is SPW imagery attributed? | For v1.0, use the project's private/non-commercial assumption and display `© SPW Wallonie`. This is a project assumption, not a legal determination. | Keep the attribution visible on the map and record the source and imagery date with the pilot archive. Formal licensing review is not a Phase 0 gate. |
| How much geography and detail is needed? | One small pilot area and the lowest resolution that remains useful for identifying routes and stands. | Generate a sample archive, measure it, and compare it with real field use. Choose a download-size budget before producing the whole region. |
| How are data edits made? | Edit GeoJSON separately from app code and check it manually by loading the app/map locally. | Make a small sample edit, reload locally, and confirm the expected feature appears in the right place. |
| What is the wind status intended to communicate? | Show forecast direction/speed and a clearly labeled directional comparison, not a hunting-safety guarantee. | Agree on the meaning of “ideal wind,” direction sectors, calm conditions, and freshness. Verify calculations against hand-worked examples. |
| Is GPS needed? | Keep it optional and foreground-only in the first version. | Confirm that the app works when location permission is denied and that no location is transmitted or stored. |
| Who can publish changes? | One or a small number of named maintainers, with a review/checklist and a recoverable prior release. | Test publishing and rollback before field use. |

Record answers and any changed defaults in a short decision log in this README or a future `docs/decisions/` directory.

## 3. Recommended Initial Architecture

Start as a static PWA with no server-side database. This keeps hosting and maintenance simple for a single region and a small, trusted maintainer group. Keep data, map assets, weather handling, and interface code in separate modules so a later move to a backend does not require rewriting the map.

- **Interface:** HTML, CSS, and JavaScript. Keep the existing vanilla approach unless the project grows enough to justify a build framework. Use small modules by responsibility rather than one large `app.js`.
- **Map engine:** Choose Leaflet for a simple raster map and familiar interaction, or MapLibre GL JS if vector styling or much larger multi-layer datasets are required. Prove the offline archive integration with a small sample before committing. Neither map library by itself makes a remote map available offline.
- **Offline imagery:** Use one PMTiles archive for v1.0. Test archive delivery, renderer compatibility, and offline access on target phones. Do not build custom storage-quota management or fallback flows for this release; if the simple approach fails the pilot, revisit the delivery design.
- **Feature data:** GeoJSON for stands, parking, routes, and zones, kept separate from app logic. Keep geometry coordinates in standard longitude/latitude order and manually check changes by loading the local app. Do not put comments or trailing commas in JSON.
- **Weather:** Open-Meteo is a reasonable no-key forecast source. Isolate its API response behind a weather module and map it into an app-owned data shape. Cache the last successful response with its fetch time and forecast valid time.
- **Hosting:** Decide only after the access model and archive size are known. Any public static host makes deployed source files and data available to visitors. Check current file-size, bandwidth, caching, and range-request behavior on the selected provider.
- **Backend later, only if needed:** Add an API and database when there is a real requirement for authenticated users, concurrent edits, audit history, controlled sharing, or cross-device synchronization. Avoid introducing these operational costs for the first single-maintainer release.

### Suggested project layout

```text
index.html
manifest.json
service-worker.js
src/
  app.js
  map.js
  data.js
  weather.js
  wind.js
  offline.js
  ui.js
  styles.css
data/
  hunting-data.geojson
  schema.json
maps/
  README.md                 # source, generation, size, and attribution records
assets/
  icons/
  images/
docs/
  data-maintenance.md
  field-test.md
```

Keep large archives out of the source tree if they exceed the hosting or repository limits. Store a small manifest describing each archive, its version, geographic bounds, size, source, attribution, and checksum. Do not commit generated intermediate GIS files unless they are needed to reproduce a release.

## 4. Step-by-Step Build Plan

### Phase 0: Confirm constraints and reduce map risk

1. List target users, devices, browsers, and the person responsible for updates.
2. Keep exact hunting locations and photos private behind Cloudflare Access. Verify that every app asset and data file, not just the landing page, is protected.
3. Use the project's v1.0 SPW imagery assumption and show `© SPW Wallonie`. Record the source/date; formal licensing review is not a pilot gate.
4. Define the pilot boundary, required imagery detail, expected number of features/photos, and maximum first-time download size.
5. Build a tiny PMTiles archive for a representative part of the area. Test it on target phones, including install, airplane mode, reload, pan/zoom, and the expected download size.
6. Make a short technology decision record based on that test. Do not produce the full map archive until it passes.

**Exit check:** private access is verified, attribution is visible, the pilot archive works on supported phones offline, and the download size is acceptable.

### Phase 1: Establish project and data foundations

1. Create the minimal app shell, manifest, icon set, and a local development workflow.
2. Define supported feature types and required properties. Give every feature a stable ID that does not change when its name changes.
3. Define units, coordinate reference expectations, allowed value sets, photo path rules, and optional fields. Use explicit properties rather than overloaded free-text conventions.
4. Keep the sample GeoJSON small and readable. For v1.0, check edits manually by loading the app locally and confirming features appear in the intended locations.
5. Add a few synthetic or non-sensitive example features for development. Keep real sensitive coordinates out of public test fixtures.
6. Document how to edit the GeoJSON, reload locally, and visually check a changed feature.

**Exit check:** sample data renders; a manual edit can be checked locally; editing data requires no changes to application logic.

### Phase 2: Prepare and document map data

1. Use QGIS or an equivalent GIS tool to prepare SPW source imagery for the agreed pilot boundary, following the project's v1.0 private-use assumption.
2. Choose projection, zoom/resolution range, image encoding, and archive format based on visual quality, size, and offline tests.
3. Generate the archive and record the source date, `© SPW Wallonie` attribution, geographic bounds, generation settings, archive size, and checksum.
4. Inspect the exported map for alignment against known landmarks and feature coordinates. Check more than one zoom level and the edges of the coverage area.
5. Decide how users obtain updates: full archive replacement for the pilot, then region-based or delta updates only if measured growth makes full replacement impractical.
6. Keep the source workflow documented so the map is not an opaque one-off file only one person can regenerate.

**Exit check:** the published map has known provenance and coverage, is aligned with field data, meets the size budget, and can be rebuilt by another maintainer.

### Phase 3: Build the core map experience

1. Render the offline-capable basemap and a clear loading/error state.
2. Load validated GeoJSON and render stands, parking points, routes, and zones with distinct, legible symbols and a legend.
3. Add feature selection with essential details, notes, and locally bundled photos. Design for small screens and large touch targets.
4. Add useful filters and a “show all” recovery path so hidden features are easy to restore.
5. Add an optional “locate me” action. Request location only after the user acts, explain permission denial gracefully, and do not send coordinates to a server.
6. Ensure all essential information is available in text and is not conveyed by color alone.

**Exit check:** users can find and inspect every feature on a supported phone, with GPS denied and network unavailable.

### Phase 4: Add weather and wind interpretation

1. Request only the forecast fields needed by the interface, at a clearly chosen representative location or per-location strategy. Avoid excessive repeated API requests.
2. Normalize API data into an app-owned shape with units, observation/forecast time, fetch time, and source.
3. Display wind speed, gusts, and direction with units and an explicit timestamp. Label forecast values as forecasts.
4. Persist the last successful response locally. Show “last updated” and a stale/offline label; never make old data look current.
5. Define directional sectors in degrees and compare angular differences, including wraparound at north. Document whether a direction means “from” or “toward.” Open-Meteo wind direction is conventionally the direction the wind comes from; verify the selected API field and units when implementing.
6. Define behavior for calm or missing wind, API errors, stale data, and directions near sector boundaries. Prefer “unknown/uncertain” over a misleading green/red answer.
7. Test the algorithm with known bearings and boundary cases. Have a domain user review the displayed interpretation.

**Exit check:** known input cases produce expected results; stale or missing data is visibly uncertain; no color is presented as a guarantee of safe conditions.

### Phase 5: Make offline behavior explicit and testable

1. Add a service worker for the app shell and test update behavior on supported phones.
2. Keep one PMTiles archive as the v1.0 map asset; avoid building a custom download manager, quota manager, or storage fallback system.
3. Test cold launch, reload, map navigation, feature selection, photos, and cached weather in airplane mode. Confirm that the selected PMTiles delivery path really works offline.
4. If the offline test fails, pause release and choose a different simple packaging or hosting approach rather than promising offline behavior that has not been verified.

**Exit check:** the one-file PMTiles approach passes on supported devices after install and reload. The app does not claim the map is offline-ready unless the test demonstrates it.

### Phase 6: Privacy, security, and controlled release

1. Confirm whether the deployment is public or access-controlled. Do not treat an unlisted URL as private.
2. Review all deployed files and build artifacts for coordinates, photos, metadata, keys, and private notes. Remove image EXIF/GPS metadata where it is not intended to be shared.
3. Request no more permissions than necessary. Avoid analytics and third-party scripts unless there is a clear, disclosed need.
4. Use HTTPS, pin or update dependencies deliberately, and keep the dependency set small. Keep API responses and user data out of logs unless necessary for diagnosis.
5. Include source attribution, data version, build/release date, and a short contact or issue-reporting route.
6. Publish a test release, verify access from a signed-out browser, test rollback, then share with a small pilot group.

**Exit check:** the public/private exposure is understood, the release contains no accidental secrets or metadata, and rollback has been rehearsed.

### Phase 7: Field test and release

1. Test in the actual terrain and at representative locations. Compare map alignment and route/stand positions with trusted reference points.
2. Test poor connectivity, no connectivity, low battery, screen readability outdoors, gloves/touch use if relevant, and interrupted downloads.
3. Ask a small group to complete practical tasks without coaching: prepare offline, find a stand, understand the wind timestamp, and recover from missing data.
4. Record issues with device/browser, app version, map version, steps, and expected versus actual behavior. Avoid including sensitive coordinates in public issue reports.
5. Fix safety, privacy, data-integrity, and offline failures before visual refinements.
6. Publish a versioned release and keep a known-good prior release available for rollback.

**Exit check:** the field-test checklist passes, maintainers can update data, and users understand the limitations of forecast and offline information.

## 5. Scalability Without Premature Complexity

Scale should be measured in geography, archive size, feature volume, users, and edit frequency. Track these separately; they do not all require a backend.

- **More map coverage:** split by named region or downloadable package. Load only relevant packages and display coverage boundaries. Measure archive size and download time before considering incremental updates.
- **More features:** keep GeoJSON normalized and validate it. If loading/rendering becomes slow, split data by region or layer and load only what is needed. Establish a performance budget on the oldest supported phone.
- **More photos:** resize/compress images, use suitable dimensions, avoid unnecessarily large originals, and load images when a feature is opened. Record credits and remove unwanted metadata.
- **More maintainers:** require review for coordinate and schema changes, retain version history, and provide a preview/staging release. Only add an editing interface when the manual workflow is demonstrably error-prone.
- **More users or controlled sharing:** static hosting can serve many read-only users cheaply, but it does not provide private per-user access by itself. Add authentication and a backend only when access control, synchronization, audit, or collaboration is required.
- **More frequent data updates:** separate data releases from application releases. Publish a manifest with compatible app/data/map versions, checksums, and update instructions.
- **Performance:** measure first on target phones. Set budgets for initial app download, map package size, time to usable map, and feature interaction latency; revisit them as regions are added.

Do not introduce a database, account system, or complex build pipeline solely for hypothetical future growth. Preserve clean module boundaries and stable data contracts so those additions remain possible.

## 6. Trustworthiness Requirements

### Data and map provenance

- Keep the imagery source, `© SPW Wallonie` attribution, capture/update date, and basic export notes with each map dataset. The v1.0 use assumption is documented in the decision table.
- Give each data release a version and publish a checksum or equivalent integrity check for downloadable archives.
- Validate data before release and retain the prior known-good version.
- Show map coverage and map/data version in an about or status view so users can identify outdated installations.

### Weather and wind

- Always show units and the time the forecast applies to, not only the time it was fetched.
- Make stale, missing, and offline data visually distinct from fresh data.
- Explain wind direction conventions and avoid binary “safe/unsafe” claims. Conditions on the ground can differ from a forecast.
- Treat API failure as a normal state and keep the rest of the map usable.

### Privacy and security

- Treat stand coordinates, routes, parking details, and photos as sensitive until the owner explicitly decides otherwise.
- Make no location request on startup; GPS should be optional and user-initiated.
- Avoid collecting accounts, analytics, or location history in the first release.
- If private access is required, use real access control and test it. A public static site cannot protect a GeoJSON file merely by hiding it from navigation.
- Minimize third-party code and data sharing. Review dependency and hosting changes as part of releases.

### User-facing honesty

- Communicate offline readiness, map coverage, last update time, and missing-data states plainly.
- Do not imply that a map is current or complete if it is not.
- Make it clear that the app is an aid, not a substitute for local knowledge, weather judgment, regulations, or safe practice.

## 7. Maintainability and Release Routine

For every data or app release:

1. Edit data using the documented GIS workflow.
2. Load the app locally and visually check that the changed features appear in the expected locations and that the map still loads.
3. Review the map visually and inspect the changed features on a phone-sized viewport.
4. Confirm imagery attribution and remove unintended photo metadata.
5. Build a versioned release and verify its files, sizes, and checksums.
6. Test the release on a staging URL and on supported devices, including offline behavior.
7. Publish, record the app/data/map versions, and retain the prior working release for rollback.
8. Re-test weather behavior and API assumptions periodically; external APIs and browser storage behavior can change.

Keep a concise maintainer guide with the GIS project/source, export steps, validation command, deployment procedure, rollback instructions, and a contact for ownership of the hosting account. Avoid undocumented one-off steps that only exist on one person's computer.

## 8. Test and Acceptance Checklist

### Data and map

- [ ] GeoJSON loads locally and the sample features appear in the expected locations.
- [ ] Changed coordinates and feature shapes have been visually checked against the pilot map.
- [ ] The map is aligned against known landmarks and all published features.
- [ ] Attribution, coverage, source date, size, and version are visible/documented.
- [ ] Photos load offline and contain no unintended location metadata.

### App and offline

- [ ] Install and update work on every supported browser/device.
- [ ] The chosen PMTiles file is available to the app through the intended private deployment.
- [ ] Cold launch, reload, pan/zoom, feature details, and photos work offline on supported phones.

### Weather and wind

- [ ] Units, direction convention, valid time, and last-fetch time are shown.
- [ ] Fresh, stale, unavailable, calm, and boundary-direction cases are tested.
- [ ] API failure does not prevent use of map and feature data.
- [ ] Wind interpretation is reviewed by a knowledgeable user and is not presented as a safety guarantee.

### Privacy and operation

- [ ] Public/private deployment behavior is verified while signed out.
- [ ] No secrets or unintended private coordinates are included in a public release.
- [ ] GPS is optional, foreground-only, and denial is handled.
- [ ] A second maintainer can make and validate a data edit using the guide.
- [ ] Rollback to a known-good release is tested.

## 9. Main Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| PMTiles file is not available offline through the simple v1.0 delivery path | Test the pilot on target phones before preparing the full area; if it fails, choose another straightforward packaging or hosting approach. |
| Archive exceeds browser, host, or user download limits | Prototype early; reduce coverage/resolution or split regions. Keep v1.0 delivery simple and revisit only if measured limits require it. |
| Exact hunting locations become public unintentionally | Decide access policy first; inspect deployed files and test signed-out access. Use access-controlled hosting if needed. |
| Wind comparison is misinterpreted | Define direction semantics and thresholds, test boundary cases, expose uncertainty, and avoid safety guarantees. |
| GIS exports are difficult to reproduce | Keep source project, processing settings, attribution, and a repeatable export guide. |
| External weather API changes or is unavailable | Isolate API mapping, cache last successful data with timestamps, and keep map features independent of weather. |
| Updates replace working offline data with a broken package | Verify a new version before activation and preserve the last known-good version. |

## 10. First Milestone

The first milestone is not the complete app. It is a verified pilot that answers the highest-risk questions:

1. Confirm Cloudflare Access protects the site and its files; include the SPW attribution.
2. Select target phones and define the offline download-size budget.
3. Export one small representative map package.
4. Display that package and a few non-sensitive sample features in a minimal PWA.
5. Install it and verify airplane-mode behavior on the target phones.
6. Decide whether the map format, renderer, host, and storage approach are viable.

Only after that milestone passes should the full map area and real hunting data be prepared. This keeps the expensive GIS work downstream of the decisions most likely to change the design.