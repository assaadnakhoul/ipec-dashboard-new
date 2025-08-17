<script>
window.GAS_BASE = "https://script.google.com/macros/s/AKfycbwsvBV8yNbAzvaapA4H_WkFPC6PmALh4f8ohg8mXmx81CJ_81sAS5uJGQ3uQ7CHgLr1Iw/exec";
window.SHEET_ID = "1L2gSAJn0-3P7N8ZLxNW69-Bta__qjj2PTXG6jHrznwc";
window.GID      = "1030879494";

window.CSV_URL  = `${window.GAS_BASE}?csv=1&id=${window.SHEET_ID}&gid=${window.GID}`;
// (your script doesn’t support json=1 → it returns 404, so JSON fallback is useless)
// Optional 3rd fallback if you publish the tab as CSV from Sheets:
window.PUBLISH_CSV_URL = ""; // e.g. https://docs.google.com/spreadsheets/d/e/...&output=csv

window.IMAGES_BASE = "./public/images/";
window.IMAGE_EXTS  = [".webp", ".jpg", ".png"];
</script>
