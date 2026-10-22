/**
 * easing.js — normalised easing functions.
 *
 * Every function takes t in [0,1] and returns a progress value. Only
 * "monotone-ish" curves are offered for the value domain (cubicInOut, expoOut,
 * linear) because a curve that overshoots would make a series appear to exceed
 * a value it never reached — a visual lie. `backOut` is exported but is
 * deliberately excluded from `VALUE_EASINGS`; it is reserved for scale/axis
 * motion where overshoot reads as intended elasticity rather than wrong data.
 */

export const linear = t => t;

export const quadInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export const cubicOut = t => 1 - Math.pow(1 - t, 3);

export const cubicInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const expoOut = t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

export const quartOut = t => 1 - Math.pow(1 - t, 4);

export const backOut = t => {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const EASINGS = {
	linear,
	quadInOut,
	cubicOut,
	cubicInOut,
	expoOut,
	quartOut,
	backOut,
};

/** Curves that never leave [0,1]; safe for interpolating measured values. */
export const VALUE_EASINGS = ['linear', 'quadInOut', 'cubicOut', 'cubicInOut', 'expoOut', 'quartOut'];

export function resolveEasing(easing) {
	if (typeof easing === 'function')
		return easing;

	const fn = EASINGS[easing];
	if (typeof fn !== 'function')
		throw new RangeError(`Unknown easing "${easing}". Known: ${Object.keys(EASINGS).join(', ')}`);

	return fn;
}

/** Whether the host asks for reduced motion. Never throws outside a DOM. */
export function prefersReducedMotion(host = globalThis) {
	try {
		return !!host.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
	}
	catch {
		return false;
	}
}
