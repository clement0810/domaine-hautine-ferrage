# Station page collection prototype

This opt-in research script reads the public HTML station pages, not an official API. It does not collect automatically, publish data, maintain history, or change the app's wind cone. Obtain any necessary permission from Weather Underground as well as station owners before automating, redistributing, or combining their data; the site's terms and HTML can change. Do not copy website credentials or API keys into the repository.

Requires Node.js 20.18.1 or newer:

```sh
npm ci --prefix scripts/stations
npm test --prefix scripts/stations
npm run collect --prefix scripts/stations
```

By default the collector requests Hour (IHOUYE10), Herhet (IHOUYE15), and Vidocq (IHOUYE4). Pass station IDs after `--` to choose others. Each station is fetched once, sequentially. JSON output labels the source, UTC observation time, check time, age, status and metric wind values. `recent` only means the page reports a connected observation within 30 minutes; it is not an accuracy guarantee. `stale`, `future`, `disconnected`, and `unavailable` readings must not be presented as live. The 30-minute threshold is a conservative application choice, not a sensor guarantee. A nonzero exit indicates at least one request or parsing failure. Wind direction is reported as the direction the wind comes from. At calm speeds direction may be meaningless.

This prototype depends on undocumented page markup and metric units. It is not a forecast and cannot calculate local wind or scent dispersion at a post. Keep observations and credentials off the public repository unless their redistribution is authorized.

The optional `.github/workflows/station-research.yml` workflow runs on a 10-minute schedule and on manual dispatch after it is committed to the default branch. After confirming platform data-use rights, set the repository variable `TWC_WU_AUTOMATION_APPROVED=true` and allow GitHub Actions to write repository contents. The workflow creates the separate `wind-observations` branch if needed and never pushes to `main`. It writes `latest.json` and appends daily `history/YYYY-MM-DD.jsonl` records with the separate forecast. Git history retains previous data; manage retention and repository growth deliberately. It also uploads a 30-day artifact including partial station errors; collection failures mark the run failed. A failed branch checkout or push leaves the artifact for diagnosis.

The weather tab reads `latest.json` from that public branch and saves the last successful snapshot in localStorage for offline use. It refreshes when opened, every 10 minutes while visible, and when returning to the foreground. It recomputes age and keeps station observations separate from the Open-Meteo forecast and wind cone. Until the branch exists and the workflow has run successfully, the app reports stations unavailable. The raw GitHub URL and repository owner are configured in `app.js`; change them if this project is hosted in a different repository.

Standard GitHub-hosted runners are free for public repositories, while artifact storage is subject to account allowances. Scheduled runs can be delayed or dropped, and public-repository schedules can be disabled after 60 days of inactivity. The repository and this branch are public; confirm you may store and redistribute observations before enabling the workflow. Do not treat the snapshots as an operational wind prediction.

For downloaded artifacts, `node scripts/stations/compare.mjs station-observations.json forecast.json` compares each recent station with the forecast at its valid time. Observations must be within 30 minutes of the forecast time. Direction differences use circular arithmetic and are omitted below 5 km/h; these thresholds are research choices, not validated local error bounds. Results compare station and regional model only; they do not validate or correct wind at the hunting posts. The inputs and differences can support later held-out analysis if snapshots are retained beyond artifact expiry.