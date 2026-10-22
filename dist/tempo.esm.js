/**
* Copyright (c) 2026, Leon Sorokin
* All rights reserved. (MIT Licensed)
*
* uPlot.js (μPlot)
* A small, fast chart for time series, lines, areas, ohlc & bars
* https://github.com/leeoniya/uPlot (v1.6.32)
*/

// src/utils.js
function closestIdx(num, arr, lo, hi) {
	let mid;
	lo = lo || 0;
	hi = hi || arr.length - 1;
	let bitwise = hi <= 2147483647;
	while (hi - lo > 1) {
		mid = bitwise ? lo + hi >> 1 : floor((lo + hi) / 2);
		if (arr[mid] < num) lo = mid;
		else hi = mid;
	}
	if (num - arr[lo] <= arr[hi] - num) return lo;
	return hi;
}
function makeIndexOfs(predicate) {
	let indexOfs = (data, _i0, _i1) => {
		let i0 = -1;
		let i1 = -1;
		for (let i = _i0; i <= _i1; i++) if (predicate(data[i])) {
			i0 = i;
			break;
		}
		for (let i = _i1; i >= _i0; i--) if (predicate(data[i])) {
			i1 = i;
			break;
		}
		return [i0, i1];
	};
	return indexOfs;
}
const notNullish = (v) => v != null;
const isPositive = (v) => v != null && v > 0;
const nonNullIdxs = makeIndexOfs(notNullish);
const positiveIdxs = makeIndexOfs(isPositive);
function getMinMax(data, _i0, _i1, sorted = 0, log = false) {
	let getEdgeIdxs = log ? positiveIdxs : nonNullIdxs;
	let predicate = log ? isPositive : notNullish;
	[_i0, _i1] = getEdgeIdxs(data, _i0, _i1);
	let _min = data[_i0];
	let _max = data[_i0];
	if (_i0 > -1) {
		if (sorted == 1) {
			_min = data[_i0];
			_max = data[_i1];
		} else if (sorted == -1) {
			_min = data[_i1];
			_max = data[_i0];
		} else for (let i = _i0; i <= _i1; i++) {
			let v = data[i];
			if (predicate(v)) {
				if (v < _min) _min = v;
				else if (v > _max) _max = v;
			}
		}
	}
	return [_min ?? Infinity, _max ?? -Infinity];
}
function getMinMaxAsinh(data, i0, i1, sorted = 0, cutoff = 0) {
	let _min = inf;
	let _max = -inf;
	let minAbs = inf;
	for (let i = i0; i <= i1; i++) {
		let v = data[i];
		if (v != null) {
			if (v < _min) _min = v;
			if (v > _max) _max = v;
			let a = abs(v);
			if (a > cutoff && a < minAbs) minAbs = a;
		}
	}
	return [
		_min,
		_max,
		minAbs
	];
}
function rangeLog(min, max, base, fullMags) {
	if (base == 2) fullMags = true;
	let minSign = sign(min);
	let maxSign = sign(max);
	if (min == max) {
		if (minSign == -1) {
			min *= base;
			max /= base;
		} else {
			min /= base;
			max *= base;
		}
	}
	let logFn = base == 10 ? log10 : log2;
	let growMinAbs = minSign == 1 ? floor : ceil;
	let growMaxAbs = maxSign == 1 ? ceil : floor;
	let minLogAbs = logFn(abs(min));
	let maxLogAbs = logFn(abs(max));
	let minExp = growMinAbs(minLogAbs);
	let maxExp = growMaxAbs(maxLogAbs);
	let minIncr = pow(base, minExp);
	let maxIncr = pow(base, maxExp);
	if (base == 10) {
		if (minExp < 0) minIncr = roundDec(minIncr, -minExp);
		if (maxExp < 0) maxIncr = roundDec(maxIncr, -maxExp);
	}
	if (fullMags) {
		min = minIncr * minSign;
		max = maxIncr * maxSign;
	} else {
		min = incrRoundDn(min, pow(base, floor(minLogAbs)), false);
		max = incrRoundUp(max, pow(base, floor(maxLogAbs)), false);
	}
	return [min, max];
}
function rangeAsinh(min, max, base, fullMags) {
	if (min == 0 && max == 0) return [-1, 1];
	let minMax = rangeLog(min, max, base, fullMags);
	if (min == 0) minMax[0] = 0;
	if (max == 0) minMax[1] = 0;
	return minMax;
}
const rangePad = .1;
const rangeZeroIf = .1;
function atMostWithEpsilon(value, limit) {
	return value <= limit || value - limit <= max(abs(value), abs(limit)) * Number.EPSILON * 2;
}
function rangeAnchors(dataMin, dataMax, softMin, softMax, zeroIf = rangeZeroIf) {
	zeroIf ??= rangeZeroIf;
	if (!isFinite$1(zeroIf) || zeroIf < 0) return [null, null];
	let minAnchor = softMin != null && dataMin >= softMin ? softMin : null;
	let maxAnchor = softMax != null && dataMax <= softMax ? softMax : null;
	let rawSpan = dataMax - dataMin;
	if (zeroIf > 0) {
		if (minAnchor == null && dataMin >= 0 && atMostWithEpsilon(dataMin, rawSpan * zeroIf)) minAnchor = 0;
		if (maxAnchor == null && dataMax <= 0 && atMostWithEpsilon(-dataMax, rawSpan * zeroIf)) maxAnchor = 0;
	}
	if (dataMin == 0 && dataMax == 0 && minAnchor == 0 && maxAnchor == 0) {
		if (softMax === 0 && softMin !== 0) minAnchor = null;
		else maxAnchor = null;
	}
	return [minAnchor, maxAnchor];
}
const autoRangePart = { pad: rangePad };
const _eqRangePart = { pad: 0 };
const _eqRange = {
	zeroIf: rangeZeroIf,
	min: _eqRangePart,
	max: _eqRangePart
};
function rangeNum(_min, _max, mult, zeroAffinity) {
	if (isObj(mult)) return _rangeNum(_min, _max, mult);
	_eqRangePart.pad = mult;
	_eqRange.zeroIf = zeroAffinity ? rangeZeroIf : 0;
	return _rangeNum(_min, _max, _eqRange);
}
function hasData(data, idx0, idx1) {
	idx0 ??= 0;
	idx1 ??= data.length - 1;
	while (idx0 <= idx1) {
		if (data[idx0] != null) return true;
		idx0++;
	}
	return false;
}
function _rangeNum(_min, _max, cfg) {
	let cmin = cfg.min ?? autoRangePart;
	let cmax = cfg.max ?? autoRangePart;
	let zeroIf = cfg.zeroIf ?? .1;
	if (!isFinite$1(zeroIf) || zeroIf < 0) return [null, null];
	let padMin = cmin.pad ?? .1;
	let padMax = cmax.pad ?? .1;
	let hardMin = cmin.hard ?? -Infinity;
	let hardMax = cmax.hard ?? Infinity;
	let [minAnchor, maxAnchor] = rangeAnchors(_min, _max, cmin.soft, cmax.soft, zeroIf);
	let delta = _max - _min;
	let scalarMax = max(abs(_min), abs(_max));
	let flat = scalarMax * (cfg.flat ?? 1e-7);
	if (delta < 1e-24 || delta <= flat) {
		if (delta > 0 && delta <= flat) {
			_min = _max = incrRound(_min + delta / 2, pow10(floor(log10(flat))));
			scalarMax = abs(_min);
		}
		delta = 0;
	}
	let nonZeroDelta = delta || scalarMax || 1e3;
	let mag = log10(nonZeroDelta);
	let incr = pow10(floor(mag) - 1);
	let _padMin = nonZeroDelta * (delta == 0 ? _min == 0 ? .1 : 1 : padMin);
	let _newMin = incrRoundDn(_min - _padMin, incr);
	let minLim = min(hardMax, max(hardMin, minAnchor ?? _newMin));
	let _padMax = nonZeroDelta * (delta == 0 ? _max == 0 ? .1 : 1 : padMax);
	let _newMax = incrRoundUp(_max + _padMax, incr);
	let maxLim = max(hardMin, min(hardMax, maxAnchor ?? _newMax));
	if (minLim == maxLim) {
		if (minLim == 0) {
			if (hardMax == 0) {
				if (hardMin == 0) return [null, null];
				minLim = -100;
			} else maxLim = 100;
		} else if (minLim < 0) {
			minLim *= 2;
			maxLim = 0;
		} else {
			minLim = 0;
			maxLim *= 2;
		}
	}
	return [max(hardMin, minLim), min(hardMax, maxLim)];
}
const numFormatter = new Intl.NumberFormat();
const fmtNum = (val) => numFormatter.format(val);
const M = Math;
const rand = M.random;
const PI = M.PI;
const abs = M.abs;
const floor = M.floor;
const round = M.round;
const ceil = M.ceil;
const min = M.min;
const max = M.max;
const pow = M.pow;
const sqrt = M.sqrt;
const cos = M.cos;
const sin = M.sin;
const sign = M.sign;
const log10 = M.log10;
const log2 = M.log2;
const sinh = (v, linthresh = 1) => M.sinh(v) * linthresh;
const asinh = (v, linthresh = 1) => M.asinh(v / linthresh);
const inf = Infinity;
const isFinite$1 = Number.isFinite;
const decPows = Array.from({ length: 65 }, (_, i) => +`1e${i - 32}`);
const pow10 = (exp) => decPows[exp + 32] ?? +`1e${exp}`;
function clamp(num, _min, _max) {
	return min(max(num, _min), _max);
}
function isFn(v) {
	return typeof v == "function";
}
function fnOrSelf(v) {
	return isFn(v) ? v : () => v;
}
const noop = () => {};
const retArg0 = (_0) => _0;
const retArg1 = (_0, _1) => _1;
const retNull = (_) => null;
const retTrue = (_) => true;
const retEq = (a, b) => a == b;
function roundIncr(num, incr, mode) {
	let q = num / incr;
	if (abs(q) >= 0x38d7ea4c68000) return num;
	let dec = fixedDec.get(incr);
	if (dec == null) fixedDec.set(incr, dec = guessDec(incr));
	let nearest = round(q);
	let candidate = roundDec(nearest * incr, dec);
	if (candidate == num || abs(candidate - num) <= min(abs(incr) * 1e-7, abs(num) * Number.EPSILON * 2)) return candidate;
	let index;
	if (mode == roundDec) {
		let whole = floor(abs(q));
		let midpoint = roundDec((whole + .5) * abs(incr), dec + 1);
		index = sign(q) * (whole + (abs(num) >= midpoint ? 1 : 0));
	} else index = mode(q);
	return index == nearest ? candidate : roundDec(index * incr, dec);
}
function incrRound(num, incr, _fixFloat = true) {
	return _fixFloat ? roundIncr(num, incr, roundDec) : roundDec(num / incr) * incr;
}
function incrRoundUp(num, incr, _fixFloat = true) {
	return _fixFloat ? roundIncr(num, incr, ceil) : ceil(num / incr) * incr;
}
function incrRoundDn(num, incr, _fixFloat = true) {
	return _fixFloat ? roundIncr(num, incr, floor) : floor(num / incr) * incr;
}
function roundDec(val, dec = 0) {
	if (isInt(val)) return val;
	let p = pow10(dec);
	let n = abs(val) * p;
	if (dec > 0 && (n >= 0x38d7ea4c68000 || dec > 32)) return val;
	let int = floor(n);
	let midpoint = (int + .5) / p;
	if (dec > 22 && abs(n - int - .5) <= n * Number.EPSILON * 2) midpoint = +midpoint.toFixed(dec + 1);
	let result = sign(val) * (int + (abs(val) >= midpoint ? 1 : 0)) / p;
	return dec > 22 ? +result.toFixed(dec) : result;
}
const fixedDec = /* @__PURE__ */ new Map();
function guessDec(num) {
	if (isInt(num)) return 0;
	let str = "" + num;
	let dot = str.indexOf(".");
	let exp = str.indexOf("e");
	let dec = dot < 0 ? 0 : (exp < 0 ? str.length : exp) - dot - 1;
	return max(0, dec - (exp < 0 ? 0 : +str.slice(exp + 1)));
}
function numDec(splits) {
	let dec = 0;
	for (let v of splits) if (v != null) dec = max(dec, guessDec(v));
	return dec;
}
function genIncrs(base, minExp, maxExp, mults) {
	let incrs = [];
	let multDec = mults.map(guessDec);
	for (let exp = minExp; exp < maxExp; exp++) {
		let expa = abs(exp);
		let mag = base == 10 ? 0 : pow(base, exp);
		for (let i = 0; i < mults.length; i++) {
			let incr = base == 10 ? +`${mults[i]}e${exp}` : mults[i] * mag;
			let dec = base == 10 ? max(0, multDec[i] - exp) : (exp >= 0 ? 0 : expa) + (exp >= multDec[i] ? 0 : multDec[i]);
			incrs.push(incr);
			fixedDec.set(incr, dec);
		}
	}
	return incrs;
}
const EMPTY_OBJ = {};
const EMPTY_ARR = [];
const nullNullTuple = [null, null];
const isArr = Array.isArray;
const isInt = Number.isInteger;
const isUndef = (v) => v === void 0;
function isStr(v) {
	return typeof v == "string";
}
function isObj(v) {
	let is = false;
	if (v != null) {
		let c = v.constructor;
		is = c == null || c == Object;
	}
	return is;
}
function fastIsObj(v) {
	return v != null && typeof v == "object";
}
const TypedArray = Object.getPrototypeOf(Uint8Array);
const __proto__ = "__proto__";
function copy(o, _isObj = isObj) {
	let out;
	if (isArr(o)) {
		let val = o.find((v) => v != null);
		if (isArr(val) || _isObj(val)) {
			out = Array(o.length);
			for (let i = 0; i < o.length; i++) out[i] = copy(o[i], _isObj);
		} else out = o.slice();
	} else if (o instanceof TypedArray) out = o.slice();
	else if (_isObj(o)) {
		out = {};
		for (let k in o) if (k != __proto__) out[k] = copy(o[k], _isObj);
	} else out = o;
	return out;
}
function assign(targ) {
	let args = arguments;
	for (let i = 1; i < args.length; i++) {
		let src = args[i];
		for (let key in src) if (key != __proto__) {
			if (isObj(targ[key])) assign(targ[key], copy(src[key]));
			else targ[key] = copy(src[key]);
		}
	}
	return targ;
}
const NULL_REMOVE = 0;
const NULL_RETAIN = 1;
const NULL_EXPAND = 2;
function nullExpand(yVals, nullIdxs, alignedLen) {
	for (let i = 0, xi, lastNullIdx = -1; i < nullIdxs.length; i++) {
		let nullIdx = nullIdxs[i];
		if (nullIdx > lastNullIdx) {
			xi = nullIdx - 1;
			while (xi >= 0 && yVals[xi] == null) yVals[xi--] = null;
			xi = nullIdx + 1;
			while (xi < alignedLen && yVals[xi] == null) yVals[lastNullIdx = xi++] = null;
		}
	}
}
function mergeXVals(tables) {
	let xRows = tables.map((t) => t[0]);
	while (xRows.length > 1) {
		let merged = [];
		for (let ti = 0; ti < xRows.length; ti += 2) {
			if (ti == xRows.length - 1) {
				merged.push(xRows[ti]);
				continue;
			}
			let xs0 = xRows[ti];
			let xs1 = xRows[ti + 1];
			let xs = [];
			let i0 = 0;
			let i1 = 0;
			while (i0 < xs0.length && i1 < xs1.length) {
				if (xs0[xs0.length - 1] < xs1[i1]) {
					while (i0 < xs0.length) xs.push(xs0[i0++]);
					break;
				}
				if (xs1[xs1.length - 1] < xs0[i0]) {
					while (i1 < xs1.length) xs.push(xs1[i1++]);
					break;
				}
				let x0 = xs0[i0];
				let x1 = xs1[i1];
				if (x0 < x1) {
					xs.push(x0);
					i0++;
				} else if (x0 > x1) {
					xs.push(x1);
					i1++;
				} else {
					xs.push(x0);
					i0++;
					i1++;
				}
			}
			while (i0 < xs0.length) xs.push(xs0[i0++]);
			while (i1 < xs1.length) xs.push(xs1[i1++]);
			merged.push(xs);
		}
		xRows = merged;
	}
	return xRows[0] ?? [];
}
function join(tables, nullModes) {
	if (allHeadersSame(tables)) {
		let table = tables[0].slice();
		for (let i = 1; i < tables.length; i++) table.push(...tables[i].slice(1));
		if (!isAsc(table[0])) table = sortCols(table);
		return table;
	}
	tables = tables.map((table) => isAsc(table[0]) ? table : sortCols(table));
	let aligned = mergeXVals(tables);
	let xIdxs = /* @__PURE__ */ new Map();
	for (let i = 0; i < aligned.length; i++) xIdxs.set(aligned[i], i);
	let data = [aligned];
	let alignedLen = aligned.length;
	for (let ti = 0; ti < tables.length; ti++) {
		let t = tables[ti];
		let xs = t[0];
		let alignedIdxs = t.length > 2 ? Array(xs.length) : null;
		if (alignedIdxs != null) for (let i = 0; i < xs.length; i++) alignedIdxs[i] = xIdxs.get(xs[i]);
		for (let si = 1; si < t.length; si++) {
			let ys = t[si];
			let yVals = Array(alignedLen).fill(void 0);
			let nullMode = nullModes ? nullModes[ti][si] : NULL_RETAIN;
			let nullIdxs = [];
			for (let i = 0; i < ys.length; i++) {
				let yVal = ys[i];
				let alignedIdx = alignedIdxs == null ? xIdxs.get(xs[i]) : alignedIdxs[i];
				if (yVal === null) {
					if (nullMode != NULL_REMOVE) {
						yVals[alignedIdx] = yVal;
						if (nullMode == NULL_EXPAND) nullIdxs.push(alignedIdx);
					}
				} else yVals[alignedIdx] = yVal;
			}
			nullExpand(yVals, nullIdxs, alignedLen);
			data.push(yVals);
		}
	}
	return data;
}
const microTask = typeof queueMicrotask == "undefined" ? (fn) => Promise.resolve().then(fn) : queueMicrotask;
function sortCols(table) {
	let head = table[0];
	let rlen = head.length;
	let idxs = Array(rlen);
	for (let i = 0; i < idxs.length; i++) idxs[i] = i;
	idxs.sort((i0, i1) => head[i0] - head[i1]);
	let table2 = [];
	for (let i = 0; i < table.length; i++) {
		let row = table[i];
		let row2 = Array(rlen);
		for (let j = 0; j < rlen; j++) row2[j] = row[idxs[j]];
		table2.push(row2);
	}
	return table2;
}
function allHeadersSame(tables) {
	let vals0 = tables[0][0];
	let len0 = vals0.length;
	for (let i = 1; i < tables.length; i++) {
		let vals1 = tables[i][0];
		if (vals1.length != len0) return false;
		if (vals1 != vals0) {
			for (let j = 0; j < len0; j++) if (vals1[j] != vals0[j]) return false;
		}
	}
	return true;
}
function isAsc(vals, samples = 100) {
	const len = vals.length;
	if (len <= 1) return true;
	let firstIdx = 0;
	let lastIdx = len - 1;
	while (firstIdx <= lastIdx && vals[firstIdx] == null) firstIdx++;
	while (lastIdx >= firstIdx && vals[lastIdx] == null) lastIdx--;
	if (lastIdx <= firstIdx) return true;
	const stride = max(1, floor((lastIdx - firstIdx + 1) / samples));
	for (let prevVal = vals[firstIdx], i = firstIdx + stride; i <= lastIdx; i += stride) {
		const v = vals[i];
		if (v != null) {
			if (v <= prevVal) return false;
			prevVal = v;
		}
	}
	return true;
}

// src/strings.js
const WIDTH = "width";
const HEIGHT = "height";
const BOTTOM = "bottom";
const LEFT = "left";
const RIGHT = "right";
const hexBlack = "#000";
const transparent = "#0000";
const mousemove = "mousemove";
const mousedown = "mousedown";
const mouseup = "mouseup";
const mouseenter = "mouseenter";
const mouseleave = "mouseleave";
const dblclick = "dblclick";
const resize = "resize";
const scroll = "scroll";
const change = "change";
const dppxchange = "dppxchange";

// src/domClasses.js
const UPLOT = "uplot";
const ORI_HZ = "u-hz";
const ORI_VT = "u-vt";
const TITLE = "u-title";
const WRAP = "u-wrap";
const UNDER = "u-under";
const OVER = "u-over";
const AXIS = "u-axis";
const OFF = "u-off";
const SELECT = "u-select";
const CURSOR_X = "u-cursor-x";
const CURSOR_Y = "u-cursor-y";
const CURSOR_PT = "u-cursor-pt";
const LEGEND = "u-legend";
const LEGEND_EXCLUDE = "u-excl";
const LEGEND_SIDES = [
	"u-top",
	"u-rgt",
	"u-btm",
	"u-lft"
];
const LEGEND_LIVE = "u-live";
const LEGEND_INLINE = "u-inline";
const LEGEND_SERIES = "u-series";
const LEGEND_MARKER = "u-marker";
const LEGEND_LABEL = "u-label";
const LEGEND_VALUE = "u-value";

// src/dom.js
const domEnv = typeof window != "undefined";
const doc = domEnv ? document : null;
const win = domEnv ? window : null;
let pxRatio;
let query;
function setPxRatio() {
	let _pxRatio = devicePixelRatio;
	if (pxRatio != _pxRatio) {
		pxRatio = _pxRatio;
		query && off("change", query, setPxRatio);
		query = matchMedia(`(min-resolution: ${pxRatio - .001}dppx) and (max-resolution: ${pxRatio + .001}dppx)`);
		on(change, query, setPxRatio);
		win.dispatchEvent(new CustomEvent(dppxchange));
	}
}
function addClass(el, c) {
	if (c != null) {
		let cl = el.classList;
		!cl.contains(c) && cl.add(c);
	}
}
function remClass(el, c) {
	let cl = el.classList;
	cl.contains(c) && cl.remove(c);
}
function setStylePx(el, name, value) {
	el.style[name] = value + "px";
}
function placeTag(tag, cls, targ, refEl) {
	let el = doc.createElement(tag);
	if (cls != null) addClass(el, cls);
	targ?.insertBefore(el, refEl);
	return el;
}
function placeDiv(cls, targ) {
	return placeTag("div", cls, targ);
}
const xformCache = /* @__PURE__ */ new WeakMap();
function elTrans(el, xPos, yPos, xMax, yMax, off) {
	let xform = "translate(" + xPos + "px," + yPos + "px)";
	let xformOld = xformCache.get(el);
	if (xform != xformOld) {
		el.style.transform = xform;
		xformCache.set(el, xform);
	}
	if (xform != xformOld || off != null) {
		if (off ?? (xPos < 0 || yPos < 0 || xPos > xMax || yPos > yMax)) addClass(el, OFF);
		else remClass(el, OFF);
	}
}
const colorCache = /* @__PURE__ */ new WeakMap();
function elColor(el, background, borderColor) {
	let newColor = background + borderColor;
	if (newColor != colorCache.get(el)) {
		colorCache.set(el, newColor);
		el.style.background = background;
		el.style.borderColor = borderColor;
	}
}
const sizeCache = /* @__PURE__ */ new WeakMap();
function elSize(el, newWid, newHgt, centered) {
	let newSize = newWid + "" + newHgt;
	if (newSize != sizeCache.get(el)) {
		sizeCache.set(el, newSize);
		el.style.height = newHgt + "px";
		el.style.width = newWid + "px";
		el.style.marginLeft = centered ? -newWid / 2 + "px" : 0;
		el.style.marginTop = centered ? -newHgt / 2 + "px" : 0;
	}
}
const evOpts = { passive: true };
const evOpts2 = {
	...evOpts,
	capture: true
};
function on(ev, el, cb, capt) {
	el.addEventListener(ev, cb, capt ? evOpts2 : evOpts);
}
function off(ev, el, cb, capt) {
	el.removeEventListener(ev, cb, capt ? evOpts2 : evOpts);
}
domEnv && setPxRatio();

// src/fmtDate.js
const months = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December"
];
const days = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday"
];
function slice3(str) {
	return str.slice(0, 3);
}
const days3 = true && days.map(slice3);
const engNames = {
	MMMM: months,
	MMM: true && months.map(slice3),
	WWWW: days,
	WWW: days3
};
function zeroPad2(int) {
	return (int < 10 ? "0" : "") + int;
}
function zeroPad3(int) {
	return (int < 10 ? "00" : int < 100 ? "0" : "") + int;
}
const subs = {
	YYYY: (d) => d.getFullYear(),
	YY: (d) => (d.getFullYear() + "").slice(2),
	MMMM: (d, names) => names.MMMM[d.getMonth()],
	MMM: (d, names) => names.MMM[d.getMonth()],
	MM: (d) => zeroPad2(d.getMonth() + 1),
	M: (d) => d.getMonth() + 1,
	DD: (d) => zeroPad2(d.getDate()),
	D: (d) => d.getDate(),
	WWWW: (d, names) => names.WWWW[d.getDay()],
	WWW: (d, names) => names.WWW[d.getDay()],
	HH: (d) => zeroPad2(d.getHours()),
	H: (d) => d.getHours(),
	h: (d) => {
		let h = d.getHours();
		return h == 0 ? 12 : h > 12 ? h - 12 : h;
	},
	AA: (d) => d.getHours() >= 12 ? "PM" : "AM",
	aa: (d) => d.getHours() >= 12 ? "pm" : "am",
	a: (d) => d.getHours() >= 12 ? "p" : "a",
	mm: (d) => zeroPad2(d.getMinutes()),
	m: (d) => d.getMinutes(),
	ss: (d) => zeroPad2(d.getSeconds()),
	s: (d) => d.getSeconds(),
	fff: (d) => zeroPad3(d.getMilliseconds())
};
function fmtDate(tpl, names) {
	names = names || engNames;
	let parts = [];
	let R = /\{([a-z]+)\}|[^{]+/gi, m;
	while (m = R.exec(tpl)) parts.push(m[0][0] == "{" ? subs[m[1]] : m[0]);
	return (d) => {
		let out = "";
		for (let i = 0; i < parts.length; i++) out += typeof parts[i] == "string" ? parts[i] : parts[i](d, names);
		return out;
	};
}
const localTz = new Intl.DateTimeFormat().resolvedOptions().timeZone;
function tzDate(dateOrTs, tz) {
	if (tz == null || tz == localTz) return typeof dateOrTs == "number" ? new Date(dateOrTs) : dateOrTs;
	let d = new DateZoned(dateOrTs);
	d.setTimeZone(tz);
	return d;
}
const twoDigit = "2-digit";
const fmtrOpts = {
	weekday: "short",
	year: "numeric",
	month: twoDigit,
	day: twoDigit,
	hour: twoDigit,
	minute: twoDigit,
	second: twoDigit,
	fractionalSecondDigits: 3,
	timeZoneName: "longOffset"
};
const tzFmt = {};
function getFormatter(tz) {
	return tzFmt[tz] ??= new Intl.DateTimeFormat("sv", {
		...fmtrOpts,
		timeZone: tz
	}).format;
}
var DateZoned = class DateZoned extends Date {
	tz = null;
	#utc = false;
	#str = null;
	constructor(...args) {
		super(...args);
		if (args[0] instanceof DateZoned) {
			this.tz = args[0].tz;
			this.#str = args[0].#str;
			this.#utc = args[0].#utc;
		}
	}
	#get(utcMeth, locMeth, fr, to, add = 0) {
		let s = this.#str;
		return this.#utc ? utcMeth.call(this) : s == null ? locMeth.call(this) : Number(s.slice(fr, to)) + add;
	}
	setTimeZone(tz) {
		this.tz = tz;
		if (tz == "UTC" || tz == "Etc/UTC") this.#utc = true;
		else {
			let f = getFormatter(tz)(this);
			if (f.endsWith("GMT")) f += "+00:00";
			this.#str = f;
		}
	}
	getFullYear() {
		return this.#get(this.getUTCFullYear, super.getFullYear, -33, -29);
	}
	getMonth() {
		return this.#get(this.getUTCMonth, super.getMonth, -28, -26, -1);
	}
	getDate() {
		return this.#get(this.getUTCDate, super.getDate, -25, -23);
	}
	getHours() {
		return this.#get(this.getUTCHours, super.getHours, -22, -20);
	}
	getMinutes() {
		return this.#get(this.getUTCMinutes, super.getMinutes, -19, -17);
	}
	getSeconds() {
		return this.#get(this.getUTCSeconds, super.getSeconds, -16, -14);
	}
	getMilliseconds() {
		return this.#get(this.getUTCMilliseconds, super.getMilliseconds, -13, -10);
	}
	getDay() {
		let s = this.#str;
		return this.#utc ? this.getUTCDay() : s == null ? super.getDay() : s[0] == "s" ? 0 : s[0] == "m" ? 1 : s[1] == "i" ? 2 : s[0] == "o" ? 3 : s[1] == "o" ? 4 : s[0] == "f" ? 5 : s[0] == "l" ? 6 : -1;
	}
	getTimezoneOffset() {
		let s = this.#str;
		return this.#utc ? 0 : s == null ? super.getTimezoneOffset() : (60 * Number(s.slice(-5, -3)) + Number(s.slice(-2))) * (s.at(-6) == "-" ? -1 : 1);
	}
};
function getDayOfYear(date) {
	let y = date.getFullYear();
	let m = date.getMonth() + 1;
	let d = date.getDate();
	return --m * 31 - (m > 1 ? (1054267675 >> m * 3 - 6 & 7) - (y & 3 || !(y % 25) && y & 15 ? 0 : 1) : 0) + d;
}
const PERIOD_MONTH = 4;
const PERIOD_YEAR = 5;
function floorSOP(dz, per) {
	let ts2 = dz.getTime() - (dz.getMilliseconds() + dz.getSeconds() * 1e3 + dz.getMinutes() * 60 * 1e3 + dz.getHours() * 3600 * 1e3 + (per == 4 ? dz.getDate() - 1 : per == 5 ? getDayOfYear(dz) - 1 : 0) * 24 * 3600 * 1e3);
	let dz2 = tzDate(ts2, dz.tz);
	let h2 = dz2.getHours();
	if (h2 > 0) dz2 = tzDate(ts2 + (h2 > 12 ? 24 - h2 : -h2) * 3600 * 1e3, dz.tz);
	return dz2;
}

