import assert from 'node:assert/strict';
import { Transition, interpolateInto, interpolateRange, lerp } from '../../src/tempo/tween.js';
import { resolveEasing, cubicInOut, prefersReducedMotion, VALUE_EASINGS, EASINGS } from '../../src/tempo/easing.js';

function run(tr, steps, dt) {
	for (let i = 0; i < steps; i++)
		tr.tick(dt);
}

describe('tempo/easing', () => {
	it('all value easings stay inside [0,1] for t in [0,1]', () => {
		for (const name of VALUE_EASINGS) {
			const fn = resolveEasing(name);
			for (let i = 0; i <= 100; i++) {
				const v = fn(i / 100);
				assert.ok(v >= -1e-9 && v <= 1 + 1e-9, `${name}(${i / 100}) = ${v}`);
			}
			assert.equal(fn(0), 0, `${name}(0)`);
			assert.equal(fn(1), 1, `${name}(1)`);
		}
	});

	it('backOut intentionally overshoots and is not a value easing', () => {
		const fn = resolveEasing('backOut');
		let overshoot = false;
		for (let i = 0; i <= 100; i++) {
			if (fn(i / 100) > 1.001) overshoot = true;
		}
		assert.ok(overshoot);
		assert.ok(!VALUE_EASINGS.includes('backOut'));
	});

	it('rejects unknown easing names', () => {
		assert.throws(() => resolveEasing('nope'), RangeError);
	});

	it('accepts a custom function', () => {
		const custom = t => t * t;
		assert.equal(resolveEasing(custom), custom);
	});

	it('reports reduced motion without throwing when matchMedia is absent', () => {
		assert.equal(prefersReducedMotion({}), false);
		assert.equal(prefersReducedMotion({ matchMedia: () => ({ matches: true }) }), true);
		const hostile = { get matchMedia() { throw new Error('blocked'); } };
		assert.equal(prefersReducedMotion(hostile), false);
	});

	it('exposes every easing in the map', () => {
		assert.deepEqual(Object.keys(EASINGS).sort(), ['backOut', 'cubicInOut', 'cubicOut', 'expoOut', 'linear', 'quadInOut', 'quartOut']);
	});
});

