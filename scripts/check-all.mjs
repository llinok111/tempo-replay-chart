/**
 * check-all.mjs — the single command a reviewer should run.
 *
 * Order matters. Upstream first: if the fork ever regresses uPlot's own
 * behaviour, nothing else Tempo claims is worth measuring. The upstream suite
 * has a known, pre-existing set of platform failures on Windows (snapshot text
 * positions and path separators); they are recorded in
 * test/upstream-baseline.json and this script fails on any *new* failure,
 * not on the baseline.
 *
 *   1. npm run build          — the bundles must compile
 *   2. upstream test suite    — compare against the recorded baseline
 *   3. tempo unit + integration tests
 *   4. visual acceptance      — real browser, pixels and readouts
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = resolve(root, 'test/upstream-baseline.json');

function run(label, args, opts = {}) {
	process.stdout.write(`\n=== ${label} ===\n`);
	const res = spawnSync(process.execPath, args, {
		cwd: root,
		stdio: ['ignore', 'pipe', 'pipe'],
		encoding: 'utf8',
		env: { ...process.env, ...opts.env },
	});

	const out = (res.stdout || '') + (res.stderr || '');
	if (opts.echo) process.stdout.write(out.slice(-4000));
	return { code: res.status ?? 1, out };
}

function countTests(out) {
	const pick = re => {
		const m = out.match(re);
		return m ? Number(m[1]) : null;
	};
	return {
		passing: pick(/^\s*(\d+) passing/m),
		failing: pick(/^\s*(\d+) failing/m),
		pending: pick(/^\s*(\d+) pending/m),
	};
}

function failureTitles(out) {
	// Mocha's epilogue lists failures as "  N) full title".
	const titles = [];
	const re = /^\s+\d+\)\s+(.+)$/gm;
	let m;
	while ((m = re.exec(out))) {
		const t = m[1].trim();
		if (!/^\d+$/.test(t)) titles.push(t);
	}
	return [...new Set(titles)];
}

const report = { at: new Date().toISOString(), steps: [] };
let failed = false;

// ---- 1. build -------------------------------------------------------------

const build = run('build', [resolve(root, 'node_modules/rolldown/bin/cli.mjs')]);
report.steps.push({ step: 'build', code: build.code });
if (build.code !== 0) {
	failed = true;
	console.error(build.out.slice(-3000));
}

// ---- 2. upstream suite ----------------------------------------------------

if (!failed) {
	const up = run('upstream suite', [resolve(root, 'scripts/test.mjs')]);
	const counts = countTests(up.out);
	const titles = failureTitles(up.out);

	let baseline = null;
	if (existsSync(baselinePath)) {
		try { baseline = JSON.parse(readFileSync(baselinePath, 'utf8')); } catch { baseline = null; }
	}

	const known = new Set(baseline?.failures ?? []);
	const fresh = titles.filter(t => !known.has(t));
	const fixed = [...known].filter(t => !titles.includes(t));

	console.log(`passing ${counts.passing} · failing ${counts.failing} · pending ${counts.pending}`);
	console.log(`baseline knows ${known.size} failures · new ${fresh.length} · fixed ${fixed.length}`);

	// First run on a fresh clone has no baseline yet: record it and pass, since
	// there is nothing to regress from. Every later run compares against it.
	if (!baseline && fresh.length) {
		console.log('\nNo baseline yet — recording the current failure set as the reference.');
		for (const t of fresh) console.log('  · ' + t);
	}
	else if (fresh.length || (baseline && counts.failing > baseline.failing)) {
		// Titles are not unique across demos (a snapshot step can be called
		// "0-0" in several files), so a count increase is also a regression even
		// when every title is already known.
		failed = true;
		console.log('\nNEW upstream failures:');
		for (const t of fresh) console.log('  - ' + t);
		if (baseline && counts.failing > baseline.failing)
			console.log(`  failing count grew: ${baseline.failing} -> ${counts.failing}`);
		console.log(up.out.slice(-5000));
	}

	report.steps.push({
		step: 'upstream',
		code: up.code,
		passing: counts.passing,
		failing: counts.failing,
		newFailures: fresh,
		fixedFailures: fixed,
	});

	if (!baseline) {
		mkdirSync(dirname(baselinePath), { recursive: true });
		writeFileSync(baselinePath, JSON.stringify({
			note: 'Recorded before any tempo-layer change. Platform-specific: Windows snapshot text offsets and path separators.',
			recordedAt: new Date().toISOString(),
			passing: counts.passing,
			failing: counts.failing,
			pending: counts.pending,
			failures: titles,
		}, null, 2) + '\n');
		console.log('baseline written to test/upstream-baseline.json');
	}
}

// ---- 3. tempo tests -------------------------------------------------------

if (!failed) {
	const t = run('tempo tests', [
		'--import', './scripts/register-hooks.mjs',
		resolve(root, 'node_modules/mocha/bin/mocha.js'),
		'test/tempo/*.test.mjs',
	], { env: { UPLOT_INSTRUMENT_CACHE_DIR: resolve(root, '.cache/tempo') } });

	const counts = countTests(t.out);
	console.log(`passing ${counts.passing} · failing ${counts.failing}`);
	if (t.code !== 0) {
		failed = true;
		console.log(t.out.slice(-6000));
	}
	report.steps.push({ step: 'tempo', code: t.code, ...counts });
}

// ---- 4. visual acceptance -------------------------------------------------

if (!failed) {
	const v = run('visual acceptance', [resolve(root, 'scripts/verify-visual.mjs')]);
	console.log(v.out.slice(-1600));
	if (v.code !== 0) failed = true;
	report.steps.push({ step: 'visual', code: v.code });
}

report.failed = failed;
mkdirSync(resolve(root, '.cache'), { recursive: true });
writeFileSync(resolve(root, '.cache/check-report.json'), JSON.stringify(report, null, 2) + '\n');

console.log(`\n${failed ? 'FAILED' : 'ALL CHECKS PASSED'}`);
process.exitCode = failed ? 1 : 0;
