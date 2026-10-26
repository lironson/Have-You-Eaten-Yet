# Have You Eaten Yet?

Turn your trip's food photos into a ranked, shareable guide for friends visiting the same place.

1. **Upload** – pick dish/restaurant photos from your phone. They're downscaled on-device.
2. **Rank** – drag to reorder (works with touch) or, if you can't decide, run a 1v1 tournament
   bracket that picks your top 4. Add a dish title and tag the restaurant
   via a quick search (OpenStreetMap, no API key) that links to Google Maps.
3. **Share** – a printable guide: print / save as PDF, share the text list, or download a single
   self-contained HTML file with every photo inside.

Everything stays in your browser (IndexedDB); nothing is uploaded to a server.

## Run locally

It's a static site with no build step:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Any static host works (e.g. GitHub Pages: Settings → Pages → deploy from branch).

## Layout

| File | Purpose |
| --- | --- |
| `index.html`, `js/app.js` | Shell and hash router (`#upload`, `#rank`, `#summary`) |
| `js/state.js` | Trip data model + IndexedDB persistence |
| `js/upload.js`, `css/upload.css` | Upload screen |
| `js/rank.js`, `css/rank.css` | Ranking screen |
| `js/bracket.js`, `css/bracket.css` | "Can't decide?" tournament bracket overlay |
| `js/summary.js`, `css/summary.css` | Printable summary |
| `css/base.css` | Design tokens and shared components |
