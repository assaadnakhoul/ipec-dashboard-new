// Expected headers, but we’ll also auto-map common variants:
const EXPECTED = {
  InvoiceFile: ["InvoiceFile","Date","Invoice File"],
  InvoicePath: ["InvoicePath","Invoice","Invoice No","InvoiceNum"],
  Type: ["Type","Invoice Type"],
  Client: ["Client","Customer","Client Name"],
  Phone: ["Phone","Client Phone","Phone Number"],
  ItemCode: ["ItemCode","Code","Item Code","SKU"],
  Description: ["Product/Description","Product Description","Description"],
  Qty: ["Qty","Quantity","QTY"],
  UnitPrice: ["UnitPrice","Unit Price","Price"],
  LineTotal: ["LineTotal","Line Total","Amount","Total"],
  InvoiceTotal: ["InvoiceTotal","Invoice Total","Grand Total"],
  Supplier: ["Supplier","Vendor"],
  Category: ["Category"],
  Subcategory: ["Sub-category","Subcategory","Sub Category"]
};

// maps actual header row to canonical keys above
function mapHeaders(headerRow) {
  const map = {};
  const lower = headerRow.map(h => String(h||"").trim().toLowerCase());
  for (const key of Object.keys(EXPECTED)) {
    const candidates = EXPECTED[key].map(s => s.toLowerCase());
    let foundIndex = -1;
    for (const c of candidates) {
      const idx = lower.indexOf(c);
      if (idx >= 0) { foundIndex = idx; break; }
    }
    map[key] = foundIndex; // -1 means missing
  }
  return map;
}

const fmtMoney = n => (n ?? 0).toLocaleString(undefined,{maximumFractionDigits:2});
const fmtInt   = n => (n ?? 0).toLocaleString();
function num(x){
  if (x==null) return 0;
  let s = String(x).trim().replace(/[^\d.,-]/g,"");
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(".") > s.lastIndexOf(",")) s = s.replace(/,/g,"");
    else s = s.replace(/\./g,"").replace(",",".");
  } else if (s.includes(",") && !s.includes(".")) s = s.replace(",",".");
  else s = s.replace(/,/g,"");
  const n = Number(s); return isNaN(n)?0:n;
}
const typeLabel = t => (String(t||"").toUpperCase()==="A"||String(t||"").toUpperCase()==="TYPE A")
  ? "INVOICE OUT" : (String(t||"").toUpperCase()==="B"||String(t||"").toUpperCase()==="TYPE B")
  ? "INVOICE IN" : "";

function imgWithFallback(code, alt=""){
  const base = window.IMAGES_BASE || "./public/images/";
  const exts = window.IMAGE_EXTS || [".webp",".jpg",".png"];
  if(!code) return `<div class="w-12 h-12 rounded bg-gray-100"></div>`;
  const first = base + code + exts[0];
  const onerr = exts.slice(1).map((ext,i)=>{
    const next = base + code + ext;
    return `this.onerror=${i===exts.length-2?"null":"function(){this.onerror=null;this.src='${next}'}"};this.src='${next}'`;
  }).join(";");
  return `<img src="${first}" onerror="${onerr}" alt="${alt}" class="w-12 h-12 object-cover rounded border" />`;
}

// ---------- diagnostics ----------
const log = (...args)=> {
  console.log(...args);
  const el = document.getElementById("diag-log");
  if (el) el.textContent += args.map(a => (typeof a==='string'?a:JSON.stringify(a,null,2))).join(" ")+"\n";
};

// ---------- data loading ----------
async function fetchCSV(url){
  return new Promise((resolve, reject)=>{
    Papa.parse(url, {
      download:true, header:false, dynamicTyping:false,
      complete:(res)=> resolve(res.data), error:reject
    });
  });
}
async function tryAppsScriptCSV(){
  log("Trying Apps Script CSV:", window.CSV_URL);
  const rows = await fetchCSV(window.CSV_URL);
  return rows;
}
async function tryAppsScriptJSON(){
  log("Trying Apps Script JSON:", window.JSON_URL);
  const r = await fetch(window.JSON_URL, { cache:"no-store" });
  if (!r.ok) throw new Error(r.status+" "+r.statusText);
  const j = await r.json();
  return j;
}
async function tryPublishCSV(){
  if (!window.PUBLISH_CSV_URL) throw new Error("No publish CSV configured");
  log("Trying Publish-to-Web CSV:", window.PUBLISH_CSV_URL);
  const rows = await fetchCSV(window.PUBLISH_CSV_URL);
  return rows;
}

