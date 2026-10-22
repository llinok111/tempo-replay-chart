/**
 * tween.js — interruptible value transitions on aligned data.
 *
 * Three rules drive the design:
 *
 * 1. **Never invent a number.** If either endpoint of a cell is `null`, the
 *    interpolated cell takes the target value rather than a midpoint. A
 *    midpoint between "no reading" and "42" would draw a value the sensor
 *    never produced.
 *
 * 2. **Never interpolate across different lengths.** Two series of different
 *    lengths are different samplings, not a continuous morph. Tempo drops to
 *    an axes-only transition and swaps the data at the midpoint, which is
 *    honest about what happened.
 *
 * 3. **Zero allocation per frame.** The output buffer is reused and written in
 *    place, so a 60 fps transition at 4 000 points does not hand the GC
 *    240 000 array cells per second.
 *
 * Interruption: calling `start()` while a transition is in flight samples the
 * current visual state and uses it as the new origin, so a rapid sequence of
 * data updates produces continuous motion instead of snapping back.
 */

import { resolveEasing } from './easing.js';

export function lerp(a, b, t) {
	return a + (b - a) * t;
}

/**
 * Write `from`→`to` interpolation at progress `t` into `out`, in place.
 * `out` must already have the same shape as `to`.
 */
export function interpolateInto(out, from, to, t) {
	const sameShape = from != null && from.length === to.length && from[0]?.length === to[0]?.length;

	if (!sameShape) {
		for (let s = 0; s < to.length; s++) {
			const dst = out[s];
			const src = to[s];
			for (let i = 0; i < src.length; i++)
				dst[i] = src[i];
		}
		return out;
	}

	// x is interpolated only when both endpoints are present; otherwise the
	// target value wins so the time axis never drifts off the real samples.
	const n = to[0].length;

	for (let s = 0; s < to.length; s++) {
		const dst = out[s];
		const a = from[s];
		const b = to[s];

		if (s === 0) {
			for (let i = 0; i < n; i++) {
				const va = a[i];
				const vb = b[i];
				dst[i] = va == null || vb == null ? vb : lerp(va, vb, t);
			}
		}
		else {
			for (let i = 0; i < n; i++) {
				const va = a[i];
				const vb = b[i];
				// A gap on either side is carried as the target, never blended.
				dst[i] = va == null || vb == null ? vb : (va === vb ? vb : lerp(va, vb, t));
			}
		}
	}

	return out;
}

/** Interpolate a `[min, max]` range. Non-finite endpoints defer to `to`. */
export function interpolateRange(from, to, t) {
	if (!from || !to)
		return to;

	const [a0, a1] = from;
	const [b0, b1] = to;

	const lo = Number.isFinite(a0) && Number.isFinite(b0) ? lerp(a0, b0, t) : b0;
	const hi = Number.isFinite(a1) && Number.isFinite(b1) ? lerp(a1, b1, t) : b1;

	return [lo, hi];
}

/** Deep-ish clone of an aligned dataset (arrays only, cells are primitives). */
export function cloneData(data) {
	const out = new Array(data.length);
	for (let s = 0; s < data.length; s++)
		out[s] = Array.prototype.slice.call(data[s]);
	return out;
}

/**
 * A single interruptible transition.
 *
 * @param {object} opts
 * @param {number} [opts.maxTweenPoints=4000] above this, data is swapped instead of tweened
 */
export class Transition {
	constructor({ maxTweenPoints = 4000 } = {}) {
		this.maxTweenPoints = maxTweenPoints;
		this.active = false;
		this.mode = 'idle';
		this.progress = 0;
		this.frames = 0;
		this.totalFrameMs = 0;
		this.maxFrameMs = 0;

		this._from = null;
		this._to = null;
		this._out = null;
		this._seeded = false;
		this._fromRange = null;
		this._toRange = null;
		this._rangeOut = null;
		this._ease = resolveEasing('cubicInOut');
		this._duration = 0;
		this._elapsed = 0;
		this._onFrame = null;
		this._onDone = null;
		this._swapped = false;
	}

	/**
	 * Prime the transition with the payload that is currently on screen, so the
	 * next `start()` animates *from* real content instead of snapping from
	 * nothing. Charts call this on every non-animated render.
	 */
	seed(data, range = null) {
		if (data == null) {
			this._out = null;
			this._seeded = false;
			return this;
		}

		this._prepare(data, null);

		for (let s = 0; s < data.length && s < this._out.length; s++) {
			const dst = this._out[s];
			const src = data[s];
			for (let i = 0; i < src.length; i++)
				dst[i] = src[i];
		}

		this._to = null;
		this._from = null;
		this._rangeOut = range ? range.slice() : null;
		this._seeded = true;

		return this;
	}

