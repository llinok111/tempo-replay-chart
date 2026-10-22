import assert from 'node:assert/strict';
import { Playback, RevealData, PLAYBACK_MODE, PLAYBACK_STATE } from '../../src/tempo/playback.js';

function series(spec) {
	// spec: [[x, y], ...]
	return [spec.map(p => p[0]), spec.map(p => p[1])];
}

describe('tempo/playback', () => {
	describe('state machine', () => {
		it('starts idle and refuses to play without data', () => {
			const pb = new Playback();
			assert.equal(pb.state, PLAYBACK_STATE.IDLE);
			pb.play();
			assert.equal(pb.state, PLAYBACK_STATE.IDLE);
		});

		it('walks idle -> playing -> paused -> playing -> ended', () => {
			const pb = new Playback({ duration: 100 }).attach(series([[0, 1], [100, 2]]));

			assert.equal(pb.state, PLAYBACK_STATE.IDLE);
			pb.play();
			assert.equal(pb.state, PLAYBACK_STATE.PLAYING);

			pb.tick(40);
			pb.pause();
			assert.equal(pb.state, PLAYBACK_STATE.PAUSED);

			pb.play();
			assert.equal(pb.state, PLAYBACK_STATE.PLAYING);

			const still = pb.tick(100);
			assert.equal(still, false);
			assert.equal(pb.state, PLAYBACK_STATE.ENDED);
		});

		it('does not advance while paused', () => {
			const pb = new Playback({ duration: 100 }).attach(series([[0, 1], [100, 2]]));
			pb.play();
			pb.tick(30);
			pb.pause();
			const p = pb.progress;
			pb.tick(50);
			assert.equal(pb.progress, p);
		});

		it('replays from the start after ending', () => {
			const pb = new Playback({ duration: 100 }).attach(series([[0, 1], [100, 2]]));
			pb.play();
			pb.tick(200);
			assert.equal(pb.state, PLAYBACK_STATE.ENDED);
			pb.play();
			assert.equal(pb.state, PLAYBACK_STATE.PLAYING);
			assert.equal(pb.progress, 0);
		});

		it('emits state changes in order', () => {
			const seen = [];
			const pb = new Playback({ duration: 100, onStateChange: (s, p) => seen.push(`${p}->${s}`) })
				.attach(series([[0, 1], [10, 2]]));
			pb.play();
			pb.pause();
			pb.play();
			pb.tick(200);
			assert.deepEqual(seen, ['idle->playing', 'playing->paused', 'paused->playing', 'playing->ended']);
		});
	});

	describe('time mapping', () => {
		it('maps progress linearly over the x domain, not over row index', () => {
			// 4 rows, but x is heavily skewed toward the start.
			const pb = new Playback({ duration: 100, mode: PLAYBACK_MODE.CURSOR })
				.attach(series([[0, 0], [10, 1], [20, 2], [1000, 3]]));

			pb.seek(0.5);
			assert.equal(pb.cursorX, 500);
		});

		it('handles negative and fractional timestamps', () => {
			const pb = new Playback({ duration: 100, mode: PLAYBACK_MODE.CURSOR })
				.attach(series([[-100.5, 1], [-0.5, 2], [99.5, 3]]));
			pb.seek(0.5);
			assert.equal(pb.cursorX, -0.5);
		});

		it('reports a degenerate domain safely', () => {
			const pb = new Playback().attach(series([[5, 1], [5, 2]]));
			assert.equal(pb.cursorX, 5);
			assert.deepEqual(pb.visibleRange, [5, 5]);
		});

		it('seek clamps outside [0,1]', () => {
			const pb = new Playback({ duration: 100 }).attach(series([[0, 1], [10, 2]]));
			pb.seek(-3);
			assert.equal(pb.progress, 0);
			pb.seek(9);
			assert.equal(pb.progress, 1);
		});

		it('seekX is the inverse of cursorX', () => {
			const pb = new Playback({ duration: 100 }).attach(series([[0, 1], [40, 2], [100, 3]]));
			pb.seekX(65);
			assert.equal(pb.cursorX, 65);
			assert.ok(Math.abs(pb.progress - 0.65) < 1e-9);
		});

		it('step moves by whole samples and clamps at the ends', () => {
			const data = series([[0, 0], [10, 1], [20, 2], [30, 3]]);
			const pb = new Playback({ duration: 100 }).attach(data);

			pb.seekX(0);
			pb.step(2);
			assert.equal(pb.cursorX, 20);

			pb.step(-1);
			assert.equal(pb.cursorX, 10);

			pb.step(99);
			assert.equal(pb.cursorX, 30);

			pb.step(-99);
			assert.equal(pb.cursorX, 0);
		});
	});

	describe('speed', () => {
		it('scales the timeline without changing duration', () => {
			const pb = new Playback({ duration: 1000 }).attach(series([[0, 1], [1000, 2]]));
			pb.setSpeed(4);
			pb.play();
			pb.tick(250);
			assert.equal(pb.progress, 1);
		});

		it('rejects unsupported speeds', () => {
			const pb = new Playback();
			assert.throws(() => pb.setSpeed(3), RangeError);
			assert.equal(pb.setSpeed(0.5).speed, 0.5);
		});

		it('exposes the supported speed list', () => {
			assert.deepEqual(Playback.speeds, [0.25, 0.5, 1, 2, 4, 8]);
		});
	});

	describe('modes', () => {
		const data = series([[0, 0], [25, 1], [50, 2], [75, 3], [100, 4]]);

		it('reveal grows the visible window from xMin', () => {
			const pb = new Playback({ duration: 100, mode: PLAYBACK_MODE.REVEAL }).attach(data);
			pb.seek(0.5);
			assert.deepEqual(pb.visibleRange, [0, 50]);
			const frame = pb.frame;
			assert.equal(frame[0].length, 3); // 0, 25, 50
		});

		it('window slides a fixed-width slice', () => {
			const pb = new Playback({ duration: 100, mode: PLAYBACK_MODE.WINDOW, windowRatio: 0.5 }).attach(data);
			pb.seek(1);
			assert.deepEqual(pb.visibleRange, [50, 100]);
			const frame = pb.frame;
			assert.deepEqual(Array.from(frame[0]), [50, 75, 100]);
		});

		it('cursor keeps the full domain visible', () => {
			const pb = new Playback({ duration: 100, mode: PLAYBACK_MODE.CURSOR }).attach(data);
			pb.seek(0.3);
			assert.deepEqual(pb.visibleRange, [0, 100]);
			assert.equal(pb.frame[0].length, 5);
		});

		it('rejects an unknown mode', () => {
			const pb = new Playback();
			assert.throws(() => pb.setMode('telepathy'), RangeError);
		});
	});

	describe('empty data', () => {
		it('survives attach with no rows', () => {
			const pb = new Playback().attach([[], []]);
			assert.equal(pb.progress, 0);
			assert.equal(pb.cursorX, 0);
			assert.deepEqual(pb.visibleRange, [0, 0]);
			assert.equal(pb.frame[0].length, 0);
		});

		it('returns null frame before attach', () => {
			assert.equal(new Playback().frame, null);
		});
	});
});

