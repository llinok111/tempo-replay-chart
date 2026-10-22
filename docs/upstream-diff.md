# Upstream: uPlot

This repository is a fork of [leeoniya/uPlot](https://github.com/leeoniya/uPlot)
(MIT). Upstream's commit history, `src/`, `test/`, `demos/` and `dist/` are
preserved unchanged; everything added for the Tempo layer is listed below.

## Baseline check

Before writing any code the upstream suite was run on this machine:

| run | passing | failing | pending |
|---|---|---|---|
| upstream, before any tempo change | 4070 | 21 | 46 |
| upstream, after the tempo layer | 4070 | 21 | 46 |

The 21 failures are pre-existing and platform-specific: demo snapshot tests
compare canvas text positions (`1:00am` vs `2:00pm` — a timezone/locale
difference) and path separators (`test/output` vs `test\output`). They are
recorded verbatim in `test/upstream-baseline.json`, and `npm run check` fails if
the set ever grows.

## What was verified as absent upstream

Grepping `src/` (uPlot's own source only — `src/tempo/` is the layer added
here) for the capabilities Tempo claims:

| token | hits in upstream `src/` |
|---|---|
| `animat` | 0 |
| `tween` | 2, both inside the word "be**tween**" in comments |
| `ease` | 0 |
| `replay` / `playback` | 0 |
| `scrub` | 0 |
| `drill` | 0 |
| `brush` | 0 |
| `appendData` / `stream` | 0 |

uPlot's own README lists no animation or replay capability; it is a renderer
with a deliberately narrow contract.

## Files added

```
src/tempo/
  guard.js        input repair, issue reporting
  downsample.js   LTTB / min-max index selection, fidelity measurement
  tween.js        interruptible transitions, buffer reuse
  easing.js       easing curves + reduced-motion probe
  playback.js     replay state machine, zero-copy reveal views
  drill.js        viewport stack, snapping, calendar bucketing
  filter.js       structured predicates
  stream.js       ring buffer + frame coalescer
  clock.js        injectable scheduler
  compress.js     piecewise gap-compressing timeline
  metrics.js      percentile sampling
  index.js        TempoChart — the uPlot binding
src/tempo.bundle.js   browser bundle entry
demo/                 seven-scene workbench (index.html, app.js, data.js, vendor/)
perf/index.html       in-browser benchmark harness
scripts/browser-probe.mjs   CDP driver (built-in WebSocket, no dependency)
scripts/verify-visual.mjs   pixel + readout acceptance
scripts/bench.mjs           benchmark driver
scripts/sync-demo.mjs       copy dist → demo/vendor
scripts/check-all.mjs       upstream → tempo → visual, in that order
test/tempo/*.test.mjs       176 tempo tests
test/upstream-baseline.json recorded upstream failure set
docs/                 architecture, api, limitations, benchmarks
```

## Files modified

| file | change | why |
|---|---|---|
| `rolldown.config.js` | adds tempo build targets; upstream targets moved behind `TEMPO_REBUILD_UPSTREAM` | rebuilding upstream's `dist/` rewrites 1 500 lines of `.d.ts` and breaks 8 snapshot tests |
| `package.json` | adds scripts (`test:tempo`, `verify`, `bench`, `demo:sync`, `check`) | |
| `.gitignore` | ignores `shots/`, `.cache/`, benchmark output | |
| `README.md` | a Tempo section is prepended; upstream text below is untouched | |

`src/uPlot.js`, `src/opts.js`, every upstream test, and every upstream dist
artefact are byte-identical to upstream `main` at the fork point
(`16ab9c8`, 2026-10-22).

## Syncing with upstream

```sh
git fetch upstream
git checkout -b upstream-merge upstream/main   # if a separate remote is configured
git merge upstream-merge
npm test                                        # upstream suite must stay at 4070/21/46
npm run check                                   # or: compare against the baseline file
```

If upstream changes a snapshot expectation, `test/upstream-baseline.json` must
be regenerated deliberately — never edited to make a run pass.
