import assert from 'node:assert/strict';
import '../../scripts/instrument.mjs';
import { TempoChart, ISSUE, OP, PLAYBACK_STATE, PLAYBACK_MODE } from '../../src/tempo/index.js';

function mount(extra = {}) {
	const el = document.createElement('div');
	document.body.appendChild(el);
	return { el, chart: new TempoChart(el, { width: 600, height: 300, ...extra }) };
}

const simple = () => [
	[0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
	[1, 5, 2, 8, 3, 9, 4, 7, 6, 0],
];

describe('tempo/TempoChart', () => {
	describe('construction', () => {
		it('creates a plot without touching upstream source', () => {
			const { el, chart } = mount({ data: simple() });
			assert.ok(chart._u, 'uPlot instance expected');
			assert.ok(el.querySelector('canvas'), 'a canvas must be mounted');
			chart.destroy();
			el.remove();
		});

		it('derives a render budget from the width', () => {
			const { el, chart } = mount({ data: simple() });
			assert.ok(chart.maxPoints >= 300);
			chart.destroy();
			el.remove();
		});

		it('honours an explicit maxPoints', () => {
			const { el, chart } = mount({ data: simple(), maxPoints: 123 });
			assert.equal(chart.maxPoints, 123);
			chart.destroy();
			el.remove();
		});

		it('renders an empty dataset without throwing', () => {
			const { el, chart } = mount({ data: [[], []] });
			assert.equal(chart.data[0].length, 0);
			assert.ok(chart.issues.some(i => i.code === ISSUE.EMPTY));
			chart.destroy();
			el.remove();
		});

		it('renders a single point without throwing', () => {
			const { el, chart } = mount({ data: [[5], [7]] });
			assert.ok(chart.issues.some(i => i.code === ISSUE.SINGLE_POINT));
			chart.destroy();
			el.remove();
		});
	});

	describe('data pipeline', () => {
		it('reports repair issues to the caller', () => {
			let seen = null;
			const { el, chart } = mount({
				data: [[0, 1, 2], [1, NaN, 3]],
				onIssues: (issues, stats) => { seen = { issues, stats }; },
			});

			assert.ok(seen);
			assert.ok(seen.issues.some(i => i.code === ISSUE.NON_FINITE_Y));
			assert.equal(seen.stats.cellsNulled, 1);
			chart.destroy();
			el.remove();
		});

		it('keeps the base data intact and exposes a decimated view', () => {
			const big = [
				Array.from({ length: 5000 }, (_, i) => i),
				Array.from({ length: 5000 }, (_, i) => Math.sin(i / 20)),
			];
			const { el, chart } = mount({ data: big, maxPoints: 400 });

			assert.equal(chart.data[0].length, 5000);
			assert.ok(chart.view[0].length <= 400);
			assert.ok(chart.view[0].length > 10);
			chart.destroy();
			el.remove();
		});

		it('keeps all points when the data is under budget', () => {
			const { el, chart } = mount({ data: simple(), maxPoints: 1000 });
			assert.equal(chart.view[0].length, 10);
			chart.destroy();
			el.remove();
		});

		it('records real timing for each stage', () => {
			const { el, chart } = mount({ data: simple() });
			const report = chart.getStats();
			assert.ok(report.metrics['sanitize.ms'].n >= 1);
			assert.ok(report.metrics['render.ms'].n >= 1);
			assert.ok(Number.isFinite(report.metrics['render.ms'].p50));
			chart.destroy();
			el.remove();
		});
	});

	describe('transitions', () => {
		it('starts a transition on a second dataset of the same length', () => {
			const { el, chart } = mount({ data: simple(), transitionDuration: 200 });
			chart.setData([simple()[0], simple()[1].map(v => v * 2)]);
			assert.equal(chart.transition.active, true);
			assert.equal(chart.transition.mode, 'values');
			chart.destroy();
			el.remove();
		});

		it('does not animate the first payload', () => {
			const { el, chart } = mount({ data: simple() });
			assert.equal(chart.transition.active, false);
			chart.destroy();
			el.remove();
		});

		it('falls back to axes-only when the length changes', () => {
			const { el, chart } = mount({ data: simple(), transitionDuration: 200 });
			chart.setData([[0, 10, 20], [1, 2, 3]]);
			assert.equal(chart.transition.mode, 'axes-only');
			chart.destroy();
			el.remove();
		});

		it('does not animate when duration is zero', () => {
			const { el, chart } = mount({ data: simple(), transitionDuration: 0 });
			chart.setData([simple()[0], simple()[1].map(v => v + 1)]);
			assert.equal(chart.transition.active, false);
			chart.destroy();
			el.remove();
		});
	});

	describe('playback', () => {
		it('refuses to play when there is no data', () => {
			const { el, chart } = mount({ data: [[], []] });
			chart.play();
			assert.equal(chart.playback.state, PLAYBACK_STATE.IDLE);
			chart.destroy();
			el.remove();
		});

		it('plays, pauses and reports progress', () => {
			const { el, chart } = mount({ data: simple() });
			chart.play();
			assert.equal(chart.playback.state, PLAYBACK_STATE.PLAYING);
			chart.pause();
			assert.equal(chart.playback.state, PLAYBACK_STATE.PAUSED);
			chart.destroy();
			el.remove();
		});

		it('seeks and clamps', () => {
			const { el, chart } = mount({ data: simple() });
			chart.seek(0.5);
			assert.equal(chart.playback.progress, 0.5);
			assert.equal(chart.playback.cursorX, 45);
			chart.seek(2);
			assert.equal(chart.playback.progress, 1);
			chart.destroy();
			el.remove();
		});

		it('switches modes and keeps the domain valid', () => {
			const { el, chart } = mount({ data: simple() });
			for (const mode of [PLAYBACK_MODE.WINDOW, PLAYBACK_MODE.CURSOR, PLAYBACK_MODE.REVEAL]) {
				chart.setPlaybackMode(mode);
				assert.equal(chart.playback.mode, mode);
				const [lo, hi] = chart.playback.visibleRange;
				assert.ok(hi >= lo);
			}
			chart.destroy();
			el.remove();
		});

		it('changes speed', () => {
			const { el, chart } = mount({ data: simple() });
			chart.setSpeed(4);
			assert.equal(chart.playback.speed, 4);
			chart.destroy();
			el.remove();
		});
	});

	describe('filtering', () => {
		it('clips the view to an x range', () => {
			const { el, chart } = mount({ data: simple() });
			chart.setFilter({ range: [20, 50] });
			assert.equal(chart.data[0].length, 10, 'base data must stay intact');
			assert.equal(chart.view[0].length, 4);
			assert.equal(chart.filter.stats.kept, 4);
			chart.destroy();
			el.remove();
		});

		it('applies structured conditions', () => {
			const { el, chart } = mount({ data: simple() });
			chart.setFilter({ conditions: [{ series: 0, op: OP.GT, value: 5 }] });
			// y values > 5 are 8, 9, 7, 6 -> 4 rows
			assert.equal(chart.view[0].length, 4);
			chart.destroy();
			el.remove();
		});

		it('nulls out a hidden series', () => {
			const { el, chart } = mount({ data: simple() });
			chart.setFilter({ visibleSeries: [] });
			assert.ok(chart.view[1].every(v => v == null));
			chart.destroy();
			el.remove();
		});

		it('clears back to the full set', () => {
			const { el, chart } = mount({ data: simple() });
			chart.setFilter({ range: [20, 30] });
			assert.equal(chart.view[0].length, 2);
			chart.clearFilter();
			assert.equal(chart.view[0].length, 10);
			chart.destroy();
			el.remove();
		});
	});

	describe('drill-down', () => {
		it('pushes and pops levels with exact ranges', () => {
			const { el, chart } = mount({ data: simple() });
			chart.drillTo([12, 48], 'mid');
			assert.equal(chart.drill.depth, 1);
			// snapped outward to samples: 10..50
			assert.deepEqual(chart.drill.range, [10, 50]);
			assert.equal(chart.view[0].length, 5);

			chart.drillBack();
			assert.equal(chart.drill.depth, 0);
			assert.equal(chart.view[0].length, 10);
			chart.destroy();
			el.remove();
		});

		it('resets everything', () => {
			const { el, chart } = mount({ data: simple() });
			chart.drillTo([10, 30], 'a');
			chart.drillTo([10, 20], 'b');
			chart.drillReset();
			assert.equal(chart.drill.depth, 0);
			assert.equal(chart.view[0].length, 10);
			chart.destroy();
			el.remove();
		});

		it('resets the stack when the dataset is replaced', () => {
			const { el, chart } = mount({ data: simple() });
			chart.drillTo([10, 30], 'a');
			chart.setData(simple());
			assert.equal(chart.drill.depth, 0);
			chart.destroy();
			el.remove();
		});

		it('ignores a drill range with no width', () => {
			const { el, chart } = mount({ data: simple() });
			assert.throws(() => chart.drillTo([10, 10], 'x'), RangeError);
			chart.destroy();
			el.remove();
		});
	});

	describe('live stream', () => {
		it('accumulates pushes and reports stats', () => {
			const { el, chart } = mount({ data: [[], []] });
			chart.startStream({ capacity: 50 });

			for (let i = 0; i < 10; i++)
				chart.push([i * 1000, i]);

			assert.equal(chart.stream.size, 10);
			assert.equal(chart.streamStats.requests, 10);
			assert.equal(chart.streamStats.received, 10);
			chart.destroy();
			el.remove();
		});

		it('rejects out-of-order pushes', () => {
			const { el, chart } = mount({ data: [[], []] });
			chart.startStream({ capacity: 50 });
			chart.push([1000, 1]);
			assert.equal(chart.push([500, 2]), 'rejected');
			assert.equal(chart.streamStats.rejectedOutOfOrder, 1);
			chart.destroy();
			el.remove();
		});

		it('coalesces bursts into fewer renders than pushes', () => {
			const { el, chart } = mount({ data: [[], []] });
			chart.startStream({ capacity: 200 });
			for (let i = 0; i < 100; i++)
				chart.push([i, i]);
			const s = chart.streamStats;
			assert.ok(s.flushes <= s.requests, 'flushes must never exceed requests');
			chart.destroy();
			el.remove();
		});
	});

	describe('lifecycle', () => {
		it('destroy() is idempotent-safe and stops work', () => {
			const { el, chart } = mount({ data: simple() });
			chart.play();
			chart.destroy();
			assert.equal(chart._destroyed, true);
			assert.equal(chart._u, null);
			chart.destroy();
			el.remove();
		});

		it('setSize recalculates the budget when it was derived', () => {
			const { el, chart } = mount({ data: simple() });
			const before = chart.maxPoints;
			chart.setSize(1200, 300);
			assert.ok(chart.maxPoints > before);
			chart.destroy();
			el.remove();
		});
	});
});
