#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const SCRIPT     = path.join(__dirname, 'wall-e_status.js');
const CACHE_DIR  = path.join(os.homedir(), '.claude', 'cache');
const TOKENS_FILE = path.join(CACHE_DIR, 'wall-e-tokens.json');

// ─── Utilities ────────────────────────────────────────────────────────────────

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function run(payload) {
  const result = spawnSync('node', [SCRIPT], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 15000
  });
  return stripAnsi(result.stdout || '');
}

function withCosts(fn) {
  const data = JSON.stringify({
    today: 1.23, month: 4.56, total: 7.89,
    todayTokens: 10000, monthTokens: 40000,
    totalTokens: 78900, lastMonth: 0.50, lastMonthTok: 5000
  });
  const backup = TOKENS_FILE + '.bak';
  const hadFile = fs.existsSync(TOKENS_FILE);
  if (hadFile) fs.renameSync(TOKENS_FILE, backup);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(TOKENS_FILE, data);
  try { fn(); } finally {
    try { fs.unlinkSync(TOKENS_FILE); } catch {}
    if (hadFile) try { fs.renameSync(backup, TOKENS_FILE); } catch {}
  }
}

function withoutCosts(fn) {
  const backup = TOKENS_FILE + '.bak';
  const hadFile = fs.existsSync(TOKENS_FILE);
  if (hadFile) fs.renameSync(TOKENS_FILE, backup);
  try { fn(); } finally {
    if (hadFile) try { fs.renameSync(backup, TOKENS_FILE); } catch {}
  }
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}
function assertContains(output, str) {
  assert(output.includes(str), `Expected to find:    "${str}"`);
}
function assertNotContains(output, str) {
  assert(!output.includes(str), `Expected NOT to find: "${str}"`);
}

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
let currentSection = '';

function section(name) {
  currentSection = name;
  console.log(`\n  ${name}`);
}

