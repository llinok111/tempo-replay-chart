/**
 * drill.js — hierarchical drill-down over an x axis.
 *
 * Drilling is modelled as a stack of viewport snapshots rather than as a graph
 * of charts. Each level records the range it was entered with, so "back"
 * restores the exact previous viewport (including zoom and pan) instead of
 * recomputing something that approximately resembles it.
 *
 * The stack is also the breadcrumb source: `path` returns one label per level,
 * root first, which is what a UI needs to render `All › 2026-10 › 2026-10-14`.
 */

export class DrillStack {
	constructor({ rootLabel = 'All', maxDepth = 8 } = {}) {
		this.rootLabel = rootLabel;
		this.maxDepth = maxDepth;
		this._levels = [];
	}

	/** Enter a child viewport. Returns the new depth. */
	push({ range, label, meta = null }) {
		if (!Array.isArray(range) || range.length !== 2)
			throw new TypeError('drill.push requires a [min, max] range');

		const [lo, hi] = range;
		if (!(hi > lo))
			throw new RangeError(`drill.push requires min < max, got [${lo}, ${hi}]`);

		if (this._levels.length >= this.maxDepth)
			throw new RangeError(`drill depth limit (${this.maxDepth}) reached`);

		this._levels.push({
			range: [lo, hi],
			label: label ?? String(this._levels.length + 1),
			meta,
		});

		return this._levels.length;
	}

	/** Leave the current level. Returns the level that is now active, or null. */
	pop() {
		this._levels.pop();
		return this.current;
	}

	/** Return to the root. */
	reset() {
		this._levels.length = 0;
		return this;
	}

	get depth() {
		return this._levels.length;
	}

	get empty() {
		return this._levels.length === 0;
	}

	get current() {
		return this._levels.length > 0 ? this._levels[this._levels.length - 1] : null;
	}

	/** Active x range, or null when at the root. */
	get range() {
		return this.current?.range ?? null;
	}

	/** Breadcrumb labels, root first. */
	get path() {
		return [this.rootLabel, ...this._levels.map(l => l.label)];
	}

	/** Full stack snapshot (read-only usage). */
	get levels() {
		return this._levels.slice();
	}
}

/**
 * Given a raw x selection and the full domain, snap the selection outward to
 * the nearest sample boundaries so a drilled view never starts mid-segment.
 * This keeps the child view's edge values exact.
 */
export function snapRange(xs, [lo, hi]) {
	if (xs.length === 0)
		return [lo, hi];

	let a = lo;
	let b = hi;

	for (let i = 0; i < xs.length; i++) {
		const x = xs[i];
		if (x == null) continue;
		if (x <= lo) a = x;
		else break;
	}

	for (let i = xs.length - 1; i >= 0; i--) {
		const x = xs[i];
		if (x == null) continue;
		if (x >= hi) b = x;
		else break;
	}

	if (!(b > a))
		return [lo, hi];

	return [a, b];
}

/**
 * Suggest child ranges by calendar unit. Returns non-empty buckets only, so a
 * UI never offers a drill target with no data behind it.
 */
export function bucketRanges(xs, unit = 'day') {
	const buckets = new Map();

	for (let i = 0; i < xs.length; i++) {
		const x = xs[i];
		if (x == null) continue;
		const key = bucketKey(x, unit);
		const b = buckets.get(key);
		if (b == null)
			buckets.set(key, { key, lo: x, hi: x, count: 1 });
		else {
			b.lo = Math.min(b.lo, x);
			b.hi = Math.max(b.hi, x);
			b.count++;
		}
	}

	return [...buckets.values()].sort((a, b) => a.lo - b.lo);
}

function pad(n) {
	return String(n).padStart(2, '0');
}

function bucketKey(x, unit) {
	const d = new Date(x);
	const y = d.getFullYear();
	const m = pad(d.getMonth() + 1);
	const day = pad(d.getDate());

	if (unit === 'hour') return `${y}-${m}-${day} ${pad(d.getHours())}:00`;
	if (unit === 'month') return `${y}-${m}`;
	if (unit === 'year') return String(y);
	return `${y}-${m}-${day}`;
}
