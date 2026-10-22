# Known limits

Written down because a chart library that hides its boundaries is worse than
one that has them. Each item names the trade-off taken, not just the gap.

## Performance

**`setData` is not free at 1 M rows.** The full pipeline (sanitize → filter →
decimate) costs roughly 100–200 ms on a desktop CPU, dominated by `sanitize`.
That is fine for "load a dataset", fatal for "do it every frame" — which is why
replay and transitions never call it. If you must swap million-row payloads
interactively, sanitize once and keep the repaired arrays.

**`render.ms` excludes rasterisation.** It times the synchronous `setData`
call, i.e. canvas command recording. The compositor may still take longer. The
`perf/results.json` frame-cadence figures are the honest end-to-end measure;
`render.ms` is a relative-cost signal.

**Headless numbers are a floor, not a promise.** The benchmark runs in headless
Chromium with software rendering. A GPU-backed desktop browser will differ, and
a low-end phone will be slower. Treat the ratios as the finding (replay cost is
independent of row count) rather than the absolute milliseconds.

## Animation

**Transitions stop being value tweens above `maxTweenPoints` (4 000).** Above
that the cost of interpolating the array every frame exceeds the readability
gain, so Tempo switches to `axes-only`: the viewport moves, the data swaps at
the midpoint. The mode is reported, never silent.

**Different row counts never tween.** Two samplings of different lengths are not
a continuous shape. Interpolating them would require resampling, which invents
values at x positions that were never measured.

**`prefers-reduced-motion` is read once, at construction.** Changing the OS
setting mid-session is not picked up; construct a new chart.

**Replay pins the axes.** The y axis is locked to the full payload's extent for
the duration of a replay, so a series that only becomes interesting at minute 40
does not grow to fill the frame as it is uncovered. That is a deliberate
readability trade, not an oversight — an auto-ranging axis on a growing window
flickers.

## Data

**x must be sortable to a single monotonic axis.** Multi-series with different
x axes, categorical axes, and scatter data are outside the model. `sanitize`
will sort and dedupe, but it will not invent an ordering that does not exist.

**Out-of-order live samples are dropped, not buffered.** A feed that violates
monotonic time is a feed problem; reordering it silently would hide the bug.
`streamStats.rejectedOutOfOrder` makes it visible.

**Gap compression is available but not automatic.** `compressWindow()` builds a
non-linear timeline that shortens outages. It is opt-in because it changes what
"progress 50%" means, and a progress bar that lies about elapsed time is worse
than a long quiet stretch.

## Fidelity

**Point-wise reconstruction error is large on high-frequency data, by
construction.** At a 417:1 compression, the value at an arbitrary original x is
genuinely not recoverable. The pixel-space measurement in `perf/results.json` is
the meaningful one: it asks whether the two renders differ *on screen*. Report
both, never only the flattering one.

**LTTB optimises shape, not extremes.** `peakLossRatio` is reported separately
so a missed spike is visible. Use `minmax` when every extreme matters (alarm
thresholds, SLA breaches), and accept a slightly worse shape.

## Scope

**No legend interaction is wired to the filter layer.** Hiding a series via
uPlot's built-in legend hides it in uPlot only; `chart.setFilter({ visibleSeries })`
is the path that keeps alignment and readouts consistent. The two are not
synchronised.

**Drill depth is capped at 8** to keep the breadcrumb readable.

**The demo is a single page, not a component library.** There is no framework
binding (React/Vue/Svelte); `TempoChart` is a class over a DOM element, which is
what both frameworks wrap in a few lines.
