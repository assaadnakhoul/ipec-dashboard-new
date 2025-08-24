/****************************************************
 * IPEC Sales Dashboard — app.js
 * - Loads JSON (simple GET with cache-bust)
 * - Normalizes rows
 * - Filters (Type/Category/Sub-category/Month/Supplier)
 * - KPIs, Top Clients A/B, Top Suppliers, Best Sellers
 * - Per Month Sales table (filters applied)
 * - Diagnostics: biggest XXX per folder (INV-XXX-YYYY / IPEC Invoice XXX-YYYY)
 ****************************************************/

// ---------- utils ----------
const log = (...a)=>{console.log(...a); const el=document.getElementById("diag-log"); if(el){el.textContent+=a.map(x=>typeof x==='string'?x:JSON.stringify(x,null,2)).join(" ")+"\n";}};
const fmtMoney = n => (n??0).toLocaleString(undefined,{maximumFractionDigits:2});
const fmtInt   = n => (n??0).toLocaleString();
const fmtDate  = d => !d ? "—" : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const esc      = s => String(s||"").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const ymLabel  = ym => ym || "—";

// parse number strings
function num(x){
  if(x==null) return 0;
  let s=String(x).trim().replace(/[^\d.,-]/g,"");
  if(s.includes(",")&&s.includes(".")){
    if(s.lastIndexOf(".")>s.lastIndexOf(",")) s=s.replace(/,/g,"");
    else s=s.replace(/\./g,"").replace(",",".");
  } else if(s.includes(",")&&!s.includes(".")) s=s.replace(",",".");
  else s=s.replace(/,/g,"");
  const n=Number(s); return isNaN(n)?0:n;
}
const typeLabel = t =>
  (String(t||"").toUpperCase()==="A"||String(t||"").toUpperCase()==="TYPE A")?"INVOICE OUT":
  (String(t||"").toUpperCase()==="B"||String(t||"").toUpperCase()==="TYPE B")?"INVOICE IN":"";

// thumbnails (used in Best Sellers)
function imgHTML(code, alt=""){
  const base = window.IMAGES_BASE || "./public/images/";
  const exts = window.IMAGE_EXTS || [".webp",".jpg",".png"];
  if(!code) return `<div class="thumb"></div>`;
  const first = base+code+exts[0];
  const onerr=exts.slice(1).map((ext,i)=>{const next=base+code+ext;return `this.onerror=${i===exts.length-2?"null":"function(){this.onerror=null;this.src='${next}'}"};this.src='${next}'`;}).join(";");
  return `<img class="thumb" src="${first}" onerror="${onerr}" alt="${alt}">`;
}

// ---------- data loading ----------
async function fetchDataJSON(){
  if(!window.JSON_URLS || !window.JSON_URLS.length) throw new Error("No JSON_URLS configured (check config.js)");
  let lastErr;
  for (const baseUrl of window.JSON_URLS){
    try{
      const url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
      log("Fetching JSON:", url);
      const res = await fetch(url, { method: "GET", mode: "cors", credentials: "omit", cache: "no-store" });
      if(!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("json")) {
        const txt = await res.text();
        throw new Error(`Non-JSON from server. First bytes: ${txt.slice(0,120)}`);
      }
      const j = await res.json();
      const rows = Array.isArray(j) ? j : (j.data || j.rows || []);
      if(!Array.isArray(rows)) throw new Error("Unexpected JSON shape");
      document.getElementById("badge-source").textContent = "Apps Script JSON";
      log(`Loaded ${rows.length} rows`);
      return rows;
    }catch(e){
      lastErr = e; log("Fetch failed:", String(e));
    }
  }
  throw lastErr || new Error("All JSON sources failed");
}

function parseDateAny(v){
  if(!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  let s = String(v).trim();

  // Excel serial
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    const base = new Date(Date.UTC(1899,11,30));
    const d = new Date(base.getTime() + serial*86400000);
    return isNaN(d) ? null : d;
  }
  s = s.replace(/-/g,'/');
  const d1 = new Date(s);
  if (!isNaN(d1)) return d1;
  return null;
}

