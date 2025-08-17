<script>
// ====== CONFIG (edit these if you switch file/tab) ======
window.GAS_BASE =
  "https://script.google.com/macros/s/AKfycbwHEpdvjkfMkYLUbwyzKmyqgEI_xi7cqXWsWfu2bjr1VZstQeaaQUxsqlg36Ux5Nf63Yg/exec";

window.SHEET_ID = "1sHqHEXsTAXDOUMR4dCGq75mUOc0IY86LdwO6j8msw3Q";
window.GID = "883389324";

// Where item pictures are stored in your repo. Filenames must = ItemCode (col F)
window.IMAGES_BASE = "./public/images/";
window.IMAGE_EXTS = [".webp", ".jpg", ".png"];

// URLs built with your same logic (CSV primary, JSON fallback)
window.CSV_URL  = `${window.GAS_BASE}?csv=1&id=${window.SHEET_ID}&gid=${window.GID}`;
window.JSON_URL = `${window.GAS_BASE}?json=1&id=${window.SHEET_ID}&gid=${window.GID}`;
</script>
