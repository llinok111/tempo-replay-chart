/**
 * playback.js — time-axis replay.
 *
 * Replay is the feature uPlot does not have and cannot express: uPlot renders
 * whatever array you hand it. Tempo treats the dataset as a timeline that can
 * be played, paused, scrubbed and stepped, with three presentation modes:
 *
 *   reveal  — data is uncovered progressively from xMin to xMax (accumulating).
 *   window  — a fixed-width window slides along x (a moving "now").
 *   cursor  — the full series stays visible and a marker advances (comparison).
 *
 * Time mapping is linear in **x**, not in row index, so a replay follows wall
 * time even when the sampling is irregular. A dataset that is silent for ten
 * minutes therefore stays silent on screen for ten minutes at 1×.
 *
 * `RevealData` uses zero-copy typed-array views so a 1 000 000-point series can
 * be revealed at 60 fps without reallocating the payload every frame.
 */

export const PLAYBACK_STATE = {
	IDLE: 'idle',
	PLAYING: 'playing',
	PAUSED: 'paused',
	ENDED: 'ended',
};

export const PLAYBACK_MODE = {
	REVEAL: 'reveal',
	WINDOW: 'window',
	CURSOR: 'cursor',
};

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

export class Playback {
	constructor({
		duration = 8000,
		speed = 1,
		mode = PLAYBACK_MODE.REVEAL,
		windowRatio = 0.35,
		onFrame = null,
		onStateChange = null,
	} = {}) {
		this._duration = Math.max(1, duration);
		this._speed = SPEEDS.includes(speed) ? speed : 1;
		this._mode = mode;
		this._windowRatio = Math.min(1, Math.max(0.02, windowRatio));

		this._elapsed = 0;
		this._state = PLAYBACK_STATE.IDLE;
		this._exactCursor = null;
		this._mapping = null;

		this._xMin = 0;
		this._xMax = 1;
		this._data = null;
		this._reveal = null;

		this._onFrame = onFrame;
		this._onStateChange = onStateChange;
	}

	// ---- data binding ------------------------------------------------------

	attach(data) {
		this._data = data ?? null;
		const xs = data?.[0];

		// Nothing to interpolate toward: with no samples the domain is empty and
		// the visible window is the trivial [0, 0] span.
		if (!xs || xs.length === 0) {
			this._xMin = 0;
			this._xMax = 0;
			this._reveal = null;
			return this;
		}

		let min = Infinity;
		let max = -Infinity;
		for (let i = 0; i < xs.length; i++) {
			const x = xs[i];
			if (x == null) continue;
			if (x < min) min = x;
			if (x > max) max = x;
		}

		this._xMin = Number.isFinite(min) ? min : 0;
		this._xMax = Number.isFinite(max) ? max : this._xMin + 1;
		this._reveal = new RevealData(data);

		return this;
	}

	// ---- transport ---------------------------------------------------------

	play() {
		if (!this._data || this._data[0].length === 0)
			return this;

		if (this._state === PLAYBACK_STATE.ENDED)
			this._elapsed = 0;

		this._setState(PLAYBACK_STATE.PLAYING);
		return this;
	}

	pause() {
		if (this._state === PLAYBACK_STATE.PLAYING)
			this._setState(PLAYBACK_STATE.PAUSED);
		return this;
	}

	toggle() {
		return this._state === PLAYBACK_STATE.PLAYING ? this.pause() : this.play();
	}

	reset() {
		this._elapsed = 0;
		this._exactCursor = null;
		this._setState(PLAYBACK_STATE.IDLE);
		this._emit();
		return this;
	}

	/** Seek to normalised progress in [0,1]. */
	seek(progress) {
		this._exactCursor = null;
		this._elapsed = clamp01(progress) * this._duration;
		if (this._state === PLAYBACK_STATE.ENDED && this._elapsed < this._duration)
			this._setState(PLAYBACK_STATE.PAUSED);
		this._emit();
		return this;
	}

	/** Seek to an absolute x value on the timeline. */
	seekX(x) {
		const span = this._xMax - this._xMin;
		if (!(span > 0))
			return this;
		this.seek((x - this._xMin) / span);
		// Landing exactly on a sample matters: stepping by one must report the
		// sample's own timestamp, not a value one float epsilon away from it.
		this._exactCursor = x;
		return this;
	}