function inferDateFromName(name){
  if (!name) return null;
  const s = String(name);

  // INV-123-0125  => mmYY
  let m = /\bINV-\d+-(\d{4})\b/i.exec(s);
  if (m) {
    const mm = parseInt(m[1].slice(0,2),10);
    const yy = parseInt(m[1].slice(2,4),10);
    const yr = 2000 + yy;
    return new Date(yr, mm-1, 1);
  }
  // ...-240711 (YYMMDD)
  m = /-(\d{6})(?!\d)/.exec(s);
  if (m) {
    const yy = parseInt(m[1].slice(0,2),10);
    const mm = parseInt(m[1].slice(2,4),10);
    const dd = parseInt(m[1].slice(4,6),10);
    const yr = 2000 + yy;
    const d = new Date(yr, mm-1, dd);
    if (!isNaN(d)) return d;
  }
  // IPEC Invoice 123-0125
  m = /IPEC\s*Invoice[^\d]*\d+\s*-\s*(\d{4})/i.exec(s);
  if (m) {
    const mm = parseInt(m[1].slice(0,2),10);
    const yy = parseInt(m[1].slice(2,4),10);
    const yr = 2000 + yy;
    return new Date(yr, mm-1, 1);
  }
  return null;
}

function normalize(rows){
  return rows.map(r=>{
    const qty = num(r.Qty), unit = num(r.UnitPrice);
    const line = r.LineTotal!==undefined && r.LineTotal!=="" ? num(r.LineTotal) : qty*unit;

    const invoice = r.InvoicePath || r.Invoice || r.InvoiceFile || r.InvoiceName || "";
    const invDateRaw = r.Date || r.InvoiceDate || r["Invoice Date"] || r.InvDate || r.O || r.date;
    let invDate = parseDateAny(invDateRaw);
    if (!invDate) invDate = inferDateFromName(r.InvoiceName || r.InvoiceFile || r.InvoicePath);

    const ym = invDate ? `${invDate.getFullYear()}-${String(invDate.getMonth()+1).padStart(2,'0')}` : "";

    // human-readable invoice number from the sheet
    const invFile =
      r.InvoiceFile || r["Invoice File"] || r["Invoice file"] ||
      r.InvoiceName || r["Invoice Name"] || r["Invoice #"] || r["Invoice n°"] || "";

    return {
      dateFile: r.InvoiceFile || r.InvoiceName || r.Date || "",
      client: r.Client || "",
      phone: r.Phone || "",
      type: String(r.Type||"").toUpperCase(),
      typeLabel: typeLabel(r.Type),
      invoice,
      code: String(r.ItemCode||"").trim().toUpperCase().replace(/\s+/g,""),
      desc: r["Product/Description"] || r.ProductDescription || r.Description || "",
      qty, unit, line, invTotal: num(r.InvoiceTotal),

      supplier: r.Supplier || "",
      category: r.Category || "",
      subcat:   r["Sub-category"] || r.Subcategory || "",

      invoiceFile: invFile,
      invoiceName: r.InvoiceName || "",

      invDate, ym
    };
  }).filter(o=>Object.values(o).some(v=>v!==""&&v!=null));
}

const uniqSorted = a =>
  Array.from(new Set((a || []).filter(v => v !== null && v !== undefined)))
    .sort((x, y) => String(x).localeCompare(String(y)));

// ---------- filters ----------
function applyFilters(all){
  const type = document.querySelector('input[name="type"]:checked').value;
  const cat = document.getElementById("filter-category").value;
  const sub = document.getElementById("filter-subcat").value;
  const month = document.getElementById("filter-month").value;
  const supplier = document.getElementById("filter-supplier").value;
  return all.filter(r=>{
    if(type!=="ALL" && r.type!==type) return false;
    if(cat && r.category!==cat) return false;
    if(sub && r.subcat!==sub) return false;
    if(month && r.ym!==month) return false;
    if(supplier && r.supplier!==supplier) return false;
    return true;
  });
}

function buildFilters(all){
  const cats=uniqSorted(all.map(r=>r.category));
  const subs=uniqSorted(all.map(r=>r.subcat));
  const months=uniqSorted(all.map(r=>r.ym));
  const sups=uniqSorted(all.map(r=>r.supplier));

  const catSel=document.getElementById("filter-category");
  const subSel=document.getElementById("filter-subcat");
  const mSel=document.getElementById("filter-month");
  const supSel=document.getElementById("filter-supplier");

  cats.forEach(c=>{const o=document.createElement("option"); o.value=c; o.textContent=c; catSel.appendChild(o);});
  subs.forEach(s=>{const o=document.createElement("option"); o.value=s; o.textContent=s; subSel.appendChild(o);});
  months.forEach(m=>{ if(!m) return; const o=document.createElement("option"); o.value=m; o.textContent=m; mSel.appendChild(o);});
  sups.forEach(s=>{const o=document.createElement("option"); o.value=s; o.textContent=s; supSel.appendChild(o);});
}