// src/opts.js
const onlyWhole = (v) => v % 1 == 0;
const allMults = [
	1,
	2,
	2.5,
	5
];
const decIncrs = genIncrs(10, -32, 0, allMults);
const oneIncrs = genIncrs(10, 0, 32, allMults);
const wholeIncrs = oneIncrs.filter(onlyWhole);
const numIncrs = decIncrs.concat(oneIncrs);
const NL = "\n";
const yyyy = "{YYYY}";
const NLyyyy = NL + yyyy;
const md = "{M}/{D}";
const NLmd = NL + md;
const NLmdyy = NLmd + "/{YY}";
const aa = "{aa}";
const hmmaa = "{h}:{mm}" + aa;
const NLhmmaa = NL + hmmaa;
const ss = ":{ss}";
const _ = null;
function genTimeStuffs(ms) {
	let s = ms * 1e3, m = s * 60, h = m * 60, d = h * 24, mo = d * 30, y = d * 365;
	let timeIncrs = (ms == 1 ? genIncrs(10, 0, 3, allMults).filter(onlyWhole) : genIncrs(10, -3, 0, allMults)).concat([
		s,
		s * 5,
		s * 10,
		s * 15,
		s * 30,
		m,
		m * 5,
		m * 10,
		m * 15,
		m * 30,
		h,
		h * 2,
		h * 3,
		h * 4,
		h * 6,
		h * 8,
		h * 12,
		d,
		d * 2,
		d * 3,
		d * 4,
		d * 5,
		d * 6,
		d * 7,
		d * 8,
		d * 9,
		d * 10,
		d * 15,
		mo,
		mo * 2,
		mo * 3,
		mo * 4,
		mo * 6,
		y,
		y * 2,
		y * 5,
		y * 10,
		y * 25,
		y * 50,
		y * 100
	]);
	const _timeAxisStamps = [
		[
			y,
			yyyy,
			_,
			_,
			_,
			_,
			_,
			_,
			1
		],
		[
			d * 28,
			"{MMM}",
			NLyyyy,
			_,
			_,
			_,
			_,
			_,
			1
		],
		[
			d,
			md,
			NLyyyy,
			_,
			_,
			_,
			_,
			_,
			1
		],
		[
			h,
			"{h}" + aa,
			NLmdyy,
			_,
			NLmd,
			_,
			_,
			_,
			1
		],
		[
			m,
			hmmaa,
			NLmdyy,
			_,
			NLmd,
			_,
			_,
			_,
			1
		],
		[
			s,
			ss,
			NLmdyy + " " + hmmaa,
			_,
			NLmd + " " + hmmaa,
			_,
			NLhmmaa,
			_,
			1
		],
		[
			ms,
			ss + ".{fff}",
			NLmdyy + " " + hmmaa,
			_,
			NLmd + " " + hmmaa,
			_,
			NLhmmaa,
			_,
			1
		]
	];
	function timeAxisSplits(tzDate) {
		return (self, axisIdx, scaleMin, scaleMax, foundIncr, foundSpace) => {
			let nice = self.axes[axisIdx].nice;
			let splits = [];
			let isYr = foundIncr >= y;
			let isMo = foundIncr >= mo && foundIncr < y;
			let isDays = foundIncr >= d && foundIncr < mo;
			let isHours = foundIncr > h && foundIncr < d;
			let minDate = tzDate(scaleMin);
			let minDateTs = roundDec(minDate * ms, 3);
			let minMin = floorSOP(minDate, isYr || isMo ? 5 : isDays ? 4 : 3);
			let minMinTs = roundDec(minMin * ms, 3);
			if (isDays) {
				let incrDays = foundIncr / d;
				let skip = floor((minDate.getDate() - 1) / incrDays);
				let split = minMinTs + foundIncr * skip;
				do {
					let date = tzDate(split);
					let hour = date.getHours();
					if (hour != 0) {
						split += hour > 12 ? h : -h;
						date = tzDate(split);
					}
					if (nice.first && (date.getDate() - 1) % incrDays > 0) {
						date = floorSOP(date, 4);
						split = date.getTime() * ms;
						if (split - splits[splits.length - 1] < foundIncr * .7) splits.pop();
					}
					if (split > scaleMax) break;
					if (split >= scaleMin) splits.push(split);
					split += foundIncr;
				} while (1);
			} else if (isMo || isYr) {
				let subIncrs = 1;
				let subIncrDays = 1;
				let periodType = 0;
				let periodMin = 0;
				if (isMo) {
					subIncrs = foundIncr / mo;
					subIncrDays = 32;
					periodType = 4;
					periodMin = minDate.getMonth();
				} else if (isYr) {
					subIncrs = foundIncr / y;
					subIncrDays = 366;
					periodType = 5;
					periodMin = minDate.getYear();
				}
				foundIncr = subIncrs * subIncrDays * d;
				let skip = floor(periodMin / subIncrDays);
				let split = minMinTs + foundIncr * skip;
				do {
					split = floorSOP(tzDate(split), periodType).getTime() * ms;
					if (split > scaleMax) break;
					if (split >= scaleMin) splits.push(split);
					split += foundIncr;
				} while (1);
			} else if (isHours) {
				let incrHours = foundIncr / h;
				let skip = floor(minDate.getHours() / incrHours);
				let split = minMinTs + foundIncr * skip;
				do {
					let hour = tzDate(split).getHours();
					if (nice.dst && hour % incrHours > 0) {
						let hour2 = tzDate(split - h).getHours();
						split += hour2 % incrHours == 0 ? -h : h;
					}
					if (split > scaleMax) break;
					if (split >= scaleMin) splits.push(split);
					split += foundIncr;
				} while (1);
			} else {
				let split = minMinTs + incrRoundUp(minDateTs - minMinTs, foundIncr);
				do {
					if (split > scaleMax) break;
					if (split >= scaleMin) splits.push(split);
					split += foundIncr;
				} while (1);
			}
			return splits;
		};
	}
	return [
		timeIncrs,
		_timeAxisStamps,
		timeAxisSplits
	];
}
const [timeIncrsMs, _timeAxisStampsMs, timeAxisSplitsMs] = true && genTimeStuffs(1);
const [timeIncrsS, _timeAxisStampsS, timeAxisSplitsS] = true && genTimeStuffs(.001);
genIncrs(2, -53, 53, [1]);
function timeAxisStamps(stampCfg, fmtDate) {
	return stampCfg.map((s) => s.map((v, i) => i == 0 || i == 8 || v == null ? v : fmtDate(i == 1 || s[8] == 0 ? v : s[1] + v)));
}
function timeAxisVals(tzDate, stamps) {
	return (self, splits, axisIdx, foundSpace, foundIncr) => {
		let s = stamps.find((s) => foundIncr >= s[0]) || stamps[stamps.length - 1];
		let prevYear;
		let prevMnth;
		let prevDate;
		let prevHour;
		let prevMins;
		let prevSecs;
		return splits.map((split) => {
			let date = tzDate(split);
			let newYear = date.getFullYear();
			let newMnth = date.getMonth();
			let newDate = date.getDate();
			let newHour = date.getHours();
			let newMins = date.getMinutes();
			let newSecs = date.getSeconds();
			let stamp = newYear != prevYear && s[2] || newMnth != prevMnth && s[3] || newDate != prevDate && s[4] || newHour != prevHour && s[5] || newMins != prevMins && s[6] || newSecs != prevSecs && s[7] || s[1];
			prevYear = newYear;
			prevMnth = newMnth;
			prevDate = newDate;
			prevHour = newHour;
			prevMins = newMins;
			prevSecs = newSecs;
			return stamp(date);
		});
	};
}
function timeAxisVal(tzDate, dateTpl) {
	let stamp = fmtDate(dateTpl);
	return (self, splits, axisIdx, foundSpace, foundIncr) => splits.map((split) => stamp(tzDate(split)));
}
function timeSeriesStamp(stampCfg, fmtDate) {
	return fmtDate(stampCfg);
}
const _timeSeriesStamp = "{YYYY}-{MM}-{DD} {h}:{mm}{aa}";
function timeSeriesVal(tzDate, stamp) {
	return (self, val, seriesIdx, dataIdx) => dataIdx == null ? "--" : stamp(tzDate(val));
}
function legendStroke(self, seriesIdx) {
	let s = self.series[seriesIdx];
	return s.width ? s.stroke(self, seriesIdx) : s.points.width ? s.points.stroke(self, seriesIdx) : null;
}
function legendFill(self, seriesIdx) {
	return self.series[seriesIdx].fill(self, seriesIdx);
}
const legendOpts = {
	show: true,
	live: true,
	mode: null,
	side: 2,
	isolate: false,
	filter: null,
	sort: null,
	limit: null,
	mount: noop,
	markers: {
		show: true,
		width: 2,
		stroke: legendStroke,
		fill: legendFill,
		dash: "solid"
	},
	idx: null,
	idxs: null,
	values: []
};
function cursorPointShow(self, si) {
	let o = self.cursor.points;
	let pt = placeDiv();
	let size = o.size(self, si);
	setStylePx(pt, WIDTH, size);
	setStylePx(pt, HEIGHT, size);
	let mar = size / -2;
	setStylePx(pt, "marginLeft", mar);
	setStylePx(pt, "marginTop", mar);
	let width = o.width(self, si, size);
	width && setStylePx(pt, "borderWidth", width);
	return pt;
}
function cursorPointFill(self, si) {
	let sp = self.series[si].points;
	return sp._fill || sp._stroke;
}
function cursorPointStroke(self, si) {
	let sp = self.series[si].points;
	return sp._stroke || sp._fill;
}
function cursorPointSize(self, si) {
	return self.series[si].points.size;
}
const moveTuple = [0, 0];
function cursorMove(self, mouseLeft1, mouseTop1) {
	moveTuple[0] = mouseLeft1;
	moveTuple[1] = mouseTop1;
	return moveTuple;
}
function filtBtn0(self, targ, handle, onlyTarg = true) {
	return (e) => {
		e.button == 0 && (!onlyTarg || e.target == targ) && handle(e);
	};
}
function filtTarg(self, targ, handle, onlyTarg = true) {
	return (e) => {
		(!onlyTarg || e.target == targ) && handle(e);
	};
}
const cursorOpts = {
	show: true,
	x: true,
	y: true,
	lock: false,
	move: cursorMove,
	points: {
		one: false,
		show: cursorPointShow,
		size: cursorPointSize,
		width: 0,
		stroke: cursorPointStroke,
		fill: cursorPointFill
	},
	bind: {
		mousedown: filtBtn0,
		mouseup: filtBtn0,
		click: filtBtn0,
		dblclick: filtBtn0,
		mousemove: filtTarg,
		mouseleave: filtTarg,
		mouseenter: filtTarg
	},
	drag: {
		setRange: true,
		setScale: null,
		x: true,
		y: false,
		dist: 0,
		uni: null,
		click: (self, e) => {
			e.stopPropagation();
			e.stopImmediatePropagation();
		},
		_x: false,
		_y: false
	},
	focus: {
		dist: (self, seriesIdx, dataIdx, valPos, curPos) => valPos - curPos,
		prox: -1,
		bias: 0
	},
	hover: {
		skip: [void 0],
		prox: null,
		bias: 0
	},
	left: -10,
	top: -10,
	idx: null,
	dataIdx: null,
	idxs: null,
	trackDists: false,
	dists: null,
	event: null
};
const axisLines = {
	show: true,
	stroke: "rgba(0,0,0,0.07)",
	width: 2
};
const grid = assign({}, axisLines, { filter: retArg1 });
const ticks = assign({}, grid, { size: 10 });
const border = assign({}, axisLines, { show: false });
const font = "12px system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"Noto Sans\", sans-serif, \"Apple Color Emoji\", \"Segoe UI Emoji\", \"Segoe UI Symbol\", \"Noto Color Emoji\"";
const labelFont = "bold " + font;
const lineGap = 1.5;
const nice = {
	dst: true,
	first: false
};
const xAxisOpts = {
	show: true,
	dom: true,
	scale: "x",
	stroke: hexBlack,
	space: 50,
	nice,
	gap: 5,
	alignTo: 1,
	size: 50,
	labelGap: 0,
	labelSize: 30,
	labelFont,
	side: 2,
	grid,
	ticks,
	border,
	font,
	lineGap,
	rotate: 0
};
const numSeriesLabel = "Value";
const timeSeriesLabel = "Time";
const xSeriesOpts = {
	show: true,
	scale: "x",
	sorted: 1,
	min: inf,
	max: -inf,
	idxs: []
};
const numAxisFmts = /* @__PURE__ */ new Map();
function numAxisVals(self, splits, axisIdx, foundSpace, foundIncr) {
	let dec = numDec(splits);
	let fmt = numAxisFmts.get(dec);
	if (fmt == null) {
		fmt = dec > 100 ? (v) => v.toExponential() : dec > 20 ? (v) => v.toFixed(dec) : new Intl.NumberFormat(void 0, {
			minimumFractionDigits: dec,
			maximumFractionDigits: dec
		}).format;
		numAxisFmts.set(dec, fmt);
	}
	return splits.map((v) => v == null ? "" : fmt(v == 0 ? 0 : v));
}
function numAxisSplits(self, axisIdx, scaleMin, scaleMax, foundIncr, foundSpace, forceMin) {
	let splits = [];
	let numDec = fixedDec.get(foundIncr);
	if (numDec == null) fixedDec.set(foundIncr, numDec = guessDec(foundIncr));
	if (forceMin) numDec = max(numDec, guessDec(scaleMin));
	else scaleMin = roundDec(incrRoundUp(scaleMin, foundIncr), numDec);
	for (let val = scaleMin; val <= scaleMax;) {
		splits.push(Object.is(val, -0) ? 0 : val);
		if (val == scaleMax) break;
		let next = roundDec(val + foundIncr, numDec);
		if (!(next > val)) return [];
		val = next;
	}
	return splits;
}
function logAxisSplits(self, axisIdx, scaleMin, scaleMax, foundIncr, foundSpace, forceMin) {
	if (!isFinite$1(scaleMin) || !isFinite$1(scaleMax) || scaleMin <= 0 || scaleMin > scaleMax) return [];
	const splits = [];
	const logBase = self.scales[self.axes[axisIdx].scale].log;
	const exp = floor((logBase == 10 ? log10 : log2)(scaleMin));
	foundIncr = pow(logBase, exp);
	if (logBase == 10) foundIncr = numIncrs[closestIdx(foundIncr, numIncrs)];
	let split = foundIncr;
	let nextMagIncr = foundIncr * logBase;
	if (logBase == 10) nextMagIncr = numIncrs[closestIdx(nextMagIncr, numIncrs)];
	do {
		if (split >= scaleMin) splits.push(split);
		split = split + foundIncr;
		if (logBase == 10 && !fixedDec.has(split)) split = roundDec(split, fixedDec.get(foundIncr));
		if (split >= nextMagIncr) {
			foundIncr = split;
			nextMagIncr = foundIncr * logBase;
			if (logBase == 10) nextMagIncr = numIncrs[closestIdx(nextMagIncr, numIncrs)];
		}
	} while (split <= scaleMax);
	return splits;
}
function asinhAxisSplits(self, axisIdx, scaleMin, scaleMax, foundIncr, foundSpace, forceMin) {
	if (!isFinite$1(scaleMin) || !isFinite$1(scaleMax) || scaleMin > scaleMax) return [];
	let linthresh = self.scales[self.axes[axisIdx].scale]._asinh;
	if (scaleMin >= -linthresh && scaleMax <= linthresh) return numAxisSplits(self, axisIdx, scaleMin, scaleMax, foundIncr, foundSpace, forceMin);
	let posSplits = scaleMax >= linthresh ? logAxisSplits(self, axisIdx, max(linthresh, scaleMin), scaleMax, foundIncr, foundSpace, forceMin) : [];
	let zero = scaleMax >= 0 && scaleMin <= 0 ? [0] : [];
	return (scaleMin <= -linthresh ? logAxisSplits(self, axisIdx, max(linthresh, -scaleMax), -scaleMin, foundIncr, foundSpace, forceMin) : []).reverse().map((v) => -v).concat(zero, posSplits);
}
const RE_ALL = /./;
const RE_12357 = /[12357]/;
const RE_125 = /[125]/;
const RE_1 = /1/;
const _filt = (splits, distr, re, keepMod, logFn) => {
	let asinh = distr == 4;
	let mag = asinh && keepMod > 1 ? floor(logFn(max(abs(splits[0]), abs(splits.at(-1))))) : null;
	return splits.map((v, i) => asinh && v == 0 || re.test(v.toExponential()[v < 0 ? 1 : 0]) && (mag == null ? i : mag - round(logFn(abs(v)))) % keepMod == 0 ? v : null);
};
function log10AxisValsFilt(self, splits, axisIdx, foundSpace, foundIncr) {
	let axis = self.axes[axisIdx];
	let scaleKey = axis.scale;
	let sc = self.scales[scaleKey];
	if (sc.distr == 4 && sc.min >= -sc._asinh && sc.max <= sc._asinh) return splits;
	let valToPos = self.valToPos;
	let minSpace = axis._space;
	let linthresh = sc.distr == 4 ? sc._asinh : 1;
	let _10 = valToPos(10 * linthresh, scaleKey);
	let re = abs(valToPos(9 * linthresh, scaleKey) - _10) >= minSpace ? RE_ALL : abs(valToPos(7 * linthresh, scaleKey) - _10) >= minSpace ? RE_12357 : abs(valToPos(5 * linthresh, scaleKey) - _10) >= minSpace ? RE_125 : RE_1;
	if (re == RE_1) {
		let magSpace = abs(valToPos(linthresh, scaleKey) - _10);
		if (magSpace < minSpace) return _filt(splits.slice().reverse(), sc.distr, re, ceil(minSpace / magSpace), log10).reverse();
	}
	return _filt(splits, sc.distr, re, 1);
}
function log2AxisValsFilt(self, splits, axisIdx, foundSpace, foundIncr) {
	let axis = self.axes[axisIdx];
	let scaleKey = axis.scale;
	let sc = self.scales[scaleKey];
	if (sc.distr == 4 && sc.min >= -sc._asinh && sc.max <= sc._asinh) return splits;
	let minSpace = axis._space;
	let valToPos = self.valToPos;
	let linthresh = sc.distr == 4 ? sc._asinh : 1;
	let magSpace = abs(valToPos(linthresh, scaleKey) - valToPos(2 * linthresh, scaleKey));
	if (magSpace < minSpace) return _filt(splits.slice().reverse(), sc.distr, RE_ALL, ceil(minSpace / magSpace), log2).reverse();
	return splits;
}
function numSeriesVal(self, val, seriesIdx, dataIdx) {
	return dataIdx == null ? "--" : val == null ? "" : fmtNum(val);
}
const yAxisOpts = {
	show: true,
	dom: true,
	scale: "y",
	stroke: hexBlack,
	space: 30,
	ramp: 1,
	exact: false,
	nice,
	gap: 5,
	alignTo: 1,
	size: 50,
	labelGap: 0,
	labelSize: 30,
	labelFont,
	side: 3,
	grid,
	ticks,
	border,
	font,
	lineGap,
	rotate: 0
};
function ptDia(width, mult) {
	let dia = 3 + (width || 1) * 2;
	return roundDec(dia * mult, 3);
}
function seriesPointsShow(self, si) {
	let { scale, idxs } = self.series[0];
	let xData = self._data[0];
	let p0 = self.valToPos(xData[idxs[0]], scale, true);
	let p1 = self.valToPos(xData[idxs[1]], scale, true);
	let maxPts = abs(p1 - p0) / (self.series[si].points.space * self.pxRatio);
	return idxs[1] - idxs[0] <= maxPts;
}
const facet = {
	scale: null,
	sorted: 0,
	min: inf,
	max: -inf
};
const gaps = (self, seriesIdx, idx0, idx1, nullGaps) => nullGaps;
const xySeriesOpts = {
	show: true,
	sorted: 0,
	gaps,
	alpha: 1,
	facets: [assign({}, facet, { scale: "x" }), assign({}, facet, { scale: "y" })]
};
const ySeriesOpts = {
	scale: "y",
	sorted: 0,
	show: true,
	spanGaps: false,
	gaps,
	alpha: 1,
	points: {
		show: seriesPointsShow,
		filter: null
	},
	values: null,
	min: inf,
	max: -inf,
	idxs: [],
	path: null,
	clip: null
};
function clampScale(self, val, scaleMin, scaleMax, scaleKey) {
	return scaleMin / 10;
}
const xScaleOpts = {
	time: true,
	auto: true,
	distr: 1,
	log: 10,
	asinh: null,
	min: null,
	max: null,
	dir: 1,
	ori: 0
};
const yScaleOpts = assign({}, xScaleOpts, {
	time: false,
	ori: 1
});

// src/rangeY.js
function rangeYCount(dim, ramp = 1, space = 50) {
	if (!(dim > 0) || !isFinite$1(dim) || !(space > 0) || !isFinite$1(space) || !(ramp >= 0) || !isFinite$1(ramp)) return 0;
	let target = dim / space;
	target += Math.exp(-target / 3);
	return max(1, round(1 + (target - 1) * ramp));
}
/** @typedef {{pad?: number | null, hard?: number | null, soft?: number | null}} RangeYLimit */
const autoLimit = Object.freeze({ pad: rangePad });
/** @type {Readonly<{zeroIf: number, min: Readonly<RangeYLimit>, max: Readonly<RangeYLimit>}>} */
const rangeYAuto = Object.freeze({
	zeroIf: rangeZeroIf,
	min: autoLimit,
	max: autoLimit
});
function limitPolicy(limit, side) {
	limit ??= autoLimit;
	let hardDefault = side == 0 ? -Infinity : Infinity;
	let softDefault = -hardDefault;
	let hard = limit.hard ?? hardDefault;
	let soft = limit.soft ?? softDefault;
	let pad = limit.pad ?? autoLimit.pad;
	if (!isFinite$1(hard) && hard != hardDefault || !isFinite$1(soft) && soft != softDefault || !isFinite$1(pad) || pad < 0) return null;
	return {
		hard,
		soft,
		pad
	};
}
function incrAligned(value, incr) {
	return incrRound(value, incr) == value;
}
function incrStart(minimum) {
	let lo = 0;
	let hi = numIncrs.length;
	while (lo < hi) {
		let mid = lo + hi >> 1;
		if (numIncrs[mid] < minimum) lo = mid + 1;
		else hi = mid;
	}
	return max(0, lo - 1);
}
function prepareRangeY(dataMin, dataMax, range) {
	range ??= rangeYAuto;
	let zeroIf = range.zeroIf ?? rangeYAuto.zeroIf;
	let minPolicy = limitPolicy(range.min, 0);
	let maxPolicy = limitPolicy(range.max, 1);
	if (!isFinite$1(zeroIf) || zeroIf < 0 || minPolicy == null || maxPolicy == null || minPolicy.hard >= maxPolicy.hard) return null;
	let rawSpan = dataMax - dataMin;
	let [minAnchor, maxAnchor] = rangeAnchors(dataMin, dataMax, minPolicy.soft, maxPolicy.soft, zeroIf);
	if (minAnchor != null) minAnchor = max(minAnchor, minPolicy.hard);
	if (maxAnchor != null) maxAnchor = min(maxAnchor, maxPolicy.hard);
	let fallbackMin = dataMin;
	let fallbackMax = dataMax;
	if (dataMin == dataMax) {
		fallbackMin = dataMin - abs(dataMin);
		fallbackMax = dataMax == 0 ? 100 : dataMax + abs(dataMax);
		if (dataMin == 0 && (maxAnchor == 0 && minAnchor == null || maxPolicy.hard == 0)) {
			fallbackMin = -100;
			fallbackMax = 0;
			if (minPolicy.soft != 0) minAnchor = null;
		}
	}
	let span = fallbackMax - fallbackMin;
	if (!isFinite$1(span)) return null;
	let boundedMin = max(dataMin, minPolicy.hard);
	let boundedMax = min(dataMax, maxPolicy.hard);
	if (boundedMin > boundedMax) return null;
	return {
		minAnchor,
		maxAnchor,
		span,
		boundedMin,
		boundedMax,
		paddedMin: max(fallbackMin - rawSpan * minPolicy.pad, minPolicy.hard),
		paddedMax: min(fallbackMax + rawSpan * maxPolicy.pad, maxPolicy.hard),
		minPolicy,
		maxPolicy
	};
}
function selectRangeY(request, count, exactCount) {
	let { span, minAnchor, maxAnchor, minPolicy, maxPolicy } = request;
	let boundedMin = minAnchor == null ? request.paddedMin : request.boundedMin;
	let boundedMax = maxAnchor == null ? request.paddedMax : request.boundedMax;
	let hardMin = minPolicy.hard;
	let hardMax = maxPolicy.hard;
	let requiredMin = minAnchor ?? boundedMin;
	let requiredMax = maxAnchor ?? boundedMax;
	let requiredSpan = requiredMax - requiredMin;
	if (!isFinite$1(requiredMin) || !isFinite$1(requiredMax) || !isFinite$1(requiredSpan)) return null;
	let start = incrStart(requiredSpan / count);
	let approximate = !exactCount && count > 1;
	let requiredMagnitude = max(abs(requiredMin), abs(requiredMax));
	let best = null;
	for (let i = start; i < numIncrs.length; i++) {
		let incr = numIncrs[i];
		let dec = fixedDec.get(incr);
		let tickSpan = count * incr;
		let magnitude = requiredMagnitude + tickSpan;
		if (dec > 32 || magnitude / incr >= 0x38d7ea4c68000 || magnitude > Number.MAX_SAFE_INTEGER || dec > 0 && magnitude * 10 ** dec >= 0x38d7ea4c68000) continue;
		if (minAnchor != null && !incrAligned(minAnchor, incr) || maxAnchor != null && !incrAligned(maxAnchor, incr)) continue;
		let lo;
		let hi;
		let foundCount = count;
		if (approximate) {
			lo = minAnchor ?? incrRoundDn(boundedMin, incr);
			hi = maxAnchor ?? incrRoundUp(boundedMax, incr);
			if (minAnchor == null && lo > boundedMin) lo = roundDec(lo - incr, dec);
			if (maxAnchor == null && hi < boundedMax) hi = roundDec(hi + incr, dec);
			foundCount = round((hi - lo) / incr);
			if (!Number.isSafeInteger(foundCount) || foundCount < 1) continue;
		} else if (minAnchor != null) {
			lo = minAnchor;
			hi = roundDec(lo + tickSpan, dec);
			if (maxAnchor != null && hi != maxAnchor) continue;
		} else if (maxAnchor != null) {
			hi = maxAnchor;
			lo = roundDec(hi - tickSpan, dec);
		} else {
			let baseLo = incrRoundDn(boundedMin, incr);
			let baseHi = incrRoundUp(boundedMax, incr);
			if (baseLo > boundedMin) baseLo = roundDec(baseLo - incr, dec);
			if (baseHi < boundedMax) baseHi = roundDec(baseHi + incr, dec);
			let used = round((baseHi - baseLo) / incr);
			if (count == 1 && baseLo < 0 && baseHi > 0 && incr >= span) {
				lo = baseLo;
				hi = baseHi;
			} else {
				if (used > count) continue;
				let minLo = roundDec(baseHi - tickSpan, dec);
				let maxLo = baseLo;
				if (isFinite$1(hardMin)) minLo = max(minLo, incrRoundUp(hardMin, incr));
				if (isFinite$1(hardMax)) maxLo = min(maxLo, incrRoundDn(hardMax - tickSpan, incr));
				if (boundedMin >= 0) minLo = max(0, minLo);
				if (boundedMax <= 0) maxLo = min(-tickSpan, maxLo);
				if (minLo > maxLo) continue;
				lo = roundDec(baseLo - floor((count - used) / 2) * incr, dec);
				lo = min(max(lo, minLo), maxLo);
				hi = roundDec(lo + tickSpan, dec);
			}
		}
		magnitude = max(abs(lo), abs(hi));
		if (magnitude <= Number.MAX_SAFE_INTEGER && (dec == 0 || magnitude * 10 ** dec < 0x38d7ea4c68000) && lo >= hardMin && hi <= hardMax && lo <= boundedMin && hi >= boundedMax && hi > lo) {
			if (best == null || abs(foundCount - count) <= abs(best.count - count)) best = {
				min: lo == 0 ? 0 : lo,
				max: hi == 0 ? 0 : hi,
				incr: foundCount == 1 ? hi - lo : incr,
				count: foundCount
			};
			if (foundCount <= count) return best;
		}
	}
	return best;
}
function rangeY(dataMin, dataMax, dim, range = rangeYAuto, ramp = 1, exactCount = false, space = 50) {
	if (dataMin == null && dataMax == null) return {
		min: null,
		max: null,
		incr: 0,
		count: 0
	};
	let count = rangeYCount(dim, ramp, space);
	if (!Number.isSafeInteger(count) || count < 1 || dataMin == null || dataMax == null || !isFinite$1(dataMin) || !isFinite$1(dataMax) || dataMax < dataMin) return null;
	let request = prepareRangeY(dataMin, dataMax, range);
	if (request == null) return null;
	return selectRangeY(request, count, exactCount);
}

// src/keyed-list.js
function createKeyedList(parent, getKey, mount, before = null) {
	const records = /* @__PURE__ */ new Map();
	let ordered = [];
	let next = [];
	function remove(record) {
		const { instance } = record;
		const { node } = instance;
		instance.destroy();
		if (node.parentNode === parent) parent.removeChild(node);
	}
	function update(entries) {
		for (let i = 0; i < ordered.length; i++) ordered[i].active = false;
		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			const key = getKey(entry);
			let record = records.get(key);
			if (record === void 0) {
				record = {
					key,
					instance: mount(entry),
					active: true
				};
				records.set(key, record);
			} else record.active = true;
			next[i] = record;
			record.instance.update(entry);
		}
		next.length = entries.length;
		for (let i = 0; i < ordered.length; i++) {
			const record = ordered[i];
			if (!record.active) {
				records.delete(record.key);
				remove(record);
			}
			ordered[i] = null;
		}
		let anchor = before;
		for (let i = next.length - 1; i >= 0; i--) {
			const node = next[i].instance.node;
			if (node.parentNode !== parent || node.nextSibling !== anchor) {
				if (node.parentNode === parent && node.isConnected && typeof parent.moveBefore === "function") parent.moveBefore(node, anchor);
				else parent.insertBefore(node, anchor);
			}
			anchor = node;
		}
		const previous = ordered;
		ordered = next;
		next = previous;
	}
	function destroy() {
		for (let i = 0; i < ordered.length; i++) remove(ordered[i]);
		records.clear();
		ordered.length = 0;
		next.length = 0;
	}
	return {
		update,
		destroy
	};
}

// src/h.js
function h(tag, props, ...children) {
	const node = document.createElement(tag);
	for (const key in props) {
		const value = props[key];
		if (value != null) {
			if (key == "style") {
				for (const name in value) if (value[name] != null) node.style[name] = value[name];
			} else node[key] = value;
		}
	}
	append(node, children);
	return node;
}
function append(parent, child) {
	if (isArr(child)) for (const item of child) append(parent, item);
	else if (child != null && child !== false && child !== "") parent.append(child);
}

// src/legend-dom-template.js
function textValue(value) {
	return value == null || value === false ? "" : String(value);
}
function setText(node, text) {
	if (node.firstChild != null) node.firstChild.nodeValue = text;
	else node.textContent = text;
}
function createValueCells(keys) {
	const nodes = keys.map(() => h("td", { className: LEGEND_VALUE }));
	const previous = Array(keys.length).fill("");
	return {
		nodes,
		update(values) {
			for (let i = 0; i < keys.length; i++) {
				const text = textValue(values == null ? "--" : values[keys[i]]);
				if (text !== previous[i]) {
					setText(nodes[i], text);
					previous[i] = text;
				}
			}
		}
	};
}
function createLegendTemplate(self, opts, keys, markersShow) {
	const { legend, multi, focusAlpha, cursorFocus, bind, emit } = opts;
	const inline = legend.mode == null ? !multi : legend.mode == "inline";
	const sideClass = LEGEND_SIDES[opts.side ?? legend.side ?? 2];
	const rowMeta = /* @__PURE__ */ new WeakMap();
	let body;
	const node = h("table", null, multi && h("thead", null, h("tr", null, h("th"), keys.map((key) => h("th", { className: "u-label" }, key)))), body = h("tbody"));
	let values = [];
	let focused = null;
	let tableClass;
	function bindEvent(el, type, series, onlyTarget) {
		const bindType = type == "focus" ? mouseenter : type == "leave" ? mouseleave : type;
		const listener = bind[bindType](self, el, (e) => emit(type, series, e), onlyTarget);
		if (listener) on(bindType, el, listener);
		return listener;
	}
	function createRowEvents(header, series) {
		let bound = false;
		let click, focus;
		function unbind() {
			if (click) off("click", header, click);
			if (focus) off(mouseenter, header, focus);
			click = focus = null;
			bound = false;
		}
		return {
			update(eligible) {
				if (eligible !== bound) {
					if (eligible) {
						click = bindEvent(header, "click", series, false);
						if (cursorFocus) focus = bindEvent(header, "focus", series, false);
						bound = true;
					} else unbind();
				}
			},
			destroy: unbind
		};
	}
	let leave = cursorFocus ? bindEvent(node, "leave", null, true) : null;
	function prepare({ series, index }) {
		let state = rowMeta.get(series);
		if (state == null) {
			const markers = legend.markers;
			let border = null, background = null, color = null;
			if (index > 0) {
				if (markersShow) {
					const width = markers.width(self, index);
					if (width) border = width + "px " + markers.dash(self, index) + " " + markers.stroke(self, index);
					background = markers.fill(self, index);
				} else color = series.width > 0 ? markers.stroke(self, index) : markers.fill(self, index);
			}
			const label = series.label;
			state = {
				label: label instanceof HTMLElement ? label : textValue(label),
				border,
				background,
				color
			};
			rowMeta.set(series, state);
		}
		return state;
	}
	function createRow(entry) {
		const state = prepare(entry);
		const cells = createValueCells(keys);
		let header, label;
		const row = h("tr", null, header = h("th", null, markersShow && h("div", {
			className: "u-marker",
			style: {
				border: state.border,
				background: state.background
			}
		}), label = h("div", {
			className: LEGEND_LABEL,
			style: { color: state.color }
		}, state.label)), cells.nodes);
		const events = createRowEvents(header, entry.series);
		let className;
		let opacity = null;
		return {
			node: row,
			update({ series, index }) {
				const nextClass = LEGEND_SERIES + (series.class ? " " + series.class : "") + (series.show ? "" : " " + OFF);
				if (nextClass !== className) row.className = className = nextClass;
				const nextOpacity = focusAlpha != 1 && focused != null && index > 0 && series != focused ? focusAlpha : null;
				if (nextOpacity !== opacity) {
					row.style.opacity = nextOpacity == null ? "" : nextOpacity;
					opacity = nextOpacity;
				}
				events.update(index > 0);
				cells.update(values[index]);
			},
			destroy() {
				events.destroy();
				if (state.label instanceof HTMLElement && state.label.parentNode === label) label.removeChild(state.label);
			}
		};
	}
	return {
		node,
		body,
		createRow,
		update(data, focusedSeries) {
			values = data;
			focused = focusedSeries;
			const className = LEGEND + " " + sideClass + (inline ? " " + LEGEND_INLINE + (legend.live ? " " + LEGEND_LIVE : "") : "");
			if (className !== tableClass) node.className = tableClass = className;
		},
		destroy() {
			if (leave) off(mouseleave, node, leave);
			leave = null;
		}
	};
}

// src/legend-dom.js
const seriesKey = (entry) => entry.series;
function createLegend(self, parent, opts, selectRows) {
	const { series, legend, columns, multi, mode } = opts;
	const markersShow = legend.markers.show;
	const keys = [];
	for (const key in columns) keys.push(key);
	const entriesBySeries = /* @__PURE__ */ new WeakMap();
	const entries = [];
	let template, rows;
	let destroyed = false;
	function select(data) {
		let count = 0;
		const order = legend.order;
		const length = order == null ? series.length - 1 : order.length;
		const start = multi || !legend.live || mode == 2 ? 0 : -1;
		for (let i = start; i < length; i++) {
			const index = i == -1 ? 0 : order == null ? i + 1 : order[i];
			const s = series[index];
			let entry = entriesBySeries.get(s);
			if (entry == null) {
				entry = {
					series: s,
					index
				};
				entriesBySeries.set(s, entry);
			} else entry.index = index;
			entries[count++] = entry;
		}
		entries.length = count;
		return selectRows ? selectRows(entries, data) : entries;
	}
	return {
		render(data, focus) {
			if (destroyed) return;
			const mount = template == null;
			if (mount) {
				template = createLegendTemplate(self, opts, keys, markersShow);
				rows = createKeyedList(template.body, seriesKey, template.createRow);
			}
			const selected = select(data);
			template.update(data, focus);
			rows.update(selected);
			if (mount) {
				parent.appendChild(template.node);
				legend.mount(self, template.node);
			}
		},
		destroy() {
			if (!destroyed) {
				destroyed = true;
				rows?.destroy();
				template?.destroy();
				template?.node.remove();
				rows = template = null;
				entries.length = 0;
			}
		}
	};
}

// src/axis.js
const measureContexts = /* @__PURE__ */ new Map();
function measureContext(font) {
	let ctx = measureContexts.get(font);
	if (ctx == null) {
		ctx = new OffscreenCanvas(1, 1).getContext("2d");
		ctx.font = font;
		measureContexts.set(font, ctx);
	}
	return ctx;
}
function measureAxisLabels(axis, pxRatio) {
	let values = axis._values;
	let prev = axis._labelValues;
	if (!(values === prev || prev != null && values.length == prev.length && values.every((value, i) => value === prev[i]))) {
		let ctx = measureContext(axis.font[0]);
		axis._labelWidths = values.map((value) => {
			if (value == null) return 0;
			let text = "" + value;
			if (text.indexOf("\n") == -1) return ctx.measureText(text).width / pxRatio;
			let width = 0;
			for (let line of text.split("\n")) width = max(width, ctx.measureText(line).width);
			return width / pxRatio;
		});
	}
	axis._labelValues = values;
}
function rotationCos(rotate) {
	let value = cos(-rotate * PI / 180);
	return rotate % 90 == 0 ? round(value) : value;
}
function rotationSin(rotate) {
	let value = sin(-rotate * PI / 180);
	return rotate % 90 == 0 ? round(value) : value;
}
function labelHeight(axis, height) {
	let lines = -1;
	for (let value of axis._values) if (value != null) {
		if (axis.side == 0) return height;
		let text = "" + value;
		let count = 0;
		for (let pos = text.indexOf("\n"); pos != -1; pos = text.indexOf("\n", pos + 1)) count++;
		lines = max(lines, count);
	}
	return lines < 0 ? 0 : height + lines * height * axis.lineGap;
}
function autoAxisSize(self, values, axisIdx) {
	let { pxRatio } = self;
	let axis = self.axes[axisIdx];
	let rotate = axis._rotate || 0;
	let vertical = axis.side % 2 == 1;
	let height = axis.font[1] / pxRatio;
	let extent = 0;
	if (vertical || rotate != 0) {
		measureAxisLabels(axis, pxRatio);
		let { _labelValues, _labelWidths } = axis;
		let width = -1;
		for (let i = 0; i < _labelWidths.length; i++) if (_labelValues[i] != null) width = max(width, _labelWidths[i]);
		if (width >= 0) extent = vertical ? width : width * abs(rotationSin(rotate)) + height / 2 * rotationCos(rotate);
	} else extent = labelHeight(axis, height);
	return (axis.ticks.show ? axis.ticks.size : 0) + axis.gap + extent;
}
function axisOverflow(axis, scale, pxRatio, minWidth, leftBase, rightBase, padding) {
	let { _labelValues, _labelWidths, _splits } = axis;
	let rotate = axis._rotate || 0;
	let cos = rotationCos(rotate);
	let leftFactor = rotate == 0 ? .5 : rotate > 0 ? cos : 0;
	let rightFactor = rotate == 0 ? .5 : rotate < 0 ? cos : 0;
	let heightExtent = axis.font[1] / pxRatio / 2 * abs(rotationSin(rotate));
	for (let i = 0; i < _labelWidths.length; i++) {
		if (_labelValues[i] == null) continue;
		let fraction = minWidth > 0 ? scale.valToPct(_splits[i]) : 0;
		if (scale.dir == -1) fraction = 1 - fraction;
		let width = _labelWidths[i];
		padding[3] = max(padding[3], leftBase + width * leftFactor + heightExtent - fraction * minWidth);
		padding[1] = max(padding[1], rightBase + width * rightFactor + heightExtent - (1 - fraction) * minWidth);
	}
}
function autoPad(self, padding, leftSize, rightSize, leftMax, rightMax) {
	let { axes, scales, pxRatio, _padding } = self;
	let leftMin = padding[3];
	let rightMin = padding[1];
	let leftBase = leftMin - leftSize;
	let rightBase = rightMin - rightSize;
	for (let axis of axes) if (axis._show && axis.side % 2 == 0) {
		measureAxisLabels(axis, pxRatio);
		axisOverflow(axis, scales[axis.scale], pxRatio, 0, leftBase, rightBase, padding);
	}
	let minWidth = max(0, self.width - leftSize - rightSize - ceil(padding[3]) - ceil(padding[1]));
	padding[3] = leftMin;
	padding[1] = rightMin;
	for (let axis of axes) if (axis._show && axis.side % 2 == 0) axisOverflow(axis, scales[axis.scale], pxRatio, minWidth, leftBase, rightBase, padding);
	_padding[3] = clamp(ceil(padding[3]), leftMin, leftMax);
	_padding[1] = clamp(ceil(padding[1]), rightMin, rightMax);
}
function resolvePadding(self, leftSize, rightSize) {
	let { padding, _padding } = self;
	let left = padding[3];
	let right = padding[1];
	let leftMax = isArr(left) ? left[1] : _padding[3];
	let rightMax = isArr(right) ? right[1] : _padding[1];
	if (leftMax > _padding[3] || rightMax > _padding[1]) autoPad(self, _padding.slice(), leftSize, rightSize, leftMax, rightMax);
}

// src/sync.js
const syncs = {};
function _sync(key, opts) {
	let s = syncs[key];
	if (!s) {
		s = {
			key,
			plots: [],
			sub(plot) {
				s.plots.push(plot);
			},
			unsub(plot) {
				s.plots = s.plots.filter((c) => c != plot);
			},
			pub(type, self, x, y, w, h, i) {
				for (let j = 0; j < s.plots.length; j++) s.plots[j] != self && s.plots[j].pub(type, self, x, y, w, h, i);
			}
		};
		if (key != null) syncs[key] = s;
	}
	return s;
}

// src/paths/utils.js
function orient(u, seriesIdx, cb) {
	const mode = u.mode;
	const series = u.series[seriesIdx];
	const data = mode == 2 ? u._data[seriesIdx] : u._data;
	const scales = u.scales;
	const bbox = u.bbox;
	let dx = data[0], dy = mode == 2 ? data[1] : data[seriesIdx], sx = mode == 2 ? scales[series.facets[0].scale] : scales[u.series[0].scale], sy = mode == 2 ? scales[series.facets[1].scale] : scales[series.scale], l = bbox.left, t = bbox.top, w = bbox.width, h = bbox.height, H = u.valToPosH, V = u.valToPosV;
	return sx.ori == 0 ? cb(series, dx, dy, sx, sy, H, V, l, t, w, h, moveToH, lineToH, rectH, arcH, bezierCurveToH) : cb(series, dx, dy, sx, sy, V, H, t, l, h, w, moveToV, lineToV, rectV, arcV, bezierCurveToV);
}
function bandFillClipDirs(self, seriesIdx) {
	let fillDir = 0;
	let clipDirs = 0;
	let bands = self.bands ?? EMPTY_ARR;
	for (let i = 0; i < bands.length; i++) {
		let b = bands[i];
		if (b.series[0] == seriesIdx) fillDir = b.dir;
		else if (b.series[1] == seriesIdx) {
			if (b.dir == 1) clipDirs |= 1;
			else clipDirs |= 2;
		}
	}
	return [fillDir, clipDirs == 1 ? -1 : clipDirs == 2 ? 1 : clipDirs == 3 ? 2 : 0];
}
function seriesFillTo(self, seriesIdx, dataMin, dataMax, bandFillDir) {
	let mode = self.mode;
	let series = self.series[seriesIdx];
	let scaleKey = mode == 2 ? series.facets[1].scale : series.scale;
	let scale = self.scales[scaleKey];
	return bandFillDir == -1 ? scale.min : bandFillDir == 1 ? scale.max : scale.distr == 3 ? scale.dir == 1 ? scale.min : scale.max : 0;
}
function clipBandLine(self, seriesIdx, idx0, idx1, strokePath, clipDir) {
	return orient(self, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim) => {
		let pxRound = series.pxRound;
		const dir = scaleX.dir * (scaleX.ori == 0 ? 1 : -1);
		const lineTo = scaleX.ori == 0 ? lineToH : lineToV;
		let frIdx, toIdx;
		if (dir == 1) {
			frIdx = idx0;
			toIdx = idx1;
		} else {
			frIdx = idx1;
			toIdx = idx0;
		}
		let x0 = pxRound(valToPosX(dataX[frIdx], scaleX, xDim, xOff));
		let y0 = pxRound(valToPosY(dataY[frIdx], scaleY, yDim, yOff));
		let x1 = pxRound(valToPosX(dataX[toIdx], scaleX, xDim, xOff));
		let yLimit = pxRound(valToPosY(clipDir == 1 ? scaleY.max : scaleY.min, scaleY, yDim, yOff));
		let clip = new Path2D(strokePath);
		lineTo(clip, x1, yLimit);
		lineTo(clip, x0, yLimit);
		lineTo(clip, x0, y0);
		return clip;
	});
}
function clipGaps(gaps, ori, plotLft, plotTop, plotWid, plotHgt) {
	let clip = null;
	if (gaps.length > 0) {
		clip = new Path2D();
		const rect = ori == 0 ? rectH : rectV;
		let prevGapEnd = plotLft;
		for (let i = 0; i < gaps.length; i++) {
			let g = gaps[i];
			if (g[1] > g[0]) {
				let w = g[0] - prevGapEnd;
				w > 0 && rect(clip, prevGapEnd, plotTop, w, plotTop + plotHgt);
				prevGapEnd = g[1];
			}
		}
		let w = plotLft + plotWid - prevGapEnd;
		let maxStrokeWidth = 10;
		w > 0 && rect(clip, prevGapEnd, plotTop - maxStrokeWidth / 2, w, plotTop + plotHgt + maxStrokeWidth);
	}
	return clip;
}
function addGap(gaps, fromX, toX) {
	let prevGap = gaps[gaps.length - 1];
	if (prevGap && prevGap[0] == fromX) prevGap[1] = toX;
	else gaps.push([fromX, toX]);
}
function findGaps(xs, ys, idx0, idx1, dir, pixelForX, align) {
	let gaps = [];
	let len = xs.length;
	for (let i = dir == 1 ? idx0 : idx1; i >= idx0 && i <= idx1; i += dir) if (ys[i] === null) {
		let fr = i, to = i;
		if (dir == 1) while (++i <= idx1 && ys[i] === null) to = i;
		else while (--i >= idx0 && ys[i] === null) to = i;
		let frPx = pixelForX(xs[fr]);
		let toPx = to == fr ? frPx : pixelForX(xs[to]);
		let fri2 = fr - dir;
		frPx = align <= 0 && fri2 >= 0 && fri2 < len ? pixelForX(xs[fri2]) : frPx;
		let toi2 = to + dir;
		toPx = align >= 0 && toi2 >= 0 && toi2 < len ? pixelForX(xs[toi2]) : toPx;
		if (toPx >= frPx) gaps.push([frPx, toPx]);
	}
	return gaps;
}
function pointPos(val, scale, dim, off, valToPos, pxRound) {
	return pxRound(valToPos(val, scale, dim, off));
}
function pxOffset(width, pxAlign) {
	let offset = width % 2 / 2;
	return pxAlign == 1 && offset > 0 ? offset : 0;
}
function pxRoundGen(pxAlign) {
	return pxAlign == 0 ? retArg0 : pxAlign == 1 ? round : (v) => incrRound(v, pxAlign);
}
function rect(ori) {
	let moveTo = ori == 0 ? moveToH : moveToV;
	let arcTo = ori == 0 ? (p, x1, y1, x2, y2, r) => {
		p.arcTo(x1, y1, x2, y2, r);
	} : (p, y1, x1, y2, x2, r) => {
		p.arcTo(x1, y1, x2, y2, r);
	};
	let rect = ori == 0 ? (p, x, y, w, h) => {
		p.rect(x, y, w, h);
	} : (p, y, x, h, w) => {
		p.rect(x, y, w, h);
	};
	return (p, x, y, w, h, endRad = 0, baseRad = 0) => {
		if (endRad == 0 && baseRad == 0) rect(p, x, y, w, h);
		else {
			endRad = min(endRad, w / 2, h / 2);
			baseRad = min(baseRad, w / 2, h / 2);
			moveTo(p, x + endRad, y);
			arcTo(p, x + w, y, x + w, y + h, endRad);
			arcTo(p, x + w, y + h, x, y + h, baseRad);
			arcTo(p, x, y + h, x, y, baseRad);
			arcTo(p, x, y, x + w, y, endRad);
			p.closePath();
		}
	};
}
const moveToH = (p, x, y) => {
	p.moveTo(x, y);
};
const moveToV = (p, y, x) => {
	p.moveTo(x, y);
};
const lineToH = (p, x, y) => {
	p.lineTo(x, y);
};
const lineToV = (p, y, x) => {
	p.lineTo(x, y);
};
const rectH = rect(0);
const rectV = rect(1);
const arcH = (p, x, y, r, startAngle, endAngle) => {
	p.arc(x, y, r, startAngle, endAngle);
};
const arcV = (p, y, x, r, startAngle, endAngle) => {
	p.arc(x, y, r, startAngle, endAngle);
};
const bezierCurveToH = (p, bp1x, bp1y, bp2x, bp2y, p2x, p2y) => {
	p.bezierCurveTo(bp1x, bp1y, bp2x, bp2y, p2x, p2y);
};
const bezierCurveToV = (p, bp1y, bp1x, bp2y, bp2x, p2y, p2x) => {
	p.bezierCurveTo(bp1x, bp1y, bp2x, bp2y, p2x, p2y);
};

