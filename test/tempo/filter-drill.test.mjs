import assert from 'node:assert/strict';
import { applyFilter, compileCondition, distinctX, OP } from '../../src/tempo/filter.js';
import { DrillStack, snapRange, bucketRanges } from '../../src/tempo/drill.js';

const data = [
	[0, 10, 20, 30, 40],
	[1, 5, 2, 8, 3],
	[100, 50, 20, 10, 0],
];

describe('tempo/filter', () => {
	describe('compileCondition', () => {
		it('builds numeric comparisons', () => {
			const gt = compileCondition({ series: 0, op: OP.GT, value: 4 });
			const xs = data[0];
			const ys = data.slice(1);
			assert.deepEqual([0, 1, 2, 3, 4].map(i => gt(xs, ys, i)), [false, true, false, true, false]);
		});

		it('supports between with either argument order', () => {
			const c = compileCondition({ series: 0, op: OP.BETWEEN, value: 8, value2: 2 });
			const xs = data[0];
			const ys = data.slice(1);
			assert.deepEqual([0, 1, 2, 3, 4].map(i => c(xs, ys, i)), [false, true, true, true, true]);
		});

		it('targets the x axis when asked', () => {
			const c = compileCondition({ axis: 'x', op: OP.GTE, value: 20 });
			assert.deepEqual([0, 1, 2, 3, 4].map(i => c(data[0], data.slice(1), i)), [false, false, true, true, true]);
		});

		it('coerces string thresholds', () => {
			// series 1 is the second y series: [100, 50, 20, 10, 0]
			const c = compileCondition({ series: 1, op: OP.LTE, value: '10' });
			assert.equal(c(data[0], data.slice(1), 3), true, '10 <= 10 via a string threshold');
		});

		it('reads nulls as null, not as zero', () => {
			const xs = [0, 1];
			const ys = [[null, 5]];
			const isNull = compileCondition({ series: 0, op: OP.IS_NULL });
			const notNull = compileCondition({ series: 0, op: OP.NOT_NULL });
			assert.equal(isNull(xs, ys, 0), true);
			assert.equal(notNull(xs, ys, 0), false);
			assert.equal(notNull(xs, ys, 1), true);
		});

		it('rejects bad input loudly', () => {
			assert.throws(() => compileCondition(null), TypeError);
			assert.throws(() => compileCondition({ op: 'wat' }), RangeError);
			assert.throws(() => compileCondition({ op: OP.GT }), RangeError, 'missing value must throw');
			assert.throws(() => compileCondition({ op: OP.BETWEEN, value: 1 }), RangeError);
			assert.throws(() => compileCondition({ series: -1, op: OP.GT, value: 1 }), RangeError);
			assert.throws(() => compileCondition({ series: 0.5, op: OP.GT, value: 1 }), RangeError);
			assert.throws(() => compileCondition({ axis: 'x', op: OP.CONTAINS }), RangeError);
		});

		it('never evaluates arbitrary code', () => {
			// A condition object is data. A string that looks like code must be
			// treated as an op name and rejected, not executed.
			assert.throws(() => compileCondition({ op: 'process.exit(1)' }), RangeError);
		});
	});

	describe('applyFilter', () => {
		it('keeps everything with no filters', () => {
			const r = applyFilter(data);
			assert.equal(r.kept, 5);
			assert.equal(r.dropped, 0);
			assert.deepEqual(r.data[0], data[0]);
		});

		it('clips to an inclusive x range', () => {
			const r = applyFilter(data, { range: [10, 30] });
			assert.deepEqual(r.data[0], [10, 20, 30]);
			assert.deepEqual(r.data[1], [5, 2, 8]);
			assert.equal(r.kept, 3);
			assert.equal(r.dropped, 2);
			assert.deepEqual(r.boundaries, { first: 10, last: 30 });
		});

		it('ANDs multiple conditions', () => {
			// y0 = [1,5,2,8,3], y1 = [100,50,20,10,0].
			// y0 > 2 keeps x = 10, 30, 40; y1 < 100 keeps x = 20, 30, 40.
			const r = applyFilter(data, {
				conditions: [
					{ series: 0, op: OP.GT, value: 2 },
					{ series: 1, op: OP.LT, value: 100 },
				],
			});
			assert.deepEqual(r.data[0], [10, 30, 40]);
		});

		it('nulls out hidden series without dropping rows', () => {
			const r = applyFilter(data, { visibleSeries: [0] });
			assert.equal(r.kept, 5);
			assert.deepEqual(r.data[2], [null, null, null, null, null]);
			assert.deepEqual(r.data[1], data[1]);
		});

		it('does not mutate the input', () => {
			const snapshot = JSON.stringify(data);
			applyFilter(data, { range: [10, 20], visibleSeries: [1] });
			assert.equal(JSON.stringify(data), snapshot);
		});

		it('returns an empty but well-formed result when nothing matches', () => {
			const r = applyFilter(data, { range: [1000, 2000] });
			assert.equal(r.kept, 0);
			assert.equal(r.data.length, 3);
			for (const col of r.data) assert.equal(col.length, 0);
			assert.deepEqual(r.boundaries, { first: null, last: null });
		});

		it('is repeatable', () => {
			const opts = { range: [10, 30], conditions: [{ series: 0, op: OP.GTE, value: 2 }] };
			const a = JSON.stringify(applyFilter(data, opts).data);
			for (let i = 0; i < 3; i++)
				assert.equal(JSON.stringify(applyFilter(data, opts).data), a);
		});
	});

	describe('distinctX', () => {
		it('dedupes and caps', () => {
			assert.deepEqual(distinctX([1, 1, 2, 3, 3, 2]), [1, 2, 3]);
			assert.equal(distinctX([1, 2, 3, 4, 5], 3).length, 3);
		});
	});
});