// ---------- aggregation ----------
function aggregate(all){
  const invoices = new Set(all.map(r=>r.invoice).filter(Boolean)).size;
  const turnover = all.reduce((s,r)=>s+(r.line||0),0);
  const totalQty = all.reduce((s,r)=>s+(r.qty||0),0);
  const avg = invoices ? turnover/invoices : 0;

  // Top clients
  const valA={}, valB={}, cntA={}, cntB={};
  const seenA=new Map(), seenB=new Map(); // phone -> Set(invoices)
  all.forEach(r=>{
    if(!r.client) return;
    if(r.type==="A"){
      valA[r.client]=(valA[r.client]||0)+r.line;
      if(r.phone){ if(!seenA.has(r.phone)) seenA.set(r.phone,new Set()); seenA.get(r.phone).add(r.invoice); }
    }
    if(r.type==="B"){
      valB[r.client]=(valB[r.client]||0)+r.line;
      if(r.phone){ if(!seenB.has(r.phone)) seenB.set(r.phone,new Set()); seenB.get(r.phone).add(r.invoice); }
    }
  });
  const ph2cA=new Map(), ph2cB=new Map();
  all.forEach(r=>{
    if(r.type==="A" && r.phone && !ph2cA.has(r.phone)) ph2cA.set(r.phone, r.client||r.phone);
    if(r.type==="B" && r.phone && !ph2cB.has(r.phone)) ph2cB.set(r.phone, r.client||r.phone);
  });
  for(const [ph,set] of seenA.entries()){ const name=ph2cA.get(ph)||ph; cntA[name]=(cntA[name]||0)+set.size; }
  for(const [ph,set] of seenB.entries()){ const name=ph2cB.get(ph)||ph; cntB[name]=(cntB[name]||0)+set.size; }

  const topA_value = Object.entries(valA).sort((x,y)=>y[1]-x[1]).slice(0,20);
  const topB_value = Object.entries(valB).sort((x,y)=>y[1]-x[1]).slice(0,20);
  const topA_count = Object.entries(cntA).sort((x,y)=>y[1]-x[1]).slice(0,20);
  const topB_count = Object.entries(cntB).sort((x,y)=>y[1]-x[1]).slice(0,20);

  // Top suppliers
  const supVal = {}, supCnt = {};
  const supSeen = new Map(); // supplier -> Set(invoices)
  all.forEach(r=>{
    if(!r.supplier) return;
    supVal[r.supplier] = (supVal[r.supplier]||0) + r.line;
    if(!supSeen.has(r.supplier)) supSeen.set(r.supplier, new Set());
    supSeen.get(r.supplier).add(r.invoice);
  });
  for(const [sup,set] of supSeen.entries()){
    supCnt[sup] = (supCnt[sup]||0) + set.size;
  }
  const topSup_value = Object.entries(supVal).sort((x,y)=>y[1]-x[1]).slice(0,20);
  const topSup_count = Object.entries(supCnt).sort((x,y)=>y[1]-x[1]).slice(0,20);

  // -------- Per-month aggregates (for table) --------
  const monthAgg = {}; // ym -> {turnover, qty, invSet:Set}
  all.forEach(r=>{
    if(!r.ym) return;
    const m = monthAgg[r.ym] || (monthAgg[r.ym] = {turnover:0, qty:0, invSet:new Set()});
    m.turnover += (r.line||0);
    m.qty      += (r.qty||0);
    if (r.invoice) m.invSet.add(r.invoice);
  });
  const months = Object.keys(monthAgg).sort();
  const monthRows = months.map(ym => {
    const m = monthAgg[ym];
    const invCount = m.invSet.size;
    const avgB = invCount ? (m.turnover / invCount) : 0;
    return { ym, invoices: invCount, qty: m.qty, turnover: m.turnover, avg: avgB };
  });

  return { invoices, turnover, totalQty, avg,
           topA_value, topB_value, topA_count, topB_count,
           topSup_value, topSup_count,
           monthRows };
}

