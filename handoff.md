# Hunting Map PWA - Project Blueprint

## 🎯 Project Overview
A custom, offline-capable Progressive Web App (PWA) for managing and sharing hunting stands, shooting lines, and approach routes in Beauraing, Belgium. The app is completely free, avoids subscription paywalls, and is maintainable by editing a single data file.

## 📋 Core Requirements & Solutions
1. **High-Res Satellite View (Offline)**
   * *Problem:* Off-the-shelf free maps lack good satellite resolution for rural Belgium.
   * *Solution:* Tap into Wallonia's official SPW (Service Public de Wallonie) orthophotos. Use QGIS to download the Beauraing area and package it into a single `.pmtiles` file for local offline rendering.
2. **Weather & Wind Forecast**
   * *Solution:* Integrate the free **Open-Meteo API**. Fetch current, tomorrow, and day-after forecasts (wind speed, gusts, direction). Save this data to local storage (IndexedDB/localStorage) so the app remembers the last fetched weather when taken offline in the woods.
3. **Smart Wind Roses & Approach Routes**
   * *Solution:* Store `ideal_wind` directions in the stand's data. Use Leaflet plugins (e.g., `leaflet-semicircle`) to draw a zone around the stand. Write a JavaScript function to compare the current Open-Meteo wind direction against the stand's `ideal_wind` array, turning the zone **Green** (safe to hunt) or **Red** (wind blows scent into the shooting zone).
4. **Rich Stand Metadata & Pictures**
   * *Solution:* Store images locally in the app's `assets/images/` folder. Define parking info, notes, and image paths in the GeoJSON data. When a stand is tapped, a Leaflet popup reads this data and displays the image and info completely offline.

---

## 🛠 Tech Stack
* **Frontend:** HTML, CSS, Vanilla JavaScript.
* **Mapping Engine:** [Leaflet.js](https://leafletjs.com/) (lightweight, huge plugin ecosystem) or MapLibre GL JS.
* **Map Tiles Engine:** [PMTiles](https://protomaps.com/docs/pmtiles) (renders offline map archives in the browser).
* **Data Format:** GeoJSON (holds all stands, approach trails, and shooting vectors).
* **Weather API:** [Open-Meteo](https://open-meteo.com/) (Free, no API key needed).
* **Hosting:** GitHub Pages, Cloudflare Pages, or Netlify (All free, SSL included).

---

## 📂 Recommended Project Structure
```text
hunting-map-pwa/
│
├── index.html               # Main app layout and map container
├── manifest.json            # Makes the web app installable (PWA)
├── sw.js                    # Service Worker (handles offline caching for code/images)
├── app.js                   # Main logic (Leaflet setup, weather fetch, wind logic)
├── style.css                # App styling
│
├── data/
│   ├── hunting_data.geojson # All your stands, lines, and metadata
│   └── beauraing_sat.pmtiles# Offline satellite map file
│
└── assets/
    ├── icons/               # App icons (for home screen)
    ├── map-markers/         # Custom marker SVGs (stands, parking, arrows)
    └── images/              # Photos of the views from the stands (compressed)
```

---

## 📄 Data Schema Example (GeoJSON)
This is how a hunting stand will look in your `data/hunting_data.geojson` file:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [4.9575, 50.1086] // [Longitude, Latitude] for Beauraing area
      },
      "properties": {
        "id": "stand_01",
        "name": "The Old Oak Stand",
        "type": "high_seat",
        "parking": "North Gate",
        "ideal_wind": ["N", "NW", "NE"], // Safe wind directions
        "approach_bearing": 180, // Approach from the South
        "image_url": "assets/images/stand_01_view.jpg",
        "notes": "Watch out for the muddy ditch on the approach."
      }
    }
    // ... add approach LineStrings and shooting zone Polygons here as well
  ]
}
```

---

## 🚀 Step-by-Step Implementation Plan

### Phase 1: Data Foundation
1. Create your `hunting_data.geojson` file.
2. Use a tool like [geojson.io](https://geojson.io/) to visually drop pins on your Beauraing hunting grounds and fill out the properties (name, ideal wind, parking).

### Phase 2: Offline Satellite Map
1. Install [QGIS](https://qgis.org/).
2. Add the Wallonia SPW Orthophotos as an XYZ/WMS layer.
3. Draw a bounding box around your exact hunting zone.
4. Export the map tiles as an MBTiles or PMTiles archive. (Keep the area small to keep the file size under 100MB).

### Phase 3: The Map Interface
1. Set up `index.html` with Leaflet.js.
2. Load the `.pmtiles` file into Leaflet so the offline map appears.
3. Fetch the `hunting_data.geojson` file in your `app.js` and render the stands as custom icons.

### Phase 4: Weather & Wind Logic
1. Write a function to fetch weather from `https://api.open-meteo.com/v1/forecast?latitude=50.108&longitude=4.957&current_weather=true`.
2. Save the response to `localStorage`.
3. Draw semicircles (wind roses) around each stand on the map.
4. Write logic: `if current_wind matches ideal_wind -> color = Green, else color = Red`.

### Phase 5: Go Offline (PWA)
1. Add a `manifest.json` file so phones recognize it as an app.
2. Write a Service Worker (`sw.js`) to cache `index.html`, `app.js`, `style.css`, Leaflet libraries, and everything in the `assets/` folder.
3. Push to GitHub, enable GitHub Pages, and open the link on your phone to install!
