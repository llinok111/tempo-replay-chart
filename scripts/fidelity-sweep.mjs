/**
 * fidelity-sweep.mjs — how much budget does a series actually need?
 *
 * Answers a question a single number cannot: at what render budget does
 * decimation become invisible, and how does that depend on the data's own
 * roughness? Runs in plain Node — the measurement is arithmetic, not rendering.
 *
 *   node scripts/fidelity-sweep.mjs
 */

import { selectIndices, measureFidelity, lttb, minMax } from '../src/tempo/downsample.js';
import { pixelFidelity, budgetForPixelTolerance } from '../src/tempo/fidelity.js';
/** mulberry32 — same generator the demo fixtures use. */
function rng(seed) {
	let a = (seed || 1) >>> 0;
	return function () {
		a = (a + 0x6D2B79F5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 1002;
const HEIGHT = 360;

/** Three data shapes, because decimation cost depends entirely on roughness. */
function fixtures(n) {
	const start = Date.UTC(2026, 8, 1);
	const xs = new Array(n);

	// 1. smooth: a slow sine, the case LTTB is designed for
	const smooth = new Array(n);

	// 2. mixed: trend + seasonal + moderate noise
	const mixed = new Array(n);

	// 3. noisy: near-white noise, the worst case for any decimation
	const noisy = new Array(n);

	const r = rng(20261022);
	let walk = 0;
	let white = 0;

	for (let i = 0; i < n; i++) {
		xs[i] = start + i * 1000;
		smooth[i] = 50 + Math.sin(i / (n / 12)) * 25;
		walk += (r() - 0.5) * 2.4;
		walk *= 0.9995;
		mixed[i] = 50 + Math.sin(i / (n / 8)) * 18 + walk;
		white = (r() - 0.5) * 12;
		noisy[i] = 50 + white;
	}

	return { smooth, mixed, noisy, xs };
}

const rows = [];
const budgets = [1200, 2400, 4800, 9600, 19200, 38400];

for (const n of [100000, 1000000]) {
	const { smooth, mixed, noisy, xs } = fixtures(n);

	for (const [name, ys] of [['smooth', smooth], ['mixed', mixed], ['noisy', noisy]]) {
		for (const mode of ['lttb', 'minmax']) {
			for (const budget of budgets) {
				if (budget >= n) continue;

				const t0 = performance.now();
				const idx = mode === 'lttb' ? lttb(xs, ys, budget) : minMax(xs, ys, budget);
				const selectMs = performance.now() - t0;

				const fid = measureFidelity(xs, ys, idx);
				const px = pixelFidelity(xs, ys, idx, WIDTH, HEIGHT);

				rows.push({
					rows: n,
					shape: name,
					mode,
					budget,
					kept: idx.length,
					ratio: +(n / idx.length).toFixed(1),
					selectMs: +selectMs.toFixed(2),
					maxNormPct: +(fid.maxNormError * 100).toFixed(3),
					meanNormPct: +((fid.meanAbsError / fid.ySpan) * 100).toFixed(3),
					peakLossPct: +(fid.peakLossRatio * 100).toFixed(4),
					maxPx: px ? px.maxDiffPx : null,
					meanPx: px ? px.meanDiffPx : null,
				});
			}
		}
	}
}

const out = {
	at: new Date().toISOString(),
	viewport: { width: WIDTH, height: HEIGHT },
	note: 'maxPx / meanPx are per-column vertical disagreements between the raw envelope and the drawn decimated polyline, in CSS pixels.',
	rows,
};

mkdirSync(resolve(root, 'perf'), { recursive: true });
writeFileSync(resolve(root, 'perf/fidelity-sweep.json'), JSON.stringify(out, null, 2) + '\n');

// ---- console tables -------------------------------------------------------

const pad = (s, n) => String(s).padStart(n);

for (const n of [100000, 1000000]) {
	console.log(`\n== ${n.toLocaleString('en-US')} rows -> budget, CSS px error (1022x360 plot) ==`);
	console.log('shape   mode    budget   kept   ratio   maxPx  meanPx  maxNorm%  selectMs');
	for (const r of rows.filter(x => x.rows === n)) {
		console.log(
			r.shape.padEnd(8) + r.mode.padEnd(8) + pad(r.budget, 6) + pad(r.kept, 7) +
			pad(r.ratio, 8) + pad(r.maxPx, 8) + pad(r.meanPx, 8) + pad(r.maxNormPct, 10) + pad(r.selectMs, 10),
		);
	}
}

// Budget needed for a 1-px worst column, per shape.
console.log('\n== budget required for a <=1 px worst column ==');
for (const n of [100000, 1000000]) {
	const { smooth, mixed, noisy, xs } = fixtures(n);
	for (const [name, ys] of [['smooth', smooth], ['mixed', mixed], ['noisy', noisy]]) {
		const found = budgetForPixelTolerance(xs, ys, lttb, { thresholdPx: 1, width: WIDTH, height: HEIGHT });
		console.log(`${String(n).padStart(8)} ${name.padEnd(8)} ${found ? 'budget ' + found.budget + ' (max ' + found.maxDiffPx + ' px)' : 'not reachable within 76 800 points'}`);
	}
}

console.log('\nwrote perf/fidelity-sweep.json');
