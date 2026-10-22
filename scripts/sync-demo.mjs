/**
 * sync-demo.mjs — copy the built bundles into demo/vendor.
 *
 * The demo directory is published to GitHub Pages on its own, so it has to be
 * self-contained: no `../dist` references, which would 404 once the site is
 * served from /tempo-replay-chart/.
 */

import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pairs = [
	['dist/tempo.iife.min.js', 'demo/vendor/tempo.iife.min.js'],
	['dist/uPlot.min.css', 'demo/vendor/uPlot.min.css'],
];

let changed = 0;

for (const [from, to] of pairs) {
	const src = resolve(root, from);
	const dst = resolve(root, to);

	if (!existsSync(src))
		throw new Error(`missing build output: ${from} (run npm run build first)`);

	mkdirSync(dirname(dst), { recursive: true });

	const before = existsSync(dst) ? statSync(dst).size : -1;
	copyFileSync(src, dst);
	const after = statSync(dst).size;

	console.log(`${from} -> ${to}  (${after} bytes${before === after ? ', unchanged' : ''})`);
	changed++;
}

console.log(`${changed} file(s) synced.`);
