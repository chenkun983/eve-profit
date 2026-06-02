"""CEVE-Market API 市场价格查询"""
import requests
import time
import xml.etree.ElementTree as ET
import concurrent.futures

BASE_URL = "https://www.ceve-market.org/api"


class MarketAPI:
    def __init__(self, cache_ttl: int = 300):
        self.cache_ttl = cache_ttl
        self._cache = {}

    def get_prices_batch(self, type_ids: list, system_id: int = 30000142) -> dict:
        result = {}
        for i in range(0, len(type_ids), 100):
            batch = type_ids[i:i + 100]
            try:
                params = [('typeid', tid) for tid in batch]
                params.append(('usesystem', system_id))
                resp = requests.get(f"{BASE_URL}/marketstat", params=params, timeout=30)
                if resp.status_code == 200:
                    root = ET.fromstring(resp.text)
                    for mstat in root.findall('.//type'):
                        tid = int(mstat.attrib['id'])

                        def _ext(el_name):
                            el = mstat.find(el_name)
                            if el is None:
                                return 0.0, 0, 0.0, 0.0
                            med = float(el.find('median').text) if el.find('median') is not None else 0.0
                            vol = int(el.find('volume').text) if el.find('volume') is not None else 0
                            mn = float(el.find('min').text) if el.find('min') is not None else 0.0
                            mx = float(el.find('max').text) if el.find('max') is not None else 0.0
                            return med, vol, mn, mx

                        buy_p, buy_v, buy_min, buy_max = _ext('buy')
                        sell_p, sell_v, sell_min, sell_max = _ext('sell')
                        result[tid] = {
                            'buy': buy_p, 'sell': sell_p,
                            'buy_volume': buy_v, 'sell_volume': sell_v,
                            'buy_max': buy_max, 'sell_min': sell_min,
                        }
            except Exception:
                pass
        return result

    def get_market_quote(self, type_id: int, system_id: int = 30000142) -> dict | None:
        """多时段去极值加权均价（quicklook + sethours）"""
        cached = self._cache.get(type_id)
        if cached and time.time() - cached['ts'] < self.cache_ttl:
            return cached['data']

        result = {}
        windows = {'24h': 24, '3d': 72, '7d': 168, '30d': 720, '90d': 2160}

        def _ql(hours):
            """拉 quicklook + 去极值"""
            try:
                resp = requests.get(f"{BASE_URL}/quicklook",
                    params={'typeid': type_id, 'usesystem': system_id, 'sethours': hours},
                    timeout=15)
                if resp.status_code != 200:
                    return None
                root = ET.fromstring(resp.text)
                ql = root.find('.//quicklook')
                if ql is None:
                    return None

                orders = []
                for tag in ('buy_orders', 'sell_orders'):
                    c = ql.find(tag)
                    if c is None:
                        continue
                    for o in c.findall('order'):
                        try:
                            p = float(o.find('price').text)
                            v = int(o.find('vol_remain').text)
                            if p > 0 and v > 0:
                                orders.append({'price': p, 'volume': v})
                        except:
                            continue

                if not orders:
                    return {'avg': 0, 'volume': 0}

                pg = {}
                for o in orders:
                    pg[o['price']] = pg.get(o['price'], 0) + o['volume']
                sp = sorted(pg.keys())
                trim = 2
                if len(sp) > trim * 2:
                    sp = sp[trim:-trim]
                tv = sum(pg[p] for p in sp)
                ta = sum(p * pg[p] for p in sp)
                return {'avg': round(ta / tv, 2) if tv > 0 else 0, 'volume': tv}
            except:
                return None

        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
            fut = {ex.submit(_ql, h): l for l, h in windows.items()}
            fut[ex.submit(lambda: _ql(8760))] = 'trimmed'

            for f in concurrent.futures.as_completed(fut):
                label = fut[f]
                data = f.result()
                if data and data.get('avg', 0) > 0:
                    result[label] = data

        self._cache[type_id] = {'ts': time.time(), 'data': result}
        return result

    def get_market_quote_trimmed(self, type_id, system_id=30000142):
        """仅当前行情去极值（用于买卖单卡片）"""
        data = self.get_market_quote(type_id, system_id)
        if not data:
            return None
        trimmed = data.get('trimmed', {})

        # 同时从 quicklook 拿拆分的 buy/sell 数据
        try:
            resp = requests.get(f"{BASE_URL}/quicklook",
                params={'typeid': type_id, 'usesystem': system_id},
                timeout=15)
            if resp.status_code == 200:
                root = ET.fromstring(resp.text)
                ql = root.find('.//quicklook')
                if ql is not None:
                    def _parse(tag):
                        c = ql.find(tag)
                        if c is None:
                            return []
                        rs = []
                        for o in c.findall('order'):
                            try:
                                rs.append({'price': float(o.find('price').text),
                                           'volume': int(o.find('vol_remain').text)})
                            except:
                                continue
                        return rs

                    buy_o = _parse('buy_orders')
                    sell_o = _parse('sell_orders')

                    def _trim(orders):
                        if not orders:
                            return {'avg': 0, 'median': 0, 'volume': 0, 'min': 0, 'max': 0}
                        pg = {}
                        for o in orders:
                            pg[o['price']] = pg.get(o['price'], 0) + o['volume']
                        sp = sorted(pg.keys())
                        trim = 2
                        if len(sp) > trim * 2:
                            sp = sp[trim:-trim]
                        tv = sum(pg[p] for p in sp)
                        ta = sum(p * pg[p] for p in sp)
                        avg = ta / tv if tv > 0 else 0
                        # 中位数
                        al = []
                        for p in sp:
                            al.extend([p] * pg[p])
                        al.sort()
                        mid = len(al) // 2
                        return {
                            'avg': round(avg, 2),
                            'median': round(al[mid], 2) if al else 0,
                            'volume': tv,
                            'min': sp[0] if sp else 0,
                            'max': sp[-1] if sp else 0,
                        }

                    trimmed = {'buy': _trim(buy_o), 'sell': _trim(sell_o)}
        except:
            pass

        return trimmed