async function loadMatrixAndMap(){
  // 1) Apps Script CSV → matrix
  try {
    const m = await tryAppsScriptCSV();
    if (!m || m.length === 0) throw new Error("Empty CSV matrix");
    document.getElementById("badge-source").textContent = "Apps Script CSV";
    // First row = header
    const headers = m[0];
    const map = mapHeaders(headers);
    return { headers, map, data: m.slice(1) };
  } catch (e) { log("Apps Script CSV failed:", String(e)); }

  // 2) Apps Script JSON → array of objects (we’ll recompose headers)
  try {
    const arr = await tryAppsScriptJSON();
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("Empty JSON array");
    document.getElementById("badge-source").textContent = "Apps Script JSON";
    const headers = Object.keys(arr[0]);
    const map = mapHeaders(headers);
    const data = arr.map(obj => headers.map(h => obj[h]));
    return { headers, map, data };
  } catch (e) { log("Apps Script JSON failed:", String(e)); }

  // 3) Publish-to-web CSV (optional)
  try {
    const m = await tryPublishCSV();
    if (!m || m.length === 0) throw new Error("Empty publish CSV");
    document.getElementById("badge-source").textContent = "Publish-to-Web CSV";
    const headers = m[0];
    const map = mapHeaders(headers);
    return { headers, map, data: m.slice(1) };
  } catch (e) { log("Publish CSV failed:", String(e)); }

  throw new Error("No data source succeeded; check IDs, access, or that the tab has rows.");
}

function pick(row, idx){ return (idx>=0 && idx<row.length) ? row[idx] : ""; }

function normalize(matrix, map) {
  return matrix.map(r => {
    const qty  = num(pick(r, map.Qty));
    const unit = num(pick(r, map.UnitPrice));
    const lt   = pick(r,map.LineTotal) ? num(pick(r,map.LineTotal)) : qty*unit;
    const typeRaw = pick(r, map.Type);
    return {
      date: pick(r, map.InvoiceFile) || "",
      client: pick(r, map.Client) || "",
      phone: pick(r, map.Phone) || "",
      type: String(typeRaw||"").toUpperCase(),
      typeLabel: typeLabel(typeRaw),
      invoice: pick(r, map.InvoicePath) || "",
      code: String(pick(r, map.ItemCode) || "").trim().toUpperCase().replace(/\s+/g,""),
      desc: pick(r, map.Description) || "",
      qty, unit, line: lt,
      invTotal: num(pick(r, map.InvoiceTotal)),
      supplier: pick(r, map.Supplier) || "",
      category: pick(r, map.Category) || "",
      subcat: pick(r, map.Subcategory) || ""
    };
  }).filter(o => Object.values(o).some(v => v!=="" && v!=null));
}

// ---------- filters / aggregates ----------
const uniqueSorted = vals => Array.from(new Set(vals.filter(Boolean))).sort((a,b)=>a.localeCompare(b));

