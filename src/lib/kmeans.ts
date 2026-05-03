// Pure JS K-Means with k-means++ init, z-score standardization, multi-restart.

export type Vec = number[];

function euclid(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

export function standardize(rows: Vec[]): { z: Vec[]; means: number[]; stds: number[] } {
  const d = rows[0].length;
  const means = new Array(d).fill(0);
  const stds = new Array(d).fill(0);
  for (const r of rows) for (let i = 0; i < d; i++) means[i] += r[i];
  for (let i = 0; i < d; i++) means[i] /= rows.length;
  for (const r of rows) for (let i = 0; i < d; i++) stds[i] += (r[i] - means[i]) ** 2;
  for (let i = 0; i < d; i++) stds[i] = Math.sqrt(stds[i] / rows.length) || 1;
  const z = rows.map((r) => r.map((v, i) => (v - means[i]) / stds[i]));
  return { z, means, stds };
}

function kppInit(data: Vec[], k: number): Vec[] {
  const centers: Vec[] = [data[Math.floor(Math.random() * data.length)].slice()];
  while (centers.length < k) {
    const dists = data.map((p) => Math.min(...centers.map((c) => euclid(p, c))));
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    centers.push(data[idx].slice());
  }
  return centers;
}

function runOnce(data: Vec[], k: number, maxIter = 100) {
  let centers = kppInit(data, k);
  const assign = new Array(data.length).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < data.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const dd = euclid(data[i], centers[c]);
        if (dd < bestD) {
          bestD = dd;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        changed = true;
      }
    }
    const sums: number[][] = Array.from({ length: k }, () => new Array(data[0].length).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < data.length; i++) {
      counts[assign[i]]++;
      for (let j = 0; j < data[0].length; j++) sums[assign[i]][j] += data[i][j];
    }
    centers = centers.map((c, ci) =>
      counts[ci] === 0 ? c : sums[ci].map((s) => s / counts[ci]),
    );
    if (!changed) break;
  }
  let inertia = 0;
  for (let i = 0; i < data.length; i++) inertia += euclid(data[i], centers[assign[i]]);
  return { centers, assign, inertia };
}

export function kmeans(data: Vec[], k: number, restarts = 5) {
  let best = runOnce(data, k);
  for (let i = 1; i < restarts; i++) {
    const r = runOnce(data, k);
    if (r.inertia < best.inertia) best = r;
  }
  return best;
}

export function separationScore(data: Vec[], assign: number[], k: number): number {
  const d = data[0].length;
  const overall = new Array(d).fill(0);
  for (const r of data) for (let i = 0; i < d; i++) overall[i] += r[i];
  for (let i = 0; i < d; i++) overall[i] /= data.length;
  const centers: number[][] = Array.from({ length: k }, () => new Array(d).fill(0));
  const counts = new Array(k).fill(0);
  for (let i = 0; i < data.length; i++) {
    counts[assign[i]]++;
    for (let j = 0; j < d; j++) centers[assign[i]][j] += data[i][j];
  }
  for (let c = 0; c < k; c++) if (counts[c]) for (let j = 0; j < d; j++) centers[c][j] /= counts[c];
  let between = 0;
  for (let c = 0; c < k; c++) {
    for (let j = 0; j < d; j++) between += counts[c] * (centers[c][j] - overall[j]) ** 2;
  }
  let total = 0;
  for (const r of data) for (let j = 0; j < d; j++) total += (r[j] - overall[j]) ** 2;
  return total === 0 ? 0 : between / total;
}
