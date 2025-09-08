/****************************************************
 * IPEC Sales Dashboard — app.js (full drop-in)
 ****************************************************/
// --- Global state ---
let monthTableSort = { key: "ym", dir: "asc" };
/* --------------------- utils --------------------- */
const log = (...a) => {
  console.log(...a);
  const el = document.getElementById("diag-log");
  if (el) el.textContent += a.map(x => typeof x === 'string' ? x : JSON.stringify(x, null, 2)).join(" ") + "\n";
};
const fmtMoney = n => (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtInt   = n => (n ?? 0).toLocaleString();
const fmtDate  = d => !d ? "—" : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const esc      = s => String(s||"").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const ymLabel  = ym => ym || "—";
const fmtUSD  = n => (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " $";

function num(x){
  if(x==null) return 0;
  let s=String(x).trim().replace(/[^\d.,-]/g,"");
  if(s.includes(",") && s.includes(".")){
    if(s.lastIndexOf(".")>s.lastIndexOf(",")) s=s.replace(/,/g,"");
    else s=s.replace(/\./g,"").replace(",",".");
  } else if(s.includes(",") && !s.includes(".")) s=s.replace(",",".");
  else s=s.replace(/,/g,"");
  const n=Number(s); return isNaN(n)?0:n;
}
const typeLabel = t =>
  (String(t||"").toUpperCase()==="A"||String(t||"").toUpperCase()==="TYPE A")?"INVOICE OUT":
  (String(t||"").toUpperCase()==="B"||String(t||"").toUpperCase()==="TYPE B")?"INVOICE IN":"";

// thumbnails for Best Sellers
function imgHTML(code, alt=""){
  const base = window.IMAGES_BASE || "./public/images/";
  const exts = window.IMAGE_EXTS || [".webp",".jpg",".png"];
  if(!code) return `<div class="thumb"></div>`;
  const first = base+code+exts[0];
  // Try fallback extensions if first fails
  const onerr = exts.slice(1).map((ext,i)=>{
    const next = base+code+ext;
    return `this.onerror=${i===exts.length-2?"null":"function(){this.onerror=null;this.src='${next}'}"};this.src='${next}'`;
  }).join(";");
  return `<img class="thumb" src="${first}" onerror="${onerr}" alt="${esc(alt)}">`;
}

// uniq + sorted helper
function uniqSorted(arr){
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.filter(v => v !== null && v !== undefined && v !== ""))]
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }));
}

/* ---------------- data loading ------------------- */
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
      document.getElementById("badge-source") && (document.getElementById("badge-source").textContent = "Apps Script JSON");
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
  s = s.replace(/-/g,'/');            // tolerate 2025-01-05
  const d1 = new Date(s);
  if (!isNaN(d1)) return d1;
  return null;
}
function inferDateFromName(name){
  if (!name) return null;
  const s = String(name);
  let m = /\bINV-\d+-(\d{4})\b/i.exec(s);           // INV-123-0125
  if (m) { const mm=+m[1].slice(0,2), yy=+m[1].slice(2,4), yr=2000+yy; return new Date(yr,mm-1,1); }
  m = /-(\d{6})(?!\d)/.exec(s);                      // -240711 (YYMMDD)
  if (m) { const yy=+m[1].slice(0,2), mm=+m[1].slice(2,4), dd=+m[1].slice(4,6); const yr=2000+yy; const d=new Date(yr,mm-1,dd); if(!isNaN(d)) return d; }
  m = /IPEC\s*Invoice[^\d]*\d+\s*-\s*(\d{4})/i.exec(s); // IPEC Invoice 123-0125
  if (m) { const mm=+m[1].slice(0,2), yy=+m[1].slice(2,4), yr=2000+yy; return new Date(yr,mm-1,1); }
  return null;
}

