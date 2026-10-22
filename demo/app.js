/* global Tempo, TempoData */
/**
 * app.js — the demo workbench.
 *
 * Plain script on purpose: the page must also run from file:// where ES module
 * loading is blocked. Every panel drives the real public API — no mock numbers,
 * no placeholders. Readouts are polled from `chart.getStats()`, which reports
 * measurements taken during the actual render.
 */
(function () {
	'use strict';

	const T = window.Tempo;
	const D = window.TempoData;
	const P = D.PALETTE;

	if (!T) {
		document.getElementById('plot').textContent = 'Tempo bundle failed to load (dist/tempo.iife.min.js).';
		return;
	}

	const $ = id => document.getElementById(id);
	const plotEl = $('plot');
	const controlsEl = $('controls');
	const hintEl = $('hint');
	const readoutEl = $('readout');
	const notesEl = $('notes');
	const tabsEl = $('tabs');

	// ---- tiny DOM helpers ---------------------------------------------------

	function h(tag, attrs, kids) {
		const el = document.createElement(tag);
		if (attrs) {
			for (const k in attrs) {
				if (k === 'class') el.className = attrs[k];
				else if (k === 'text') el.textContent = attrs[k];
				else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
				else el.setAttribute(k, attrs[k]);
			}
		}
		for (const kid of kids || []) {
			if (kid == null) continue;
			el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
		}
		return el;
	}

	function btn(label, on, opts) {
		opts = opts || {};
		const b = h('button', { class: 'btn' + (opts.primary ? ' primary' : ''), type: 'button' }, [label]);
		b.addEventListener('click', on);
		if (opts.pressed != null) b.setAttribute('aria-pressed', String(opts.pressed));
		return b;
	}

	function seg(items, current, onPick) {
		const wrap = h('div', { class: 'seg' });
		items.forEach(item => {
			const b = h('button', { type: 'button', 'aria-pressed': String(item.value === current) }, [item.label]);
			b.addEventListener('click', () => {
				for (const other of wrap.children) other.setAttribute('aria-pressed', 'false');
				b.setAttribute('aria-pressed', 'true');
				onPick(item.value);
			});
			wrap.appendChild(b);
		});
		return wrap;
	}

	function group(label, ...nodes) {
		const g = h('div', { class: 'group' }, [h('span', { class: 'group-label', text: label })]);
		for (const n of nodes) if (n) g.appendChild(n);
		return g;
	}

	function range(min, max, step, value, onInput) {
		const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
		input.addEventListener('input', () => onInput(Number(input.value)));
		return input;
	}

	// ---- formatting --------------------------------------------------------

	function fmtTime(x) {
		if (x == null || !Number.isFinite(x)) return '—';
		const d = new Date(x);
		if (!Number.isFinite(d.getTime())) return '—';
		const p = n => String(n).padStart(2, '0');
		return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
	}

	function fmtNum(v, digits) {
		if (v == null || !Number.isFinite(v)) return '—';
		if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
		if (Math.abs(v) >= 10000) return (v / 1000).toFixed(1) + 'k';
		return v.toFixed(digits == null ? 2 : digits);
	}

	function fmtMs(v) {
		if (v == null || !Number.isFinite(v)) return '—';
		// Sub-millisecond canvas command time is normal for a few thousand
		// points; showing "0.00 ms" would look like a broken measurement.
		if (v < 0.01) return v.toFixed(4) + ' ms';
		if (v < 1) return v.toFixed(3) + ' ms';
		if (v < 100) return v.toFixed(2) + ' ms';
		return v.toFixed(1) + ' ms';
	}

	// ---- readout -----------------------------------------------------------

	function paintReadout(cells) {
		readoutEl.innerHTML = '';
		for (const cell of cells) {
			const [k, v, cls, note] = cell;
			readoutEl.appendChild(h('div', { class: 'cell' + (cls ? ' ' + cls : '') }, [
				h('div', { class: 'k', text: k }),
				h('div', { class: 'v' }, [
					document.createTextNode(v),
					note ? h('small', { text: ' ' + note }) : null,
				]),
			]));
		}
	}

	function paintNotes(notes) {
		notesEl.innerHTML = '';
		for (const n of notes || []) {
			const box = h('div', { class: 'note' }, [h('h3', { text: n.h })]);
			if (n.p) box.appendChild(h('p', { text: n.p }));
			if (n.list) {
				const ul = h('ul');
				for (const li of n.list) ul.appendChild(h('li', { text: li }));
				box.appendChild(ul);
			}
			if (n.html) box.insertAdjacentHTML('beforeend', n.html);
			notesEl.appendChild(box);
		}
	}

	// =======================================================================
	// Scene 1 — replay
	// =======================================================================

	function sceneReplay() {
		const raw = D.gappySeries(720);
		let chart;

		chart = new T.TempoChart(plotEl, {
			data: raw,
			height: 360,
			series: [{ label: '机房温度 ℃', stroke: P.amber, width: 2 }],
			playbackDuration: 9000,
			playbackMode: T.PLAYBACK_MODE.REVEAL,
			transitionDuration: 320,
			onPlaybackState: () => setTimeout(paintControls, 0),
		});

		let controls;

		const playBtn = btn('▶ 播放', () => {
			chart.toggle();
			setTimeout(paintControls, 0);
		}, { primary: true });

		const progress = range(0, 1000, 1, 0, v => chart.seek(v / 1000));
		progress.style.flex = '1';
		progress.style.width = 'auto';

		function paintControls() {
			const playing = chart.playback.state === T.PLAYBACK_STATE.PLAYING;
			playBtn.textContent = playing ? '⏸ 暂停' : (chart.playback.state === T.PLAYBACK_STATE.ENDED ? '↻ 重播' : '▶ 播放');
			const p = Math.round(chart.playback.progress * 1000);
			if (document.activeElement !== progress) progress.value = String(p);
		}

		controls = [
			group('transport', playBtn, btn('⏮', () => { chart.playback.reset(); chart._applyFrame(chart._currentFrame()); paintControls(); })),
			group('speed', seg(
				[{ label: '0.5×', value: 0.5 }, { label: '1×', value: 1 }, { label: '2×', value: 2 }, { label: '4×', value: 4 }],
				1, v => chart.setSpeed(v),
			)),
			group('mode', seg(
				[
					{ label: '揭示', value: T.PLAYBACK_MODE.REVEAL },
					{ label: '滑窗', value: T.PLAYBACK_MODE.WINDOW },
					{ label: '游标', value: T.PLAYBACK_MODE.CURSOR },
				],
				T.PLAYBACK_MODE.REVEAL, v => chart.setPlaybackMode(v),
			)),
		];

		return {
			chart,
			controls,
			extraControls: [h('div', { class: 'timeline', style: 'flex:1 1 100%' }, [progress])],
			hint: '拖动时间条可以任意定位（scrub）；播放中改变速度或模式不会跳帧。数据里有两段 4–9 小时的停机，回放按真实时间推进——停机就是停机，不会被“跳过”。',
			readout() {
				const s = chart.getStats();
				const m = s.metrics;
				return [
					['游标时间', fmtTime(chart.playback.cursorX)],
					['进度', (chart.playback.progress * 100).toFixed(1) + '%'],
					['可见 / 总点', fmtNum(s.rendered, 0) + ' / ' + fmtNum(s.rows, 0)],
					['渲染中位', fmtMs(m['render.ms'] && m['render.ms'].p50), '', 'p50'],
					['渲染 p95', fmtMs(m['render.ms'] && m['render.ms'].p95), '', 'p95'],
					['状态', s.playback.state, s.playback.state === 'playing' ? 'ok' : ''],
				];
			},
			destroy() { chart.destroy(); },
		};
	}

	// =======================================================================
	// Scene 2 — transitions
	// =======================================================================

	function sceneTransition() {
		const n = 720;
		const base = D.timeSeries(n, { stepMs: 60000, seriesCount: 2, seed: 41 });
		const alt = [base[0], base[1].map((v, i) => 100 - v), base[2].map((v, i) => v * 0.6 + 18)];

		let instant = false;
		let chart;

		chart = new T.TempoChart(plotEl, {
			data: base,
			height: 360,
			series: [
				{ label: '入站流量', stroke: P.amber, width: 2 },
				{ label: '出站流量', stroke: P.teal, width: 2 },
			],
			transitionDuration: 420,
			transitionEasing: 'cubicInOut',
			onFrame: () => {},
		});

		let side = 'A';

		return {
			chart,
			controls: [
				group('dataset', seg(
					[{ label: 'A', value: 'A' }, { label: 'B', value: 'B' }],
					'A', v => {
						side = v;
						chart.setData(v === 'A' ? base : alt);
					},
				)),
				group('easing', (() => {
					const sel = h('select');
					for (const name of ['linear', 'quadInOut', 'cubicOut', 'cubicInOut', 'expoOut', 'quartOut']) {
						sel.appendChild(h('option', { value: name, text: name }));
					}
					sel.value = 'cubicInOut';
					sel.addEventListener('change', () => { chart.transitionEasing = sel.value; });
					return sel;
				})()),
				group('duration', range(0, 1200, 20, 420, v => { chart.transitionDuration = v; })),
				group('compare', (() => {
					const cb = h('input', { type: 'checkbox', id: 'instant-cb' });
					cb.addEventListener('change', () => { instant = cb.checked; chart.transitionDuration = instant ? 0 : 420; });
					return h('label', { class: 'group', style: 'font-size:12.5px;color:var(--ink-2)' }, [cb, ' 瞬时切换（对照组）']);
				})()),
			],
			hint: '点 A / B 反复切换。默认路径会把每个采样点在 420 ms 内插值到新值——长度相同的两个数据集走数值转场；长度不同则退化为“轴过渡 + 数据直切”，因为跨采样率插值会凭空造数。',
			readout() {
				const s = chart.getStats();
				const tr = chart.transition;
				return [
					['转场模式', tr.mode, tr.mode === 'values' ? 'ok' : (tr.mode === 'axes-only' ? 'warn' : '')],
					['已渲染帧', tr.stats.frames ? String(tr.stats.frames) : '—'],
					['单帧最大', fmtMs(tr.maxFrameMs)],
					['单帧均值', fmtMs(tr.stats.meanFrameMs)],
					['进度', Math.round(tr.progress * 100) + '%'],
					['当前数据集', side],
				];
			},
			destroy() { chart.destroy(); },
		};
	}

	// =======================================================================
	// Scene 3 — drill-down
	// =======================================================================

	function sceneDrill() {
		const raw = D.timeSeries(45 * 48, { stepMs: 30 * 60000, seriesCount: 1, seed: 61 });
		let chart;

		const crumbs = h('div', { class: 'crumb' });

		chart = new T.TempoChart(plotEl, {
			data: raw,
			height: 360,
			series: [{ label: 'QPS', stroke: P.brick, width: 1.6 }],
			transitionDuration: 380,
			onSelectRange: (lo, hi) => {
				chart.drillTo([lo, hi], `${fmtTime(lo)} → ${fmtTime(hi)}`);
				setTimeout(paintCrumbs, 0);
			},
			onDrillChange: () => setTimeout(paintCrumbs, 0),
		});

		function paintCrumbs() {
			crumbs.innerHTML = '';
			const path = chart.drill.path;
			path.forEach((label, i) => {
				if (i) crumbs.appendChild(h('span', { class: 'sep', text: '›' }));
				crumbs.appendChild(i === path.length - 1 ? h('b', { text: label }) : h('span', { text: label }));
			});
		}

		paintCrumbs();

		return {
			chart,
			controls: [
				group('navigate',
					btn('← 返回上级', () => { chart.drillBack(); setTimeout(paintCrumbs, 0); }),
					btn('⟲ 回到根', () => { chart.drillReset(); setTimeout(paintCrumbs, 0); }, { primary: true }),
				),
				group('auto', btn('按天钻取一节', () => {
					const buckets = T.bucketRanges(chart.data[0], 'day').filter(b => b.count > 2);
					if (!buckets.length) return;
					const pick = buckets[Math.floor(buckets.length / 2)];
					chart.drillTo([pick.lo, pick.hi], pick.key);
					setTimeout(paintCrumbs, 0);
				})),
				h('div', { class: 'timeline', style: 'flex:1 1 100%' }, [crumbs]),
			],
			hint: '在图上横向拖拽框选即可下钻。选区会被吸附到最近的采样点，所以子级视图的边界永远是真实数据点，不是浮点数中间值。',
			readout() {
				const s = chart.getStats();
				const r = chart.drill.range;
				return [
					['层级', String(s.drill.length - 1) + ' 级'],
					['当前窗口', r ? fmtTime(r[0]) + ' → ' + fmtTime(r[1]) : '全量'],
					['渲染 / 原始', fmtNum(s.rendered, 0) + ' / ' + fmtNum(s.rows, 0)],
					['筛选保留', s.filter ? `${s.filter.kept} / ${s.filter.total}` : '—'],
					['渲染中位', fmtMs(s.metrics['render.ms'] && s.metrics['render.ms'].p50)],
					['数据跨度', fmtTime(chart.data[0][0]) + ' 起'],
				];
			},
			destroy() { chart.destroy(); },
		};
	}

	// =======================================================================
	// Scene 4 — filtering
	// =======================================================================

	function sceneFilter() {
		const raw = D.timeSeries(1500, { stepMs: 60000, seriesCount: 3, seed: 83 });
		let chart;

		chart = new T.TempoChart(plotEl, {
			data: raw,
			height: 360,
			series: [
				{ label: 'API', stroke: P.amber, width: 1.8 },
				{ label: 'DB', stroke: P.teal, width: 1.8 },
				{ label: 'Cache', stroke: P.plum, width: 1.8 },
			],
			transitionDuration: 260,
		});

		const visible = [0, 1, 2];
		let threshold = 0;
		let tail = 100;

		function apply() {
			chart.setFilter({
				visibleSeries: visible,
				conditions: threshold > 0 ? [{ series: 0, op: T.OP.GTE, value: threshold }] : [],
				range: tail < 100 ? [raw[0][Math.floor(raw[0].length * (1 - tail / 100))], raw[0][raw[0].length - 1]] : null,
			});
		}

		const checks = [0, 1, 2].map(i => {
			const cb = h('input', { type: 'checkbox', checked: 'checked' });
			cb.addEventListener('change', () => {
				const at = visible.indexOf(i);
				if (cb.checked && at < 0) visible.push(i);
				if (!cb.checked && at >= 0) visible.splice(at, 1);
				apply();
			});
			return h('label', { class: 'group', style: 'font-size:12.5px;color:var(--ink-2);margin-right:8px' }, [cb, ' ' + ['API', 'DB', 'Cache'][i]]);
		});

		return {
			chart,
			controls: [
				group('series', ...checks),
				group('API ≥', range(0, 90, 1, 0, v => {
					threshold = v;
					if (v > 0) apply();
					else apply();
				})),
				group('最近', range(5, 100, 1, 100, v => {
					tail = v;
					apply();
				})),
				group('', btn('清除筛选', () => {
					visible.length = 0;
					visible.push(0, 1, 2);
					threshold = 0;
					tail = 100;
					for (const cb of checks) cb.querySelector('input').checked = true;
					chart.clearFilter();
				})),
			],
			hint: '三个筛选条件同时生效：series 可见性（把被隐藏的序列置为空洞而不是删除行）、值域条件（结构化对象，不用 eval）、时间窗口。被筛掉的行走同一条管线，所以筛选、回放、转场可以叠加。',
			readout() {
				const s = chart.getStats();
				const f = s.filter || { kept: 0, total: 0, dropped: 0 };
				return [
					['保留 / 总数', `${f.kept} / ${f.total}`],
					['丢弃行', String(f.dropped), f.dropped > 0 ? 'warn' : ''],
					['可见 series', String(visible.length) + ' / 3'],
					['渲染点', fmtNum(s.rendered, 0)],
					['筛选耗时', fmtMs(s.metrics['filter.ms'] && s.metrics['filter.ms'].p50)],
					['渲染中位', fmtMs(s.metrics['render.ms'] && s.metrics['render.ms'].p50)],
				];
			},
			destroy() { chart.destroy(); },
		};
	}

	// =======================================================================
	// Scene 5 — live stream
	// =======================================================================

	function sceneLive() {
		let chart;
		let timer = null;
		let rate = 60;
		let capacity = 1200;
		let t = Date.UTC(2026, 9, 22, 12, 0, 0);
		let phase = 0;
		let pushed = 0;
		let pushes = 0;

		chart = new T.TempoChart(plotEl, {
			data: [[], []],
			height: 360,
			series: [{ label: '实时吞吐', stroke: P.teal, width: 1.6 }],
			transitionDuration: 0,
		});

		chart.startStream({ capacity });

		function start() {
			if (timer) return;
			timer = setInterval(() => {
				const batch = Math.max(1, Math.round(rate / 20));
				for (let i = 0; i < batch; i++) {
					phase += 0.08;
					t += 200;
					const v = 50 + Math.sin(phase) * 22 + (Math.random() - 0.5) * 6;
					chart.push([t, v]);
					pushed++;
				}
				pushes++;
			}, 50);
		}

		function stop() {
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
		}

		const startBtn = btn('▶ 开始推送', () => {
			if (timer) {
				stop();
				startBtn.textContent = '▶ 开始推送';
			}
			else {
				start();
				startBtn.textContent = '⏸ 暂停推送';
			}
		}, { primary: true });

		return {
			chart,
			controls: [
				group('feed', startBtn, btn('清空', () => {
					stop();
					startBtn.textContent = '▶ 开始推送';
					chart.startStream({ capacity });
					pushed = 0;
					pushes = 0;
				})),
				group('rate', seg(
					[{ label: '20/s', value: 20 }, { label: '60/s', value: 60 }, { label: '200/s', value: 200 }, { label: '600/s', value: 600 }],
					60, v => { rate = v; },
				)),
				group('capacity', seg(
					[{ label: '300', value: 300 }, { label: '1200', value: 1200 }, { label: '5000', value: 5000 }],
					1200, v => {
						capacity = v;
						chart.startStream({ capacity });
					},
				)),
			],
			hint: '每 50 ms 一批写入，无论一批多少行，一帧最多重画一次（coalescer）。环形缓冲固定容量，最旧的样本被挤出——所以无论跑多久，内存和帧耗时都是常数。',
			readout() {
				const s = chart.streamStats;
				return [
					['窗口 / 容量', `${s.size} / ${s.capacity}`],
					['写入 / 刷新', `${s.requests} / ${s.flushes}`, '', `合并 ${s.coalesced || 0}`],
					['已挤出', String(s.evicted || 0)],
					['乱序丢弃', String(s.rejectedOutOfOrder || 0), s.rejectedOutOfOrder ? 'warn' : ''],
					['渲染中位', fmtMs(chart.getStats().metrics['render.ms'] && chart.getStats().metrics['render.ms'].p50)],
					['累计写入', String(pushed)],
				];
			},
			destroy() { stop(); chart.destroy(); },
		};
	}

	// =======================================================================
	// Scene 6 — large data
	// =======================================================================

	function sceneLarge() {
		let chart = null;
		let scale = 100000;
		let mode = 'lttb';
		let built = null;
		let api = null;

		const build = () => {
			if (chart) chart.destroy();
			plotEl.innerHTML = '<div style="padding:120px 0;text-align:center;color:#8a7f74;font:13px var(--mono)">生成 ' + (scale / 1000) + 'k 点…</div>';

			// Yield one frame so the message paints before the blocking build.
			setTimeout(() => {
				const t0 = performance.now();
				const raw = D.bigSeries(scale);
				const genMs = performance.now() - t0;

				chart = new T.TempoChart(plotEl, {
					data: raw,
					height: 360,
					maxPoints: 2400,
					decimation: mode,
					series: [
						{ label: 'sensor A', stroke: P.amber, width: 1.4 },
						{ label: 'sensor B', stroke: P.olive, width: 1.2 },
					],
					transitionDuration: 0,
				});

				// Fidelity is measured against the raw series, independently of the
				// chart: the same index list the chart used, scored by linear
				// reconstruction error.
				const t1 = performance.now();
				const idx = T.selectIndices(raw[0], raw[1], 2400, mode === 'none' ? 'lttb' : mode);
				const fid = T.measureFidelity(raw[0], raw[1], idx);
				const measureMs = performance.now() - t1;

				built = { genMs, fid, measureMs };
				if (api) paintReadout(api.readout());
			}, 30);
		};

		build();

		api = {
			get chart() { return chart; },
			controls: [
				group('scale', seg(
					[{ label: '100k', value: 100000 }, { label: '500k', value: 500000 }, { label: '1M', value: 1000000 }],
					100000, v => { scale = v; build(); },
				)),
				group('decimation', seg(
					[{ label: 'LTTB', value: 'lttb' }, { label: 'min-max', value: 'minmax' }, { label: 'none', value: 'none' }],
					'lttb', v => { mode = v; build(); },
				)),
				group('', btn('重新测量', () => build())),
			],
			hint: 'none 模式会把全部原始点交给 uPlot——这是对照组，用来显示为什么需要按像素预算降采样。LTTB 与 min-max 都在“索引空间”里只算一次，所有 series 共用同一份索引，因此对齐关系不会被打乱。',
			readout() {
				if (!chart) return [['状态', '生成中…']];
				const s = chart.getStats();
				const m = s.metrics;
				return [
					['原始行', fmtNum(s.rows, 0)],
					['渲染点', fmtNum(s.rendered, 0), '', `预算 ${s.budget}`],
					['生成耗时', fmtMs(built && built.genMs)],
					['sanitize', fmtMs(m['sanitize.ms'] && m['sanitize.ms'].p50)],
					['decimate', fmtMs(m['decimate.ms'] && m['decimate.ms'].p50)],
					['首帧渲染', fmtMs(m['render.ms'] && m['render.ms'].max)],
					['重构误差 max', built ? (built.fid.maxNormError * 100).toFixed(2) + '%' : '—', '', 'of span'],
					['重构误差 mean', built ? (built.fid.meanAbsError / built.fid.ySpan * 100).toFixed(2) + '%' : '—'],
					['峰值损失', built ? (built.fid.peakLossRatio * 100).toFixed(3) + '%' : '—', '', 'of span'],
				];
			},
			destroy() { if (chart) chart.destroy(); chart = null; },
		};

		return api;
	}

	// =======================================================================
	// Scene 7 — dirty data
	// =======================================================================

	function sceneDirty() {
		let chart;
		let seed = 23;
		const n = 1200;
		let api = null;

		const build = () => {
			if (chart) chart.destroy();
			const raw = D.messySeries(n, { seed });

			chart = new T.TempoChart(plotEl, {
				data: raw,
				height: 360,
				series: [
					{ label: 'primary', stroke: P.brick, width: 1.4 },
					{ label: 'secondary', stroke: P.muted, width: 1.2 },
				],
				transitionDuration: 0,
			});
			if (api) paintReadout(api.readout());
		};

		build();

		api = {
			get chart() { return chart; },
			controls: [
				group('sample', btn('换一份脏数据', () => { seed = (seed * 7 + 13) % 9973; build(); }, { primary: true })),
				group('', btn('原始小样（12 行）', () => {
					if (chart) chart.destroy();
					chart = new T.TempoChart(plotEl, {
						data: D.dirtyData(),
						height: 360,
						series: [
							{ label: 'y1', stroke: P.brick, width: 1.6, points: { show: true, size: 6 } },
							{ label: 'y2', stroke: P.muted, width: 1.2 },
						],
						transitionDuration: 0,
					});
					if (api) paintReadout(api.readout());
				})),
			],
			hint: '这份数据里混了 NaN、Infinity、null、字符串 "#REF"、"n/a"、重复时间戳、乱序行，以及一条长度不足的序列。图表不会崩，也不会把缺失值画成 0——它把不可用的格子变成断点，并把每一类修复计数报给你。',
			readout() {
				if (!chart) return [['状态', '—']];
				const st = chart.sanitizeStats || {};
				const issues = chart.issues;
				const total = issues.reduce((a, b) => a + b.count, 0);
				return [
					['输入行', fmtNum(st.inputRows, 0)],
					['输出行', fmtNum(st.outputRows, 0)],
					['剔除（x 无效）', String(st.xsDropped || 0), st.xsDropped ? 'warn' : ''],
					['置为断点', String(st.cellsNulled || 0), st.cellsNulled ? 'warn' : ''],
					['数字字符串已转换', String(st.cellsCoerced || 0)],
					['问题总数', String(total), total ? 'warn' : 'ok'],
				];
			},
			destroy() { if (chart) chart.destroy(); chart = null; },
		};

		return api;
	}

	// =======================================================================
	// shell
	// =======================================================================

	const SCENES = [
		{ id: 'replay', name: '时间轴回放', factory: sceneReplay, notes: [
			{ h: '为什么上游做不到', p: 'uPlot 的契约是“给数组就画”。它没有时间轴状态，也没有动画系统——src/ 里 grep animate / transition / replay 全部零命中。回放需要一个新的状态层，而不是一个新选项。' },
			{ h: '视图锁定', p: '回放时把 x/y 轴锁在全量范围。否则每揭一个点，轴就重算一次，视觉上像线条在往左缩——那是误读，不是动效。' },
		] },
		{ id: 'transition', name: '平滑转场', factory: sceneTransition, notes: [
			{ h: '两条硬规则', list: [
				'等长才插值：采样率不同的两组数据不能“morph”，只能轴过渡 + 直切。',
				'空值不外推：一端是断点就取目标值，绝不在“无读数”和“42”之间取中点。',
			] },
			{ h: '可打断', p: '转场进行中再次切换时，新的起点取自当前屏幕上的插值结果，所以连点十次看到的是一条连续的轨迹，不是十次回弹。' },
		] },
		{ id: 'drill', name: '交互钻取', factory: sceneDrill, notes: [
			{ h: '栈而不是树', p: '每一层记录进入时的视野快照，返回时原样恢复。层级不是重新计算的近似视野——这就是为什么“返回上级”永远回到你离开的地方。' },
			{ h: '吸附到真实样本', p: '框选的边界向外吸附到最近的采样点，子级视图首尾都是真实数据，图表刻度不会出现“半个人”。' },
		] },
		{ id: 'filter', name: '数据筛选', factory: sceneFilter, notes: [
			{ h: '结构化条件', p: '筛选条件是 {series, op, value} 对象，在编译期校验类型和运算符。页面里永远不会执行用户字符串——没有 eval 面。' },
			{ h: '隐藏 ≠ 删除', p: '隐藏一条序列会把它的格子置为断点，行数不变。这样其余序列的时间对齐不会因为隐藏而移动。' },
		] },
		{ id: 'live', name: '实时更新', factory: sceneLive, notes: [
			{ h: '每帧最多一次', p: '无论 50 ms 内推了多少行，coalescer 只允许一次重画。200/s 和 600/s 的帧耗时几乎一样，因为开销在帧上，不在行上。' },
			{ h: '乱序要报错', p: '时间倒退的样本被拒绝并计数。实时源违反单调时间是源的问题，图表不该偷偷帮你排序。' },
		] },
		{ id: 'large', name: '大量数据', factory: sceneLarge, notes: [
			{ h: '预算 = 每像素 1.5 点', p: '超过预算就按 LTTB 或 min-max 降采样。降采样以“索引”为单位，一次算完给所有 series 共用，对齐关系因此不会被破坏。' },
			{ h: '误差是量出来的', list: [
				'保真误差：把降采样后的折线反向插值回原始 x，取最大偏差 / 值域跨度。',
				'峰值损失：原始最大值与降采样后最大值的差 / 值域跨度。',
			] },
		] },
		{ id: 'dirty', name: '异常数据', factory: sceneDirty, notes: [
			{ h: '修复但不撒谎', p: '不可用的格子变成断点（null），不是 0。画 0 是读者无法察觉的谎言：它看起来像一个真实的测量值。' },
			{ h: '如实上报', p: '每一类修复都计数并回传（onIssues），页面可以把“这份数据有多脏”直接显示给用户。' },
		] },
	];

	let active = null;
	let activeId = null;
	let readoutTimer = null;

	function startScene(scene) {
		if (active) {
			active.destroy();
			active = null;
		}
		plotEl.innerHTML = '';
		controlsEl.innerHTML = '';

		active = scene.factory();
		activeId = scene.id;

		for (const c of active.controls || []) controlsEl.appendChild(c);
		for (const c of active.extraControls || []) controlsEl.appendChild(c);

		hintEl.innerHTML = '';
		if (active.hint) hintEl.textContent = active.hint;

		paintNotes(scene.notes);
		paintReadout(active.readout ? active.readout() : []);

		for (const tab of tabsEl.children)
			tab.setAttribute('aria-selected', String(tab.dataset.id === scene.id));

		history.replaceState(null, '', '#' + scene.id);
	}

	function boot() {
		SCENES.forEach((scene, i) => {
			const tab = h('button', {
				class: 'tab', type: 'button', role: 'tab',
				'aria-selected': 'false',
			}, [h('span', { class: 'n', text: String(i + 1).padStart(2, '0') }), scene.name]);
			tab.dataset.id = scene.id;
			tab.addEventListener('click', () => startScene(scene));
			tabsEl.appendChild(tab);
		});

		// Poll readouts at 4 Hz: fast enough to feel live, slow enough not to
		// compete with the render loop for frame time.
		readoutTimer = setInterval(() => {
			if (active && active.readout) paintReadout(active.readout());
		}, 250);

		const wanted = location.hash.replace('#', '');
		const scene = SCENES.find(s => s.id === wanted) || SCENES[0];
		startScene(scene);

		let resizeRaf = null;
		window.addEventListener('resize', () => {
			if (resizeRaf) cancelAnimationFrame(resizeRaf);
			resizeRaf = requestAnimationFrame(() => {
				if (active && active.chart && active.chart.setSize) {
					active.chart.setSize(plotEl.clientWidth || 900, 360);
					if (active.readout) paintReadout(active.readout());
				}
			});
		});
	}

	boot();
})();
