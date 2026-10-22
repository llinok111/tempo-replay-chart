import assert from 'node:assert/strict';
import { RingBuffer, Coalescer } from '../../src/tempo/stream.js';
import { createFrameLoop, createManualScheduler } from '../../src/tempo/clock.js';
import { summarize, percentile, Metrics, SampleSeries } from '../../src/tempo/metrics.js';

describe('tempo/stream RingBuffer', () => {
	it('stores rows in chronological order', () => {
		const rb = new RingBuffer({ capacity: 10, series: 2 });
		rb.push([1, 10, 100]);
		rb.push([2, 20, 200]);

		const out = rb.toAligned();
		assert.deepEqual(out[0], [1, 2]);
		assert.deepEqual(out[1], [10, 20]);
		assert.deepEqual(out[2], [100, 200]);
	});

	it('evicts the oldest row once full and counts evictions', () => {
		const rb = new RingBuffer({ capacity: 3, series: 1 });
		for (let i = 1; i <= 6; i++)
			rb.push([i, i * 10]);

		const out = rb.toAligned();
		assert.deepEqual(out[0], [4, 5, 6]);
		assert.equal(rb.size, 3);
		assert.equal(rb.stats.evicted, 3);
		assert.equal(rb.stats.received, 6);
	});

	it('rejects out-of-order samples instead of reordering silently', () => {
		const rb = new RingBuffer({ capacity: 5, series: 1 });
		rb.push([10, 1]);
		assert.equal(rb.push([5, 2]), 'rejected');
		assert.equal(rb.stats.rejectedOutOfOrder, 1);
		assert.deepEqual(rb.toAligned()[0], [10]);
	});

	it('replaces a row with the same timestamp', () => {
		const rb = new RingBuffer({ capacity: 5, series: 1 });
		rb.push([10, 1]);
		assert.equal(rb.push([10, 99]), 'replaced');
		assert.deepEqual(rb.toAligned(), [[10], [99]]);
		assert.equal(rb.stats.replacedSameX, 1);
	});

	it('rejects non-finite timestamps', () => {
		const rb = new RingBuffer({ capacity: 5, series: 1 });
		assert.equal(rb.push([NaN, 1]), 'rejected');
		assert.equal(rb.push([Infinity, 1]), 'rejected');
		assert.equal(rb.size, 0);
	});

	it('maps non-finite values to gaps', () => {
		const rb = new RingBuffer({ capacity: 5, series: 1 });
		rb.push([1, NaN]);
		rb.push([2, Infinity]);
		assert.deepEqual(rb.toAligned()[1], [null, null]);
	});

	it('wraps correctly across the ring boundary', () => {
		const rb = new RingBuffer({ capacity: 4, series: 1 });
		for (let i = 0; i < 4; i++) rb.push([i, i]);
		// head is back at 0; the next push overwrites slot 0
		rb.push([4, 4]);
		rb.push([5, 5]);

		const out = rb.toAligned();
		assert.deepEqual(out[0], [2, 3, 4, 5]);
		assert.deepEqual(out[1], [2, 3, 4, 5]);
	});

	it('reuses an output buffer that has room, avoiding per-frame allocation', () => {
		const rb = new RingBuffer({ capacity: 4, series: 1 });
		rb.push([1, 1]);
		rb.push([2, 2]);

		// A buffer sized for the full window is reused by truncation, so the
		// caller keeps one payload array for the whole stream.
		const buf = [new Array(4), new Array(4)];
		const a = rb.toAligned(buf);
		assert.equal(a, buf, 'buffer should be reused');
		assert.deepEqual(a[0], [1, 2]);
		assert.equal(a[1].length, 2);

		rb.push([3, 3]);
		const b = rb.toAligned(a);
		assert.equal(b, a, 'still the same buffer');
		assert.deepEqual(b[0], [1, 2, 3]);
	});

	it('allocates a fresh payload when the buffer shape does not match', () => {
		const rb = new RingBuffer({ capacity: 4, series: 2 });
		rb.push([1, 1, 2]);
		const a = rb.toAligned();
		assert.equal(a.length, 3);
		assert.equal(a[0].length, 1);
	});

	it('validates its configuration', () => {
		assert.throws(() => new RingBuffer({ capacity: 1 }), RangeError);
		assert.throws(() => new RingBuffer({ capacity: 10, series: 0 }), RangeError);
	});

	it('clears and resets statistics', () => {
		const rb = new RingBuffer({ capacity: 3, series: 1 });
		rb.push([1, 1]);
		rb.clear();
		assert.equal(rb.size, 0);
		assert.equal(rb.stats.received, 0);
	});

	it('iterates rows in order without materialising arrays', () => {
		const rb = new RingBuffer({ capacity: 4, series: 1 });
		rb.push([1, 10]);
		rb.push([2, 20]);
		const seen = [];
		rb.forEachRow((x, buf, yOff) => seen.push([x, buf[yOff]]));
		assert.deepEqual(seen, [[1, 10], [2, 20]]);
	});
});

