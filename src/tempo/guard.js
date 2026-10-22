/**
 * guard.js — data hygiene for aligned time-series.
 *
 * uPlot's data contract is `AlignedData = [xs, ys1, ys2, ...]` where every
 * array is the same length and index `i` refers to the same timestamp. Real
 * feeds violate this constantly: gaps arrive as `null`, bad sensors emit
 * `NaN`/`Infinity`, JSON round-trips turn numbers into strings, and streaming
 * sources arrive out of order or with duplicate timestamps.
 *
 * `sanitize()` normalises all of that into a contract-compliant payload and
 * reports exactly what it changed, so the UI can be honest about it instead of
 * silently drawing a wrong line.
 *
 * Design notes:
 *  - Rows are never invented. A cell that cannot be a finite number becomes
 *    `null` (uPlot's gap marker), never `0` — drawing 0 for a missing sample
 *    is a lie that a reader cannot detect.
 *  - Ordering is repaired by a stable sort, and `rowMap` preserves the link
 *    back to the original row so tooltips can cite the source row.
 *  - Duplicate timestamps collapse to one row, preferring a row that carries
 *    data over one that is entirely null.
 *  - The whole function is pure: no DOM, no clock, no globals. That is what
 *    makes it testable without a browser.
 */

/** Stable machine-readable issue codes. Order is not significant. */
export const ISSUE = {
	EMPTY: 'empty',
	SINGLE_POINT: 'single-point',
	UNSORTED_X: 'unsorted-x',
	DUPLICATE_X: 'duplicate-x',
	NON_FINITE_X: 'non-finite-x',
	NON_FINITE_Y: 'non-finite-y',
	NON_NUMERIC_Y: 'non-numeric-y',
	RAGGED: 'ragged',
	FLAT_Y: 'flat-y',
	ALL_NULL_Y: 'all-null-y',
	MISSING_Y: 'missing-y',
};

const num = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Coerce a cell to a finite number, or null when it is not representable.
 * Strings are accepted only when they are unambiguously numeric ("12.5"),
 * not when they are hex, dates, or partially numeric ("12px").
 */
export function toFiniteNumber(v) {
	if (typeof v === 'number')
		return Number.isFinite(v) ? v : null;

	if (typeof v === 'string') {
		const s = v.trim();
		if (s !== '' && num.test(s)) {
			const n = Number(s);
			return Number.isFinite(n) ? n : null;
		}
	}

	return null;
}

/** True when the value is present (not null/undefined) but not a finite number. */
function isPresentButInvalid(v) {
	return v != null && toFiniteNumber(v) == null;
}

function bump(map, code, n = 1) {
	map.set(code, (map.get(code) ?? 0) + n);
}

/**
 * Repair an aligned dataset.
 *
 * @param {Array<Array>} data           raw `[xs, ...ys]` (length >= 1)
 * @param {object} [opts]
 * @param {boolean} [opts.sort=true]            repair non-monotonic x
 * @param {'first'|'last'|'null'} [opts.dedupe='first'] duplicate-x policy
 * @param {boolean} [opts.coerceStrings=true]   accept numeric strings
 * @param {number} [opts.maxRows=0]             0 = no cap; intentional truncation is reported
 * @returns {{data: Array<Array>, issues: Array<{code: string, count: number}>, stats: object, rowMap: number[]}}
 */