/* ---------------- normalize ---------------------- */
// robust code + description fallbacks so Best Sellers always has data
function normalize(rows){
  return rows.map(r=>{
    const qty  = num(r.Qty);
    const unit = num(r.UnitPrice);
    const line = r.LineTotal!==undefined && r.LineTotal!=="" ? num(r.LineTotal) : qty*unit;

    const invoice   = r.InvoicePath || r.Invoice || r.InvoiceFile || r.InvoiceName || "";
    // --- Patched: prefer filename tag for month classification ---
const invDateRaw = r.Date || r.InvoiceDate || r["Invoice Date"] || r.InvDate || r.O || r.date;

// filename tag (INV-XXX-YYYY or "IPEC Invoice XXX-YYYY") is authoritative
let invDate = inferDateFromName(r.InvoiceName || r.InvoiceFile || r.InvoicePath || r.Invoice);

// fallback to invoice date cell if no filename tag
if (!invDate) invDate = parseDateAny(invDateRaw);

const ym = invDate
  ? `${invDate.getFullYear()}-${String(invDate.getMonth()+1).padStart(2,'0')}`
  : "";
// --------------------------------------------------------------


    const rawCode =
      r.ItemCode ?? r["Item Code"] ?? r["Item code"] ??
      r.Code ?? r["Code"] ??
      r.SKU ?? r["SKU"] ?? r.Barcode ?? r["Barcode"] ??
      r.Ref ?? r["Ref"] ?? r.Reference ?? r["Reference"] ??
      r["Item #"] ?? r.Item ?? r["Product Code"] ?? "";

    const descText =
      r["Product/Description"] ?? r.ProductDescription ?? r["Product Description"] ??
      r.Description ?? r["Item Description"] ?? r.Designation ?? r["Product Name"] ??
      r.Article ?? r["Article"] ?? r["Item Name"] ?? "";

    const codeClean = String(rawCode||"").trim();
    const codeKey = codeClean
      ? codeClean.toUpperCase().replace(/\s+/g,"")
      : (String(descText||"").trim().toUpperCase() || "UNKNOWN ITEM");

    const invFile =
      r.InvoiceFile || r["Invoice File"] || r["Invoice file"] ||
      r.InvoiceName || r["Invoice Name"] || r["Invoice #"] || r["Invoice n°"] || "";

    return {
      dateFile: r.InvoiceFile || r.InvoiceName || r.Date || "",
      client: r.Client || "",
      phone:  r.Phone || "",
      type:   String(r.Type||"").toUpperCase(),
      typeLabel: typeLabel(r.Type),

      invoice,
      code: codeKey,                // non-empty grouping key
      desc: descText || codeClean || "",

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

/* ---------------- filters ----------------------- */
function applyFilters(all){
  const type = document.querySelector('input[name="type"]:checked')?.value || "ALL";
  const cat = document.getElementById("filter-category")?.value || "";
  const sub = document.getElementById("filter-subcat")?.value || "";
  const month = document.getElementById("filter-month")?.value || "";
  const supplier = document.getElementById("filter-supplier")?.value || "";
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

  cats.forEach?.(c=>{const o=document.createElement("option"); o.value=c; o.textContent=c; catSel?.appendChild(o);});
  subs.forEach?.(s=>{const o=document.createElement("option"); o.value=s; o.textContent=s; subSel?.appendChild(o);});
  months.forEach?.(m=>{ if(!m) return; const o=document.createElement("option"); o.value=m; o.textContent=m; mSel?.appendChild(o);});
  sups.forEach?.(s=>{const o=document.createElement("option"); o.value=s; o.textContent=s; supSel?.appendChild(o);});
}

/* ---------------- aggregation ------------------- */
function aggregate(all){
  const invoices = new Set(all.map(r=>r.invoice).filter(Boolean)).size;
  const turnover = all.reduce((s,r)=>s+(r.line||0),0);
  const totalQty = all.reduce((s,r)=>s+(r.qty||0),0);
  const avg = invoices ? turnover/invoices : 0;

  // Top clients A/B (value + invoice counts by unique phone/invoice)
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

  // Top suppliers (value + invoice-count)
  const supVal = {}, supCnt = {};
  const supSeen = new Map(); // supplier -> Set(invoices)
  all.forEach(r=>{
    if(!r.supplier) return;
    supVal[r.supplier] = (supVal[r.supplier]||0) + r.line;
    if(!supSeen.has(r.supplier)) supSeen.set(r.supplier, new Set());
    supSeen.get(r.supplier).add(r.invoice);
  });
  for(const [sup,set] of supSeen.entries()){ supCnt[sup] = (supCnt[sup]||0) + set.size; }
  const topSup_value = Object.entries(supVal).sort((x,y)=>y[1]-x[1]).slice(0,20);
  const topSup_count = Object.entries(supCnt).sort((x,y)=>y[1]-x[1]).slice(0,20);

  // Best sellers (group by robust key; never empty due to fallback)
  const byVal={}, byQty={}, meta={};
  all.forEach(r=>{
    const key = r.code || "UNKNOWN ITEM";
    byVal[key] = (byVal[key]||0) + (r.line||0);
    byQty[key] = (byQty[key]||0) + (r.qty||0);
    if(!meta[key]) meta[key] = { desc: r.desc || (key==="UNKNOWN ITEM" ? "" : key), category:r.category, subcat:r.subcat };
  });
  const bestVal = Object.entries(byVal).sort((x,y)=>y[1]-x[1]).slice(0,20)
                    .map(([code,val])=>({code,val,...meta[code]}));
  const bestQty = Object.entries(byQty).sort((x,y)=>y[1]-x[1]).slice(0,20)
                    .map(([code,qty])=>({code,qty,...meta[code]}));

  // Per-month aggregates (for table)
  const monthAgg = {}; // ym -> {turnover, qty, invSet:Set}
  all.forEach(r=>{
    if(!r.ym) return;
    const m = monthAgg[r.ym] || (monthAgg[r.ym] = {turnover:0, qty:0, invSet:new Set()});
    m.turnover += (r.line||0);
    m.qty      += (r.qty||0);
    if (r.invoice) m.invSet.add(r.invoice);
  });
  const monthRows = Object.keys(monthAgg).sort().map(ym=>{
    const m = monthAgg[ym];
    const invCount = m.invSet.size;
    const avgB = invCount ? (m.turnover / invCount) : 0;
    return { ym, invoices: invCount, qty: m.qty, turnover: m.turnover, avg: avgB };
  });

  return { invoices, turnover, totalQty, avg,
           topA_value, topB_value, topA_count, topB_count,
           topSup_value, topSup_count,
           bestVal, bestQty,
           monthRows };
}

/* ---------------- renderers --------------------- */
function renderKPIs(a, grand){
  document.getElementById("kpi-turnover") && (document.getElementById("kpi-turnover").textContent=fmtMoney(a.turnover));
  document.getElementById("kpi-invoices") && (document.getElementById("kpi-invoices").textContent=fmtInt(a.invoices));
  document.getElementById("kpi-qty") && (document.getElementById("kpi-qty").textContent=fmtInt(a.totalQty));
  document.getElementById("kpi-avg") && (document.getElementById("kpi-avg").textContent=fmtMoney(a.avg));

  const pct = grand && grand.turnover>0 ? (a.turnover / grand.turnover) * 100 : 0;
  const el = document.getElementById("kpi-turnover-percent");
  if (el) el.textContent = pct.toFixed(1) + "%";
}
function setPillset(el, mode){
  if(!el) return;
  el.querySelectorAll(".pill")?.forEach?.(b => b.setAttribute("aria-pressed", b.dataset.mode===mode ? "true":"false"));
}
function renderTopClients(el, list, mode){
  if(!el) return;
  el.innerHTML="";
  (list||[]).forEach(([name,amt],i)=>{
    const li=document.createElement("li");
    li.className="li";
    li.innerHTML=`<div class="grow"><div class="name">${i+1}. ${esc(name||"Unknown")}</div></div>
      <div class="value">${mode==="value" ? fmtMoney(amt) : fmtInt(amt)}</div>`;

    // Only for clients lists (A or B), not suppliers:
    const listId = el.id || "";
    const t = (listId === "list-topA") ? "A" : (listId === "list-topB") ? "B" : null;
    if (t) {
      const btn = document.createElement("button");
      btn.className = "badge";
      btn.textContent = "Details";
      btn.style.marginLeft = "8px";
      btn.addEventListener("click", (ev)=>{
        ev.stopPropagation();
        const clientName = name || "";
        const data = (window.__currentFiltered || []).filter(r =>
          r.type === t && (r.client === clientName || r.phone === clientName)
        );
        const { invoiceList, itemsByInvoice } = buildInvoiceViews(data);
        showInvoiceDetailsModal(invoiceList, itemsByInvoice);
      });
      li.appendChild(btn);
    }

    el.appendChild(li);
  });
}

function renderBestItems(el, list, mode){
  if (!el) return;
  el.innerHTML = "";

  // empty state
  if (!list || list.length === 0) {
    el.innerHTML = `<div class="muted" style="padding:12px">No items for current filters.</div>`;
    return;
  }

  const top5  = list.slice(0, 5);
  const rest  = list.slice(5); // up to 15 more (your list is already top 20)

  // render first 5 directly
  top5.forEach((it, i) => {
    const li = document.createElement("li");
    li.className = "li";
    li.innerHTML = `${imgHTML(it.code,it.code)}
      <div class="grow">
        <div class="name">${i + 1}. ${esc(it.code)}</div>
        <div class="muted">${esc(it.desc || "")}</div>
      </div>
      <div class="value">${mode === "value" ? fmtMoney(it.val) : fmtInt(it.qty)}</div>`;
    el.appendChild(li);
  });

  // dropdown for the remaining items
  if (rest.length > 0) {
    const details = document.createElement("details");
    details.className = "show-more";

    const summary = document.createElement("summary");
    summary.textContent = `Show more (${rest.length})`;
    summary.style.cursor = "pointer";
    summary.style.padding = "8px 12px";
    summary.style.margin = "4px 0";
    summary.style.borderRadius = "10px";
    summary.style.background = "var(--panel,#f6f7f9)";
    summary.style.fontWeight = "600";

    const subList = document.createElement("ul");
    subList.style.listStyle = "none";
    subList.style.padding = "0";
    subList.style.margin = "8px 0 0 0";

    rest.forEach((it, idx) => {
      const li = document.createElement("li");
      li.className = "li";
      li.innerHTML = `${imgHTML(it.code,it.code)}
        <div class="grow">
          <div class="name">${(idx + 6)}. ${esc(it.code)}</div>
          <div class="muted">${esc(it.desc || "")}</div>
        </div>
        <div class="value">${mode === "value" ? fmtMoney(it.val) : fmtInt(it.qty)}</div>`;
      subList.appendChild(li);
    });

    details.appendChild(summary);
    details.appendChild(subList);
    // put the details block as its own row in the list
    const wrapper = document.createElement("li");
    wrapper.className = "li";
    wrapper.style.display = "block";
    wrapper.style.padding = "0"; // keep compact
    wrapper.appendChild(details);
    el.appendChild(wrapper);
  }
}
function renderMonthTable(rows){
  const tbody = document.querySelector('#month-table tbody');
  if(!tbody) return;
  tbody.innerHTML = "";

  // Sort by current key/dir
  const key = monthTableSort.key;
  const dir = monthTableSort.dir === "asc" ? 1 : -1;
  const sorted = [...(rows||[])].sort((a,b)=>{
    if (key === "ym") return (a.ym > b.ym ? 1 : -1) * dir;
    if (key === "invoices") return (a.invoices - b.invoices) * dir;
    if (key === "qty") return (a.qty - b.qty) * dir;
    if (key === "turnover") return (a.turnover - b.turnover) * dir;
    if (key === "avg") return (a.avg - b.avg) * dir;
    return 0;
  });

  sorted.forEach(r=>{
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
function updateMonthTableArrows(){
  const heads = document.querySelectorAll("#month-table thead th");
  const keys = ["ym","invoices","qty","turnover","avg"];

  heads.forEach((th, idx)=>{
    const k = keys[idx];

    // Remove old arrows
    const base = th.textContent.replace(/[\u25B2\u25BC\u2195]$/,"").trim();

    let arrow = " ↕"; // neutral arrow
    if (monthTableSort.key === k) {
      arrow = monthTableSort.dir === "asc" ? " ▲" : " ▼";
    }

    th.textContent = base + arrow;
  });
}



/* ---------------- Diagnostics ------------------- */
// Clean trailing name (strip extension, tidy separators)
function cleanName(s){
  let out = String(s||"");
  out = out.replace(/\.[a-z0-9]{2,5}$/i,"");   // remove .xlsx, .pdf, ...
  out = out.replace(/[_\-]+/g," ").replace(/\s{2,}/g," ").trim();
  return out;
}
// Extract { seq, snippet, name } from invoice-like string
function extractParts(s) {
  const str = String(s || "");
  let m = /INV[^\d]*?(\d{1,5})[^\d]*?(\d{4})(.*)$/i.exec(str);                 // INV-XXX-YYYY + name
  if (m) return { seq: parseInt(m[1], 10), snippet: `INV-${m[1]}-${m[2]}`, name: cleanName(m[3]) };
  m = /IPEC\s*Invoice[^\d]*?(\d{1,5})[^\d]*?(\d{4})(.*)$/i.exec(str);          // IPEC Invoice XXX-YYYY + name
  if (m) return { seq: parseInt(m[1], 10), snippet: `IPEC Invoice ${m[1]}-${m[2]}`, name: cleanName(m[3]) };
  m = /(\d{1,5})\s*[-_]\s*(\d{4})(.*)$/.exec(str);                             // generic NNN-YYYY + name
  if (m) return { seq: parseInt(m[1], 10), snippet: `${m[1]}-${m[2]}`, name: cleanName(m[3]) };
  return null;
}
function maxSeqByType(all, type) {
  let best = null; // {seq, snippet, name}
  all.forEach(r => {
    if (r.type !== type) return;
    const src = r.invoiceFile || r.invoiceName || r.invoice || "";
    const got = extractParts(src);
    if (!got) return;
    if (!best || got.seq > best.seq) best = got;
  });
  return best;
}
function renderLatestDiagnostics(all) {
  const A = maxSeqByType(all, "A");
  const B = maxSeqByType(all, "B");
  function fill(one, elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = "";
    const li = document.createElement("li");
    li.className = "li";
    if (!one) li.innerHTML = `<div class="grow"><div class="name">—</div></div>`;
    else {
      const namePart = one.name ? ` <span class="muted">${esc(one.name)}</span>` : "";
      li.innerHTML = `<div class="grow"><div class="name">${esc(one.snippet)}${namePart}</div></div>`;
    }
    el.appendChild(li);
  }
  fill(A, "diag-lastA");
  fill(B, "diag-lastB");
}
// Back-compat alias (if any old code calls it)
function latestInvoicesByType(all, type, limit = 1) {
  const best = maxSeqByType(all, type);
  return best ? [best] : [];
}

/* --------------- collapsibles ------------------- */
function wireCollapsibles(){
  document.querySelectorAll('.toggle[data-target]')?.forEach?.(btn=>{
    btn.addEventListener('click', ()=>{
      const id=btn.getAttribute('data-target');
      const card=document.getElementById(id);
      if(!card) return;
      const collapsed = card.classList.toggle('collapsed');
      btn.textContent = collapsed ? 'Expand' : 'Minimize';
    });
  });
}
function buildInvoiceViews(rows){
  const invTotals = new Map();
  const itemsByInvoice = new Map();
  for (const r of rows || []) {
    const inv = r.invoiceName || r.invoiceFile || r.invoice || "";
    if (!inv) continue;
    const line = Number(r.line || ((r.qty||0) * (r.unit||0)) || 0);
    invTotals.set(inv, (invTotals.get(inv) || 0) + line);

    if (!itemsByInvoice.has(inv)) itemsByInvoice.set(inv, []);
    itemsByInvoice.get(inv).push({
      code: String(r.code || "").trim(),
      qty: Number(r.qty || 0),
      unitPrice: Number(r.unit || 0),     // ← from col I (UnitPrice)
      desc: r.desc || ""                  // ← from col G (Product/Description)
    });
  }
  const invoiceList = Array.from(invTotals, ([invoice, total]) => ({ invoice, total }))
    .sort((a,b)=> String(a.invoice).localeCompare(String(b.invoice), undefined, {numeric:true, sensitivity:"base"}));
  return { invoiceList, itemsByInvoice };
}

/* -------------------- main ---------------------- */
async function main(){
  try{
    const raw = await fetchDataJSON();
    const all = normalize(raw);
    document.getElementById("badge-total-rows") && (document.getElementById("badge-total-rows").textContent = `${all.length} rows`);

    buildFilters(all);
    const grand = aggregate(all);

    // diagnostics (based on full dataset)
    renderLatestDiagnostics(all);

    const state = { clientsA:"value", clientsB:"value", suppliers:"value", items:"value" };

    function recomputeAndRender(){
      const filtered = applyFilters(all);
      window.__currentFiltered = filtered;
window.__currentAll = all;

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
window.__lastMonthRows = agg.monthRows;
renderMonthTable(agg.monthRows);

      // Per Month Sales table
      renderMonthTable(agg.monthRows);
      
    }
// Make headers clickable for sorting
document.querySelectorAll("#month-table thead th").forEach((th, idx)=>{
  th.style.cursor = "pointer";
  th.style.position = "relative";   // allow arrow placement

  th.addEventListener("click", ()=>{
    const keys = ["ym","invoices","qty","turnover","avg"];
    const k = keys[idx];

    if (monthTableSort.key === k) {
      monthTableSort.dir = (monthTableSort.dir === "asc" ? "desc" : "asc");
    } else {
      monthTableSort.key = k;
      monthTableSort.dir = "asc";
    }

    renderMonthTable(window.__lastMonthRows || []);
    updateMonthTableArrows();   // <-- new call
  });
});


    // Filter events
    document.querySelectorAll('input[name="type"]')?.forEach?.(r=>{
      try{ r.addEventListener("change", recomputeAndRender); }catch(e){ log("Type radio bind failed:", e); }
    });
    ["filter-category","filter-subcat","filter-month","filter-supplier"].forEach(id=>{
      const el=document.getElementById(id);
      el?.addEventListener?.("change", recomputeAndRender);
    });

    // Mode toggles
    document.getElementById("clientsModeA")?.addEventListener("click", e=>{
      const b=e.target.closest(".pill"); if(!b) return; state.clientsA=b.dataset.mode; recomputeAndRender();
    });
    document.getElementById("clientsModeB")?.addEventListener("click", e=>{
      const b=e.target.closest(".pill"); if(!b) return; state.clientsB=b.dataset.mode; recomputeAndRender();
    });
    document.getElementById("suppliersMode")?.addEventListener("click", e=>{
      const b=e.target.closest(".pill"); if(!b) return; state.suppliers=b.dataset.mode; recomputeAndRender();
    });
    document.getElementById("itemsMode")?.addEventListener("click", e=>{
      const b=e.target.closest(".pill"); if(!b) return; state.items=b.dataset.mode; recomputeAndRender();
    });

    wireCollapsibles();
    recomputeAndRender();
    updateMonthTableArrows();
  }catch(err){
    log("FATAL:", String(err));
    const badge = document.getElementById("badge-source");
    if (badge) badge.textContent="Error";
  }
}
document.getElementById("refresh-btn")?.addEventListener("click", async ()=>{
  const btn = document.getElementById("refresh-btn");
  if (btn) btn.textContent = "Refreshing…";

  try {
    // Ping GAS with ?rebuild=1 to trigger BuildMasterIncremental()
    const base = (window.JSON_URLS && window.JSON_URLS[0]) || "";
    if (base) {
      const url = base + (base.includes("?") ? "&" : "?") + "rebuild=1&t=" + Date.now();
      await fetch(url, { method: "GET", mode: "cors", cache: "no-store" });
    }
  } catch (e) {
    log("Rebuild ping failed:", e);
  }
document.getElementById("invoices-btn")?.addEventListener("click", () => {
  const data = window.__currentFiltered || [];
  const { invoiceList, itemsByInvoice } = buildInvoiceViews(data);
  showInvoiceDetailsModal(invoiceList, itemsByInvoice);
});

  // Hard reload to re-run main() and fetch the freshly rebuilt data
  location.reload();
});

function showInvoiceDetailsModal(invoiceList, itemsByInvoice) {
  // guard
  if (!Array.isArray(invoiceList) || !itemsByInvoice) return;

  // ----- helpers -------------------------------------------------------------
  const byInv = new Map(itemsByInvoice); // ensure Map-like
  function renderItemsFor(inv) {
    const items = byInv.get(inv) || [];
    const html = items.map(x => {
      const code = esc(x.code || "");
      const qty  = Number(x.qty || 0);
      const up   = Number(x.unitPrice || 0);        // unit price (col I)
      const line = up * qty;

      // prefer row description (col G); fallback to Items lookup if you have getDesc()
      const desc = (x.desc && String(x.desc)) || (typeof getDesc === "function" ? getDesc(code) : "");

      return `
        <li class="inv-item">
          ${typeof imgHTML === "function" ? imgHTML(code, code) : ""}
          <div class="grow">
            <div class="title">
              <strong>${code}</strong>
              <span class="chip" style="margin-left:6px">Qty ${fmtInt(qty)}</span>
            </div>
            <div class="desc-line">${esc(desc || "")}</div>
            <div class="price-line">
              Unit: <strong>${fmtUSD(up)}</strong>
              &nbsp;—&nbsp; Line: <strong>${fmtUSD(line)}</strong>
            </div>
          </div>
        </li>`;
    }).join("") || `<div class="muted tiny">No items for this invoice.</div>`;
    return `<ul class="list">${html}</ul>`;
  }

  // initial selection (first invoice)
  let selected = invoiceList[0]?.invoice || null;

  // ----- build overlay -------------------------------------------------------
  const overlay = document.createElement("div");
  overlay.className = "inv-modal-overlay";
  overlay.innerHTML = `
    <section class="inv-modal" role="dialog" aria-modal="true" aria-label="Invoice details">
      <div class="inv-modal-header">
        <div><strong>Invoice Details</strong></div>
        <button class="close-x" aria-label="Close">&times;</button>
      </div>
      <div class="inv-modal-body">
        <div class="inv-list">
          ${invoiceList.map(row => {
            const inv = esc(row.invoice || "");
            const amt = fmtUSD(Number(row.total || 0));
            const active = (row.invoice === selected) ? "active" : "";
            return `<div class="inv-row ${active}" data-inv="${inv}">
                      <span>${inv}</span>
                      <strong class="chip">${amt}</strong>
                    </div>`;
          }).join("")}
        </div>
        <div class="inv-items">
          ${selected ? renderItemsFor(selected) : `<div class="muted tiny">Select an invoice to view items.</div>`}
        </div>
      </div>
    </section>
  `;

  // scroll lock
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";

  document.body.appendChild(overlay);

  // ----- wiring --------------------------------------------------------------
  const closeBtn = overlay.querySelector(".close-x");
  function closeModal(){
    overlay.remove();
    document.documentElement.style.overflow = prevOverflow || "";
    window.removeEventListener("keydown", onKey);
  }
  function onKey(e){ if (e.key === "Escape") closeModal(); }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  closeBtn.addEventListener("click", closeModal);
  window.addEventListener("keydown", onKey);

  // click invoice rows to switch the right pane
  overlay.querySelectorAll(".inv-row").forEach(rowEl => {
    rowEl.addEventListener("click", () => {
      overlay.querySelectorAll(".inv-row").forEach(x => x.classList.remove("active"));
      rowEl.classList.add("active");
      selected = rowEl.getAttribute("data-inv") || null;
      const right = overlay.querySelector(".inv-items");
      right.innerHTML = selected ? renderItemsFor(selected) : "";
    });
  });
}



main();
