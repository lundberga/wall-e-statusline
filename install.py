#!/usr/bin/env python3
"""Install wall-e STATUSLINE — patches ~/.claude/settings.json."""
import sys, json, subprocess
from pathlib import Path

MIN_PYTHON = (3, 7)
BASE_DIR = Path(__file__).parent.resolve()
CLAUDE_SETTINGS = Path.home() / '.claude' / 'settings.json'
STATUS_CMD = f'node "{BASE_DIR / "wall-e_status.js"}"'.replace('\\', '/')

def check_python():
    if sys.version_info < MIN_PYTHON:
        print(f"ERROR: Python {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+ required (got {sys.version})")
        sys.exit(1)
    print(f"✓ Python {sys.version.split()[0]}")

def create_config():
    config_path = BASE_DIR / 'config.json'
    if not config_path.exists():
        config = {
            "city": "Stockholm",
            "country": "SE",
            "budgets": {"daily": 5.00, "weekly": 25.00, "monthly": 100.00},
            "week_reset_day": "FRI"
        }
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
        print(f"✓ Created config.json")
    else:
        print(f"✓ config.json exists")

def patch_settings():
    try:
        with open(CLAUDE_SETTINGS) as f:
            settings = json.load(f)
    except FileNotFoundError:
        settings = {}
    except json.JSONDecodeError as e:
        print(f"ERROR: Could not parse {CLAUDE_SETTINGS}: {e}")
        sys.exit(1)

    old_cmd = settings.get('statusCommand')
    settings['statusCommand'] = STATUS_CMD

    with open(CLAUDE_SETTINGS, 'w') as f:
        json.dump(settings, f, indent=2)

    if old_cmd:
        print(f"✓ Updated statusCommand (was: {old_cmd[:60]}...)" if len(str(old_cmd)) > 60 else f"✓ Updated statusCommand")
    else:
        print(f"✓ Added statusCommand to settings.json")
    print(f"  → {STATUS_CMD}")

def init_git():
    git_dir = BASE_DIR / '.git'
    if git_dir.exists():
        print(f"✓ Git repo already initialized")
        return

    try:
        subprocess.run(['git', 'init'], cwd=BASE_DIR, check=True, capture_output=True)
        print(f"✓ Initialized git repo at {BASE_DIR}")
    except subprocess.CalledProcessError as e:
        print(f"WARNING: git init failed: {e}")

def create_gitignore():
    gi_path = BASE_DIR / '.gitignore'
    if not gi_path.exists():
        content = """__pycache__/
*.pyc
*.json.bak
.env
config.local.json
"""
        with open(gi_path, 'w') as f:
            f.write(content)
        print(f"✓ Created .gitignore")

def main():
    print("=== wall-e STATUSLINE INSTALLER ===\n")
    check_python()
    create_config()
    patch_settings()
    init_git()
    create_gitignore()
    print("\n=== DONE ===")
    print("Restart Claude Code to activate the statusline.")
    print(f"\nTest with:")
    print(f'  echo \'{{"model":{{"display_name":"claude-sonnet-4-6"}},"context_window":{{"remaining_percentage":62}}}}\' | node "{BASE_DIR / "wall-e_status.js"}"')

if __name__ == '__main__':
    main()