describe('tempo/playback RevealData', () => {
	it('interpolates a boundary sample so the line ends exactly at the cursor', () => {
		const data = [[0, 10, 20, 30], [0, 100, 200, 300]];
		const r = new RevealData(data);
		const frame = r.upTo(15);

		// x: 0, 10, and a synthetic 15; y: 0, 100, and 150
		assert.deepEqual(Array.from(frame[0]), [0, 10, 15]);
		assert.deepEqual(Array.from(frame[1]), [0, 100, 150]);
	});

	it('returns the real sample when the cursor lands on it', () => {
		const data = [[0, 10, 20], [5, 15, 25]];
		const r = new RevealData(data);
		const frame = r.upTo(10);
		assert.deepEqual(Array.from(frame[0]), [0, 10]);
		assert.deepEqual(Array.from(frame[1]), [5, 15]);
	});

	it('returns an empty view before the first sample', () => {
		const r = new RevealData([[10, 20], [1, 2]]);
		const frame = r.upTo(5);
		assert.equal(frame[0].length, 0);
		assert.equal(frame[1].length, 0);
	});

	it('handles a gap at the boundary without inventing a value', () => {
		const data = [[0, 10, 20], [0, null, 200]];
		const r = new RevealData(data);
		const frame = r.upTo(15);
		assert.equal(frame[0].length, 3);
		assert.ok(Number.isNaN(frame[1][2]), 'boundary spanning a gap must be NaN, not a number');
	});

	it('between() returns the samples inside the window inclusive', () => {
		const data = [[0, 10, 20, 30], [0, 1, 2, 3]];
		const r = new RevealData(data);
		const frame = r.between(10, 20);
		assert.deepEqual(Array.from(frame[0]), [10, 20]);
		assert.deepEqual(Array.from(frame[1]), [1, 2]);
	});

	it('does not allocate a fresh payload on repeated upTo calls', () => {
		const data = [[0, 10, 20, 30], [0, 1, 2, 3]];
		const r = new RevealData(data);
		const a = r.upTo(5);
		const b = r.upTo(15);
		assert.equal(a[1].buffer, b[1].buffer, 'views must share one backing store');
	});

	it('keeps x strictly non-decreasing across a full sweep', () => {
		const n = 200;
		const xs = Array.from({ length: n }, (_, i) => i * 3);
		const ys = xs.map(v => v * 2);
		const r = new RevealData([xs, ys]);

		// Each view must be internally sorted and must never end before the
		// previous view ended (the reveal window only grows).
		let prevEnd = -Infinity;
		for (let step = 0; step <= 100; step++) {
			const x = (n * 3 * step) / 100;
			const frame = r.upTo(x);
			const fx = frame[0];
			for (let i = 1; i < fx.length; i++)
				assert.ok(fx[i] > fx[i - 1], `view ${step} is not sorted at ${i}`);

			if (fx.length) {
				assert.ok(fx[0] === 0 || step === 0, 'every view starts at the first sample');
				assert.ok(fx[fx.length - 1] >= prevEnd - 1e-9, 'reveal window must only grow');
				prevEnd = fx[fx.length - 1];
			}
		}
	});
});