// ---------- renderers ----------
function renderKPIs(a, grand){
  document.getElementById("kpi-turnover").textContent=fmtMoney(a.turnover);
  document.getElementById("kpi-invoices").textContent=fmtInt(a.invoices);
  document.getElementById("kpi-qty").textContent=fmtInt(a.totalQty);
  document.getElementById("kpi-avg").textContent=fmtMoney(a.avg);

  const pct = grand && grand.turnover>0 ? (a.turnover / grand.turnover) * 100 : 0;
  const el = document.getElementById("kpi-turnover-percent");
  if (el) el.textContent = pct.toFixed(1) + "%";
}

function setPillset(el, mode){ el.querySelectorAll(".pill").forEach(b=>b.setAttribute("aria-pressed", b.dataset.mode===mode ? "true":"false")); }

function renderTopClients(el, list, mode){
  el.innerHTML="";
  list.forEach(([name,amt],i)=>{
    const li=document.createElement("li");
    li.className="li";
    li.innerHTML=`<div class="grow"><div class="name">${i+1}. ${name||"Unknown"}</div></div>
      <div class="value">${mode==="value" ? fmtMoney(amt) : fmtInt(amt)}</div>`;
    el.appendChild(li);
  });
}
function renderBestItems(el, list, mode){
  el.innerHTML="";
  list.forEach((it,i)=>{
    const li=document.createElement("li");
    li.className="li";
    li.innerHTML=`${imgHTML(it.code,it.code)}
      <div class="grow">
        <div class="name">${i+1}. ${it.code}</div>
        <div class="muted">${it.desc||""}</div>
      </div>
      <div class="value">${mode==="value" ? fmtMoney(it.val) : fmtInt(it.qty)}</div>`;
    el.appendChild(li);
  });
}

// -------- Per Month Sales table --------
function renderMonthTable(rows){
  const tbody = document.querySelector('#month-table tbody');
  if(!tbody){ log("No #month-table tbody"); return; }
  tbody.innerHTML = "";
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(ymLabel(r.ym))}</td>
      <td>${fmtInt(r.invoices)}</td>
      <td>${fmtInt(r.qty)}</td>
      <td>${fmtMoney(r.turnover)}</td>
      <td>${fmtMoney(r.avg)}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ======================= Diagnostics (max XXX per folder) ======================= */

// Extract { seq, snippet } from any invoice-like string
// - "INV-371-0625 ..."              -> {seq:371, snippet:"INV-371-0625"}
// - "IPEC Invoice 016-0225 ..."     -> {seq:16,  snippet:"IPEC Invoice 016-0225"}
// - Fallback "NNN-YYYY"             -> {seq:NNN, snippet:"NNN-YYYY"}
function extractSeqSnippet(s) {
  const str = String(s || "");

  // INV-XXX-YYYY
  let m = /INV[^\d]*?(\d{1,5})[^\d]*?(\d{4})/i.exec(str);
  if (m) return { seq: parseInt(m[1], 10), snippet: `INV-${m[1]}-${m[2]}` };

  // IPEC Invoice XXX-YYYY
  m = /IPEC\s*Invoice[^\d]*?(\d{1,5})[^\d]*?(\d{4})/i.exec(str);
  if (m) return { seq: parseInt(m[1], 10), snippet: `IPEC Invoice ${m[1]}-${m[2]}` };

  // Generic NNN-YYYY
  m = /(\d{1,5})\s*[-_]\s*(\d{4})/.exec(str);
  if (m) return { seq: parseInt(m[1], 10), snippet: `${m[1]}-${m[2]}` };

  return null;
}

// Find the invoice with the largest XXX for a given Type ("A" or "B")
function maxSeqByType(all, type) {
  let best = null; // {seq, snippet}
  all.forEach(r => {
    if (r.type !== type) return;
    const src = r.invoiceFile || r.invoiceName || r.invoice || "";
    const got = extractSeqSnippet(src);
    if (!got) return;
    if (!best || got.seq > best.seq) best = got;
  });
  return best;
}

