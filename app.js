/***********************
 * IPEC Dashboard — collapsible Top Clients + shorter Best Sellers
 * Uses window.JSON_URLS (array) from config.js
 ***********************/
const log = (...a)=>{console.log(...a); const el=document.getElementById("diag-log"); if(el){el.textContent+=a.map(x=>typeof x==='string'?x:JSON.stringify(x,null,2)).join(" ")+"\n";}};
const fmtMoney = n => (n??0).toLocaleString(undefined,{maximumFractionDigits:2});
const fmtInt   = n => (n??0).toLocaleString();

function num(x){ if(x==null) return 0; let s=String(x).trim().replace(/[^\d.,-]/g,"");
  if(s.includes(",")&&s.includes(".")){ if(s.lastIndexOf(".")>s.lastIndexOf(",")) s=s.replace(/,/g,""); else s=s.replace(/\./g,"").replace(",",".");}
  else if(s.includes(",")&&!s.includes(".")) s=s.replace(",","."); else s=s.replace(/,/g,"");
  const n=Number(s); return isNaN(n)?0:n;
}
const typeLabel = t => (String(t||"").toUpperCase()==="A"||String(t||"").toUpperCase()==="TYPE A")?"INVOICE OUT":(String(t||"").toUpperCase()==="B"||String(t||"").toUpperCase()==="TYPE B")?"INVOICE IN":"";

// Images with fallback
function imgHTML(code, alt=""){
  const base = window.IMAGES_BASE || "./public/images/";
  const exts = window.IMAGE_EXTS || [".webp",".jpg",".png"];
  if(!code) return `<div class="thumb"></div>`;
  const first = base+code+exts[0];
  const onerr=exts.slice(1).map((ext,i)=>{const next=base+code+ext;return `this.onerror=${i===exts.length-2?"null":"function(){this.onerror=null;this.src='${next}'}"};this.src='${next}'`;}).join(";");
  return `<img class="thumb" src="${first}" onerror="${onerr}" alt="${alt}">`;
}

