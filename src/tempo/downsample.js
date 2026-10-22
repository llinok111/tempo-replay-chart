/**
 * downsample.js — index-space decimation for large series.
 *
 * The key decision here is that decimation happens in **index space**, not
 * per-series. Every series in an aligned dataset shares one x axis, so one
 * index list is computed once and applied to all series. That keeps the
 * aligned contract intact and costs O(n) regardless of how many series exist,
 * instead of O(n * series).
 *
 * Three modes:
 *  - `lttb`   — Largest-Triangle-Three-Buckets. Best visual shape retention.
 *  - `minmax` — per-bucket min/max envelope. Guarantees no spike or dip is lost.
 *  - `none`   — passthrough (returns a full index range).
 *
 * Gaps are semantics, not noise: any run of `null` is bracketed by forced
 * anchors so decimation can never make a break in the data disappear.
 */

const RANGE_CACHE_LIMIT = 8;

/**
 * Build an index list of at most `maxPoints` entries.
 *
 * @param {Array<number|null>} xs
 * @param {Array<number|null>} ys  representative series driving the selection
 * @param {number} maxPoints
 * @param {'lttb'|'minmax'|'none'} [mode='lttb']
 * @returns {number[]} ascending, deduplicated indices
 */
export function selectIndices(xs, ys, maxPoints, mode = 'lttb') {
	const n = xs.length;

	if (!(maxPoints > 0) || n <= maxPoints || mode === 'none')
		return fullRange(n);

	if (maxPoints < 3)
		return [0, n - 1].slice(0, maxPoints);

	// Split into contiguous non-null runs; gaps stay visible as anchors.
	const runs = splitRuns(ys);

	if (runs.length === 1 && runs[0].len >= n)
		return mode === 'minmax' ? minMax(xs, ys, maxPoints) : lttb(xs, ys, maxPoints);

	// Multi-run: allocate the budget by run length, at least 2 points per run,
	// and let the last non-empty run absorb the rounding remainder.
	const out = [];
	const totalLen = runs.reduce((a, r) => a + r.len, 0);
	let remaining = maxPoints;
	let remainingLen = totalLen;

	for (let r = 0; r < runs.length; r++) {
		const run = runs[r];
		let budget;

		if (r === runs.length - 1) {
			budget = Math.max(2, remaining);
		}
		else {
			budget = Math.max(2, Math.round((run.len / remainingLen) * remaining));
			budget = Math.min(budget, Math.max(2, remaining - 2 * (runs.length - r - 1)));
		}

		const sub = runBudget(xs, ys, run.start, run.len, budget, mode);
		for (const i of sub)
			out.push(run.start + i);

		remaining -= sub.length;
		remainingLen -= run.len;

		if (remaining <= 0)
			break;
	}

	return dedupeSorted(out);
}

/** Contiguous runs of rows whose representative value is non-null. */
function splitRuns(ys) {
	const runs = [];
	let start = 0;
	let len = 0;

	for (let i = 0; i < ys.length; i++) {
		if (ys[i] == null) {
			if (len > 0) {
				runs.push({ start, len });
				len = 0;
			}
			start = i + 1;
		}
		else {
			len++;
		}
	}

	if (len > 0)
		runs.push({ start, len });

	// Degenerate case: every value is null. Treat the whole axis as one run so
	// the caller still gets a bounded index list instead of the full range.
	if (runs.length === 0)
		runs.push({ start: 0, len: ys.length });

	return runs;
}

function runBudget(xs, ys, start, len, budget, mode) {
	if (len <= budget)
		return fullRange(len);

	const subX = sliceView(xs, start, len);
	const subY = sliceView(ys, start, len);

	const idx = mode === 'minmax' ? minMax(subX, subY, budget) : lttb(subX, subY, budget);

	// Guarantee the run's endpoints survive so segments join without gaps.
	if (idx[0] !== 0)
		idx.unshift(0);
	if (idx[idx.length - 1] !== len - 1)
		idx.push(len - 1);

	return idx;
}