// src/paths/disp.js
function arrayValue(values, i) {
	return values[i];
}
function discreteValue(values, i) {
	return values[0][values[1][i]];
}
function dispReader(kind) {
	return kind == 1 ? retArg0 : kind == 2 ? discreteValue : arrayValue;
}
function cacheDisp(u, seriesIdx, facet, prepare) {
	const cache = u.series[seriesIdx]._disp ??= /* @__PURE__ */ new WeakMap();
	let entry = cache.get(facet);
	if (entry == null) {
		const data = u.mode == 2 ? u.data[seriesIdx] : u.data;
		let value = facet.values(u, seriesIdx, 0, data[0].length - 1);
		if (prepare != null) value = prepare(value);
		entry = { value };
		cache.set(facet, entry);
	}
	return entry.value;
}
function unaryColor(color) {
	return [[color], 0];
}
function indexColors(colors) {
	const palette = [null];
	const indices = new Uint32Array(colors.length);
	const unique = /* @__PURE__ */ new Map();
	for (let i = 0; i < colors.length; i++) {
		const color = colors[i];
		if (color != null) {
			let idx = unique.get(color);
			if (idx == null) {
				idx = palette.length;
				unique.set(color, idx);
				palette.push(color);
			}
			indices[i] = idx;
		}
	}
	return [palette, indices];
}
function cacheColors(u, seriesIdx, facet) {
	return cacheDisp(u, seriesIdx, facet, facet.kind == 1 ? unaryColor : facet.kind == 2 ? null : indexColors);
}
function colorPaths(u, seriesIdx, disp, fillStyle, strokeStyle, stroke = true) {
	const fills = disp.fill == null ? null : cacheColors(u, seriesIdx, disp.fill);
	const strokes = disp.stroke == null || !stroke && fills != null ? null : cacheColors(u, seriesIdx, disp.stroke);
	const fillIndex = dispReader(disp.fill?.kind == 1 ? 1 : 3);
	const strokeIndex = dispReader(disp.stroke?.kind == 1 ? 1 : 3);
	const primary = fills ?? strokes;
	const index = fills == null ? strokeIndex : fillIndex;
	const groups = /* @__PURE__ */ new Map();
	primary?.[0].forEach((color) => groups.set(color ?? null, null));
	return {
		groups,
		path(i) {
			const color = primary == null ? fillStyle : primary[0][index(primary[1], i)];
			const key = color ?? null;
			let group = groups.get(key);
			if (group == null) {
				const fill = fills == null ? fillStyle : color;
				const strokeColor = !stroke ? null : strokes == null ? strokeStyle : fills == null ? color : strokes[0][strokeIndex(strokes[1], i)];
				group = {
					fill,
					stroke: strokeColor,
					path: fill == null && strokeColor == null ? null : new Path2D()
				};
				groups.set(key, group);
			}
			return group.path;
		}
	};
}
function paintPaths(groups, channel) {
	const paths = /* @__PURE__ */ new Map();
	groups.forEach((group) => {
		if (group != null && group.path != null && group[channel] != null) {
			const color = group[channel];
			const prev = paths.get(color);
			if (prev == null) paths.set(color, group.path);
			else if (Array.isArray(prev)) prev.push(group.path);
			else paths.set(color, [prev, group.path]);
		}
	});
	return paths;
}

// src/paths/points.js
function circle(path, x, y, rad) {
	path.moveTo(x + rad, y);
	path.arc(x, y, rad, 0, PI * 2);
}
function square(path, x, y, rad) {
	path.rect(x - rad, y - rad, rad * 2, rad * 2);
}
function points(opts) {
	opts = opts || EMPTY_OBJ;
	const disp = opts.disp;
	const batch = opts.batch ?? disp == null;
	const singlePath = batch && disp == null;
	const each = opts.each;
	return (u, seriesIdx, idx0, idx1, filtIdxs) => {
		let { pxRatio } = u;
		return orient(u, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim) => {
			let { pxRound, points } = series;
			const horizontal = scaleX.ori == 0;
			const drawShape = points.shape == 2 ? square : circle;
			const width = roundDec(points.width * pxRatio, 3);
			const sizes = disp?.size == null ? null : cacheDisp(u, seriesIdx, disp.size);
			const fills = batch || disp?.fill == null ? null : cacheColors(u, seriesIdx, disp.fill);
			const strokes = batch || width <= 0 || disp?.stroke == null ? null : cacheColors(u, seriesIdx, disp.stroke);
			const sizeValue = dispReader(disp?.size?.kind);
			const fillIndex = dispReader(disp?.fill?.kind == 1 ? 1 : 3);
			const strokeIndex = dispReader(disp?.stroke?.kind == 1 ? 1 : 3);
			const sizeScale = disp?.size?.scale == null ? null : u.scales[disp.size.scale];
			const sizeRange = sizeScale == null ? null : disp.size.range;
			if (sizeScale != null && (sizeScale.min == null || sizeScale.max == null)) return null;
			const sizeSpan = sizeRange == null ? 0 : sizeRange[1] - sizeRange[0];
			const cullPad = sizeRange == null ? 0 : sizeRange[1] * pxRatio / 2;
			let rad = (points.size - points.width) / 2 * pxRatio;
			const clipPad = sizes != null ? 0 : disp == null ? roundDec(rad * 2, 3) : points.size * pxRatio / 2;
			let fill = singlePath ? new Path2D() : null;
			let clip = new Path2D();
			let { left: lft, top, width: wid, height: hgt } = u.bbox;
			rectH(clip, lft - clipPad, top - clipPad, wid + clipPad * 2, hgt + clipPad * 2);
			const ctx = u.ctx;
			const offset = pxOffset(width, points.pxAlign);
			const xMin = xOff - cullPad - offset;
			const xMax = xOff + xDim + cullPad - offset;
			const yMin = yOff - cullPad - offset;
			const yMax = yOff + yDim + cullPad - offset;
			const strokeStyle = points._stroke;
			const fillStyle = points._fill ?? (width > 0 ? "#fff" : strokeStyle);
			const colors = !singlePath && batch ? colorPaths(u, seriesIdx, disp, fillStyle, strokeStyle, width > 0) : null;
			if (!singlePath) {
				ctx.save();
				if (sizes != null) ctx.clip(clip);
				ctx.translate(offset, offset);
				if (sizes == null) ctx.clip(clip);
				if (width > 0) ctx.lineWidth = width;
				ctx.lineCap = points.cap ?? "butt";
				ctx.lineJoin = "round";
				ctx.setLineDash(points.dash ?? EMPTY_ARR);
			}
			const drawPoint = (pi) => {
				const xVal = dataX[pi];
				const yVal = dataY[pi];
				if (xVal == null || yVal == null || sizeRange == null && (xVal < scaleX.min || xVal > scaleX.max || yVal < scaleY.min || yVal > scaleY.max)) return;
				let x = pointPos(xVal, scaleX, xDim, xOff, valToPosX, pxRound);
				let y = pointPos(yVal, scaleY, yDim, yOff, valToPosY, pxRound);
				if (sizeRange != null && (x < xMin || x > xMax || y < yMin || y > yMax)) return;
				if (sizes != null) {
					let size = sizeValue(sizes, pi);
					if (sizeScale != null) {
						const pct = Math.max(0, Math.min(1, sizeScale.valToPct(size)));
						size = sizeRange[0] + pct * sizeSpan;
					}
					if (size <= points.width) return;
					rad = (size - points.width) / 2 * pxRatio;
				}
				const cx = horizontal ? x : y;
				const cy = horizontal ? y : x;
				if (colors != null) {
					const path = colors.path(pi);
					if (path == null) return;
					drawShape(path, cx, cy, rad);
				} else if (!singlePath) {
					const colorFill = fills == null ? fillStyle : fills[0][fillIndex(fills[1], pi)];
					const colorStroke = strokes == null ? strokeStyle : strokes[0][strokeIndex(strokes[1], pi)];
					if (colorFill == null && (width <= 0 || colorStroke == null)) return;
					ctx.beginPath();
					drawShape(ctx, cx, cy, rad);
					if (colorFill != null) {
						ctx.fillStyle = colorFill;
						ctx.fill();
					}
					if (width > 0 && colorStroke != null) {
						ctx.strokeStyle = colorStroke;
						ctx.stroke();
					}
				} else drawShape(fill, cx, cy, rad);
				if (each != null) {
					const outer = rad + width / 2;
					each(u, seriesIdx, pi, cx + offset - outer, cy + offset - outer, outer * 2, outer * 2);
				}
			};
			if (filtIdxs) filtIdxs.forEach(drawPoint);
			else for (let pi = idx0; pi <= idx1; pi++) drawPoint(pi);
			if (!singlePath) {
				if (colors != null) {
					colors.groups.forEach((group) => {
						if (group?.fill != null) {
							ctx.fillStyle = group.fill;
							ctx.fill(group.path);
						}
					});
					colors.groups.forEach((group) => {
						if (group?.stroke != null) {
							ctx.strokeStyle = group.stroke;
							ctx.stroke(group.path);
						}
					});
				}
				ctx.restore();
				return null;
			}
			return {
				stroke: width > 0 ? fill : null,
				fill,
				clip,
				flags: 1 | 2
			};
		});
	};
}

// src/paths/linear.js
function _drawAcc(lineTo) {
	return (stroke, accX, minY, maxY, inY, outY) => {
		if (minY != maxY) {
			if (inY != minY && outY != minY) lineTo(stroke, accX, minY);
			if (inY != maxY && outY != maxY) lineTo(stroke, accX, maxY);
			lineTo(stroke, accX, outY);
		}
	};
}
const drawAccH = _drawAcc(lineToH);
const drawAccV = _drawAcc(lineToV);
function linear$1(opts) {
	return (u, seriesIdx, idx0, idx1) => {
		return orient(u, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim) => {
			[idx0, idx1] = nonNullIdxs(dataY, idx0, idx1);
			if (idx0 == -1) return null;
			let pxRound = series.pxRound;
			let alignGaps = opts?.alignGaps ?? series.alignGaps ?? 0;
			let pixelForX = (val) => pxRound(valToPosX(val, scaleX, xDim, xOff));
			let pixelForY = (val) => pxRound(valToPosY(val, scaleY, yDim, yOff));
			let lineTo, drawAcc;
			if (scaleX.ori == 0) {
				lineTo = lineToH;
				drawAcc = drawAccH;
			} else {
				lineTo = lineToV;
				drawAcc = drawAccV;
			}
			const dir = scaleX.dir * (scaleX.ori == 0 ? 1 : -1);
			const _paths = {
				stroke: new Path2D(),
				fill: null,
				clip: null,
				band: null,
				gaps: null,
				flags: 1
			};
			const stroke = _paths.stroke;
			let hasGap = false;
			if (idx1 - idx0 >= xDim * 4) {
				let xForPixel = (pos) => u.posToVal(pos, scaleX.key, true);
				let minY = null, maxY = null, inY, outY, drawnAtX;
				let accX = pixelForX(dataX[dir == 1 ? idx0 : idx1]);
				let idx0px = pixelForX(dataX[idx0]);
				let idx1px = pixelForX(dataX[idx1]);
				let nextAccXVal = xForPixel(dir == 1 ? idx0px + 1 : idx1px - 1);
				for (let i = dir == 1 ? idx0 : idx1; i >= idx0 && i <= idx1; i += dir) {
					let xVal = dataX[i];
					let x = (dir == 1 ? xVal < nextAccXVal : xVal > nextAccXVal) ? accX : pixelForX(xVal);
					let yVal = dataY[i];
					if (x == accX) {
						if (yVal != null) {
							outY = yVal;
							if (minY == null) {
								lineTo(stroke, x, pixelForY(outY));
								inY = minY = maxY = outY;
							} else if (outY < minY) minY = outY;
							else if (outY > maxY) maxY = outY;
						} else if (yVal === null) hasGap = true;
					} else {
						if (minY != null) drawAcc(stroke, accX, pixelForY(minY), pixelForY(maxY), pixelForY(inY), pixelForY(outY));
						if (yVal != null) {
							outY = yVal;
							lineTo(stroke, x, pixelForY(outY));
							minY = maxY = inY = outY;
						} else {
							minY = maxY = null;
							if (yVal === null) hasGap = true;
						}
						accX = x;
						nextAccXVal = xForPixel(accX + dir);
					}
				}
				if (minY != null && minY != maxY && drawnAtX != accX) drawAcc(stroke, accX, pixelForY(minY), pixelForY(maxY), pixelForY(inY), pixelForY(outY));
			} else for (let i = dir == 1 ? idx0 : idx1; i >= idx0 && i <= idx1; i += dir) {
				let yVal = dataY[i];
				if (yVal === null) hasGap = true;
				else if (yVal != null) lineTo(stroke, pixelForX(dataX[i]), pixelForY(yVal));
			}
			let [bandFillDir, bandClipDir] = bandFillClipDirs(u, seriesIdx);
			if (series.fill != null || bandFillDir != 0) {
				let fill = _paths.fill = new Path2D(stroke);
				let fillToY = pixelForY(series.fillTo(u, seriesIdx, series.min, series.max, bandFillDir));
				let frX = pixelForX(dataX[idx0]);
				let toX = pixelForX(dataX[idx1]);
				if (dir == -1) [toX, frX] = [frX, toX];
				lineTo(fill, toX, fillToY);
				lineTo(fill, frX, fillToY);
			}
			if (!series.spanGaps) {
				let gaps = hasGap ? findGaps(dataX, dataY, idx0, idx1, dir, pixelForX, alignGaps) : [];
				_paths.gaps = gaps = series.gaps(u, seriesIdx, idx0, idx1, gaps);
				_paths.clip = clipGaps(gaps, scaleX.ori, xOff, yOff, xDim, yDim);
			}
			if (bandClipDir != 0) _paths.band = bandClipDir == 2 ? [clipBandLine(u, seriesIdx, idx0, idx1, stroke, -1), clipBandLine(u, seriesIdx, idx0, idx1, stroke, 1)] : clipBandLine(u, seriesIdx, idx0, idx1, stroke, bandClipDir);
			return _paths;
		});
	};
}

// src/paths/stepped.js
function stepped(opts) {
	const align = opts.align ?? 1;
	const ascDesc = opts.ascDesc ?? false;
	const extend = opts.extend ?? false;
	return (u, seriesIdx, idx0, idx1) => {
		let { pxRatio } = u;
		return orient(u, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim) => {
			[idx0, idx1] = nonNullIdxs(dataY, idx0, idx1);
			if (idx0 == -1) return null;
			let pxRound = series.pxRound;
			let alignGaps = opts?.alignGaps ?? series.alignGaps ?? 0;
			let { left, width } = u.bbox;
			let pixelForX = (val) => pxRound(valToPosX(val, scaleX, xDim, xOff));
			let pixelForY = (val) => pxRound(valToPosY(val, scaleY, yDim, yOff));
			let lineTo = scaleX.ori == 0 ? lineToH : lineToV;
			const _paths = {
				stroke: new Path2D(),
				fill: null,
				clip: null,
				band: null,
				gaps: null,
				flags: 1
			};
			const stroke = _paths.stroke;
			const dir = scaleX.dir * (scaleX.ori == 0 ? 1 : -1);
			let hasGap = false;
			let prevYPos = pixelForY(dataY[dir == 1 ? idx0 : idx1]);
			let firstXPos = pixelForX(dataX[dir == 1 ? idx0 : idx1]);
			let prevXPos = firstXPos;
			let firstXPosExt = firstXPos;
			if (extend && align == -1) {
				firstXPosExt = left;
				lineTo(stroke, firstXPosExt, prevYPos);
			}
			lineTo(stroke, firstXPos, prevYPos);
			for (let i = dir == 1 ? idx0 : idx1; i >= idx0 && i <= idx1; i += dir) {
				let yVal1 = dataY[i];
				if (yVal1 == null) {
					if (yVal1 === null) hasGap = true;
					continue;
				}
				let x1 = pixelForX(dataX[i]);
				let y1 = pixelForY(yVal1);
				if (align == 1) lineTo(stroke, x1, prevYPos);
				else lineTo(stroke, prevXPos, y1);
				lineTo(stroke, x1, y1);
				prevYPos = y1;
				prevXPos = x1;
			}
			let prevXPosExt = prevXPos;
			if (extend && align == 1) {
				prevXPosExt = left + width;
				lineTo(stroke, prevXPosExt, prevYPos);
			}
			let [bandFillDir, bandClipDir] = bandFillClipDirs(u, seriesIdx);
			if (series.fill != null || bandFillDir != 0) {
				let fill = _paths.fill = new Path2D(stroke);
				let fillToY = pixelForY(series.fillTo(u, seriesIdx, series.min, series.max, bandFillDir));
				lineTo(fill, prevXPosExt, fillToY);
				lineTo(fill, firstXPosExt, fillToY);
			}
			if (!series.spanGaps) {
				let gaps = hasGap ? findGaps(dataX, dataY, idx0, idx1, dir, pixelForX, alignGaps) : [];
				let halfStroke = series.width * pxRatio / 2;
				let startsOffset = ascDesc || align == 1 ? halfStroke : -halfStroke;
				let endsOffset = ascDesc || align == -1 ? -halfStroke : halfStroke;
				gaps.forEach((g) => {
					g[0] += startsOffset;
					g[1] += endsOffset;
				});
				_paths.gaps = gaps = series.gaps(u, seriesIdx, idx0, idx1, gaps);
				_paths.clip = clipGaps(gaps, scaleX.ori, xOff, yOff, xDim, yDim);
			}
			if (bandClipDir != 0) _paths.band = bandClipDir == 2 ? [clipBandLine(u, seriesIdx, idx0, idx1, stroke, -1), clipBandLine(u, seriesIdx, idx0, idx1, stroke, 1)] : clipBandLine(u, seriesIdx, idx0, idx1, stroke, bandClipDir);
			return _paths;
		});
	};
}

// src/paths/bars.js
function percentToPos(pct, scale, dim, off) {
	return off + pct * dim;
}
function findColWidth(dataX, dataY, valToPosX, scaleX, xDim, xOff, colWid = inf, xValue = dispReader()) {
	if (dataY.length > 1) {
		let prevIdx = null;
		for (let i = 0, minDelta = Infinity; i < dataY.length; i++) if (dataY[i] !== void 0) {
			if (prevIdx != null) {
				let delta = abs(xValue(dataX, i) - xValue(dataX, prevIdx));
				if (delta < minDelta) {
					minDelta = delta;
					colWid = abs(valToPosX(xValue(dataX, i), scaleX, xDim, xOff) - valToPosX(xValue(dataX, prevIdx), scaleX, xDim, xOff));
				}
			}
			prevIdx = i;
		}
	}
	return colWid;
}
function bars(opts) {
	opts = opts || EMPTY_OBJ;
	const size = opts.size ?? [
		.6,
		Infinity,
		1
	];
	const align = opts.align || 0;
	const gap = opts.gap ?? 0;
	const [gapLead, gapTrail] = typeof gap == "number" ? [0, gap] : gap;
	const _extraGap = gapLead + gapTrail;
	let ro = opts.radius;
	ro = ro == null ? [0, 0] : typeof ro == "number" ? [ro, 0] : ro;
	const radiusFn = fnOrSelf(ro);
	const gapFactor = 1 - size[0];
	const _maxWidth = size[1] ?? Infinity;
	const _minWidth = size[2] ?? 1;
	const disp = opts.disp ?? EMPTY_OBJ;
	const _each = opts.each ?? ((_) => {});
	const { fill: dispFills, stroke: dispStrokes } = disp;
	return (u, seriesIdx, idx0, idx1) => {
		let { pxRatio } = u;
		return orient(u, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim) => {
			let pxRound = series.pxRound;
			let _align = align;
			let extraGap = _extraGap * pxRatio;
			let maxWidth = _maxWidth * pxRatio;
			let minWidth = _minWidth * pxRatio;
			let [valRadius, baseRadius] = radiusFn(u, seriesIdx);
			const _dirX = scaleX.dir * (scaleX.ori == 0 ? 1 : -1);
			let rect = scaleX.ori == 0 ? rectH : rectV;
			let each = scaleX.ori == 0 ? _each : (u, seriesIdx, i, top, lft, hgt, wid) => {
				_each(u, seriesIdx, i, lft, top, wid, hgt);
			};
			let dataY0 = u._base?.[seriesIdx];
			let band = dataY0 == null ? (u.bands ?? EMPTY_ARR).find((b) => b.series[0] == seriesIdx) : null;
			let fillDir = band != null ? band.dir : 0;
			let fillTo = dataY0 == null ? series.fillTo(u, seriesIdx, series.min, series.max, fillDir) : 0;
			let fillToY = pxRound(valToPosY(fillTo, scaleY, yDim, yOff));
			let xShift, barWid, fullGap, colWid = xDim;
			let strokeWidth = pxRound(series.width * pxRatio);
			let { x0, size } = disp;
			let xToPos = valToPosX;
			let xValue = dispReader();
			if (x0 != null && size != null) {
				_align = 1;
				dataX = x0.values(u, seriesIdx, idx0, idx1);
				xValue = dispReader(x0.kind);
				if (x0.unit == 2) xToPos = percentToPos;
				let width = size.values(u, seriesIdx, idx0, idx1);
				if (size.unit == 2) barWid = width * xDim;
				else barWid = valToPosX(width, scaleX, xDim, xOff) - valToPosX(0, scaleX, xDim, xOff);
				colWid = findColWidth(dataX, dataY, xToPos, scaleX, xDim, xOff, colWid, xValue);
				fullGap = colWid - barWid + extraGap;
			} else {
				colWid = findColWidth(dataX, dataY, valToPosX, scaleX, xDim, xOff, colWid);
				fullGap = colWid * gapFactor + extraGap;
				barWid = colWid - fullGap;
			}
			if (fullGap < 1) fullGap = 0;
			if (strokeWidth >= barWid / 2) strokeWidth = 0;
			if (fullGap < 5) pxRound = retArg0;
			let insetStroke = fullGap > 0;
			let rawBarWid = colWid - fullGap - (insetStroke ? strokeWidth : 0);
			barWid = pxRound(clamp(rawBarWid, minWidth, maxWidth));
			xShift = (_align == 0 ? barWid / 2 : _align == _dirX ? 0 : barWid) - _align * _dirX * (insetStroke ? gapLead * pxRatio + strokeWidth / 2 : 0);
			const _paths = {
				stroke: null,
				fill: null,
				clip: null,
				band: null,
				gaps: null,
				flags: 0
			};
			const colors = dispFills != null || dispStrokes != null ? colorPaths(u, seriesIdx, disp, series._fill, series._stroke, strokeWidth > 0) : null;
			const stroke = colors == null ? new Path2D() : null;
			let yValue = dispReader();
			let y0Value = dispReader();
			let hasY0 = dataY0 != null || band != null;
			if (band != null) dataY0 = u._data[band.series[1]];
			else if (dataY0 == null) {
				let { y0, y1 } = disp;
				if (y0 != null && y1 != null) {
					dataY = y1.values(u, seriesIdx, idx0, idx1);
					dataY0 = y0.values(u, seriesIdx, idx0, idx1);
					yValue = dispReader(y1.kind);
					y0Value = dispReader(y0.kind);
					hasY0 = true;
				}
			}
			let radVal = valRadius * barWid;
			let radBase = baseRadius * barWid;
			for (let i = _dirX == 1 ? idx0 : idx1; i >= idx0 && i <= idx1; i += _dirX) {
				let yVal = yValue(dataY, i);
				if (yVal == null) continue;
				if (hasY0) {
					let yVal0 = y0Value(dataY0, i) ?? 0;
					if (yVal - yVal0 == 0) continue;
					fillToY = valToPosY(yVal0, scaleY, yDim, yOff);
				}
				let xVal = xValue(dataX, i);
				let xPos = xToPos(xVal, scaleX, xDim, xOff);
				let yPos = valToPosY(yVal, scaleY, yDim, yOff);
				let lft = pxRound(xPos - xShift);
				let btm = pxRound(max(yPos, fillToY));
				let top = pxRound(min(yPos, fillToY));
				let barHgt = btm - top;
				if (yVal != fillTo) {
					let rv = yPos < fillToY ? radVal : radBase;
					let rb = yPos < fillToY ? radBase : radVal;
					const path = colors == null ? stroke : colors.path(i);
					if (path != null) rect(path, lft, top + floor(strokeWidth / 2), barWid, max(0, barHgt - strokeWidth), rv, rb);
					each(u, seriesIdx, i, lft - strokeWidth / 2, top, barWid + strokeWidth, barHgt);
				}
			}
			if (strokeWidth > 0) _paths.stroke = colors == null ? stroke : paintPaths(colors.groups, "stroke");
			else if (colors == null) {
				_paths._fill = series.width == 0 ? series._fill : series._stroke ?? series._fill;
				_paths.width = 0;
			}
			_paths.fill = colors == null ? stroke : paintPaths(colors.groups, "fill");
			return _paths;
		});
	};
}

// src/paths/spline.js
function splineInterp(interp, opts) {
	return (u, seriesIdx, idx0, idx1) => {
		return orient(u, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim) => {
			[idx0, idx1] = nonNullIdxs(dataY, idx0, idx1);
			if (idx0 == -1) return null;
			let pxRound = series.pxRound;
			let alignGaps = opts?.alignGaps ?? series.alignGaps ?? 0;
			let pixelForX = (val) => pxRound(valToPosX(val, scaleX, xDim, xOff));
			let pixelForY = (val) => pxRound(valToPosY(val, scaleY, yDim, yOff));
			let moveTo, bezierCurveTo, lineTo;
			if (scaleX.ori == 0) {
				moveTo = moveToH;
				lineTo = lineToH;
				bezierCurveTo = bezierCurveToH;
			} else {
				moveTo = moveToV;
				lineTo = lineToV;
				bezierCurveTo = bezierCurveToV;
			}
			const dir = scaleX.dir * (scaleX.ori == 0 ? 1 : -1);
			let firstXPos = pixelForX(dataX[dir == 1 ? idx0 : idx1]);
			let prevXPos = firstXPos;
			let xCoords = [];
			let yCoords = [];
			let hasGap = false;
			for (let i = dir == 1 ? idx0 : idx1; i >= idx0 && i <= idx1; i += dir) {
				let yVal = dataY[i];
				if (yVal != null) {
					let xVal = dataX[i];
					let xPos = pixelForX(xVal);
					xCoords.push(prevXPos = xPos);
					yCoords.push(pixelForY(dataY[i]));
				} else if (yVal === null) hasGap = true;
			}
			const _paths = {
				stroke: interp(xCoords, yCoords, moveTo, lineTo, bezierCurveTo, pxRound),
				fill: null,
				clip: null,
				band: null,
				gaps: null,
				flags: 1
			};
			const stroke = _paths.stroke;
			let [bandFillDir, bandClipDir] = bandFillClipDirs(u, seriesIdx);
			if (series.fill != null || bandFillDir != 0) {
				let fill = _paths.fill = new Path2D(stroke);
				let fillToY = pixelForY(series.fillTo(u, seriesIdx, series.min, series.max, bandFillDir));
				lineTo(fill, prevXPos, fillToY);
				lineTo(fill, firstXPos, fillToY);
			}
			if (!series.spanGaps) {
				let gaps = hasGap ? findGaps(dataX, dataY, idx0, idx1, dir, pixelForX, alignGaps) : [];
				_paths.gaps = gaps = series.gaps(u, seriesIdx, idx0, idx1, gaps);
				_paths.clip = clipGaps(gaps, scaleX.ori, xOff, yOff, xDim, yDim);
			}
			if (bandClipDir != 0) _paths.band = bandClipDir == 2 ? [clipBandLine(u, seriesIdx, idx0, idx1, stroke, -1), clipBandLine(u, seriesIdx, idx0, idx1, stroke, 1)] : clipBandLine(u, seriesIdx, idx0, idx1, stroke, bandClipDir);
			return _paths;
		});
	};
}

// src/paths/monotoneCubic.js
function monotoneCubic(opts) {
	return splineInterp(_monotoneCubic, opts);
}
function _monotoneCubic(xs, ys, moveTo, lineTo, bezierCurveTo, pxRound) {
	const n = xs.length;
	if (n < 2) return null;
	const path = new Path2D();
	moveTo(path, xs[0], ys[0]);
	if (n == 2) lineTo(path, xs[1], ys[1]);
	else {
		let ms = Array(n), ds = Array(n - 1), dys = Array(n - 1), dxs = Array(n - 1);
		for (let i = 0; i < n - 1; i++) {
			dys[i] = ys[i + 1] - ys[i];
			dxs[i] = xs[i + 1] - xs[i];
			ds[i] = dys[i] / dxs[i];
		}
		ms[0] = ds[0];
		for (let i = 1; i < n - 1; i++) if (ds[i] === 0 || ds[i - 1] === 0 || ds[i - 1] > 0 !== ds[i] > 0) ms[i] = 0;
		else {
			ms[i] = 3 * (dxs[i - 1] + dxs[i]) / ((2 * dxs[i] + dxs[i - 1]) / ds[i - 1] + (dxs[i] + 2 * dxs[i - 1]) / ds[i]);
			if (!isFinite(ms[i])) ms[i] = 0;
		}
		ms[n - 1] = ds[n - 2];
		for (let i = 0; i < n - 1; i++) bezierCurveTo(path, xs[i] + dxs[i] / 3, ys[i] + ms[i] * dxs[i] / 3, xs[i + 1] - dxs[i] / 3, ys[i + 1] - ms[i + 1] * dxs[i] / 3, xs[i + 1], ys[i + 1]);
	}
	return path;
}

// src/paths/catmullRomCentrip.js
function catmullRomCentrip(opts) {
	return splineInterp(catmullRomFitting, opts);
}
/**
* Interpolates a Catmull-Rom Spline through a series of x/y points
* Converts the CR Spline to Cubic Beziers for use with SVG items
*
* If 'alpha' is 0.5 then the 'Centripetal' variant is used
* If 'alpha' is 1 then the 'Chordal' variant is used
*
*/
function catmullRomFitting(xCoords, yCoords, moveTo, lineTo, bezierCurveTo, pxRound) {
	const alpha = .5;
	const path = new Path2D();
	const dataLen = xCoords.length;
	let p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, bp1x, bp1y, bp2x, bp2y, d1, d2, d3, A, B, N, M, d3powA, d2powA, d3pow2A, d2pow2A, d1pow2A, d1powA;
	moveTo(path, pxRound(xCoords[0]), pxRound(yCoords[0]));
	for (let i = 0; i < dataLen - 1; i++) {
		let p0i = i == 0 ? 0 : i - 1;
		p0x = xCoords[p0i];
		p0y = yCoords[p0i];
		p1x = xCoords[i];
		p1y = yCoords[i];
		p2x = xCoords[i + 1];
		p2y = yCoords[i + 1];
		if (i + 2 < dataLen) {
			p3x = xCoords[i + 2];
			p3y = yCoords[i + 2];
		} else {
			p3x = p2x;
			p3y = p2y;
		}
		d1 = sqrt(pow(p0x - p1x, 2) + pow(p0y - p1y, 2));
		d2 = sqrt(pow(p1x - p2x, 2) + pow(p1y - p2y, 2));
		d3 = sqrt(pow(p2x - p3x, 2) + pow(p2y - p3y, 2));
		d3powA = pow(d3, alpha);
		d3pow2A = pow(d3, alpha * 2);
		d2powA = pow(d2, alpha);
		d2pow2A = pow(d2, alpha * 2);
		d1powA = pow(d1, alpha);
		d1pow2A = pow(d1, alpha * 2);
		A = 2 * d1pow2A + 3 * d1powA * d2powA + d2pow2A;
		B = 2 * d3pow2A + 3 * d3powA * d2powA + d2pow2A;
		N = 3 * d1powA * (d1powA + d2powA);
		if (N > 0) N = 1 / N;
		M = 3 * d3powA * (d3powA + d2powA);
		if (M > 0) M = 1 / M;
		bp1x = (-d2pow2A * p0x + A * p1x + d1pow2A * p2x) * N;
		bp1y = (-d2pow2A * p0y + A * p1y + d1pow2A * p2y) * N;
		bp2x = (d3pow2A * p1x + B * p2x - d2pow2A * p3x) * M;
		bp2y = (d3pow2A * p1y + B * p2y - d2pow2A * p3y) * M;
		if (bp1x == 0 && bp1y == 0) {
			bp1x = p1x;
			bp1y = p1y;
		}
		if (bp2x == 0 && bp2y == 0) {
			bp2x = p2x;
			bp2y = p2y;
		}
		bezierCurveTo(path, bp1x, bp1y, bp2x, bp2y, p2x, p2y);
	}
	return path;
}

