<script>
// ===== DATA SOURCE (your existing Apps Script + new sheet) =====
window.GAS_BASE = "https://script.google.com/macros/s/AKfycbwsvBV8yNbAzvaapA4H_WkFPC6PmALh4f8ohg8mXmx81CJ_81sAS5uJGQ3uQ7CHgLr1Iw/exec";
window.SHEET_ID = "1L2gSAJn0-3P7N8ZLxNW69-Bta__qjj2PTXG6jHrznwc";
window.GID      = "1030879494";

// Build endpoints (CSV first, JSON fallback)
window.CSV_URL  = `${window.GAS_BASE}?csv=1&id=${window.SHEET_ID}&gid=${window.GID}`;
window.JSON_URL = `${window.GAS_BASE}?json=1&id=${window.SHEET_ID}&gid=${window.GID}`;

// Optional 3rd fallback if you also publish the tab to the web as CSV:
window.PUBLISH_CSV_URL = ""; // put https://docs.google.com/spreadsheets/d/e/...&output=csv here if you want

// Images (filenames must equal ItemCode from column F)
window.IMAGES_BASE = "./public/images/";
window.IMAGE_EXTS  = [".webp", ".jpg", ".png"];
</script>
