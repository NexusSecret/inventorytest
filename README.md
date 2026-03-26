# Inventory Grid App

If the grid appears blank (no cells, no button behavior), the page is usually being opened in a way that does not load local JS/CSS correctly.

## Recommended run (Linux / Steam Deck / Windows)

From the project folder:

```bash
python3 -m http.server 4173
```

Then open:

- `http://127.0.0.1:4173`

> If hosting on S3/static hosting, make sure `index.html`, `app.js`, and `styles.css` are uploaded at the same path level and served with standard web MIME types (`text/html`, `application/javascript`, `text/css`).

## Files

- `index.html` – app shell and modals
- `styles.css` – styles
- `app.js` – grid + inventory logic