// src/uPlot.js
const cursorPlots = /* @__PURE__ */ new Set();
let mouseOwner = null;
function invalidateRects() {
	for (let u of cursorPlots) u.syncRect(true);
}
if (domEnv) {
	on(resize, win, invalidateRects);
	on(scroll, win, invalidateRects, true);
	on(dppxchange, win, () => {
		uPlot.pxRatio = pxRatio;
	});
}
const linearPath = true && true ? linear$1() : null;
const pointsPath = true ? points() : null;
function setDefaults(d, xo, yo, initY) {
	return (initY ? [d[0], d[1]].concat(d.slice(2)) : [d[0]].concat(d.slice(1))).map((o, i) => setDefault(o, i, xo, yo));
}
function setDefaults2(d, xyo) {
	return d.map((o, i) => i == 0 ? {} : assign({}, xyo, o));
}
function setDefault(o, i, xo, yo) {
	return assign({}, i == 0 ? xo : yo, o);
}
function snapNumX(self, dataMin, dataMax, scaleKey) {
	if (dataMin == null) return nullNullTuple;
	if (dataMin == dataMax) return self.scales[scaleKey].distr == 2 ? [dataMin, dataMax + 1] : rangeNum(dataMin, dataMax, rangePad, true);
	return [dataMin, dataMax];
}
function snapNumY(self, dataMin, dataMax) {
	return dataMin == null ? nullNullTuple : rangeNum(dataMin, dataMax, rangePad, true);
}
function snapLogY(self, dataMin, dataMax, scale) {
	return dataMin == null ? nullNullTuple : rangeLog(dataMin, dataMax, self.scales[scale].log, true);
}
const snapLogX = snapLogY;
function snapAsinhY(self, dataMin, dataMax, scale) {
	return dataMin == null ? nullNullTuple : rangeAsinh(dataMin, dataMax, self.scales[scale].log, true);
}
const snapAsinhX = snapAsinhY;
function findIncr(minVal, maxVal, incrs, dim, minSpace) {
	let minIncr = max(abs(minVal), abs(maxVal)) * (Number.EPSILON / 2);
	let delta = maxVal - minVal;
	let incrIdx = closestIdx(minSpace / dim * delta, incrs);
	do {
		let foundIncr = incrs[incrIdx];
		let foundSpace = dim * foundIncr / delta;
		if (foundSpace >= minSpace && foundIncr > minIncr) return [foundIncr, foundSpace];
	} while (++incrIdx < incrs.length);
	return [0, 0];
}
function pxRatioFont(font, pxRatio) {
	let fontSize, fontSizeCss;
	font = font.replace(/(\d+)px/, (m, p1) => (fontSize = round((fontSizeCss = +p1) * pxRatio)) + "px");
	return [
		font,
		fontSize,
		fontSizeCss
	];
}
function syncFontSize(axis, pxRatio) {
	if (axis.show) [axis.font, axis.labelFont].forEach((f) => {
		let size = roundDec(f[2] * pxRatio, 1);
		f[0] = f[0].replace(/[0-9.]+px/, size + "px");
		f[1] = size;
	});
}
function scanScaleInternal(self, scaleKey, i0, i1, cache, allValues) {
	let data = self._data;
	let series = self.series;
	let scale = self.scales[scaleKey];
	if (data == null || scale == null) return nullNullTuple;
	let scaleMin = inf;
	let scaleMax = -inf;
	let log = !allValues && scale.distr == 3;
	let asinh = scale.distr == 4;
	let minAbs = inf;
	function acc(si, data, facet, sorted, mirror) {
		if (data != null && data.length > 0) {
			let facetMin = facet.min;
			let facetMax = facet.max;
			let facetMinAbs = facet.minAbs;
			let scanAbs = asinh && (!cache || facetMinAbs === void 0);
			if (!cache || si == 0 || (asinh ? scanAbs : facetMin == null)) {
				facetMin = facetMax = null;
				let _i0 = max(0, ceil(i0 ?? 0));
				let _i1 = min(data.length - 1, floor(i1 ?? data.length - 1));
				if (scanAbs) [facetMin, facetMax, facetMinAbs] = getMinMaxAsinh(data, _i0, _i1, sorted, scale._minAbs);
				else if (_i0 <= _i1) [facetMin, facetMax] = getMinMax(data, _i0, _i1, sorted, log);
				if (facetMinAbs == Infinity) facetMinAbs = null;
				if (facetMin > facetMax) facetMin = facetMax = null;
				if (cache) {
					facet.min = facetMin;
					facet.max = facetMax;
					if (asinh) facet.minAbs = facetMinAbs;
				}
			}
			if (cache && mirror) {
				series[si].min = facetMin;
				series[si].max = facetMax;
				if (asinh) series[si].minAbs = facetMinAbs;
			}
			if (facetMin != null) scaleMin = min(scaleMin, facetMin);
			if (facetMax != null) scaleMax = max(scaleMax, facetMax);
			if (asinh && facetMinAbs != null) minAbs = min(minAbs, facetMinAbs);
		}
	}
	if (self.mode == 1) {
		if (series[0].scale == scaleKey) acc(0, data[0], series[0], series[0].sorted, false);
		else for (let i = 1; i < series.length; i++) {
			let s = series[i];
			if (s.show && s.scan && s.scale == scaleKey) acc(i, data[i], s, s.sorted, false);
		}
	} else for (let i = 1; i < series.length; i++) {
		let s = series[i];
		if (s.show && s.scan) for (let fi = 0; fi < s.facets.length; fi++) {
			let facet = s.facets[fi];
			if (facet.scan && facet.scale == scaleKey) acc(i, data[i][fi], facet, facet.sorted, fi == 1);
		}
	}
	let result = [scaleMin == Infinity ? null : scaleMin, scaleMax == -Infinity ? null : scaleMax];
	if (asinh) result.push(minAbs == Infinity ? null : minAbs);
	return result;
}
function scanScale(self, scaleKey, i0, i1, cache = false) {
	return scanScaleInternal(self, scaleKey, i0, i1, cache, false);
}
function scanCached(self, scaleKey, i0, i1) {
	return scanScaleInternal(self, scaleKey, i0, i1, true, false);
}
function scanCachedX(self, scaleKey) {
	return scanScaleInternal(self, scaleKey, null, null, true, true);
}
function asinhScale(self, scaleKey) {
	if (self.scales[scaleKey].scan == scanNone) return 1;
	let idxs = self.mode == 1 && self.series[0].scale != scaleKey ? self.series[0].idxs : EMPTY_ARR;
	return scanCached(self, scaleKey, idxs[0], idxs[1])[2] ?? 1;
}
function scanNone() {
	return nullNullTuple;
}
function scanAuto(self, scaleKey, i0, i1, viaAutoScaleX) {
	return self.scales[scaleKey].auto(self, viaAutoScaleX) ? scanCached(self, scaleKey, i0, i1) : scanNone(self);
}
function uPlot(opts, data, then) {
	const self = {
		uid: rand().toString(36).slice(-6),
		status: 0
	};
	opts = copy(opts);
	(opts.plugins || []).forEach((p) => {
		if (p.opts) opts = p.opts(self, opts) || opts;
	});
	let pxRatio$1 = self.pxRatio = opts.pxRatio ?? pxRatio;
	const mode = self.mode = opts.mode ?? 1;
	function setPxRatio(_pxRatio) {
		_pxRatio ??= pxRatio;
		if (_pxRatio != self.pxRatio) {
			self.pxRatio = _pxRatio;
			shouldSetCanvas = shouldLayout = true;
			commit();
		}
	}
	self.setPxRatio = setPxRatio;
	function getHPos(val, scale, dim, off) {
		let pct = scale.valToPct(val);
		return off + dim * (scale.dir == -1 ? 1 - pct : pct);
	}
	function getVPos(val, scale, dim, off) {
		let pct = scale.valToPct(val);
		return off + dim * (scale.dir == -1 ? pct : 1 - pct);
	}
	function getPos(val, scale, dim, off) {
		return scale.ori == 0 ? getHPos(val, scale, dim, off) : getVPos(val, scale, dim, off);
	}
	self.valToPosH = getHPos;
	self.valToPosV = getVPos;
	let ready = false;
	const can = placeTag("canvas");
	const ctx = self.ctx = can.getContext("2d", opts.ctxAttrs);
	const domRoot = opts.dom?.uplot !== false;
	const root = self.root = domRoot ? placeTag("div") : can;
	if (opts.id != null) root.id = opts.id;
	addClass(root, UPLOT);
	addClass(root, opts.class);
	if (domRoot && opts.title) {
		let title = placeDiv(TITLE, root);
		title.textContent = opts.title;
	}
	const hasLegend = true && (opts.legend?.show ?? legendOpts.show);
	const wrap = domRoot && (opts.title || hasLegend) ? placeDiv(WRAP, root) : root;
	if (domRoot && wrap == root) addClass(wrap, WRAP);
	const under = self.under = domRoot && opts.dom?.under !== false ? placeDiv(UNDER, wrap) : null;
	if (domRoot) wrap.appendChild(can);
	const over = self.over = domRoot && opts.dom?.over !== false ? placeDiv(OVER, wrap) : null;
	const usePathCache = opts.cache?.paths ?? true;
	const useDataCache = opts.cache?.data ?? true;
	const pxAlign = +(opts.pxAlign ?? 1);
	const pxRound = pxRoundGen(pxAlign);
	const ms = opts.ms || .001;
	function snapTimeX(self, dataMin, dataMax, scaleKey) {
		if (dataMin == null) return nullNullTuple;
		if (dataMin == dataMax) {
			let sc = self.scales[scaleKey];
			return sc.distr == 2 ? [dataMin, dataMax + 1] : sc.distr == 3 ? rangeLog(dataMin, dataMax, sc.log, false) : sc.distr == 4 ? rangeAsinh(dataMin, dataMax, sc.log, false) : [dataMin, dataMax + round(86400 / ms)];
		}
		return [dataMin, dataMax];
	}
	const series = self.series = mode == 1 ? setDefaults(opts.series || [], xSeriesOpts, ySeriesOpts, false) : setDefaults2(opts.series || [null], xySeriesOpts);
	const axes = self.axes = setDefaults(opts.axes || [], xAxisOpts, yAxisOpts, true);
	const scales = self.scales = {};
	const stackGroups = mode == 1 ? opts.stack?.groups || EMPTY_ARR : EMPTY_ARR;
	const stackPercent = mode == 1 && opts.stack?.percent === true;
	const bands = self.bands = stackGroups.length == 0 ? opts.bands || [] : [];
	function initBand(b) {
		b.fill = fnOrSelf(b.fill || null);
		b.dir = b.dir ?? -1;
	}
	bands.forEach(initBand);
	const stackedSeries = [];
	stackGroups.forEach((group) => {
		group.series.forEach((si) => {
			stackedSeries[si] = true;
		});
	});
	const xScaleKey = mode == 2 ? series[1].facets[0].scale : series[0].scale;
	const drawOrderMap = {
		axes: drawAxesGrid,
		series: drawSeries
	};
	const drawOrder = (opts.drawOrder || ["axes", "series"]).map((key) => drawOrderMap[key]);
	function initValToPct(sc) {
		const getVal = sc.distr == 3 ? (val) => log10(val > 0 ? val : sc.clamp(self, val, sc.min, sc.max, sc.key)) : sc.distr == 4 ? (val) => asinh(val, sc._asinh) : sc.distr == 100 ? (val) => sc.fwd(val) : (val) => val;
		return (val) => {
			let _val = getVal(val);
			let { _min, _max } = sc;
			let delta = _max - _min;
			return (_val - _min) / delta;
		};
	}
	function initScale(scaleKey) {
		let sc = scales[scaleKey];
		if (sc == null) {
			let scaleOpts = opts.scales?.[scaleKey] || EMPTY_OBJ;
			if (scaleOpts.from != null) {
				initScale(scaleOpts.from);
				sc = assign({}, scales[scaleOpts.from], scaleOpts, { key: scaleKey });
				sc.valToPct = initValToPct(sc);
				scales[scaleKey] = sc;
			} else {
				sc = scales[scaleKey] = assign({}, scaleKey == xScaleKey ? xScaleOpts : yScaleOpts, scaleOpts);
				sc.key = scaleKey;
				let isTime = true && sc.time;
				let rn = sc.range;
				let rangeYPolicy = rn == null ? rangeYAuto : null;
				let rangeIsArr = isArr(rn);
				if (scaleKey != xScaleKey || mode == 2 && !isTime) {
					if (rangeIsArr && (rn[0] == null || rn[1] == null)) {
						let partial = rn;
						let min = partial[0] == null ? autoRangePart : {
							hard: partial[0],
							soft: partial[0]
						};
						let max = partial[1] == null ? autoRangePart : {
							hard: partial[1],
							soft: partial[1]
						};
						rangeYPolicy = {
							zeroIf: rangeYAuto.zeroIf,
							min: partial[0] == null ? rangeYAuto.min : min,
							max: partial[1] == null ? rangeYAuto.max : max
						};
						rn = {
							min,
							max
						};
						rangeIsArr = false;
					}
					if (!rangeIsArr && isObj(rn)) {
						let cfg = rn;
						if (rangeYPolicy == null && cfg.flat == null) rangeYPolicy = cfg;
						rn = (self, dataMin, dataMax) => dataMin == null ? nullNullTuple : rangeNum(dataMin, dataMax, cfg);
					}
				}
				sc.range = fnOrSelf(rn || (isTime ? snapTimeX : scaleKey == xScaleKey ? sc.distr == 3 ? snapLogX : sc.distr == 4 ? snapAsinhX : snapNumX : sc.distr == 3 ? snapLogY : sc.distr == 4 ? snapAsinhY : snapNumY));
				if (scaleOpts.asinh == null && (rangeIsArr || sc.auto === false)) sc.asinh = 1;
				sc.auto = fnOrSelf(sc.auto);
				sc._policyY = rangeYPolicy;
				sc.scan ??= rangeIsArr && rn[0] != null && rn[1] != null ? false : null;
				sc._min = sc._max = null;
				sc.valToPct = initValToPct(sc);
			}
			let scan = sc.scan;
			if (sc.from == null || scaleOpts.scan != null) sc._minAbs = isObj(scan) ? scan.minAbs ?? 0 : 0;
			sc.scan = scan == null ? scanAuto : scan === true || isObj(scan) ? scanCached : scan === false ? scanNone : scan;
			sc.clamp = fnOrSelf(sc.clamp ?? clampScale);
			sc.asinh = sc.asinh == null ? asinhScale : fnOrSelf(sc.asinh);
		}
	}
	initScale("x");
	initScale("y");
	if (mode == 1) series.forEach((s) => {
		initScale(s.scale);
	});
	axes.forEach((a) => {
		initScale(a.scale);
	});
	for (let k in opts.scales) initScale(k);
	const scaleX = scales[xScaleKey];
	const xScaleDistr = scaleX.distr;
	let valToPosX, valToPosY;
	if (scaleX.ori == 0) {
		addClass(root, ORI_HZ);
		valToPosX = getHPos;
		valToPosY = getVPos;
	} else {
		addClass(root, ORI_VT);
		valToPosX = getVPos;
		valToPosY = getHPos;
	}
	const pendScales = {};
	const redrawDirty = /* @__PURE__ */ new Set();
	let isFullyExplicit = (min, max) => min != null && max != null;
	let isFullyImplicit = (min, max) => min == null && max == null;
	function applyCalculatedRange(wsc, psc, minMax, key) {
		if (isFullyImplicit(psc.min, psc.max)) {
			wsc.min = minMax[0];
			wsc.max = minMax[1];
			return;
		}
		let minExplicit = psc.min != null;
		let maxExplicit = psc.max != null;
		let min = minExplicit ? psc.min : minMax[0];
		let max = maxExplicit ? psc.max : minMax[1];
		if (isFullyExplicit(min, max) && min > max && minExplicit != maxExplicit) {
			wsc.min = scales[key].min;
			wsc.max = scales[key].max;
		} else {
			wsc.min = min;
			wsc.max = max;
		}
	}
	for (let k in scales) {
		let sc = scales[k];
		if (sc.min != null || sc.max != null) {
			pendScales[k] = {
				min: sc.min,
				max: sc.max
			};
			sc.min = sc.max = null;
		}
	}
	const _tzDate = true && (opts.tzDate || ((ts) => new Date(round(ts / ms))));
	const _fmtDate = true && (opts.fmtDate || fmtDate);
	const _timeAxisSplits = true && (ms == 1 ? timeAxisSplitsMs(_tzDate) : timeAxisSplitsS(_tzDate));
	const _timeAxisVals = true && timeAxisVals(_tzDate, timeAxisStamps(ms == 1 ? _timeAxisStampsMs : _timeAxisStampsS, _fmtDate));
	const _timeSeriesVal = true && timeSeriesVal(_tzDate, timeSeriesStamp("{YYYY}-{MM}-{DD} {h}:{mm}{aa}", _fmtDate));
	const activeIdxs = [];
	const legend = true && (self.legend = assign({}, legendOpts, opts.legend));
	const cursor = self.cursor = assign({}, cursorOpts, { drag: { y: mode == 2 } }, opts.cursor);
	const showLegend = true && (legend.show = domRoot && (legend.show ?? legendOpts.show));
	const showCursor = cursor.show = over != null && cursor.show;
	const markers = true && legend.markers;
	if (true) {
		legend.idxs = activeIdxs;
		legend.order = [];
		legend.count = 0;
		legend.range = [0, 0];
		markers.width = fnOrSelf(markers.width);
		markers.dash = fnOrSelf(markers.dash);
		markers.stroke = fnOrSelf(markers.stroke);
		markers.fill = fnOrSelf(markers.fill);
	}
	let legendView;
	let shouldRenderLegend = showLegend;
	let legendCols;
	let multiValLegend = false;
	const legendValuesPrev = [];
	let legendCandidates = null;
	let shouldSelectLegend = true;
	function hasLegendSelection() {
		return true && (legend.filter != null || legend.sort != null || legend.limit != null);
	}
	function compareLegendSeries(a, b) {
		return legend.sort(self, a, b) || a - b;
	}
	function selectLegend(force = false) {
		if (!true || !force && !shouldSelectLegend) return false;
		shouldSelectLegend = false;
		let count = max(0, series.length - 1);
		let start = 0, end = count;
		if (hasLegendSelection()) {
			legendCandidates ??= [];
			count = 0;
			for (let i = 1; i < series.length; i++) if (legend.filter == null || legend.filter(self, i)) legendCandidates[count++] = i;
			legendCandidates.length = count;
			if (legend.sort != null) legendCandidates.sort(compareLegendSeries);
			end = count;
			if (legend.limit != null) {
				const range = legend.limit(self, legendCandidates);
				start = clamp(floor(range[0]) || 0, 0, count);
				end = clamp(floor(range[1]) || 0, start, count);
			}
		} else legendCandidates = null;
		const order = legend.order;
		let changed = order.length != end - start;
		for (let i = start, j = 0; i < end; i++, j++) {
			const index = legendCandidates == null ? i + 1 : legendCandidates[i];
			changed = order[j] != index || changed;
			order[j] = index;
		}
		order.length = end - start;
		if (changed && showLegend) shouldRenderLegend = true;
		changed = changed || legend.count != count || legend.range[0] != start || legend.range[1] != end;
		legend.count = count;
		legend.range[0] = start;
		legend.range[1] = end;
		showCursor && syncCursorPointLegend(order);
		return changed;
	}
	let NULL_LEGEND_VALUES = {};
	if (true && legend.live) {
		const getMultiVals = series[1] ? series[1].values : null;
		multiValLegend = getMultiVals != null;
		legendCols = multiValLegend ? getMultiVals(self, 1, 0) : { _: 0 };
		for (let k in legendCols) NULL_LEGEND_VALUES[k] = "--";
	}
	const son = { show: true };
	const soff = { show: false };
	function handleLegendEvent(type, s, e) {
		let seriesIdx = s == null ? null : series.indexOf(s);
		if (cursor._lock || seriesIdx == -1) return;
		setCursorEvent(e);
		if (type == "click") {
			if ((e.ctrlKey || e.metaKey) != legend.isolate) {
				let isolate = series.some((s, i) => i > 0 && i != seriesIdx && s.show);
				series.forEach((s, i) => {
					i > 0 && setSeries(i, isolate ? i == seriesIdx ? son : soff : son, true, syncOpts.setSeries);
				});
			} else setSeries(seriesIdx, { show: !s.show }, true, syncOpts.setSeries);
		} else if (type == "focus") setSeries(seriesIdx, FOCUS_TRUE, true, syncOpts.setSeries);
		else if (focusedSeries != null) setSeries(null, FOCUS_TRUE, true, syncOpts.setSeries);
	}
	const mouseListeners = /* @__PURE__ */ new Map();
	let globalMouseMove = false;
	function stopGlobalMouseMove() {
		if (globalMouseMove) {
			offMouse(mousemove, doc);
			globalMouseMove = false;
		}
	}
	function onMouse(ev, targ, fn, onlyTarg = true) {
		const targListeners = mouseListeners.get(targ) || {};
		const listener = cursor.bind[ev](self, targ, fn, onlyTarg);
		if (listener != null) {
			on(ev, targ, targListeners[ev] = function(e) {
				if (mouseOwner == null || mouseOwner == self.uid) return listener.call(this, e);
			});
			mouseListeners.set(targ, targListeners);
		}
		return listener != null;
	}
	function offMouse(ev, targ, fn) {
		const targListeners = mouseListeners.get(targ) || {};
		for (let k in targListeners) if (ev == null || k == ev) {
			off(k, targ, targListeners[k]);
			delete targListeners[k];
		}
		if (ev == null) mouseListeners.delete(targ);
	}
	let fullWidCss = 0;
	let fullHgtCss = 0;
	let plotWidCss = 0;
	let plotHgtCss = 0;
	let plotLftCss = 0;
	let plotTopCss = 0;
	let plotLft = 0;
	let plotTop = 0;
	let plotWid = 0;
	let plotHgt = 0;
	let canToCssX = 1;
	let canToCssY = 1;
	self.bbox = {
		left: 0,
		top: 0,
		width: 0,
		height: 0
	};
	const stackDirty = /* @__PURE__ */ new Set();
	let shouldSetScales = false;
	let shouldSetCanvas = false;
	let shouldLayout = false;
	let shouldSetCursor = false;
	let shouldSetSelect = false;
	let shouldSetLegend = false;
	function setSize({ width, height }) {
		if (width != self.width || height != self.height) {
			self.width = fullWidCss = width;
			self.height = fullHgtCss = height;
			shouldSetCanvas = shouldLayout = true;
			commit();
		}
	}
	self.setSize = setSize;
	function sizeAxes(ori, sizes) {
		let changed = false;
		axes.forEach((axis, i) => {
			if (axis._show && axis.side % 2 == ori) {
				let size = ceil(axis.size(self, ori == 0 ? null : axis._values, i));
				changed = changed || size != axis._size;
				axis._size = size;
				sizes[axis.side] += max(0, size + (axis.label != null ? axis.labelSize : 0));
			}
		});
		return changed;
	}
	function reserveVerticalAxes(sizes) {
		for (let axis of axes) if (axis._show && axis.side % 2 == 1) sizes[axis.side] += max(0, axis._sizeHint + (axis.label != null ? axis.labelSize : 0));
	}
	function calcPlotDim(ori, sizes) {
		let start = ori == 0 ? 3 : 0;
		let end = ori == 0 ? 1 : 2;
		let off = sizes[start] + _padding[start];
		let dim = (ori == 0 ? fullWidCss : fullHgtCss) - off - sizes[end] - _padding[end];
		let bb = self.bbox;
		if (ori == 0) {
			plotLftCss = off;
			plotWidCss = dim;
			plotLft = bb.left = incrRound(off * pxRatio$1, .5);
			plotWid = bb.width = incrRound(dim * pxRatio$1, .5);
		} else {
			plotTopCss = off;
			plotHgtCss = dim;
			plotTop = bb.top = incrRound(off * pxRatio$1, .5);
			plotHgt = bb.height = incrRound(dim * pxRatio$1, .5);
		}
	}
	function resetScalePaths(changed) {
		series.forEach((s, i) => {
			if (mode == 2 ? i > 0 && s.facets.some((f) => changed[f.scale]) : changed[s.scale]) s._paths = null;
		});
	}
	function rangeYScales(ori, dim, changedY) {
		for (let k in scales) {
			let sc = scales[k];
			if (sc._rawY == null || sc.ori != ori) continue;
			let axis = axes[sc.axis];
			let [rawMin, rawMax] = sc._rawY;
			let space = ori == 0 && rawMin != null && rawMax != null ? axis.space(self, sc.axis, rawMin, rawMax, dim) : 50;
			let result = sc._rangeY = rangeY(rawMin, rawMax, dim, sc._policyY, axis.ramp, axis.exact, space);
			let min = result?.min ?? null;
			let max = result?.max ?? null;
			if (sc.min != min || sc.max != max) {
				sc.min = sc._min = min;
				sc.max = sc._max = max;
				changedY.push(k);
				resetScalePaths({ [k]: true });
				if ((showCursor || cursorDists != null || hasLegendSelection()) && cursor.left >= 0) shouldSetCursor = shouldSetLegend = true;
				shouldSelectLegend = shouldSelectLegend || hasLegendSelection();
			}
		}
	}
	function updateLayout() {
		let pxRatioChanged = pxRatio$1 != self.pxRatio;
		if (pxRatioChanged) {
			pxRatio$1 = self.pxRatio;
			axes.forEach((axis) => {
				syncFontSize(axis, pxRatio$1);
				axis._labelValues = axis._labelWidths = null;
			});
		}
		let prevLeft = plotLftCss;
		let prevTop = plotTopCss;
		let prevWidth = plotWidCss;
		let prevHeight = plotHgtCss;
		let axesChanged = false;
		let early = false;
		let sizes = [
			0,
			0,
			0,
			0
		];
		sidesWithAxes.fill(false);
		axes.forEach((axis) => {
			let sc = scales[axis.scale];
			let show = axis.show && (sc._rawY != null ? sc._rawY[0] : sc.min) != null;
			axesChanged = axesChanged || axis._show != show;
			axis._show = show;
			axis._splits = axis._values = null;
			early = early || show && axis.size === autoAxisSize && axis.side % 2 == 0;
			if (show && (axis._sizeHint > 0 || axis.label != null && axis.labelSize > 0)) sidesWithAxes[axis.side] = true;
		});
		let changedY = [];
		if (!early) axesChanged = sizeAxes(0, sizes) || axesChanged;
		padding.forEach((p, i) => {
			_padding[i] = isArr(p) ? p[0] : p ?? autoPadSide(i);
		});
		if (early) {
			reserveVerticalAxes(sizes);
			calcPlotDim(0, sizes);
			rangeYScales(0, plotWidCss, changedY);
			axesCalc(0);
			axesChanged = sizeAxes(0, sizes) || axesChanged;
			sizes[1] = sizes[3] = 0;
		}
		calcPlotDim(1, sizes);
		rangeYScales(1, plotHgtCss, changedY);
		axesCalc(1);
		axesChanged = sizeAxes(1, sizes) || axesChanged;
		if (!early) {
			calcPlotDim(0, sizes);
			rangeYScales(0, plotWidCss, changedY);
			axesCalc(0);
		}
		resolvePadding(self, sizes[3], sizes[1]);
		calcPlotDim(0, sizes);
		axesChanged = calcAxesRects() || axesChanged;
		let plotChanged = plotLftCss != prevLeft || plotTopCss != prevTop || plotWidCss != prevWidth || plotHgtCss != prevHeight;
		let resized = shouldSetCanvas;
		shouldSetCanvas = false;
		if (resized) setCanvasSize();
		if (plotChanged || pxRatioChanged) resetYSeries(false);
		if (plotChanged) resizeOverlays(prevWidth, prevHeight);
		if (showCursor && !shouldSetCursor && (plotChanged || resized)) syncCursorPoints();
		if (resized || plotChanged || axesChanged) {
			shouldSelectLegend = shouldSelectLegend || hasLegendSelection();
			applyLayout(plotChanged, axesChanged);
			fire("setSize");
		}
		return changedY;
	}
	function calcAxesRects() {
		let changed = false;
		let off1 = plotLftCss + plotWidCss;
		let off2 = plotTopCss + plotHgtCss;
		let off3 = plotLftCss;
		let off0 = plotTopCss;
		function incrOffset(side, size) {
			switch (side) {
				case 1:
					off1 += size;
					return off1 - size;
				case 2:
					off2 += size;
					return off2 - size;
				case 3:
					off3 -= size;
					return off3 + size;
				case 0:
					off0 -= size;
					return off0 + size;
			}
		}
		axes.forEach((axis, i) => {
			if (axis.show && axis._show) {
				let side = axis.side;
				let pos = incrOffset(side, axis._size);
				let lpos = axis.label != null ? incrOffset(side, axis.labelSize) : null;
				changed = changed || pos != axis._pos || lpos != axis._lpos;
				axis._pos = pos;
				axis._lpos = lpos;
			}
		});
		return changed;
	}
	if (cursor.dataIdx == null) {
		let hov = cursor.hover;
		let skip = hov.skip = new Set(hov.skip ?? []);
		skip.add(void 0);
		let prox = hov.prox = fnOrSelf(hov.prox);
		let bias = hov.bias ??= 0;
		cursor.dataIdx = (self, seriesIdx, cursorIdx, valAtPosX) => {
			if (seriesIdx == 0) return cursorIdx;
			let idx2 = cursorIdx;
			let _prox = prox(self, seriesIdx, cursorIdx, valAtPosX) ?? Infinity;
			let withProx = _prox >= 0 && _prox < Infinity;
			let xDim = scaleX.ori == 0 ? plotWidCss : plotHgtCss;
			let cursorLft = cursor.left;
			let xValues = data[0];
			let yValues = data[seriesIdx];
			if (skip.has(yValues[cursorIdx])) {
				idx2 = null;
				let nonNullLft = null, nonNullRgt = null, j;
				if (bias == 0 || bias == -1) {
					j = cursorIdx;
					while (nonNullLft == null && --j >= i0) if (!skip.has(yValues[j])) nonNullLft = j;
				}
				if (bias == 0 || bias == 1) {
					j = cursorIdx;
					while (nonNullRgt == null && ++j <= i1) if (!skip.has(yValues[j])) nonNullRgt = j;
				}
				if (nonNullLft != null || nonNullRgt != null) {
					if (withProx) {
						let lftPos = nonNullLft == null ? -Infinity : valToPosX(xValues[nonNullLft], scaleX, xDim, 0);
						let rgtPos = nonNullRgt == null ? Infinity : valToPosX(xValues[nonNullRgt], scaleX, xDim, 0);
						let lftDelta = cursorLft - lftPos;
						let rgtDelta = rgtPos - cursorLft;
						if (lftDelta <= rgtDelta) {
							if (lftDelta <= _prox) idx2 = nonNullLft;
						} else if (rgtDelta <= _prox) idx2 = nonNullRgt;
					} else idx2 = nonNullRgt == null ? nonNullLft : nonNullLft == null ? nonNullRgt : cursorIdx - nonNullLft <= nonNullRgt - cursorIdx ? nonNullLft : nonNullRgt;
				}
			} else if (withProx) {
				if (abs(cursorLft - valToPosX(xValues[cursorIdx], scaleX, xDim, 0)) > _prox) idx2 = null;
			}
			return idx2;
		};
	}
	const setCursorEvent = (e) => {
		cursor.event = e;
	};
	cursor.idxs = activeIdxs;
	const cursorDists = cursor.dists = cursor.trackDists ? [] : null;
	cursor._lock = false;
	let points = cursor.points;
	points.show = fnOrSelf(points.show);
	points.size = fnOrSelf(points.size);
	points.stroke = fnOrSelf(points.stroke);
	points.width = fnOrSelf(points.width);
	points.fill = fnOrSelf(points.fill);
	const focus = self.focus = assign({}, opts.focus || { alpha: .3 }, cursor.focus);
	const cursorFocus = focus.prox >= 0;
	const cursorOnePt = cursorFocus && points.one;
	let cursorPts = [];
	let cursorPtsLft = [];
	let cursorPtsTop = [];
	let cursorPtsWid = [];
	let cursorPtsHgt = [];
	let cursorPtSeries = null;
	let cursorPtMembers = null;
	function syncCursorPointLegend(order) {
		const restricted = order.length < series.length - 1;
		if (!restricted && !cursorPtMembers?.length) return;
		if (restricted) {
			cursorPtMembers ??= [];
			cursorPtMembers.length = series.length;
			cursorPtMembers.fill(false);
			for (let si of order) cursorPtMembers[si] = true;
		}
		for (let i = 0; i < cursorPts.length; i++) {
			let pt = cursorPts[i];
			if (pt != null) (restricted && !cursorPtMembers[cursorOnePt ? cursorPtSeries : i] ? addClass : remClass)(pt, LEGEND_EXCLUDE);
		}
		if (!restricted) cursorPtMembers.length = 0;
	}
	function initCursorPt(s, si) {
		let pt = points.show(self, si);
		if (pt instanceof HTMLElement) {
			addClass(pt, CURSOR_PT);
			addClass(pt, s.class);
			elTrans(pt, -10, -10, plotWidCss, plotHgtCss);
			over.insertBefore(pt, cursorPts[si]);
			return pt;
		}
	}
	function initSeries(s, i) {
		s.scan = s.scan ?? s.auto ?? (mode == 2 || i > 0);
		if (mode == 2 && i > 0) s.facets.forEach((f) => {
			f.scan = f.scan ?? f.auto ?? true;
		});
		if (mode == 1 || i > 0) {
			let isTime = true && mode == 1 && scales[s.scale].time;
			let sv = s.value;
			s.value = isTime ? isStr(sv) ? timeSeriesVal(_tzDate, timeSeriesStamp(sv, _fmtDate)) : sv || _timeSeriesVal : sv || numSeriesVal;
			s.label = s.label || (isTime ? "Time" : "Value");
		}
		if (cursorOnePt || i > 0) {
			s.width = s.width ?? 1;
			s.paths = s.paths || linearPath || retNull;
			s.fillTo = fnOrSelf(s.fillTo || seriesFillTo);
			s.pxAlign = +(s.pxAlign ?? pxAlign);
			s.pxRound = pxRoundGen(s.pxAlign);
			s.stroke = fnOrSelf(s.stroke || null);
			s.fill = fnOrSelf(s.fill || null);
			s._stroke = s._fill = s._paths = s._focus = null;
			let _ptDia = ptDia(max(1, s.width), 1);
			let points = s.points = assign({}, {
				shape: 1,
				size: _ptDia,
				width: max(1, _ptDia * .2),
				stroke: s.stroke,
				space: _ptDia * 2,
				paths: pointsPath,
				_stroke: null,
				_fill: null
			}, s.points);
			points.show = fnOrSelf(points.show);
			points.filter = fnOrSelf(points.filter);
			points.fill = fnOrSelf(points.fill);
			points.stroke = fnOrSelf(points.stroke);
			points.paths = fnOrSelf(points.paths);
			points.pxAlign = s.pxAlign;
		}
		activeIdxs.splice(i, 0, null);
		cursorDists?.splice(i, 0, inf);
		if (showCursor) {
			let pt = null;
			if (cursorOnePt) {
				if (i == 0) pt = initCursorPt(s, i);
			} else if (i > 0) pt = initCursorPt(s, i);
			cursorPts.splice(i, 0, pt);
			cursorPtsLft.splice(i, 0, 0);
			cursorPtsTop.splice(i, 0, 0);
			cursorPtsWid.splice(i, 0, 0);
			cursorPtsHgt.splice(i, 0, 0);
		}
		focusedSeries != null && setSeriesFocus(s, i);
	}
	function addSeries(opts, si) {
		if (stackGroups.length > 0) return;
		si ??= series.length;
		opts = mode == 1 ? setDefault(opts, si, xSeriesOpts, ySeriesOpts) : setDefault(opts, si, {}, xySeriesOpts);
		clearDispCache();
		series.splice(si, 0, opts);
		invalidateBandGroups();
		true && legend.values.splice(si, 0, null);
		multiValLegend && legendValuesPrev.splice(si, 0, null);
		initSeries(series[si], si);
		if (cursorPtSeries != null && cursorPtSeries >= si) {
			cursorPtSeries++;
			shouldSetCursor = true;
		}
		shouldSelectLegend = true;
		shouldRenderLegend = showLegend;
		fire("addSeries", si);
	}
	self.addSeries = addSeries;
	function delSeries(i) {
		if (stackGroups.length > 0) return;
		clearDispCache();
		series.splice(i, 1);
		invalidateBandGroups();
		true && legend.values.splice(i, 1);
		multiValLegend && legendValuesPrev.splice(i, 1);
		shouldRenderLegend = showLegend;
		activeIdxs.splice(i, 1);
		cursorDists?.splice(i, 1);
		shouldSelectLegend = true;
		if (showCursor) {
			cursorPts.splice(i, 1)[0]?.remove();
			cursorPtsLft.splice(i, 1);
			cursorPtsTop.splice(i, 1);
			cursorPtsWid.splice(i, 1);
			cursorPtsHgt.splice(i, 1);
		}
		if (cursorPtSeries != null && cursorPtSeries >= i) {
			cursorPtSeries = cursorPtSeries == i ? null : cursorPtSeries - 1;
			cursorPtSeries ?? syncCursorPoints();
			shouldSetCursor = true;
		}
		fire("delSeries", i);
	}
	self.delSeries = delSeries;
	const sidesWithAxes = [
		false,
		false,
		false,
		false
	];
	function initAxis(axis, i) {
		axis._show = axis.show;
		if (axis.show) {
			let isVt = axis.side % 2;
			let sc = scales[axis.scale];
			if (sc == null) {
				axis.scale = isVt ? series[1].scale : xScaleKey;
				sc = scales[axis.scale];
			}
			let cfg = opts.scales?.[axis.scale];
			sc._axisY = sc._axisY || sc.axis === i && (mode == 2 || axis.scale != xScaleKey) && sc.ori == isVt && sc.distr == 1 && !sc.time && cfg?.auto !== false && sc._policyY != null && sc.from == null && !Object.values(scales).some((s) => s.from == axis.scale) && axis.incrs == null && axis.splits == null && (!isVt || opts.axes?.[i]?.space == null);
			let isTime = true && sc.time;
			let autoSize = axis.size == "auto";
			axis._sizeHint = autoSize || isFn(axis.size) ? yAxisOpts.size : axis.size;
			axis.size = autoSize ? autoAxisSize : fnOrSelf(axis.size);
			axis.space = fnOrSelf(axis.space);
			axis.rotate = fnOrSelf(axis.rotate);
			if (isArr(axis.incrs)) axis.incrs.forEach((incr) => {
				!fixedDec.has(incr) && fixedDec.set(incr, guessDec(incr));
			});
			axis.incrs = fnOrSelf(axis.incrs || (sc.distr == 2 ? wholeIncrs : isTime ? ms == 1 ? timeIncrsMs : timeIncrsS : numIncrs));
			axis.splits = fnOrSelf(axis.splits || (isTime && sc.distr == 1 ? _timeAxisSplits : sc.distr == 3 ? logAxisSplits : sc.distr == 4 ? asinhAxisSplits : numAxisSplits));
			axis.stroke = fnOrSelf(axis.stroke);
			axis.grid.stroke = fnOrSelf(axis.grid.stroke);
			axis.ticks.stroke = fnOrSelf(axis.ticks.stroke);
			axis.border.stroke = fnOrSelf(axis.border.stroke);
			let av = axis.values;
			axis.values = isArr(av) && !isArr(av[0]) ? fnOrSelf(av) : isTime ? isArr(av) ? timeAxisVals(_tzDate, timeAxisStamps(av, _fmtDate)) : isStr(av) ? timeAxisVal(_tzDate, av) : av || _timeAxisVals : av || numAxisVals;
			axis.filter = fnOrSelf(axis.filter || (sc.distr >= 3 && sc.log == 10 ? log10AxisValsFilt : (sc.distr == 3 || sc.distr == 4) && sc.log == 2 ? log2AxisValsFilt : retArg1));
			axis.font = pxRatioFont(axis.font, pxRatio$1);
			axis.labelFont = pxRatioFont(axis.labelFont, pxRatio$1);
			axis._size = 0;
			axis._space = axis._rotate = axis._incrs = axis._found = axis._splits = axis._values = axis._labelValues = axis._labelWidths = null;
			if (domRoot && axis.dom && axis._sizeHint > 0) axis._el = placeDiv(AXIS, wrap);
		}
	}
	function autoPadSide(side) {
		let [hasTopAxis, hasRgtAxis, hasBtmAxis, hasLftAxis] = sidesWithAxes;
		let ori = side % 2;
		let size = 0;
		if (ori == 0 && (hasLftAxis || hasRgtAxis)) size = side == 0 && !hasTopAxis || side == 2 && !hasBtmAxis ? round(xAxisOpts.size / 3) : 0;
		if (ori == 1 && (hasTopAxis || hasBtmAxis)) size = side == 1 && !hasRgtAxis || side == 3 && !hasLftAxis ? round(yAxisOpts.size / 2) : 0;
		return size;
	}
	const padding = self.padding = (opts.padding || [
		null,
		null,
		null,
		null
	]).slice();
	const _padding = self._padding = [
		0,
		0,
		0,
		0
	];
	let dataLen;
	let i0 = null;
	let i1 = null;
	const idxs = mode == 1 ? series[0].idxs : null;
	let data0 = null;
	let viaAutoScaleX = false;
	function stackData(rawData) {
		let bandIdx = 0;
		let bandsChanged = false;
		let stackedData = rawData.slice();
		let baseData = self._base = Array(rawData.length).fill(null);
		stackGroups.forEach((group) => {
			let mixed = group.dir == 0;
			let accum = Array(dataLen).fill(0);
			let negAccum = mixed ? Array(dataLen).fill(0) : null;
			let prevSeriesIdx = null;
			group.series.forEach((si) => {
				if (!series[si].show) return;
				let raw = rawData[si];
				if (raw != null) {
					let stacked = stackedData[si] = Array(raw.length);
					let base = mixed ? baseData[si] = Array(raw.length) : null;
					for (let i = 0; i < raw.length; i++) {
						let value = raw[i];
						let sums = mixed && value < 0 ? negAccum : accum;
						if (mixed) base[i] = value == null ? value : sums[i];
						stacked[i] = value == null ? value : sums[i] += value;
					}
				}
				if (!mixed && prevSeriesIdx != null) {
					let prevBand = bands[bandIdx];
					bandsChanged = bandsChanged || prevBand == null || prevBand.series[0] != si || prevBand.series[1] != prevSeriesIdx;
					bands[bandIdx++] = {
						series: [si, prevSeriesIdx],
						dir: -group.dir,
						fill: retNull
					};
				}
				prevSeriesIdx = si;
			});
			if (stackPercent) {
				let negTotals = mixed ? negAccum : group.dir == -1 ? accum : null;
				if (negTotals != null) for (let i = 0; i < negTotals.length; i++) negTotals[i] = abs(negTotals[i]);
				group.series.forEach((si) => {
					let stacked = stackedData[si];
					if (series[si].show && stacked != null) {
						for (let i = 0; i < stacked.length; i++) if (stacked[i] != null) {
							let total = mixed && stacked[i] < 0 ? negAccum[i] : accum[i];
							stacked[i] = total == 0 ? 0 : stacked[i] / total;
							if (mixed) baseData[si][i] = total == 0 ? 0 : baseData[si][i] / total;
						}
					}
				});
			}
		});
		bandsChanged = bandsChanged || bands.length != bandIdx;
		bands.length = bandIdx;
		if (bandsChanged) invalidateBandGroups();
		return stackedData;
	}
	function setScaleData(rawData) {
		let scaleData = stackGroups.length == 0 ? rawData : stackData(rawData);
		if (xScaleDistr == 2) {
			if (scaleData == rawData) scaleData = scaleData.slice();
			let _data0 = self._data?.[0];
			if (_data0?.length != dataLen) {
				_data0 = Array(dataLen);
				for (let i = 0; i < dataLen; i++) _data0[i] = i;
			}
			scaleData[0] = _data0;
		}
		self._data = data = scaleData;
		if (stackDirty.size > 0) {
			stackDirty.clear();
			shouldSetCursor = shouldSetCursor || cursor.left >= 0;
			shouldSetLegend = true;
		}
	}
	function setData(_data, _resetScales) {
		let rawData = _data ?? [];
		if (rawData !== self.data) clearDispCache();
		if (mode == 2) {
			self.data = self._data = data = rawData;
			dataLen = 0;
			for (let i = 1; i < series.length; i++) dataLen += data[i][0].length;
		} else {
			if (rawData.length == 0) rawData = [[]];
			self.data = rawData;
			data0 = rawData[0];
			dataLen = data0.length;
			setScaleData(rawData);
		}
		resetYSeries(true);
		if (cursorDists != null || hasLegendSelection()) {
			shouldSetCursor = shouldSetCursor || cursor.left >= 0;
			shouldSetLegend = shouldSelectLegend = true;
		}
		fire("setData");
		if (xScaleDistr == 2) shouldLayout = true;
		if (_resetScales !== false) {
			let xsc = scaleX;
			if (xsc.auto(self, viaAutoScaleX)) autoScaleX();
			else setRange(xScaleKey, xsc.min, xsc.max);
			shouldSetCursor = shouldSetCursor || cursor.left >= 0;
			shouldSetLegend = true;
			commit();
		}
	}
	self.setData = setData;
	function resetAutoScaleXIdxs() {
		if (mode == 1) {
			if (dataLen > 0) {
				i0 = idxs[0] = 0;
				i1 = idxs[1] = dataLen - 1;
			} else {
				i0 = idxs[0] = null;
				i1 = idxs[1] = null;
			}
		}
	}
	function autoScaleX() {
		viaAutoScaleX = true;
		resetAutoScaleXIdxs();
		setRange(xScaleKey, null, null);
	}
	let ctxStroke, ctxFill, ctxWidth, ctxDash, ctxJoin, ctxCap, ctxFont, ctxAlign, ctxBaseline;
	let ctxAlpha;
	function setCtxStroke(stroke, width, dash, cap, join) {
		stroke ??= transparent;
		dash ??= EMPTY_ARR;
		cap ??= "butt";
		join ??= "round";
		if (stroke != ctxStroke) ctx.strokeStyle = ctxStroke = stroke;
		if (width != ctxWidth) ctx.lineWidth = ctxWidth = width;
		if (join != ctxJoin) ctx.lineJoin = ctxJoin = join;
		if (cap != ctxCap) ctx.lineCap = ctxCap = cap;
		if (dash != ctxDash) ctx.setLineDash(ctxDash = dash);
	}
	function setFontStyle(font, fill, align, baseline) {
		if (fill != ctxFill) ctx.fillStyle = ctxFill = fill;
		if (font != ctxFont) ctx.font = ctxFont = font;
		if (align != ctxAlign) ctx.textAlign = ctxAlign = align;
		if (baseline != ctxBaseline) ctx.textBaseline = ctxBaseline = baseline;
	}
	function applyScanRange(wsc, psc, minMax, key) {
		wsc._minAbs = minMax[2];
		if (wsc._axisY && isFullyImplicit(psc.min, psc.max)) {
			scales[key]._rawY = minMax;
			shouldLayout = true;
		} else applyCalculatedRange(wsc, psc, wsc.range(self, minMax[0], minMax[1], key), key);
	}
	const AUTOSCALE = {
		min: null,
		max: null
	};
	function setScales() {
		for (let k in scales) {
			let sc = scales[k];
			if (pendScales[k] == null && (sc.min == null || pendScales[xScaleKey] != null && sc.auto(self, viaAutoScaleX))) pendScales[k] = AUTOSCALE;
		}
		for (let k in scales) {
			let sc = scales[k];
			if (pendScales[k] == null && sc.from != null && pendScales[sc.from] != null) pendScales[k] = AUTOSCALE;
		}
		if (pendScales[xScaleKey] != null) {
			resetYSeries(false);
			for (let k in scales) {
				if (mode == 2 || k == xScaleKey) continue;
				if (!pendScales[xScaleKey].redraw) redrawDirty.add(k);
				let psc = pendScales[k];
				if (redrawDirty.has(k) && (scales[k].distr == 4 || psc != null && !isFullyExplicit(psc.min, psc.max))) resetScaleSeries(k);
			}
		}
		let wipScales = {};
		for (let k in pendScales) {
			let psc = pendScales[k];
			if (psc != null) {
				let wsc = wipScales[k] = copy(scales[k], fastIsObj);
				wsc._minAbs = void 0;
				if (scales[k]._rawY != null) {
					shouldLayout = true;
					scales[k]._rawY = null;
				}
				if (isFullyExplicit(psc.min, psc.max)) {
					wsc.min = psc.min;
					wsc.max = psc.max;
				} else if (dataLen == 0 && wsc.from == null) applyScanRange(wsc, psc, wsc.scan(self, k, void 0, void 0, viaAutoScaleX), k);
				else if (k != xScaleKey || mode == 2) {
					wsc.min = inf;
					wsc.max = -inf;
				}
			}
		}
		if (dataLen > 0) {
			series.forEach((s, i) => {
				if (mode == 1) {
					let k = s.scale;
					let psc = pendScales[k];
					if (psc == null) return;
					let wsc = wipScales[k];
					if (i == 0) {
						if (!isFullyExplicit(psc.min, psc.max)) {
							let minMax = wsc.scan == scanAuto || wsc.scan == scanCached ? scanCachedX(self, k) : wsc.scan(self, k, void 0, void 0, viaAutoScaleX);
							wsc._minAbs = minMax[2];
							applyCalculatedRange(wsc, psc, wsc.range(self, minMax[0], minMax[1], k), k);
						}
						i0 = closestIdx(wsc.min, data[0]);
						i1 = closestIdx(wsc.max, data[0]);
						if (i1 - i0 > 1) {
							if (data[0][i0] < wsc.min) i0++;
							if (data[0][i1] > wsc.max) i1--;
						}
						s.min = data0[i0];
						s.max = data0[i1];
					}
					s.idxs[0] = i0;
					s.idxs[1] = i1;
				}
			});
			for (let k in wipScales) {
				let wsc = wipScales[k];
				let psc = pendScales[k];
				if (wsc.from == null && !isFullyExplicit(psc.min, psc.max) && (mode == 2 || k != xScaleKey)) applyScanRange(wsc, psc, wsc.scan(self, k, i0, i1, viaAutoScaleX), k);
			}
		}
		for (let k in wipScales) {
			let wsc = wipScales[k];
			if (wsc.from != null) {
				let base = wipScales[wsc.from];
				if (base.min == null) wsc.min = wsc.max = null;
				else {
					let minMax = wsc.range(self, base.min, base.max, k);
					wsc.min = minMax[0];
					wsc.max = minMax[1];
				}
			}
		}
		let changed = {};
		let anyChanged = false;
		for (let k in wipScales) {
			let wsc = wipScales[k];
			let sc = scales[k];
			let distr = sc.distr;
			if (sc._rawY != null) continue;
			if (sc.min != wsc.min || sc.max != wsc.max) {
				sc.min = wsc.min;
				sc.max = wsc.max;
				changed[k] = anyChanged = true;
			}
			if (distr == 4) {
				let linthresh = sc.asinh == asinhScale && wsc._minAbs !== void 0 ? wsc._minAbs ?? 1 : sc.asinh(self, k);
				if (sc._asinh != linthresh) {
					sc._asinh = linthresh;
					changed[k] = anyChanged = true;
				}
			}
			if (changed[k]) {
				sc._min = distr == 3 ? log10(sc.min) : distr == 4 ? asinh(sc.min, sc._asinh) : distr == 100 ? sc.fwd(sc.min) : sc.min;
				sc._max = distr == 3 ? log10(sc.max) : distr == 4 ? asinh(sc.max, sc._asinh) : distr == 100 ? sc.fwd(sc.max) : sc.max;
			}
		}
		if (anyChanged) {
			resetScalePaths(changed);
			for (let k in changed) {
				shouldLayout = true;
				fire("setScale", k);
			}
			if ((showCursor || cursorDists != null || hasLegendSelection()) && cursor.left >= 0) shouldSetCursor = shouldSetLegend = true;
			shouldSelectLegend = shouldSelectLegend || hasLegendSelection();
		}
		for (let k in pendScales) pendScales[k] = null;
	}
	function getOuterIdxs(ydata) {
		let _i0 = clamp(i0 - 1, 0, dataLen - 1);
		let _i1 = clamp(i1 + 1, 0, dataLen - 1);
		while (ydata[_i0] == null && _i0 > 0) _i0--;
		while (ydata[_i1] == null && _i1 < dataLen - 1) _i1++;
		return [_i0, _i1];
	}
	const bandEnds = [];
	const firstBand = [];
	const nextBand = [];
	const bandHasData = [];
	let bandGroupsDirty = true;
	function invalidateBandGroups() {
		bandGroupsDirty = true;
		bandEnds.length = firstBand.length = nextBand.length = bandHasData.length = 0;
	}
	function drawSeries() {
		if (dataLen > 0) {
			let shouldAlpha = series.some((s) => s._focus) && ctxAlpha != focus.alpha;
			if (shouldAlpha) ctx.globalAlpha = ctxAlpha = focus.alpha;
			series.forEach((s, i) => {
				if (i > 0 && s.show) {
					true && cacheStrokeFill(i, false);
					true && cacheStrokeFill(i, true);
					if (s._paths == null) {
						let _ctxAlpha = ctxAlpha;
						if (ctxAlpha != s.alpha) ctx.globalAlpha = ctxAlpha = s.alpha;
						let _idxs = mode == 2 ? [0, data[i][0].length - 1] : getOuterIdxs(data[i]);
						s._paths = s.paths(self, i, _idxs[0], _idxs[1]);
						if (ctxAlpha != _ctxAlpha) ctx.globalAlpha = ctxAlpha = _ctxAlpha;
					}
				}
			});
			if (bandGroupsDirty) {
				bandEnds.length = firstBand.length = bands.length > 0 ? series.length : 0;
				bandEnds.fill(0);
				firstBand.fill(-1);
				nextBand.length = bandHasData.length = bands.length;
				bandHasData.fill(false);
				for (let bi = bands.length - 1; bi >= 0; bi--) {
					let b = bands[bi];
					let si = b.series[0];
					nextBand[bi] = firstBand[si];
					firstBand[si] = bi;
					let lo = min(si, b.series[1]);
					let hi = max(si, b.series[1]);
					bandEnds[lo] = max(bandEnds[lo], hi);
				}
				for (let i = 1; i < bandEnds.length; i++) {
					let end = bandEnds[i];
					if (end > 0) {
						for (let j = i + 1; j <= end; j++) end = max(end, bandEnds[j]);
						bandEnds[i] = end;
						i = end;
					}
				}
				bandGroupsDirty = false;
			}
			for (let pass = 0; pass < 2; pass++) for (let i = 1; i < series.length; i++) {
				let end = bandEnds[i] || i;
				let focused = false;
				for (let j = i; j <= end && !focused; j++) focused = series[j].show && !!series[j]._focus;
				if (focused == (pass == 1)) {
					if (bandEnds[i] > 0) {
						for (let j = i; j <= end; j++) drawSeriesPart(j, 1, false);
						for (let j = i; j <= end; j++) drawSeriesPart(j, 2, false);
						for (let j = i; j <= end; j++) drawSeriesPart(j, 0, true);
					} else drawSeriesPart(i, CLIP_FILL_STROKE, true);
				}
				i = end;
			}
			if (shouldAlpha) ctx.globalAlpha = ctxAlpha = 1;
		}
	}
	function drawSeriesPart(i, draw, _points) {
		let s = series[i];
		if (s.show) {
			let _ctxAlpha = ctxAlpha;
			if (ctxAlpha != s.alpha) ctx.globalAlpha = ctxAlpha = s.alpha;
			true && draw != 0 && s._paths != null && drawPath(i, false, draw);
			if (_points && true) {
				let _gaps = s._paths != null ? s._paths.gaps : null;
				let idx0 = mode == 2 ? 0 : i0;
				let idx1 = mode == 2 ? data[i][0].length - 1 : i1;
				let show = s.points.show(self, i, idx0, idx1, _gaps);
				let idxs = s.points.filter(self, i, show, _gaps);
				if (show || idxs) {
					s.points._paths = s.points.paths(self, i, idx0, idx1, idxs);
					if (s.points._paths != null) drawPath(i, true);
				}
			}
			if (ctxAlpha != _ctxAlpha) ctx.globalAlpha = ctxAlpha = _ctxAlpha;
			_points && fire("drawSeries", i);
		}
	}
	function cacheStrokeFill(si, _points) {
		let s = _points ? series[si].points : series[si];
		s._stroke = s.stroke(self, si);
		s._fill = s.fill(self, si);
	}
	function drawPath(si, _points, draw = CLIP_FILL_STROKE) {
		let s = _points ? series[si].points : series[si];
		let { stroke, fill, clip: gapsClip, flags, _stroke: strokeStyle = s._stroke, _fill: fillStyle = s._fill, _width: width = s.width } = s._paths;
		if (!(draw & 2)) stroke = null;
		if (!(draw & 1)) fill = null;
		width = roundDec(width * pxRatio$1, 3);
		let offset = pxOffset(width, s.pxAlign);
		if (!(width > 0) || !hasPaint(stroke, strokeStyle)) stroke = null;
		if (!_points) {
			fillStroke(si, strokeStyle, width, s.dash, s.cap, fillStyle, stroke, fill, flags, gapsClip, draw, offset);
			return;
		}
		if (fillStyle == null) fillStyle = width > 0 ? "#fff" : strokeStyle;
		if (stroke == null && !hasPaint(fill, fillStyle)) return;
		offset != 0 && ctx.translate(offset, offset);
		strokeFill(strokeStyle, width, s.dash, s.cap, fillStyle, stroke, fill, flags, gapsClip);
		offset != 0 && ctx.translate(-offset, -offset);
	}
	function hasPaint(path, style) {
		return path instanceof Map ? path.size > 0 : path != null && style != null;
	}
	function fillStroke(si, strokeStyle, lineWidth, lineDash, lineCap, fillStyle, strokePath, fillPath, flags, gapsClip, draw, offset) {
		if (!(draw & 1) && strokePath == null) return;
		let boundsClip = null;
		let bi = flags != 0 ? firstBand[si] ?? -1 : -1;
		do {
			let b = bi == -1 ? null : bands[bi];
			let bandClip = null;
			let gapsClip2;
			let _fillStyle = fillStyle;
			if (b != null) {
				let lowerEdge = series[b.series[1]];
				let lowerData = data[b.series[1]];
				bandClip = (lowerEdge._paths || EMPTY_OBJ).band;
				if (isArr(bandClip)) bandClip = b.dir == 1 ? bandClip[0] : bandClip[1];
				_fillStyle = null;
				if (draw & 1) bandHasData[bi] = lowerEdge.show && bandClip != null && hasData(lowerData, i0, i1);
				if (bandHasData[bi]) {
					if (draw & 1) _fillStyle = b.fill(self, bi) || fillStyle;
					gapsClip2 = lowerEdge._paths.clip;
				} else bandClip = null;
			}
			if (strokePath == null && !hasPaint(fillPath, _fillStyle)) continue;
			if (boundsClip == null) {
				boundsClip = new Path2D();
				boundsClip.rect(plotLft - lineWidth / 2, plotTop - lineWidth / 2, plotWid + lineWidth, plotHgt + lineWidth);
				offset != 0 && ctx.translate(offset, offset);
			}
			strokeFill(strokeStyle, lineWidth, lineDash, lineCap, _fillStyle, strokePath, fillPath, flags, boundsClip, gapsClip, gapsClip2, bandClip);
		} while (bi != -1 && (bi = nextBand[bi]) != -1);
		boundsClip != null && offset != 0 && ctx.translate(-offset, -offset);
	}
	const CLIP_FILL_STROKE = 1 | 2;
	function strokeFill(strokeStyle, lineWidth, lineDash, lineCap, fillStyle, strokePath, fillPath, flags, boundsClip, gapsClip, gapsClip2, bandClip) {
		let canFill = hasPaint(fillPath, fillStyle);
		let canStroke = lineWidth > 0 && hasPaint(strokePath, strokeStyle);
		if (!canFill && !canStroke) return;
		if (!(canFill && flags & 1 || canStroke && flags & 2)) bandClip = null;
		if (canStroke) setCtxStroke(strokeStyle, lineWidth, lineDash, lineCap);
		if (canFill) {
			let fill = fillStyle ?? "#0000";
			if (fill != ctxFill) ctx.fillStyle = ctxFill = fill;
		}
		let _ctxFill = ctxFill;
		let _ctxStroke = ctxStroke;
		if (boundsClip || gapsClip || bandClip) {
			ctx.save();
			boundsClip && ctx.clip(boundsClip);
			gapsClip && ctx.clip(gapsClip);
		}
		if (bandClip) {
			if ((flags & CLIP_FILL_STROKE) == CLIP_FILL_STROKE) {
				ctx.clip(bandClip);
				gapsClip2 && ctx.clip(gapsClip2);
				doFill(fillStyle, fillPath);
				doStroke(strokeStyle, strokePath, lineWidth);
			} else if (flags & 2) {
				doFill(fillStyle, fillPath);
				ctx.clip(bandClip);
				doStroke(strokeStyle, strokePath, lineWidth);
			} else if (flags & 1) {
				canStroke && ctx.save();
				ctx.clip(bandClip);
				gapsClip2 && ctx.clip(gapsClip2);
				doFill(fillStyle, fillPath);
				if (canStroke) {
					ctx.restore();
					ctxFill = _ctxFill;
					ctxStroke = _ctxStroke;
					doStroke(strokeStyle, strokePath, lineWidth);
				}
			}
		} else {
			doFill(fillStyle, fillPath);
			doStroke(strokeStyle, strokePath, lineWidth);
		}
		if (boundsClip || gapsClip || bandClip) {
			ctx.restore();
			ctxFill = _ctxFill;
			ctxStroke = _ctxStroke;
		}
	}
	function doStroke(strokeStyle, strokePath, lineWidth) {
		if (lineWidth > 0) {
			if (strokePath instanceof Map) strokePath.forEach((strokePath, strokeStyle) => {
				ctx.strokeStyle = ctxStroke = strokeStyle;
				if (isArr(strokePath)) strokePath.forEach((path) => ctx.stroke(path));
				else ctx.stroke(strokePath);
			});
			else strokePath != null && strokeStyle != null && ctx.stroke(strokePath);
		}
	}
	function doFill(fillStyle, fillPath) {
		if (fillPath instanceof Map) fillPath.forEach((fillPath, fillStyle) => {
			ctx.fillStyle = ctxFill = fillStyle;
			if (isArr(fillPath)) fillPath.forEach((path) => ctx.fill(path));
			else ctx.fill(fillPath);
		});
		else fillPath != null && fillStyle != null && ctx.fill(fillPath);
	}
	function getIncrSpace(axisIdx, min, max, fullDim) {
		let axis = axes[axisIdx];
		let incrSpace;
		let sc = scales[axis.scale];
		if (sc._rawY != null && sc.axis == axisIdx) {
			let result = sc._rangeY;
			incrSpace = result?.count > 0 ? [result.incr, fullDim / result.count] : [0, 0];
			axis._space = incrSpace[1];
			axis._incrs = numIncrs;
		} else if (fullDim <= 0) incrSpace = [0, 0];
		else {
			let minSpace = axis._space = axis.space(self, axisIdx, min, max, fullDim);
			incrSpace = findIncr(min, max, axis._incrs = axis.incrs(self, axisIdx, min, max, fullDim, minSpace), fullDim, minSpace);
		}
		return axis._found = incrSpace;
	}
	function drawOrthoLines(offs, filts, ori, side, pos0, len, width, stroke, dash, cap) {
		let offset = width % 2 / 2;
		pxAlign == 1 && offset != 0 && ctx.translate(offset, offset);
		setCtxStroke(stroke, width, dash, cap);
		ctx.beginPath();
		let x0, y0, x1, y1, pos1 = pos0 + (side == 0 || side == 3 ? -len : len);
		if (ori == 0) {
			y0 = pos0;
			y1 = pos1;
		} else {
			x0 = pos0;
			x1 = pos1;
		}
		for (let i = 0; i < offs.length; i++) if (filts[i] != null) {
			if (ori == 0) x0 = x1 = offs[i];
			else y0 = y1 = offs[i];
			ctx.moveTo(x0, y0);
			ctx.lineTo(x1, y1);
		}
		ctx.stroke();
		pxAlign == 1 && offset != 0 && ctx.translate(-offset, -offset);
	}
	function axesCalc(ori) {
		axes.forEach((axis, i) => {
			if (!axis._show || axis.side % 2 != ori) return;
			let scale = scales[axis.scale];
			let { min, max } = scale;
			let [_incr, _space] = getIncrSpace(i, min, max, ori == 0 ? plotWidCss : plotHgtCss);
			if (_space == 0) {
				axis._splits = axis._values = [];
				axis._rotate = 0;
				return;
			}
			let rangedY = scale._rawY != null && scale.axis == i;
			let forceMin = scale.distr == 2 || rangedY;
			let _splits = axis._splits = rangedY && scale._rangeY.count == 1 ? [min, max] : axis.splits(self, i, min, max, _incr, _space, forceMin);
			let splits = scale.distr == 2 ? _splits.map((i) => data0[i]) : _splits;
			let incr = scale.distr == 2 ? data0[_splits[1]] - data0[_splits[0]] : _incr;
			let values = axis._values = axis.values(self, axis.filter(self, splits, i, _space, incr), i, _space, incr);
			axis._rotate = axis.side == 2 ? axis.rotate(self, values, i, _space) : 0;
		});
	}
	function drawAxesGrid() {
		for (let i = 0; i < axes.length; i++) {
			let axis = axes[i];
			if (!axis.show || !axis._show) continue;
			let side = axis.side;
			let ori = side % 2;
			let x, y;
			let fillStyle = axis.stroke(self, i);
			let shiftDir = side == 0 || side == 3 ? -1 : 1;
			let [_incr, _space] = axis._found;
			if (axis.label != null) {
				let shiftAmt = axis.labelGap * shiftDir;
				let baseLpos = round((axis._lpos + shiftAmt) * pxRatio$1);
				setFontStyle(axis.labelFont[0], fillStyle, "center", side == 2 ? "top" : BOTTOM);
				ctx.save();
				if (ori == 1) {
					x = y = 0;
					ctx.translate(baseLpos, round(plotTop + plotHgt / 2));
					ctx.rotate((side == 3 ? -PI : PI) / 2);
				} else {
					x = round(plotLft + plotWid / 2);
					y = baseLpos;
				}
				let _label = isFn(axis.label) ? axis.label(self, i, _incr, _space) : axis.label;
				ctx.fillText(_label, x, y);
				ctx.restore();
			}
			if (_space == 0) continue;
			let scale = scales[axis.scale];
			let plotDim = ori == 0 ? plotWid : plotHgt;
			let plotOff = ori == 0 ? plotLft : plotTop;
			let _splits = axis._splits;
			let splits = scale.distr == 2 ? _splits.map((i) => data0[i]) : _splits;
			let incr = scale.distr == 2 ? data0[_splits[1]] - data0[_splits[0]] : _incr;
			let ticks = axis.ticks;
			let border = axis.border;
			let _tickSize = ticks.show ? ticks.size : 0;
			let tickSize = round(_tickSize * pxRatio$1);
			let axisGap = round((axis.alignTo == 2 ? axis._size - _tickSize - axis.gap : axis.gap) * pxRatio$1);
			let angle = axis._rotate * -PI / 180;
			let basePos = pxRound(axis._pos * pxRatio$1);
			let finalPos = basePos + (tickSize + axisGap) * shiftDir;
			y = ori == 0 ? finalPos : 0;
			x = ori == 1 ? finalPos : 0;
			let font = axis.font[0];
			setFontStyle(font, fillStyle, axis.align == 1 ? LEFT : axis.align == 2 ? RIGHT : angle > 0 ? LEFT : angle < 0 ? RIGHT : ori == 0 ? "center" : side == 3 ? RIGHT : LEFT, angle || ori == 1 ? "middle" : side == 2 ? "top" : BOTTOM);
			let lineHeight = axis.font[1] * axis.lineGap;
			let canOffs = _splits.map((val) => pxRound(getPos(val, scale, plotDim, plotOff)));
			let _values = axis._values;
			for (let i = 0; i < _values.length; i++) {
				let val = _values[i];
				if (val != null) {
					if (ori == 0) x = canOffs[i];
					else y = canOffs[i];
					val = "" + val;
					let _parts = val.indexOf("\n") == -1 ? [val] : val.split(/\n/gm);
					for (let j = 0; j < _parts.length; j++) {
						let text = _parts[j];
						if (angle) {
							ctx.save();
							ctx.translate(x, y + j * lineHeight);
							ctx.rotate(angle);
							ctx.fillText(text, 0, 0);
							ctx.restore();
						} else ctx.fillText(text, x, y + j * lineHeight);
					}
				}
			}
			if (ticks.show) drawOrthoLines(canOffs, ticks.filter(self, splits, i, _space, incr), ori, side, basePos, tickSize, roundDec(ticks.width * pxRatio$1, 3), ticks.stroke(self, i), ticks.dash, ticks.cap);
			let grid = axis.grid;
			if (grid.show) drawOrthoLines(canOffs, grid.filter(self, splits, i, _space, incr), ori, ori == 0 ? 2 : 1, ori == 0 ? plotTop : plotLft, ori == 0 ? plotHgt : plotWid, roundDec(grid.width * pxRatio$1, 3), grid.stroke(self, i), grid.dash, grid.cap);
			if (border.show) drawOrthoLines([basePos], [1], ori == 0 ? 1 : 0, ori == 0 ? 1 : 2, ori == 1 ? plotTop : plotLft, ori == 1 ? plotHgt : plotWid, roundDec(border.width * pxRatio$1, 3), border.stroke(self, i), border.dash, border.cap);
		}
		fire("drawAxes");
	}
	function resetScaleSeries(scaleKey) {
		redrawDirty.delete(scaleKey);
		series.forEach((s, i) => {
			if (i > 0 && s.scale == scaleKey) {
				s.min = s.max = null;
				if (s.minAbs !== void 0) s.minAbs = void 0;
			}
		});
	}
	function resetYSeries(minMax) {
		if (minMax) redrawDirty.clear();
		series.forEach((s, i) => {
			if (minMax && s.minAbs !== void 0) s.minAbs = void 0;
			if (i > 0) {
				s._paths = null;
				if (minMax) {
					s.min = null;
					s.max = null;
					if (mode == 2) s.facets.forEach((f) => {
						f.min = null;
						f.max = null;
						if (f.minAbs !== void 0) f.minAbs = void 0;
					});
				}
			}
		});
	}
	let destroyed = false;
	let queuedCommit = false;
	function syncLegend() {
		if (ready && !destroyed && shouldRenderLegend && !shouldSelectLegend) {
			shouldRenderLegend = false;
			legendView.render(legend.values, focusedSeries);
			syncRect(true);
		}
	}
	let deferHooks = false;
	let hooksQueue = [];
	function flushHooks() {
		deferHooks = false;
		for (let i = 0; i < hooksQueue.length; i++) fire(...hooksQueue[i]);
		hooksQueue.length = 0;
	}
	function commit() {
		if (!destroyed && !queuedCommit) {
			let run = queuedCommit = () => {
				if (queuedCommit == run) _commit();
			};
			microTask(run);
		}
	}
	function batch(fn, _deferHooks = false) {
		queuedCommit = true;
		deferHooks = _deferHooks;
		fn(self);
		_commit();
		if (_deferHooks && hooksQueue.length > 0) queueMicrotask(flushHooks);
	}
	self.batch = batch;
	function setCanvasSize() {
		setStylePx(wrap, WIDTH, fullWidCss);
		setStylePx(wrap, HEIGHT, fullHgtCss);
		let width = round(fullWidCss * pxRatio$1);
		let height = round(fullHgtCss * pxRatio$1);
		canToCssX = fullWidCss / width;
		canToCssY = fullHgtCss / height;
		let reset = !ready || can.width != width || can.height != height;
		if (!ready || can.width != width) can.width = width;
		if (!ready || can.height != height) can.height = height;
		if (reset) {
			ctxStroke = ctxFill = ctxWidth = ctxJoin = ctxCap = ctxFont = ctxAlign = ctxBaseline = ctxDash = null;
			ctxAlpha = 1;
		}
	}
	function applyLayout(plotChanged, axesChanged) {
		if (plotChanged) {
			if (under != null) {
				setStylePx(under, LEFT, plotLftCss);
				setStylePx(under, "top", plotTopCss);
				setStylePx(under, WIDTH, plotWidCss);
				setStylePx(under, HEIGHT, plotHgtCss);
			}
			if (over != null) {
				setStylePx(over, LEFT, plotLftCss);
				setStylePx(over, "top", plotTopCss);
				setStylePx(over, WIDTH, plotWidCss);
				setStylePx(over, HEIGHT, plotHgtCss);
			}
		}
		if (plotChanged || axesChanged) axes.forEach(({ _el, _show, _size, _pos, side }) => {
			if (_el != null) {
				if (_show) {
					let posOffset = side == 3 || side == 0 ? _size : 0;
					let isVt = side % 2 == 1;
					setStylePx(_el, isVt ? "left" : "top", _pos - posOffset);
					setStylePx(_el, isVt ? "width" : "height", _size);
					setStylePx(_el, isVt ? "top" : "left", isVt ? plotTopCss : plotLftCss);
					setStylePx(_el, isVt ? "height" : "width", isVt ? plotHgtCss : plotWidCss);
					remClass(_el, OFF);
				} else addClass(_el, OFF);
			}
		});
		syncRect(true);
	}
	function resizeOverlays(prevWidth, prevHeight) {
		let pctWid = plotWidCss / prevWidth;
		let pctHgt = plotHgtCss / prevHeight;
		if ((showCursor || cursorDists != null || hasLegendSelection()) && !shouldSetCursor && cursor.left >= 0) {
			cursor.left *= pctWid;
			cursor.top *= pctHgt;
			if (cursorDists != null || hasLegendSelection()) {
				mouseLeft1 = cursor.left;
				mouseTop1 = cursor.top;
				shouldSetCursor = shouldSetLegend = true;
			} else {
				vCursor && elTrans(vCursor, round(cursor.left), 0, plotWidCss, plotHgtCss);
				hCursor && elTrans(hCursor, 0, round(cursor.top), plotWidCss, plotHgtCss);
				for (let i = 0; i < cursorPts.length; i++) if (cursorPts[i] != null) {
					cursorPtsLft[i] *= pctWid;
					cursorPtsTop[i] *= pctHgt;
				}
			}
		}
		if (select.show && !shouldSetSelect && select.left >= 0 && select.width > 0) {
			select.left *= pctWid;
			select.width *= pctWid;
			select.top *= pctHgt;
			select.height *= pctHgt;
			for (let prop in _hideProps) setStylePx(selectDiv, prop, select[prop]);
		}
	}
	function _commit() {
		if (destroyed) return;
		if (stackDirty.size > 0) {
			stackDirty.forEach(resetScaleSeries);
			setScaleData(self.data);
			resetYSeries(false);
			shouldSetScales = true;
		}
		if (shouldSetScales) {
			setScales();
			shouldSetScales = false;
			viaAutoScaleX = false;
		}
		if (shouldLayout) {
			let changedY = updateLayout();
			shouldLayout = false;
			for (let k of changedY) fire("setScale", k);
		}
		let didDraw = fullWidCss > 0 && fullHgtCss > 0;
		if (didDraw) {
			ctx.clearRect(0, 0, can.width, can.height);
			fire("drawClear");
			drawOrder.forEach((fn) => fn());
			fire("draw");
		}
		if (select.show && shouldSetSelect) {
			setSelect(select);
			shouldSetSelect = false;
		}
		queuedCommit = false;
		if ((showCursor || cursorDists != null || hasLegendSelection()) && shouldSetCursor) updateCursor(null, true, false);
		else if (true && shouldSetLegend && (showLegend && legend.live || hasLegendSelection())) setLegend();
		else {
			const selectionChanged = selectLegend() && hasLegendSelection();
			syncLegend();
			if (selectionChanged) fire("setLegend");
		}
		if (stackDirty.size > 0 || shouldSetScales || shouldLayout) commit();
		if (!usePathCache) clearPathCache();
		if (!useDataCache && didDraw && !queuedCommit && stackDirty.size == 0 && !shouldSetScales && !shouldLayout) clearDataCache();
		if (!ready && !queuedCommit) {
			ready = true;
			self.status = 1;
			syncLegend();
			if (!destroyed) fire("ready");
		}
	}
	function clearPathCache() {
		series.forEach((s, i) => {
			if (i > 0) {
				s._paths = null;
				true && (s.points._paths = null);
			}
		});
	}
	function clearDispCache() {
		series.forEach((s) => {
			s._disp = null;
		});
	}
	function clearDataCache() {
		clearDispCache();
		let emptyData = (src) => mode == 1 ? src.map(() => []) : src.map((facets) => facets == null ? facets : facets.map(() => []));
		self.data = self._data = data = emptyData(self.data ?? EMPTY_ARR);
		self._base = null;
		data0 = mode == 1 ? data[0] : null;
		dataLen = 0;
		if (opts.data != null) opts.data = emptyData(opts.data);
	}
	self.clearCache = (targets) => {
		if (targets == null || targets.paths === true || targets.data === true) invalidateBandGroups();
		if (targets == null || targets.paths === true) clearPathCache();
		if (targets == null || targets.data === true) clearDataCache();
	};
	self.redraw = (rebuildPaths, recalcAxes) => {
		shouldLayout = shouldLayout || recalcAxes || false;
		if (rebuildPaths !== false) {
			let ranged = scaleX._rawY != null;
			pendScales[xScaleKey] ??= {
				min: ranged ? null : scaleX.min,
				max: ranged ? null : scaleX.max,
				redraw: true
			};
			shouldSetScales = true;
		}
		commit();
	};
	function setRange(key, min, max) {
		let sc = scales[key];
		if (sc.from == null) {
			if (isFullyExplicit(min, max)) {
				if (min > max) return;
				if (dataLen > 1 && max - min < 1e-16) return;
			}
			if (key == xScaleKey && sc.distr == 2 && dataLen > 0) {
				if (min != null) min = closestIdx(min, data[0]);
				if (max != null) max = closestIdx(max, data[0]);
				if (min != null && min == max) max++;
			}
			pendScales[key] = {
				min,
				max
			};
			shouldSetScales = true;
			commit();
		}
	}
	self.setRange = setRange;
	function setScale(key, opts) {
		setRange(key, opts.min, opts.max);
	}
	self.setScale = setScale;
	let xCursor;
	let yCursor;
	let vCursor;
	let hCursor;
	let rawMouseLeft0;
	let rawMouseTop0;
	let mouseLeft0;
	let mouseTop0;
	let rawMouseLeft1;
	let rawMouseTop1;
	let mouseLeft1;
	let mouseTop1;
	let dragging = false;
	const drag = cursor.drag;
	drag.setRange = drag.setScale ?? drag.setRange;
	let dragX = drag.x;
	let dragY = drag.y;
	if (showCursor) {
		if (cursor.x) xCursor = placeDiv(CURSOR_X, over);
		if (cursor.y) yCursor = placeDiv(CURSOR_Y, over);
		if (scaleX.ori == 0) {
			vCursor = xCursor;
			hCursor = yCursor;
		} else {
			vCursor = yCursor;
			hCursor = xCursor;
		}
	}
	mouseLeft1 = cursor.left;
	mouseTop1 = cursor.top;
	const select = self.select = assign({
		show: true,
		over: true,
		left: 0,
		width: 0,
		top: 0,
		height: 0
	}, opts.select);
	const selectParent = select.over ? over : under;
	select.show = selectParent != null && select.show;
	const selectDiv = select.show ? placeDiv(SELECT, selectParent) : null;
	function setSelect(opts, _fire) {
		if (select.show) {
			for (let prop in opts) {
				select[prop] = opts[prop];
				if (prop in _hideProps) setStylePx(selectDiv, prop, opts[prop]);
			}
			_fire !== false && fire("setSelect");
		}
	}
	self.setSelect = setSelect;
	function hideCursorPoint(i) {
		if (!series[i].show && showCursor) {
			let pt = cursorOnePt ? cursorPts[0] : cursorPts[i];
			pt != null && elTrans(pt, -10, -10, plotWidCss, plotHgtCss);
		}
	}
	function setSeriesShow(i, show) {
		let s = series[i];
		let showChanged = s.show != show;
		if (showLegend && showChanged) shouldRenderLegend = true;
		s.show = show;
		hideCursorPoint(i);
		if (showChanged) {
			shouldSelectLegend = shouldSelectLegend || hasLegendSelection();
			if (cursorDists != null && !show) cursorDists[i] = inf;
			if (cursorDists != null || hasLegendSelection()) shouldSetCursor = cursor.left >= 0;
		}
		if (showChanged && stackedSeries[i]) stackDirty.add(s.scale);
		if (mode == 2) {
			setRange(s.facets[0].scale, null, null);
			setRange(s.facets[1].scale, null, null);
		} else setRange(s.scale, null, null);
		commit();
	}
	function setSeries(i, opts, _fire, _pub) {
		if (opts.focus != null) setFocus(i);
		if (opts.show != null) {
			if (i == null) series.forEach((s, si) => {
				if (si > 0) setSeriesShow(si, opts.show);
			});
			else {
				let si = +i;
				if (si > 0 && si < series.length && si % 1 == 0) setSeriesShow(si, opts.show);
			}
		}
		syncLegend();
		_fire !== false && fire("setSeries", i, opts);
		_pub && pubSync("setSeries", self, i, opts);
	}
	self.setSeries = setSeries;
	function setBand(bi, opts) {
		assign(bands[bi], opts);
		invalidateBandGroups();
	}
	function addBand(opts, bi) {
		initBand(opts);
		bi = bi == null ? bands.length : bi;
		bands.splice(bi, 0, opts);
		invalidateBandGroups();
	}
	function delBand(bi) {
		if (bi == null) bands.length = 0;
		else bands.splice(bi, 1);
		invalidateBandGroups();
	}
	self.addBand = addBand;
	self.setBand = setBand;
	self.delBand = delBand;
	function setAlpha(i, value) {
		series[i].alpha = value;
		if (showCursor && cursorPts[i] != null) cursorPts[i].style.opacity = value;
	}
	let focusedSeries = null;
	const FOCUS_TRUE = { focus: true };
	function setSeriesFocus(s, i) {
		if (mode == 1 || i > 0) {
			let allFocused = focusedSeries == null;
			let isFocused = allFocused || i == 0 || s == focusedSeries;
			s._focus = allFocused ? null : isFocused;
			focus.alpha != 1 && setAlpha(i, isFocused ? 1 : focus.alpha);
		}
	}
	function setFocus(i) {
		let focused = i == null ? null : series[i];
		if (focused != focusedSeries) {
			focusedSeries = focused;
			series.forEach(setSeriesFocus);
			shouldSelectLegend = shouldSelectLegend || hasLegendSelection();
			if (focus.alpha != 1 || hasLegendSelection()) shouldRenderLegend = showLegend;
			commit();
			return true;
		}
		return false;
	}
	function posToVal(pos, scale, can) {
		let sc = scales[scale];
		if (can) pos -= sc.ori == 1 ? plotTop : plotLft;
		let dim = can ? plotWid : plotWidCss;
		if (sc.ori == 1) {
			dim = can ? plotHgt : plotHgtCss;
			pos = dim - pos;
		}
		if (sc.dir == -1) pos = dim - pos;
		let _min = sc._min, _max = sc._max, pct = pos / dim;
		let sv = _min + (_max - _min) * pct;
		let distr = sc.distr;
		return distr == 3 ? pow(10, sv) : distr == 4 ? sinh(sv, sc._asinh) : distr == 100 ? sc.bwd(sv) : sv;
	}
	function closestIdxFromXpos(pos, can) {
		let v = posToVal(pos, xScaleKey, can);
		return closestIdx(v, data[0], i0, i1);
	}
	self.valToIdx = (val) => closestIdx(val, data[0]);
	self.posToIdx = closestIdxFromXpos;
	self.posToVal = posToVal;
	self.valToPos = (val, scale, can) => scales[scale].ori == 0 ? getHPos(val, scales[scale], can ? plotWid : plotWidCss, can ? plotLft : 0) : getVPos(val, scales[scale], can ? plotHgt : plotHgtCss, can ? plotTop : 0);
	self.setCursor = (opts, _fire, _pub) => {
		mouseLeft1 = opts.left;
		mouseTop1 = opts.top;
		updateCursor(null, _fire, _pub);
	};
	function setSelH(off, dim) {
		setStylePx(selectDiv, LEFT, select.left = off);
		setStylePx(selectDiv, WIDTH, select.width = dim);
	}
	function setSelV(off, dim) {
		setStylePx(selectDiv, "top", select.top = off);
		setStylePx(selectDiv, HEIGHT, select.height = dim);
	}
	let setSelX = scaleX.ori == 0 ? setSelH : setSelV;
	let setSelY = scaleX.ori == 1 ? setSelH : setSelV;
	function setLegend(opts, _fire) {
		if (opts != null) {
			if (opts.idxs) opts.idxs.forEach((idx, i) => activeIdxs[i] = idx);
			else if (!isUndef(opts.idx)) activeIdxs.fill(opts.idx);
			legend.idx = activeIdxs[0];
		}
		if (showLegend && legend.live) {
			let changed = false;
			for (let sidx = 0; sidx < series.length; sidx++) if (sidx > 0 || mode == 1 && !multiValLegend) changed = setLegendValues(sidx, activeIdxs[sidx]) || changed;
			shouldRenderLegend = shouldRenderLegend || changed;
		}
		selectLegend(hasLegendSelection() || opts != null && legendCandidates != null);
		shouldSetLegend = false;
		syncLegend();
		_fire !== false && fire("setLegend");
	}
	self.setLegend = setLegend;
	function setLegendValues(sidx, idx) {
		let s = series[sidx];
		let src = self.data[sidx];
		if (multiValLegend) {
			let vals = legend.values[sidx] = s.values(self, sidx, idx) ?? NULL_LEGEND_VALUES;
			let prev = legendValuesPrev[sidx] ??= [];
			let changed = false;
			let i = 0;
			for (let key in legendCols) {
				let val = vals[key];
				changed = val !== prev[i] || changed;
				prev[i++] = val;
			}
			return changed;
		} else {
			let val = s.value(self, idx == null ? null : src[idx], sidx, idx) ?? "--";
			let vals = legend.values[sidx] ??= {};
			let changed = val !== vals._;
			vals._ = val;
			return changed;
		}
	}
	function setCursorPointPos(pt, si, left, top, width, height) {
		let s = series[si];
		if (cursor.left < 0 || s == null || !s.show) {
			elTrans(pt, -10, -10, plotWidCss, plotHgtCss);
			return;
		}
		if (points.bbox != null) {
			let off = width <= 0 || height <= 0 || left + width <= 0 || top + height <= 0 || left >= plotWidCss || top >= plotHgtCss;
			elTrans(pt, left, top, plotWidCss, plotHgtCss, off);
			return;
		}
		let idx = activeIdxs[si];
		let sx, sy, xVal, yVal;
		if (mode == 1) {
			sx = scaleX;
			sy = scales[s.scale];
			xVal = data[0]?.[idx];
			yVal = data[si]?.[idx];
		} else {
			let d = data[si];
			sx = scales[s.facets[0].scale];
			sy = scales[s.facets[1].scale];
			xVal = d?.[0]?.[idx];
			yVal = d?.[1]?.[idx];
		}
		if (idx == null || xVal == null || yVal == null) {
			elTrans(pt, -10, -10, plotWidCss, plotHgtCss);
			return;
		}
		let off = left < -1e-9 || top < -1e-9 || left > plotWidCss + 1e-9 || top > plotHgtCss + 1e-9;
		if (!off) {
			let sh, sv, hVal, vVal;
			if (sx.ori == 0) {
				sh = sx;
				sv = sy;
				hVal = xVal;
				vVal = yVal;
			} else {
				sh = sy;
				sv = sx;
				hVal = yVal;
				vVal = xVal;
			}
			let x = pointPos(hVal, sh, plotWid, plotLft, getHPos, s.pxRound);
			let y = pointPos(vVal, sv, plotHgt, plotTop, getVPos, s.pxRound);
			let sp = s.points;
			let offset = pxOffset(roundDec((sp._paths?._width ?? sp.width) * pxRatio$1, 3), sp.pxAlign);
			left = (x + offset) * canToCssX - plotLftCss;
			top = (y + offset) * canToCssY - plotTopCss;
		} else {
			left = ceil(left);
			top = ceil(top);
		}
		elTrans(pt, left, top, plotWidCss, plotHgtCss, off);
	}
	function syncCursorPoints() {
		cursorPts.forEach((pt, i) => {
			if (pt != null && cursorPtsLft[i] != null) setCursorPointPos(pt, cursorOnePt ? cursorPtSeries : i, cursorPtsLft[i], cursorPtsTop[i], cursorPtsWid[i], cursorPtsHgt[i]);
		});
	}
	function updateCursor(src, _fire, _pub) {
		const forceCursor = shouldSetCursor;
		shouldSetCursor = false;
		rawMouseLeft1 = mouseLeft1;
		rawMouseTop1 = mouseTop1;
		[mouseLeft1, mouseTop1] = cursor.move(self, mouseLeft1, mouseTop1);
		cursor.left = mouseLeft1;
		cursor.top = mouseTop1;
		if (showCursor) {
			vCursor && elTrans(vCursor, round(mouseLeft1), 0, plotWidCss, plotHgtCss);
			hCursor && elTrans(hCursor, 0, round(mouseTop1), plotWidCss, plotHgtCss);
		}
		let idx;
		let noDataInRange = i0 > i1;
		let closestDist = inf;
		let closestSeries = null;
		let cursorHidden = mouseLeft1 < 0 || dataLen == 0 || noDataInRange;
		cursorDists?.fill(inf);
		let xDim = scaleX.ori == 0 ? plotWidCss : plotHgtCss;
		let yDim = scaleX.ori == 1 ? plotWidCss : plotHgtCss;
		if (cursorHidden) {
			idx = cursor.idx = null;
			for (let i = 0; i < series.length; i++) {
				let pt = cursorPts[i];
				pt != null && elTrans(pt, -10, -10, plotWidCss, plotHgtCss);
			}
			if (cursorOnePt) cursorPtSeries = null;
			if (true && legend.live || cursorDists != null || hasLegendSelection()) {
				activeIdxs.fill(idx);
				shouldSetLegend = true;
			}
		} else {
			let mouseXPos, valAtPosX, xPos;
			if (mode == 1) {
				mouseXPos = scaleX.ori == 0 ? mouseLeft1 : mouseTop1;
				valAtPosX = posToVal(mouseXPos, xScaleKey);
				idx = cursor.idx = closestIdx(valAtPosX, data[0], i0, i1);
				xPos = valToPosX(data[0][idx], scaleX, xDim, 0);
			}
			let _ptLft = -10;
			let _ptTop = -10;
			let _ptWid = 0;
			let _ptHgt = 0;
			let _centered = true;
			let _ptFill = "";
			let _ptStroke = "";
			for (let i = mode == 2 ? 1 : 0; i < series.length; i++) {
				let s = series[i];
				let idx1 = activeIdxs[i];
				let yVal1 = idx1 == null ? null : mode == 1 ? data[i][idx1] : data[i][1][idx1];
				let idx2 = cursor.dataIdx(self, i, idx, valAtPosX);
				let yVal2 = idx2 == null ? null : mode == 1 ? data[i][idx2] : data[i][1][idx2];
				shouldSetLegend = shouldSetLegend || yVal2 != yVal1 || idx2 != idx1;
				activeIdxs[i] = idx2;
				if (i > 0 && s.show) {
					let xPos2 = idx2 == null ? -10 : idx2 == idx ? xPos : valToPosX(mode == 1 ? data[0][idx2] : data[i][0][idx2], scaleX, xDim, 0);
					let yPos = yVal2 == null ? -10 : valToPosY(yVal2, mode == 1 ? scales[s.scale] : scales[s.facets[1].scale], yDim, 0);
					if ((cursorFocus || cursorDists != null) && yVal2 != null) {
						let mouseYPos = scaleX.ori == 1 ? mouseLeft1 : mouseTop1;
						let dist = abs(focus.dist(self, i, idx2, yPos, mouseYPos));
						if (cursorDists != null) cursorDists[i] = dist >= 0 ? dist : inf;
						if (cursorFocus && dist < closestDist) {
							let bias = focus.bias;
							if (bias != 0) {
								let mouseYVal = posToVal(mouseYPos, s.scale);
								let seriesYValSign = yVal2 >= 0 ? 1 : -1;
								let mouseYValSign = mouseYVal >= 0 ? 1 : -1;
								if (mouseYValSign == seriesYValSign && (mouseYValSign == 1 ? bias == 1 ? yVal2 >= mouseYVal : yVal2 <= mouseYVal : bias == 1 ? yVal2 <= mouseYVal : yVal2 >= mouseYVal)) {
									closestDist = dist;
									closestSeries = i;
								}
							} else {
								closestDist = dist;
								closestSeries = i;
							}
						}
					}
					if (shouldSetLegend || cursorOnePt || points.bbox != null) {
						let hPos, vPos;
						if (scaleX.ori == 0) {
							hPos = xPos2;
							vPos = yPos;
						} else {
							hPos = yPos;
							vPos = xPos2;
						}
						let ptWid, ptHgt, ptLft, ptTop, ptStroke, ptFill, centered = true, getBBox = points.bbox;
						if (getBBox != null) {
							centered = false;
							let bbox = getBBox(self, i);
							ptLft = bbox.left;
							ptTop = bbox.top;
							ptWid = bbox.width;
							ptHgt = bbox.height;
						} else {
							ptLft = hPos;
							ptTop = vPos;
							ptWid = ptHgt = points.size(self, i);
						}
						ptFill = points.fill(self, i);
						ptStroke = points.stroke(self, i);
						if (cursorOnePt) {
							if (i == closestSeries && closestDist <= focus.prox) {
								_ptLft = ptLft;
								_ptTop = ptTop;
								_ptWid = ptWid;
								_ptHgt = ptHgt;
								_centered = centered;
								_ptFill = ptFill;
								_ptStroke = ptStroke;
							}
						} else {
							let pt = cursorPts[i];
							if (pt != null) {
								cursorPtsLft[i] = ptLft;
								cursorPtsTop[i] = ptTop;
								cursorPtsWid[i] = ptWid;
								cursorPtsHgt[i] = ptHgt;
								elSize(pt, ptWid, ptHgt, centered);
								elColor(pt, ptFill, ptStroke);
								setCursorPointPos(pt, i, ptLft, ptTop, ptWid, ptHgt);
							}
						}
					}
				}
			}
			if (cursorOnePt) {
				let pointSeries = closestDist <= focus.prox ? closestSeries : null;
				if (forceCursor || shouldSetLegend || pointSeries != cursorPtSeries || points.bbox != null) {
					let pt = cursorPts[0];
					if (pt != null) {
						cursorPtsLft[0] = _ptLft;
						cursorPtsTop[0] = _ptTop;
						cursorPtsWid[0] = _ptWid;
						cursorPtsHgt[0] = _ptHgt;
						elSize(pt, _ptWid, _ptHgt, _centered);
						elColor(pt, _ptFill, _ptStroke);
						cursorPtSeries = pointSeries;
						if (cursorPtMembers?.length) (cursorPtMembers[cursorPtSeries] ? remClass : addClass)(pt, LEGEND_EXCLUDE);
						setCursorPointPos(pt, cursorPtSeries, _ptLft, _ptTop, _ptWid, _ptHgt);
					}
				}
			}
		}
		if (select.show && dragging) {
			if (src != null) {
				let [xKey, yKey] = syncOpts.scales;
				let [matchXKeys, matchYKeys] = syncOpts.match;
				let [xKeySrc, yKeySrc] = src.cursor.sync.scales;
				let sdrag = src.cursor.drag;
				dragX = sdrag._x;
				dragY = sdrag._y;
				if (dragX || dragY) {
					let { left, top, width, height } = src.select;
					let sori = src.scales[xKeySrc].ori;
					let sPosToVal = src.posToVal;
					let sOff, sDim, sc, a, b;
					let matchingX = xKey != null && matchXKeys(xKey, xKeySrc);
					let matchingY = yKey != null && matchYKeys(yKey, yKeySrc);
					if (matchingX && dragX) {
						if (sori == 0) {
							sOff = left;
							sDim = width;
						} else {
							sOff = top;
							sDim = height;
						}
						sc = scales[xKey];
						a = valToPosX(sPosToVal(sOff, xKeySrc), sc, xDim, 0);
						b = valToPosX(sPosToVal(sOff + sDim, xKeySrc), sc, xDim, 0);
						setSelX(min(a, b), abs(b - a));
					} else setSelX(0, xDim);
					if (matchingY && dragY) {
						if (sori == 1) {
							sOff = left;
							sDim = width;
						} else {
							sOff = top;
							sDim = height;
						}
						sc = scales[yKey];
						a = valToPosY(sPosToVal(sOff, yKeySrc), sc, yDim, 0);
						b = valToPosY(sPosToVal(sOff + sDim, yKeySrc), sc, yDim, 0);
						setSelY(min(a, b), abs(b - a));
					} else setSelY(0, yDim);
				} else hideSelect();
			} else {
				let rawDX = abs(rawMouseLeft1 - rawMouseLeft0);
				let rawDY = abs(rawMouseTop1 - rawMouseTop0);
				if (scaleX.ori == 1) {
					let _rawDX = rawDX;
					rawDX = rawDY;
					rawDY = _rawDX;
				}
				dragX = drag.x && rawDX >= drag.dist;
				dragY = drag.y && rawDY >= drag.dist;
				let uni = drag.uni;
				if (uni != null) {
					if (dragX && dragY) {
						dragX = rawDX >= uni;
						dragY = rawDY >= uni;
						if (!dragX && !dragY) {
							if (rawDY > rawDX) dragY = true;
							else dragX = true;
						}
					}
				} else if (drag.x && drag.y && (dragX || dragY)) dragX = dragY = true;
				let p0, p1;
				if (dragX) {
					if (scaleX.ori == 0) {
						p0 = mouseLeft0;
						p1 = mouseLeft1;
					} else {
						p0 = mouseTop0;
						p1 = mouseTop1;
					}
					setSelX(min(p0, p1), abs(p1 - p0));
					if (!dragY) setSelY(0, yDim);
				}
				if (dragY) {
					if (scaleX.ori == 1) {
						p0 = mouseLeft0;
						p1 = mouseLeft1;
					} else {
						p0 = mouseTop0;
						p1 = mouseTop1;
					}
					setSelY(min(p0, p1), abs(p1 - p0));
					if (!dragX) setSelX(0, xDim);
				}
				if (!dragX && !dragY) {
					setSelX(0, 0);
					setSelY(0, 0);
				}
			}
		}
		drag._x = dragX;
		drag._y = dragY;
		let focusIdx = !cursorHidden && closestDist <= focus.prox ? closestSeries : null;
		let focusChanged = cursorFocus && (src == null || cursorHidden) && setFocus(focusIdx);
		if (shouldSetLegend) {
			legend.idx = idx;
			setLegend();
		} else {
			const selectionChanged = selectLegend(hasLegendSelection());
			syncLegend();
			if (selectionChanged) fire("setLegend");
		}
		if (src == null && _pub) {
			if (syncKey != null) {
				let [xSyncKey, ySyncKey] = syncOpts.scales;
				syncOpts.values[0] = xSyncKey != null ? posToVal(scaleX.ori == 0 ? mouseLeft1 : mouseTop1, xSyncKey) : null;
				syncOpts.values[1] = ySyncKey != null ? posToVal(scaleX.ori == 1 ? mouseLeft1 : mouseTop1, ySyncKey) : null;
			}
			pubSync(mousemove, self, mouseLeft1, mouseTop1, plotWidCss, plotHgtCss, idx);
		}
		if (focusChanged) {
			fire("setSeries", focusIdx, FOCUS_TRUE);
			if (src == null && _pub && syncOpts.setSeries) pubSync("setSeries", self, focusIdx, FOCUS_TRUE);
		}
		_fire !== false && fire("setCursor");
	}
	let rect = null;
	Object.defineProperty(self, "rect", { get() {
		if (rect == null) syncRect(false);
		return rect;
	} });
	function syncRect(defer = false) {
		if (over == null) return;
		if (defer) rect = null;
		else {
			rect = over.getBoundingClientRect();
			fire("syncRect", rect);
		}
	}
	function mouseMove(e, src, _l, _t, _w, _h, _i) {
		if (cursor._lock) return;
		if (dragging && e != null && e.movementX == 0 && e.movementY == 0) return;
		cacheMouse(e, src, _l, _t, _w, _h, _i, false, e != null);
		if (e != null) updateCursor(null, true, true);
		else updateCursor(src, true, false);
	}
	function cacheMouse(e, src, _l, _t, _w, _h, _i, initial, snap) {
		if (rect == null) syncRect(false);
		setCursorEvent(e);
		if (e != null) {
			_l = e.clientX - rect.left;
			_t = e.clientY - rect.top;
		} else {
			if (_l < 0 || _t < 0) {
				mouseLeft1 = -10;
				mouseTop1 = -10;
				return;
			}
			let [xKey, yKey] = syncOpts.scales;
			let syncOptsSrc = src.cursor.sync;
			let [xValSrc, yValSrc] = syncOptsSrc.values;
			let [xKeySrc, yKeySrc] = syncOptsSrc.scales;
			let [matchXKeys, matchYKeys] = syncOpts.match;
			let rotSrc = src.axes[0].side % 2 == 1;
			let xDim = scaleX.ori == 0 ? plotWidCss : plotHgtCss, yDim = scaleX.ori == 1 ? plotWidCss : plotHgtCss, _xDim = rotSrc ? _h : _w, _yDim = rotSrc ? _w : _h, _xPos = rotSrc ? _t : _l, _yPos = rotSrc ? _l : _t;
			if (xKeySrc != null) _l = matchXKeys(xKey, xKeySrc) ? getPos(xValSrc, scales[xKey], xDim, 0) : -10;
			else _l = xDim * (_xPos / _xDim);
			if (yKeySrc != null) _t = matchYKeys(yKey, yKeySrc) ? getPos(yValSrc, scales[yKey], yDim, 0) : -10;
			else _t = yDim * (_yPos / _yDim);
			if (scaleX.ori == 1) {
				let __l = _l;
				_l = _t;
				_t = __l;
			}
		}
		if (snap && (src == null || src.cursor.event.type == "mousemove")) {
			if (_l <= 1 || _l >= plotWidCss - 1) _l = _l <= 1 ? 0 : plotWidCss;
			if (_t <= 1 || _t >= plotHgtCss - 1) _t = _t <= 1 ? 0 : plotHgtCss;
		}
		if (initial) {
			rawMouseLeft0 = _l;
			rawMouseTop0 = _t;
			[mouseLeft0, mouseTop0] = cursor.move(self, _l, _t);
		} else {
			mouseLeft1 = _l;
			mouseTop1 = _t;
		}
	}
	const _hideProps = {
		width: 0,
		height: 0,
		left: 0,
		top: 0
	};
	function hideSelect() {
		setSelect(_hideProps, false);
	}
	let downSelectLeft;
	let downSelectTop;
	let downSelectWidth;
	let downSelectHeight;
	function mouseDown(e, src, _l, _t, _w, _h, _i) {
		if (e != null) mouseOwner = self.uid;
		dragging = true;
		dragX = dragY = drag._x = drag._y = false;
		cacheMouse(e, src, _l, _t, _w, _h, _i, true, false);
		if (e != null) {
			if ((drag.x || drag.y) && !globalMouseMove) globalMouseMove = onMouse(mousemove, doc, mouseMove, false);
			onMouse(mouseup, doc, mouseUp, false);
			pubSync(mousedown, self, mouseLeft0, mouseTop0, plotWidCss, plotHgtCss, null);
		}
		let { left, top, width, height } = select;
		downSelectLeft = left;
		downSelectTop = top;
		downSelectWidth = width;
		downSelectHeight = height;
	}
	function setDragRange(key, min, max) {
		if (min > max) [min, max] = [max, min];
		if (isFn(drag.setRange)) {
			let range = drag.setRange(self, key, min, max);
			if (range != null) setRange(key, range[0], range[1]);
		} else setRange(key, min, max);
	}
	function mouseUp(e, src, _l, _t, _w, _h, _i) {
		stopGlobalMouseMove();
		dragging = drag._x = drag._y = false;
		cacheMouse(e, src, _l, _t, _w, _h, _i, false, true);
		let hideCursor = e != null && (e.clientX < rect.left || e.clientX > rect.left + plotWidCss || e.clientY < rect.top || e.clientY > rect.top + plotHgtCss);
		let { left, top, width, height } = select;
		let hasSelect = width > 0 || height > 0;
		let chgSelect = downSelectLeft != left || downSelectTop != top || downSelectWidth != width || downSelectHeight != height;
		hasSelect && chgSelect && setSelect(select);
		if (drag.setRange && hasSelect && chgSelect) {
			let xOff = left, xDim = width, yOff = top, yDim = height;
			if (scaleX.ori == 1) xOff = top, xDim = height, yOff = left, yDim = width;
			if (dragX) setDragRange(xScaleKey, posToVal(xOff, xScaleKey), posToVal(xOff + xDim, xScaleKey));
			if (dragY) for (let k in scales) {
				let sc = scales[k];
				if (k != xScaleKey && sc.from == null && sc.min != Infinity) setDragRange(k, posToVal(yOff + yDim, k), posToVal(yOff, k));
			}
			hideSelect();
		} else if (cursor.lock) {
			cursor._lock = !cursor._lock;
			updateCursor(src, true, e != null);
		}
		if (e != null) {
			offMouse(mouseup, doc, mouseUp);
			pubSync(mouseup, self, mouseLeft1, mouseTop1, plotWidCss, plotHgtCss, null);
		}
		if (hideCursor && !cursor._lock) {
			mouseLeft1 = mouseTop1 = -10;
			activeIdxs.fill(null);
			updateCursor(null, true, true);
		}
		if (mouseOwner == self.uid) mouseOwner = null;
	}
	function mouseLeave(e, src, _l, _t, _w, _h, _i) {
		if (cursor._lock) return;
		if (globalMouseMove) {
			cacheMouse(e, src, _l, _t, _w, _h, _i, false, true);
			updateCursor(null, true, true);
			return;
		}
		setCursorEvent(e);
		let _dragging = dragging;
		if (dragging) {
			let snapH = true;
			let snapV = true;
			let snapProx = 10;
			let dragH, dragV;
			if (scaleX.ori == 0) {
				dragH = dragX;
				dragV = dragY;
			} else {
				dragH = dragY;
				dragV = dragX;
			}
			if (dragH && dragV) {
				snapH = mouseLeft1 <= snapProx || mouseLeft1 >= plotWidCss - snapProx;
				snapV = mouseTop1 <= snapProx || mouseTop1 >= plotHgtCss - snapProx;
			}
			if (dragH && snapH) mouseLeft1 = mouseLeft1 < mouseLeft0 ? 0 : plotWidCss;
			if (dragV && snapV) mouseTop1 = mouseTop1 < mouseTop0 ? 0 : plotHgtCss;
			updateCursor(null, true, true);
			dragging = false;
		}
		mouseLeft1 = -10;
		mouseTop1 = -10;
		activeIdxs.fill(null);
		updateCursor(null, true, true);
		if (_dragging) dragging = _dragging;
	}
	function dblClick(e, src, _l, _t, _w, _h, _i) {
		if (cursor._lock) return;
		setCursorEvent(e);
		autoScaleX();
		hideSelect();
		if (e != null) pubSync(dblclick, self, mouseLeft1, mouseTop1, plotWidCss, plotHgtCss, null);
	}
	function onDppxChange() {
		setPxRatio();
	}
	on(dppxchange, win, onDppxChange);
	const events = {};
	events.mousedown = mouseDown;
	events.mousemove = mouseMove;
	events.mouseup = mouseUp;
	events.dblclick = dblClick;
	events["setSeries"] = (e, src, idx, opts) => {
		let seriesIdxMatcher = syncOpts.match[2];
		idx = seriesIdxMatcher(self, src, idx);
		idx != -1 && setSeries(idx, opts, true, false);
	};
	if (showCursor) {
		on("click", wrap, (e) => {
			if (e.target === over) (mouseLeft1 != mouseLeft0 || mouseTop1 != mouseTop0) && drag.click(self, e);
		}, true);
		onMouse(mousedown, over, mouseDown);
		onMouse(mousemove, over, (e) => {
			if (!globalMouseMove) mouseMove(e);
		});
		onMouse(mouseenter, over, (e) => {
			setCursorEvent(e);
			syncRect(false);
		});
		onMouse(mouseleave, over, mouseLeave);
		onMouse(dblclick, over, dblClick);
		cursorPlots.add(self);
		self.syncRect = syncRect;
	}
	const hooks = self.hooks = opts.hooks || {};
	function fire(evName, a1, a2) {
		if (deferHooks) hooksQueue.push([
			evName,
			a1,
			a2
		]);
		else if (evName in hooks) hooks[evName].forEach((fn) => fn.call(null, self, a1, a2));
	}
	(opts.plugins || []).forEach((p) => {
		for (let evName in p.hooks) hooks[evName] = (hooks[evName] || []).concat(p.hooks[evName]);
	});
	const seriesIdxMatcher = (self, src, srcSeriesIdx) => srcSeriesIdx;
	const syncOpts = assign({
		key: null,
		setSeries: false,
		filters: {
			pub: retTrue,
			sub: retTrue
		},
		scales: [xScaleKey, series[1] ? series[1].scale : null],
		match: [
			retEq,
			retEq,
			seriesIdxMatcher
		],
		values: [null, null]
	}, cursor.sync);
	if (syncOpts.match.length == 2) syncOpts.match.push(seriesIdxMatcher);
	cursor.sync = syncOpts;
	const syncKey = syncOpts.key;
	const sync = _sync(syncKey);
	function pubSync(type, src, x, y, w, h, i) {
		if (syncOpts.filters.pub(type, src, x, y, w, h, i)) sync.pub(type, src, x, y, w, h, i);
	}
	sync.sub(self);
	function pub(type, src, x, y, w, h, i) {
		if (syncOpts.filters.sub(type, src, x, y, w, h, i)) events[type](null, src, x, y, w, h, i);
	}
	self.pub = pub;
	function destroy() {
		if (destroyed) return;
		destroyed = true;
		queuedCommit = false;
		sync.unsub(self);
		cursorPlots.delete(self);
		stopGlobalMouseMove();
		offMouse(null, doc);
		if (mouseOwner == self.uid) mouseOwner = null;
		off(dppxchange, win, onDppxChange);
		root.remove();
		true && legendView?.destroy();
		clearPathCache();
		clearDataCache();
		fire("destroy");
	}
	self.destroy = destroy;
	function _init() {
		fire("init", opts, data);
		setData(data || opts.data, false);
		if (pendScales[xScaleKey]) setScale(xScaleKey, pendScales[xScaleKey]);
		else autoScaleX();
		shouldSetSelect = select.show && (select.width > 0 || select.height > 0);
		shouldSetCursor = shouldSetLegend = true;
		setSize(opts);
	}
	series.forEach(initSeries);
	if (true) {
		legend.values.length = series.length;
		legend.values.fill(null);
	}
	if (showLegend) legendView = createLegend(self, root, {
		legend,
		side: legend.side,
		series,
		columns: legendCols,
		multi: multiValLegend,
		mode,
		focusAlpha: focus.alpha,
		cursorFocus,
		bind: cursor.bind,
		emit: handleLegendEvent
	});
	series.forEach((s, i) => {
		fire("addSeries", i);
	});
	axes.forEach(initAxis);
	if (then) {
		if (then instanceof HTMLElement) {
			then.appendChild(root);
			_init();
		} else then(self, _init);
	} else _init();
	return self;
}
uPlot.assign = assign;
uPlot.fmtNum = fmtNum;
uPlot.numDec = numDec;
uPlot.rangeNum = rangeNum;
uPlot.rangeLog = rangeLog;
uPlot.rangeAsinh = rangeAsinh;
uPlot.scan = scanScale;
uPlot.orient = orient;
uPlot.pxRatio = pxRatio;
if (true) uPlot.join = join;
if (true) {
	uPlot.fmtDate = fmtDate;
	uPlot.tzDate = tzDate;
}
uPlot.sync = _sync;
if (true) {
	uPlot.addGap = addGap;
	uPlot.clipGaps = clipGaps;
	let paths = uPlot.paths = { points };
	true && (paths.linear = linear$1);
	true && (paths.stepped = stepped);
	true && (paths.bars = bars);
	true && (paths.spline = monotoneCubic);
	false && (paths.spline2 = catmullRomCentrip);
}