describe('tempo/tween', () => {
	describe('interpolation primitives', () => {
		it('lerps scalars', () => {
			assert.equal(lerp(0, 10, 0.5), 5);
			assert.equal(lerp(-5, 5, 0.25), -2.5);
		});

		it('interpolates equal-shape data in place', () => {
			const out = [[0, 0], [0, 0]];
			const from = [[0, 10], [100, 200]];
			const to = [[10, 20], [300, 400]];
			interpolateInto(out, from, to, 0.5);
			assert.deepEqual(out, [[5, 15], [200, 300]]);
		});

		it('never blends a null endpoint into a number', () => {
			const out = [[0, 0, 0], [0, 0, 0]];
			const from = [[1, 2, 3], [null, 10, null]];
			const to = [[4, 5, 6], [40, null, 70]];
			interpolateInto(out, from, to, 0.5);

			// cell 0: null -> 40 must be 40, not 20
			assert.equal(out[1][0], 40);
			// cell 1: 10 -> null must be null, not 5
			assert.equal(out[1][1], null);
			// cell 2: null -> 70 must be 70
			assert.equal(out[1][2], 70);
		});

		it('snaps to the target when shapes differ', () => {
			const out = [[0, 0, 0], [0, 0, 0]];
			const from = [[0, 0], [1, 2]];
			const to = [[0, 0, 0], [7, 8, 9]];
			interpolateInto(out, from, to, 0.3);
			assert.deepEqual(out, [[0, 0, 0], [7, 8, 9]]);
		});

		it('interpolates ranges and defers on non-finite input', () => {
			assert.deepEqual(interpolateRange([0, 100], [50, 200], 0.5), [25, 150]);
			assert.deepEqual(interpolateRange(null, [10, 20], 0.5), [10, 20]);
			// A non-finite endpoint defers to the target on that side only.
			assert.deepEqual(interpolateRange([NaN, 10], [5, 20], 0.5), [5, 15]);
		});
	});

	describe('Transition', () => {
		const mk = (n = 5) => {
			const xs = Array.from({ length: n }, (_, i) => i);
			return n;
		};

		it('tweens an equal-length payload and lands exactly on the target', () => {
			const tr = new Transition();
			const from = [[0, 1, 2], [0, 100, 200]];
			const to = [[0, 1, 2], [100, 200, 300]];

			tr.seed(from);

			let last = null;
			tr.start({
				data: to,
				duration: 100,
				easing: 'linear',
				onFrame: out => { last = out; },
			});

			assert.equal(tr.mode, 'values');
			run(tr, 4, 25);

			assert.equal(tr.active, false, 'should finish at 100ms');
			assert.deepEqual(last.slice(), [[0, 1, 2], [100, 200, 300]]);
			assert.equal(tr.frames, 4);
		});

		it('honours the duration: half-way progress is half-way value', () => {
			const tr = new Transition();
			tr.seed([[0, 1], [0, 0]]);

			let mid = null;
			tr.start({
				data: [[0, 1], [100, 200]],
				duration: 100,
				easing: 'linear',
				onFrame: out => { if (tr.progress === 0.5) mid = out.map(c => c.slice()); },
			});

			run(tr, 1, 50);

			assert.ok(mid, 'a frame should have been emitted at 50%');
			assert.equal(mid[1][0], 50);
		});

		it('drops to axes-only when the target length differs', () => {
			const tr = new Transition();
			tr.start({ data: [[0, 1, 2, 3], [1, 2, 3, 4]], duration: 100, onFrame: () => {} });
			tr.tick(10);
			tr.start({ data: [[0, 1], [9, 9]], duration: 100, onFrame: () => {} });
			assert.equal(tr.mode, 'axes-only');
		});

		it('interrupts by sampling the current visual state as the new origin', () => {
			const tr = new Transition();
			const a = [[0, 1], [0, 100]];
			const b = [[0, 1], [100, 200]];
			const c = [[0, 1], [0, 0]];

			tr.seed(a);
			tr.start({ data: b, duration: 100, easing: 'linear', onFrame: () => {} });
			tr.tick(50);

			const snapshot = tr.snapshot();
			assert.ok(snapshot);
			assert.ok(snapshot.data[1][0] > 0 && snapshot.data[1][0] < 100, 'mid-transition sample expected');

			tr.start({ data: c, duration: 100, easing: 'linear', onFrame: () => {} });
			tr.tick(1);

			// The new transition starts from ~50, not from 100 and not from 0.
			const v = tr.output[1][0];
			assert.ok(v > 30 && v < 70, `expected continuity near 50, got ${v}`);
		});

		it('completes instantly when duration is 0', () => {
			const tr = new Transition();
			let frame = null;
			let done = false;

			const r = tr.start({
				data: [[0], [42]],
				duration: 0,
				onFrame: out => { frame = out.map(c => c.slice()); },
				onDone: () => { done = true; },
			});

			assert.equal(r.mode, 'instant');
			assert.deepEqual(frame, [[0], [42]]);
			assert.equal(done, true);
			assert.equal(tr.active, false);
		});

		it('reuses its output buffer instead of allocating per frame', () => {
			const tr = new Transition();
			const to = [[0, 1, 2], [10, 20, 30]];
			const refs = [];

			tr.start({ data: to, duration: 100, onFrame: out => refs.push(out) });
			run(tr, 5, 20);

			assert.ok(refs.length >= 5);
			for (let i = 1; i < refs.length; i++)
				assert.equal(refs[i], refs[0], 'output array identity must be stable');
		});

		it('finish() lands on the target and fires onDone once', () => {
			const tr = new Transition();
			let doneCount = 0;
			tr.start({ data: [[0, 1], [5, 6]], duration: 1000, onFrame: () => {}, onDone: () => doneCount++ });
			tr.tick(10);
			tr.finish();
			assert.equal(doneCount, 1);
			assert.deepEqual(tr.output, [[0, 1], [5, 6]]);
			assert.equal(tr.active, false);
		});

		it('cancel() stops emitting without completing', () => {
			const tr = new Transition();
			let doneCount = 0;
			let frames = 0;
			tr.start({ data: [[0], [1]], duration: 1000, onFrame: () => frames++, onDone: () => doneCount++ });
			tr.tick(10);
			const before = frames;
			tr.cancel();
			tr.tick(10);
			assert.equal(frames, before);
			assert.equal(doneCount, 0);
		});

		it('reports per-frame timing statistics', () => {
			const tr = new Transition();
			tr.start({ data: [[0, 1], [1, 2]], duration: 50, onFrame: () => {} });
			run(tr, 5, 10);
			const s = tr.stats;
			assert.equal(s.frames, 5);
			assert.ok(s.maxFrameMs >= 0);
			assert.ok(s.meanFrameMs >= 0);
		});

		it('caps the payload it will tween and falls back to axes-only', () => {
			const tr = new Transition({ maxTweenPoints: 10 });
			const big = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], new Array(12).fill(1)];
			tr.start({ data: big, duration: 100, onFrame: () => {} });
			assert.equal(tr.mode, 'axes-only');
		});
	});
});
