import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  RadialLinearScale,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Scatter, Radar, Line, Bar } from "react-chartjs-2";
import { kmeans, separationScore, standardize } from "@/lib/kmeans";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  RadialLinearScale,
  Filler,
  Tooltip,
  Legend,
);

const PALETTE = [
  "#6b8ec4", "#5fa8a3", "#d49a6a", "#9b85b8",
  "#7fa881", "#6c7a89", "#d4b16a", "#c98a9b",
];

type Row = Record<string, unknown>;
type ColType = "numeric" | "categorical" | "date";

interface DetectedCols {
  all: string[];
  numeric: string[];
  categorical: string[];
  date: string[];
}

function detectColumns(rows: Row[]): DetectedCols {
  if (!rows.length) return { all: [], numeric: [], categorical: [], date: [] };
  const all = Object.keys(rows[0]);
  const numeric: string[] = [];
  const categorical: string[] = [];
  const date: string[] = [];
  for (const c of all) {
    let nNum = 0;
    let nDate = 0;
    let nNonNull = 0;
    for (const r of rows) {
      const v = r[c];
      if (v === null || v === undefined || v === "") continue;
      nNonNull++;
      const num = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
      if (!isNaN(num) && isFinite(num)) nNum++;
      if (typeof v === "string" && /^\d{4}[-/]\d{1,2}([-/]\d{1,2})?/.test(v)) nDate++;
      else if (v instanceof Date) nDate++;
    }
    if (nNonNull === 0) continue;
    if (nDate / nNonNull >= 0.8) date.push(c);
    else if (nNum / nNonNull >= 0.8) numeric.push(c);
    else categorical.push(c);
  }
  return { all, numeric, categorical, date };
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (v === null || v === undefined || v === "") return NaN;
  return parseFloat(String(v).replace(/,/g, ""));
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={"bg-white " + className}
      style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 16 }}
    >
      {children}
    </div>
  );
}

interface ClusterResult {
  assign: number[];
  k: number;
  features: string[];
  separation: number;
  validIdx: number[];
}