// Fetch JSON
async function fetchDataJSON(){
  if(!window.JSON_URLS || !window.JSON_URLS.length) throw new Error("No JSON_URLS configured (check config.js)");
  let lastErr;
  for(const url of window.JSON_URLS){
    try{
      log("Fetching JSON:", url);
      const res = await fetch(url,{method:"GET",mode:"cors",credentials:"omit",cache:"no-store",headers:{"Accept":"application/json"}});
      if(!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const j = await res.json();
      const rows = Array.isArray(j) ? j : (j.data || j.rows || []);
      if(!Array.isArray(rows)) throw new Error("Unexpected JSON structure");
      document.getElementById("badge-source").textContent="Apps Script JSON";
      log(`Loaded ${rows.length} rows`);
      return rows;
    }catch(e){ lastErr=e; log("Fetch failed:", String(e)); }
  }
  throw lastErr || new Error("All JSON sources failed");
}

// Date parsing (column O)
function parseDateAny(v){
  if(!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  let s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) { // Excel serial
    const serial = Number(s);
    const base = new Date(Date.UTC(1899,11,30));
    const d = new Date(base.getTime() + serial*86400000);
    return isNaN(d) ? null : d;
  }
  s = s.replace(/-/g,'/'); // be lenient
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// Normalize all rows
function normalize(rows){
  return rows.map(r=>{
    const qty=num(r.Qty), unit=num(r.UnitPrice);
    const line = r.LineTotal!==undefined && r.LineTotal!=="" ? num(r.LineTotal) : qty*unit;
    const invoice = r.InvoicePath || r.Invoice || r.InvoiceFile || "";
    const invDateRaw = r["Date"] ?? r["InvoiceDate"] ?? r["Invoice Date"] ?? r["InvDate"] ?? r["O"] ?? r["date"];
    const invDate = parseDateAny(invDateRaw);
    const ym = invDate ? `${invDate.getFullYear()}-${String(invDate.getMonth()+1).padStart(2,'0')}` : ""; // YYYY-MM
    return {
      dateFile: r.InvoiceFile || r.Date || "",
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
      subcat: r["Sub-category"] || r.Subcategory || "",
      invDate, ym
    };
  }).filter(o=>Object.values(o).some(v=>v!==""&&v!=null));
}

const uniqSorted = a => Array.from(new Set(a.filter(Boolean))).sort((x,y)=>x.localeCompare(y));

function applyFilters(all){
  const type = document.querySelector('input[name="type"]:checked').value;
  const cat = document.getElementById("filter-category").value;
  const sub = document.getElementById("filter-subcat").value;
  const month = document.getElementById("filter-month").value;
  return all.filter(r=>{
    if(type!=="ALL" && r.type!==type) return false;
    if(cat && r.category!==cat) return false;
    if(sub && r.subcat!==sub) return false;
    if(month && r.ym!==month) return false;
    return true;
  });
}

function aggregate(all){
  const invoices = new Set(all.map(r=>r.invoice).filter(Boolean)).size;
  const turnover = all.reduce((s,r)=>s+(r.line||0),0);
  const totalQty = all.reduce((s,r)=>s+(r.qty||0),0);
  const avg = invoices ? turnover/invoices : 0;

  // Top clients: by value and by count (phone→unique invoice count)
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

  // Best sellers
  const byVal={}, byQty={}, meta={};
  all.forEach(r=>{
    if(!r.code) return;
    byVal[r.code]=(byVal[r.code]||0)+r.line;
    byQty[r.code]=(byQty[r.code]||0)+r.qty;
    if(!meta[r.code]) meta[r.code]={desc:r.desc,category:r.category,subcat:r.subcat};
  });
  const bestVal = Object.entries(byVal).sort((x,y)=>y[1]-x[1]).slice(0,20).map(([code,val])=>({code,val,...meta[code]}));
  const bestQty = Object.entries(byQty).sort((x,y)=>y[1]-x[1]).slice(0,20).map(([code,qty])=>({code,qty,...meta[code]}));

  // Monthly trend
  const monthly = {}; all.forEach(r=>{ if(!r.ym) return; monthly[r.ym]=(monthly[r.ym]||0)+r.line; });
  const months = Object.keys(monthly).sort();

  return { invoices, turnover, totalQty, avg,
           topA_value, topB_value, topA_count, topB_count,
           bestVal, bestQty, months, monthly };
}

function buildFilters(all){
  const cats=uniqSorted(all.map(r=>r.category)), subs=uniqSorted(all.map(r=>r.subcat)), months=uniqSorted(all.map(r=>r.ym));
  const catSel=document.getElementById("filter-category"), subSel=document.getElementById("filter-subcat"), mSel=document.getElementById("filter-month");
  cats.forEach(c=>{const o=document.createElement("option"); o.value=c; o.textContent=c; catSel.appendChild(o);});
  subs.forEach(s=>{const o=document.createElement("option"); o.value=s; o.textContent=s; subSel.appendChild(o);});
  months.forEach(m=>{ if(!m) return; const o=document.createElement("option"); o.value=m; o.textContent=m; mSel.appendChild(o);});
}

function renderKPIs(a){
  document.getElementById("kpi-turnover").textContent=fmtMoney(a.turnover);
  document.getElementById("kpi-invoices").textContent=fmtInt(a.invoices);
  document.getElementById("kpi-qty").textContent=fmtInt(a.totalQty);
  document.getElementById("kpi-avg").textContent=fmtMoney(a.avg);
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

// Trend chart
let trendChart;
function renderTrend(months, monthly){
  const labels = months;
  const data = months.map(m=>monthly[m]||0);
  const ctx = document.getElementById("trendChart").getContext("2d");
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "Turnover", data, tension: 0.25 }] },
    options: { plugins:{legend:{display:false}}, scales:{ x:{ticks:{maxRotation:0}}, y:{beginAtZero:true} } }
  });
}

// Collapsible cards
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

async function main(){
  try{
    const raw = await fetchDataJSON();
    const all = normalize(raw);
    document.getElementById("badge-total-rows").textContent = `${all.length} rows`;
    buildFilters(all);

    const state = { clientsA:"value", clientsB:"value", items:"value" };

    function recomputeAndRender(){
      const filtered = applyFilters(all);
      const agg = aggregate(filtered);
      renderKPIs(agg);

      setPillset(document.getElementById("clientsModeA"), state.clientsA);
      setPillset(document.getElementById("clientsModeB"), state.clientsB);
      renderTopClients(document.getElementById("list-topA"),
        state.clientsA==="value" ? agg.topA_value : agg.topA_count, state.clientsA);
      renderTopClients(document.getElementById("list-topB"),
        state.clientsB==="value" ? agg.topB_value : agg.topB_count, state.clientsB);

      setPillset(document.getElementById("itemsMode"), state.items);
      renderBestItems(document.getElementById("list-items"),
        state.items==="value" ? agg.bestVal : agg.bestQty, state.items);

      renderTrend(agg.months, agg.monthly);
    }

    // Filters
    document.querySelectorAll('input[name="type"]').forEach(r=>r.addEventListener("change", recomputeAndRender));
    document.getElementById("filter-category").addEventListener("change", recomputeAndRender);
    document.getElementById("filter-subcat").addEventListener("change", recomputeAndRender);
    document.getElementById("filter-month").addEventListener("change", recomputeAndRender);

    // Mode toggles
    document.getElementById("clientsModeA").addEventListener("click", e=>{
      const b=e.target.closest(".pill"); if(!b) return; state.clientsA=b.dataset.mode; recomputeAndRender();
    });
    document.getElementById("clientsModeB").addEventListener("click", e=>{
      const b=e.target.closest(".pill"); if(!b) return; state.clientsB=b.dataset.mode; recomputeAndRender();
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