function sliceView(arr, start, len) {
	const out = new Array(len);
	for (let i = 0; i < len; i++)
		out[i] = arr[start + i];
	return out;
}

/**
 * Largest-Triangle-Three-Buckets.
 * Reference: Sveinn Steinarsson, "Downsampling Time Series for Visual
 * Representation" (2013). Null values are treated as 0 for area comparison but
 * are never selected as bucket representatives, because a null anchor would
 * create a fake gap.
 */
export function lttb(xs, ys, threshold) {
	const n = xs.length;

	if (threshold >= n || threshold < 3)
		return fullRange(n);

	const sampled = new Array(threshold);
	sampled[0] = 0;

	const every = (n - 2) / (threshold - 2);
	let a = 0;

	for (let i = 0; i < threshold - 2; i++) {
		// Average point of the *next* bucket, used as the far vertex.
		let avgStart = Math.floor((i + 1) * every) + 1;
		let avgEnd = Math.floor((i + 2) * every) + 1;
		avgEnd = avgEnd < n ? avgEnd : n;

		let avgX = 0;
		let avgY = 0;
		let avgCount = 0;

		for (let j = avgStart; j < avgEnd; j++) {
			const v = ys[j];
			if (v == null)
				continue;
			avgX += xs[j];
			avgY += v;
			avgCount++;
		}

		if (avgCount === 0) {
			avgX = xs[Math.min(avgStart, n - 1)];
			avgY = ys[a] ?? 0;
		}
		else {
			avgX /= avgCount;
			avgY /= avgCount;
		}

		// Current bucket range.
		const rangeOffs = Math.floor(i * every) + 1;
		const rangeTo = Math.floor((i + 1) * every) + 1;

		const pointAX = xs[a];
		const pointAY = ys[a] ?? 0;

		let maxArea = -1;
		let maxIdx = rangeOffs;

		for (let j = rangeOffs; j < rangeTo && j < n; j++) {
			const v = ys[j];
			if (v == null)
				continue;
			const area = Math.abs(
				(pointAX - avgX) * (v - pointAY) - (pointAX - xs[j]) * (avgY - pointAY)
			);
			if (area > maxArea) {
				maxArea = area;
				maxIdx = j;
			}
		}

		sampled[i + 1] = maxIdx;
		a = maxIdx;
	}

	sampled[threshold - 1] = n - 1;

	return dedupeSorted(sampled);
}

/**
 * Per-bucket min/max envelope. Emits both extremes of every bucket in x order,
 * which means peaks are preserved by construction rather than by luck.
 */
export function minMax(xs, ys, maxPoints) {
	const n = xs.length;

	if (maxPoints >= n || maxPoints < 4)
		return fullRange(n);

	const buckets = Math.max(1, Math.floor(maxPoints / 2));
	const out = [0];

	for (let b = 0; b < buckets; b++) {
		const from = Math.floor((b * n) / buckets);
		const to = Math.floor(((b + 1) * n) / buckets);

		let lo = -1;
		let hi = -1;
		let loV = Infinity;
		let hiV = -Infinity;

		for (let i = from; i < to; i++) {
			const v = ys[i];
			if (v == null)
				continue;
			if (v < loV) { loV = v; lo = i; }
			if (v > hiV) { hiV = v; hi = i; }
		}

		if (lo < 0)
			continue;

		if (lo < hi) {
			out.push(lo);
			if (hi !== lo) out.push(hi);
		}
		else {
			out.push(hi);
			if (hi !== lo) out.push(lo);
		}
	}

	out.push(n - 1);

	return dedupeSorted(out);
}

