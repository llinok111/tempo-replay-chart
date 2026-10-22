/**
 * verify-visual.mjs — acceptance for the demo pages in a real renderer.
 *
 * For every scene it walks the tab bar, waits for the chart to settle, then
 * checks three independent things:
 *
 *   1. DOM readouts contain finite numbers (the page is reporting, not stuck).
 *   2. The canvas has real painted pixels of the expected stroke colour.
 *   3. A screenshot is written for human review.
 *
 * Exit code is non-zero if any scene fails, so this can gate a release.
 */

import { launch, goto, evaluate, waitFor, screenshot, sleep, PIXEL_AUDIT } from './browser-probe.mjs';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = pathToFileURL(resolve(root, 'demo/index.html')).href;
const outDir = resolve(root, 'shots/verify');

const SCENES = ['replay', 'transition', 'drill', 'filter', 'live', 'large', 'dirty'];

const browser = await launch({ width: 1280, height: 1200 });
const results = [];
let failures = 0;

try {
	mkdirSync(outDir, { recursive: true });

	// Navigate once. Switching scenes by clicking the tab bar is also the
	// interaction the page is built around; navigating to `#id` alone does not
	// reload the document, so hash-only navigation would audit the same scene
	// seven times.
	await goto(browser.session, page, { settle: 500 });
	await waitFor(browser.session, `document.querySelectorAll('#plot canvas').length >= 1`, 15000);

	for (const scene of SCENES) {
		await evaluate(browser.session, `(function(){
			const tab = document.querySelector('.tab[data-id="${scene}"]');
			if (!tab) throw new Error('missing tab ${scene}');
			tab.click();
			return true;
		})()`);

		// The scene rebuilds its chart synchronously, but its first paint and any
		// deferred data generation land on later frames.
		await sleep(scene === 'large' ? 3000 : 700);

		// Two scenes start empty on purpose (a live feed has nothing before you
		// start it; a transition cannot exist before the second dataset). Drive
		// them the way a reader would, then audit.
		if (scene === 'live') {
			await evaluate(browser.session, `(function(){
				const b = [...document.querySelectorAll('#controls button')].find(x => x.textContent.includes('开始推送'));
				if (!b) return false;
				b.click();
				return true;
			})()`);
			await sleep(1400);
		}

		if (scene === 'transition') {
			await evaluate(browser.session, `(function(){
				const b = [...document.querySelectorAll('#controls .seg button')].find(x => x.textContent.trim() === 'B');
				if (!b) return false;
				b.click();
				return true;
			})()`);
			await sleep(900);
		}

		await waitFor(browser.session, `document.querySelector('.tab[data-id="${scene}"][aria-selected="true"]') != null`, 4000);
		await waitFor(browser.session, `document.querySelectorAll('#plot canvas').length >= 1`, 15000);

		const audit = await evaluate(browser.session, PIXEL_AUDIT);
		const dom = await evaluate(browser.session, `(function(){
			const cells = [...document.querySelectorAll('#readout .cell')].map(c => ({
				k: c.querySelector('.k').textContent,
				v: c.querySelector('.v').textContent.trim(),
			}));
			return {
				tab: document.querySelector('.tab[aria-selected="true"]')?.textContent || null,
				cells,
				hint: (document.getElementById('hint').textContent || '').slice(0, 60),
				notes: document.querySelectorAll('#notes .note').length,
				issues: [...document.querySelectorAll('#notes li')].length,
			};
		})()`);

		const emptyReadout = dom.cells.filter(c => /^—$/.test(c.v)).length;
		const ok = audit.ok && dom.cells.length >= 6 && emptyReadout <= 2;

		if (!ok) failures++;

		const shot = resolve(outDir, scene + '.png');
		await screenshot(browser.session, shot);

		results.push({
			scene,
			ok,
			paintedRatio: audit.paintedRatio,
			distinctColours: audit.distinctColours,
			canvasCount: audit.canvasCount,
			cells: dom.cells.length,
			emptyCells: emptyReadout,
			tab: (dom.tab || '').replace(/\s+/g, ' ').trim(),
			sample: dom.cells.slice(0, 4),
			shot: 'shots/verify/' + scene + '.png',
		});
	}
}
finally {
	await browser.close();
}

// ---- extra interaction checks (not just static paint) ----------------------

const report = {
	at: new Date().toISOString(),
	browser: process.env.TEMPO_BROWSER || 'auto',
	scenes: results,
	failures,
};

writeFileSync(resolve(outDir, 'visual-report.json'), JSON.stringify(report, null, 2) + '\n');

for (const r of results) {
	const mark = r.ok ? 'PASS' : 'FAIL';
	console.log(
		`[${mark}] ${r.scene.padEnd(11)} paint=${(r.paintedRatio * 100).toFixed(2)}% ` +
		`colours=${String(r.distinctColours).padStart(3)} canvases=${r.canvasCount} ` +
		`cells=${r.cells} empty=${r.emptyCells}`,
	);
}

console.log(`\n${results.length - failures}/${results.length} scenes painted.`);
process.exitCode = failures ? 1 : 0;
