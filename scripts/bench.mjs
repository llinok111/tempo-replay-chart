/**
 * bench.mjs — run the in-page benchmark in a real headless browser and persist
 * the result.
 *
 * The harness (perf/index.html) owns the measurement; this script only drives
 * it, so the numbers can be reproduced either by running this file or by
 * opening perf/index.html and calling `runBench()` in the console — the same
 * code path produces the same JSON.
 *
 * Usage:
 *   node scripts/bench.mjs                # default scales, 12 reps
 *   node scripts/bench.mjs --quick        # 1k/100k/1M, 6 reps
 */

import { launch, goto, evaluate, waitFor, sleep } from './browser-probe.mjs';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = pathToFileURL(resolve(root, 'perf/index.html')).href;
const outDir = resolve(root, 'perf');

const quick = process.argv.includes('--quick');
const scales = quick ? [1000, 100000, 1000000] : [1000, 10000, 100000, 500000, 1000000];
const reps = quick ? 4 : 10;

const browser = await launch({ width: 1280, height: 900 });
let result;

try {
	await goto(browser.session, page, { settle: 600 });
	await waitFor(browser.session, `typeof window.runBench === 'function'`, 15000);

	// The run is synchronous inside the page except for the frame-cadence
	// sections; give it a generous ceiling and poll.
	const pending = evaluate(
		browser.session,
		`window.runBench({ scales: ${JSON.stringify(scales)}, reps: ${reps}, mode: 'lttb' })`,
		{ awaitPromise: true },
	);

	result = await Promise.race([
		pending,
		sleep(180000).then(() => { throw new Error('benchmark exceeded 180 s'); }),
	]);
}
finally {
	await browser.close();
}

result.meta.scales = scales;
result.meta.reps = reps;
result.meta.executable = process.env.TEMPO_BROWSER || 'auto-detected';

mkdirSync(outDir, { recursive: true });
const jsonPath = resolve(outDir, 'results.json');
writeFileSync(jsonPath, JSON.stringify(result, null, 2) + '\n');

// Keep a small history so a regression is visible rather than averaged away.
const historyPath = resolve(outDir, 'history.json');
let history = [];
if (existsSync(historyPath)) {
	try { history = JSON.parse(readFileSync(historyPath, 'utf8')); } catch { history = []; }
}
history.push({ at: result.meta.at, pipeline: result.pipeline, transitions: result.transitions });
writeFileSync(historyPath, JSON.stringify(history.slice(-12), null, 2) + '\n');

// ---- console table --------------------------------------------------------

const pad = (s, n) => String(s).padStart(n);

console.log('\n== pipeline (median of ' + reps + ' runs) ==');
console.log('rows      rendered  sanitize(ms)  decimate(ms)  mount(ms)  setData(ms)  render(max)');
for (const n of scales) {
	const p = result.pipeline[n];
	if (!p) continue;
	console.log(
		pad(p.rows, 9) + pad(p.rendered, 10) +
		pad(p.sanitize.p50.toFixed(2), 14) +
		pad(p.decimate.p50.toFixed(2), 14) +
		pad(p.mountMs.toFixed(1), 10) +
		pad(p.setData.p50.toFixed(2), 13) +
		pad((p.renderMax ?? 0).toFixed(3), 13),
	);
}

console.log('\n== transitions ==');
console.log(JSON.stringify(result.transitions, null, 1));

console.log('\n== replay ==');
for (const k of Object.keys(result.replay))
	console.log(k + ' rows:', JSON.stringify(result.replay[k]));

console.log('\n== live ==');
console.log(JSON.stringify(result.live, null, 1));

console.log('\n== fidelity @1M -> 2400 ==');
for (const k of Object.keys(result.fidelity))
	console.log(k, JSON.stringify(result.fidelity[k]));

console.log('\nwrote ' + jsonPath);
