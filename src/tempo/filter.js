/**
 * filter.js — non-destructive filtering for aligned data.
 *
 * Conditions are structured objects, never strings, so filtering cannot become
 * an `eval` surface in a page that displays user-supplied thresholds. A
 * condition targets either the x axis or a series index and evaluates to a
 * row-level boolean; a row survives only if every active condition passes.
 *
 * `applyFilter` never mutates its input: the caller keeps the pristine dataset
 * and can always show "N of M rows match" without a second pass.
 */

export const OP = {
	GT: '>',
	GTE: '>=',
	LT: '<',
	LTE: '<=',
	EQ: '==',
	NE: '!=',
	BETWEEN: 'between',
	NOT_NULL: 'not-null',
	IS_NULL: 'is-null',
	CONTAINS: 'contains',
};

const NUMERIC_OPS = new Set([OP.GT, OP.GTE, OP.LT, OP.LTE, OP.EQ, OP.NE, OP.BETWEEN]);

/**
 * Compile a structured condition into a row predicate.
 *
 * @param {{axis?: 'x'|'y', series?: number, op: string, value?: number, value2?: number, text?: string}} cond
 *   `series` is the index within the y series list (0 = first data series).
 * @returns {(xs: ArrayLike, ys: Array<ArrayLike>, i: number) => boolean}
 */
export function compileCondition(cond) {
	if (!cond || typeof cond !== 'object')
		throw new TypeError('Condition must be an object');

	const { axis = 'y', series = 0, op } = cond;

	if (!Object.values(OP).includes(op))
		throw new RangeError(`Unknown operator "${op}"`);

	if (axis === 'x') {
		if (!NUMERIC_OPS.has(op) && op !== OP.NOT_NULL && op !== OP.IS_NULL)
			throw new RangeError(`Operator "${op}" is not valid on the x axis`);
	}
	else if (!Number.isInteger(series) || series < 0) {
		throw new RangeError('Conditional filters on y require a non-negative integer `series`');
	}

	const value = typeof cond.value === 'string' ? Number(cond.value) : cond.value;
	const value2 = typeof cond.value2 === 'string' ? Number(cond.value2) : cond.value2;

	if (NUMERIC_OPS.has(op)) {
		if (!Number.isFinite(value))
			throw new RangeError(`Operator "${op}" requires a finite \`value\``);
		if (op === OP.BETWEEN && !Number.isFinite(value2))
			throw new RangeError('`between` requires a finite `value2`');
	}

	const read = axis === 'x'
		? (xs, ys, i) => xs[i]
		: (xs, ys, i) => ys[series]?.[i];

	switch (op) {
		case OP.GT: return (xs, ys, i) => read(xs, ys, i) > value;
		case OP.GTE: return (xs, ys, i) => read(xs, ys, i) >= value;
		case OP.LT: return (xs, ys, i) => read(xs, ys, i) < value;
		case OP.LTE: return (xs, ys, i) => read(xs, ys, i) <= value;
		case OP.EQ: return (xs, ys, i) => read(xs, ys, i) === value;
		case OP.NE: return (xs, ys, i) => read(xs, ys, i) !== value;
		case OP.BETWEEN: {
			const lo = Math.min(value, value2);
			const hi = Math.max(value, value2);
			return (xs, ys, i) => {
				const v = read(xs, ys, i);
				return v != null && v >= lo && v <= hi;
			};
		}
		case OP.NOT_NULL: return (xs, ys, i) => read(xs, ys, i) != null;
		case OP.IS_NULL: return (xs, ys, i) => read(xs, ys, i) == null;
		case OP.CONTAINS: {
			const needle = String(cond.text ?? '').toLowerCase();
			return (xs, ys, i) => String(read(xs, ys, i) ?? '').toLowerCase().includes(needle);
		}
		default:
			throw new RangeError(`Unhandled operator "${op}"`);
	}
}

/**
 * @param {Array} data aligned `[xs, ...ys]`
 * @param {object} [opts]
 * @param {[number, number]|null} [opts.range] inclusive x window
 * @param {Array} [opts.conditions] structured conditions (see compileCondition)
 * @param {number[]} [opts.visibleSeries] indices of y series to zero out (hidden)
 * @returns {{data: Array, kept: number, total: number, dropped: number, boundaries: {first: number|null, last: number|null}}}
 */
export function applyFilter(data, { range = null, conditions = [], visibleSeries = null } = {}) {
	const xs = data[0] ?? [];
	const ys = data.slice(1);
	const total = xs.length;

	const preds = conditions.map(compileCondition);

	const keep = new Uint8Array(total);
	let kept = 0;

	for (let i = 0; i < total; i++) {
		let ok = true;

		if (range) {
			const x = xs[i];
			if (x == null || x < range[0] || x > range[1])
				ok = false;
		}

		if (ok) {
			for (let p = 0; p < preds.length; p++) {
				if (!preds[p](xs, ys, i)) {
					ok = false;
					break;
				}
			}
		}

		if (ok) {
			keep[i] = 1;
			kept++;
		}
	}

	const outX = new Array(kept);
	const outYs = ys.map(() => new Array(kept));

	// `visibleSeries` is an allow-list: series not listed are rendered as gaps.
	const visible = visibleSeries ? new Set(visibleSeries) : null;

	let k = 0;
	let first = null;
	let last = null;

	for (let i = 0; i < total; i++) {
		if (!keep[i])
			continue;

		const x = xs[i];
		outX[k] = x;
		if (first == null) first = x;
		last = x;

		for (let s = 0; s < ys.length; s++) {
			outYs[s][k] = visible && !visible.has(s) ? null : ys[s][i];
		}

		k++;
	}

	return {
		data: [outX, ...outYs],
		kept,
		total,
		dropped: total - kept,
		boundaries: { first, last },
	};
}

/** Distinct finite values of the x axis, capped — used for drill targets. */
export function distinctX(xs, cap = 2000) {
	const seen = new Set();
	const out = [];

	for (let i = 0; i < xs.length && out.length < cap; i++) {
		const x = xs[i];
		if (x == null || seen.has(x))
			continue;
		seen.add(x);
		out.push(x);
	}

	return out;
}
