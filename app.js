// ===== Column headers exactly as in your sheet =====
const COLS = {
  InvoiceFile: "InvoiceFile",          // (A) often contains a date/filename
  InvoicePath: "InvoicePath",          // (B) used as invoice identifier if needed
  Type: "Type",                        // (C) 'A' or 'B'
  Client: "Client",                    // (D)
  Phone: "Phone",                      // (E)
  ItemCode: "ItemCode",                // (F) used for images
  Description: "Product/Description",  // (G)
  Qty: "Qty",                          // (H)
  UnitPrice: "UnitPrice",              // (I)
  LineTotal: "LineTotal",              // (J)
  InvoiceTotal: "InvoiceTotal",        // (K)
  Supplier: "Supplier",                // (L)
  Category: "Category",                // (M)
  Subcategory: "Sub-category"          // (N)
};

// ===== Utilities =====
const fmtMoney = n => (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtInt   = n => (n ?? 0).toLocaleString();

function num(x) {
  if (x === null || x === undefined) return 0;
  let s = String(x).trim().replace(/[^\d.,-]/g, "");
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(".") > s.lastIndexOf(",")) s = s.replace(/,/g, "");
    else s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function typeLabel(t) {
  const x = String(t || "").toUpperCase();
  if (x === "A" || x === "TYPE A") return "INVOICE OUT";
  if (x === "B" || x === "TYPE B") return "INVOICE IN";
  return "";
}

function imgWithFallback(code, alt="") {
  const base = window.IMAGES_BASE || "./public/images/";
  const exts = window.IMAGE_EXTS || [".webp",".jpg",".png"];
  if (!code) return `<div class="w-12 h-12 rounded bg-gray-100"></div>`;
  const first = base + code + exts[0];
  const onerr = exts.slice(1).map((ext, i) => {
    const next = base + code + ext;
    return `this.onerror=${i===exts.length-2 ? "null" : "function(){this.onerror=null;this.src='${next}'}"};this.src='${next}'`;
  }).join(";");
  return `<img src="${first}" onerror="${onerr}" alt="${alt}" class="w-12 h-12 object-cover rounded border" />`;
}

// ===== Data loading (CSV via GAS first, JSON fallback) =====
async function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      dynamicTyping: false,
      complete: (res) => resolve(res.data.filter(r => Object.values(r).some(v => v !== ""))),
      error: reject
    });
  });
}

async function loadRows() {
  try {
    const csvRows = await fetchCSV(window.CSV_URL);
    document.getElementById("badge-source").textContent = "Apps Script CSV";
    return csvRows;
  } catch (e) {
    console.warn("CSV failed, trying JSON fallback...", e);
  }
  const r = await fetch(window.JSON_URL);
  if (!r.ok) throw new Error(`JSON request failed ${r.status}`);
  const json = await r.json();
  document.getElementById("badge-source").textContent = "Apps Script JSON";
  return Array.isArray(json) ? json : (json.data || json.rows || []);
}

