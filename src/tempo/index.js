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

import uPlot from '../uPlot.js';
import { sanitize, ISSUE } from './guard.js';
import { decimateAligned } from './downsample.js';
import { Transition } from './tween.js';
import { prefersReducedMotion } from './easing.js';
import { applyFilter, OP } from './filter.js';
import { DrillStack, snapRange, bucketRanges } from './drill.js';
import { Playback, PLAYBACK_MODE, PLAYBACK_STATE } from './playback.js';
import { RingBuffer, Coalescer } from './stream.js';
import { Metrics } from './metrics.js';

export {
	ISSUE, OP, PLAYBACK_MODE, PLAYBACK_STATE,
	applyFilter, decimateAligned, sanitize, snapRange, bucketRanges,
	Playback, DrillStack, RingBuffer, Coalescer, Transition,
};

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

export class TempoChart {
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

		this.maxPoints = opts.maxPoints ?? 0; // resolved in _resizeBudget()
		this.decimation = opts.decimation ?? 'lttb';
		this.transitionDuration = opts.transitionDuration ?? 320;
		this.transitionEasing = opts.transitionEasing ?? 'cubicInOut';
		this.reducedMotion = prefersReducedMotion();

		this._raw = null;
		this._base = null;
		this._view = null;
		this._issues = [];
		this._filter = { range: null, conditions: [], visibleSeries: null };
		this._destroyed = false;
		this._pumping = false;
		this._xLock = null;
		this._yLock = null;
		this._yLockFull = null;
		this._budgetCache = null;
		this._lastFrameAt = 0;
		this._rafId = null;

		this.drill = new DrillStack({ rootLabel: opts.rootLabel ?? 'All', maxDepth: opts.maxDrillDepth ?? 8 });

		this.playback = new Playback({
			duration: opts.playbackDuration ?? 8000,
			mode: opts.playbackMode ?? PLAYBACK_MODE.REVEAL,
			speed: opts.playbackSpeed ?? 1,
			onFrame: () => this._requestPump(),
			onStateChange: (state, prev) => this.opts.onPlaybackState?.(state, prev),
		});

		this.transition = new Transition({ maxTweenPoints: opts.maxTweenPoints ?? 4000 });

		this._coalescer = new Coalescer(() => this._onStreamFlush());
		this.stream = null;

		this._seriesOpts = (opts.series ?? [{}]).map(s => ({ ...s }));