describe('tempo/stream Coalescer', () => {
	it('collapses many requests into one flush', () => {
		let flushes = 0;
		const c = new Coalescer(() => flushes++);

		for (let i = 0; i < 20; i++) c.request();
		assert.equal(flushes, 0);

		c.flush();
		assert.equal(flushes, 1);
		assert.equal(c.flush(), false, 'second flush with nothing pending must be a no-op');

		assert.deepEqual(c.stats, { requests: 20, flushes: 1, coalesced: 19 });
	});
});

describe('tempo/clock', () => {
	it('manual scheduler advances virtual time deterministically', () => {
		const s = createManualScheduler();
		assert.equal(s.now(), 0);
		s.advance(100);
		assert.equal(s.now(), 100);
	});

	it('step() runs exactly one scheduled frame', () => {
		const s = createManualScheduler();
		const seen = [];

		const loop = createFrameLoop(s, (dt, t) => {
			seen.push([dt, t]);
			if (seen.length < 3) loop.start();
		});

		loop.start();
		s.step(16);
		assert.equal(seen.length, 1);
		s.step(16);
		assert.equal(seen.length, 2);
	});

	it('clamps dt so a stalled tab cannot teleport playback', () => {
		const s = createManualScheduler();
		const seen = [];
		const loop = createFrameLoop(s, dt => seen.push(dt));
		loop.start();
		s.step(16);
		s.step(5000);
		assert.equal(seen[0], 0, 'first frame has no previous timestamp');
		assert.equal(seen[1], 100, 'dt must be clamped to maxDt');
	});

	it('stop() prevents further callbacks', () => {
		const s = createManualScheduler();
		let n = 0;
		const loop = createFrameLoop(s, () => { n++; loop.start(); });
		loop.start();
		s.step(16);
		loop.stop();
		s.advance(1000);
		s.flush();
		assert.equal(n, 1);
		assert.equal(loop.running, false);
	});
});

describe('tempo/metrics', () => {
	it('computes percentiles with nearest-rank semantics', () => {
		const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		assert.equal(percentile(s, 50), 5);
		assert.equal(percentile(s, 95), 10);
		assert.equal(percentile(s, 100), 10);
		assert.equal(percentile([], 50), NaN);
	});

	it('summarizes a sample set', () => {
		const r = summarize([2, 4, 6]);
		assert.equal(r.n, 3);
		assert.equal(r.min, 2);
		assert.equal(r.max, 6);
		assert.equal(r.mean, 4);
		assert.equal(r.sum, 12);
	});

	it('handles an empty sample set without dividing by zero', () => {
		const r = summarize([]);
		assert.equal(r.n, 0);
		assert.ok(Number.isNaN(r.mean));
	});

	it('retains at most its cap and evicts oldest first', () => {
		const s = new SampleSeries('x', 10);
		for (let i = 0; i < 100; i++) s.add(i);
		assert.equal(s.samples.length, 10);
		assert.deepEqual(s.samples, [90, 91, 92, 93, 94, 95, 96, 97, 98, 99]);
	});
});