// src/tempo/guard.js
/**
* guard.js — data hygiene for aligned time-series.
*
* uPlot's data contract is `AlignedData = [xs, ys1, ys2, ...]` where every
* array is the same length and index `i` refers to the same timestamp. Real
* feeds violate this constantly: gaps arrive as `null`, bad sensors emit
* `NaN`/`Infinity`, JSON round-trips turn numbers into strings, and streaming
* sources arrive out of order or with duplicate timestamps.
*
* `sanitize()` normalises all of that into a contract-compliant payload and
* reports exactly what it changed, so the UI can be honest about it instead of
* silently drawing a wrong line.
*
* Design notes:
*  - Rows are never invented. A cell that cannot be a finite number becomes
*    `null` (uPlot's gap marker), never `0` — drawing 0 for a missing sample
*    is a lie that a reader cannot detect.
*  - Ordering is repaired by a stable sort, and `rowMap` preserves the link
*    back to the original row so tooltips can cite the source row.
*  - Duplicate timestamps collapse to one row, preferring a row that carries
*    data over one that is entirely null.
*  - The whole function is pure: no DOM, no clock, no globals. That is what
*    makes it testable without a browser.
*/
/** Stable machine-readable issue codes. Order is not significant. */
const ISSUE = {
	EMPTY: "empty",
	SINGLE_POINT: "single-point",
	UNSORTED_X: "unsorted-x",
	DUPLICATE_X: "duplicate-x",
	NON_FINITE_X: "non-finite-x",
	NON_FINITE_Y: "non-finite-y",
	NON_NUMERIC_Y: "non-numeric-y",
	RAGGED: "ragged",
	FLAT_Y: "flat-y",
	ALL_NULL_Y: "all-null-y",
	MISSING_Y: "missing-y"
};
const num = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
/**
* Coerce a cell to a finite number, or null when it is not representable.
* Strings are accepted only when they are unambiguously numeric ("12.5"),
* not when they are hex, dates, or partially numeric ("12px").
*/
function toFiniteNumber(v) {
	if (typeof v === "number") return Number.isFinite(v) ? v : null;
	if (typeof v === "string") {
		const s = v.trim();
		if (s !== "" && num.test(s)) {
			const n = Number(s);
			return Number.isFinite(n) ? n : null;
		}
	}
	return null;
}
/** True when the value is present (not null/undefined) but not a finite number. */
function isPresentButInvalid(v) {
	return v != null && toFiniteNumber(v) == null;
}
function bump(map, code, n = 1) {
	map.set(code, (map.get(code) ?? 0) + n);
}
/**
* Repair an aligned dataset.
*
* @param {Array<Array>} data           raw `[xs, ...ys]` (length >= 1)
* @param {object} [opts]
* @param {boolean} [opts.sort=true]            repair non-monotonic x
* @param {'first'|'last'|'null'} [opts.dedupe='first'] duplicate-x policy
* @param {boolean} [opts.coerceStrings=true]   accept numeric strings
* @param {number} [opts.maxRows=0]             0 = no cap; intentional truncation is reported
* @returns {{data: Array<Array>, issues: Array<{code: string, count: number}>, stats: object, rowMap: number[]}}
*/
function sanitize(data, opts = {}) {
	const { sort = true, dedupe = "first", coerceStrings = true, maxRows = 0 } = opts;
	const started = nowMs();
	const issues = /* @__PURE__ */ new Map();
	if (data == null || !Array.isArray(data) || data.length === 0) {
		bump(issues, ISSUE.EMPTY);
		return finish([[]], issues, {
			inputRows: 0,
			outputRows: 0,
			xsDropped: 0,
			cellsNulled: 0,
			cellsCoerced: 0,
			sorted: false,
			rowsTruncated: 0
		}, [], started);
	}
	const rawXs = Array.isArray(data[0]) ? data[0] : [];
	const rawYs = [];
	for (let s = 1; s < data.length; s++) if (Array.isArray(data[s])) rawYs.push(data[s]);
	else bump(issues, ISSUE.MISSING_Y);
	if (rawYs.length === 0) bump(issues, ISSUE.MISSING_Y);
	const n = rawXs.length;
	if (n === 0) {
		bump(issues, ISSUE.EMPTY);
		return finish([[], ...rawYs.map(() => [])], issues, {
			inputRows: 0,
			outputRows: 0,
			xsDropped: 0,
			cellsNulled: 0,
			cellsCoerced: 0,
			sorted: false,
			rowsTruncated: 0
		}, [], started);
	}
	for (const ys of rawYs) if (ys.length !== n) bump(issues, ISSUE.RAGGED);
	const xs = new Array(n);
	const ys = rawYs.map(() => new Array(n));
	let cellsNulled = 0;
	let cellsCoerced = 0;
	let xsDropped = 0;
	for (let i = 0; i < n; i++) {
		const rawX = rawXs[i];
		const x = toFiniteNumber(rawX);
		if (x == null) {
			xsDropped++;
			if (isPresentButInvalid(rawX)) bump(issues, ISSUE.NON_FINITE_X);
			else bump(issues, ISSUE.NON_FINITE_X);
			xs[i] = null;
		} else xs[i] = x;
		for (let s = 0; s < rawYs.length; s++) {
			const rawY = rawYs[s][i];
			const y = rawY == null ? null : coerceStrings ? toFiniteNumber(rawY) : typeof rawY === "number" && Number.isFinite(rawY) ? rawY : null;
			if (y === rawY && typeof y === "number") ys[s][i] = y;
			else if (y == null) {
				ys[s][i] = null;
				cellsNulled++;
				if (rawY != null) bump(issues, typeof rawY === "number" ? ISSUE.NON_FINITE_Y : ISSUE.NON_NUMERIC_Y);
			} else {
				ys[s][i] = y;
				cellsCoerced++;
				bump(issues, ISSUE.NON_NUMERIC_Y);
			}
		}
	}
	let order = null;
	let sorted = false;
	const usable = xs.filter((x) => x != null).length;
	if (sort && usable > 1) for (let i = 1; i < n; i++) {
		const a = xs[i - 1];
		const b = xs[i];
		if (a != null && b != null && b < a) {
			bump(issues, ISSUE.UNSORTED_X);
			order = buildStableOrder(xs);
			sorted = true;
			break;
		}
	}
	const outX = [];
	const outYs = rawYs.map(() => []);
	const rowMap = [];
	let duplicateX = 0;
	const totalRows = order ? n : n;
	for (let k = 0; k < totalRows; k++) {
		const i = order ? order[k] : k;
		const x = xs[i];
		if (x == null) continue;
		const prevIdx = outX.length - 1;
		if (prevIdx >= 0 && outX[prevIdx] === x) {
			duplicateX++;
			const policy = dedupe;
			if (policy === "null") {
				for (let s = 0; s < rawYs.length; s++) outYs[s][prevIdx] = null;
				continue;
			}
			if (policy === "first") {
				if (rowHasData(outYs, prevIdx)) continue;
			}
			for (let s = 0; s < rawYs.length; s++) outYs[s][prevIdx] = ys[s][i];
			rowMap[prevIdx] = i;
			continue;
		}
		outX.push(x);
		for (let s = 0; s < rawYs.length; s++) outYs[s].push(ys[s][i]);
		rowMap.push(i);
	}
	if (duplicateX > 0) bump(issues, ISSUE.DUPLICATE_X, duplicateX);
	let rowsTruncated = 0;
	let finalX = outX;
	let finalYs = outYs;
	let finalMap = rowMap;
	if (maxRows > 0 && outX.length > maxRows) {
		rowsTruncated = outX.length - maxRows;
		finalX = outX.slice(0, maxRows);
		finalYs = outYs.map((a) => a.slice(0, maxRows));
		finalMap = rowMap.slice(0, maxRows);
	}
	const outRows = finalX.length;
	if (outRows === 0) bump(issues, ISSUE.EMPTY);
	else if (outRows === 1) bump(issues, ISSUE.SINGLE_POINT);
	for (let s = 0; s < finalYs.length; s++) {
		const col = finalYs[s];
		let first = null;
		let flat = true;
		let present = 0;
		for (let i = 0; i < col.length; i++) {
			const v = col[i];
			if (v == null) continue;
			present++;
			if (first == null) first = v;
			else if (v !== first) {
				flat = false;
				break;
			}
		}
		if (present === 0) bump(issues, ISSUE.ALL_NULL_Y);
		else if (flat && present > 1) bump(issues, ISSUE.FLAT_Y);
	}
	const stats = {
		inputRows: n,
		outputRows: outRows,
		xsDropped,
		cellsNulled,
		cellsCoerced,
		sorted,
		rowsTruncated,
		xMin: outRows > 0 ? finalX[0] : null,
		xMax: outRows > 0 ? finalX[outRows - 1] : null
	};
	return finish([finalX, ...finalYs], issues, stats, finalMap, started);
}
function rowHasData(outYs, idx) {
	for (const col of outYs) if (col[idx] != null) return true;
	return false;
}
/**
* Sort indices by x ascending, pushing null-x rows to the end and keeping
* equal keys in their original relative order (spec-compliant stable sort).
*/
function buildStableOrder(xs) {
	const idx = new Array(xs.length);
	for (let i = 0; i < xs.length; i++) idx[i] = i;
	idx.sort((a, b) => {
		const xa = xs[a];
		const xb = xs[b];
		if (xa == null && xb == null) return a - b;
		if (xa == null) return 1;
		if (xb == null) return -1;
		if (xa < xb) return -1;
		if (xa > xb) return 1;
		return a - b;
	});
	return idx;
}
function finish(data, issueMap, stats, rowMap, started) {
	const issues = [...issueMap.entries()].map(([code, count]) => ({
		code,
		count
	}));
	stats.durationMs = nowMs() - started;
	stats.issueCount = issues.reduce((a, b) => a + b.count, 0);
	return {
		data,
		issues,
		stats,
		rowMap
	};
}
function nowMs() {
	return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

// src/tempo/downsample.js
/**
* Build an index list of at most `maxPoints` entries.
*
* @param {Array<number|null>} xs
* @param {Array<number|null>} ys  representative series driving the selection
* @param {number} maxPoints
* @param {'lttb'|'minmax'|'none'} [mode='lttb']
* @returns {number[]} ascending, deduplicated indices
*/
function selectIndices(xs, ys, maxPoints, mode = "lttb") {
	const n = xs.length;
	if (!(maxPoints > 0) || n <= maxPoints || mode === "none") return fullRange(n);
	if (maxPoints < 3) return [0, n - 1].slice(0, maxPoints);
	const runs = splitRuns(ys);
	if (runs.length === 1 && runs[0].len >= n) return mode === "minmax" ? minMax(xs, ys, maxPoints) : lttb(xs, ys, maxPoints);
	const out = [];
	const totalLen = runs.reduce((a, r) => a + r.len, 0);
	let remaining = maxPoints;
	let remainingLen = totalLen;
	for (let r = 0; r < runs.length; r++) {
		const run = runs[r];
		let budget;
		if (r === runs.length - 1) budget = Math.max(2, remaining);
		else {
			budget = Math.max(2, Math.round(run.len / remainingLen * remaining));
			budget = Math.min(budget, Math.max(2, remaining - 2 * (runs.length - r - 1)));
		}
		const sub = runBudget(xs, ys, run.start, run.len, budget, mode);
		for (const i of sub) out.push(run.start + i);
		remaining -= sub.length;
		remainingLen -= run.len;
		if (remaining <= 0) break;
	}
	return dedupeSorted(out);
}
/** Contiguous runs of rows whose representative value is non-null. */
function splitRuns(ys) {
	const runs = [];
	let start = 0;
	let len = 0;
	for (let i = 0; i < ys.length; i++) if (ys[i] == null) {
		if (len > 0) {
			runs.push({
				start,
				len
			});
			len = 0;
		}
		start = i + 1;
	} else len++;
	if (len > 0) runs.push({
		start,
		len
	});
	if (runs.length === 0) runs.push({
		start: 0,
		len: ys.length
	});
	return runs;
}
function runBudget(xs, ys, start, len, budget, mode) {
	if (len <= budget) return fullRange(len);
	const subX = sliceView(xs, start, len);
	const subY = sliceView(ys, start, len);
	const idx = mode === "minmax" ? minMax(subX, subY, budget) : lttb(subX, subY, budget);
	if (idx[0] !== 0) idx.unshift(0);
	if (idx[idx.length - 1] !== len - 1) idx.push(len - 1);
	return idx;
}
function sliceView(arr, start, len) {
	const out = new Array(len);
	for (let i = 0; i < len; i++) out[i] = arr[start + i];
	return out;
}
/**
* Largest-Triangle-Three-Buckets.
* Reference: Sveinn Steinarsson, "Downsampling Time Series for Visual
* Representation" (2013). Null values are treated as 0 for area comparison but
* are never selected as bucket representatives, because a null anchor would
* create a fake gap.
*/
function lttb(xs, ys, threshold) {
	const n = xs.length;
	if (threshold >= n || threshold < 3) return fullRange(n);
	const sampled = new Array(threshold);
	sampled[0] = 0;
	const every = (n - 2) / (threshold - 2);
	let a = 0;
	for (let i = 0; i < threshold - 2; i++) {
		let avgStart = Math.floor((i + 1) * every) + 1;
		let avgEnd = Math.floor((i + 2) * every) + 1;
		avgEnd = avgEnd < n ? avgEnd : n;
		let avgX = 0;
		let avgY = 0;
		let avgCount = 0;
		for (let j = avgStart; j < avgEnd; j++) {
			const v = ys[j];
			if (v == null) continue;
			avgX += xs[j];
			avgY += v;
			avgCount++;
		}
		if (avgCount === 0) {
			avgX = xs[Math.min(avgStart, n - 1)];
			avgY = ys[a] ?? 0;
		} else {
			avgX /= avgCount;
			avgY /= avgCount;
		}
		const rangeOffs = Math.floor(i * every) + 1;
		const rangeTo = Math.floor((i + 1) * every) + 1;
		const pointAX = xs[a];
		const pointAY = ys[a] ?? 0;
		let maxArea = -1;
		let maxIdx = rangeOffs;
		for (let j = rangeOffs; j < rangeTo && j < n; j++) {
			const v = ys[j];
			if (v == null) continue;
			const area = Math.abs((pointAX - avgX) * (v - pointAY) - (pointAX - xs[j]) * (avgY - pointAY));
			if (area > maxArea) {
				maxArea = area;
				maxIdx = j;
			}
		}
		sampled[i + 1] = maxIdx;
		a = maxIdx;
	}
	sampled[threshold - 1] = n - 1;
	return dedupeSorted(sampled);
}
/**
* Per-bucket min/max envelope. Emits both extremes of every bucket in x order,
* which means peaks are preserved by construction rather than by luck.
*/
function minMax(xs, ys, maxPoints) {
	const n = xs.length;
	if (maxPoints >= n || maxPoints < 4) return fullRange(n);
	const buckets = Math.max(1, Math.floor(maxPoints / 2));
	const out = [0];
	for (let b = 0; b < buckets; b++) {
		const from = Math.floor(b * n / buckets);
		const to = Math.floor((b + 1) * n / buckets);
		let lo = -1;
		let hi = -1;
		let loV = Infinity;
		let hiV = -Infinity;
		for (let i = from; i < to; i++) {
			const v = ys[i];
			if (v == null) continue;
			if (v < loV) {
				loV = v;
				lo = i;
			}
			if (v > hiV) {
				hiV = v;
				hi = i;
			}
		}
		if (lo < 0) continue;
		if (lo < hi) {
			out.push(lo);
			if (hi !== lo) out.push(hi);
		} else {
			out.push(hi);
			if (hi !== lo) out.push(lo);
		}
	}
	out.push(n - 1);
	return dedupeSorted(out);
}
/** Apply a shared index list to every series, preserving alignment. */
function decimateAligned(data, maxPoints, mode = "lttb") {
	if (!(maxPoints > 0)) return data;
	const xs = data[0];
	if (xs.length <= maxPoints) return data;
	let rep = 1;
	let best = -1;
	for (let s = 1; s < data.length; s++) {
		let present = 0;
		const col = data[s];
		for (let i = 0; i < col.length; i++) if (col[i] != null) present++;
		if (present > best) {
			best = present;
			rep = s;
		}
	}
	const idx = selectIndices(xs, data[rep] ?? [], maxPoints, mode);
	const out = new Array(data.length);
	for (let s = 0; s < data.length; s++) {
		const src = data[s];
		const dst = new Array(idx.length);
		for (let i = 0; i < idx.length; i++) dst[i] = src[idx[i]];
		out[s] = dst;
	}
	return out;
}
/**
* Measure how much visual information decimation actually cost.
*
* For every original sample we reconstruct the decimated polyline's value at
* that x and compare. Reported numbers are absolute in y units plus a
* normalised ratio against the series' own value span, so the figures are
* interpretable without knowing the data.
*
* @returns {{samples: number, maxAbsError: number, meanAbsError: number,
*            maxNormError: number, peakValueRetained: boolean, ySpan: number}}
*/
function measureFidelity(xs, ys, indices) {
	const n = xs.length;
	const m = indices.length;
	let yMin = Infinity;
	let yMax = -Infinity;
	let peakValue = -Infinity;
	for (let i = 0; i < n; i++) {
		const v = ys[i];
		if (v == null) continue;
		if (v < yMin) yMin = v;
		if (v > yMax) yMax = v;
		if (v > peakValue) peakValue = v;
	}
	const span = yMax - yMin || 1;
	let maxAbs = 0;
	let sumAbs = 0;
	let counted = 0;
	let decimatedPeak = -Infinity;
	for (let k = 0; k < m; k++) {
		const v = ys[indices[k]];
		if (v != null && v > decimatedPeak) decimatedPeak = v;
	}
	let seg = 0;
	for (let i = 0; i < n; i++) {
		const x = xs[i];
		const y = ys[i];
		if (y == null) continue;
		while (seg < m - 2 && xs[indices[seg + 1]] < x) seg++;
		const i0 = indices[seg];
		const i1 = indices[Math.min(seg + 1, m - 1)];
		const x0 = xs[i0];
		const x1 = xs[i1];
		const y0 = ys[i0];
		const y1 = ys[i1];
		if (y0 == null || y1 == null || x0 == null || x1 == null) continue;
		let est;
		if (x1 === x0) est = y0;
		else est = y0 + (y1 - y0) * (x - x0) / (x1 - x0);
		const err = Math.abs(est - y);
		if (err > maxAbs) maxAbs = err;
		sumAbs += err;
		counted++;
	}
	const peakLoss = Number.isFinite(peakValue) && Number.isFinite(decimatedPeak) ? (peakValue - decimatedPeak) / span : 0;
	return {
		samples: n,
		kept: m,
		maxAbsError: maxAbs,
		meanAbsError: counted > 0 ? sumAbs / counted : 0,
		maxNormError: maxAbs / span,
		peakLossRatio: Math.max(0, peakLoss),
		peakValueRetained: Math.max(0, peakLoss) === 0,
		ySpan: span
	};
}
function fullRange(n) {
	const out = new Array(n);
	for (let i = 0; i < n; i++) out[i] = i;
	return out;
}
function dedupeSorted(arr) {
	if (arr.length < 2) return arr;
	const out = [arr[0]];
	for (let i = 1; i < arr.length; i++) if (arr[i] !== arr[i - 1] && arr[i] > arr[i - 1]) out.push(arr[i]);
	return out;
}

// src/tempo/easing.js
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
const linear = (t) => t;
const quadInOut = (t) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const cubicOut = (t) => 1 - Math.pow(1 - t, 3);
const cubicInOut = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const expoOut = (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
const quartOut = (t) => 1 - Math.pow(1 - t, 4);
const backOut = (t) => {
	return 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
};
const EASINGS = {
	linear,
	quadInOut,
	cubicOut,
	cubicInOut,
	expoOut,
	quartOut,
	backOut
};
/** Curves that never leave [0,1]; safe for interpolating measured values. */
const VALUE_EASINGS = [
	"linear",
	"quadInOut",
	"cubicOut",
	"cubicInOut",
	"expoOut",
	"quartOut"
];
function resolveEasing(easing) {
	if (typeof easing === "function") return easing;
	const fn = EASINGS[easing];
	if (typeof fn !== "function") throw new RangeError(`Unknown easing "${easing}". Known: ${Object.keys(EASINGS).join(", ")}`);
	return fn;
}
/** Whether the host asks for reduced motion. Never throws outside a DOM. */
function prefersReducedMotion(host = globalThis) {
	try {
		return !!host.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
	} catch {
		return false;
	}
}

// src/tempo/tween.js
/**
* tween.js — interruptible value transitions on aligned data.
*
* Three rules drive the design:
*
* 1. **Never invent a number.** If either endpoint of a cell is `null`, the
*    interpolated cell takes the target value rather than a midpoint. A
*    midpoint between "no reading" and "42" would draw a value the sensor
*    never produced.
*
* 2. **Never interpolate across different lengths.** Two series of different
*    lengths are different samplings, not a continuous morph. Tempo drops to
*    an axes-only transition and swaps the data at the midpoint, which is
*    honest about what happened.
*
* 3. **Zero allocation per frame.** The output buffer is reused and written in
*    place, so a 60 fps transition at 4 000 points does not hand the GC
*    240 000 array cells per second.
*
* Interruption: calling `start()` while a transition is in flight samples the
* current visual state and uses it as the new origin, so a rapid sequence of
* data updates produces continuous motion instead of snapping back.
*/
function lerp(a, b, t) {
	return a + (b - a) * t;
}
/**
* Write `from`→`to` interpolation at progress `t` into `out`, in place.
* `out` must already have the same shape as `to`.
*/
function interpolateInto(out, from, to, t) {
	if (!(from != null && from.length === to.length && from[0]?.length === to[0]?.length)) {
		for (let s = 0; s < to.length; s++) {
			const dst = out[s];
			const src = to[s];
			for (let i = 0; i < src.length; i++) dst[i] = src[i];
		}
		return out;
	}
	const n = to[0].length;
	for (let s = 0; s < to.length; s++) {
		const dst = out[s];
		const a = from[s];
		const b = to[s];
		if (s === 0) for (let i = 0; i < n; i++) {
			const va = a[i];
			const vb = b[i];
			dst[i] = va == null || vb == null ? vb : lerp(va, vb, t);
		}
		else for (let i = 0; i < n; i++) {
			const va = a[i];
			const vb = b[i];
			dst[i] = va == null || vb == null ? vb : va === vb ? vb : lerp(va, vb, t);
		}
	}
	return out;
}
/** Interpolate a `[min, max]` range. Non-finite endpoints defer to `to`. */
function interpolateRange(from, to, t) {
	if (!from || !to) return to;
	const [a0, a1] = from;
	const [b0, b1] = to;
	return [Number.isFinite(a0) && Number.isFinite(b0) ? lerp(a0, b0, t) : b0, Number.isFinite(a1) && Number.isFinite(b1) ? lerp(a1, b1, t) : b1];
}
/** Deep-ish clone of an aligned dataset (arrays only, cells are primitives). */
function cloneData(data) {
	const out = new Array(data.length);
	for (let s = 0; s < data.length; s++) out[s] = Array.prototype.slice.call(data[s]);
	return out;
}
/**
* A single interruptible transition.
*
* @param {object} opts
* @param {number} [opts.maxTweenPoints=4000] above this, data is swapped instead of tweened
*/
var Transition = class {
	constructor({ maxTweenPoints = 4e3 } = {}) {
		this.maxTweenPoints = maxTweenPoints;
		this.active = false;
		this.mode = "idle";
		this.progress = 0;
		this.frames = 0;
		this.totalFrameMs = 0;
		this.maxFrameMs = 0;
		this._from = null;
		this._to = null;
		this._out = null;
		this._seeded = false;
		this._fromRange = null;
		this._toRange = null;
		this._rangeOut = null;
		this._ease = resolveEasing("cubicInOut");
		this._duration = 0;
		this._elapsed = 0;
		this._onFrame = null;
		this._onDone = null;
		this._swapped = false;
	}
	/**
	* Prime the transition with the payload that is currently on screen, so the
	* next `start()` animates *from* real content instead of snapping from
	* nothing. Charts call this on every non-animated render.
	*/
	seed(data, range = null) {
		if (data == null) {
			this._out = null;
			this._seeded = false;
			return this;
		}
		this._prepare(data, null);
		for (let s = 0; s < data.length && s < this._out.length; s++) {
			const dst = this._out[s];
			const src = data[s];
			for (let i = 0; i < src.length; i++) dst[i] = src[i];
		}
		this._to = null;
		this._from = null;
		this._rangeOut = range ? range.slice() : null;
		this._seeded = true;
		return this;
	}
	/**
	* Begin (or re-target) a transition.
	* @returns {{mode: string, length: number}}
	*/
	start({ data, range, duration = 320, easing = "cubicInOut", onFrame, onDone }) {
		const from = this.active ? this.snapshot() : this._seeded && this._out ? {
			data: cloneData(this._out),
			range: this._rangeOut ? this._rangeOut.slice() : null
		} : null;
		this._ease = resolveEasing(easing);
		this._duration = Math.max(0, duration);
		this._elapsed = 0;
		this._onFrame = onFrame;
		this._onDone = onDone;
		this._swapped = false;
		const target = this._prepare(data, from);
		this._from = from?.data ?? null;
		this._to = target;
		this._fromRange = from?.range ?? null;
		this._toRange = range ?? null;
		this.active = true;
		this.progress = 0;
		const pointCount = target[0].length;
		const sameLength = this._from != null && this._from[0]?.length === pointCount;
		this.mode = this._duration === 0 ? "instant" : sameLength && pointCount <= this.maxTweenPoints ? "values" : "axes-only";
		if (this.mode === "instant") {
			this.progress = 1;
			this._emit();
			this.active = false;
			this._done();
			return {
				mode: this.mode,
				length: pointCount
			};
		}
		if (this.mode === "axes-only") this._emit();
		return {
			mode: this.mode,
			length: pointCount
		};
	}
	/** Current visual state, usable as the origin of the next transition. */
	snapshot() {
		if (!this.active) return null;
		return {
			data: cloneData(this._out ?? this._to),
			range: this._rangeOut ? this._rangeOut.slice() : null
		};
	}
	/** Advance by `dt` milliseconds. Returns true while still animating. */
	tick(dt) {
		if (!this.active) return false;
		const started = perfNow();
		this._elapsed += dt;
		const raw = this._duration === 0 ? 1 : Math.min(1, this._elapsed / this._duration);
		this.progress = raw;
		if (this.mode === "axes-only" && !this._swapped && raw >= .5) this._swapped = true;
		this._emit();
		this.frames++;
		const spent = perfNow() - started;
		this.totalFrameMs += spent;
		if (spent > this.maxFrameMs) this.maxFrameMs = spent;
		if (raw >= 1) {
			this.active = false;
			this.progress = 1;
			this._done();
			return false;
		}
		return true;
	}
	/** Jump straight to the target state and stop. */
	finish() {
		if (!this.active) return;
		this.progress = 1;
		this._emit();
		this.active = false;
		this._done();
	}
	cancel() {
		this.active = false;
		this.mode = "idle";
	}
	/** Interpolated data buffer (identity with what was handed to onFrame). */
	get output() {
		return this._out;
	}
	get range() {
		return this._rangeOut;
	}
	get stats() {
		return {
			mode: this.mode,
			frames: this.frames,
			meanFrameMs: this.frames > 0 ? this.totalFrameMs / this.frames : 0,
			maxFrameMs: this.maxFrameMs
		};
	}
	_prepare(data, from) {
		const rows = data[0].length;
		const cols = data.length;
		if (this._out == null || this._out.length !== cols || this._out[0].length !== rows) {
			this._out = new Array(cols);
			for (let s = 0; s < cols; s++) this._out[s] = new Array(rows);
		}
		return data;
	}
	_emit() {
		const t = this._ease(this.progress);
		if (this.mode === "axes-only") {
			const src = this._swapped || this._from == null ? this._to : this._from;
			for (let s = 0; s < src.length && s < this._out.length; s++) {
				const dst = this._out[s];
				const arr = src[s];
				const len = Math.min(dst.length, arr.length);
				for (let i = 0; i < len; i++) dst[i] = arr[i];
			}
			this._rangeOut = interpolateRange(this._fromRange, this._toRange, t);
		} else {
			interpolateInto(this._out, this._from, this._to, t);
			this._rangeOut = interpolateRange(this._fromRange, this._toRange, t);
		}
		this._onFrame?.(this._out, this._rangeOut, this.progress);
	}
	_done() {
		const cb = this._onDone;
		this._onDone = null;
		cb?.(this);
	}
};
function perfNow() {
	return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

// src/tempo/filter.js
/**
* filter.js — non-destructive filtering for aligned data.
*
* Conditions are structured objects, never strings, so filtering cannot become
* an `eval` surface in a page that displays user-supplied thresholds. A
* condition targets either the x axis or a series index and evaluates to a
* row-level boolean; a row survives only if every active condition passes.
*
* `applyFilter` never mutates its input: the caller keeps the pristine dataset
* and can always show "N of M rows match" without a second pass.
*/
const OP = {
	GT: ">",
	GTE: ">=",
	LT: "<",
	LTE: "<=",
	EQ: "==",
	NE: "!=",
	BETWEEN: "between",
	NOT_NULL: "not-null",
	IS_NULL: "is-null",
	CONTAINS: "contains"
};
const NUMERIC_OPS = /* @__PURE__ */ new Set([
	OP.GT,
	OP.GTE,
	OP.LT,
	OP.LTE,
	OP.EQ,
	OP.NE,
	OP.BETWEEN
]);
/**
* Compile a structured condition into a row predicate.
*
* @param {{axis?: 'x'|'y', series?: number, op: string, value?: number, value2?: number, text?: string}} cond
*   `series` is the index within the y series list (0 = first data series).
* @returns {(xs: ArrayLike, ys: Array<ArrayLike>, i: number) => boolean}
*/
function compileCondition(cond) {
	if (!cond || typeof cond !== "object") throw new TypeError("Condition must be an object");
	const { axis = "y", series = 0, op } = cond;
	if (!Object.values(OP).includes(op)) throw new RangeError(`Unknown operator "${op}"`);
	if (axis === "x") {
		if (!NUMERIC_OPS.has(op) && op !== OP.NOT_NULL && op !== OP.IS_NULL) throw new RangeError(`Operator "${op}" is not valid on the x axis`);
	} else if (!Number.isInteger(series) || series < 0) throw new RangeError("Conditional filters on y require a non-negative integer `series`");
	const value = typeof cond.value === "string" ? Number(cond.value) : cond.value;
	const value2 = typeof cond.value2 === "string" ? Number(cond.value2) : cond.value2;
	if (NUMERIC_OPS.has(op)) {
		if (!Number.isFinite(value)) throw new RangeError(`Operator "${op}" requires a finite \`value\``);
		if (op === OP.BETWEEN && !Number.isFinite(value2)) throw new RangeError("`between` requires a finite `value2`");
	}
	const read = axis === "x" ? (xs, ys, i) => xs[i] : (xs, ys, i) => ys[series]?.[i];
	switch (op) {
		case OP.GT: return (xs, ys, i) => read(xs, ys, i) > value;
		case OP.GTE: return (xs, ys, i) => read(xs, ys, i) >= value;
		case OP.LT: return (xs, ys, i) => read(xs, ys, i) < value;
		case OP.LTE: return (xs, ys, i) => read(xs, ys, i) <= value;
		case OP.EQ: return (xs, ys, i) => read(xs, ys, i) === value;
		case OP.NE: return (xs, ys, i) => read(xs, ys, i) !== value;
		case OP.BETWEEN: {
			const lo = Math.min(value, value2);
			const hi = Math.max(value, value2);
			return (xs, ys, i) => {
				const v = read(xs, ys, i);
				return v != null && v >= lo && v <= hi;
			};
		}
		case OP.NOT_NULL: return (xs, ys, i) => read(xs, ys, i) != null;
		case OP.IS_NULL: return (xs, ys, i) => read(xs, ys, i) == null;
		case OP.CONTAINS: {
			const needle = String(cond.text ?? "").toLowerCase();
			return (xs, ys, i) => String(read(xs, ys, i) ?? "").toLowerCase().includes(needle);
		}
		default: throw new RangeError(`Unhandled operator "${op}"`);
	}
}
/**
* @param {Array} data aligned `[xs, ...ys]`
* @param {object} [opts]
* @param {[number, number]|null} [opts.range] inclusive x window
* @param {Array} [opts.conditions] structured conditions (see compileCondition)
* @param {number[]} [opts.visibleSeries] indices of y series to zero out (hidden)
* @returns {{data: Array, kept: number, total: number, dropped: number, boundaries: {first: number|null, last: number|null}}}
*/
function applyFilter(data, { range = null, conditions = [], visibleSeries = null } = {}) {
	const xs = data[0] ?? [];
	const ys = data.slice(1);
	const total = xs.length;
	const preds = conditions.map(compileCondition);
	const keep = new Uint8Array(total);
	let kept = 0;
	for (let i = 0; i < total; i++) {
		let ok = true;
		if (range) {
			const x = xs[i];
			if (x == null || x < range[0] || x > range[1]) ok = false;
		}
		if (ok) {
			for (let p = 0; p < preds.length; p++) if (!preds[p](xs, ys, i)) {
				ok = false;
				break;
			}
		}
		if (ok) {
			keep[i] = 1;
			kept++;
		}
	}
	const outX = new Array(kept);
	const outYs = ys.map(() => new Array(kept));
	const visible = visibleSeries ? new Set(visibleSeries) : null;
	let k = 0;
	let first = null;
	let last = null;
	for (let i = 0; i < total; i++) {
		if (!keep[i]) continue;
		const x = xs[i];
		outX[k] = x;
		if (first == null) first = x;
		last = x;
		for (let s = 0; s < ys.length; s++) outYs[s][k] = visible && !visible.has(s) ? null : ys[s][i];
		k++;
	}
	return {
		data: [outX, ...outYs],
		kept,
		total,
		dropped: total - kept,
		boundaries: {
			first,
			last
		}
	};
}

// src/tempo/drill.js
/**
* drill.js — hierarchical drill-down over an x axis.
*
* Drilling is modelled as a stack of viewport snapshots rather than as a graph
* of charts. Each level records the range it was entered with, so "back"
* restores the exact previous viewport (including zoom and pan) instead of
* recomputing something that approximately resembles it.
*
* The stack is also the breadcrumb source: `path` returns one label per level,
* root first, which is what a UI needs to render `All › 2026-10 › 2026-10-14`.
*/
var DrillStack = class {
	constructor({ rootLabel = "All", maxDepth = 8 } = {}) {
		this.rootLabel = rootLabel;
		this.maxDepth = maxDepth;
		this._levels = [];
	}
	/** Enter a child viewport. Returns the new depth. */
	push({ range, label, meta = null }) {
		if (!Array.isArray(range) || range.length !== 2) throw new TypeError("drill.push requires a [min, max] range");
		const [lo, hi] = range;
		if (!(hi > lo)) throw new RangeError(`drill.push requires min < max, got [${lo}, ${hi}]`);
		if (this._levels.length >= this.maxDepth) throw new RangeError(`drill depth limit (${this.maxDepth}) reached`);
		this._levels.push({
			range: [lo, hi],
			label: label ?? String(this._levels.length + 1),
			meta
		});
		return this._levels.length;
	}
	/** Leave the current level. Returns the level that is now active, or null. */
	pop() {
		this._levels.pop();
		return this.current;
	}
	/** Return to the root. */
	reset() {
		this._levels.length = 0;
		return this;
	}
	get depth() {
		return this._levels.length;
	}
	get empty() {
		return this._levels.length === 0;
	}
	get current() {
		return this._levels.length > 0 ? this._levels[this._levels.length - 1] : null;
	}
	/** Active x range, or null when at the root. */
	get range() {
		return this.current?.range ?? null;
	}
	/** Breadcrumb labels, root first. */
	get path() {
		return [this.rootLabel, ...this._levels.map((l) => l.label)];
	}
	/** Full stack snapshot (read-only usage). */
	get levels() {
		return this._levels.slice();
	}
};
/**
* Given a raw x selection and the full domain, snap the selection outward to
* the nearest sample boundaries so a drilled view never starts mid-segment.
* This keeps the child view's edge values exact.
*/
function snapRange(xs, [lo, hi]) {
	if (xs.length === 0) return [lo, hi];
	let a = lo;
	let b = hi;
	for (let i = 0; i < xs.length; i++) {
		const x = xs[i];
		if (x == null) continue;
		if (x <= lo) a = x;
		else break;
	}
	for (let i = xs.length - 1; i >= 0; i--) {
		const x = xs[i];
		if (x == null) continue;
		if (x >= hi) b = x;
		else break;
	}
	if (!(b > a)) return [lo, hi];
	return [a, b];
}
/**
* Suggest child ranges by calendar unit. Returns non-empty buckets only, so a
* UI never offers a drill target with no data behind it.
*/
function bucketRanges(xs, unit = "day") {
	const buckets = /* @__PURE__ */ new Map();
	for (let i = 0; i < xs.length; i++) {
		const x = xs[i];
		if (x == null) continue;
		const key = bucketKey(x, unit);
		const b = buckets.get(key);
		if (b == null) buckets.set(key, {
			key,
			lo: x,
			hi: x,
			count: 1
		});
		else {
			b.lo = Math.min(b.lo, x);
			b.hi = Math.max(b.hi, x);
			b.count++;
		}
	}
	return [...buckets.values()].sort((a, b) => a.lo - b.lo);
}
function pad(n) {
	return String(n).padStart(2, "0");
}
function bucketKey(x, unit) {
	const d = new Date(x);
	const y = d.getFullYear();
	const m = pad(d.getMonth() + 1);
	const day = pad(d.getDate());
	if (unit === "hour") return `${y}-${m}-${day} ${pad(d.getHours())}:00`;
	if (unit === "month") return `${y}-${m}`;
	if (unit === "year") return String(y);
	return `${y}-${m}-${day}`;
}

// src/tempo/playback.js
/**
* playback.js — time-axis replay.
*
* Replay is the feature uPlot does not have and cannot express: uPlot renders
* whatever array you hand it. Tempo treats the dataset as a timeline that can
* be played, paused, scrubbed and stepped, with three presentation modes:
*
*   reveal  — data is uncovered progressively from xMin to xMax (accumulating).
*   window  — a fixed-width window slides along x (a moving "now").
*   cursor  — the full series stays visible and a marker advances (comparison).
*
* Time mapping is linear in **x**, not in row index, so a replay follows wall
* time even when the sampling is irregular. A dataset that is silent for ten
* minutes therefore stays silent on screen for ten minutes at 1×.
*
* `RevealData` uses zero-copy typed-array views so a 1 000 000-point series can
* be revealed at 60 fps without reallocating the payload every frame.
*/
const PLAYBACK_STATE = {
	IDLE: "idle",
	PLAYING: "playing",
	PAUSED: "paused",
	ENDED: "ended"
};
const PLAYBACK_MODE = {
	REVEAL: "reveal",
	WINDOW: "window",
	CURSOR: "cursor"
};
const SPEEDS = [
	.25,
	.5,
	1,
	2,
	4,
	8
];
var Playback = class {
	constructor({ duration = 8e3, speed = 1, mode = PLAYBACK_MODE.REVEAL, windowRatio = .35, onFrame = null, onStateChange = null } = {}) {
		this._duration = Math.max(1, duration);
		this._speed = SPEEDS.includes(speed) ? speed : 1;
		this._mode = mode;
		this._windowRatio = Math.min(1, Math.max(.02, windowRatio));
		this._elapsed = 0;
		this._state = PLAYBACK_STATE.IDLE;
		this._exactCursor = null;
		this._mapping = null;
		this._xMin = 0;
		this._xMax = 1;
		this._data = null;
		this._reveal = null;
		this._onFrame = onFrame;
		this._onStateChange = onStateChange;
	}
	attach(data) {
		this._data = data ?? null;
		const xs = data?.[0];
		if (!xs || xs.length === 0) {
			this._xMin = 0;
			this._xMax = 0;
			this._reveal = null;
			return this;
		}
		let min = Infinity;
		let max = -Infinity;
		for (let i = 0; i < xs.length; i++) {
			const x = xs[i];
			if (x == null) continue;
			if (x < min) min = x;
			if (x > max) max = x;
		}
		this._xMin = Number.isFinite(min) ? min : 0;
		this._xMax = Number.isFinite(max) ? max : this._xMin + 1;
		this._reveal = new RevealData(data);
		return this;
	}
	play() {
		if (!this._data || this._data[0].length === 0) return this;
		if (this._state === PLAYBACK_STATE.ENDED) this._elapsed = 0;
		this._setState(PLAYBACK_STATE.PLAYING);
		return this;
	}
	pause() {
		if (this._state === PLAYBACK_STATE.PLAYING) this._setState(PLAYBACK_STATE.PAUSED);
		return this;
	}
	toggle() {
		return this._state === PLAYBACK_STATE.PLAYING ? this.pause() : this.play();
	}
	reset() {
		this._elapsed = 0;
		this._exactCursor = null;
		this._setState(PLAYBACK_STATE.IDLE);
		this._emit();
		return this;
	}
	/** Seek to normalised progress in [0,1]. */
	seek(progress) {
		this._exactCursor = null;
		this._elapsed = clamp01(progress) * this._duration;
		if (this._state === PLAYBACK_STATE.ENDED && this._elapsed < this._duration) this._setState(PLAYBACK_STATE.PAUSED);
		this._emit();
		return this;
	}
	/** Seek to an absolute x value on the timeline. */
	seekX(x) {
		const span = this._xMax - this._xMin;
		if (!(span > 0)) return this;
		this.seek((x - this._xMin) / span);
		this._exactCursor = x;
		return this;
	}
	/** Normalised progress that corresponds to an absolute x value. */
	xProgress(x) {
		const span = this._xMax - this._xMin;
		if (!(span > 0)) return 0;
		return clamp01((x - this._xMin) / span);
	}
	/** Step forward/backward by `n` samples (uses the backing data's x array). */
	step(n = 1) {
		const xs = this._data?.[0];
		if (!xs || xs.length === 0) return this;
		const cursor = this.cursorX;
		let best = 0;
		let bestDist = Infinity;
		for (let i = 0; i < xs.length; i++) {
			const d = Math.abs(xs[i] - cursor);
			if (d < bestDist) {
				bestDist = d;
				best = i;
			}
		}
		const next = Math.min(xs.length - 1, Math.max(0, best + n));
		return this.seekX(xs[next]);
	}
	setSpeed(speed) {
		if (!SPEEDS.includes(speed)) throw new RangeError(`Unsupported speed ${speed}. Allowed: ${SPEEDS.join(", ")}`);
		this._speed = speed;
		return this;
	}
	setMode(mode) {
		if (!Object.values(PLAYBACK_MODE).includes(mode)) throw new RangeError(`Unsupported playback mode ${mode}`);
		this._mode = mode;
		this._emit();
		return this;
	}
	setDuration(ms) {
		this._duration = Math.max(1, ms);
		return this;
	}
	/**
	* Nonlinear timeline mapping.
	*
	* Elastic windows (chart-standard.io, Grafana, Perfetto) compress quiet
	* stretches so that a 12-hour replay is not 11 hours of flat line. The
	* mapping is a pair of exact inverses; when installed, `progress` is
	* interpreted in *timeline* space and `cursorX` returns real time.
	*/
	setMapping(mapping) {
		this._mapping = mapping ?? null;
		return this;
	}
	get mapping() {
		return this._mapping;
	}
	/** Advance by wall-clock milliseconds; speed scales the timeline. */
	tick(dt) {
		if (this._state !== PLAYBACK_STATE.PLAYING) return false;
		this._elapsed += dt * this._speed;
		this._exactCursor = null;
		if (this._elapsed >= this._duration) {
			this._elapsed = this._duration;
			this._setState(PLAYBACK_STATE.ENDED);
			this._emit();
			return false;
		}
		this._emit();
		return true;
	}
	get state() {
		return this._state;
	}
	get speed() {
		return this._speed;
	}
	get mode() {
		return this._mode;
	}
	get duration() {
		return this._duration;
	}
	get progress() {
		return clamp01(this._elapsed / this._duration);
	}
	get cursorX() {
		if (this._exactCursor != null) return this._exactCursor;
		if (this._mapping) {
			const [t0, t1] = this._mapping.timelineDomain;
			return this._mapping.toReal(t0 + (t1 - t0) * this.progress);
		}
		const span = this._xMax - this._xMin;
		return this._xMin + span * this.progress;
	}
	/** The full x domain of the attached dataset. */
	get domain() {
		return [this._xMin, this._xMax];
	}
	/** Visible x range for the current mode and progress. */
	get visibleRange() {
		const span = this._xMax - this._xMin;
		if (this._mode === PLAYBACK_MODE.WINDOW) {
			if (this._mapping) {
				const [t0, t1] = this._mapping.timelineDomain;
				const tCur = t0 + (t1 - t0) * this.progress;
				const tLo = Math.max(t0, tCur - (t1 - t0) * this._windowRatio);
				return [this._mapping.toReal(tLo), this._mapping.toReal(tCur)];
			}
			const w = span * this._windowRatio;
			const right = this._xMin + span * this.progress;
			return [Math.max(this._xMin, right - w), right];
		}
		if (this._mode === PLAYBACK_MODE.CURSOR) return [this._xMin, this._xMax];
		return [this._xMin, this.cursorX];
	}
	/** Data to render for the current progress, or null before attach(). */
	get frame() {
		if (!this._data) return null;
		if (this._mode === PLAYBACK_MODE.REVEAL) return this._reveal ? this._reveal.upTo(this.cursorX) : this._data;
		if (this._mode === PLAYBACK_MODE.WINDOW) {
			const [lo, hi] = this.visibleRange;
			return this._reveal ? this._reveal.between(lo, hi) : this._data;
		}
		return this._data;
	}
	static get speeds() {
		return SPEEDS.slice();
	}
	_setState(next) {
		if (next === this._state) return;
		const prev = this._state;
		this._state = next;
		this._onStateChange?.(next, prev);
	}
	_emit() {
		this._onFrame?.(this);
	}
};
function clamp01(v) {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}
/**
* Zero-copy progressive views over an aligned dataset.
*
* A x-array needs `n + 1` slots in the buffer because a reveal always shows one
* synthetic boundary sample: the interpolated point on the segment that the
* cursor is currently crossing. That boundary is a real interpolation of two
* real samples, not invented data — the line visually terminates exactly at the
* cursor instead of stopping at the last whole sample.
*/
var RevealData = class {
	constructor(data) {
		this._src = data;
		this._n = data[0].length;
		this._buffers = new Array(data.length);
		this._boundary = new Array(data.length);
		for (let s = 0; s < data.length; s++) {
			const src = data[s];
			const buf = new Float64Array(this._n + 1);
			for (let i = 0; i < this._n; i++) {
				const v = src[i];
				buf[i] = v == null ? NaN : v;
			}
			this._buffers[s] = buf;
		}
		this._len = 0;
	}
	/** Index of the last sample whose x <= target, or -1. */
	_indexAt(x) {
		const xs = this._src[0];
		let lo = 0;
		let hi = this._n - 1;
		let ans = -1;
		while (lo <= hi) {
			const mid = lo + hi >> 1;
			if (xs[mid] <= x) {
				ans = mid;
				lo = mid + 1;
			} else hi = mid - 1;
		}
		return ans;
	}
	/** View of all samples up to `x`, plus the interpolated boundary sample. */
	upTo(x) {
		const idx = this._indexAt(x);
		if (idx < 0) {
			this._len = 0;
			return [this._buffers[0].subarray(0, 0), ...this._buffers.slice(1).map((b) => b.subarray(0, 0))];
		}
		const xs = this._src[0];
		const atEnd = idx >= this._n - 1 || xs[idx + 1] == null || x >= xs[this._n - 1];
		const count = idx + 1;
		const withBoundary = !atEnd && x > xs[idx] && xs[idx + 1] > xs[idx];
		const total = withBoundary ? count + 1 : count;
		for (let s = 0; s < this._buffers.length; s++) if (withBoundary) {
			const a = this._src[s][idx];
			const b = this._src[s][idx + 1];
			this._buffers[s][count] = a == null || b == null ? s === 0 ? x : NaN : s === 0 ? x : a + (b - a) * (x - xs[idx]) / (xs[idx + 1] - xs[idx]);
		}
		this._len = total;
		const out = new Array(this._buffers.length);
		for (let s = 0; s < out.length; s++) out[s] = this._buffers[s].subarray(0, total);
		return out;
	}
	/** View of samples inside [lo, hi]. */
	between(lo, hi) {
		this._src[0];
		let a = this._indexAt(lo);
		if (a < 0) a = 0;
		const b = this._indexAt(hi);
		const end = b < 0 ? 0 : b + 1;
		const out = new Array(this._src.length);
		for (let s = 0; s < this._src.length; s++) {
			const src = this._src[s];
			const slice = new Float64Array(Math.max(0, end - a));
			for (let i = a; i < end; i++) {
				const v = src[i];
				slice[i - a] = v == null ? NaN : v;
			}
			out[s] = slice;
		}
		this._len = Math.max(0, end - a);
		return out;
	}
};

// src/tempo/stream.js
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
var RingBuffer = class {
	/**
	* @param {object} opts
	* @param {number} [opts.capacity=2000] rows retained before eviction
	* @param {number} [opts.series=1] number of y series
	*/
	constructor({ capacity = 2e3, series = 1 } = {}) {
		if (!(capacity > 1)) throw new RangeError("RingBuffer capacity must be > 1");
		if (!(series >= 1)) throw new RangeError("RingBuffer needs at least one series");
		this.capacity = Math.floor(capacity);
		this.series = Math.floor(series);
		this._cols = this.series + 1;
		this._buf = new Float64Array(this.capacity * this._cols);
		this._head = 0;
		this._size = 0;
		this.stats = {
			received: 0,
			evicted: 0,
			rejectedOutOfOrder: 0,
			replacedSameX: 0
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
		if (this._size === 0) return null;
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
			return "rejected";
		}
		const last = this.lastX;
		if (last != null && x < last) {
			this.stats.rejectedOutOfOrder++;
			return "rejected";
		}
		if (last != null && x === last) {
			const base = (this._head - 1 + this.capacity) % this.capacity * this._cols;
			this._buf[base] = x;
			for (let s = 0; s < this.series; s++) {
				const v = row[s + 1];
				this._buf[base + s + 1] = Number.isFinite(v) ? v : NaN;
			}
			this.stats.replacedSameX++;
			return "replaced";
		}
		const base = this._head * this._cols;
		this._buf[base] = x;
		for (let s = 0; s < this.series; s++) {
			const v = row[s + 1];
			this._buf[base + s + 1] = Number.isFinite(v) ? v : NaN;
		}
		this._head = (this._head + 1) % this.capacity;
		if (this._size < this.capacity) this._size++;
		else this.stats.evicted++;
		return "added";
	}
	/** Push many rows; returns per-status counts. */
	pushAll(rows) {
		const out = {
			added: 0,
			replaced: 0,
			rejected: 0
		};
		for (let i = 0; i < rows.length; i++) out[this.push(rows[i])]++;
		return out;
	}
	clear() {
		this._head = 0;
		this._size = 0;
		this.stats = {
			received: 0,
			evicted: 0,
			rejectedOutOfOrder: 0,
			replacedSameX: 0
		};
		return this;
	}
	/**
	* Materialise the window in chronological order.
	* Reuses `into` when it matches shape, so steady-state streaming does not
	* allocate a new payload per frame.
	*/
	toAligned(into = null) {
		const reusable = into && into.length === this._cols && (into.__cap ?? into[0].length) >= this._size;
		const out = reusable ? into : Array.from({ length: this._cols }, () => new Array(this._size));
		const start = this._size === this.capacity ? this._head : 0;
		for (let i = 0; i < this._size; i++) {
			const base = (start + i) % this.capacity * this._cols;
			for (let c = 0; c < this._cols; c++) {
				const v = this._buf[base + c];
				out[c][i] = Number.isNaN(v) ? null : v;
			}
		}
		if (reusable) {
			Object.defineProperty(out, "__cap", {
				value: into.__cap ?? into[0].length,
				configurable: true,
				writable: true
			});
			for (let c = 0; c < this._cols; c++) out[c].length = this._size;
		}
		return out;
	}
	/** Iterate rows in chronological order without materialising arrays. */
	forEachRow(fn) {
		const start = this._size === this.capacity ? this._head : 0;
		for (let i = 0; i < this._size; i++) {
			const base = (start + i) % this.capacity * this._cols;
			fn(this._buf[base], this._buf, base + 1, i);
		}
	}
};
/**
* At most one flush per frame. `request()` is cheap and idempotent; `flush()`
* is what the render loop calls once per rAF tick.
*/
var Coalescer = class {
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
		if (!this._pending) return false;
		this._pending = false;
		this._flushes++;
		this._onFlush?.();
		return true;
	}
	get stats() {
		return {
			requests: this._requests,
			flushes: this._flushes,
			coalesced: this._requests - this._flushes
		};
	}
};

// src/tempo/metrics.js
/**
* metrics.js — measurement primitives used by the chart and the benchmarks.
*
* The numbers this module produces end up in the README, so it deliberately
* keeps raw samples instead of only an average: an average hides the one frame
* that stuttered, and a stutter is exactly what a reader of an animated chart
* notices.
*/
/** Nearest-rank percentile over an unsorted sample array. */
function percentile(samples, p) {
	if (samples.length === 0) return NaN;
	const sorted = Array.prototype.slice.call(samples).sort((a, b) => a - b);
	const rank = Math.ceil(p / 100 * sorted.length) - 1;
	return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}
function summarize(samples) {
	if (samples.length === 0) return {
		n: 0,
		min: NaN,
		mean: NaN,
		p50: NaN,
		p95: NaN,
		p99: NaN,
		max: NaN,
		sum: 0
	};
	let sum = 0;
	let min = Infinity;
	let max = -Infinity;
	for (let i = 0; i < samples.length; i++) {
		const v = samples[i];
		sum += v;
		if (v < min) min = v;
		if (v > max) max = v;
	}
	return {
		n: samples.length,
		min,
		mean: sum / samples.length,
		p50: percentile(samples, 50),
		p95: percentile(samples, 95),
		p99: percentile(samples, 99),
		max,
		sum
	};
}
/** A named ring of samples, capped so long sessions cannot grow unbounded. */
var SampleSeries = class {
	constructor(name, cap = 2e4) {
		this.name = name;
		this.cap = cap;
		this.samples = [];
	}
	add(v) {
		this.samples.push(v);
		if (this.samples.length > this.cap) this.samples.shift();
		return this;
	}
	clear() {
		this.samples.length = 0;
		return this;
	}
	get stats() {
		return summarize(this.samples);
	}
};
/**
* Collect a labelled set of sample series.
* `report()` is the object written into a benchmark JSON file verbatim.
*/
var Metrics = class {
	constructor() {
		this._series = /* @__PURE__ */ new Map();
	}
	series(name) {
		let s = this._series.get(name);
		if (!s) this._series.set(name, s = new SampleSeries(name));
		return s;
	}
	add(name, v) {
		this.series(name).add(v);
		return this;
	}
	clear() {
		this._series.clear();
		return this;
	}
	report() {
		const out = {};
		for (const [name, s] of this._series) out[name] = summarize(s.samples);
		return out;
	}
};

// src/tempo/index.js
/**
* index.js — TempoChart: the uPlot binding.
*
* The upstream renderer is never modified. Everything here attaches through
* uPlot's public surface (`hooks`, `opts`, `setData`, `setScale`), which means
* uPlot's own 1 500-test suite still describes the renderer's behaviour
* exactly. Tempo adds a pipeline in front of it:
*
*   raw input
*     → sanitize()        repair contract violations, report them
*     → applyFilter()     x window, structured conditions, hidden series
*     → decimate()        one shared index list, ≤ 2 px per point
*     → playback slice    zero-copy view of the decimated payload
*     → transition        interruptible value tween (equal-length only)
*     → u.setData()
*
* Decimation happens **once per data change**, not once per frame. Everything
* that runs at 60 fps therefore operates on a bounded array (≤ maxPoints), which
* is what makes replay and transitions viable on a million-row dataset.
*/
const now = () => typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
var TempoChart = class {
	/**
	* @param {HTMLElement} el
	* @param {object} opts
	* @param {Array} opts.data                 raw aligned data
	* @param {Array} opts.series               uPlot series opts (one per y series)
	* @param {number} [opts.height=320]
	* @param {number} [opts.maxPoints]          render budget; defaults to ~1.5 per px
	* @param {'lttb'|'minmax'|'none'} [opts.decimation='lttb']
	* @param {number} [opts.transitionDuration=320]
	* @param {string} [opts.transitionEasing='cubicInOut']
	* @param {string} [opts.playbackMode='reveal']
	* @param {number} [opts.playbackDuration=8000]
	* @param {(issues: Array) => void} [opts.onIssues]
	* @param {(stats: object) => void} [opts.onMetrics]
	*/
	constructor(el, opts = {}) {
		this.el = el;
		this.opts = opts;
		this.metrics = new Metrics();
		this.maxPoints = opts.maxPoints ?? 0;
		this.decimation = opts.decimation ?? "lttb";
		this.transitionDuration = opts.transitionDuration ?? 320;
		this.transitionEasing = opts.transitionEasing ?? "cubicInOut";
		this.reducedMotion = prefersReducedMotion();
		this._raw = null;
		this._base = null;
		this._view = null;
		this._issues = [];
		this._filter = {
			range: null,
			conditions: [],
			visibleSeries: null
		};
		this._destroyed = false;
		this._pumping = false;
		this._xLock = null;
		this._yLock = null;
		this._yLockFull = null;
		this._budgetCache = null;
		this._lastFrameAt = 0;
		this._rafId = null;
		this.drill = new DrillStack({
			rootLabel: opts.rootLabel ?? "All",
			maxDepth: opts.maxDrillDepth ?? 8
		});
		this.playback = new Playback({
			duration: opts.playbackDuration ?? 8e3,
			mode: opts.playbackMode ?? PLAYBACK_MODE.REVEAL,
			speed: opts.playbackSpeed ?? 1,
			onFrame: () => this._requestPump(),
			onStateChange: (state, prev) => this.opts.onPlaybackState?.(state, prev)
		});
		this.transition = new Transition({ maxTweenPoints: opts.maxTweenPoints ?? 4e3 });
		this._coalescer = new Coalescer(() => this._onStreamFlush());
		this.stream = null;
		this._seriesOpts = (opts.series ?? [{}]).map((s) => ({ ...s }));
		this._build();
		this.setData(opts.data ?? [[], []]);
	}
	_build() {
		const height = this.opts.height ?? 320;
		const width = this.opts.width ?? this.el.clientWidth ?? 640;
		if (!this.maxPoints) this._resolveBudget(width);
		const series = [{
			label: "time",
			value: (u, v) => fmtTime(v)
		}];
		for (const s of this._seriesOpts) series.push({
			label: s.label ?? "value",
			stroke: s.stroke ?? "#d97706",
			width: s.width ?? 2,
			points: { show: false },
			...s
		});
		const uopts = {
			width,
			height,
			padding: [
				12,
				16,
				8,
				8
			],
			cursor: {
				drag: {
					x: true,
					y: false,
					setScale: false,
					dist: 8
				},
				points: { size: 7 }
			},
			legend: {
				show: true,
				live: true
			},
			scales: {
				x: {
					time: true,
					auto: true,
					range: (u, dataMin, dataMax) => this._xLock ?? [dataMin, dataMax]
				},
				y: {
					auto: true,
					range: (u, dataMin, dataMax) => this._yLock ?? [dataMin, dataMax]
				}
			},
			series,
			axes: [{
				stroke: "#8b8b8b",
				grid: { stroke: "rgba(128,128,128,0.12)" },
				ticks: { stroke: "rgba(128,128,128,0.25)" }
			}, {
				stroke: "#8b8b8b",
				grid: { stroke: "rgba(128,128,128,0.12)" },
				ticks: { stroke: "rgba(128,128,128,0.25)" },
				size: 56
			}],
			hooks: {
				draw: [(u) => this._drawOverlay(u)],
				setSelect: [(u) => this._onSelect(u)],
				setCursor: [(u) => this._onCursor(u)]
			}
		};
		if (this.opts.axisStroke || this.opts.gridStroke) {}
		this._u = new uPlot(uopts, [[], ...this._seriesOpts.map(() => [])], this.el);
		this._width = width;
	}
	_resolveBudget(width) {
		this.maxPoints = Math.max(300, Math.floor(width * 1.5));
	}
	setSize(width, height) {
		if (this._destroyed) return;
		if (width) {
			this._width = width;
			if (!this.opts.maxPoints) this._resolveBudget(width);
		}
		this._u.setSize({
			width: width ?? this._width,
			height: height ?? this.opts.height ?? 320
		});
		if (this._view) this._applyFrame(this._currentFrame());
	}
	destroy() {
		this._destroyed = true;
		if (this._rafId != null) {
			cancelAnimationFrame?.(this._rafId);
			this._rafId = null;
		}
		this.stream = null;
		this._u?.destroy();
		this._u = null;
	}
	/** Replace the dataset. Repairs, reports, and (optionally) animates in. */
	setData(raw, { animate = true } = {}) {
		if (this._destroyed) return this;
		const t0 = now();
		const result = sanitize(raw, this.opts.sanitize);
		this.metrics.add("sanitize.ms", now() - t0);
		this._raw = raw;
		this._base = result.data;
		this._issues = result.issues;
		this.rowMap = result.rowMap;
		this.sanitizeStats = result.stats;
		if (this.drill.depth > 0) this.drill.reset();
		this.opts.onIssues?.(result.issues, result.stats);
		const first = this._firstData !== false;
		this._firstData = false;
		this._rebuild({ animate: animate && !first });
		return this;
	}
	get issues() {
		return this._issues.slice();
	}
	get data() {
		return this._base;
	}
	/** The array currently handed to the renderer (post-decimation). */
	get view() {
		return this._view;
	}
	_rebuild({ animate = false, keepPlaybackProgress = true } = {}) {
		const t0 = now();
		const filtered = applyFilter(this._base, {
			range: this._filter.range ?? this.drill.range,
			conditions: this._filter.conditions,
			visibleSeries: this._filter.visibleSeries
		});
		const t1 = now();
		this.metrics.add("filter.ms", t1 - t0);
		const view = decimateAligned(filtered.data, this.maxPoints, this.decimation);
		this.metrics.add("decimate.ms", now() - t1);
		this._view = view;
		this._filterStats = {
			kept: filtered.kept,
			total: filtered.total,
			dropped: filtered.dropped
		};
		this._computeYLock(view);
		const progress = this.playback.progress;
		this.playback.attach(view);
		if (keepPlaybackProgress) this.playback.seek(progress);
		this.opts.onViewChange?.({
			view,
			filter: this._filterStats,
			drill: this.drill.path
		});
		if (animate && this.transitionDuration > 0 && !this.reducedMotion) this._transitionTo(view);
		else {
			this.transition.cancel();
			const frame = this._currentFrame();
			this.transition.seed(frame);
			this._applyFrame(frame);
		}
	}
	/** Full y extent of the current view, used to pin the axis during replay. */
	_computeYLock(view) {
		let lo = Infinity;
		let hi = -Infinity;
		for (let s = 1; s < view.length; s++) {
			const col = view[s];
			for (let i = 0; i < col.length; i++) {
				const v = col[i];
				if (v == null || !Number.isFinite(v)) continue;
				if (v < lo) lo = v;
				if (v > hi) hi = v;
			}
		}
		if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
			this._yLock = null;
			return;
		}
		if (hi === lo) {
			const pad = Math.abs(lo) * .05 || 1;
			lo -= pad;
			hi += pad;
		} else {
			const pad = (hi - lo) * .06;
			lo -= pad;
			hi += pad;
		}
		this._yLockFull = [lo, hi];
		this._yLock = this._replayActive() ? this._yLockFull : null;
	}
	_replayActive() {
		const pb = this.playback;
		return pb.state !== PLAYBACK_STATE.IDLE || pb.progress > 0;
	}
	_syncLocks() {
		if (!this._replayActive()) {
			this._xLock = null;
			this._yLock = null;
			return;
		}
		const [lo, hi] = this.playback.domain;
		this._xLock = this.playback.mode === PLAYBACK_MODE.WINDOW ? null : [lo, hi];
		this._yLock = this._yLockFull ?? null;
	}
	_transitionTo(data) {
		this.transition.start({
			data,
			duration: this.transitionDuration,
			easing: this.transitionEasing,
			onFrame: (out) => this._applyFrame(out)
		});
		this._requestPump();
	}
	_currentFrame() {
		const pb = this.playback;
		if (pb.state === PLAYBACK_STATE.IDLE && pb.progress === 0) return this._view;
		return pb.frame ?? this._view;
	}
	_applyFrame(data) {
		if (this._destroyed || !this._u) return;
		this._syncLocks();
		const t0 = now();
		this._u.setData(this._budgetFrame(data), true);
		const dt = now() - t0;
		this.metrics.add("render.ms", dt);
		if (this.playback.state === PLAYBACK_STATE.PLAYING) this.metrics.add("playback.frameMs", dt);
		this.opts.onFrame?.({
			data,
			ms: dt
		});
	}
	/**
	* Progressive views over a large payload must still respect the render
	* budget: a 1 000 000-point reveal at 60 fps would otherwise hand uPlot a
	* million points per frame. The index space is computed against the full
	* view each time (memoised per view identity), then applied to the slice.
	*/
	_budgetFrame(data) {
		const len = data[0]?.length ?? 0;
		if (len <= this.maxPoints || !this._view) return data;
		const viewLen = this._view[0].length;
		if (viewLen > 0 && len / viewLen < 1.08) return data;
		const cache = this._budgetCache;
		if (cache && cache.len === len && cache.src === this._view) return cache.out;
		const out = decimateAligned(data, this.maxPoints, this.decimation);
		this._budgetCache = {
			len,
			src: this._view,
			out
		};
		return out;
	}
	play() {
		this.transition.cancel();
		this.playback.play();
		this._requestPump();
		return this;
	}
	pause() {
		this.playback.pause();
		return this;
	}
	toggle() {
		return this.playback.state === PLAYBACK_STATE.PLAYING ? this.pause() : this.play();
	}
	seek(progress) {
		this.transition.cancel();
		this.playback.seek(progress);
		this._applyFrame(this._currentFrame());
		return this;
	}
	seekX(x) {
		this.transition.cancel();
		this.playback.seekX(x);
		this._applyFrame(this._currentFrame());
		return this;
	}
	setSpeed(speed) {
		this.playback.setSpeed(speed);
		return this;
	}
	setPlaybackMode(mode) {
		this.playback.setMode(mode);
		this._applyFrame(this._currentFrame());
		return this;
	}
	_requestPump() {
		if (this._pumping || this._destroyed) return;
		this._pumping = true;
		this._lastFrameAt = now();
		const loop = () => {
			if (this._destroyed) {
				this._pumping = false;
				return;
			}
			const t = now();
			const dt = Math.min(t - this._lastFrameAt, 100);
			this._lastFrameAt = t;
			let busy = false;
			if (this.playback.state === PLAYBACK_STATE.PLAYING) {
				const stillPlaying = this.playback.tick(dt);
				this._applyFrame(this._currentFrame());
				busy = stillPlaying;
			}
			if (this.transition.active) {
				const stillTweening = this.transition.tick(dt);
				busy = busy || stillTweening;
			}
			if (this._coalescer.pending) {
				this._coalescer.flush();
				busy = true;
			}
			if (busy) this._rafId = requestAnimationFrame(loop);
			else {
				this._rafId = null;
				this._pumping = false;
				this.opts.onMetrics?.(this.getStats());
			}
		};
		this._rafId = requestAnimationFrame(loop);
	}
	setFilter(patch) {
		Object.assign(this._filter, patch);
		this._rebuild({ animate: true });
		return this;
	}
	clearFilter() {
		this._filter = {
			range: null,
			conditions: [],
			visibleSeries: null
		};
		this._rebuild({ animate: true });
		return this;
	}
	get filter() {
		return {
			...this._filter,
			stats: this._filterStats
		};
	}
	/** Zoom-and-enter a child level. `range` is snapped to sample boundaries. */
	drillTo(range, label) {
		const snapped = snapRange(this._base[0], range);
		this.drill.push({
			range: snapped,
			label
		});
		this._rebuild({ animate: true });
		this.opts.onDrillChange?.(this.drill.path, this.drill.depth);
		return this;
	}
	drillBack() {
		if (this.drill.empty) return this;
		this.drill.pop();
		this._rebuild({ animate: true });
		this.opts.onDrillChange?.(this.drill.path, this.drill.depth);
		return this;
	}
	drillReset() {
		this.drill.reset();
		this._rebuild({ animate: true });
		this.opts.onDrillChange?.(this.drill.path, 0);
		return this;
	}
	_onSelect(u) {
		const { left, width } = u.select;
		if (!(width > 4)) return;
		const lo = u.posToVal(left, "x");
		const hi = u.posToVal(left + width, "x");
		u.setSelect({
			left: 0,
			top: 0,
			width: 0,
			height: 0
		}, false);
		this.opts.onSelectRange?.(lo, hi);
	}
	_onCursor() {
		this.opts.onCursor?.(this.playback.cursorX);
	}
	/**
	* Start a bounded live feed.
	* @param {{capacity?: number, interval?: number, series?: number}} opts
	*/
	startStream(opts = {}) {
		const series = Math.max(1, this._seriesOpts.length || 1);
		this.stream = new RingBuffer({
			capacity: opts.capacity ?? 1200,
			series
		});
		this.playback.reset();
		this._applyFrame([[[]], ...Array.from({ length: series }, () => [[]])]);
		return this;
	}
	/** Append one row to the live window. Coalesced to at most one render/frame. */
	push(row) {
		if (!this.stream) this.startStream();
		const verdict = this.stream.push(row);
		if (verdict !== "rejected") {
			this._coalescer.request();
			this._requestPump();
		}
		return verdict;
	}
	_onStreamFlush() {
		if (!this.stream) return;
		const aligned = this.stream.toAligned();
		const view = decimateAligned(aligned, this.maxPoints, this.decimation);
		this._view = view;
		this._base = aligned;
		this._applyFrame(view);
	}
	get streamStats() {
		return {
			...this._coalescer.stats,
			...this.stream ? this.stream.stats : {},
			size: this.stream?.size ?? 0,
			capacity: this.stream?.capacity ?? 0
		};
	}
	_drawOverlay(u) {
		const pb = this.playback;
		if (pb.state === PLAYBACK_STATE.IDLE && pb.progress === 0) return;
		if (pb.mode === PLAYBACK_MODE.CURSOR) {
			const { ctx } = u;
			const px = Math.round(u.valToPos(pb.cursorX, "x", true));
			ctx.save();
			ctx.globalAlpha = .9;
			ctx.strokeStyle = this.opts.playheadColor ?? "#b45309";
			ctx.lineWidth = 1;
			ctx.setLineDash([4, 4]);
			ctx.beginPath();
			ctx.moveTo(px, u.bbox.top);
			ctx.lineTo(px, u.bbox.top + u.bbox.height);
			ctx.stroke();
			ctx.restore();
		}
	}
	getStats() {
		return {
			rows: this._base?.[0].length ?? 0,
			rendered: this._view?.[0].length ?? 0,
			budget: this.maxPoints,
			series: this._seriesOpts.length,
			filter: this._filterStats,
			issues: this._issues,
			transition: this.transition.stats,
			playback: {
				state: this.playback.state,
				mode: this.playback.mode,
				speed: this.playback.speed,
				progress: this.playback.progress
			},
			drill: this.drill.path,
			stream: this.streamStats,
			metrics: this.metrics.report()
		};
	}
};
function fmtTime(v) {
	if (v == null) return "--";
	const d = new Date(v);
	if (!Number.isFinite(d.getTime())) return String(v);
	return d.toISOString().replace("T", " ").replace(".000Z", "Z");
}

// src/tempo/clock.js
/**
* Manual scheduler for tests and for deterministic benchmark runs.
* `step(ms)` advances virtual time by `ms` and fires exactly one frame.
*/
function createManualScheduler(startTime = 0) {
	let t = startTime;
	let pending = null;
	let nextId = 1;
	const scheduler = {
		mode: "manual",
		now: () => t,
		request(cb) {
			pending = {
				id: nextId++,
				cb
			};
			return pending.id;
		},
		cancel(id) {
			if (pending && pending.id === id) pending = null;
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
			if (!p) return false;
			pending = null;
			p.cb(t);
			return true;
		},
		get pending() {
			return pending != null;
		}
	};
	return scheduler;
}
/**
* Drive `cb(dtMs, nowMs)` on the scheduler until stopped.
* `dt` is clamped so that a stalled tab (or a debugger pause) cannot teleport
* playback forward by seconds — an important detail for readable animation.
*/
function createFrameLoop(scheduler, cb, { maxDt = 100 } = {}) {
	let id = null;
	let last = null;
	let running = false;
	function frame(now) {
		if (!running) return;
		const dt = last == null ? 0 : Math.min(now - last, maxDt);
		last = now;
		cb(dt, now);
		if (running) id = scheduler.request(frame);
	}
	return {
		start() {
			if (running) return;
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
		}
	};
}

// src/tempo/compress.js
/**
* compress.js — turn a raw feed into an adaptive replay timeline.
*
* Live data is rarely evenly spaced and is often long and quiet. Playing back
* 12 hours of mostly-idle sensor data at a fixed duration would spend most of
* the animation on nothing happening, so Tempo compresses **empty stretches**
* and guarantees that every stretch containing data gets a minimum share of
* the timeline.
*
* The mapping is piecewise linear and strictly monotonic:
*
*   timelineTime(x) = Σ segments  →  a continuous, invertible function
*
* Both directions are exact inverses of each other, which is what lets a
* playhead drag map back to a real timestamp without drifting.
*/
/**
* Build a piecewise-linear compression map.
*
* @param {number[]} xs      ascending timestamps (real axis)
* @param {object} [opts]
* @param {number} [opts.gapFactor=4]  a gap longer than `gapFactor × median step` is compressed
* @param {number} [opts.gapWeight=1]  weight of gap time relative to data time
* @returns {{toTimeline:(x:number)=>number, toReal:(t:number)=>number, domain:[number,number], timelineDomain:[number,number], segments:Array, compressed:boolean}}
*/
function compressWindow(xs, { gapFactor = 4, gapWeight = 1 } = {}) {
	const n = xs.length;
	if (n < 3) return identity(xs);
	const steps = [];
	for (let i = 1; i < n; i++) {
		const d = xs[i] - xs[i - 1];
		if (d > 0) steps.push(d);
	}
	if (steps.length === 0) return identity(xs);
	steps.sort((a, b) => a - b);
	const median = steps[Math.floor(steps.length / 2)];
	const threshold = median * gapFactor;
	const segments = [];
	let acc = 0;
	let compressed = false;
	for (let i = 1; i < n; i++) {
		const d = xs[i] - xs[i - 1];
		const isGap = d > threshold;
		if (isGap) compressed = true;
		const w = isGap ? d * gapWeight : d;
		segments.push({
			from: xs[i - 1],
			to: xs[i],
			t0: acc,
			t1: acc + w,
			weight: w
		});
		acc += w;
	}
	const realMin = xs[0];
	const realMax = xs[n - 1];
	const tlMax = acc;
	function toTimeline(x) {
		if (x <= realMin) return 0;
		if (x >= realMax) return tlMax;
		let lo = 0;
		let hi = segments.length - 1;
		while (lo < hi) {
			const mid = lo + hi + 1 >> 1;
			if (segments[mid].from <= x) lo = mid;
			else hi = mid - 1;
		}
		const s = segments[lo];
		const span = s.to - s.from;
		const f = span > 0 ? (x - s.from) / span : 0;
		return s.t0 + f * s.weight;
	}
	function toReal(t) {
		if (t <= 0) return realMin;
		if (t >= tlMax) return realMax;
		let lo = 0;
		let hi = segments.length - 1;
		while (lo < hi) {
			const mid = lo + hi + 1 >> 1;
			if (segments[mid].t0 <= t) lo = mid;
			else hi = mid - 1;
		}
		const s = segments[lo];
		const w = s.weight;
		const f = w > 0 ? (t - s.t0) / w : 0;
		return s.from + f * (s.to - s.from);
	}
	return {
		toTimeline,
		toReal,
		domain: [realMin, realMax],
		timelineDomain: [0, tlMax],
		segments,
		compressed,
		medianStep: median,
		gaps: segments.filter((s) => s.to - s.from > threshold).length
	};
}
function identity(xs) {
	const min = xs.length ? xs[0] : 0;
	const max = xs.length ? xs[xs.length - 1] : 1;
	return {
		toTimeline: (x) => x - min,
		toReal: (t) => min + t,
		domain: [min, max],
		timelineDomain: [0, Math.max(1e-9, max - min)],
		segments: [],
		compressed: false,
		medianStep: 0,
		gaps: 0
	};
}

// src/tempo/fidelity.js
/**
* fidelity.js — how much does decimation actually cost, in pixels?
*
* `measureFidelity` in downsample.js scores the reconstruction at every
* original x. That is the right number for "how much information was dropped",
* but it is the wrong number for "can a reader tell the difference": at
* 1 002 px wide, 417 samples share one column, and no reader can see 417
* separate values.
*
* `pixelFidelity` answers the visual question. It builds the per-column
* envelope of (a) the raw series and (b) the decimated polyline — following the
* drawn segments across column boundaries, not just the retained vertices — and
* reports the vertical disagreement in CSS pixels.
*
* Pure: no canvas, no DOM. The benchmark page and the Node sweep share it so
* both report the same units.
*/
/**
* @param {ArrayLike<number>} xs          ascending
* @param {ArrayLike<number|null>} ys     null = gap
* @param {number[]} indices              retained indices, ascending
* @param {number} width                  plot width in CSS px
* @param {number} height                 plot height in CSS px
*/
function pixelFidelity(xs, ys, indices, width, height) {
	const n = xs.length;
	if (!n || !indices.length) return null;
	let yMin = Infinity;
	let yMax = -Infinity;
	for (let i = 0; i < n; i++) {
		const v = ys[i];
		if (v == null) continue;
		if (v < yMin) yMin = v;
		if (v > yMax) yMax = v;
	}
	if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return null;
	const span = yMax - yMin || 1;
	const x0 = xs[0];
	const dx = (xs[n - 1] - x0 || 1) / width;
	const colOf = (x) => Math.min(width - 1, Math.max(0, Math.floor((x - x0) / dx)));
	const rawMin = new Float64Array(width).fill(Infinity);
	const rawMax = new Float64Array(width).fill(-Infinity);
	for (let i = 0; i < n; i++) {
		const v = ys[i];
		if (v == null) continue;
		const c = colOf(xs[i]);
		if (v < rawMin[c]) rawMin[c] = v;
		if (v > rawMax[c]) rawMax[c] = v;
	}
	const decMin = new Float64Array(width).fill(Infinity);
	const decMax = new Float64Array(width).fill(-Infinity);
	for (let k = 0; k < indices.length - 1; k++) {
		const ia = indices[k];
		const ib = indices[k + 1];
		const xa = xs[ia];
		const xb = xs[ib];
		const ya = ys[ia];
		const yb = ys[ib];
		if (ya == null || yb == null || !(xb > xa)) continue;
		const cFrom = colOf(xa);
		const cTo = colOf(xb);
		const slope = (yb - ya) / (xb - xa);
		for (let c = cFrom; c <= cTo; c++) {
			const lo = Math.max(xa, x0 + c * dx);
			const hi = Math.min(xb, x0 + (c + 1) * dx);
			if (hi < lo) continue;
			const yl = ya + slope * (lo - xa);
			const yh = ya + slope * (hi - xa);
			const loV = yl < yh ? yl : yh;
			const hiV = yl < yh ? yh : yl;
			if (loV < decMin[c]) decMin[c] = loV;
			if (hiV > decMax[c]) decMax[c] = hiV;
		}
	}
	let maxDiffPx = 0;
	let worstCol = -1;
	let sumDiffPx = 0;
	let columns = 0;
	for (let c = 0; c < width; c++) {
		if (rawMin[c] === Infinity || decMin[c] === Infinity) continue;
		const dLo = Math.abs(rawMin[c] - decMin[c]);
		const dHi = Math.abs(rawMax[c] - decMax[c]);
		const d = (dLo > dHi ? dLo : dHi) / span * height;
		sumDiffPx += d;
		columns++;
		if (d > maxDiffPx) {
			maxDiffPx = d;
			worstCol = c;
		}
	}
	return {
		width,
		height,
		maxDiffPx: +maxDiffPx.toFixed(2),
		meanDiffPx: columns ? +(sumDiffPx / columns).toFixed(2) : null,
		worstCol,
		columnsCompared: columns
	};
}
/**
* Smallest budget at which the worst column stays under `thresholdPx`.
* Returns null when even the largest candidate misses the threshold, which is
* itself a useful answer: the data has detail the screen cannot hold.
*/
function budgetForPixelTolerance(xs, ys, selectFn, { thresholdPx = 1, width = 1002, height = 360, candidates = [
	1200,
	2400,
	4800,
	9600,
	19200,
	38400,
	76800
] } = {}) {
	for (const budget of candidates) {
		const px = pixelFidelity(xs, ys, selectFn(xs, ys, budget), width, height);
		if (px && px.maxDiffPx <= thresholdPx) return {
			budget,
			...px
		};
	}
	return null;
}

// src/tempo.bundle.js
/**
* tempo.bundle.js — single-file build entry for the browser demos.
*
* uPlot is bundled in (no runtime dependency, no CDN); the demo shell only
* needs `window.Tempo`.
*/
const Tempo = {
	TempoChart,
	Playback,
	RevealData,
	DrillStack,
	RingBuffer,
	Coalescer,
	Transition,
	sanitize,
	ISSUE,
	decimateAligned,
	selectIndices,
	lttb,
	minMax,
	measureFidelity,
	applyFilter,
	compileCondition,
	OP,
	snapRange,
	bucketRanges,
	summarize,
	percentile,
	Metrics,
	createManualScheduler,
	createFrameLoop,
	compressWindow,
	pixelFidelity,
	budgetForPixelTolerance,
	interpolateInto,
	interpolateRange,
	EASINGS,
	VALUE_EASINGS,
	PLAYBACK_MODE,
	PLAYBACK_STATE
};
if (typeof window !== "undefined") window.Tempo = Tempo;

export { Tempo as default };