const Index = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [cols, setCols] = useState<DetectedCols>({ all: [], numeric: [], categorical: [], date: [] });
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [k, setK] = useState(4);
  const [result, setResult] = useState<ClusterResult | null>(null);
  const [activeSegments, setActiveSegments] = useState<Set<number>>(new Set());
  const [xAxis, setXAxis] = useState("");
  const [yAxis, setYAxis] = useState("");
  const [trendMetric, setTrendMetric] = useState("");
  const [fileName, setFileName] = useState("");
  const [kpiDecimals, setKpiDecimals] = useState(2);
  const [kpiCompact, setKpiCompact] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fmtKpi = (n: number) =>
    n.toLocaleString(undefined, {
      notation: kpiCompact ? "compact" : "standard",
      maximumFractionDigits: kpiDecimals,
      minimumFractionDigits: kpiCompact ? 0 : kpiDecimals,
    });

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();
    let parsed: Row[] = [];
    if (ext === "csv") {
      const text = await file.text();
      const r = Papa.parse<Row>(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
      parsed = r.data;
    } else {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      parsed = XLSX.utils.sheet_to_json<Row>(ws, { defval: null });
    }
    parsed = parsed.filter((r) => r && Object.values(r).some((v) => v !== null && v !== ""));
    const detected = detectColumns(parsed);
    setRows(parsed);
    setCols(detected);
    setSelectedFeatures(detected.numeric);
    setXAxis(detected.numeric[0] || "");
    setYAxis(detected.numeric[1] || detected.numeric[0] || "");
    setTrendMetric(detected.numeric[0] || "");
    setResult(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const runClustering = () => {
    if (selectedFeatures.length === 0) return;
    const validIdx: number[] = [];
    const data: number[][] = [];
    rows.forEach((r, i) => {
      const vec = selectedFeatures.map((f) => num(r[f]));
      if (vec.every((v) => !isNaN(v) && isFinite(v))) {
        validIdx.push(i);
        data.push(vec);
      }
    });
    if (data.length < k) return;
    const { z } = standardize(data);
    const { assign } = kmeans(z, k, 5);
    const sep = separationScore(z, assign, k);
    setResult({ assign, k, features: [...selectedFeatures], separation: sep, validIdx });
    setActiveSegments(new Set(Array.from({ length: k }, (_, i) => i)));
  };

  // Per-row cluster (or -1)
  const rowCluster = useMemo(() => {
    if (!result) return [];
    const m = new Array(rows.length).fill(-1);
    result.validIdx.forEach((ri, i) => (m[ri] = result.assign[i]));
    return m;
  }, [result, rows]);

  const visibleRows = useMemo(() => {
    if (!result) return [];
    const out: { row: Row; cluster: number; idx: number }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const c = rowCluster[i];
      if (c >= 0 && activeSegments.has(c)) out.push({ row: rows[i], cluster: c, idx: i });
    }
    return out;
  }, [rows, rowCluster, activeSegments, result]);

  if (!rows.length || !result) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "#fafafa" }}>
        <div className="w-full max-w-2xl">
          <h1 className="text-2xl font-semibold mb-1" style={{ color: "#111" }}>
            Customer Segmentation Dashboard
          </h1>
          <p className="text-sm mb-6" style={{ color: "#666" }}>
            Upload a dataset to auto-detect features and discover segments via K-Means clustering.
          </p>

          {!rows.length ? (
            <Card>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className="cursor-pointer text-center py-16"
                style={{ border: "0.5px dashed #c7c7c7", borderRadius: 12 }}
              >
                <p className="text-base mb-1" style={{ color: "#111" }}>
                  Drop your CSV or Excel file here
                </p>
                <p className="text-xs" style={{ color: "#666" }}>
                  or click to browse — .csv, .xlsx, .xls
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </div>
            </Card>
          ) : (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium" style={{ color: "#111" }}>{fileName}</p>
                  <p className="text-xs" style={{ color: "#666" }}>
                    {rows.length} rows · {cols.numeric.length} numeric · {cols.categorical.length} categorical
                    {cols.date.length ? ` · ${cols.date.length} date` : ""}
                  </p>
                </div>
                <button
                  onClick={() => { setRows([]); setResult(null); }}
                  className="text-xs underline"
                  style={{ color: "#666" }}
                >
                  Choose another
                </button>
              </div>

              <div className="mb-4">
                <p className="text-xs mb-2" style={{ color: "#666" }}>Clustering features</p>
                <div className="flex flex-wrap gap-2">
                  {cols.numeric.map((c) => {
                    const checked = selectedFeatures.includes(c);
                    return (
                      <label
                        key={c}
                        className="flex items-center gap-2 px-2 py-1 cursor-pointer text-sm"
                        style={{
                          border: "0.5px solid #e5e5e5",
                          borderRadius: 8,
                          background: checked ? "#f4f4f4" : "#fff",
                          color: "#111",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedFeatures((s) =>
                              e.target.checked ? [...s, c] : s.filter((x) => x !== c),
                            )
                          }
                        />
                        {c}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="mb-4">
                <p className="text-xs mb-1" style={{ color: "#666" }}>Number of segments: {k}</p>
                <input
                  type="range"
                  min={2}
                  max={8}
                  value={k}
                  onChange={(e) => setK(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>

              <button
                onClick={runClustering}
                disabled={selectedFeatures.length === 0}
                className="w-full py-2 text-sm font-medium"
                style={{
                  border: "0.5px solid #111",
                  borderRadius: 8,
                  background: "#111",
                  color: "#fff",
                  opacity: selectedFeatures.length === 0 ? 0.4 : 1,
                }}
              >
                Segment
              </button>
            </Card>
          )}
        </div>
      </main>
    );
  }

  // Dashboard
  const clusterSizes = Array.from({ length: result.k }, (_, c) =>
    result.assign.filter((a) => a === c).length,
  );

  const scatterData = {
    datasets: Array.from({ length: result.k }, (_, c) => ({
      label: `Segment ${c + 1}`,
      backgroundColor: PALETTE[c],
      borderColor: PALETTE[c],
      hidden: !activeSegments.has(c),
      data: visibleRows
        .filter((v) => v.cluster === c)
        .map((v) => ({ x: num(v.row[xAxis]), y: num(v.row[yAxis]) }))
        .filter((p) => !isNaN(p.x) && !isNaN(p.y)),
    })),
  };

  // Radar normalization across selected features
  const featureMins: Record<string, number> = {};
  const featureMaxs: Record<string, number> = {};
  result.features.forEach((f) => {
    const vals = rows.map((r) => num(r[f])).filter((v) => !isNaN(v));
    featureMins[f] = Math.min(...vals);
    featureMaxs[f] = Math.max(...vals);
  });

  const clusterFeatureMeans = (c: number, f: string) => {
    let s = 0, n = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rowCluster[i] !== c) continue;
      const v = num(rows[i][f]);
      if (!isNaN(v)) { s += v; n++; }
    }
    return n ? s / n : 0;
  };

  const radarData = {
    labels: result.features,
    datasets: Array.from({ length: result.k }, (_, c) => ({
      label: `Segment ${c + 1}`,
      hidden: !activeSegments.has(c),
      backgroundColor: PALETTE[c] + "33",
      borderColor: PALETTE[c],
      pointBackgroundColor: PALETTE[c],
      data: result.features.map((f) => {
        const m = clusterFeatureMeans(c, f);
        const min = featureMins[f], max = featureMaxs[f];
        return max === min ? 50 : ((m - min) / (max - min)) * 100;
      }),
    })),
  };

  // Trend or bar
  const dateCol = cols.date[0];
  let trendChart: React.ReactNode = null;
  if (dateCol) {
    const monthsSet = new Set<string>();
    const grouped: Record<string, Record<number, number[]>> = {};
    rows.forEach((r, i) => {
      const c = rowCluster[i];
      if (c < 0 || !activeSegments.has(c)) return;
      const d = new Date(String(r[dateCol]));
      if (isNaN(d.getTime())) return;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      monthsSet.add(key);
      grouped[key] = grouped[key] || {};
      grouped[key][c] = grouped[key][c] || [];
      const v = num(r[trendMetric]);
      if (!isNaN(v)) grouped[key][c].push(v);
    });
    const months = Array.from(monthsSet).sort();
    const lineData = {
      labels: months,
      datasets: Array.from({ length: result.k }, (_, c) => ({
        label: `Segment ${c + 1}`,
        hidden: !activeSegments.has(c),
        borderColor: PALETTE[c],
        backgroundColor: PALETTE[c],
        tension: 0.3,
        data: months.map((m) => {
          const arr = grouped[m]?.[c] || [];
          return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
        }),
      })),
    };
    trendChart = <Line data={lineData} options={{ plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false }} />;
  } else {
    const barData = {
      labels: result.features,
      datasets: Array.from({ length: result.k }, (_, c) => ({
        label: `Segment ${c + 1}`,
        hidden: !activeSegments.has(c),
        backgroundColor: PALETTE[c],
        data: result.features.map((f) => clusterFeatureMeans(c, f)),
      })),
    };
    trendChart = <Bar data={barData} options={{ plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false }} />;
  }

  return (
    <main className="min-h-screen p-6" style={{ background: "#fafafa" }}>
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "#111" }}>Customer Segmentation</h1>
            <p className="text-xs" style={{ color: "#666" }}>{fileName}</p>
          </div>
          <button
            onClick={() => { setRows([]); setResult(null); }}
            className="text-xs underline"
            style={{ color: "#666" }}
          >
            Upload new file
          </button>
        </header>

        {/* KPI controls */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <span className="text-xs" style={{ color: "#666" }}>KPI format</span>
          <label className="flex items-center gap-1 text-xs" style={{ color: "#111" }}>
            Decimals
            <select
              value={kpiDecimals}
              onChange={(e) => setKpiDecimals(parseInt(e.target.value))}
              style={{ border: "0.5px solid #e5e5e5", borderRadius: 8, padding: "2px 6px" }}
            >
              {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="flex text-xs" style={{ border: "0.5px solid #e5e5e5", borderRadius: 8, overflow: "hidden" }}>
            <button
              onClick={() => setKpiCompact(false)}
              style={{ padding: "2px 8px", background: !kpiCompact ? "#111" : "#fff", color: !kpiCompact ? "#fff" : "#111" }}
            >Full</button>
            <button
              onClick={() => setKpiCompact(true)}
              style={{ padding: "2px 8px", background: kpiCompact ? "#111" : "#fff", color: kpiCompact ? "#fff" : "#111" }}
            >Compact</button>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <Card>
            <p className="text-xs" style={{ color: "#666" }}>Records</p>
            <p className="text-xl font-semibold" style={{ color: "#111" }}>{fmtKpi(rows.length)}</p>
          </Card>
          <Card>
            <p className="text-xs" style={{ color: "#666" }}>Segments</p>
            <p className="text-xl font-semibold" style={{ color: "#111" }}>{result.k}</p>
          </Card>
          <Card>
            <p className="text-xs" style={{ color: "#666" }}>Separation</p>
            <p className="text-xl font-semibold" style={{ color: "#111" }}>
              {result.separation.toLocaleString(undefined, { maximumFractionDigits: kpiDecimals, minimumFractionDigits: kpiDecimals })}
            </p>
          </Card>
          {result.features.slice(0, 4).map((f) => {
            const vals = rows.map((r) => num(r[f])).filter((v) => !isNaN(v));
            const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
            return (
              <Card key={f}>
                <p className="text-xs truncate" style={{ color: "#666" }}>Avg {f}</p>
                <p className="text-xl font-semibold" style={{ color: "#111" }}>{fmtKpi(mean)}</p>
              </Card>
            );
          })}
        </div>

        {/* Pills */}
        <div className="flex flex-wrap gap-2 mb-4">
          {Array.from({ length: result.k }, (_, c) => {
            const active = activeSegments.has(c);
            const pct = ((clusterSizes[c] / result.assign.length) * 100).toFixed(1);
            return (
              <button
                key={c}
                onClick={() => {
                  const next = new Set(activeSegments);
                  next.has(c) ? next.delete(c) : next.add(c);
                  setActiveSegments(next);
                }}
                className="flex items-center gap-2 px-3 py-1 text-xs"
                style={{
                  border: "0.5px solid #e5e5e5",
                  borderRadius: 999,
                  background: active ? "#fff" : "#f0f0f0",
                  opacity: active ? 1 : 0.5,
                  color: "#111",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 999, background: PALETTE[c] }} />
                Segment {c + 1} · {pct}%
              </button>
            );
          })}
        </div>

        {/* Charts */}
        <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <Card>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <p className="text-sm font-medium" style={{ color: "#111" }}>Scatter</p>
              <div className="flex gap-2 text-xs">
                <select value={xAxis} onChange={(e) => setXAxis(e.target.value)}
                  style={{ border: "0.5px solid #e5e5e5", borderRadius: 8, padding: "2px 6px" }}>
                  {cols.numeric.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={yAxis} onChange={(e) => setYAxis(e.target.value)}
                  style={{ border: "0.5px solid #e5e5e5", borderRadius: 8, padding: "2px 6px" }}>
                  {cols.numeric.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ height: 280 }}>
              <Scatter data={scatterData} options={{
                plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false,
                scales: { x: { title: { display: true, text: xAxis } }, y: { title: { display: true, text: yAxis } } },
              }} />
            </div>
          </Card>

          <Card>
            <p className="text-sm font-medium mb-2" style={{ color: "#111" }}>Feature profile</p>
            <div style={{ height: 280 }}>
              <Radar data={radarData} options={{
                plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false,
                scales: { r: { suggestedMin: 0, suggestedMax: 100 } },
              }} />
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <p className="text-sm font-medium" style={{ color: "#111" }}>
                {dateCol ? "Trend over time" : "Mean by segment"}
              </p>
              {dateCol && (
                <select value={trendMetric} onChange={(e) => setTrendMetric(e.target.value)}
                  className="text-xs"
                  style={{ border: "0.5px solid #e5e5e5", borderRadius: 8, padding: "2px 6px" }}>
                  {cols.numeric.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>
            <div style={{ height: 280 }}>{trendChart}</div>
          </Card>
        </div>

        {/* Segment detail cards */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {Array.from({ length: result.k }, (_, c) => {
            if (!activeSegments.has(c)) return null;
            const size = clusterSizes[c];
            const pct = ((size / result.assign.length) * 100).toFixed(1);
            return (
              <Card key={c}>
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: PALETTE[c] }} />
                  <p className="text-sm font-medium" style={{ color: "#111" }}>Segment {c + 1}</p>
                  <p className="text-xs ml-auto" style={{ color: "#666" }}>{size} · {pct}%</p>
                </div>
                {result.features.map((f) => {
                  const m = clusterFeatureMeans(c, f);
                  const max = featureMaxs[f] || 1;
                  return (
                    <div key={f} className="mb-2">
                      <div className="flex justify-between text-xs">
                        <span style={{ color: "#666" }}>{f}</span>
                        <span style={{ color: "#111" }}>{m.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      </div>
                      <div style={{ height: 4, background: "#f0f0f0", borderRadius: 999, marginTop: 2 }}>
                        <div style={{ width: `${Math.min(100, (m / max) * 100)}%`, height: "100%", background: PALETTE[c], borderRadius: 999 }} />
                      </div>
                    </div>
                  );
                })}
                {cols.categorical.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {cols.categorical.slice(0, 4).map((cat) => {
                      const counts: Record<string, number> = {};
                      for (let i = 0; i < rows.length; i++) {
                        if (rowCluster[i] !== c) continue;
                        const v = String(rows[i][cat] ?? "");
                        if (!v) continue;
                        counts[v] = (counts[v] || 0) + 1;
                      }
                      const mode = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
                      if (!mode) return null;
                      return (
                        <span key={cat} className="text-xs px-2 py-0.5"
                          style={{ border: "0.5px solid #e5e5e5", borderRadius: 999, color: "#111", background: "#fafafa" }}>
                          {cat}: {mode[0]}
                        </span>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </main>
  );
};

export default Index;
