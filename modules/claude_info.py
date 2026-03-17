"""Claude Code environment info."""
import json, subprocess, os, time
from pathlib import Path

CLAUDE_DIR = Path.home() / '.claude'
CC_VER_CACHE = CLAUDE_DIR / 'cache' / 'wall-e-cc-version.json'

def _get_cc_version() -> str:
    try:
        with open(CC_VER_CACHE) as f:
            d = json.load(f)
        if time.time() - d.get('_ts', 0) < 3600:
            return d.get('version', '?')
    except:
        pass

    try:
        r = subprocess.run(['claude', '--version'], capture_output=True, text=True, timeout=5)
        ver = r.stdout.strip().split('\n')[0].strip()
        for part in ver.split():
            if part and part[0].isdigit():
                ver = part
                break

        try:
            (CLAUDE_DIR / 'cache').mkdir(parents=True, exist_ok=True)
            with open(CC_VER_CACHE, 'w') as f:
                json.dump({'version': ver, '_ts': time.time()}, f)
        except:
            pass
        return ver
    except:
        return '?'

def _count_hooks(settings: dict) -> int:
    count = 0
    hooks_section = settings.get('hooks', {})
    for event_hooks in hooks_section.values():
        if isinstance(event_hooks, list):
            for hook_group in event_hooks:
                if isinstance(hook_group, dict):
                    for h in hook_group.get('hooks', []):
                        count += 1
    return count

def _count_mcp_global(settings: dict) -> int:
    return len(settings.get('mcpServers', {}))

def _count_mcp_local(cwd: str) -> int:
    try:
        local_settings = Path(cwd) / '.claude' / 'settings.json'
        with open(local_settings) as f:
            d = json.load(f)
        return len(d.get('mcpServers', {}))
    except:
        return 0

def get_claude_info(payload: dict, cwd: str) -> dict:
    settings = {}
    try:
        with open(CLAUDE_DIR / 'settings.json') as f:
            settings = json.load(f)
    except:
        pass

    model = payload.get('model', {}).get('display_name') or os.environ.get('CLAUDE_MODEL', 'unknown')

    cw = payload.get('context_window', {})
    total = cw.get('tokens_remaining', 0) + cw.get('tokens_used', 0)
    if total == 0:
        if '200k' in model.lower() or 'claude' in model.lower():
            total = 200000
    ctx_label = f"{total // 1000}K" if total > 0 else '?K'

    cc_version = _get_cc_version()
    hooks = _count_hooks(settings)

    skills_dir = CLAUDE_DIR / 'skills'
    skills = len(list(skills_dir.iterdir())) if skills_dir.exists() else 0

    agents_dir = CLAUDE_DIR / 'agents'
    agents = len(list(agents_dir.glob('*.md'))) if agents_dir.exists() else 0

    commands_dir = CLAUDE_DIR / 'commands'
    workflows = len(list(commands_dir.iterdir())) if commands_dir.exists() else 0

    mcp_global = _count_mcp_global(settings)
    mcp_local = _count_mcp_local(cwd)

    plugins = len(settings.get('plugins', []))

    return {
        'model': model,
        'ctx_label': ctx_label,
        'cc_version': cc_version,
        'hooks': hooks,
        'skills': skills,
        'agents': agents,
        'workflows': workflows,
        'mcp_global': mcp_global,
        'mcp_local': mcp_local,
        'plugins': plugins,
    }
