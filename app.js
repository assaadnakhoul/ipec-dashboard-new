/***********************
 * app.js
 ***********************/

// Simple logger to diagnostics panel
function log(...args) {
  console.log(...args);
  const diag = document.getElementById("diagnostics");
  diag.textContent += args.join(" ") + "\n";
}

// Build image URL from ItemCode
function getImageUrl(code) {
  if (!code) return "";
  for (const ext of window.IMAGE_EXTS) {
    return window.IMAGES_BASE + code + ext; // fallback first hit
  }
  return "";
}

// Fetch JSON from Google Apps Script
async function fetchDataJSON() {
  if (!window.JSON_URLS || !window.JSON_URLS.length) {
    throw new Error("No JSON_URLS configured (check config.js)");
  }
  let lastErr;
  for (const url of window.JSON_URLS) {
    try {
      log("Fetching JSON:", url);
      const res = await fetch(url, { method: "GET", mode: "cors", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const rows = Array.isArray(json) ? json : (json.data || []);
      log(`Loaded ${rows.length} rows`);
      return rows;
    } catch (e) {
      lastErr = e;
      log("Fetch failed for", url, String(e));
    }
  }
  throw lastErr || new Error("All JSON sources failed");
}

// Render KPIs
function renderKPIs(rows) {
  const total = rows.reduce((sum, r) => sum + (parseFloat(r.LineTotal) || 0), 0);
  document.getElementById("turnover").textContent = total.toLocaleString();

  // top client
  const clients = {};
  rows.forEach(r => {
    const c = r.Client || r.ClientName || "Unknown";
    clients[c] = (clients[c] || 0) + (parseFloat(r.LineTotal) || 0);
  });
  const topClient = Object.entries(clients).sort((a,b)=>b[1]-a[1])[0];
  if (topClient) document.getElementById("top-client").textContent = topClient[0];

  // best item
  const items = {};
  rows.forEach(r => {
    const i = r.ItemCode || "Unknown";
    items[i] = (items[i] || 0) + (parseFloat(r.Qty) || 0);
  });
  const bestItem = Object.entries(items).sort((a,b)=>b[1]-a[1])[0];
  if (bestItem) document.getElementById("best-item").textContent = bestItem[0];
}

// Render Items Grid
function renderItems(rows) {
  const grid = document.getElementById("items-grid");
  grid.innerHTML = rows.map(r => {
    const imgUrl = getImageUrl(r.ItemCode);
    return `
      <div class="item-card">
        <img src="${imgUrl}" alt="${r.ItemCode}">
        <div class="title">${r.ProductDescription || r.Description || r.ItemCode}</div>
        <div class="meta">Qty: ${r.Qty || 0} | Value: $${r.LineTotal || 0}</div>
      </div>
    `;
  }).join("");
}

// Filtering & Search
function applyFilters(rows) {
  const type = document.getElementById("filter-type").value;
  const search = document.getElementById("search").value.toLowerCase();

  return rows.filter(r => {
    const typeOk = !type || r.Type === type;
    const text = [
      r.Client, r.ItemCode, r.ProductDescription, r.Category, r["Sub-category"]
    ].join(" ").toLowerCase();
    const searchOk = !search || text.includes(search);
    return typeOk && searchOk;
  });
}

// Init
(async () => {
  try {
    const rows = await fetchDataJSON();

    renderKPIs(rows);
    renderItems(rows.slice(0, 20));

    // Hook filters
    document.getElementById("search").addEventListener("input", () => {
      const filtered = applyFilters(rows);
      renderItems(filtered.slice(0, 20));
    });
    document.getElementById("filter-type").addEventListener("change", () => {
      const filtered = applyFilters(rows);
      renderItems(filtered.slice(0, 20));
    });
  } catch (err) {
    log("FATAL:", err);
  }
})();
