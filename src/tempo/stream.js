/**
 * stream.js — bounded live ingestion.
 *
 * A live chart cannot keep every sample forever, and it must not let a burst of
 * updates (a reconnecting websocket, a replay of a backlog) schedule one render
 * per message. Two pieces solve that:
 *
 *   RingBuffer  — fixed capacity, oldest-first eviction, typed-array backed.
 *   Coalescer   — at most one flush per animation frame, no matter how many
 *                 pushes arrive in between.
 *
 * Out-of-order samples are rejected and counted rather than silently sorted;
 * a live feed that violates monotonic time is a feed problem the operator
 * needs to see, not something a chart should paper over.
 */

export class RingBuffer {
	/**
	 * @param {object} opts
	 * @param {number} [opts.capacity=2000] rows retained before eviction
	 * @param {number} [opts.series=1] number of y series
	 */
	constructor({ capacity = 2000, series = 1 } = {}) {
		if (!(capacity > 1))
			throw new RangeError('RingBuffer capacity must be > 1');
		if (!(series >= 1))
			throw new RangeError('RingBuffer needs at least one series');

		this.capacity = Math.floor(capacity);
		this.series = Math.floor(series);

		// +1 column for x
		this._cols = this.series + 1;
		this._buf = new Float64Array(this.capacity * this._cols);

		this._head = 0;      // index of the next write
		this._size = 0;

		this.stats = {
			received: 0,
			evicted: 0,
			rejectedOutOfOrder: 0,
			replacedSameX: 0,
		};
	}

	get size() {
		return this._size;
	}

	get full() {
		return this._size === this.capacity;
	}

	/** Most recent x, or null when empty. */
	get lastX() {
		if (this._size === 0)
			return null;
		const idx = (this._head - 1 + this.capacity) % this.capacity;
		return this._buf[idx * this._cols];
	}

	/**
	 * Append a row. Returns 'added' | 'replaced' | 'rejected'.
	 * @param {Array<number>} row `[x, ...ys]`
	 */
	push(row) {
		this.stats.received++;

		const x = row[0];
		if (!Number.isFinite(x)) {
			this.stats.rejectedOutOfOrder++;
			return 'rejected';
		}

		const last = this.lastX;

		if (last != null && x < last) {
			this.stats.rejectedOutOfOrder++;
			return 'rejected';
		}

		if (last != null && x === last) {
			const idx = (this._head - 1 + this.capacity) % this.capacity;
			const base = idx * this._cols;
			this._buf[base] = x;
			for (let s = 0; s < this.series; s++) {
				const v = row[s + 1];
				this._buf[base + s + 1] = Number.isFinite(v) ? v : NaN;
			}
			this.stats.replacedSameX++;
			return 'replaced';
		}

		const base = this._head * this._cols;
		this._buf[base] = x;
		for (let s = 0; s < this.series; s++) {
			const v = row[s + 1];
			this._buf[base + s + 1] = Number.isFinite(v) ? v : NaN;
		}

		this._head = (this._head + 1) % this.capacity;

		if (this._size < this.capacity)
			this._size++;
		else
			this.stats.evicted++;

		return 'added';
	}

	/** Push many rows; returns per-status counts. */
	pushAll(rows) {
		const out = { added: 0, replaced: 0, rejected: 0 };
		for (let i = 0; i < rows.length; i++)
			out[this.push(rows[i])]++;
		return out;
	}

	clear() {
		this._head = 0;
		this._size = 0;
		this.stats = { received: 0, evicted: 0, rejectedOutOfOrder: 0, replacedSameX: 0 };
		return this;
	}

	/**
	 * Materialise the window in chronological order.
	 * Reuses `into` when it matches shape, so steady-state streaming does not
	 * allocate a new payload per frame.
	 */
	toAligned(into = null) {
		// `into` must have room for at least `size` rows; a buffer sized for a
		// fuller window is reused by truncating its length.
		// After a reuse the buffer's length equals the previous window size, so
		// the capacity has to be tracked separately from the reported length.
		const reusable = into && into.length === this._cols && (into.__cap ?? into[0].length) >= this._size;
		const out = reusable
			? into
			: Array.from({ length: this._cols }, () => new Array(this._size));

		const start = this._size === this.capacity ? this._head : 0;

		for (let i = 0; i < this._size; i++) {
			const idx = (start + i) % this.capacity;
			const base = idx * this._cols;
			for (let c = 0; c < this._cols; c++) {
				const v = this._buf[base + c];
				out[c][i] = Number.isNaN(v) ? null : v;
			}
		}

		// Keep lengths exact if a smaller window reused a larger buffer.
		if (reusable) {
			Object.defineProperty(out, '__cap', { value: into.__cap ?? into[0].length, configurable: true, writable: true });
			for (let c = 0; c < this._cols; c++)
				out[c].length = this._size;
		}

		return out;
	}

	/** Iterate rows in chronological order without materialising arrays. */
	forEachRow(fn) {
		const start = this._size === this.capacity ? this._head : 0;
		for (let i = 0; i < this._size; i++) {
			const idx = (start + i) % this.capacity;
			const base = idx * this._cols;
			fn(this._buf[base], this._buf, base + 1, i);
		}
	}
}

/**
 * At most one flush per frame. `request()` is cheap and idempotent; `flush()`
 * is what the render loop calls once per rAF tick.
 */
export class Coalescer {
	constructor(onFlush) {
		this._onFlush = onFlush;
		this._pending = false;
		this._flushes = 0;
		this._requests = 0;
	}

	request() {
		this._pending = true;
		this._requests++;
	}

	get pending() {
		return this._pending;
	}

	/** @returns {boolean} true if a flush actually ran */
	flush() {
		if (!this._pending)
			return false;
		this._pending = false;
		this._flushes++;
		this._onFlush?.();
		return true;
	}

	get stats() {
		return {
			requests: this._requests,
			flushes: this._flushes,
			coalesced: this._requests - this._flushes,
		};
	}
}
