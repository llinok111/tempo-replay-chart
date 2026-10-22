# Architecture

## The one-sentence version

uPlot renders an array. Tempo renders **a timeline**, and keeps the array it
hands to uPlot small enough to animate at 60 fps regardless of how many rows the
source has.

## Pipeline

```
 raw input (possibly wrong)
      │
      ▼
 ┌─────────────┐   repair contract violations, count every one of them
 │  sanitize   │   null x dropped · duplicate x collapsed · NaN/Inf → gap
 └─────────────┘   unsorted rows repaired by a stable sort + rowMap
      │
      ▼
 ┌─────────────┐   series visibility · x window · structured predicates
 │  filter     │   never mutates; returns kept/dropped counts
 └─────────────┘
      │
      ▼
 ┌─────────────┐   ONE index list, shared by every series (O(n), not O(n·s))
 │  decimate   │   LTTB or min-max envelope · gap-bracketed · ≤ maxPoints
 └─────────────┘
      │
      ▼
 ┌─────────────┐   zero-copy typed-array views for reveal/window
 │  playback   │   linear in x (real time), or piecewise with gap compression
 └─────────────┘
      │
      ▼
 ┌─────────────┐   equal-length only · null never blended · buffer reused
 │  transition │   interruptible: current frame becomes the new origin
 └─────────────┘
      │
      ▼
   uPlot.setData()      ← unmodified upstream
```

## Why decimation happens once, not per frame

A naive replay would slice the raw payload every frame and hand the result to
uPlot. At 1 000 000 rows that is a million-point redraw per frame, which is
~200 ms of canvas work — a 5 fps animation.

Tempo decimates **before** playback starts, to a budget of ~1.5 samples per CSS
pixel. Everything that runs at 60 fps then operates on ≤ 3 000 points:

| stage | runs when | cost |
|---|---|---|
| sanitize | data changes | O(rows) |
| filter | data or filter changes | O(rows) |
| decimate | data or filter changes | O(rows) |
| playback slice | every frame | O(1) — `subarray` |
| transition | every frame during a tween | O(maxPoints) |
| `setData` | every frame | O(maxPoints) |

That separation is the whole design. The measured numbers in the README show
the consequence: a 1 000 000-row replay holds 16.7 ms median frame intervals.

## Budget derivation

`maxPoints = clamp(width × 1.5, 300, ∞)`.

Above 2 samples per pixel an LTTB path is visually indistinguishable from the
raw polyline, and 1.5 leaves headroom for wide data (area fills, points). The
budget is recomputed on `setSize` unless it was passed explicitly.

## Where the invariants live

| invariant | enforced in | tested by |
|---|---|---|
| x strictly increasing | `guard.sanitize` | `guard.test` "output always satisfies the aligned contract" |
| every column same length | `guard.sanitize`, `decimateAligned` | same |
| no invented numbers | `guard` (NaN→null), `tween` (null wins) | `tween.test` "never blends a null endpoint" |
| null gaps survive decimation | `downsample.splitRuns` | `downsample.test` "does not lose a gap" |
| animation never changes readings | tooltips read `chart.data`, not the tween buffer | `chart.test` data-pipeline cases |
| replay frame cost independent of row count | `_budgetFrame` + pre-decimation | `bench` replay section |

## The five modules and why they are separate

Each file has no DOM dependency, which is what makes the whole layer testable
under happy-dom (and, for the pure ones, under plain Node):

- `guard.js` — input repair. Pure.
- `downsample.js` — index selection + fidelity measurement. Pure.
- `clock.js` — injectable time and frame scheduler. Pure (takes a host object).
- `easing.js` — curves. Pure.
- `tween.js` — interruptible transitions. Pure except for `performance.now`.
- `playback.js` — replay state machine. Pure; the caller drives `tick(dt)`.
- `drill.js` — viewport stack. Pure.
- `filter.js` — structured predicates. Pure.
- `stream.js` — ring buffer + coalescer. Pure.
- `metrics.js` — percentile sampling. Pure.
- `compress.js` — piecewise timeline mapping. Pure.
- `index.js` — **the only file that touches uPlot**, and it does so only through
  `hooks`, `opts`, `setData` and `setScale`.

## Interruption model

```
t=0    start(A→B, 320ms)
t=120  setData(C)          ← samples the on-screen buffer as the new origin
       start(mid→C, 320ms)   (no snap-back, no queue)
```

`Transition.snapshot()` deep-copies the current output buffer. Because the
buffer is reused in place, a naive read would give the target, not the current
frame — hence the copy, which is the only allocation in the transition path.

## What is deliberately *not* animated

- **Tooltips.** They read the source arrays. Interpolating a readout would put
  a number on screen that never existed in the data.
- **Axis ticks during a values transition.** uPlot re-ranges from the
  interpolated buffer, so ticks move continuously; during a *replay* the axes
  are pinned instead, because a re-ranging y axis on a growing window reads as
  jitter.
- **Cross-length transitions.** A different row count is a different sampling,
  not a morph. Tempo swaps at the midpoint behind a moving viewport and says so
  in `transition.mode === 'axes-only'`.
