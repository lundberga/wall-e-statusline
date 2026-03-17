#!/usr/bin/env node
// wall-e STATUSLINE — Node.js entry point
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { spawnSync } = require('child_process');
const https = require('https');
const http  = require('http');

// ─── Paths ────────────────────────────────────────────────────────────────────

const HOME       = os.homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const CACHE_DIR  = path.join(CLAUDE_DIR, 'cache');
const BASE_DIR   = path.dirname(process.argv[1] || __filename);

// ─── ANSI palette ─────────────────────────────────────────────────────────────

const RESET        = '\x1b[0m';
const BOLD         = '\x1b[1m';
const SEP_COLOR    = '\x1b[38;5;237m';   // separator lines
const DIM_GRAY     = '\x1b[38;5;245m';   // pipes, brackets, separators
const LABEL_GRAY   = '\x1b[38;5;245m';   // all LABEL: text
const PLAIN_WHITE  = '\x1b[97m';         // regular values
const BRIGHT_WHITE = '\x1b[97m';         // title + location city (bold)
const BRAND_CYAN   = '\x1b[38;5;38m';   // brand, model, PWD name, author
const LIGHT_CYAN   = '\x1b[38;2;139;233;253m'; // PWD bullet only
const SKL_CYAN     = '\x1b[38;2;79;195;247m';  // Skills ◆ and MCPs ○
const PURPLE       = '\x1b[38;5;135m';  // CONTEXT ●, Plugins ●
const AMBER        = '\x1b[38;5;214m';  // USAGE ◆, Quote ◆
const YELLOW_GREEN = '\x1b[38;2;241;250;140m';  // percentages, all $ amounts
const WEATHER_WHITE= '\x1b[38;5;245m';  // weather description

// ─── Helpers ──────────────────────────────────────────────────────────────────

const W = process.stdout.columns || 72;

function sep(width) {
  return SEP_COLOR + '─'.repeat(width) + RESET;
}

// Strip ANSI escape codes to measure visible character width
function visLen(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

// Wrap quote to fit within maxWidth columns (word-wrap, 2-space continuation indent)
function wrapQuote(quoteText, quoteAuthor, maxWidth) {
  const suffix = `" — ${quoteAuthor}`;
  const full   = `◆ "${quoteText}${suffix}`;

  if (full.length <= maxWidth) {
    return [
      AMBER + '◆' + RESET + ' ' +
      LABEL_GRAY + '"' + quoteText + '"' + RESET + ' ' +
      DIM_GRAY + '—' + RESET + ' ' +
      BRAND_CYAN + quoteAuthor + RESET
    ];
  }

  // Break quoteText at last word that fits on first line after '◆ "' (3 chars)
  const avail = maxWidth - 3;
  const words = quoteText.split(' ');
  let firstPart = '';
  for (const word of words) {
    const test = firstPart ? firstPart + ' ' + word : word;
    if (test.length <= avail) firstPart = test;
    else break;
  }
  const restPart = quoteText.slice(firstPart.length).trimStart();

  return [
    AMBER + '◆' + RESET + ' ' + LABEL_GRAY + '"' + firstPart + RESET,
    '  ' + LABEL_GRAY + restPart + '"' + RESET + ' ' +
    DIM_GRAY + '—' + RESET + ' ' + BRAND_CYAN + quoteAuthor + RESET
  ];
}

function lbl(text) {
  return LABEL_GRAY + text + RESET;
}

function val(text, color = PLAIN_WHITE) {
  return color + text + RESET;
}

function pipe() {
  return DIM_GRAY + ' | ' + RESET;
}

function mapModelName(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('sonnet-4-6')) return 'Sonnet 4.6';
  if (s.includes('sonnet-4-5')) return 'Sonnet 4.5';
  if (s.includes('opus-4-6'))   return 'Opus 4.6';
  if (s.includes('haiku-4-5'))  return 'Haiku 4.5';
  return raw || 'unknown';
}

