"""Read wall-e-tokens.json and compute cost/budget info."""
import json
from pathlib import Path
from datetime import datetime

TOKENS_FILE = Path.home() / '.claude' / 'cache' / 'wall-e-tokens.json'

def get_cost_info(cfg: dict) -> dict | None:
    try:
        with open(TOKENS_FILE) as f:
            d = json.load(f)
    except:
        return None

    today_cost = d.get('today', 0) or 0
    month_cost = d.get('month', 0) or 0
    total_cost = d.get('total', 0) or 0
    today_tokens = d.get('todayTokens', 0) or 0
    month_tokens = d.get('monthTokens', 0) or 0
    total_tokens = d.get('totalTokens', 0) or 0

    now = datetime.now()
    hours_since_midnight = now.hour + now.minute / 60 + now.second / 3600
    hours_since_midnight = max(0.01, hours_since_midnight)
    hourly_burn = today_cost / hours_since_midnight

    day_of_month = now.day
    days_elapsed = max(1, day_of_month)
    daily_avg = month_cost / days_elapsed
    week_cost = daily_avg * 7

    last_month_cost = d.get('lastMonth', 0) or 0

    ratio = (total_tokens / total_cost) if total_cost > 0 else None

    return {
        'today_cost': today_cost,
        'month_cost': month_cost,
        'total_cost': total_cost,
        'today_tokens': today_tokens,
        'month_tokens': month_tokens,
        'total_tokens': total_tokens,
        'hourly_burn': hourly_burn,
        'week_cost': week_cost,
        'last_month_cost': last_month_cost,
        'ratio': ratio,
    }
