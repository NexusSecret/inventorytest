# Inventory Management system

If your app works on **Windows/Chromium** but JS/CSS fail on **Linux, iOS, or AWS**, the issue is usually one of these:

1. **Windows-only paths in HTML**
   - ❌ `src="assets\app.js"`
   - ✅ `src="assets/app.js"`
2. **Case sensitivity mismatch** (Linux/iOS are case-sensitive)
   - ❌ `href="Css/style.css"` when file is `css/style.css`
3. **Opening HTML via `file://` instead of serving via HTTP**
   - Browsers enforce different security/path behavior for local files.
4. **Incorrect static file routing in production**
   - On AWS, app servers/load balancers must route `/css`, `/js`, `/images` correctly.

## Quick checker

Run this validator to catch broken static references:

```bash
python3 tools/check_static_assets.py .
```

It checks HTML `src`/`href` references for:
- Windows backslashes (`\\`)
- Missing files
- File-name case mismatches

## Deployment notes

- Keep all static references URL-style (`/` separators), never OS path style.
- Ensure your web server is serving static files with correct MIME types:
  - `.css` → `text/css`
  - `.js` → `application/javascript` (or `text/javascript`)
- If using a backend framework, configure static root/public directory and use framework helpers for static URLs.

