# IPEC Sales Dashboard (Static, CSV/JSON via Apps Script)

## How it works
- Front-end only (no secrets).  
- Fetches your Google Sheet through your Apps Script web app:
  - CSV: `${GAS_BASE}?csv=1&id=${SHEET_ID}&gid=${GID}`
  - JSON fallback: `${GAS_BASE}?json=1&id=${SHEET_ID}&gid=${GID}`

## Configure
Edit `config.js`:
- `GAS_BASE` → your deployed Apps Script `/exec` URL
- `SHEET_ID` → `1sHqHEXsTAXDOUMR4dCGq75mUOc0IY86LdwO6j8msw3Q`
- `GID` → `883389324`
- `IMAGES_BASE` if you move your images

## Sheet headers (must match exactly)