function test(name, fn) {
  try {
    fn();
    console.log(`    ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`    ✗ ${name}`);
    console.log(`      → ${e.message}`);
    failed++;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log('\n  wall-e STATUSLINE — test suite\n  ' + '─'.repeat(38));

// ── 1. Baseline
section('1. Baseline (empty payload)');
// Run baseline without a cost file so fallback paths are exercised
let base;
withoutCosts(() => { base = run({}); });
test('renders wall-e STATUSLINE title',   () => assertContains(base, 'wall-e STATUSLINE'));
test('renders LOC row',                   () => assertContains(base, 'LOC:'));
test('renders ENV row',                   () => assertContains(base, 'ENV:'));
test('renders CONTEXT row',               () => assertContains(base, 'CONTEXT:'));
test('renders CONTEXT bar with brackets', () => assertContains(base, '[ '));
test('shows 0% when no context payload',  () => assertContains(base, '[0%]'));
test('renders USAGE: no data',            () => assertContains(base, 'USAGE:'));
test('renders PWD row',                   () => assertContains(base, 'PWD:'));
test('top separator line present',        () => {
  const lines = base.split('\n').filter(l => l.trim());
  assert(lines[0].startsWith('─'), `First line should start with ─, got: "${lines[0].slice(0,10)}"`);
});
test('bottom separator line present',     () => {
  const lines = base.split('\n').filter(l => l.trim());
  assert(lines[lines.length - 1].startsWith('─'), `Last line should start with ─`);
});

// ── 2. Context bar — percentage math at color boundaries
section('2. Context bar % calculation');
const ctxCases = [
  { remaining: undefined, label: 'missing',   expected: '0%'   },
  { remaining: 75,        label: 'r=75',      expected: '30%'  },
  { remaining: 50,        label: 'r=50 (yellow boundary)', expected: '60%' },
  { remaining: 25,        label: 'r=25 (red)',  expected: '90%' },
  { remaining: 10,        label: 'r=10 (capped)', expected: '100%' },
];
for (const c of ctxCases) {
  test(`remaining=${c.label} → [${c.expected}]`, () => {
    const payload = c.remaining != null
      ? { context_window: { remaining_percentage: c.remaining } }
      : {};
    const out = run(payload);
    assertContains(out, `[${c.expected}]`);
  });
}

// ── 3. Model name mapping
section('3. Model name mapping');
const modelCases = [
  { input: 'claude-sonnet-4-6-20250514', expected: 'Sonnet 4.6' },
  { input: 'claude-sonnet-4-5',          expected: 'Sonnet 4.5' },
  { input: 'claude-opus-4-6',            expected: 'Opus 4.6'   },
  { input: 'claude-haiku-4-5-20241022',  expected: 'Haiku 4.5'  },
  { input: '',                            expected: 'unknown'    },
];
for (const m of modelCases) {
  test(`"${m.input || '(empty)'}" → "${m.expected}"`, () => {
    const payload = m.input ? { model: { display_name: m.input } } : {};
    const out = run(payload);
    assertContains(out, m.expected);
  });
}

// ── 4. Context label (ctxLabel)
section('4. Context window label (ctxLabel)');
test('defaults to (200K) with no token data', () => {
  assertContains(base, '(200K)');
});
test('computes (200K) from 100K used + 100K remaining', () => {
  const out = run({ context_window: { tokens_used: 100000, tokens_remaining: 100000 } });
  assertContains(out, '(200K)');
});

// ── 5. Cost data — absent vs present
section('5. Cost data (absent)');
withoutCosts(() => {
  const noCost = run({});
  test('shows "no data" when wall-e-tokens.json missing', () => assertContains(noCost, 'no data'));
  test('no TOKENS row when no cost data',  () => assertNotContains(noCost, 'TOKENS:'));
  test('no COSTS row when no cost data',   () => assertNotContains(noCost, 'COSTS:'));
});

section('5b. Cost data (present)');
withCosts(() => {
  const out = run({});
  test('TOKENS row present',       () => assertContains(out, 'TOKENS:'));
  test('COSTS row present',        () => assertContains(out, 'COSTS:'));
  test('today cost $1.23 shown',   () => assertContains(out, '$1.23'));
  test('total cost $7.89 shown',   () => assertContains(out, '$7.89'));
  test('today tokens shown',       () => assertContains(out, '10,000'));
  test('no "no data" with costs',  () => assertNotContains(out, 'no data'));
});

// ── 6. Quote wrapping
section('6. Quote wrapping');
withCosts(() => {
  const out = run({});
  const lines = out.split('\n');
  const quoteLine = lines.findIndex(l => l.trimStart().startsWith('◆ "'));
  test('quote line exists', () => assert(quoteLine !== -1, 'No line starting with ◆ "'));
  test('no stray bullet on continuation line', () => {
    const next = lines[quoteLine + 1] || '';
    // continuation (if present) must start with 2 spaces, not a bullet
    if (next.trim() && !next.startsWith('─') && !next.includes('Plugins:')) {
      assert(next.startsWith('  '), `Continuation line should start with 2 spaces, got: "${next.slice(0,8)}"`);
      assert(!next.trimStart().startsWith('◆'), 'Continuation line must not have a bullet');
    }
  });
});

// ── 7. Non-git directory
section('7. Non-git working directory');
const nonGit = run({ workspace: { current_dir: 'C:\\Windows' } });
test('Branch shows --',  () => assertContains(nonGit, 'Branch: --'));
test('Age shows 0d',     () => assertContains(nonGit, 'Age: 0d'));
test('New shows 0',      () => assertContains(nonGit, 'New: 0'));

// ── 8. Separators and structure
section('8. Structure sanity');
test('exactly 2 separator lines', () => {
  const sepLines = base.split('\n').filter(l => l.trim().startsWith('─'));
  assert(sepLines.length === 2, `Expected 2 separator lines, got ${sepLines.length}`);
});
test('no raw ANSI codes leaked into strip output', () => {
  assert(!base.includes('\x1b['), 'ANSI escape codes found in stripped output');
});

// ─── Summary ──────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n  ${'─'.repeat(38)}`);
console.log(`  ${passed}/${total} passed${failed > 0 ? `  (${failed} failed)` : ''}`);
console.log('');
process.exit(failed > 0 ? 1 : 0);
