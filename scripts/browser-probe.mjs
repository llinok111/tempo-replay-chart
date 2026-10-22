/**
 * browser-probe.mjs — drive a real headless Chromium/Edge over CDP.
 *
 * Used by two things:
 *   scripts/verify-visual.mjs  — pixel-level acceptance of the demo pages
 *   scripts/bench.mjs          — performance measurements in a real renderer
 *
 * A real browser is required for both: happy-dom mocks canvas, so it cannot
 * tell you how long a frame actually took or whether anything was painted.
 * No third-party driver: Node's built-in WebSocket talks to the DevTools
 * endpoint directly, so the repository gains no runtime dependency.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
	process.env.TEMPO_BROWSER,
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function findBrowser() {
	for (const p of CANDIDATES) {
		if (existsSync(p))
			return p;
	}
	throw new Error('No Chromium-based browser found. Set TEMPO_BROWSER to the executable path.');
}

export async function launch({ port = 9333, width = 1280, height = 900, args = [] } = {}) {
	const exe = findBrowser();
	const profile = mkdtempSync(join(tmpdir(), 'tempo-prof-'));

	const child = spawn(exe, [
		'--headless=new',
		'--disable-gpu',
		'--no-first-run',
		'--no-default-browser-check',
		'--disable-extensions',
		'--hide-scrollbars',
		'--mute-audio',
		`--remote-debugging-port=${port}`,
		`--user-data-dir=${profile}`,
		`--window-size=${width},${height}`,
		...args,
		'about:blank',
	], { stdio: ['ignore', 'pipe', 'pipe'] });

	let stderr = '';
	child.stderr.on('data', d => { stderr += d.toString(); });

	const deadline = Date.now() + 20000;
	let target = null;

	while (Date.now() < deadline) {
		try {
			const res = await fetch(`http://127.0.0.1:${port}/json/list`);
			const list = await res.json();
			target = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
			if (target) break;
		}
		catch {
			// endpoint not up yet
		}
		await new Promise(r => setTimeout(r, 120));
	}

	if (!target) {
		child.kill();
		throw new Error('DevTools endpoint did not come up.\n' + stderr.slice(0, 800));
	}

	const session = await connect(target.webSocketDebuggerUrl);

	return {
		session,
		async close() {
			try { session.ws.close(); } catch {}
			child.kill();
			await new Promise(r => setTimeout(r, 220));
			try { rmSync(profile, { recursive: true, force: true }); } catch {}
		},
		logs: [],
	};
}

async function connect(url) {
	const ws = new WebSocket(url);
	let id = 0;
	const pending = new Map();
	const events = [];

	await new Promise((resolve, reject) => {
		ws.addEventListener('open', resolve, { once: true });
		ws.addEventListener('error', e => reject(new Error('CDP socket error')), { once: true });
	});

	ws.addEventListener('message', ev => {
		const msg = JSON.parse(ev.data);
		if (msg.id != null) {
			const p = pending.get(msg.id);
			if (p) {
				pending.delete(msg.id);
				if (msg.error) p.reject(new Error(msg.error.message + ' ' + (msg.error.data ?? '')));
				else p.resolve(msg.result);
			}
		}
		else {
			events.push(msg);
		}
	});

	function send(method, params = {}) {
		const mid = ++id;
		return new Promise((resolve, reject) => {
			pending.set(mid, { resolve, reject });
			ws.send(JSON.stringify({ id: mid, method, params }));
		});
	}

	await send('Page.enable');
	await send('Runtime.enable');
	await send('Log.enable');

	return { send, events, ws };
}

/** Navigate and wait for `document.readyState === 'complete'` plus a settle delay. */
export async function goto(session, url, { settle = 400 } = {}) {
	await session.send('Page.navigate', { url });
	await waitFor(session, 'document.readyState === "complete"', 15000);
	if (settle) await sleep(settle);
}

export async function waitFor(session, expression, timeout = 10000, interval = 60) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		const { result } = await session.send('Runtime.evaluate', {
			expression: `(function(){ try { return !!(${expression}); } catch(e) { return false; } })()`,
			returnByValue: true,
		});
		if (result.value)
			return true;
		await sleep(interval);
	}
	throw new Error(`Timed out waiting for: ${expression}`);
}

export async function evaluate(session, expression, { awaitPromise = true } = {}) {
	const { result, exceptionDetails } = await session.send('Runtime.evaluate', {
		expression,
		returnByValue: true,
		awaitPromise,
		allowUnsafeEvalBlockedByCSP: true,
	});

	if (exceptionDetails)
		throw new Error('Page exception: ' + (exceptionDetails.exception?.description || exceptionDetails.text));

	return result.value;
}

export async function screenshot(session, path, { fullPage = true } = {}) {
	const { data } = await session.send('Page.captureScreenshot', {
		format: 'png',
		captureBeyondViewport: fullPage,
	});
	const { writeFileSync, mkdirSync } = await import('node:fs');
	const { dirname } = await import('node:path');
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, Buffer.from(data, 'base64'));
	return path;
}

export function sleep(ms) {
	return new Promise(r => setTimeout(r, ms));
}

/**
 * Canvas pixel audit.
 *
 * Returns real pixel statistics — how much of the plot area is non-background,
 * how many distinct stroke colours are present, and whether the series area is
 * actually populated. This is the machine-checkable part of "did something get
 * painted"; it does not replace looking at the page.
 */
export const PIXEL_AUDIT = `(function () {
	const canvases = [...document.querySelectorAll('#plot canvas')];
	if (!canvases.length) return { ok: false, reason: 'no canvas' };

	// uPlot draws the grid/series on the second canvas; the first is the cursor layer.
	const c = canvases.length > 1 ? canvases[1] : canvases[0];
	const ctx = c.getContext('2d');
	const { width, height } = c;
	const img = ctx.getImageData(0, 0, width, height).data;

	let painted = 0;
	let total = 0;
	const colours = new Map();

	for (let i = 0; i < img.length; i += 4) {
		const a = img[i + 3];
		total++;
		if (a < 8) continue;
		painted++;
		// Quantise to keep the histogram readable.
		const key = (img[i] >> 4) + ',' + (img[i + 1] >> 4) + ',' + (img[i + 2] >> 4);
		colours.set(key, (colours.get(key) || 0) + 1);
	}

	const top = [...colours.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

	return {
		ok: painted / total > 0.004,
		width, height,
		paintedRatio: +(painted / total).toFixed(5),
		distinctColours: colours.size,
		topColours: top.map(([k, n]) => ({ rgb4: k, n })),
		canvasCount: canvases.length,
	};
})()`;
