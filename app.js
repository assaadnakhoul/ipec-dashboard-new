/***********************
 * IPEC Dashboard (JSON source)
 * Expects: window.JSON_URL (set in config.js)
 * UI: uses elements/ids from the neat layout we shared
 ***********************/

// ---- Expected headers (we'll auto-map common variants) ----
const EXPECTED = {
  InvoiceFile: ["InvoiceFile", "Date", "Invoice File"],
  InvoicePath: ["InvoicePath", "Invoice", "Invoice No", "InvoiceNum", "Invoice Number"],
  Type: ["Type", "Invoice Type"],
  Client: ["Client", "Customer", "Client Name"],
  Phone: ["Phone", "Client Phone", "Phone Number"],
  ItemCode: ["ItemCode", "Item Code", "Code", "SKU"],
  Description: ["Product/Description", "ProductDescription", "Product Description", "Description"],
  Qty: ["Qty", "Quantity", "QTY"],
  UnitPrice: ["UnitPrice", "Unit Price", "Price"],
  LineTotal: ["LineTotal", "Line Total", "Amount", "Total"],
  InvoiceTotal: ["InvoiceTotal", "Invoice Total", "Grand Total"],
  Supplier: ["Supplier", "Vendor"],
  Category: ["Category"],
  Subcategory: ["Sub-category", "Subcategory", "Sub Category"]
};

// ---- tiny utils ----
const log = (...a) => {
  console.log(...a);
  const el = document.getElementById("diag-log");
  if (el) el.textContent += a.map(x => (typeof x === "string" ? x : JSON.stringify(x, null, 2))).join(" ") + "\n";
};

const fmtMoney = n => (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtInt   = n => (n ?? 0).toLocaleString();
function num(x) {
  if (x == null) return 0;
  let s = String(x).trim().replace(/[^\d.,-]/g, "");
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(".") > s.lastIndexOf(",")) s = s.replace(/,/g, "");
    else s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}
const typeLabel = t => {
  const x = String(t || "").toUpperCase();
  if (x === "A" || x === "TYPE A") return "INVOICE OUT";
  if (x === "B" || x === "TYPE B") return "INVOICE IN";
  return "";
};
function imgWithFallback(code, alt = "") {
  const base = window.IMAGES_BASE || "./public/images/";
  const exts = window.IMAGE_EXTS || [".webp", ".jpg", ".png"];
  if (!code) return `<div class="w-12 h-12 rounded bg-gray-100"></div>`;
  const first = base + code + exts[0];
  const onerr = exts
    .slice(1)
    .map((ext, i) => {
      const next = base + code + ext;
      return `this.onerror=${i === exts.length - 2 ? "null" : "function(){this.onerror=null;this.src='${next}'}"};this.src='${next}'`;
    })
    .join(";");
  return `<img src="${first}" onerror="${onerr}" alt="${alt}" class="w-12 h-12 object-cover rounded border" />`;
}