export function sanitize(data, opts = {}) {
	const {
		sort = true,
		dedupe = 'first',
		coerceStrings = true,
		maxRows = 0,
	} = opts;

	const started = nowMs();
	const issues = new Map();

	if (data == null || !Array.isArray(data) || data.length === 0) {
		bump(issues, ISSUE.EMPTY);
		return finish([[]], issues, { inputRows: 0, outputRows: 0, xsDropped: 0, cellsNulled: 0, cellsCoerced: 0, sorted: false, rowsTruncated: 0 }, [], started);
	}

	// Anything past the first array that is not an array cannot be a series.
	const rawXs = Array.isArray(data[0]) ? data[0] : [];
	const rawYs = [];
	for (let s = 1; s < data.length; s++) {
		if (Array.isArray(data[s]))
			rawYs.push(data[s]);
		else
			bump(issues, ISSUE.MISSING_Y);
	}

	if (rawYs.length === 0)
		bump(issues, ISSUE.MISSING_Y);

	const n = rawXs.length;

	if (n === 0) {
		bump(issues, ISSUE.EMPTY);
		const empty = rawYs.map(() => []);
		return finish([[], ...empty], issues, { inputRows: 0, outputRows: 0, xsDropped: 0, cellsNulled: 0, cellsCoerced: 0, sorted: false, rowsTruncated: 0 }, [], started);
	}

	// Ragged detection: a shorter y array is padded with null (a gap), a longer
	// one is truncated. Both are reported; neither is allowed to shift indices.
	for (const ys of rawYs) {
		if (ys.length !== n)
			bump(issues, ISSUE.RAGGED);
	}

	// ---- column extraction -------------------------------------------------
	const xs = new Array(n);
	const ys = rawYs.map(() => new Array(n));
	let cellsNulled = 0;
	let cellsCoerced = 0;
	let xsDropped = 0;

	for (let i = 0; i < n; i++) {
		const rawX = rawXs[i];
		const x = toFiniteNumber(rawX);
		if (x == null) {
			xsDropped++;
			if (isPresentButInvalid(rawX))
				bump(issues, ISSUE.NON_FINITE_X);
			else
				bump(issues, ISSUE.NON_FINITE_X);
			xs[i] = null;
		}
		else {
			xs[i] = x;
		}

		for (let s = 0; s < rawYs.length; s++) {
			const rawY = rawYs[s][i];
			const y = rawY == null ? null : (coerceStrings ? toFiniteNumber(rawY) : (typeof rawY === 'number' && Number.isFinite(rawY) ? rawY : null));
			if (y === rawY && typeof y === 'number') {
				ys[s][i] = y;
			}
			else if (y == null) {
				ys[s][i] = null;
				cellsNulled++;
				// Anything present that we could not accept is reported, whether it
				// was rejected by the coercion policy or is genuinely non-numeric.
				if (rawY != null)
					bump(issues, typeof rawY === 'number' ? ISSUE.NON_FINITE_Y : ISSUE.NON_NUMERIC_Y);
			}
			else {
				ys[s][i] = y;
				cellsCoerced++;
				bump(issues, ISSUE.NON_NUMERIC_Y);
			}
		}
	}

	// ---- ordering ----------------------------------------------------------
	let order = null;
	let sorted = false;

	const usable = xs.filter(x => x != null).length;

	if (sort && usable > 1) {
		for (let i = 1; i < n; i++) {
			const a = xs[i - 1];
			const b = xs[i];
			if (a != null && b != null && b < a) {
				bump(issues, ISSUE.UNSORTED_X);
				order = buildStableOrder(xs);
				sorted = true;
				break;
			}
		}
	}

	// ---- assembly (with optional reordering and duplicate collapsing) ------
	const outX = [];
	const outYs = rawYs.map(() => []);
	const rowMap = [];
	let duplicateX = 0;

	const totalRows = order ? n : n;

	for (let k = 0; k < totalRows; k++) {
		const i = order ? order[k] : k;
		const x = xs[i];

		// A row with an unusable x cannot be placed on a time axis at all.
		if (x == null)
			continue;

		const prevIdx = outX.length - 1;
		if (prevIdx >= 0 && outX[prevIdx] === x) {
			duplicateX++;
			const policy = dedupe;
			if (policy === 'null') {
				for (let s = 0; s < rawYs.length; s++)
					outYs[s][prevIdx] = null;
				continue;
			}
			if (policy === 'first') {
				// Keep the incumbent unless it is entirely empty and this row has data.
				if (rowHasData(outYs, prevIdx))
					continue;
			}
			// 'last', or 'first' discarding a fully-empty incumbent: overwrite in place.
			for (let s = 0; s < rawYs.length; s++)
				outYs[s][prevIdx] = ys[s][i];
			rowMap[prevIdx] = i;
			continue;
		}

		outX.push(x);
		for (let s = 0; s < rawYs.length; s++)
			outYs[s].push(ys[s][i]);
		rowMap.push(i);
	}

	if (duplicateX > 0)
		bump(issues, ISSUE.DUPLICATE_X, duplicateX);

	// ---- post-conditions ---------------------------------------------------
	let rowsTruncated = 0;
	let finalX = outX;
	let finalYs = outYs;
	let finalMap = rowMap;

	if (maxRows > 0 && outX.length > maxRows) {
		rowsTruncated = outX.length - maxRows;
		finalX = outX.slice(0, maxRows);
		finalYs = outYs.map(a => a.slice(0, maxRows));
		finalMap = rowMap.slice(0, maxRows);
	}

	const outRows = finalX.length;

	if (outRows === 0)
		bump(issues, ISSUE.EMPTY);
	else if (outRows === 1)
		bump(issues, ISSUE.SINGLE_POINT);

	for (let s = 0; s < finalYs.length; s++) {
		const col = finalYs[s];
		let first = null;
		let flat = true;
		let present = 0;

		for (let i = 0; i < col.length; i++) {
			const v = col[i];
			if (v == null)
				continue;
			present++;
			if (first == null) {
				first = v;
			}
			else if (v !== first) {
				flat = false;
				break;
			}
		}

		if (present === 0)
			bump(issues, ISSUE.ALL_NULL_Y);
		else if (flat && present > 1)
			bump(issues, ISSUE.FLAT_Y);
	}

	const stats = {
		inputRows: n,
		outputRows: outRows,
		xsDropped,
		cellsNulled,
		cellsCoerced,
		sorted,
		rowsTruncated,
		xMin: outRows > 0 ? finalX[0] : null,
		xMax: outRows > 0 ? finalX[outRows - 1] : null,
	};

	return finish([finalX, ...finalYs], issues, stats, finalMap, started);
}

function rowHasData(outYs, idx) {
	for (const col of outYs) {
		if (col[idx] != null)
			return true;
	}
	return false;
}

/**
 * Sort indices by x ascending, pushing null-x rows to the end and keeping
 * equal keys in their original relative order (spec-compliant stable sort).
 */
export function buildStableOrder(xs) {
	const idx = new Array(xs.length);
	for (let i = 0; i < xs.length; i++)
		idx[i] = i;

	idx.sort((a, b) => {
		const xa = xs[a];
		const xb = xs[b];
		if (xa == null && xb == null) return a - b;
		if (xa == null) return 1;
		if (xb == null) return -1;
		if (xa < xb) return -1;
		if (xa > xb) return 1;
		return a - b;
	});

	return idx;
}

function finish(data, issueMap, stats, rowMap, started) {
	const issues = [...issueMap.entries()]
		.map(([code, count]) => ({ code, count }));

	stats.durationMs = nowMs() - started;
	stats.issueCount = issues.reduce((a, b) => a + b.count, 0);

	return { data, issues, stats, rowMap };
}

function nowMs() {
	return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

/** Convenience predicate used by the demo layer to decide on an empty-state. */
export function isEmptyResult(result) {
	return result.data[0].length === 0;
}
