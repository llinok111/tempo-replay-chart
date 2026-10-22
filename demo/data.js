/**
 * data.js — deterministic fixtures shared by the demos and the benchmarks.
 *
 * Loaded as a plain script (not an ES module) so the workbench also runs when
 * opened straight from disk with file://, where module loading is blocked by
 * the browser's CORS policy.
 *
 * Everything is seeded: the same seed produces the same bytes, so a benchmark
 * run can be repeated and a screenshot can be compared.
 */
(function (global) {
	'use strict';

	/** mulberry32 — small, fast, reproducible. */
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

	/** Smooth bounded random walk with a seasonal component. */
	function series(n, opts) {
		opts = opts || {};
		const rnd = rng(opts.seed || 7);
		const base = opts.base == null ? 50 : opts.base;
		const amp = opts.amp == null ? 30 : opts.amp;
		const noise = opts.noise == null ? 4 : opts.noise;
		const drift = opts.drift || 0;

		const out = new Array(n);
		let walk = base;

		for (let i = 0; i < n; i++) {
			walk += (rnd() - 0.5) * noise;
			if (walk < 2) walk = 2 + rnd();
			if (walk > 98) walk = 98 - rnd();
			const season = Math.sin((i / n) * Math.PI * 8) * amp;
			out[i] = Math.max(0, Math.min(100, walk + season * 0.25 + drift * (i / n)));
		}

		return out;
	}

	/** Regular time series: `n` points every `stepMs`. */
	function timeSeries(n, opts) {
		opts = opts || {};
		const stepMs = opts.stepMs || 60000;
		const start = opts.start == null ? Date.UTC(2026, 8, 1) : opts.start;
		const seriesCount = opts.seriesCount || 1;
		const seed = opts.seed || 7;

		const xs = new Array(n);
		const data = [xs];

		for (let i = 0; i < n; i++)
			xs[i] = start + i * stepMs;

		for (let s = 0; s < seriesCount; s++) {
			data.push(series(n, {
				seed: seed + s * 101,
				base: opts.base,
				amp: opts.amp,
				drift: opts.drift == null ? s * 6 : opts.drift,
				noise: opts.noise,
			}));
		}

		return data;
	}

	/** Irregular sampling with repeated multi-hour outages. */
	function gappySeries(n, opts) {
		opts = opts || {};
		const start = opts.start == null ? Date.UTC(2026, 8, 1) : opts.start;
		const rnd = rng(opts.seed || 11);

		const xs = [];
		const ys = [];
		let t = start;

		for (let i = 0; i < n; i++) {
			const step = i > 0 && i % 40 === 0
				? 3600000 * (4 + Math.floor(rnd() * 6))
				: 60000 * (1 + Math.floor(rnd() * 3));
			t += step;
			xs.push(t);
			ys.push(20 + Math.sin(i / 9) * 12 + rnd() * 6);
		}

		return [xs, ys];
	}

	/** Deliberately broken input covering every repair the guard implements. */
	function dirtyData() {
		return [
			[0, 1, 2, 3, NaN, 5, 5, 7, 8, 9, 10, 11],
			[10, '20', 30, null, 50, 60, 61, Infinity, 80, -Infinity, 'n/a', 110],
			[1, 2, 3, 4, 5, 6, 7, 8, 9],
		];
	}

	/** A larger wrong-but-plausible feed: ~8% of cells are unusable. */
	function messySeries(n, opts) {
		opts = opts || {};
		const rnd = rng(opts.seed || 23);
		const clean = timeSeries(n, { stepMs: 60000, seriesCount: 2, seed: opts.seed || 23 });
		const xs = clean[0].slice();
		const y1 = clean[1].slice();
		const y2 = clean[2].slice();

		for (let i = 0; i < n; i++) {
			const r = rnd();
			if (r < 0.02) y1[i] = NaN;
			else if (r < 0.04) y1[i] = null;
			else if (r < 0.05) y1[i] = '#REF';
			else if (r < 0.06) y1[i] = Infinity;
			else if (r < 0.075) y2[i] = 'n/a';
			else if (r < 0.08) y2[i] = -Infinity;
		}

		// Duplicate a few timestamps and knock a few rows out of order.
		xs[10] = xs[9];
		xs[200] = xs[199];
		const swapAt = [[30, 120], [400, 401], [900, 950]];
		for (const pair of swapAt) {
			const a = pair[0];
			const b = pair[1];
			if (b >= n) continue;
			const tx = xs[a]; xs[a] = xs[b]; xs[b] = tx;
			const t1 = y1[a]; y1[a] = y1[b]; y1[b] = t1;
			const t2 = y2[a]; y2[a] = y2[b]; y2[b] = t2;
		}

		return [xs, y1, y2];
	}

	function shuffleRows(data, seed) {
		const rnd = rng(seed || 3);
		const n = data[0].length;
		const idx = Array.from({ length: n }, function (_, i) { return i; });

		for (let i = n - 1; i > 0; i--) {
			const j = Math.floor(rnd() * (i + 1));
			const t = idx[i];
			idx[i] = idx[j];
			idx[j] = t;
		}

		return data.map(function (col) { return idx.map(function (i) { return col[i]; }); });
	}

	/** Monotone x with a noisy random walk for large-scale runs. */
	function bigSeries(n, opts) {
		opts = opts || {};
		const start = opts.start == null ? Date.UTC(2026, 8, 1) : opts.start;
		const step = opts.stepMs || 1000;
		const rnd = rng(opts.seed || 31);
		const xs = new Array(n);
		const y1 = new Array(n);
		const y2 = new Array(n);

		let s1 = 0;
		let s2 = 0;
		for (let i = 0; i < n; i++) {
			xs[i] = start + i * step;
			s1 = 0.98 * s1 + (rnd() - 0.5) * 2.4;
			s2 = 0.995 * s2 + (rnd() - 0.5) * 1.6;
			y1[i] = 50 + Math.sin(i / 4000) * 18 + s1;
			y2[i] = 42 + Math.cos(i / 7000) * 12 + s2;
		}

		return [xs, y1, y2];
	}

	global.TempoData = {
		rng: rng,
		series: series,
		timeSeries: timeSeries,
		gappySeries: gappySeries,
		dirtyData: dirtyData,
		messySeries: messySeries,
		shuffleRows: shuffleRows,
		bigSeries: bigSeries,
		PALETTE: {
			ink: '#2b2521',
			muted: '#8a7f74',
			amber: '#c2740f',
			brick: '#a63b2a',
			teal: '#3f6f6a',
			olive: '#6f7a3a',
			plum: '#7a4a6b',
			line: 'rgba(43,37,33,0.12)',
		},
	};
})(window);
