# Inventory Grid App

If the grid appears blank (no cells, no button behavior), the page is usually being opened in a way that does not load local JS/CSS correctly.

## Recommended run (Linux / Steam Deck / Windows)

From the project folder:

```bash
python3 -m http.server 4173
```

Then open:

- `http://127.0.0.1:4173`

> Avoid opening `index.html` directly with `file://...` in browsers that restrict local script/style loading.

## Files

- `index.html` – app shell and modals
- `styles.css` – styles
- `app.js` – grid + inventory logic
