# Link-preview assets (Open Graph)

Source for the branded social-share card and favicon/app icons rendered to
`assets/static/images/{og-cover.png,apple-touch-icon.png,favicon.png}`.

- `og-card.html` — the 1200×630 share card (coverage-bloom motif, Buoy.Fish orange).
- `icon.html` — the 7-hex "coverage bloom" mark used for the icons.
- `render-all.mjs` — renders both to PNG via headless Chrome (puppeteer-core).

Regenerate (requires a local Chrome + a puppeteer-core install path):

```bash
node tools/og-card/render-all.mjs   # writes PNGs to /tmp/og-build
# then resize icons and copy into assets/static/images/:
sips -z 180 180 /tmp/og-build/apple-touch-icon.png
sips -z 48 48  /tmp/og-build/favicon.png
cp /tmp/og-build/{og-cover,apple-touch-icon,favicon}.png assets/static/images/
```

The card/title/description live server-side in `lib/mappers_web/og_meta.ex`
(default branded card; ?play= timeline links get a Mapbox satellite preview of
the framed area). Meta tags are emitted in `templates/layout/app.html.eex`.