// ---- JSON fetcher (your Apps Script returns JSON) ----
async function fetchDataJSON() {
  if (!window.JSON_URL) throw new Error("window.JSON_URL is not defined (check config.js)");
  log("Fetching JSON:", window.JSON_URL);
  const res = await fetch(window.JSON_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const json = await res.json();
  // Support both { ok:true, data:[...] } and plain arrays
  const rows = Array.isArray(json) ? json : (json.data || json.rows || []);
  if (!Array.isArray(rows)) throw new Error("Unexpected JSON structure (no array of rows)");
  document.getElementById("badge-source").textContent = "Apps Script JSON";
  log(`Loaded ${rows.length} rows from JSON`);
  return rows;
}

// ---- header auto-map for JSON objects ----
function mapKeysForRow(obj) {
  // Build a map only once per run from EXPECTED → actual key used in obj
  const actual = {};
  const keysLower = Object.keys(obj).reduce((acc, k) => (acc[k.toLowerCase()] = k, acc), {});
  for (const canon of Object.keys(EXPECTED)) {
    let hit = null;
    for (const variant of EXPECTED[canon]) {
      const lower = variant.toLowerCase();
      if (keysLower[lower]) { hit = keysLower[lower]; break; }
    }
    actual[canon] = hit || null; // may be null if missing
  }
  return actual;
}

// ---- normalization (JSON rows → canonical row objects) ----
function normalizeFromJSON(rows) {
  if (!rows.length) return [];
  const keyMap = mapKeysForRow(rows[0]);
  log("Key map:", keyMap);

  return rows.map(r => {
    const get = name => (keyMap[name] ? r[keyMap[name]] : "");
    const qty  = num(get("Qty"));
    const unit = num(get("UnitPrice"));
    const lt   = get("LineTotal") !== "" ? num(get("LineTotal")) : qty * unit;
    const tRaw = get("Type");

    return {
      date: get("InvoiceFile") || r.Date || "",
      client: get("Client") || "",
      phone: get("Phone") || "",
      type: String(tRaw || "").toUpperCase(),
      typeLabel: typeLabel(tRaw),
      invoice: get("InvoicePath") || r.Invoice || "",
      code: String(get("ItemCode") || "").trim().toUpperCase().replace(/\s+/g, ""),
      desc: get("Description") || "",
      qty, unit, line: lt,
      invTotal: num(get("InvoiceTotal")),
      supplier: get("Supplier") || "",
      category: get("Category") || "",
      subcat: get("Subcategory") || ""
    };
  }).filter(o => Object.values(o).some(v => v !== "" && v != null));
}

// ---- filters / aggregates ----
const uniqueSorted = vals => Array.from(new Set(vals.filter(Boolean))).sort((a, b) => a.localeCompare(b));
function applyFilters(rows) {
  const type = document.querySelector('input[name="type"]:checked').value;
  const q = document.getElementById("search").value.trim().toLowerCase();
  const cat = document.getElementById("filter-category").value;
  const sub = document.getElementById("filter-subcat").value;
  return rows.filter(r => {
    if (type !== "ALL" && r.type !== type) return false;
    if (cat && r.category !== cat) return false;
    if (sub && r.subcat !== sub) return false;
    if (q) {
      const hay = [r.client, r.code, r.category, r.subcat, r.desc].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
function aggregate(rows) {
  const invoices = new Set(rows.map(r => r.invoice).filter(Boolean)).size;
  const totalTurnover = rows.reduce((s, r) => s + (r.line || 0), 0);
  const totalQty = rows.reduce((s, r) => s + (r.qty || 0), 0);
  const avg = invoices ? totalTurnover / invoices : 0;

  const a = {}, b = {};
  rows.forEach(r => {
    if (!r.client) return;
    if (r.type === "A") a[r.client] = (a[r.client] || 0) + r.line;
    if (r.type === "B") b[r.client] = (b[r.client] || 0) + r.line;
  });
  const topA = Object.entries(a).sort((x, y) => y[1] - x[1]).slice(0, 10);
  const topB = Object.entries(b).sort((x, y) => y[1] - x[1]).slice(0, 10);

  const byVal = {}, byQty = {}, meta = {};
  rows.forEach(r => {
    if (!r.code) return;
    byVal[r.code] = (byVal[r.code] || 0) + r.line;
    byQty[r.code] = (byQty[r.code] || 0) + r.qty;
    if (!meta[r.code]) meta[r.code] = { desc: r.desc, category: r.category, subcat: r.subcat };
  });
  const bestVal = Object.entries(byVal).sort((x, y) => y[1] - x[1]).slice(0, 10)
    .map(([code, val]) => ({ code, val, ...meta[code] }));
  const bestQty = Object.entries(byQty).sort((x, y) => y[1] - x[1]).slice(0, 10)
    .map(([code, qty]) => ({ code, qty, ...meta[code] }));

  return { invoices, totalTurnover, totalQty, avg, topA, topB, bestVal, bestQty };
}

// ---- rendering ----
function renderKPIs(a) {
  document.getElementById("kpi-turnover").textContent = fmtMoney(a.totalTurnover);
  document.getElementById("kpi-invoices").textContent = fmtInt(a.invoices);
  document.getElementById("kpi-qty").textContent = fmtInt(a.totalQty);
  document.getElementById("kpi-avg").textContent = fmtMoney(a.avg);
}
function renderTopList(el, items) {
  el.innerHTML = "";
  items.forEach(([name, amount]) => {
    const li = document.createElement("li");
    li.className = "flex justify-between border-b last:border-0 py-1 text-sm";
    li.innerHTML = `<span class="truncate">${name}</span><span class="num font-semibold">${fmtMoney(amount)}</span>`;
    el.appendChild(li);
  });
}
function renderBest(el, list, kind) {
  el.innerHTML = "";
  list.forEach(it => {
    const rhs = kind === "val"
      ? `<div class="num font-semibold">${fmtMoney(it.val)}</div>`
      : `<div class="num font-semibold">${fmtInt(it.qty)}</div>`;
    const li = document.createElement("li");
    li.className = "flex items-center gap-3 border-b last:border-0 pb-2";
    li.innerHTML = `
      ${imgWithFallback(it.code, it.code)}
      <div class="flex-1 min-w-0">
        <div class="font-medium truncate">${it.code}</div>
        <div class="text-xs text-gray-500 truncate">${it.desc || ""}</div>
      </div>
      ${rhs}
    `;
    el.appendChild(li);
  });
}
function renderRows(tbody, rows) {
  tbody.innerHTML = "";
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.className = "border-b";
    tr.innerHTML = `
      <td class="p-2">${r.date || ""}</td>
      <td class="p-2">${r.client}</td>
      <td class="p-2">${r.typeLabel}</td>
      <td class="p-2">${r.invoice}</td>
      <td class="p-2">${r.code}</td>
      <td class="p-2">${r.desc}</td>
      <td class="p-2 text-right num">${fmtInt(r.qty)}</td>
      <td class="p-2 text-right num">${fmtMoney(r.unit)}</td>
      <td class="p-2 text-right num">${fmtMoney(r.line)}</td>
      <td class="p-2">${r.category}</td>
      <td class="p-2">${r.subcat}</td>
    `;
    tbody.appendChild(tr);
  });
}
function buildFilters(all) {
  const cats = uniqueSorted(all.map(r => r.category));
  const subs = uniqueSorted(all.map(r => r.subcat));
  const catSel = document.getElementById("filter-category");
  const subSel = document.getElementById("filter-subcat");
  cats.forEach(c => { const o = document.createElement("option"); o.value = c; o.textContent = c; catSel.appendChild(o); });
  subs.forEach(s => { const o = document.createElement("option"); o.value = s; o.textContent = s; subSel.appendChild(o); });
}

// ---- main ----
async function main() {
  const diag = document.getElementById("diag");
  const btnDiag = document.getElementById("btn-diag");
  const btnClose = document.getElementById("btn-close-diag");
  if (btnDiag) btnDiag.onclick = () => diag.classList.toggle("hidden");
  if (btnClose) btnClose.onclick = () => diag.classList.add("hidden");

  try {
    const raw = await fetchDataJSON();
    if (!raw.length) {
      document.getElementById("badge-source").textContent = "Apps Script JSON";
      document.getElementById("table-note").textContent = "No rows found. Check the tab or filters.";
      log("JSON returned 0 rows");
      return;
    }

    const all = normalizeFromJSON(raw);
    document.getElementById("badge-total-rows").textContent = `${all.length} rows`;
    buildFilters(all);

    const renderAll = () => {
      const filtered = applyFilters(all);
      const agg = aggregate(filtered);
      renderKPIs(agg);
      renderTopList(document.getElementById("list-topA"), agg.topA);
      renderTopList(document.getElementById("list-topB"), agg.topB);
      renderBest(document.getElementById("list-value"), agg.bestVal, "val");
      renderBest(document.getElementById("list-qty"), agg.bestQty, "qty");
      renderRows(document.getElementById("rows"), filtered);
    };

    document.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener("change", renderAll));
    document.getElementById("search").addEventListener("input", renderAll);
    document.getElementById("filter-category").addEventListener("change", renderAll);
    document.getElementById("filter-subcat").addEventListener("change", renderAll);

    renderAll();
  } catch (err) {
    log("FATAL:", String(err));
    document.getElementById("badge-source").textContent = "Error";
    const note = document.getElementById("table-note");
    if (note) note.textContent = "Failed to load data. Open Diagnostics.";
  }
}

main();
