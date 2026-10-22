/**
 * compress.js — turn a raw feed into an adaptive replay timeline.
 *
 * Live data is rarely evenly spaced and is often long and quiet. Playing back
 * 12 hours of mostly-idle sensor data at a fixed duration would spend most of
 * the animation on nothing happening, so Tempo compresses **empty stretches**
 * and guarantees that every stretch containing data gets a minimum share of
 * the timeline.
 *
 * The mapping is piecewise linear and strictly monotonic:
 *
 *   timelineTime(x) = Σ segments  →  a continuous, invertible function
 *
 * Both directions are exact inverses of each other, which is what lets a
 * playhead drag map back to a real timestamp without drifting.
 */

/**
 * Build a piecewise-linear compression map.
 *
 * @param {number[]} xs      ascending timestamps (real axis)
 * @param {object} [opts]
 * @param {number} [opts.gapFactor=4]  a gap longer than `gapFactor × median step` is compressed
 * @param {number} [opts.gapWeight=1]  weight of gap time relative to data time
 * @returns {{toTimeline:(x:number)=>number, toReal:(t:number)=>number, domain:[number,number], timelineDomain:[number,number], segments:Array, compressed:boolean}}
 */
export function compressWindow(xs, { gapFactor = 4, gapWeight = 1 } = {}) {
	const n = xs.length;
	if (n < 3)
		return identity(xs);

	const steps = [];
	for (let i = 1; i < n; i++) {
		const d = xs[i] - xs[i - 1];
		if (d > 0) steps.push(d);
	}

	if (steps.length === 0)
		return identity(xs);

	steps.sort((a, b) => a - b);
	const median = steps[Math.floor(steps.length / 2)];
	const threshold = median * gapFactor;

	const segments = [];
	let acc = 0;
	let compressed = false;

	for (let i = 1; i < n; i++) {
		const d = xs[i] - xs[i - 1];
		const isGap = d > threshold;
		if (isGap) compressed = true;
		const w = isGap ? d * gapWeight : d;
		segments.push({ from: xs[i - 1], to: xs[i], t0: acc, t1: acc + w, weight: w });
		acc += w;
	}

	const realMin = xs[0];
	const realMax = xs[n - 1];
	const tlMax = acc;

	function toTimeline(x) {
		if (x <= realMin) return 0;
		if (x >= realMax) return tlMax;

		let lo = 0;
		let hi = segments.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (segments[mid].from <= x) lo = mid;
			else hi = mid - 1;
		}

		const s = segments[lo];
		const span = s.to - s.from;
		const f = span > 0 ? (x - s.from) / span : 0;
		return s.t0 + f * s.weight;
	}

	function toReal(t) {
		if (t <= 0) return realMin;
		if (t >= tlMax) return realMax;

		let lo = 0;
		let hi = segments.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (segments[mid].t0 <= t) lo = mid;
			else hi = mid - 1;
		}

		const s = segments[lo];
		const w = s.weight;
		const f = w > 0 ? (t - s.t0) / w : 0;
		return s.from + f * (s.to - s.from);
	}

	return {
		toTimeline,
		toReal,
		domain: [realMin, realMax],
		timelineDomain: [0, tlMax],
		segments,
		compressed,
		medianStep: median,
		gaps: segments.filter(s => s.to - s.from > threshold).length,
	};
}

function identity(xs) {
	const min = xs.length ? xs[0] : 0;
	const max = xs.length ? xs[xs.length - 1] : 1;

	return {
		toTimeline: x => x - min,
		toReal: t => min + t,
		domain: [min, max],
		timelineDomain: [0, Math.max(1e-9, max - min)],
		segments: [],
		compressed: false,
		medianStep: 0,
		gaps: 0,
	};
}
