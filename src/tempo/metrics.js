/**
 * metrics.js — measurement primitives used by the chart and the benchmarks.
 *
 * The numbers this module produces end up in the README, so it deliberately
 * keeps raw samples instead of only an average: an average hides the one frame
 * that stuttered, and a stutter is exactly what a reader of an animated chart
 * notices.
 */

/** Nearest-rank percentile over an unsorted sample array. */
export function percentile(samples, p) {
	if (samples.length === 0)
		return NaN;

	const sorted = Array.prototype.slice.call(samples).sort((a, b) => a - b);
	const rank = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

export function summarize(samples) {
	if (samples.length === 0) {
		return { n: 0, min: NaN, mean: NaN, p50: NaN, p95: NaN, p99: NaN, max: NaN, sum: 0 };
	}

	let sum = 0;
	let min = Infinity;
	let max = -Infinity;

	for (let i = 0; i < samples.length; i++) {
		const v = samples[i];
		sum += v;
		if (v < min) min = v;
		if (v > max) max = v;
	}

	return {
		n: samples.length,
		min,
		mean: sum / samples.length,
		p50: percentile(samples, 50),
		p95: percentile(samples, 95),
		p99: percentile(samples, 99),
		max,
		sum,
	};
}

/** Round to a fixed number of decimals without turning numbers into strings. */
export function round(v, digits = 2) {
	const f = Math.pow(10, digits);
	return Math.round(v * f) / f;
}

/** A named ring of samples, capped so long sessions cannot grow unbounded. */
export class SampleSeries {
	constructor(name, cap = 20000) {
		this.name = name;
		this.cap = cap;
		this.samples = [];
	}

	add(v) {
		this.samples.push(v);
		if (this.samples.length > this.cap)
			this.samples.shift();
		return this;
	}

	clear() {
		this.samples.length = 0;
		return this;
	}

	get stats() {
		return summarize(this.samples);
	}
}

/**
 * Collect a labelled set of sample series.
 * `report()` is the object written into a benchmark JSON file verbatim.
 */
export class Metrics {
	constructor() {
		this._series = new Map();
	}

	series(name) {
		let s = this._series.get(name);
		if (!s)
			this._series.set(name, s = new SampleSeries(name));
		return s;
	}

	add(name, v) {
		this.series(name).add(v);
		return this;
	}

	clear() {
		this._series.clear();
		return this;
	}

	report() {
		const out = {};
		for (const [name, s] of this._series)
			out[name] = summarize(s.samples);
		return out;
	}
}