// ===== Normalization & filtering =====
function normalize(rows) {
  return rows.map(r => {
    const qty  = num(r[COLS.Qty]);
    const unit = num(r[COLS.UnitPrice]);
    const lt   = r[COLS.LineTotal] ? num(r[COLS.LineTotal]) : qty * unit;
    return {
      date: (r[COLS.InvoiceFile] || r["Date"] || ""), // keep as-is string for display
      client: r[COLS.Client] || "",
      phone: r[COLS.Phone] || "",
      type: (r[COLS.Type] || "").toUpperCase(),
      typeLabel: typeLabel(r[COLS.Type]),
      invoice: r["Invoice"] || r[COLS.InvoicePath] || "",
      code: String(r[COLS.ItemCode] || "").trim().toUpperCase().replace(/\s+/g, ""),
      desc: r[COLS.Description] || "",
      qty, unit, line: lt,
      invTotal: num(r[COLS.InvoiceTotal]),
      supplier: r[COLS.Supplier] || "",
      category: r[COLS.Category] || "",
      subcat: r[COLS.Subcategory] || ""
    };
  });
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a,b)=>a.localeCompare(b));
}

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

  const clientTotalsA = {};
  const clientTotalsB = {};
  rows.forEach(r => {
    if (!r.client) return;
    if (r.type === "A") clientTotalsA[r.client] = (clientTotalsA[r.client]||0) + r.line;
    if (r.type === "B") clientTotalsB[r.client] = (clientTotalsB[r.client]||0) + r.line;
  });
  const topA = Object.entries(clientTotalsA).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const topB = Object.entries(clientTotalsB).sort((a,b)=>b[1]-a[1]).slice(0,10);

  const byCodeVal = {};
  const byCodeQty = {};
  const meta = {};
  rows.forEach(r => {
    if (!r.code) return;
    byCodeVal[r.code] = (byCodeVal[r.code]||0) + r.line;
    byCodeQty[r.code] = (byCodeQty[r.code]||0) + r.qty;
    if (!meta[r.code]) meta[r.code] = {desc:r.desc,category:r.category,subcat:r.subcat};
  });
  const bestVal = Object.entries(byCodeVal).sort((a,b)=>b[1]-a[1]).slice(0,10)
    .map(([code,val]) => ({code, val, ...meta[code]}));
  const bestQty = Object.entries(byCodeQty).sort((a,b)=>b[1]-a[1]).slice(0,10)
    .map(([code,qty]) => ({code, qty, ...meta[code]}));

  return { invoices, totalTurnover, totalQty, avg, topA, topB, bestVal, bestQty };
}

// ===== Rendering =====
function renderKPIs(agg) {
  document.getElementById("kpi-turnover").textContent = fmtMoney(agg.totalTurnover);
  document.getElementById("kpi-invoices").textContent = fmtInt(agg.invoices);
  document.getElementById("kpi-qty").textContent = fmtInt(agg.totalQty);
  document.getElementById("kpi-avg").textContent = fmtMoney(agg.avg);
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
  list.forEach(item => {
    const rhs = kind === "val"
      ? `<div class="num font-semibold">${fmtMoney(item.val)}</div>`
      : `<div class="num font-semibold">${fmtInt(item.qty)}</div>`;
    const li = document.createElement("li");
    li.className = "flex items-center gap-3 border-b last:border-0 pb-2";
    li.innerHTML = `
      ${imgWithFallback(item.code, item.code)}
      <div class="flex-1 min-w-0">
        <div class="font-medium truncate">${item.code}</div>
        <div class="text-xs text-gray-500 truncate">${item.desc || ""}</div>
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

function buildFilters(allRows) {
  const cats = uniqueSorted(allRows.map(r => r.category));
  const subcats = uniqueSorted(allRows.map(r => r.subcat));
  const catSel = document.getElementById("filter-category");
  const subSel = document.getElementById("filter-subcat");
  cats.forEach(c => { const o=document.createElement("option"); o.value=c; o.textContent=c; catSel.appendChild(o); });
  subcats.forEach(s => { const o=document.createElement("option"); o.value=s; o.textContent=s; subSel.appendChild(o); });
}

// ===== Main =====
async function main() {
  try {
    const raw = await loadRows();
    const all = normalize(raw);

    // Badges
    document.getElementById("badge-total-rows").textContent = `${all.length} rows`;

    // Filters
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

    // Listeners
    document.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener("change", renderAll));
    document.getElementById("search").addEventListener("input", renderAll);
    document.getElementById("filter-category").addEventListener("change", renderAll);
    document.getElementById("filter-subcat").addEventListener("change", renderAll);

    // First paint
    renderAll();
  } catch (err) {
    console.error(err);
    document.getElementById("badge-source").textContent = "Error";
    alert("Failed to load data. Check your Apps Script deployment access and config.js IDs.");
  }
}

main();
