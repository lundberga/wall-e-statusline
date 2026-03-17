"""Parse context window info from payload."""

def get_context_info(payload: dict) -> dict | None:
    cw = payload.get('context_window', {})
    if not cw:
        return None

    remaining_pct = cw.get('remaining_percentage')
    if remaining_pct is None:
        return None

    # Apply 16.5% autocompact buffer normalization
    raw_used = 100 - remaining_pct
    normalized_used = max(0, min(100, int(raw_used / (1 - 0.165))))

    segments = 20
    filled = min(segments, normalized_used // 5)
    bar = '█' * filled + '░' * (segments - filled)

    return {'used_pct': normalized_used, 'bar': bar}
