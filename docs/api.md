# API

Everything below is what `dist/tempo.esm.js` (or `window.Tempo` from the IIFE
build) exposes. Upstream uPlot's own API is unchanged and still available.

```js
import TempoChart from './dist/tempo.esm.js';

const chart = new TempoChart(document.querySelector('#plot'), {
  data: [[0, 1, 2, 3], [10, 20, 30, 40]],
  series: [{ label: 'temperature', stroke: '#c2740f' }],
  height: 360,
});
```

---

## `new TempoChart(el, opts)`

| option | type | default | meaning |
|---|---|---|---|
| `data` | `AlignedData` | `[[], []]` | raw payload; repaired on the way in |
| `series` | `object[]` | `[{}]` | uPlot series options, one per y series |
| `width` | `number` | `el.clientWidth` | canvas width in CSS px |
| `height` | `number` | `320` | canvas height |
| `maxPoints` | `number` | `width × 1.5` | render budget; 0 or omitted means "derive it" |
| `decimation` | `'lttb' \| 'minmax' \| 'none'` | `'lttb'` | index-selection strategy |
| `transitionDuration` | `number` | `320` | ms; `0` disables transitions |
| `transitionEasing` | `string \| fn` | `'cubicInOut'` | see `VALUE_EASINGS` |
| `maxTweenPoints` | `number` | `4000` | above this, transitions become axes-only |
| `playbackDuration` | `number` | `8000` | ms for a full pass at 1× |
| `playbackMode` | `'reveal' \| 'window' \| 'cursor'` | `'reveal'` | |
| `playbackSpeed` | `number` | `1` | one of `[0.25, 0.5, 1, 2, 4, 8]` |
| `rootLabel` | `string` | `'All'` | first breadcrumb label |
| `maxDrillDepth` | `number` | `8` | |
| `sanitize` | `object` | `undefined` | passed to `sanitize()` |

Callbacks (all optional):

| callback | fires |
|---|---|
| `onIssues(issues, stats)` | after every `setData`, with the repair report |
| `onFrame({ data, ms })` | after every `setData` the chart issues, with its cost |
| `onViewChange({ view, filter, drill })` | after filter/decimate |
| `onPlaybackState(state, prev)` | transport changes |
| `onSelectRange(lo, hi)` | after a drag-select, before any drill |
| `onDrillChange(path, depth)` | after drill navigation |
| `onCursor(cursorX)` | on cursor move during replay |
| `onMetrics(stats)` | when an animation or replay run finishes |

## Data

### `setData(raw, { animate = true })`

Replaces the payload. Runs `sanitize → filter → decimate`, resets the drill
stack, and transitions to the new view unless `animate` is false or the chart
has no previous frame.

### `chart.data` / `chart.view`

`data` is the repaired full payload (what your readers' numbers come from).
`view` is the decimated array handed to uPlot. Tooltips must use `data`.

### `chart.issues` / `chart.sanitizeStats` / `chart.rowMap`

`issues` is `[{ code, count }]` using the `ISSUE` enum. `rowMap[i]` is the
original row index for output row `i` (useful for "row 4 812 of the source").

## Playback

| method | effect |
|---|---|
| `play()` | starts or resumes; from the end, restarts |
| `pause()` | |
| `toggle()` | |
| `seek(p)` | `p ∈ [0,1]`, timeline-normalised |
| `seekX(x)` | absolute x; exact, no float drift |
| `setSpeed(s)` | throws on an unsupported speed |
| `setPlaybackMode(m)` | |

Read `chart.playback.state`, `.progress`, `.cursorX`, `.visibleRange`,
`.domain`, `.frame`. `chart.playback.step(n)` moves by whole samples.

## Filtering

```js
chart.setFilter({
  range: [startX, endX],                       // inclusive
  conditions: [{ series: 0, op: OP.GTE, value: 40 }],
  visibleSeries: [0, 2],                       // allow-list; others become gaps
});
chart.clearFilter();
```

Operators: `>`, `>=`, `<`, `<=`, `==`, `!=`, `between`, `not-null`, `is-null`,
`contains`. Conditions are validated objects — no strings are ever evaluated.

## Drill-down

```js
chart.drillTo([lo, hi], 'Oct 14');   // snapped outward to real samples
chart.drillBack();
chart.drillReset();
chart.drill.path;                    // ['All', 'Oct', 'Oct 14']
```

## Live

```js
chart.startStream({ capacity: 1200 });
chart.push([timestamp, value]);       // 'added' | 'replaced' | 'rejected'
chart.streamStats;                    // { requests, flushes, coalesced, evicted, … }
```

At most one render per animation frame, whatever the push rate.

## Reporting

`chart.getStats()` returns rows, rendered count, budget, filter counts, issues,
transition stats, playback state, drill path, stream counters, and a `metrics`
object with `{n, min, p50, p95, p99, max, mean}` for `sanitize.ms`,
`filter.ms`, `decimate.ms` and `render.ms`.

`render.ms` measures the synchronous `setData` call (canvas command recording).
Compositor rasterisation is not included — for that, use the frame-cadence
figures in `perf/results.json`.

---

## Standalone helpers

All pure, all importable without a DOM:

```js
import {
  sanitize, ISSUE,                       // guard
  decimateAligned, selectIndices, lttb, minMax, measureFidelity,
  applyFilter, compileCondition, OP,
  Playback, PLAYBACK_MODE, PLAYBACK_STATE, RevealData,
  DrillStack, snapRange, bucketRanges,
  RingBuffer, Coalescer,
  Transition, interpolateInto, interpolateRange,
  createManualScheduler, createFrameLoop,
  compressWindow,
  summarize, percentile, Metrics,
  EASINGS, VALUE_EASINGS,
} from './dist/tempo.esm.js';
```

`compressWindow(xs, { gapFactor, gapWeight })` builds a piecewise-linear
timeline that shortens quiet stretches while keeping every populated stretch
proportional. `toTimeline` and `toReal` are exact inverses; install it with
`chart.playback.setMapping(m)`.
