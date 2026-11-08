# Stand Photos

Place stand photos in this folder as JPG files. The GeoJSON `image` property should use a relative path such as `./images/stands/18h.jpg`.

Use the filenames already assigned to stand features in `data/hunting-data.geojson`. The currently mapped photos are listed in `sw.js` and checked by `index.html`; each file must exist for the offline cache install to complete. When adding another photo, set its GeoJSON `image` path, add the path to both lists, bump the cache version in `sw.js` and `index.html`, then publish and reopen the app online. Missing/unmatched photos are omitted from popups and are not part of the required offline package.