function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function writeJSON(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch {}
}

function cacheGet(filePath, ttlSec) {
  const d = readJSON(filePath);
  if (d && (Date.now() / 1000 - (d._ts || 0)) < ttlSec) return d;
  return null;
}

function cacheSet(filePath, data) {
  writeJSON(filePath, { ...data, _ts: Date.now() / 1000 });
}

function httpGet(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'wall-e-statusline/1.0' } }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

// ─── Config ───────────────────────────────────────────────────────────────────

function loadConfig() {
  const defaults = {
    city: 'Stockholm', country: 'SE',
    budgets: { daily: 5.00, weekly: 25.00, monthly: 100.00 },
    week_reset_day: 'FRI'
  };
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'config.json'), 'utf8'));
    return { ...defaults, ...cfg, budgets: { ...defaults.budgets, ...(cfg.budgets || {}) } };
  } catch { return defaults; }
}

// ─── Quotes ───────────────────────────────────────────────────────────────────

const QUOTES = [
  ["The impediment to action advances action. What stands in the way becomes the way.", "Marcus Aurelius"],
  ["Waste no more time arguing about what a good man should be. Be one.", "Marcus Aurelius"],
  ["You have power over your mind, not outside events. Realize this, and you will find strength.", "Marcus Aurelius"],
  ["Very little is needed to make a happy life; it is all within yourself, in your way of thinking.", "Marcus Aurelius"],
  ["If it is not right, do not do it; if it is not true, do not say it.", "Marcus Aurelius"],
  ["Begin at once to live, and count each separate day as a separate life.", "Seneca"],
  ["Luck is what happens when preparation meets opportunity.", "Seneca"],
  ["Per aspera ad astra. (Through hardship to the stars)", "Seneca"],
  ["He who has a why to live can bear almost any how.", "Nietzsche"],
  ["The man who moves a mountain begins by carrying away small stones.", "Confucius"],
  ["Stop being a prisoner of your past. Become the architect of your future.", "Robin Sharma"],
  ["Small daily improvements over time lead to stunning results.", "Robin Sharma"],
  ["Victims recite problems. Leaders deliver solutions.", "Robin Sharma"],
  ["World-class performers don't get lucky. They just prepare more than everyone else.", "Robin Sharma"],
  ["The best time to plant a tree was 20 years ago. The second best time is now.", "Chinese Proverb"],
  ["Make something people want.", "Paul Graham"],
  ["It's easier to ask forgiveness than it is to get permission.", "Grace Hopper"],
  ["The only way to do great work is to love what you do.", "Steve Jobs"],
  ["Stay hungry, stay foolish.", "Steve Jobs"],
  ["Innovation distinguishes between a leader and a follower.", "Steve Jobs"],
  ["Your time is limited, so don't waste it living someone else's life.", "Steve Jobs"],
  ["If you're not embarrassed by the first version of your product, you've launched too late.", "Reid Hoffman"],
  ["We are what we repeatedly do. Excellence, then, is not an act, but a habit.", "Aristotle"],
  ["The secret of getting ahead is getting started.", "Mark Twain"],
  ["The future belongs to those who believe in the beauty of their dreams.", "Eleanor Roosevelt"],
  ["It always seems impossible until it's done.", "Nelson Mandela"],
  ["A person who never made a mistake never tried anything new.", "Albert Einstein"],
  ["In the middle of every difficulty lies opportunity.", "Albert Einstein"],
  ["I have not failed. I've just found 10,000 ways that won't work.", "Thomas Edison"],
  ["Programs must be written for people to read, and only incidentally for machines to execute.", "Harold Abelson"],
  ["Any fool can write code that a computer can understand. Good programmers write code that humans can understand.", "Martin Fowler"],
  ["First, solve the problem. Then, write the code.", "John Johnson"],
  ["Code is like humor. When you have to explain it, it's bad.", "Cory House"],
  ["Simplicity is the soul of efficiency.", "Austin Freeman"],
  ["The sooner you start coding, the longer the program will take.", "Roy Carlson"],
  ["If debugging is the process of removing bugs, then programming must be the process of putting them in.", "Edsger Dijkstra"],
  ["I'm not a great programmer; I'm just a good programmer with great habits.", "Kent Beck"],
  ["Talk is cheap. Show me the code.", "Linus Torvalds"],
  ["Premature optimization is the root of all evil.", "Donald Knuth"],
  ["Debugging is twice as hard as writing the code in the first place.", "Brian Kernighan"],
  ["Move fast and break things.", "Mark Zuckerberg"],
  ["The measure of intelligence is the ability to change.", "Albert Einstein"],
  ["Be a yardstick of quality. Some people aren't used to an environment where excellence is expected.", "Steve Jobs"],
  ["Do not pray for easy lives. Pray to be stronger men.", "JFK"],
  ["It is not that I'm so smart, it's just that I stay with problems longer.", "Albert Einstein"],
  ["The best performance improvement is the transition from the nonworking state to the working state.", "John Ousterhout"],
  ["Walking on water and developing software from a spec are easy if both are frozen.", "Edward V. Berard"],
  ["Simplicity is prerequisite for reliability.", "Edsger Dijkstra"],
  ["Measuring programming progress by lines of code is like measuring aircraft building progress by weight.", "Bill Gates"],
  ["The computer was born to solve problems that did not exist before.", "Bill Gates"],
  ["Ship it.", "Unknown"],
];

