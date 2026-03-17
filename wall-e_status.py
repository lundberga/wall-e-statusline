#!/usr/bin/env python3
"""wall-e STATUSLINE — entry point"""
import sys, json, threading, os
from pathlib import Path
from datetime import datetime

# Ensure UTF-8 output on Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ANSI colors
GREEN  = '\x1b[32m'
YELLOW = '\x1b[33m'
ORANGE = '\x1b[38;5;208m'
RED    = '\x1b[5;31m'
RESET  = '\x1b[0m'
DIM    = '\x1b[2m'
BOLD   = '\x1b[1m'
CYAN   = '\x1b[36m'
BLUE   = '\x1b[34m'

BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / 'config.json'

def read_stdin_payload() -> dict:
    result = {}
    def target():
        try:
            result['d'] = json.loads(sys.stdin.read())
        except:
            pass
    t = threading.Thread(target=target, daemon=True)
    t.start()
    t.join(timeout=3.0)
    return result.get('d', {})

def load_config() -> dict:
    defaults = {
        "city": "Stockholm",
        "country": "SE",
        "budgets": {"daily": 5.00, "weekly": 25.00, "monthly": 100.00},
        "week_reset_day": "FRI"
    }
    try:
        with open(CONFIG_PATH) as f:
            cfg = json.load(f)
        for k, v in defaults.items():
            if k not in cfg:
                cfg[k] = v
        return cfg
    except:
        return defaults

def pct_color(pct: float) -> str:
    if pct >= 90: return RED
    if pct >= 75: return ORANGE
    if pct >= 50: return YELLOW
    return GREEN

def main():
    sys.path.insert(0, str(BASE_DIR))

    payload = read_stdin_payload()
    cfg = load_config()
    cwd = payload.get('workspace', {}).get('current_dir', os.getcwd())

    from modules.weather import get_weather, get_location
    from modules.context import get_context_info
    from modules.cost_tracker import get_cost_info
    from modules.claude_info import get_claude_info
    from modules.git_info import get_git_info
    from modules.quotes import get_daily_quote

    try:
        loc = get_location(cfg)
    except:
        loc = {'city': cfg.get('city', '?'), 'country': cfg.get('country', '??')}

    try:
        wx = get_weather(cfg)
    except:
        wx = {'temp': '?', 'desc': 'unknown'}

    try:
        ctx = get_context_info(payload)
    except:
        ctx = None

    try:
        costs = get_cost_info(cfg)
    except:
        costs = None

    try:
        cl = get_claude_info(payload, cwd)
    except:
        cl = {}

    try:
        git = get_git_info(cwd)
    except:
        git = {'branch': '--', 'age': 0, 'new': 0, 'dirname': Path(cwd).name}

    try:
        quote_text, quote_author = get_daily_quote()
    except:
        quote_text, quote_author = "Ship it.", "Unknown"

    now = datetime.now()
    time_str = now.strftime('%H:%M')

    lines = []

    # Row 1: Header
    lines.append(f"{BOLD}{CYAN}wall-e STATUSLINE{RESET}")

    # Row 2: Location + time + weather
    temp = wx.get('temp', '?')
    desc = wx.get('desc', '')
    city = loc.get('city', cfg['city'])
    country = loc.get('country', cfg.get('country', '??'))
    lines.append(f"{DIM}LOC:{RESET} {city}, {country} | {time_str} | {temp}°C {desc}")

    # Row 3: ENV info
    model = cl.get('model', payload.get('model', {}).get('display_name', os.environ.get('CLAUDE_MODEL', 'unknown')))
    ctx_label = cl.get('ctx_label', '?K')
    cc_ver = cl.get('cc_version', '?')
    skills = cl.get('skills', 0)
    workflows = cl.get('workflows', 0)
    hooks = cl.get('hooks', 0)
    lines.append(f"{DIM}ENV:{RESET} {model} ({ctx_label} context) | CC: {cc_ver} | SK: {skills} | WF: {workflows} | Hooks: {hooks}")

    lines.append("")

    # Row 4: Context bar
    if ctx:
        used = ctx['used_pct']
        bar = ctx['bar']
        color = pct_color(used)
        lines.append(f"◆ {DIM}CONTEXT:{RESET} [{color}{bar}{RESET}] [{color}{used}%{RESET}]")
    else:
        lines.append(f"◆ {DIM}CONTEXT:{RESET} {DIM}no payload{RESET}")

    # Row 5: Usage/costs
    if costs:
        daily_budget = cfg['budgets']['daily']
        weekly_budget = cfg['budgets']['weekly']

        today_cost = costs.get('today_cost', 0)
        week_cost = costs.get('week_cost', 0)
        hourly_burn = costs.get('hourly_burn', 0)

        daily_pct = min(999, int(today_cost / daily_budget * 100)) if daily_budget else 0
        weekly_pct = min(999, int(week_cost / weekly_budget * 100)) if weekly_budget else 0

        week_reset = cfg.get('week_reset_day', 'FRI')

        daily_color = pct_color(daily_pct)
        weekly_color = pct_color(weekly_pct)

        lines.append(
            f"◆ {DIM}USAGE:{RESET} "
            f"$H: {daily_color}{daily_pct}%{RESET} (${hourly_burn:.2f}/hr) | "
            f"WK: {weekly_color}{weekly_pct}%{RESET} | "
            f"${week_reset}: ${week_cost:.2f}"
        )
    else:
        lines.append(f"◆ {DIM}USAGE:{RESET} {DIM}no data{RESET}")

    # Row 6: PWD + git
    dirname = git.get('dirname', Path(cwd).name)
    branch = git.get('branch', '--')
    age = git.get('age', 0)
    new_files = git.get('new', 0)
    lines.append(f"◆ {DIM}PWD:{RESET} {dirname} | Branch: {branch} | Age: {age}d | New: {new_files}")

    # Row 7: Quote
    lines.append(f'◆ {DIM}"{quote_text}"{RESET} — {CYAN}{quote_author}{RESET}')

    # Row 8: Plugins/agents/MCPs
    plugins = cl.get('plugins', 0)
    agents = cl.get('agents', 0)
    mcp_global = cl.get('mcp_global', 0)
    mcp_local = cl.get('mcp_local', 0)
    mcp_total = mcp_global + mcp_local
    lines.append(f"◆ {DIM}Plugins:{RESET} {plugins} | {DIM}Skills:{RESET} {skills} | {DIM}Agents:{RESET} {agents} | {DIM}MCPs:{RESET} {mcp_total} (G:{mcp_global} L:{mcp_local})")

    # Tokens + costs detail
    if costs:
        today_tok = costs.get('today_tokens', 0)
        month_tok = costs.get('month_tokens', 0)
        today_cost = costs.get('today_cost', 0)
        month_cost = costs.get('month_cost', 0)
        last_mo_cost = costs.get('last_month_cost', 0)
        total_cost = costs.get('total_cost', 0)
        ratio = costs.get('ratio', None)
        ratio_str = f"{int(ratio):,}" if ratio else '--'

        lines.append(f"   {DIM}TOKENS:{RESET} Today: {today_tok:,} | Monthly: {month_tok:,}")
        lines.append(f"   {DIM}COSTS:{RESET}  Today: ${today_cost:.2f} | Month: ${month_cost:.2f} | Last Mo: {last_mo_cost} | Ratio: {ratio_str} | Total: ${total_cost:.2f}")

    print('\n'.join(lines))
    sys.exit(0)

if __name__ == '__main__':
    main()
