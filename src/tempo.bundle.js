/**
 * tempo.bundle.js — single-file build entry for the browser demos.
 *
 * uPlot is bundled in (no runtime dependency, no CDN); the demo shell only
 * needs `window.Tempo`.
 */
import TempoChart from './tempo/index.js';
import { Playback, PLAYBACK_MODE, PLAYBACK_STATE, RevealData } from './tempo/playback.js';
import { DrillStack, snapRange, bucketRanges } from './tempo/drill.js';
import { RingBuffer, Coalescer } from './tempo/stream.js';
import { Transition, interpolateInto, interpolateRange } from './tempo/tween.js';
import { sanitize, ISSUE } from './tempo/guard.js';
import {
	decimateAligned, selectIndices, lttb, minMax, measureFidelity,
} from './tempo/downsample.js';
import { applyFilter, compileCondition, OP } from './tempo/filter.js';
import { summarize, percentile, Metrics } from './tempo/metrics.js';
import { createManualScheduler, createFrameLoop } from './tempo/clock.js';
import { EASINGS, VALUE_EASINGS } from './tempo/easing.js';
import { compressWindow } from './tempo/compress.js';
import { pixelFidelity, budgetForPixelTolerance } from './tempo/fidelity.js';

const Tempo = {
	TempoChart,
	Playback, RevealData, DrillStack, RingBuffer, Coalescer, Transition,
	sanitize, ISSUE, decimateAligned, selectIndices, lttb, minMax, measureFidelity,
	applyFilter, compileCondition, OP,
	snapRange, bucketRanges, summarize, percentile, Metrics,
	createManualScheduler, createFrameLoop, compressWindow,
	pixelFidelity, budgetForPixelTolerance,
	interpolateInto, interpolateRange,
	EASINGS, VALUE_EASINGS,
	PLAYBACK_MODE, PLAYBACK_STATE,
};

if (typeof window !== 'undefined')
	window.Tempo = Tempo;

export default Tempo;