function getDailyQuote() {
  const idx = Math.floor(Date.now() / 86400000) % QUOTES.length;
  return QUOTES[idx];
}

// ─── Weather ──────────────────────────────────────────────────────────────────

async function getWeather(cfg) {
  const cacheFile = path.join(CACHE_DIR, 'wall-e-weather.json');
  const cached = cacheGet(cacheFile, 600);
  if (cached && cached.temp) return cached;

  try {
    const city = encodeURIComponent(cfg.city || 'Stockholm');
    const body = await httpGet(`https://wttr.in/${city}?format=j1`);
    const d = JSON.parse(body);
    const current = d.current_condition[0];
    const result = { temp: current.temp_C, desc: current.weatherDesc[0].value };
    cacheSet(cacheFile, result);
    return result;
  } catch {
    return { temp: '?', desc: 'unavailable' };
  }
}

// ─── Context bar ──────────────────────────────────────────────────────────────

function getContextInfo(payload) {
  const cw = payload.context_window || {};
  const remaining = cw.remaining_percentage;

  // Always return a bar — show 0% if no payload
  if (remaining == null) {
    return { usedPct: 0 };
  }

  const rawUsed = 100 - remaining;
  // 16.5% autocompact buffer normalization
  const usedPct = Math.max(0, Math.min(100, Math.round(rawUsed / (1 - 0.165))));
  return { usedPct };
}

function ctxColor(pct) {
  if (pct >= 90) return '\x1b[38;5;196m';  // red
  if (pct >= 75) return '\x1b[38;5;208m';  // orange
  if (pct >= 50) return '\x1b[38;5;226m';  // yellow
  return '\x1b[38;5;82m';                  // green
}

function buildContextBar(pct) {
  const filled = Math.round(Math.min(100, Math.max(0, pct)) / 100 * 20);
  const color = ctxColor(pct);
  return color + '█'.repeat(filled) + ' '.repeat(20 - filled) + RESET;
}

// ─── Cost Tracker ─────────────────────────────────────────────────────────────