// Render one row per folder showing the biggest XXX and its snippet
function renderLatestDiagnostics(all) {
  const A = maxSeqByType(all, "A");   // Folder A: expects "INV-XXX-YYYY"
  const B = maxSeqByType(all, "B");   // Folder B: expects "IPEC Invoice XXX-YYYY"

  function fill(one, elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = "";
    const li = document.createElement("li");
    li.className = "li";
    if (!one) {
      li.innerHTML = `<div class="grow"><div class="name">—</div></div><div class="value">—</div>`;
    } else {
      li.innerHTML = `<div class="grow"><div class="name">${esc(one.snippet)}</div></div>
                      <div class="value">${fmtInt(one.seq)}</div>`;
    }
    el.appendChild(li);
  }
  fill(A, "diag-lastA");
  fill(B, "diag-lastB");
}

// ✅ Back-compat alias (prevents "latestInvoicesByType is not defined")
function latestInvoicesByType(all, type, limit = 1) {
  const best = maxSeqByType(all, type);
  return best ? [best] : [];
}
/* ===================== end Diagnostics (max XXX per folder) ===================== */


// ---------- collapsibles (optional) ----------
function wireCollapsibles(){
  document.querySelectorAll('.toggle[data-target]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id=btn.getAttribute('data-target');
      const card=document.getElementById(id);
      if(!card) return;
      const collapsed = card.classList.toggle('collapsed');
      btn.textContent = collapsed ? 'Expand' : 'Minimize';
    });
  });
}

// ---------- main ----------
async function main(){
  try{
    const raw = await fetchDataJSON();
    const all = normalize(raw);
    document.getElementById("badge-total-rows").textContent = `${all.length} rows`;

    buildFilters(all);
    const grand = aggregate(all);

    // diagnostics (based on full dataset)
    renderLatestDiagnostics(all);

    const state = { clientsA:"value", clientsB:"value", suppliers:"value", items:"value" };

    function recomputeAndRender(){
      const filtered = applyFilters(all);
      const agg = aggregate(filtered);

      // KPIs
      renderKPIs(agg, grand);

      // Clients A/B
      setPillset(document.getElementById("clientsModeA"), state.clientsA);
      setPillset(document.getElementById("clientsModeB"), state.clientsB);
      renderTopClients(document.getElementById("list-topA"),
        state.clientsA==="value" ? agg.topA_value : agg.topA_count, state.clientsA);
      renderTopClients(document.getElementById("list-topB"),
        state.clientsB==="value" ? agg.topB_value : agg.topB_count, state.clientsB);

      // Suppliers
      setPillset(document.getElementById("suppliersMode"), state.suppliers);
      renderTopClients(document.getElementById("list-topSup"),
        state.suppliers==="value" ? agg.topSup_value : agg.topSup_count, state.suppliers);

      // Best items
      setPillset(document.getElementById("itemsMode"), state.items);
      renderBestItems(document.getElementById("list-items"),
        state.items==="value" ? agg.bestVal : agg.bestQty, state.items);

      // Per Month Sales table
      renderMonthTable(agg.monthRows);
    }

    // Filter events
    document.querySelectorAll('input[name="type"]').forEach(r=>{
      try{ r.addEventListener("change", recomputeAndRender); }catch(e){ log("Type radio bind failed:", e); }
    });
    ["filter-category","filter-subcat","filter-month","filter-supplier"].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.addEventListener("change", recomputeAndRender);
      else log("Missing filter element:", id);
    });

    // Mode toggles
    document.getElementById("clientsModeA").addEventListener("click", e=>{
      const b=e.target.closest(".pill"); if(!b) return; state.clientsA=b.dataset.mode; recomputeAndRender();
    });
    document.getElementById("clientsModeB").addEventListener("click", e=>{
      const b=e.target.closest(".pill"); if(!b) return; state.clientsB=b.dataset.mode; recomputeAndRender();
    });
    document.getElementById("suppliersMode").addEventListener("click", e=>{
      const b=e.target.closest(".pill"); if(!b) return; state.suppliers=b.dataset.mode; recomputeAndRender();
    });
    document.getElementById("itemsMode").addEventListener("click", e=>{
      const b=e.target.closest(".pill"); if(!b) return; state.items=b.dataset.mode; recomputeAndRender();
    });

    wireCollapsibles();
    recomputeAndRender();
  }catch(err){
    log("FATAL:", String(err));
    document.getElementById("badge-source").textContent="Error";
  }
}

main();
