import assert from 'node:assert/strict';
import { sanitize, toFiniteNumber, ISSUE, buildStableOrder } from '../../src/tempo/guard.js';

const codes = r => r.issues.map(i => i.code).sort();
const has = (r, code) => r.issues.some(i => i.code === code);

describe('tempo/guard', () => {
	describe('toFiniteNumber', () => {
		it('accepts finite numbers including 0 and negatives', () => {
			assert.equal(toFiniteNumber(0), 0);
			assert.equal(toFiniteNumber(-12.5), -12.5);
			assert.equal(toFiniteNumber(1e21), 1e21);
		});

		it('accepts unambiguously numeric strings only', () => {
			assert.equal(toFiniteNumber('42'), 42);
			assert.equal(toFiniteNumber(' 3.5 '), 3.5);
			assert.equal(toFiniteNumber('-1e3'), -1000);
			assert.equal(toFiniteNumber('12px'), null);
			assert.equal(toFiniteNumber('0x10'), null);
			assert.equal(toFiniteNumber(''), null);
			assert.equal(toFiniteNumber('   '), null);
		});

		it('rejects non-finite and non-numeric values', () => {
			assert.equal(toFiniteNumber(NaN), null);
			assert.equal(toFiniteNumber(Infinity), null);
			assert.equal(toFiniteNumber(-Infinity), null);
			assert.equal(toFiniteNumber(null), null);
			assert.equal(toFiniteNumber(undefined), null);
			assert.equal(toFiniteNumber({}), null);
			assert.equal(toFiniteNumber([]), null);
			assert.equal(toFiniteNumber(true), null);
		});
	});

	describe('empty and degenerate input', () => {
		it('reports empty for null input and returns a renderable shell', () => {
			const r = sanitize(null);
			assert.deepEqual(r.data, [[]]);
			assert.deepEqual(codes(r), [ISSUE.EMPTY]);
			assert.equal(r.stats.outputRows, 0);
		});

		it('reports empty for zero-length columns and keeps series arity', () => {
			const r = sanitize([[], [], []]);
			assert.equal(r.data.length, 3);
			assert.equal(r.data[0].length, 0);
			assert.ok(has(r, ISSUE.EMPTY));
		});

		it('reports single-point without dropping it', () => {
			const r = sanitize([[5], [7]]);
			assert.deepEqual(r.data, [[5], [7]]);
			assert.ok(has(r, ISSUE.SINGLE_POINT));
			assert.equal(r.stats.outputRows, 1);
		});

		it('flags a series with no usable values', () => {
			const r = sanitize([[1, 2, 3], [null, null, null]]);
			assert.ok(has(r, ISSUE.ALL_NULL_Y));
			assert.deepEqual(r.data[1], [null, null, null]);
		});

		it('flags a series whose values never change', () => {
			const r = sanitize([[1, 2, 3], [9, 9, 9]]);
			assert.ok(has(r, ISSUE.FLAT_Y));
		});

		it('does not flag flat when there is only one sample', () => {
			const r = sanitize([[1], [9]]);
			assert.ok(!has(r, ISSUE.FLAT_Y));
		});
	});

	describe('x-axis repair', () => {
		it('drops rows with an unusable x and counts them', () => {
			const r = sanitize([[1, null, 3], [10, 20, 30]]);
			assert.deepEqual(r.data, [[1, 3], [10, 30]]);
			assert.equal(r.stats.xsDropped, 1);
			assert.ok(has(r, ISSUE.NON_FINITE_X));
		});

		it('drops rows whose x is a non-finite number', () => {
			const r = sanitize([[1, NaN, Infinity, 4], [1, 2, 3, 4]]);
			assert.deepEqual(r.data[0], [1, 4]);
			assert.equal(r.stats.xsDropped, 2);
		});

		it('sorts unsorted input and records the mapping back to source rows', () => {
			const r = sanitize([[30, 10, 20], [3, 1, 2]]);
			assert.deepEqual(r.data[0], [10, 20, 30]);
			assert.deepEqual(r.data[1], [1, 2, 3]);
			assert.deepEqual(r.rowMap, [1, 2, 0]);
			assert.ok(has(r, ISSUE.UNSORTED_X));
			assert.equal(r.stats.sorted, true);
		});

		it('keeps equal keys in source order while sorting (stability)', () => {
			const xs = [2, 1, 2, 1];
			const order = buildStableOrder(xs);
			assert.deepEqual(order, [1, 3, 0, 2]);
		});

		it('leaves already-sorted input untouched and does not report it', () => {
			const input = [[1, 2, 3], [4, 5, 6]];
			const r = sanitize(input);
			assert.deepEqual(r.data, input);
			assert.ok(!has(r, ISSUE.UNSORTED_X));
		});
	});

	describe('duplicate timestamps', () => {
		it('collapses duplicate x by default, keeping the first payload', () => {
			const r = sanitize([[1, 2, 2, 3], [10, 20, 21, 30]]);
			assert.deepEqual(r.data[0], [1, 2, 3]);
			assert.deepEqual(r.data[1], [10, 20, 30]);
			assert.ok(has(r, ISSUE.DUPLICATE_X));
			assert.equal(r.issues.find(i => i.code === ISSUE.DUPLICATE_X).count, 1);
		});

		it('prefers a row that carries data over an empty incumbent', () => {
			const r = sanitize([[1, 2, 2], [5, null, 7]]);
			assert.deepEqual(r.data[1], [5, 7]);
		});

		it('honours the last-wins policy', () => {
			const r = sanitize([[1, 2, 2], [10, 20, 21]], { dedupe: 'last' });
			assert.deepEqual(r.data[1], [10, 21]);
		});

		it('honours the null-out policy', () => {
			const r = sanitize([[1, 2, 2], [10, 20, 21]], { dedupe: 'null' });
			assert.deepEqual(r.data[1], [10, null]);
		});
	});

	describe('y-axis repair', () => {
		it('converts numeric strings and counts the coercion', () => {
			const r = sanitize([[1, 2, 3], ['1.5', '2.5', '3.5']]);
			assert.deepEqual(r.data[1], [1.5, 2.5, 3.5]);
			assert.equal(r.stats.cellsCoerced, 3);
		});

		it('turns NaN and Infinity into gaps, never into zero', () => {
			const r = sanitize([[1, 2, 3, 4], [5, NaN, Infinity, -Infinity]]);
			assert.deepEqual(r.data[1], [5, null, null, null]);
			assert.equal(r.stats.cellsNulled, 3);
			assert.ok(r.data[1].every(v => v !== 0));
		});

		it('can disable string coercion', () => {
			const r = sanitize([[1, 2], ['5', '6']], { coerceStrings: false });
			assert.deepEqual(r.data[1], [null, null]);
			assert.ok(has(r, ISSUE.NON_NUMERIC_Y));
		});

		it('pads short series with gaps and truncates long ones', () => {
			const r = sanitize([[1, 2, 3], [10, 20]]);
			assert.deepEqual(r.data[1], [10, 20, null]);
			assert.ok(has(r, ISSUE.RAGGED));

			const r2 = sanitize([[1, 2], [10, 20, 30]]);
			assert.deepEqual(r2.data[1], [10, 20]);
			assert.ok(has(r2, ISSUE.RAGGED));
		});

		it('reports a missing series array instead of crashing', () => {
			const r = sanitize([[1, 2], null, [3, 4]]);
			assert.equal(r.data.length, 2);
			assert.ok(has(r, ISSUE.MISSING_Y));
		});
	});

	describe('row cap', () => {
		it('truncates to maxRows and reports it', () => {
			const xs = Array.from({ length: 100 }, (_, i) => i);
			const ys = xs.map(v => v * 2);
			const r = sanitize([xs, ys], { maxRows: 10 });
			assert.equal(r.stats.outputRows, 10);
			assert.equal(r.stats.rowsTruncated, 90);
			assert.equal(r.data[0][9], 9);
		});
	});

	describe('purity and repeatability', () => {
		it('does not mutate the input arrays', () => {
			const input = [[3, 1, 2], [30, 10, 20]];
			const snapshot = JSON.stringify(input);
			sanitize(input);
			assert.equal(JSON.stringify(input), snapshot);
		});

		it('produces identical output for identical input across 5 runs', () => {
			const input = [[5, 3, 3, 1, null], [50, 30, 31, 10, 99]];
			// durationMs is a measurement, not part of the repair result.
			const strip = r => JSON.stringify({ ...r, stats: { ...r.stats, durationMs: 0 } });
			const first = strip(sanitize(input));
			for (let i = 0; i < 4; i++)
				assert.equal(strip(sanitize(input)), first);
		});

		it('output always satisfies the aligned contract', () => {
			const cases = [
				[[1, 2, 3], [1, 2, 3]],
				[[3, 1, 2], [1, null, 3]],
				[[1, 1, 1], [1, 2, 3]],
				[[1, 2], [1]],
				[[1, 2, 3], [null, NaN, 5]],
			];

			for (const c of cases) {
				const r = sanitize(c);
				const len = r.data[0].length;
				for (const col of r.data)
					assert.equal(col.length, len, `column length mismatch for ${JSON.stringify(c)}`);

				for (let i = 1; i < r.data[0].length; i++)
					assert.ok(r.data[0][i] > r.data[0][i - 1], 'x must be strictly increasing');
			}
		});
	});
});
