# wall-e STATUSLINE

A live status panel that renders at the bottom of every Claude Code response. Shows context usage, API costs, weather, git state, and environment info at a glance.

```
  — | wall-e STATUSLINE |
LOC: Stockholm, SE | 17:27 | 7°C Sunny
ENV: claude-sonnet-4-6 (200K) | CC: 2.1.77 | SK: 7 | WF: 1 | Hooks: 5

● CONTEXT: [████████████        ] [61%]

◆ USAGE:  5H: 109% ↻ 18:00 | WK: 9% ↻ Fri 00:00

◆ PWD: my-project | Branch: main | Age: 2d | New: 3

◆ "Ship it." — Unknown

● Plugins: 0  ◆ Skills: 7  ○ Agents: 19  ○ MCPs: 0 (G:0 L:0)
TOKENS: Today: 11,938,423 | Month: 11,938,423 | Last Mo: 0 | Total: 11,938,423
COSTS:  Today: $5.48 | Month: $5.48 | Last Mo: $0.00 | Ratio: 2,178,166 | Total: $5.48
```

## Requirements

- [Claude Code](https://claude.ai/code) v2.x+
- Node.js 18+

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/lundberga/wall-e-statusline/master/install.sh | bash
```

The installer clones the repo to `~/.claude/wall-e-statusline/` and writes the `statusLine` entry in `~/.claude/settings.json`. Restart Claude Code to activate.

### Manual installation

```bash
git clone https://github.com/lundberga/wall-e-statusline.git ~/.claude/wall-e-statusline
```

Add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"/Users/you/.claude/wall-e-statusline/wall-e_status.js\""
  }
}
```

## Configuration

Edit `~/.claude/wall-e-statusline/config.json`:

```json
{
  "city": "Stockholm",
  "country": "SE",
  "budgets": {
    "daily": 5.00,
    "weekly": 25.00,
    "monthly": 100.00
  },
  "week_reset_day": "FRI"
}
```

| Field | Description |
|-------|-------------|
| `city` | City name for weather lookup |
| `country` | Two-letter country code (display only) |
| `budgets.daily` | Daily spend budget in USD |
| `budgets.weekly` | Weekly spend budget in USD |
| `budgets.monthly` | Monthly spend budget in USD |
| `week_reset_day` | Day the weekly budget resets (`MON`–`SUN`) |

## What each row shows

| Row | Contents |
|-----|----------|
| **LOC** | City, country, current time, temperature and weather description |
| **ENV** | Model name, context window size, Claude Code version, Skills / Workflows / Hooks counts |
| **CONTEXT** | Visual bar + percentage of context window used (normalized for autocompact buffer) |
| **USAGE** | Daily budget % with next hourly reset, weekly budget % with next weekly reset |
| **PWD** | Current project directory, git branch, repo age in days, untracked file count |
| **Quote** | Daily rotating motivational quote |
| **Plugins row** | Plugins, Skills, Agents, and MCP server counts (global + local) |
| **TOKENS / COSTS** | Token and dollar breakdown for today, this month, last month, and all time |

## Token tracking

Cost data is collected by a separate `Stop` hook — `kite-token-tracker.js` — which scans the session JSONL for assistant messages with usage data and writes `~/.claude/cache/wall-e-tokens.json`. The statusline reads from that cache file; it does not call the API itself.

## Caching

All external calls are cached to keep the statusline fast:

| Cache file | TTL | Source |
|------------|-----|--------|
| `wall-e-weather.json` | 10 min | wttr.in |
| `wall-e-cc-version.json` | 1 hr | `claude --version` |
| `wall-e-tokens.json` | written by hook | session JSONL |

## Files

```
wall-e-statusline/
├── wall-e_status.js   # Main entry point (Node.js) — used by statusLine hook
├── wall-e_status.py   # Python entry point (legacy/fallback)
├── config.json        # User configuration
├── install.sh         # One-line installer (bash)
├── install.py         # One-line installer (Python fallback)
├── test.js            # Manual test runner
└── modules/           # Python module implementations
    ├── weather.py
    ├── cost_tracker.py
    ├── claude_info.py
    ├── context.py
    ├── git_info.py
    └── quotes.py
```
