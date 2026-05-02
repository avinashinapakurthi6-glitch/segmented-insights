## Customer Segmentation Dashboard — Single-File HTML

A self-contained `dashboard.html` delivered to `/mnt/documents/`. Opens in any browser, no server needed. All logic, styles, and CDN script tags live in one file.

### Libraries (CDN)
- PapaParse 5.x — CSV parsing
- SheetJS (xlsx) 0.20.x — .xlsx / .xls parsing
- Chart.js 4.4.1 — scatter, radar, line/bar

### Screen 1 — Import
- Centered drop zone: "Drop your CSV or Excel file here" + click-to-browse fallback
- Accepts `.csv`, `.xlsx`, `.xls`
- On parse:
  - Auto-detect column types: numeric (≥80% parseable as numbers) vs categorical vs date (parseable as Date, e.g. ISO/`YYYY-MM`)
  - Show file summary: row count, column count
  - Column selector: checkbox list of every numeric column (all checked by default) — these are the clustering features
  - K slider: 2–8, default 5
  - "Segment" button runs K-Means

### K-Means
- Pure JS implementation, z-score standardized features, k-means++ init, max 100 iterations, 5 restarts, keep best inertia
- Separation score = between-cluster variance ÷ total variance (0–1, higher = better separation)

### Screen 2 — Dashboard (post-clustering)

**KPI row**
- Total records
- Number of segments
- Separation score (0.00–1.00)
- One card per selected clustering feature → overall mean

**Segment pills row** (replaces all chart legends)
- One pill per cluster: "Segment N" + percentage, auto-assigned color
- Click toggles segment on/off across every chart and detail card simultaneously
- Active/inactive visual state

**Charts**
1. Scatter Plot — X-axis and Y-axis dropdowns populated from every numeric column; points colored by cluster
2. Radar Chart — one spoke per selected clustering feature, all active segments overlaid, values min-max normalized 0–100
3. Trend / Bar Chart — if a date column was detected, show monthly line per segment (count or mean of first feature, with a small selector); otherwise grouped bar chart of mean values per segment for each clustering feature

**Segment detail cards** (one per cluster, auto-generated)
- Header: color dot, "Segment N", size + percentage
- Per selected numeric feature: label, mean value, thin inline horizontal bar scaled to that feature's global max
- Per detected categorical column: label + most common value (mode) in that cluster as a small chip

### Design
- Light neutral flat: `#ffffff` background, `#fafafa` panels, `#111` text, `#666` muted
- Segment palette: muted blue, teal, orange, purple, green, slate, amber, rose (up to 8)
- 0.5px solid `#e5e5e5` borders, `border-radius: 12px` on every card
- No gradients, no shadows
- System font stack
- Responsive grid using CSS `grid` with `auto-fit, minmax(...)`; cards wrap on narrow screens
- Charts in fixed-aspect containers so they stay readable at small widths

### Behavior
- No file → import screen only
- After clustering → full dashboard; "Upload new file" link in header to reset
- All dropdowns (X, Y, optional color dimension, trend metric) populated dynamically from parsed columns — nothing hardcoded
- Re-running with a different k or different feature selection re-renders everything in place

### Technical notes
- Single `<script>` block, vanilla JS (no build step)
- State held in one module-scoped object: `{rows, columns, numericCols, catCols, dateCol, selectedFeatures, k, clusters, assignments, activeSegments}`
- All chart instances stored so they can be `.destroy()`'d on re-render
- Type detection runs once on upload; clustering re-runs on Segment button; chart redraws run on pill toggle / dropdown change
- Output saved to `/mnt/documents/customer-segmentation-dashboard.html` and surfaced as a downloadable artifact

### Deliverable
A single `customer-segmentation-dashboard.html` file you can download, double-click to open, and immediately drop a CSV/Excel into.