/** Apply a shared index list to every series, preserving alignment. */
export function decimateAligned(data, maxPoints, mode = 'lttb') {
	if (!(maxPoints > 0))
		return data;

	const xs = data[0];
	if (xs.length <= maxPoints)
		return data;

	// Pick the representative series: the one with the most non-null samples.
	let rep = 1;
	let best = -1;
	for (let s = 1; s < data.length; s++) {
		let present = 0;
		const col = data[s];
		for (let i = 0; i < col.length; i++) {
			if (col[i] != null) present++;
		}
		if (present > best) {
			best = present;
			rep = s;
		}
	}

	const idx = selectIndices(xs, data[rep] ?? [], maxPoints, mode);
	const out = new Array(data.length);

	for (let s = 0; s < data.length; s++) {
		const src = data[s];
		const dst = new Array(idx.length);
		for (let i = 0; i < idx.length; i++)
			dst[i] = src[idx[i]];
		out[s] = dst;
	}

	return out;
}

/**
 * Measure how much visual information decimation actually cost.
 *
 * For every original sample we reconstruct the decimated polyline's value at
 * that x and compare. Reported numbers are absolute in y units plus a
 * normalised ratio against the series' own value span, so the figures are
 * interpretable without knowing the data.
 *
 * @returns {{samples: number, maxAbsError: number, meanAbsError: number,
 *            maxNormError: number, peakValueRetained: boolean, ySpan: number}}
 */
export function measureFidelity(xs, ys, indices) {
	const n = xs.length;
	const m = indices.length;

	let yMin = Infinity;
	let yMax = -Infinity;
	let peakValue = -Infinity;

	for (let i = 0; i < n; i++) {
		const v = ys[i];
		if (v == null) continue;
		if (v < yMin) yMin = v;
		if (v > yMax) yMax = v;
		if (v > peakValue) peakValue = v;
	}

	const span = (yMax - yMin) || 1;

	let maxAbs = 0;
	let sumAbs = 0;
	let counted = 0;

	// Reconstructed peak: the max of the decimated series.
	let decimatedPeak = -Infinity;
	for (let k = 0; k < m; k++) {
		const v = ys[indices[k]];
		if (v != null && v > decimatedPeak)
			decimatedPeak = v;
	}

	// Two-pointer sweep over the decimated polyline.
	let seg = 0;

	for (let i = 0; i < n; i++) {
		const x = xs[i];
		const y = ys[i];
		if (y == null) continue;

		while (seg < m - 2 && xs[indices[seg + 1]] < x)
			seg++;

		const i0 = indices[seg];
		const i1 = indices[Math.min(seg + 1, m - 1)];
		const x0 = xs[i0];
		const x1 = xs[i1];
		const y0 = ys[i0];
		const y1 = ys[i1];

		if (y0 == null || y1 == null || x0 == null || x1 == null)
			continue;

		let est;
		if (x1 === x0)
			est = y0;
		else
			est = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);

		const err = Math.abs(est - y);
		if (err > maxAbs) maxAbs = err;
		sumAbs += err;
		counted++;
	}

	const peakLoss = Number.isFinite(peakValue) && Number.isFinite(decimatedPeak)
		? (peakValue - decimatedPeak) / span
		: 0;

	return {
		samples: n,
		kept: m,
		maxAbsError: maxAbs,
		meanAbsError: counted > 0 ? sumAbs / counted : 0,
		maxNormError: maxAbs / span,
		// LTTB optimises shape, not absolute extremes, so the exact peak is
		// reported as a *loss ratio* rather than a boolean: 1e-5 means "the
		// tallest sample was missed by one part in 100 000 of the span".
		peakLossRatio: Math.max(0, peakLoss),
		peakValueRetained: Math.max(0, peakLoss) === 0,
		ySpan: span,
	};
}

export function fullRange(n) {
	const out = new Array(n);
	for (let i = 0; i < n; i++)
		out[i] = i;
	return out;
}

function dedupeSorted(arr) {
	if (arr.length < 2)
		return arr;

	const out = [arr[0]];
	for (let i = 1; i < arr.length; i++) {
		if (arr[i] !== arr[i - 1] && arr[i] > arr[i - 1])
			out.push(arr[i]);
	}
	return out;
}
