# Tempo — replayable charts

**uPlot renders an array. Tempo renders a timeline.**

A fork of [uPlot](https://github.com/leeoniya/uPlot) (MIT, 10.5k ★) that adds
what a static renderer structurally cannot have: **time-axis playback**,
**interruptible value transitions**, **drill-down**, **structured filtering** and
**bounded live streaming** — without touching a single line of upstream source.

Live demo: **https://llinok111.github.io/tempo-replay-chart/**

---

## Why this exists

uPlot is the fastest canvas time-series renderer available, and its contract is
deliberately narrow: hand it data, it draws. Grepping its `src/` for the
capabilities above returns nothing (`animat` 0, `ease` 0, `replay` 0, `drill` 0,
`brush` 0, `appendData` 0; `tween` only as part of the word "between" in two
comments). That is the gap, and it is not a small one:

- A chart that cannot animate cannot show a *change* — only two states.
- A chart with no time axis state cannot answer "what did this look like at 03:00".
- A chart with no drill stack cannot move between overview and detail without
  losing the reader's place.

Tempo closes those gaps **from the outside**. `src/uPlot.js`, every upstream
test, and every upstream `dist/` artefact are byte-identical to upstream main at
the fork point (`16ab9c8`). The full accounting is in
[docs/upstream-diff.md](docs/upstream-diff.md).

## Upstream compatibility, measured

| | passing | failing | pending |
|---|---|---|---|
| upstream before the fork | 4070 | 21 | 46 |
| upstream after the Tempo layer | **4070** | **21** | 46 |

The 21 failures pre-exist and are platform artefacts (canvas text positions
differ by timezone; path separators are `\` on Windows). They are recorded
verbatim in `test/upstream-baseline.json`; `npm run check` fails if the set
grows by even one.

---

## What was built

| capability | the hard part | what the code does |
|---|---|---|
| **Smooth transitions** | not lying about values | equal-length payloads only; a null endpoint is never blended into a number; interrupting samples the *current* frame as the new origin |
| **Time-axis replay** | cost must not scale with rows | decimate once up front, then reveal through zero-copy typed-array views; a 1 M-row replay runs at the same frame cost as 20 k |
| **Dynamic curves** | replay must read as time | progress is linear in **x**, not in row index, so an irregular feed stays honest; `compressWindow()` optionally shortens outages |
| **Drill-down** | returning to where you were | a stack of viewport snapshots, not a recomputed approximation; selections snap outward to real samples |
| **Filtering** | never shifting the time axis | structured `{series, op, value}` predicates (no `eval`); hiding a series nulls its cells instead of deleting rows |
| **Live updates** | one render per frame, always | ring buffer + coalescer: 920 pushes became 91 renders in the measurement below |

Plus the part that decides whether any of it works on real data: **`sanitize()`**
repairs NaN, ±Infinity, `null`, numeric strings, `"#REF"`, duplicate
timestamps, unsorted rows and ragged columns — and **counts every repair**, so a
page can tell its reader how dirty the feed was instead of drawing a plausible
lie.

Decisions worth arguing about are documented in
[docs/architecture.md](docs/architecture.md) (pipeline, interruption model) and
[docs/limitations.md](docs/limitations.md) (what it deliberately will not do).

---

## Measured performance

All numbers below are produced by `perf/index.html` driven through the DevTools
protocol by `scripts/bench.mjs`. Nothing is estimated. Environment:

```
HeadlessChrome/155.0.0.0 (Edge 155)   Windows x64   16 logical cores
devicePixelRatio 1   JS heap limit 3586 MB   plot 1002 × 360 px
```

### Pipeline cost by payload size (median of 10 runs)

| rows | rendered | sanitize | decimate (LTTB) | mount + first paint | `setData` (same length) |
|---:|---:|---:|---:|---:|---:|
| 1 000 | 1 000 | 0.3 ms | 0.0 ms | 4.8 ms | 0.4 ms |
| 10 000 | 2 400 | 0.9 ms | 0.2 ms | 4.4 ms | 1.5 ms |
| 100 000 | 2 400 | 7.9 ms | 0.7 ms | 11.6 ms | 9.1 ms |
| 500 000 | 2 400 | 28.8 ms | 1.9 ms | 44.2 ms | 37.8 ms |
| 1 000 000 | 2 400 | 77.3 ms | 3.8 ms | 173.5 ms | 209.1 ms |

Two things to notice: the render budget caps the *canvas* work at 2 400 points
regardless of payload, and `sanitize` — not drawing — dominates the one-off
cost. That is why the pipeline runs on data change and never inside an
animation frame.

### Frame cadence

| scenario | frames | mean fps | interval p50 | p95 | worst | frames > 20 ms |
|---|---:|---:|---:|---:|---:|---:|
| transition, 2 400 pts (values tween) | 43 | 60.0 | 16.7 ms | 16.7 ms | 16.8 ms | **0** |
| replay, 20 000 rows | 91 | 59.3 | 16.7 ms | 16.8 ms | 33.3 ms | 1 |
| replay, 1 000 000 rows | 83 | 44.9 | 16.7 ms | 33.3 ms | 383 ms | 7 |
| live feed, ~600 rows/s | 91 | 60.0 | 16.7 ms | 16.7 ms | 16.8 ms | **0** |

**The honest reading of the 1 M-row replay line.** The chart's own draw cost
never exceeded **0.1 ms** in any frame — the stutter is not in the render path.
It comes from the host page holding a 24 MB payload and the resulting GC
pauses under software rendering. The design claim that survives is the one that
matters: **replay frame cost is independent of row count**; the residual cost is
memory, and it is the caller's to manage.

### Live coalescing

920 pushes over 1.5 s produced **91 renders** (ratio 0.099, 829 coalesced),
window 920 / 2 000, zero out-of-order rejections, 60.0 fps, no dropped frames.

### Decimation fidelity — the number that is usually hidden

Two different questions, two different answers. Both are measured against the
raw series at a 1 002 × 360 px plot.

`maxNorm` is the reconstruction error at the worst original sample, as a
fraction of the value span. `maxPx` / `meanPx` are per-column vertical
disagreements between the raw envelope and the *drawn* decimated polyline, in
CSS pixels — what a reader can actually see.

**1 000 000 rows → 2 400 points (417:1):**

| data shape | mode | maxPx | meanPx | maxNorm |
|---|---|---:|---:|---:|
| smooth sine | LTTB | **0.00** | **0.00** | 0.000 % |
| trend + season + walk | LTTB | 31.01 | 5.74 | 15.27 % |
| trend + season + walk | min-max | 41.22 | 5.39 | 17.53 % |
| near-white noise | LTTB | 22.53 | 6.37 | 99.51 % |
| near-white noise | min-max | **358.98** | 13.36 | 99.97 % |

And the same data at a larger budget, for near-white noise with LTTB:

| budget | ratio | maxPx | meanPx |
|---:|---:|---:|---:|
| 2 400 | 417:1 | 22.53 | 6.37 |
| 9 600 | 104:1 | 15.16 | 3.32 |
| 38 400 | 26:1 | 8.95 | 1.66 |

Three findings that shaped the implementation:

1. **On smooth data, decimation is free** — 0 px error at any budget. That is
   the common case for sensor and business metrics.
2. **On noisy data it is not free, and `maxNorm` is a misleading headline.** The
   raw series cannot be reconstructed at 417:1; the question is only whether the
   picture changes. At 2 400 points the *mean* column error is 6 px on a 360 px
   plot, and even 38 400 points leaves the worst column at 8.95 px — noise that
   dense cannot be made exact at this width.
3. **`min-max` is the wrong choice for noise at a small budget** — the envelope
   between two retained extremes is a straight line, so 359 px of a 360 px plot
   can be wrong in the worst column. It needs ~4 800 points before it behaves
   (4.91 px). LTTB's extremum-seeking is why it is the default.

Full sweep, including the budget required per data shape:
`perf/fidelity-sweep.json` (`npm run sweep`).

---

## Run it

```sh
npm install
npm run build        # dist/tempo.*.js   (upstream dist/ is left untouched)
npm run demo:sync    # copy bundles into demo/vendor
npm run check        # build → upstream suite → 176 tempo tests → pixel acceptance
```

Open `demo/index.html` directly — it works from `file://` (plain scripts, no
module loading, no CDN). Seven scenes: replay, transitions, drill-down,
filtering, live feed, 1 M dataset, dirty data.

Measurements:

```sh
npm run bench        # full: 5 scales × 10 reps, transitions, replay, live, fidelity
npm run bench:quick  # 1k / 100k / 1M, 4 reps
npm run sweep        # fidelity vs budget across three data shapes (Node, no browser)
npm run verify       # pixel + readout acceptance for all seven scenes
```

`scripts/check-all.mjs` is the single command a reviewer should run; it fails on
any upstream regression, any tempo test failure, or any scene that fails to
paint.

## Test inventory

| suite | count | what it pins down |
|---|---:|---|
| upstream | 4 070 passing | the renderer still behaves exactly as upstream documents |
| `test/tempo/guard` | 27 | every repair path, and that output always satisfies the aligned contract |
| `test/tempo/downsample` | 20 | budget respected, extremes and gaps retained, error bounded |
| `test/tempo/tween` | 21 | null never blended, interruption continuity, buffer reuse |
| `test/tempo/playback` | 27 | state machine, real-time mapping, boundary-sample interpolation |
| `test/tempo/filter-drill` | 29 | predicate validation, no `eval`, exact viewport restore |
| `test/tempo/stream` | 21 | ring wrap-around, out-of-order rejection, coalescing |
| `test/tempo/chart` | 31 | the whole pipeline through a real uPlot instance under happy-dom |
| visual acceptance | 7 scenes | real browser: painted pixels, finite readouts, screenshots |

Repeatability: fixtures are seeded, the scheduler is injectable
(`createManualScheduler`), and five-run identity is asserted for `sanitize`.
The benchmark writes `perf/history.json` so a regression is visible instead of
being averaged away.

## Repository layout

```
src/tempo/         the layer (pure modules + one uPlot binding)
src/tempo.bundle.js  browser bundle entry
demo/              self-contained workbench (published to Pages)
perf/              in-browser benchmark harness + results
scripts/           CDP driver, visual acceptance, benchmark, check-all
test/tempo/        176 tests
docs/              architecture · api · limitations · upstream diff
```

## API in one screen

```js
const chart = new TempoChart(el, { data, series: [{ label: 'qps' }], height: 360 });

chart.play(); chart.setSpeed(4);                 // time-axis replay
chart.seekX(timestamp);                          // scrub to an exact x
chart.setData(next, { animate: true });          // interruptible transition
chart.setFilter({ range: [a, b], conditions: [{ series: 0, op: '>=', value: 40 }] });
chart.drillTo([lo, hi], 'Oct 14'); chart.drillBack();
chart.startStream({ capacity: 1200 }); chart.push([t, v]);

chart.getStats();  // rows, rendered, issues, and p50/p95 of every stage
```

Full reference: [docs/api.md](docs/api.md).

## License

MIT. uPlot's LICENSE is preserved verbatim; the additions are attributed in
[NOTICE](NOTICE).

---

<details>
<summary>Upstream uPlot README (unmodified)</summary>

<h2><img src="uPlot.svg" alt="uPlot logo" height="36" align="top"> μPlot</h2>

A small ([~50 KB min](https://github.com/leeoniya/uPlot/tree/master/dist/uPlot.iife.min.js)), [fast](#performance) chart for time series, lines, areas, ohlc & bars _(MIT Licensed)_

---
### Introduction

uPlot is a [fast, memory-efficient](#performance) [Canvas 2D](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D)-based chart for plotting [time series](https://en.wikipedia.org/wiki/Time_series), lines, areas, ohlc & bars. From a cold start it can create an [interactive chart containing 166,650 data points](https://leeoniya.github.io/uPlot/bench/uPlot.html) in 25ms, scaling linearly at [~100,000 pts/ms](https://leeoniya.github.io/uPlot/bench/uPlot-10M.html) afterwards. In addition to fast initial render, the zooming and cursor performance is by far the best of any similar charting lib; at ~50 KB, it's likely the smallest and fastest time series plotter that doesn't make use of [context-limited](https://bugs.chromium.org/p/chromium/issues/detail?id=771792) WebGL shaders or WASM, both of which have much higher startup cost and code size.

In most sane cases, you can live-stream data with uPlot at 60fps, though it may begin to struggle beyond 100k in-view points.
When [updating 3,600 points at 60fps](https://leeoniya.github.io/uPlot/demos/sine-stream.html), uPlot uses 10% CPU and 12.3MB RAM.
The next fastest Canvas-based libs (Chart.js and ECharts) use [40% / 77MB](https://leeoniya.github.io/uPlot/bench/Chart.js4-sine-stream.html) and [70% / 85MB](https://leeoniya.github.io/uPlot/bench/ECharts5-sine-stream.html), respectively.
If you need to stream, give [unclog your rendering pipeline](#unclog-your-rendering-pipeline) a try.
If that does not help, consider reducing the update frequency or switch to a WebGL/WebGPU solution, like [danchitnis/webgl-plot](https://github.com/danchitnis/webgl-plot), [huww98/TimeChart](https://github.com/huww98/TimeChart), [epezent/implot](https://github.com/epezent/implot).

---
![uPlot Chart](uPlot.png "uPlot Chart")

---
### Features

- Multiple series w/toggle
- Multiple y-axes, scales & grids
- Temporal or numeric x-axis
- Linear, uniform or [logarithmic](https://leeoniya.github.io/uPlot/demos/log-scales.html) scales
- Line & Area styles (stroke, fill, width, dash)
- Pluggable path renderers [linear, spline, stepped, bars](https://leeoniya.github.io/uPlot/demos/line-paths.html)
- Zoom with auto-rescale
- Legend with live values
- Support for [IANA Time Zone Names](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) & DST
- [Support for missing data](https://leeoniya.github.io/uPlot/demos/missing-data.html)
- [Cursor sync for multiple charts](https://leeoniya.github.io/uPlot/demos/sync-cursor.html)
- [Focus closest series](https://leeoniya.github.io/uPlot/demos/focus-cursor.html)
- [Data streaming (live update)](https://leeoniya.github.io/uPlot/demos/stream-data.html)
- [High / Low bands](https://leeoniya.github.io/uPlot/demos/high-low-bands.html)
- Positive and negative stacking groups through `opts.stack.groups`. See ["Stacked Area Graphs Are Not Your Friend"](https://web.archive.org/web/20221208193656/https://everydayanalytics.ca/2014/08/stacked-area-graphs-are-not-your-friend.html).
- A lean, consistent, and powerful API with hooks & plugins

---
### Non-Features

In order to stay lean, fast and focused the following features will not be added:

- No general-purpose data parsing, aggregation, or statistical processing. Integrated stacking only computes configured cumulative series. Prepare other results in advance with tools such as [simple-statistics](https://simple-statistics.github.io/) or [uDSV](https://github.com/leeoniya/uDSV).
- No transitions or animations - they're always pure distractions.
- No collision avoidance for axis tick labels, so may require manual tweaking of spacing metrics if label customization significiantly increases default label widths.

- Smooth spline interpolation is available, but its use is strongly discouraged. See ["Your data is misrepresented!"](http://www.vizwiz.com/2011/12/when-you-use-smoothed-line-chart-your.html).
- No built-in drag scrolling/panning due to ambiguous native zoom/selection behavior. However, this can be added externally via the plugin/hooks API: [zoom-wheel](https://leeoniya.github.io/uPlot/demos/zoom-wheel.html), [zoom-touch](https://leeoniya.github.io/uPlot/demos/zoom-touch.html).

---
### Documentation (WIP)

The docs are a perpetual work in progress, it seems.
Start with [/docs/README.md](https://github.com/leeoniya/uPlot/tree/master/docs) for a conceptual overview.
The full API is further documented via comments in [/dist/uPlot.d.ts](https://github.com/leeoniya/uPlot/blob/master/dist/uPlot.d.ts).
Additionally, an ever-expanding collection of runnable [/demos](https://leeoniya.github.io/uPlot/demos/index.html) covers the vast majority of uPlot's API.

---
### Third-party Integrations

- [React, Vue.js and Svelte](https://github.com/skalinichev/uplot-wrappers) (Sergey Kalinichev)
- [Python](https://github.com/stephane-caron/uplot-python) (Stéphane Caron)
- [Terminal (React Ink)](https://github.com/planadecu/ink-uplot) (Jordi Planadecursach)

---
### Performance

Benchmarks done on this hardware:

- Date: 2023-03-11
- AMD Ryzen 7 PRO 5850U @ 1.9GHz, 32GB RAM
- EndeavourOS/Arch (KDE/Plasma), Chrome 113.0.5638.0 (64-bit)
- 4K display scaled to 1440p (1.5 devicePixelRatio)

![uPlot Performance](perf.png "uPlot Performance")

Full size: https://leeoniya.github.io/uPlot/demos/multi-bars.html

Raw data: https://github.com/leeoniya/uPlot/blob/master/bench/results.json

<pre>
| lib                    | size    | done    | js,rend,paint,sys | heap peak,final | mousemove (10s)     |
| ---------------------- | ------- | ------- | ----------------- | --------------- | ------------------- |
| <a href="https://leeoniya.github.io/uPlot/bench/uPlot.html">uPlot v1.6.24</a>          | 47.9 KB |   34 ms |   51   2   1   34 |  21 MB   3 MB   |  218  360  146  196 |
| <a href="https://leeoniya.github.io/uPlot/bench/Chart.js4.html">Chart.js v4.2.1</a>        |  254 KB |   38 ms |   90   2   1   40 |  29 MB  10 MB   | 1154   46  165  235 |
| <a href="https://leeoniya.github.io/uPlot/bench/Flot.html">Flot v3.0.0</a>            |  494 KB |   60 ms |  105   5   1   52 |  41 MB  21 MB   | ---                 |
| <a href="https://leeoniya.github.io/uPlot/bench/ECharts5.html">ECharts v5.4.1</a>         | 1000 KB |   55 ms |  148   3   1   35 |  17 MB   3 MB   | 1943  444  203  208 |
| <a href="https://leeoniya.github.io/uPlot/bench/dygraphs.html">dygraphs v2.2.1</a>        |  132 KB |   90 ms |  163   2   1   33 |  88 MB  42 MB   | 1438  371  174  268 |
| <a href="https://leeoniya.github.io/uPlot/bench/LightningChart.html">LightningChart® v4.0.2</a> | 1300 KB |  --- ms |  250   2   1   33 |  33 MB  13 MB   | 5390  120  128  325 |
| <a href="https://leeoniya.github.io/uPlot/bench/CanvasJS.html">CanvasJS v3.7.5</a>        |  489 KB |  130 ms |  266   4   1   35 |  98 MB  69 MB   | 1030  445   90  246 |
| <a href="https://leeoniya.github.io/uPlot/bench/dvxCharts.html">dvxCharts v5.1.0</a>       |  373 KB |  160 ms |  264  23   1   62 | 100 MB  61 MB   |  687  779  206  197 |
| <a href="https://leeoniya.github.io/uPlot/bench/Highcharts.html">Highcharts v10.3.3</a>     |  413 KB |  --- ms |  416   7   1   38 |  97 MB  55 MB   | 1286  824  205  242 |
| <a href="https://leeoniya.github.io/uPlot/bench/Plotly.js.html">Plotly.js v2.18.2</a>      | 3600 KB |  310 ms |  655  14   1   40 | 104 MB  70 MB   | 1814  163   25  208 |
| <a href="https://leeoniya.github.io/uPlot/bench/ApexCharts.html">ApexCharts v3.37.1</a>     |  503 KB |  685 ms |  694   9   1   33 | 175 MB  46 MB   | 1708  421  106  207 |
| <a href="https://leeoniya.github.io/uPlot/bench/ZingChart.html">ZingChart v2.9.10</a>      |  871 KB |  681 ms |  717   7   1  105 | 290 MB 195 MB   | 9021  305   41   71 |
| <a href="https://leeoniya.github.io/uPlot/bench/amCharts5.html">amCharts v5.3.7</a>        |  625 KB |  --- ms | 1601   3   3   46 | 147 MB 121 MB   | 9171   71  460  167 |
</pre>

- libs are sorted by their initial, cold-start, render performance (excluding network transfer time to download the lib)
- `size` includes the lib itself plus any dependencies required to render the benchmark, e.g. Moment, jQuery, etc.
- Flot does not make available any minified assets and all their examples use the uncompressed sources; they also use an uncompressed version of jQuery :/

Some libraries provide their own performance demos:

- https://echarts.apache.org/examples/en/index.html
- https://github.com/sveinn-steinarsson/flot-downsample/
- https://dygraphs.com/tests/dygraph-many-points-benchmark.html
- https://www.chartjs.org/docs/latest/general/performance.html
- https://dash.plotly.com/performance
- https://www.highcharts.com/docs/advanced-chart-features/boost-module
- https://danchitnis.github.io/webgl-plot-examples/vanilla/
- https://huww98.github.io/TimeChart/docs/performance
- https://www.arction.com/lightningchart-js-performance/

TODO (all of these use SVG, so performance should be similar to Highcharts):

- Chartist.js
- d3-based
  - C3.js
  - dc.js
  - MetricsGraphics
  - rickshaw

---
### Unclog your rendering pipeline

Your browser's performance is highly dependent on your hardware, operating system, and GPU drivers.

If you're using a Chromium-based browser, there are some hidden settings that can unlock significant performance improvements for Canvas2D rendering.
Most of these have to do with where and how the rasterization is performed.

Head over to https://leeoniya.github.io/uPlot/demos/sine-stream.html and open up Chrome's DevTools (F12), then toggle the Performance Monitor.

![Chrome DevTools Peformance Monitor](img/chrome-perf-monitor.png "Chrome DevTools Peformance Monitor")

For me:

- On Windows 10 Desktop, Core i7-8700, 16GB RAM, AMD RX480 GPU, 2048 x 1080 resolution = 57% CPU usage
- On Manjaro Laptop (Arch Linux), AMD Ryzen 7 PRO 5850U, 48GB RAM, AMD Radeon RX Vega 8 (integrated GPU), 4K resolution = **99% CPU usage**

If your CPU is close to 100%, it may be rasterizing everything in the same CPU process.

Pop open `chrome://gpu` and see what's orange or red.

![Chrome gpu](img/chrome-gpu.png "Chrome gpu")

Then open `chrome://flags` and search for "raster" to see what can be force-enabled.

![Chrome flags](img/chrome-flags.png "Chrome flags")

- On my Manjaro/Ryzen/Integrated GPU setup, force-enabling `Canvas out-of-process rasterization` resulted in a dramatic framerate improvement.
- On my Windows/i7/Dedicated GPU setup, toggling the same flags moved the work to another process (still good), but did not have a significant framerate impact.

YMMV!

---
### Acknowledgements

- Dan Vanderkam's [dygraphs](https://github.com/danvk/dygraphs) was a big inspiration; in fact, my stale [pull request #948](https://github.com/danvk/dygraphs/pull/948) was a primary motivator for μPlot's inception.
- Adam Pearce for [#15 - remove redundant lineTo commands](https://github.com/leeoniya/uPlot/issues/15).


</details>