	/**
	 * Begin (or re-target) a transition.
	 * @returns {{mode: string, length: number}}
	 */
	start({ data, range, duration = 320, easing = 'cubicInOut', onFrame, onDone }) {
		const from = this.active
			? this.snapshot()
			: (this._seeded && this._out ? { data: cloneData(this._out), range: this._rangeOut ? this._rangeOut.slice() : null } : null);

		this._ease = resolveEasing(easing);
		this._duration = Math.max(0, duration);
		this._elapsed = 0;
		this._onFrame = onFrame;
		this._onDone = onDone;
		this._swapped = false;

		const target = this._prepare(data, from);

		this._from = from?.data ?? null;
		this._to = target;
		this._fromRange = from?.range ?? null;
		this._toRange = range ?? null;

		this.active = true;
		this.progress = 0;

		const pointCount = target[0].length;
		const sameLength = this._from != null && this._from[0]?.length === pointCount;
		this.mode = this._duration === 0
			? 'instant'
			: (sameLength && pointCount <= this.maxTweenPoints ? 'values' : 'axes-only');

		if (this.mode === 'instant') {
			this.progress = 1;
			this._emit();
			this.active = false;
			this._done();
			return { mode: this.mode, length: pointCount };
		}

		// Axes-only transitions swap data at the halfway point: the eye reads the
		// viewport moving, and the data change happens while motion masks it.
		if (this.mode === 'axes-only') {
			this._emit();
		}

		return { mode: this.mode, length: pointCount };
	}

	/** Current visual state, usable as the origin of the next transition. */
	snapshot() {
		if (!this.active)
			return null;

		const data = cloneData(this._out ?? this._to);
		const range = this._rangeOut ? this._rangeOut.slice() : null;

		return { data, range };
	}

	/** Advance by `dt` milliseconds. Returns true while still animating. */
	tick(dt) {
		if (!this.active)
			return false;

		const started = perfNow();

		this._elapsed += dt;
		const raw = this._duration === 0 ? 1 : Math.min(1, this._elapsed / this._duration);
		this.progress = raw;

		if (this.mode === 'axes-only' && !this._swapped && raw >= 0.5) {
			this._swapped = true;
		}

		this._emit();
		this.frames++;
		const spent = perfNow() - started;
		this.totalFrameMs += spent;
		if (spent > this.maxFrameMs)
			this.maxFrameMs = spent;

		if (raw >= 1) {
			this.active = false;
			this.progress = 1;
			this._done();
			return false;
		}

		return true;
	}

	/** Jump straight to the target state and stop. */
	finish() {
		if (!this.active)
			return;

		this.progress = 1;
		this._emit();
		this.active = false;
		this._done();
	}

	cancel() {
		this.active = false;
		this.mode = 'idle';
	}

	/** Interpolated data buffer (identity with what was handed to onFrame). */
	get output() {
		return this._out;
	}

	get range() {
		return this._rangeOut;
	}

	get stats() {
		return {
			mode: this.mode,
			frames: this.frames,
			meanFrameMs: this.frames > 0 ? this.totalFrameMs / this.frames : 0,
			maxFrameMs: this.maxFrameMs,
		};
	}

	// ---- internals ---------------------------------------------------------

	_prepare(data, from) {
		const rows = data[0].length;
		const cols = data.length;

		// Rebuild the output buffer only when the shape changed.
		if (this._out == null || this._out.length !== cols || this._out[0].length !== rows) {
			this._out = new Array(cols);
			for (let s = 0; s < cols; s++)
				this._out[s] = new Array(rows);
		}

		return data;
	}

	_emit() {
		const t = this._ease(this.progress);

		if (this.mode === 'axes-only') {
			const useTarget = this._swapped || this._from == null;
			const src = useTarget ? this._to : this._from;
			for (let s = 0; s < src.length && s < this._out.length; s++) {
				const dst = this._out[s];
				const arr = src[s];
				const len = Math.min(dst.length, arr.length);
				for (let i = 0; i < len; i++)
					dst[i] = arr[i];
			}
			this._rangeOut = interpolateRange(this._fromRange, this._toRange, t);
		}
		else {
			interpolateInto(this._out, this._from, this._to, t);
			this._rangeOut = interpolateRange(this._fromRange, this._toRange, t);
		}

		this._onFrame?.(this._out, this._rangeOut, this.progress);
	}

	_done() {
		const cb = this._onDone;
		this._onDone = null;
		cb?.(this);
	}
}

function perfNow() {
	return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}