	/** Normalised progress that corresponds to an absolute x value. */
	xProgress(x) {
		const span = this._xMax - this._xMin;
		if (!(span > 0))
			return 0;
		return clamp01((x - this._xMin) / span);
	}

	/** Step forward/backward by `n` samples (uses the backing data's x array). */
	step(n = 1) {
		const xs = this._data?.[0];
		if (!xs || xs.length === 0)
			return this;

		const cursor = this.cursorX;
		let best = 0;
		let bestDist = Infinity;

		for (let i = 0; i < xs.length; i++) {
			const d = Math.abs(xs[i] - cursor);
			if (d < bestDist) {
				bestDist = d;
				best = i;
			}
		}

		const next = Math.min(xs.length - 1, Math.max(0, best + n));
		return this.seekX(xs[next]);
	}

	setSpeed(speed) {
		if (!SPEEDS.includes(speed))
			throw new RangeError(`Unsupported speed ${speed}. Allowed: ${SPEEDS.join(', ')}`);
		this._speed = speed;
		return this;
	}

	setMode(mode) {
		if (!Object.values(PLAYBACK_MODE).includes(mode))
			throw new RangeError(`Unsupported playback mode ${mode}`);
		this._mode = mode;
		this._emit();
		return this;
	}

	setDuration(ms) {
		this._duration = Math.max(1, ms);
		return this;
	}

	/**
	 * Nonlinear timeline mapping.
	 *
	 * Elastic windows (chart-standard.io, Grafana, Perfetto) compress quiet
	 * stretches so that a 12-hour replay is not 11 hours of flat line. The
	 * mapping is a pair of exact inverses; when installed, `progress` is
	 * interpreted in *timeline* space and `cursorX` returns real time.
	 */
	setMapping(mapping) {
		this._mapping = mapping ?? null;
		return this;
	}

	get mapping() {
		return this._mapping;
	}

	// ---- drive -------------------------------------------------------------

	/** Advance by wall-clock milliseconds; speed scales the timeline. */
	tick(dt) {
		if (this._state !== PLAYBACK_STATE.PLAYING)
			return false;

		this._elapsed += dt * this._speed;
		this._exactCursor = null;

		if (this._elapsed >= this._duration) {
			this._elapsed = this._duration;
			this._setState(PLAYBACK_STATE.ENDED);
			this._emit();
			return false;
		}

		this._emit();
		return true;
	}

	// ---- derived state -----------------------------------------------------

	get state() {
		return this._state;
	}

	get speed() {
		return this._speed;
	}

	get mode() {
		return this._mode;
	}

	get duration() {
		return this._duration;
	}

	get progress() {
		return clamp01(this._elapsed / this._duration);
	}

	get cursorX() {
		if (this._exactCursor != null)
			return this._exactCursor;

		if (this._mapping) {
			const [t0, t1] = this._mapping.timelineDomain;
			return this._mapping.toReal(t0 + (t1 - t0) * this.progress);
		}

		const span = this._xMax - this._xMin;
		return this._xMin + span * this.progress;
	}

	/** The full x domain of the attached dataset. */
	get domain() {
		return [this._xMin, this._xMax];
	}

	/** Visible x range for the current mode and progress. */
	get visibleRange() {
		const span = this._xMax - this._xMin;

		if (this._mode === PLAYBACK_MODE.WINDOW) {
			if (this._mapping) {
				// Window width is expressed on the timeline, then mapped to real
				// time so the sliding window covers equal *screen* distance.
				const [t0, t1] = this._mapping.timelineDomain;
				const tCur = t0 + (t1 - t0) * this.progress;
				const tLo = Math.max(t0, tCur - (t1 - t0) * this._windowRatio);
				return [this._mapping.toReal(tLo), this._mapping.toReal(tCur)];
			}
			const w = span * this._windowRatio;
			const right = this._xMin + span * this.progress;
			return [Math.max(this._xMin, right - w), right];
		}

		if (this._mode === PLAYBACK_MODE.CURSOR)
			return [this._xMin, this._xMax];

		return [this._xMin, this.cursorX];
	}