function getCostInfo(cfg) {
  const d = readJSON(path.join(CACHE_DIR, 'wall-e-tokens.json'));
  if (!d) return null;

  const todayCost     = d.today         || 0;
  const monthCost     = d.month         || 0;
  const totalCost     = d.total         || 0;
  const todayTokens   = d.todayTokens   || 0;
  const monthTokens   = d.monthTokens   || 0;
  const totalTokens   = d.totalTokens   || 0;
  const lastMonthCost = d.lastMonthCost  || 0;
  const lastMonthTok  = d.lastMonthTokens || 0;

  const now = new Date();
  const hoursSinceMidnight = Math.max(0.01, now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600);
  const hourlyBurn = todayCost / hoursSinceMidnight;

  const daysElapsed = Math.max(1, now.getDate());
  const weekCost = (monthCost / daysElapsed) * 7;

  const ratio = totalCost > 0 ? Math.round(totalTokens / totalCost) : null;

  return { todayCost, monthCost, totalCost, todayTokens, monthTokens, totalTokens,
           lastMonthCost, lastMonthTok, hourlyBurn, weekCost, ratio };
}

// ─── Claude Info ──────────────────────────────────────────────────────────────

function getCCVersion() {
  const cacheFile = path.join(CACHE_DIR, 'wall-e-cc-version.json');
  const cached = cacheGet(cacheFile, 3600);
  if (cached && cached.version) return cached.version;

  try {
    const r = spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 5000 });
    let ver = (r.stdout || '').trim().split('\n')[0].trim();
    const match = ver.match(/(\d+\.\d+[\.\d]*)/);
    if (match) ver = match[1];
    cacheSet(cacheFile, { version: ver });
    return ver;
  } catch { return '?'; }
}

function countHooks(settings) {
  let count = 0;
  for (const event of Object.values(settings.hooks || {})) {
    if (Array.isArray(event)) {
      for (const group of event) {
        if (group && Array.isArray(group.hooks)) count += group.hooks.length;
      }
    }
  }
  return count;
}

function countDir(dirPath, ext) {
  try {
    const entries = fs.readdirSync(dirPath);
    return ext ? entries.filter(e => e.endsWith(ext)).length : entries.length;
  } catch { return 0; }
}

function getClaudeInfo(payload, cwd) {
  const settings = readJSON(path.join(CLAUDE_DIR, 'settings.json')) || {};

  const model = mapModelName((payload.model || {}).display_name || process.env.CLAUDE_MODEL || '');

  const cw    = payload.context_window || {};
  const total = (cw.tokens_remaining || 0) + (cw.tokens_used || 0);
  const ctxLabel = total > 0 ? `${Math.round(total / 1000)}K` : '200K';

  const ccVersion = getCCVersion();
  const hooks     = countHooks(settings);
  const skills    = countDir(path.join(CLAUDE_DIR, 'skills'));
  const agents    = countDir(path.join(CLAUDE_DIR, 'agents'), '.md');
  const workflows = countDir(path.join(CLAUDE_DIR, 'commands'));
  const mcpGlobal = Object.keys(settings.mcpServers || {}).length;

  let mcpLocal = 0;
  try {
    const ls = readJSON(path.join(cwd, '.claude', 'settings.json')) || {};
    mcpLocal = Object.keys(ls.mcpServers || {}).length;
  } catch {}

  const plugins = (settings.plugins || []).length;

  return { model, ctxLabel, ccVersion, hooks, skills, agents, workflows, mcpGlobal, mcpLocal, plugins };
}

// ─── Git Info ─────────────────────────────────────────────────────────────────

function getGitInfo(cwd) {
  const dirname = path.basename(cwd);
  const base = { branch: '--', age: 0, newFiles: 0, dirname };

  function git(...args) {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 3000 });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  }

  try {
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    let age = 0;
    try {
      const ts = parseInt(git('log', '--reverse', '--format=%at', '--max-count=1'), 10);
      age = Math.floor((Date.now() / 1000 - ts) / 86400);
    } catch {}
    let newFiles = 0;
    try {
      const status = git('status', '--short');
      newFiles = status.split('\n').filter(l => l.startsWith('??')).length;
    } catch {}
    return { branch, age, newFiles, dirname };
  } catch { return base; }
}

// ─── Read stdin ───────────────────────────────────────────────────────────────

