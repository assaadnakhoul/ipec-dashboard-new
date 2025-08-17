<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>IPEC — Sales Dashboard</title>

  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
    .card { @apply bg-white rounded-2xl shadow p-4; }
    .kpi { @apply text-3xl font-extrabold tracking-tight; }
    .sub { @apply text-xs text-gray-500; }
    .scroll-5 { max-height: 240px; overflow: auto; } /* ~5 rows */
    .num { font-variant-numeric: tabular-nums; }
    .pill { @apply inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm bg-gray-100; }
    th, td { white-space: nowrap; }
  </style>
</head>
<body class="bg-gray-50">
  <div class="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
    <header class="flex items-center justify-between">
      <h1 class="text-2xl md:text-3xl font-extrabold">Sales Dashboard</h1>
      <div class="flex gap-2">
        <span class="pill" id="badge-total-rows">— rows</span>
        <span class="pill" id="badge-source">—</span>
      </div>
    </header>

    <!-- KPI Bar -->
    <section class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="card"><div class="sub">Total Turnover</div><div id="kpi-turnover" class="kpi num">—</div></div>
      <div class="card"><div class="sub">Invoices</div><div id="kpi-invoices" class="kpi num">—</div></div>
      <div class="card"><div class="sub">Total Qty</div><div id="kpi-qty" class="kpi num">—</div></div>
      <div class="card"><div class="sub">Average Basket</div><div id="kpi-avg" class="kpi num">—</div></div>
    </section>

    <!-- Filters + Search -->
    <section class="card">
      <div class="flex flex-col md:flex-row gap-3 md:items-end">
        <div>
          <label class="sub">Type</label>
          <div class="flex gap-2 mt-1">
            <label class="pill cursor-pointer"><input type="radio" name="type" value="ALL" class="mr-2" checked>All</label>
            <label class="pill cursor-pointer"><input type="radio" name="type" value="A" class="mr-2">INVOICE OUT</label>
            <label class="pill cursor-pointer"><input type="radio" name="type" value="B" class="mr-2">INVOICE IN</label>
          </div>
        </div>
        <div class="flex-1">
          <label class="sub">Search (client, product, category, sub-category, description)</label>
          <input id="search" class="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2" placeholder="Type to search…" />
        </div>
        <div>
          <label class="sub">Category</label>
          <select id="filter-category" class="w-56 mt-1 rounded-xl border border-gray-200 px-3 py-2">
            <option value="">All</option>
          </select>
        </div>
        <div>
          <label class="sub">Sub-category</label>
          <select id="filter-subcat" class="w-56 mt-1 rounded-xl border border-gray-200 px-3 py-2">
            <option value="">All</option>
          </select>
        </div>
      </div>
    </section>

    <!-- Top 10 Clients -->
    <section class="grid md:grid-cols-2 gap-4">
      <div class="card">
        <div class="font-semibold mb-2">Top 10 Clients — INVOICE OUT</div>
        <ol id="list-topA" class="space-y-1 scroll-5"></ol>
      </div>
      <div class="card">
        <div class="font-semibold mb-2">Top 10 Clients — INVOICE IN</div>
        <ol id="list-topB" class="space-y-1 scroll-5"></ol>
      </div>
    </section>

    <!-- Best Sellers -->
    <section class="grid md:grid-cols-2 gap-4">
      <div class="card">
        <div class="font-semibold mb-2">Best Sellers — by Value</div>
        <ul id="list-value" class="space-y-2 scroll-5"></ul>
      </div>
      <div class="card">
        <div class="font-semibold mb-2">Best Sellers — by Qty</div>
        <ul id="list-qty" class="space-y-2 scroll-5"></ul>
      </div>
    </section>

    <!-- Table -->
    <section class="card">
      <div class="font-semibold mb-2">All Rows (5 visible, scroll for more)</div>
      <div class="overflow-auto" style="max-height: 260px;">
        <table class="min-w-full text-sm">
          <thead class="sticky top-0 bg-white">
            <tr class="border-b">
              <th class="text-left p-2">Date</th>
              <th class="text-left p-2">Client</th>
              <th class="text-left p-2">Type</th>
              <th class="text-left p-2">Invoice</th>
              <th class="text-left p-2">ItemCode</th>
              <th class="text-left p-2">Description</th>
              <th class="text-right p-2">Qty</th>
              <th class="text-right p-2">UnitPrice</th>
              <th class="text-right p-2">LineTotal</th>
              <th class="text-left p-2">Category</th>
              <th class="text-left p-2">Sub-category</th>
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </section>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js"></script>
  <script src="config.js"></script>
  <script src="app.js"></script>
</body>
</html>
