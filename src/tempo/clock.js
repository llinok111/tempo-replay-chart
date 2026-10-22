/**
 * clock.js — injectable time and frame scheduling.
 *
 * Every timing decision in Tempo goes through this module so that playback is
 * reproducible in tests. Production uses `requestAnimationFrame`; tests use a
 * manual scheduler and step it explicitly, which makes "play for 3 seconds"
 * a deterministic assertion instead of a sleep-and-hope.
 */

/** Real-time scheduler backed by rAF (falls back to timers in non-DOM hosts). */
export function createRafScheduler(host = globalThis) {
	const raf = host.requestAnimationFrame?.bind(host);
	const caf = host.cancelAnimationFrame?.bind(host);

	return {
		mode: 'raf',
		now: () => (host.performance?.now?.() ?? Date.now()),
		request(cb) {
			if (raf)
				return raf(cb);
			return host.setTimeout(() => cb(this.now()), 16);
		},
		cancel(id) {
			if (caf)
				caf(id);
			else
				host.clearTimeout(id);
		},
	};
}

/**
 * Manual scheduler for tests and for deterministic benchmark runs.
 * `step(ms)` advances virtual time by `ms` and fires exactly one frame.
 */
export function createManualScheduler(startTime = 0) {
	let t = startTime;
	let pending = null;
	let nextId = 1;

	const scheduler = {
		mode: 'manual',
		now: () => t,
		request(cb) {
			pending = { id: nextId++, cb };
			return pending.id;
		},
		cancel(id) {
			if (pending && pending.id === id)
				pending = null;
		},
		/** Advance virtual time and run the one scheduled frame. */
		step(ms) {
			t += ms;
			return scheduler.flush();
		},
		/** Advance virtual time by `ms` without running a frame. */
		advance(ms) {
			t += ms;
			return scheduler;
		},
		flush() {
			const p = pending;
			if (!p)
				return false;
			pending = null;
			p.cb(t);
			return true;
		},
		get pending() {
			return pending != null;
		},
	};

	return scheduler;
}

/**
 * Drive `cb(dtMs, nowMs)` on the scheduler until stopped.
 * `dt` is clamped so that a stalled tab (or a debugger pause) cannot teleport
 * playback forward by seconds — an important detail for readable animation.
 */
export function createFrameLoop(scheduler, cb, { maxDt = 100 } = {}) {
	let id = null;
	let last = null;
	let running = false;

	function frame(now) {
		if (!running)
			return;

		const dt = last == null ? 0 : Math.min(now - last, maxDt);
		last = now;

		cb(dt, now);

		if (running)
			id = scheduler.request(frame);
	}

	return {
		start() {
			if (running)
				return;
			running = true;
			last = null;
			id = scheduler.request(frame);
		},
		stop() {
			running = false;
			if (id != null) {
				scheduler.cancel(id);
				id = null;
			}
			last = null;
		},
		get running() {
			return running;
		},
	};
}
