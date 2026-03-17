"""Git repository info."""
import subprocess
from pathlib import Path
from datetime import datetime

def _run_git(args: list, cwd: str) -> str:
    r = subprocess.run(
        ['git'] + args, cwd=cwd,
        capture_output=True, text=True, timeout=3
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    return r.stdout.strip()

def get_git_info(cwd: str) -> dict:
    dirname = Path(cwd).name
    base = {'branch': '--', 'age': 0, 'new': 0, 'dirname': dirname}

    try:
        branch = _run_git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
    except:
        return base

    try:
        ts_str = _run_git(['log', '--reverse', '--format=%at', '--max-count=1'], cwd)
        first_ts = int(ts_str)
        age_days = int((datetime.now().timestamp() - first_ts) / 86400)
    except:
        age_days = 0

    try:
        status = _run_git(['status', '--short'], cwd)
        new_files = sum(1 for line in status.splitlines() if line.startswith('??'))
    except:
        new_files = 0

    return {
        'branch': branch,
        'age': age_days,
        'new': new_files,
        'dirname': dirname,
    }
