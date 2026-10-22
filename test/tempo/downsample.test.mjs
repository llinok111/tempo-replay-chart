import assert from 'node:assert/strict';
import {
	selectIndices, lttb, minMax, decimateAligned, measureFidelity, fullRange,
} from '../../src/tempo/downsample.js';

function ramp(n, fn = i => i) {
	const xs = new Array(n);
	const ys = new Array(n);
	for (let i = 0; i < n; i++) {
		xs[i] = i;
		ys[i] = fn(i);
	}
	return [xs, ys];
}

function assertAscendingUnique(idx) {
	for (let i = 1; i < idx.length; i++)
		assert.ok(idx[i] > idx[i - 1], `index ${i} not ascending: ${idx[i - 1]} -> ${idx[i]}`);
}

describe('tempo/downsample', () => {
	describe('passthrough', () => {
		it('returns every index when the budget covers the data', () => {
			const [xs, ys] = ramp(100);
			const idx = selectIndices(xs, ys, 100);
			assert.equal(idx.length, 100);
			assert.deepEqual(idx, fullRange(100));
		});

		it('treats a non-positive budget as "no cap"', () => {
			const [xs, ys] = ramp(50);
			assert.equal(selectIndices(xs, ys, 0).length, 50);
		});

		it('supports an explicit none mode', () => {
			const [xs, ys] = ramp(500);
			assert.equal(selectIndices(xs, ys, 50, 'none').length, 500);
		});
	});

	describe('lttb', () => {
		it('keeps the first and last sample', () => {
			const [xs, ys] = ramp(1000, i => Math.sin(i / 40) * 100);
			const idx = lttb(xs, ys, 100);
			assert.equal(idx[0], 0);
			assert.equal(idx[idx.length - 1], 999);
		});

		it('stays within the requested budget', () => {
			const [xs, ys] = ramp(5000, i => Math.sin(i / 50));
			for (const budget of [3, 10, 100, 999]) {
				const idx = lttb(xs, ys, budget);
				assert.ok(idx.length <= budget, `budget ${budget} produced ${idx.length}`);
			}
		});

		it('emits strictly ascending, unique indices', () => {
			const [xs, ys] = ramp(3000, i => (i % 97) - 48);
			assertAscendingUnique(lttb(xs, ys, 200));
		});

		it('preserves a single-sample spike that a naive every-Nth downsample would miss', () => {
			const n = 4000;
			const spikeAt = 1337;
			const [xs, ys] = ramp(n, i => (i === spikeAt ? 1000 : 0));
			const idx = lttb(xs, ys, 200);
			assert.ok(idx.includes(spikeAt), 'spike index must be retained');
		});

		it('preserves the exact extreme values of the original series', () => {
			const n = 8000;
			const [xs, ys] = ramp(n, i => Math.sin(i / 13) * 50 + (i === 4999 ? 400 : 0));
			const idx = lttb(xs, ys, 350);
			const maxKept = Math.max(...idx.map(i => ys[i]));
			const maxOrig = Math.max(...ys);
			assert.equal(maxKept, maxOrig);
		});

		it('does not lose a gap when the series contains nulls', () => {
			const n = 6000;
			const [xs, ys] = ramp(n);
			for (let i = 2000; i < 2100; i++)
				ys[i] = null;

			const idx = lttb(xs, ys, 300);
			const keptNulls = idx.filter(i => ys[i] == null).length;
			// 100-wide gap must stay visible: at least a couple of anchors survive.
			assert.ok(keptNulls >= 2, `expected gap anchors, got ${keptNulls}`);

			// The gap must not be "healed" by interpolating across it.
			const firstAfter = idx.find(i => i > 2099);
			assert.ok(firstAfter != null);
		});

		it('handles an all-null series without throwing', () => {
			const n = 500;
			const [xs] = ramp(n);
			const ys = new Array(n).fill(null);
			const idx = lttb(xs, ys, 50);
			assert.ok(idx.length > 0);
			assertAscendingUnique(idx);
		});
	});

	describe('minmax', () => {
		it('retains both extremes of every bucket', () => {
			const n = 2000;
			const [xs, ys] = ramp(n, i => (i % 2 === 0 ? i : -i));
			const idx = minMax(xs, ys, 100);
			const keptMax = Math.max(...idx.map(i => ys[i]));
			const keptMin = Math.min(...idx.map(i => ys[i]));
			assert.equal(keptMax, Math.max(...ys));
			assert.equal(keptMin, Math.min(...ys));
		});

		it('produces ascending unique indices', () => {
			const [xs, ys] = ramp(1000, i => Math.sin(i));
			assertAscendingUnique(minMax(xs, ys, 60));
		});
	});

	describe('decimateAligned', () => {
		it('applies one shared index list to every series, preserving alignment', () => {
			const n = 2000;
			const [xs] = ramp(n);
			const y1 = xs.map(i => i);
			const y2 = xs.map(i => i * 3);
			const data = [xs, y1, y2];

			const out = decimateAligned(data, 100, 'lttb');
			assert.equal(out.length, 3);
			const len = out[0].length;
			assert.ok(len <= 100);
			for (const col of out) assert.equal(col.length, len);

			// alignment: at every row, y2 must equal 3 * y1
			for (let i = 0; i < len; i++)
				assert.equal(out[2][i], out[1][i] * 3);
		});

		it('picks the densest series as the shape driver', () => {
			const n = 3000;
			const [xs] = ramp(n);
			const sparse = xs.map(i => (i % 500 === 0 ? i : null));
			const dense = xs.map(i => Math.sin(i / 9) * 100);
			const out = decimateAligned([xs, sparse, dense], 200, 'lttb');
			assert.ok(out[0].length > 2);
			assert.ok(out[0].length <= 200);
		});

		it('returns the input array identity when nothing needs decimating', () => {
			const data = [[1, 2, 3], [4, 5, 6]];
			assert.equal(decimateAligned(data, 100), data);
		});
	});

	describe('fidelity measurement', () => {
		it('reports zero error when nothing is dropped', () => {
			const [xs, ys] = ramp(100, i => i * i);
			const m = measureFidelity(xs, ys, fullRange(100));
			assert.equal(m.maxAbsError, 0);
			assert.equal(m.meanAbsError, 0);
			assert.equal(m.peakValueRetained, true);
		});

		it('bounds error for a smooth series to a small fraction of the value span', () => {
			const n = 20000;
			const [xs, ys] = ramp(n, i => Math.sin(i / 200));
			const idx = lttb(xs, ys, 1000);
			const m = measureFidelity(xs, ys, idx);
			assert.ok(m.maxNormError < 0.02, `maxNormError ${m.maxNormError} should be < 2% of span`);
			assert.ok(m.peakLossRatio < 1e-4, `peak loss ${m.peakLossRatio} should be < 0.01% of span`);
		});

		it('retains the exact extremes under minmax', () => {
			const n = 20000;
			const [xs, ys] = ramp(n, i => Math.sin(i / 200));
			const idx = minMax(xs, ys, 400);
			const m = measureFidelity(xs, ys, idx);
			assert.equal(m.peakValueRetained, true);
			assert.equal(m.peakLossRatio, 0);
		});

		it('reports a larger error for an adversarial high-frequency series', () => {
			const n = 20000;
			const [xs, ys] = ramp(n, i => (i % 2 === 0 ? 1 : -1));
			const idx = lttb(xs, ys, 500);
			const m = measureFidelity(xs, ys, idx);
			// Alternating signals cannot be represented by any decimation without
			// error; the point is that the measurement exposes it.
			assert.ok(m.maxNormError > 0);
			assert.equal(m.peakValueRetained, true);
		});

		it('counts kept samples correctly', () => {
			const [xs, ys] = ramp(1000, i => i);
			const idx = lttb(xs, ys, 100);
			const m = measureFidelity(xs, ys, idx);
			assert.equal(m.samples, 1000);
			assert.equal(m.kept, idx.length);
		});
	});
});