function readStdin() {
  return new Promise(resolve => {
    let input = '';
    const timer = setTimeout(() => resolve({}), 3000);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => input += c);
    process.stdin.on('end', () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(input)); } catch { resolve({}); }
    });
    process.stdin.on('error', () => { clearTimeout(timer); resolve({}); });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const payload = await readStdin();
  const cfg     = loadConfig();
  const cwd     = (payload.workspace || {}).current_dir || process.cwd();

  const [wx, cl, git, costs, ctx, [quoteText, quoteAuthor]] = await Promise.all([
    getWeather(cfg).catch(() => ({ temp: '?', desc: 'unavailable' })),
    Promise.resolve(getClaudeInfo(payload, cwd)),
    Promise.resolve(getGitInfo(cwd)),
    Promise.resolve(getCostInfo(cfg)),
    Promise.resolve(getContextInfo(payload)),
    Promise.resolve(getDailyQuote()),
  ]);

  const now     = new Date();
  const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const lines   = [];

  // ── Title: — | wall-e STATUSLINE |
  lines.push(
    `  ` + DIM_GRAY + `—` + RESET + ` ` + DIM_GRAY + `|` + RESET + ` ` +
    BOLD + BRAND_CYAN + `wall-e` + RESET + ` ` +
    BOLD + BRIGHT_WHITE + `STATUSLINE` + RESET + ` ` +
    DIM_GRAY + `|` + RESET
  );

  // ── LOC row
  lines.push(
    lbl('LOC:') + ` ` + BOLD + BRIGHT_WHITE + cfg.city + ', ' + cfg.country + RESET +
    ` ` + DIM_GRAY + `|` + RESET + ` ` + PLAIN_WHITE + timeStr + RESET +
    ` ` + DIM_GRAY + `|` + RESET + ` ` + WEATHER_WHITE + wx.temp + `°C ` + wx.desc + RESET
  );

  // ── ENV row
  lines.push(
    lbl('ENV:') + ` ` + BRAND_CYAN + cl.model + ` (` + cl.ctxLabel + `)` + RESET +
    pipe() + lbl('CC: ') + val(cl.ccVersion) +
    pipe() + lbl('SK: ') + val(String(cl.skills)) +
    pipe() + lbl('WF: ') + val(String(cl.workflows)) +
    pipe() + lbl('Hooks: ') + val(String(cl.hooks))
  );

  // ── CONTEXT row  ● purple
  lines.push('');
  lines.push(
    PURPLE + `●` + RESET + ` ` + lbl('CONTEXT:') + ` ` +
    DIM_GRAY + `[` + RESET + buildContextBar(ctx.usedPct) + DIM_GRAY + `]` + RESET + ` ` +
    ctxColor(ctx.usedPct) + `[` + ctx.usedPct + `%]` + RESET
  );

  lines.push('');

  // ── USAGE row  ◆ amber
  if (costs) {
    const { daily = 5, weekly = 25 } = cfg.budgets;
    const dailyPct  = daily  ? Math.min(999, Math.floor(costs.todayCost / daily  * 100)) : 0;
    const weeklyPct = weekly ? Math.min(999, Math.floor(costs.weekCost  / weekly * 100)) : 0;
    // Next hourly reset: top of next hour
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    const hReset = `↻ ${String(nextHour.getHours()).padStart(2,'0')}:00`;

    // Next weekly reset: next occurrence of configured reset day at 00:00
    const RESET_DAY_MAP = { SUN:0, MON:1, TUE:2, WED:3, THU:4, FRI:5, SAT:6 };
    const DAY_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const resetDayNum = RESET_DAY_MAP[(cfg.week_reset_day || 'FRI').toUpperCase()] ?? 5;
    const todayDayNum = now.getDay();
    let daysUntil = (resetDayNum - todayDayNum + 7) % 7;
    if (daysUntil === 0) daysUntil = 7;
    const wReset = `↻ ${DAY_ABBR[resetDayNum]} 00:00`;

    lines.push(
      AMBER + `◆` + RESET + ` ` + lbl('USAGE: ') +
      lbl('5H: ') + YELLOW_GREEN + dailyPct + `%` + RESET +
      ` ` + DIM_GRAY + hReset + RESET +
      pipe() + lbl('WK: ') + YELLOW_GREEN + weeklyPct + `%` + RESET +
      ` ` + DIM_GRAY + wReset + RESET
    );
  } else {
    lines.push(`${AMBER}◆${RESET} ${lbl('USAGE:')} ${LABEL_GRAY}no data${RESET}`);
  }

  lines.push('');

  // ── PWD + git row  ◆ light cyan
  lines.push(
    LIGHT_CYAN + `◆` + RESET + ` ` + lbl('PWD: ') + val(git.dirname, BRAND_CYAN) +
    pipe() + lbl('Branch: ') + val(git.branch) +
    pipe() + lbl('Age: ')    + val(git.age + 'd') +
    pipe() + lbl('New: ')    + val(String(git.newFiles))
  );

  // ── Build costs lines first so we can measure their width for quote wrapping
  let tokensLine = null;
  let costsLine  = null;
  if (costs) {
    const ratioStr = costs.ratio ? costs.ratio.toLocaleString() : '--';
    tokensLine =
      YELLOW_GREEN + 'TOKENS:' + RESET + ` ` +
      lbl('Today: ')    + val(costs.todayTokens.toLocaleString()) +
      pipe() + lbl('Month: ')   + val(costs.monthTokens.toLocaleString()) +
      pipe() + lbl('Last Mo: ') + val(costs.lastMonthTok.toLocaleString()) +
      pipe() + lbl('Total: ')   + val(costs.totalTokens.toLocaleString());
    costsLine =
      YELLOW_GREEN + 'COSTS: ' + RESET + ` ` +
      lbl('Today: ')    + YELLOW_GREEN + `$` + costs.todayCost.toFixed(2) + RESET +
      pipe() + lbl('Month: ')   + YELLOW_GREEN + `$` + costs.monthCost.toFixed(2) + RESET +
      pipe() + lbl('Last Mo: ') + YELLOW_GREEN + `$` + costs.lastMonthCost.toFixed(2) + RESET +
      pipe() + lbl('Ratio: ')   + val(ratioStr) +
      pipe() + lbl('Total: ')   + YELLOW_GREEN + `$` + costs.totalCost.toFixed(2) + RESET;
  }

  lines.push('');

  // ── Quote row  ◆ amber  (wraps to fit within COSTS line width)
  const quoteMaxWidth = costsLine ? visLen(costsLine) : 41;
  for (const ql of wrapQuote(quoteText, quoteAuthor, quoteMaxWidth)) lines.push(ql);

  lines.push('');

  // ── Plugins row  ● purple
  const mcpTotal = cl.mcpGlobal + cl.mcpLocal;
  lines.push(
    PURPLE  + `●` + RESET + ` ` + lbl('Plugins: ') + val(String(cl.plugins)) +
    `  ` + SKL_CYAN + `◆` + RESET + ` ` + lbl('Skills: ')  + val(String(cl.skills)) +
    `  ` + AMBER    + `○` + RESET + ` ` + lbl('Agents: ')  + val(String(cl.agents)) +
    `  ` + SKL_CYAN + `○` + RESET + ` ` + lbl('MCPs: ')    + val(String(mcpTotal)) +
    ` ` + DIM_GRAY + `(G:${cl.mcpGlobal} L:${cl.mcpLocal})` + RESET
  );

  // ── Tokens + costs detail
  if (tokensLine) lines.push(tokensLine);
  if (costsLine)  lines.push(costsLine);

  // ── Measure content width and wrap with matching separators
  const maxWidth = Math.max(...lines.map(l => visLen(l)));
  const s = sep(maxWidth);
  const output = [s, ...lines, s];

  process.stdout.write(output.join('\n') + '\n');
  process.exit(0);
}

main().catch(() => process.exit(0));
