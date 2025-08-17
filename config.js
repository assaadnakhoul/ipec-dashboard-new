<script>
// Apps Script (same as yours)
window.GAS_BASE = "https://script.google.com/macros/s/AKfycbwsvBV8yNbAzvaapA4H_WkFPC6PmALh4f8ohg8mXmx81CJ_81sAS5uJGQ3uQ7CHgLr1Iw/exec";

// NEW sheet
window.SHEET_ID = "1cds1S3bfEQwKUodIZhS46r5TMol_iwHO";

// TODO: set this to the correct tab gid (see step 2)
window.GID = "0"; // temporary; replace with the real gid of the tab you want

// Build CSV endpoint (primary source)
window.CSV_URL  = `${window.GAS_BASE}?csv=1&id=${window.SHEET_ID}&gid=${window.GID}`;

// Optional fallback if you “Publish to the web” as CSV:
window.PUBLISH_CSV_URL = ""; // e.g. https://docs.google.com/spreadsheets/d/e/...&output=csv

// Images
window.IMAGES_BASE = "./public/images/";
window.IMAGE_EXTS  = [".webp", ".jpg", ".png"];
</script>
