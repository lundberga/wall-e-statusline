"""Weather via wttr.in with caching."""
import json, time
from pathlib import Path
try:
    from urllib.request import urlopen, Request
    from urllib.error import URLError
except ImportError:
    pass

CACHE_DIR = Path.home() / '.claude' / 'cache'
WEATHER_CACHE = CACHE_DIR / 'wall-e-weather.json'
LOCATION_CACHE = CACHE_DIR / 'wall-e-location.json'

def _read_cache(path: Path, ttl: int) -> dict | None:
    try:
        with open(path) as f:
            d = json.load(f)
        if time.time() - d.get('_ts', 0) < ttl:
            return d
    except:
        pass
    return None

def _write_cache(path: Path, data: dict):
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        data['_ts'] = time.time()
        with open(path, 'w') as f:
            json.dump(data, f)
    except:
        pass

def get_location(cfg: dict) -> dict:
    if cfg.get('city') and cfg.get('country'):
        return {'city': cfg['city'], 'country': cfg['country']}

    cached = _read_cache(LOCATION_CACHE, 3600)
    if cached:
        return cached

    try:
        req = Request('https://ipinfo.io/json', headers={'User-Agent': 'wall-e-statusline/1.0'})
        with urlopen(req, timeout=8) as r:
            d = json.loads(r.read())
        result = {'city': d.get('city', 'Unknown'), 'country': d.get('country', '??')}
        _write_cache(LOCATION_CACHE, result)
        return result
    except:
        return {'city': cfg.get('city', 'Unknown'), 'country': cfg.get('country', '??')}

def get_weather(cfg: dict) -> dict:
    cached = _read_cache(WEATHER_CACHE, 600)
    if cached and 'temp' in cached:
        return cached

    city = cfg.get('city', 'Stockholm')
    url = f'https://wttr.in/{city}?format=j1'

    try:
        req = Request(url, headers={'User-Agent': 'wall-e-statusline/1.0'})
        with urlopen(req, timeout=8) as r:
            d = json.loads(r.read())

        current = d['current_condition'][0]
        temp = int(current['temp_C'])
        desc = current['weatherDesc'][0]['value']
        result = {'temp': str(temp), 'desc': desc}
        _write_cache(WEATHER_CACHE, result)
        return result
    except:
        return {'temp': '?', 'desc': 'unavailable'}