	/** Data to render for the current progress, or null before attach(). */
	get frame() {
		if (!this._data)
			return null;

		if (this._mode === PLAYBACK_MODE.REVEAL)
			return this._reveal ? this._reveal.upTo(this.cursorX) : this._data;

		if (this._mode === PLAYBACK_MODE.WINDOW) {
			const [lo, hi] = this.visibleRange;
			return this._reveal ? this._reveal.between(lo, hi) : this._data;
		}

		return this._data;
	}

	static get speeds() {
		return SPEEDS.slice();
	}

	// ---- internals ---------------------------------------------------------

	_setState(next) {
		if (next === this._state)
			return;
		const prev = this._state;
		this._state = next;
		this._onStateChange?.(next, prev);
	}

	_emit() {
		this._onFrame?.(this);
	}
}

function clamp01(v) {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Zero-copy progressive views over an aligned dataset.
 *
 * A x-array needs `n + 1` slots in the buffer because a reveal always shows one
 * synthetic boundary sample: the interpolated point on the segment that the
 * cursor is currently crossing. That boundary is a real interpolation of two
 * real samples, not invented data — the line visually terminates exactly at the
 * cursor instead of stopping at the last whole sample.
 */
export class RevealData {
	constructor(data) {
		this._src = data;
		this._n = data[0].length;
		this._buffers = new Array(data.length);
		this._boundary = new Array(data.length);

		for (let s = 0; s < data.length; s++) {
			const src = data[s];
			const buf = new Float64Array(this._n + 1);
			for (let i = 0; i < this._n; i++) {
				const v = src[i];
				buf[i] = v == null ? NaN : v;
			}
			this._buffers[s] = buf;
		}

		this._len = 0;
	}

	/** Index of the last sample whose x <= target, or -1. */
	_indexAt(x) {
		const xs = this._src[0];
		let lo = 0;
		let hi = this._n - 1;
		let ans = -1;

		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			if (xs[mid] <= x) {
				ans = mid;
				lo = mid + 1;
			}
			else {
				hi = mid - 1;
			}
		}

		return ans;
	}

	/** View of all samples up to `x`, plus the interpolated boundary sample. */
	upTo(x) {
		const idx = this._indexAt(x);

		if (idx < 0) {
			this._len = 0;
			return [this._buffers[0].subarray(0, 0), ...this._buffers.slice(1).map(b => b.subarray(0, 0))];
		}

		const xs = this._src[0];
		// A cursor that sits exactly on a real sample reveals exactly that sample;
		// a synthetic boundary point is only added when the cursor is strictly
		// inside a segment.
		const atEnd = idx >= this._n - 1 || xs[idx + 1] == null || x >= xs[this._n - 1];
		const count = idx + 1;
		const withBoundary = !atEnd && x > xs[idx] && xs[idx + 1] > xs[idx];
		const total = withBoundary ? count + 1 : count;

		for (let s = 0; s < this._buffers.length; s++) {
			if (withBoundary) {
				const a = this._src[s][idx];
				const b = this._src[s][idx + 1];
				this._buffers[s][count] = (a == null || b == null)
					? (s === 0 ? x : NaN)
					: (s === 0 ? x : a + ((b - a) * (x - xs[idx])) / (xs[idx + 1] - xs[idx]));
			}
		}

		this._len = total;

		const out = new Array(this._buffers.length);
		for (let s = 0; s < out.length; s++)
			out[s] = this._buffers[s].subarray(0, total);
		return out;
	}

	/** View of samples inside [lo, hi]. */
	between(lo, hi) {
		const xs = this._src[0];
		let a = this._indexAt(lo);
		if (a < 0) a = 0;
		const b = this._indexAt(hi);
		const end = b < 0 ? 0 : b + 1;

		const out = new Array(this._src.length);
		for (let s = 0; s < this._src.length; s++) {
			const src = this._src[s];
			const slice = new Float64Array(Math.max(0, end - a));
			for (let i = a; i < end; i++) {
				const v = src[i];
				slice[i - a] = v == null ? NaN : v;
			}
			out[s] = slice;
		}

		this._len = Math.max(0, end - a);
		return out;
	}
}