describe('tempo/drill', () => {
	describe('DrillStack', () => {
		it('starts empty at the root', () => {
			const s = new DrillStack({ rootLabel: 'All' });
			assert.equal(s.depth, 0);
			assert.equal(s.empty, true);
			assert.deepEqual(s.path, ['All']);
			assert.equal(s.range, null);
		});

		it('pushes levels and exposes the breadcrumb', () => {
			const s = new DrillStack({ rootLabel: 'All' });
			s.push({ range: [0, 100], label: 'Oct' });
			s.push({ range: [10, 20], label: 'Oct 14' });

			assert.equal(s.depth, 2);
			assert.deepEqual(s.path, ['All', 'Oct', 'Oct 14']);
			assert.deepEqual(s.range, [10, 20]);
		});

		it('pops back to the exact parent range', () => {
			const s = new DrillStack();
			s.push({ range: [0, 100], label: 'A' });
			s.push({ range: [10, 20], label: 'B' });
			const cur = s.pop();
			assert.deepEqual(cur.range, [0, 100]);
			assert.equal(s.depth, 1);
		});

		it('pop on an empty stack is a no-op', () => {
			const s = new DrillStack();
			assert.equal(s.pop(), null);
			assert.equal(s.depth, 0);
		});

		it('reset clears every level', () => {
			const s = new DrillStack();
			s.push({ range: [0, 1], label: 'A' });
			s.push({ range: [0, 0.5], label: 'B' });
			s.reset();
			assert.equal(s.depth, 0);
		});

		it('validates its input', () => {
			const s = new DrillStack();
			assert.throws(() => s.push({ range: [5, 5] }), RangeError);
			assert.throws(() => s.push({ range: [10, 0] }), RangeError);
			assert.throws(() => s.push({ range: 'nope' }), TypeError);
		});

		it('enforces the depth limit', () => {
			const s = new DrillStack({ maxDepth: 2 });
			s.push({ range: [0, 10], label: 'A' });
			s.push({ range: [0, 5], label: 'B' });
			assert.throws(() => s.push({ range: [0, 2], label: 'C' }), RangeError);
		});

		it('records meta without losing it on pop', () => {
			const s = new DrillStack();
			s.push({ range: [0, 10], label: 'A', meta: { rows: 12 } });
			assert.deepEqual(s.current.meta, { rows: 12 });
		});
	});

	describe('snapRange', () => {
		const xs = [0, 10, 20, 30, 40];

		it('expands a range outward to sample boundaries', () => {
			assert.deepEqual(snapRange(xs, [12, 28]), [10, 30]);
		});

		it('leaves an already-aligned range alone', () => {
			assert.deepEqual(snapRange(xs, [10, 30]), [10, 30]);
		});

		it('returns the input for an empty axis', () => {
			assert.deepEqual(snapRange([], [5, 9]), [5, 9]);
		});

		it('ignores null samples', () => {
			assert.deepEqual(snapRange([0, null, 20, null, 40], [5, 35]), [0, 40]);
		});
	});

	describe('bucketRanges', () => {
		it('groups by day and returns only non-empty buckets', () => {
			const day = 86400000;
			// Local midnight: bucket keys are local calendar labels by design.
			const base = new Date(2026, 0, 1, 0, 0, 0).getTime();
			const xs = [base, base + 3600000, base + day, base + day + 7200000];

			const buckets = bucketRanges(xs, 'day');
			assert.equal(buckets.length, 2);
			assert.equal(buckets[0].count, 2);
			assert.equal(buckets[1].count, 2);
			assert.equal(buckets[0].key, '2026-01-01');
		});

		it('supports hour and month granularity', () => {
			const base = new Date(2026, 4, 3, 0, 0, 0).getTime();
			assert.equal(bucketRanges([base], 'hour')[0].key, '2026-05-03 00:00');
			assert.equal(bucketRanges([base], 'month')[0].key, '2026-05');
			assert.equal(bucketRanges([base], 'year')[0].key, '2026');
		});
	});
});
