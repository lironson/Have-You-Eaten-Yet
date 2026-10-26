# Have You Eaten Yet?

Turn your trip's food photos into a ranked, shareable guide for friends visiting the same place.

1. **Upload** – pick dish/restaurant photos from your phone. They're downscaled on-device.
   Optionally tap **Collect photos from friends** to show a QR code: friends scan it and their photos
   go straight to your phone over WebRTC (PeerJS), with no storage server.
2. **Rank** – drag to reorder (works with touch) or, if you can't decide, run a 1v1 tournament
   bracket that picks your top 4. Add a dish title and tag the restaurant
   via a quick search (OpenStreetMap, no API key) that links to Google Maps.
3. **Share** – a printable guide with an interactive **map** of the restaurants (Leaflet +
   OpenStreetMap): print / save as PDF (the Top 3 always fit page one), share the text list, or
   download a single self-contained HTML file with every photo inside and a working map.

Everything stays in your browser (IndexedDB); nothing is uploaded to a server.

## Run locally

It's a static site with no build step:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Any static host works (e.g. GitHub Pages: Settings → Pages → deploy from branch). The friends QR
needs the site on a public HTTPS URL, since a QR pointing at `localhost` won't open on other phones.
PeerJS's free public broker is used only to introduce the phones; to test against a local
PeerServer, add `?peerserver=127.0.0.1:9000` to the URL.

## Layout

| File | Purpose |
| --- | --- |
| `index.html`, `js/app.js` | Shell and hash router (`#upload`, `#rank`, `#summary`) |
| `js/state.js` | Trip data model + IndexedDB persistence |
| `js/upload.js`, `css/upload.css` | Upload screen |
| `js/rank.js`, `css/rank.css` | Ranking screen |
| `js/bracket.js`, `css/bracket.css` | "Can't decide?" tournament bracket overlay |
| `js/summary.js`, `css/summary.css` | Printable summary |
| `js/map.js`, `css/map.css` | "Where to eat" map; looks up missing restaurant locations once |
| `js/load.js` | Lazy loader for vendored libraries |
| `js/invite.js`, `js/join.js`, `js/peer.js`, `css/invite.css` | Friends QR: host panel, guest screen (`#join=<id>`), shared helpers |
| `js/images.js` | Shared photo decode + downscale |
| `vendor/` | PeerJS, qrcode-generator and Leaflet, each loaded only when used |
| `css/base.css` | Design tokens and shared components |
