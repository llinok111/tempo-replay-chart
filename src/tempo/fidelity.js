/**
 * fidelity.js — how much does decimation actually cost, in pixels?
 *
 * `measureFidelity` in downsample.js scores the reconstruction at every
 * original x. That is the right number for "how much information was dropped",
 * but it is the wrong number for "can a reader tell the difference": at
 * 1 002 px wide, 417 samples share one column, and no reader can see 417
 * separate values.
 *
 * `pixelFidelity` answers the visual question. It builds the per-column
 * envelope of (a) the raw series and (b) the decimated polyline — following the
 * drawn segments across column boundaries, not just the retained vertices — and
 * reports the vertical disagreement in CSS pixels.
 *
 * Pure: no canvas, no DOM. The benchmark page and the Node sweep share it so
 * both report the same units.
 */

/**
 * @param {ArrayLike<number>} xs          ascending
 * @param {ArrayLike<number|null>} ys     null = gap
 * @param {number[]} indices              retained indices, ascending
 * @param {number} width                  plot width in CSS px
 * @param {number} height                 plot height in CSS px
 */
export function pixelFidelity(xs, ys, indices, width, height) {
	const n = xs.length;
	if (!n || !indices.length)
		return null;

	let yMin = Infinity;
	let yMax = -Infinity;

	for (let i = 0; i < n; i++) {
		const v = ys[i];
		if (v == null) continue;
		if (v < yMin) yMin = v;
		if (v > yMax) yMax = v;
	}

	if (!Number.isFinite(yMin) || !Number.isFinite(yMax))
		return null;

	const span = (yMax - yMin) || 1;
	const x0 = xs[0];
	const xSpan = (xs[n - 1] - x0) || 1;
	const dx = xSpan / width;
	const colOf = x => Math.min(width - 1, Math.max(0, Math.floor((x - x0) / dx)));

	const rawMin = new Float64Array(width).fill(Infinity);
	const rawMax = new Float64Array(width).fill(-Infinity);

	for (let i = 0; i < n; i++) {
		const v = ys[i];
		if (v == null) continue;
		const c = colOf(xs[i]);
		if (v < rawMin[c]) rawMin[c] = v;
		if (v > rawMax[c]) rawMax[c] = v;
	}

	const decMin = new Float64Array(width).fill(Infinity);
	const decMax = new Float64Array(width).fill(-Infinity);

	for (let k = 0; k < indices.length - 1; k++) {
		const ia = indices[k];
		const ib = indices[k + 1];
		const xa = xs[ia];
		const xb = xs[ib];
		const ya = ys[ia];
		const yb = ys[ib];

		if (ya == null || yb == null || !(xb > xa)) continue;

		const cFrom = colOf(xa);
		const cTo = colOf(xb);
		const slope = (yb - ya) / (xb - xa);

		for (let c = cFrom; c <= cTo; c++) {
			const lo = Math.max(xa, x0 + c * dx);
			const hi = Math.min(xb, x0 + (c + 1) * dx);
			if (hi < lo) continue;

			const yl = ya + slope * (lo - xa);
			const yh = ya + slope * (hi - xa);
			const loV = yl < yh ? yl : yh;
			const hiV = yl < yh ? yh : yl;

			if (loV < decMin[c]) decMin[c] = loV;
			if (hiV > decMax[c]) decMax[c] = hiV;
		}
	}

	let maxDiffPx = 0;
	let worstCol = -1;
	let sumDiffPx = 0;
	let columns = 0;

	for (let c = 0; c < width; c++) {
		if (rawMin[c] === Infinity || decMin[c] === Infinity) continue;

		const dLo = Math.abs(rawMin[c] - decMin[c]);
		const dHi = Math.abs(rawMax[c] - decMax[c]);
		const d = (dLo > dHi ? dLo : dHi) / span * height;

		sumDiffPx += d;
		columns++;

		if (d > maxDiffPx) {
			maxDiffPx = d;
			worstCol = c;
		}
	}

	return {
		width,
		height,
		maxDiffPx: +maxDiffPx.toFixed(2),
		meanDiffPx: columns ? +(sumDiffPx / columns).toFixed(2) : null,
		worstCol,
		columnsCompared: columns,
	};
}

/**
 * Smallest budget at which the worst column stays under `thresholdPx`.
 * Returns null when even the largest candidate misses the threshold, which is
 * itself a useful answer: the data has detail the screen cannot hold.
 */
export function budgetForPixelTolerance(xs, ys, selectFn, { thresholdPx = 1, width = 1002, height = 360, candidates = [1200, 2400, 4800, 9600, 19200, 38400, 76800] } = {}) {
	for (const budget of candidates) {
		const idx = selectFn(xs, ys, budget);
		const px = pixelFidelity(xs, ys, idx, width, height);
		if (px && px.maxDiffPx <= thresholdPx)
			return { budget, ...px };
	}
	return null;
}