		this._build();
		this.setData(opts.data ?? [[], []]);
	}

	// ---- lifecycle ---------------------------------------------------------

	_build() {
		const height = this.opts.height ?? 320;
		const width = this.opts.width ?? this.el.clientWidth ?? 640;

		if (!this.maxPoints)
			this._resolveBudget(width);

		const series = [{ label: 'time', value: (u, v) => fmtTime(v) }];
		for (const s of this._seriesOpts)
			series.push({ label: s.label ?? 'value', stroke: s.stroke ?? '#d97706', width: s.width ?? 2, points: { show: false }, ...s });

		const self = this;

		const uopts = {
			width,
			height,
			padding: [12, 16, 8, 8],
			cursor: {
				drag: { x: true, y: false, setScale: false, dist: 8 },
				points: { size: 7 },
			},
			legend: { show: true, live: true },
			scales: {
				x: {
					time: true,
					auto: true,
					// During replay the viewport is pinned to the full domain so the
					// series uncovers left-to-right instead of the axes rescaling
					// every frame (which reads as the line shrinking, not growing).
					range: (u, dataMin, dataMax) => this._xLock ?? [dataMin, dataMax],
				},
				y: {
					auto: true,
					// A replay with an auto y axis flickers: each frame re-ranges on
					// a growing window. Pinning to the full payload's extent keeps
					// the reader's mental scale stable.
					range: (u, dataMin, dataMax) => this._yLock ?? [dataMin, dataMax],
				},
			},
			series,
			axes: [
				{ stroke: '#8b8b8b', grid: { stroke: 'rgba(128,128,128,0.12)' }, ticks: { stroke: 'rgba(128,128,128,0.25)' } },
				{ stroke: '#8b8b8b', grid: { stroke: 'rgba(128,128,128,0.12)' }, ticks: { stroke: 'rgba(128,128,128,0.25)' }, size: 56 },
			],
			hooks: {
				draw: [u => this._drawOverlay(u)],
				setSelect: [u => this._onSelect(u)],
				setCursor: [u => this._onCursor(u)],
			},
		};

		if (this.opts.axisStroke || this.opts.gridStroke) {
			// Optional theme passthrough kept small on purpose.
		}

		this._u = new uPlot(uopts, [[], ...this._seriesOpts.map(() => [])], this.el);
		this._width = width;
	}

	_resolveBudget(width) {
		// 1.5 samples per CSS pixel: at that density an LTTB path is
		// pixel-indistinguishable from the raw polyline on any DPR.
		this.maxPoints = Math.max(300, Math.floor(width * 1.5));
	}

	setSize(width, height) {
		if (this._destroyed) return;
		if (width) {
			this._width = width;
			if (!this.opts.maxPoints)
				this._resolveBudget(width);
		}
		this._u.setSize({ width: width ?? this._width, height: height ?? this.opts.height ?? 320 });
		if (this._view)
			this._applyFrame(this._currentFrame());
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

	// ---- data --------------------------------------------------------------

	/** Replace the dataset. Repairs, reports, and (optionally) animates in. */
	setData(raw, { animate = true } = {}) {
		if (this._destroyed) return this;

		const t0 = now();
		const result = sanitize(raw, this.opts.sanitize);
		this.metrics.add('sanitize.ms', now() - t0);

		this._raw = raw;
		this._base = result.data;
		this._issues = result.issues;
		this.rowMap = result.rowMap;
		this.sanitizeStats = result.stats;

		if (this.drill.depth > 0)
			this.drill.reset();

		this.opts.onIssues?.(result.issues, result.stats);

		// The very first payload is painted without a transition: there is
		// nothing to transition from, and a fade-in would only delay the read.
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
			visibleSeries: this._filter.visibleSeries,
		});

		const t1 = now();
		this.metrics.add('filter.ms', t1 - t0);

		const view = decimateAligned(filtered.data, this.maxPoints, this.decimation);
		this.metrics.add('decimate.ms', now() - t1);

		this._view = view;
		this._filterStats = { kept: filtered.kept, total: filtered.total, dropped: filtered.dropped };
		this._computeYLock(view);

		const progress = this.playback.progress;
		this.playback.attach(view);
		if (keepPlaybackProgress)
			this.playback.seek(progress);

		this.opts.onViewChange?.({ view, filter: this._filterStats, drill: this.drill.path });

		if (animate && this.transitionDuration > 0 && !this.reducedMotion) {
			this._transitionTo(view);
		}
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
			const pad = Math.abs(lo) * 0.05 || 1;
			lo -= pad;
			hi += pad;
		}
		else {
			const pad = (hi - lo) * 0.06;
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
		// The window mode scrolls, so only the y axis is pinned.
		this._xLock = this.playback.mode === PLAYBACK_MODE.WINDOW ? null : [lo, hi];
		this._yLock = this._yLockFull ?? null;
	}

	_transitionTo(data) {
		this.transition.start({
			data,
			duration: this.transitionDuration,
			easing: this.transitionEasing,
			onFrame: out => this._applyFrame(out),
		});
		this._requestPump();
	}

	_currentFrame() {
		const pb = this.playback;
		if (pb.state === PLAYBACK_STATE.IDLE && pb.progress === 0)
			return this._view;
		return pb.frame ?? this._view;
	}

	_applyFrame(data) {
		if (this._destroyed || !this._u)
			return;

		this._syncLocks();

		const t0 = now();
		this._u.setData(this._budgetFrame(data), true);
		const dt = now() - t0;
		this.metrics.add('render.ms', dt);

		if (this.playback.state === PLAYBACK_STATE.PLAYING)
			this.metrics.add('playback.frameMs', dt);

		this.opts.onFrame?.({ data, ms: dt });
	}

	/**
	 * Progressive views over a large payload must still respect the render
	 * budget: a 1 000 000-point reveal at 60 fps would otherwise hand uPlot a
	 * million points per frame. The index space is computed against the full
	 * view each time (memoised per view identity), then applied to the slice.
	 */
	_budgetFrame(data) {
		const len = data[0]?.length ?? 0;
		if (len <= this.maxPoints || !this._view)
			return data;

		// Below ~8% decimation, culling the points would cost more than it saves.
		const viewLen = this._view[0].length;
		if (viewLen > 0 && len / viewLen < 1.08)
			return data;

		const cache = this._budgetCache;
		if (cache && cache.len === len && cache.src === this._view)
			return cache.out;

		const out = decimateAligned(data, this.maxPoints, this.decimation);
		this._budgetCache = { len, src: this._view, out };
		return out;
	}

	// ---- playback ----------------------------------------------------------

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
		if (this._pumping || this._destroyed)
			return;
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

			if (busy) {
				this._rafId = requestAnimationFrame(loop);
			}
			else {
				this._rafId = null;
				this._pumping = false;
				this.opts.onMetrics?.(this.getStats());
			}
		};

		this._rafId = requestAnimationFrame(loop);
	}

	// ---- filtering & drill-down -------------------------------------------

	setFilter(patch) {
		Object.assign(this._filter, patch);
		this._rebuild({ animate: true });
		return this;
	}

	clearFilter() {
		this._filter = { range: null, conditions: [], visibleSeries: null };
		this._rebuild({ animate: true });
		return this;
	}

	get filter() {
		return { ...this._filter, stats: this._filterStats };
	}

	/** Zoom-and-enter a child level. `range` is snapped to sample boundaries. */
	drillTo(range, label) {
		const snapped = snapRange(this._base[0], range);
		this.drill.push({ range: snapped, label });
		this._rebuild({ animate: true });
		this.opts.onDrillChange?.(this.drill.path, this.drill.depth);
		return this;
	}

	drillBack() {
		if (this.drill.empty)
			return this;
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
		if (!(width > 4))
			return;

		const lo = u.posToVal(left, 'x');
		const hi = u.posToVal(left + width, 'x');

		u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
		this.opts.onSelectRange?.(lo, hi);
	}

	_onCursor() {
		this.opts.onCursor?.(this.playback.cursorX);
	}

	// ---- live --------------------------------------------------------------

	/**
	 * Start a bounded live feed.
	 * @param {{capacity?: number, interval?: number, series?: number}} opts
	 */
	startStream(opts = {}) {
		const series = Math.max(1, (this._seriesOpts.length || 1));
		this.stream = new RingBuffer({ capacity: opts.capacity ?? 1200, series });
		this.playback.reset();
		this._applyFrame([[[]], ...Array.from({ length: series }, () => [[]])]);
		return this;
	}

	/** Append one row to the live window. Coalesced to at most one render/frame. */
	push(row) {
		if (!this.stream)
			this.startStream();

		const verdict = this.stream.push(row);

		if (verdict !== 'rejected') {
			this._coalescer.request();
			this._requestPump();
		}

		return verdict;
	}

	_onStreamFlush() {
		if (!this.stream)
			return;

		const aligned = this.stream.toAligned();
		const view = decimateAligned(aligned, this.maxPoints, this.decimation);
		this._view = view;
		this._base = aligned;
		this._applyFrame(view);
	}

	get streamStats() {
		return {
			...this._coalescer.stats,
			...(this.stream ? this.stream.stats : {}),
			size: this.stream?.size ?? 0,
			capacity: this.stream?.capacity ?? 0,
		};
	}

	// ---- overlay -----------------------------------------------------------

	_drawOverlay(u) {
		const pb = this.playback;

		if (pb.state === PLAYBACK_STATE.IDLE && pb.progress === 0)
			return;

		if (pb.mode === PLAYBACK_MODE.CURSOR) {
			const { ctx } = u;
			const px = Math.round(u.valToPos(pb.cursorX, 'x', true));

			ctx.save();
			ctx.globalAlpha = 0.9;
			ctx.strokeStyle = this.opts.playheadColor ?? '#b45309';
			ctx.lineWidth = 1;
			ctx.setLineDash([4, 4]);
			ctx.beginPath();
			ctx.moveTo(px, u.bbox.top);
			ctx.lineTo(px, u.bbox.top + u.bbox.height);
			ctx.stroke();
			ctx.restore();
		}
	}

	// ---- reporting ---------------------------------------------------------

	getStats() {
		return {
			rows: this._base?.[0].length ?? 0,
			rendered: this._view?.[0].length ?? 0,
			budget: this.maxPoints,
			series: this._seriesOpts.length,
			filter: this._filterStats,
			issues: this._issues,
			transition: this.transition.stats,
			playback: { state: this.playback.state, mode: this.playback.mode, speed: this.playback.speed, progress: this.playback.progress },
			drill: this.drill.path,
			stream: this.streamStats,
			metrics: this.metrics.report(),
		};
	}
}

function fmtTime(v) {
	if (v == null) return '--';
	const d = new Date(v);
	if (!Number.isFinite(d.getTime())) return String(v);
	return d.toISOString().replace('T', ' ').replace('.000Z', 'Z');
}

export default TempoChart;