function applyFilters(rows){
  const type = document.querySelector('input[name="type"]:checked').value;
  const q = document.getElementById("search").value.trim().toLowerCase();
  const cat = document.getElementById("filter-category").value;
  const sub = document.getElementById("filter-subcat").value;
  return rows.filter(r=>{
    if (type!=="ALL" && r.type!==type) return false;
    if (cat && r.category!==cat) return false;
    if (sub && r.subcat!==sub) return false;
    if (q) {
      const hay = [r.client,r.code,r.category,r.subcat,r.desc].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function aggregate(rows){
  const invoices = new Set(rows.map(r=>r.invoice).filter(Boolean)).size;
  const totalTurnover = rows.reduce((s,r)=>s+(r.line||0),0);
  const totalQty = rows.reduce((s,r)=>s+(r.qty||0),0);
  const avg = invoices ? totalTurnover/invoices : 0;

  const a={}, b={};
  rows.forEach(r=>{
    if(!r.client) return;
    if(r.type==="A") a[r.client]=(a[r.client]||0)+r.line;
    if(r.type==="B") b[r.client]=(b[r.client]||0)+r.line;
  });
  const topA = Object.entries(a).sort((x,y)=>y[1]-x[1]).slice(0,10);
  const topB = Object.entries(b).sort((x,y)=>y[1]-x[1]).slice(0,10);

  const byVal={}, byQty={}, meta={};
  rows.forEach(r=>{
    if(!r.code) return;
    byVal[r.code]=(byVal[r.code]||0)+r.line;
    byQty[r.code]=(byQty[r.code]||0)+r.qty;
    if(!meta[r.code]) meta[r.code]={desc:r.desc,category:r.category,subcat:r.subcat};
  });
  const bestVal = Object.entries(byVal).sort((x,y)=>y[1]-x[1]).slice(0,10).map(([code,val])=>({code,val,...meta[code]}));
  const bestQty = Object.entries(byQty).sort((x,y)=>y[1]-x[1]).slice(0,10).map(([code,qty])=>({code,qty,...meta[code]}));
  return { invoices, totalTurnover, totalQty, avg, topA, topB, bestVal, bestQty };
}

// ---------- rendering ----------
function renderKPIs(agg){
  document.getElementById("kpi-turnover").textContent = fmtMoney(agg.totalTurnover);
  document.getElementById("kpi-invoices").textContent = fmtInt(agg.invoices);
  document.getElementById("kpi-qty").textContent = fmtInt(agg.totalQty);
  document.getElementById("kpi-avg").textContent = fmtMoney(agg.avg);
}
function renderTopList(el, items){
  el.innerHTML = "";
  items.forEach(([name,amount])=>{
    const li=document.createElement("li");
    li.className="flex justify-between border-b last:border-0 py-1 text-sm";
    li.innerHTML=`<span class="truncate">${name}</span><span class="num font-semibold">${fmtMoney(amount)}</span>`;
    el.appendChild(li);
  });
}
function renderBest(el, list, kind){
  el.innerHTML="";
  list.forEach(it=>{
    const rhs = kind==="val" ? `<div class="num font-semibold">${fmtMoney(it.val)}</div>`
                             : `<div class="num font-semibold">${fmtInt(it.qty)}</div>`;
    const li=document.createElement("li");
    li.className="flex items-center gap-3 border-b last:border-0 pb-2";
    li.innerHTML=`
      ${imgWithFallback(it.code,it.code)}
      <div class="flex-1 min-w-0">
        <div class="font-medium truncate">${it.code}</div>
        <div class="text-xs text-gray-500 truncate">${it.desc||""}</div>
      </div>
      ${rhs}
    `;
    el.appendChild(li);
  });
}
function renderRows(tbody, rows){
  tbody.innerHTML="";
  rows.forEach(r=>{
    const tr=document.createElement("tr");
    tr.className="border-b";
    tr.innerHTML=`
      <td class="p-2">${r.date||""}</td>
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

function buildFilters(all){
  const cats = uniqueSorted(all.map(r=>r.category));
  const subs = uniqueSorted(all.map(r=>r.subcat));
  const catSel=document.getElementById("filter-category");
  const subSel=document.getElementById("filter-subcat");
  cats.forEach(c=>{const o=document.createElement("option"); o.value=c; o.textContent=c; catSel.appendChild(o);});
  subs.forEach(s=>{const o=document.createElement("option"); o.value=s; o.textContent=s; subSel.appendChild(o);});
}

// ---------- main ----------
async function main(){
  // diagnostics toggle
  const diag = document.getElementById("diag");
  document.getElementById("btn-diag").onclick = ()=> diag.classList.toggle("hidden");
  document.getElementById("btn-close-diag").onclick = ()=> diag.classList.add("hidden");

  try{
    const { headers, map, data } = await loadMatrixAndMap();
    log("Headers:", headers);
    log("Header map (index by field):", map);
    if (Object.values(map).some(i => i === -1)) {
      log("WARNING: Some expected headers are missing. The app will still try with what it found.");
    }
    if (!data || data.length === 0) {
      log("No data rows detected — the tab may be empty or filtered.");
      document.getElementById("table-note").textContent = "No rows found. Check the tab & GID or remove filters.";
    }

    const all = normalize(data, map);
    document.getElementById("badge-total-rows").textContent = `${all.length} rows`;

    buildFilters(all);

    const renderAll = ()=>{
      const filtered = applyFilters(all);
      const agg = aggregate(filtered);
      renderKPIs(agg);
      renderTopList(document.getElementById("list-topA"), agg.topA);
      renderTopList(document.getElementById("list-topB"), agg.topB);
      renderBest(document.getElementById("list-value"), agg.bestVal, "val");
      renderBest(document.getElementById("list-qty"), agg.bestQty, "qty");
      renderRows(document.getElementById("rows"), filtered);
    };

    document.querySelectorAll('input[name="type"]').forEach(r=>r.addEventListener("change", renderAll));
    document.getElementById("search").addEventListener("input", renderAll);
    document.getElementById("filter-category").addEventListener("change", renderAll);
    document.getElementById("filter-subcat").addEventListener("change", renderAll);

    renderAll();
  } catch (err) {
    log("FATAL:", String(err));
    document.getElementById("badge-source").textContent = "Error";
    document.getElementById("table-note").textContent = "Failed to load data. Open Diagnostics for details.";
  }
}
main();
