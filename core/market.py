"""CEVE-Market API 市场价格查询"""
import requests
import time
import xml.etree.ElementTree as ET


BASE_URL = "https://www.ceve-market.org/api"


class MarketAPI:
    def __init__(self, cache_ttl: int = 300):
        self.cache_ttl = cache_ttl
        self._cache = {}

    def get_prices_batch(self, type_ids: list, system_id: int = 30000142) -> dict:
        """批量查询价格（marketstat XML），返回每件物品的 median"""
        result = {}
        for i in range(0, len(type_ids), 100):
            batch = type_ids[i:i + 100]
            try:
                params = [('typeid', tid) for tid in batch]
                params.append(('usesystem', system_id))
                resp = requests.get(
                    f"{BASE_URL}/marketstat",
                    params=params,
                    timeout=30
                )
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
                            'buy': buy_p,
                            'sell': sell_p,
                            'buy_volume': buy_v,
                            'sell_volume': sell_v,
                            'buy_max': buy_max,
                            'sell_min': sell_min,
                        }
            except Exception:
                pass
        return result

    def get_market_quote(self, type_id: int, system_id: int = 30000142) -> dict | None:
        """查询单个物品的完整市场行情"""
        cached = self._cache.get(type_id)
        if cached and time.time() - cached['ts'] < self.cache_ttl:
            return cached['data']

        try:
            resp = requests.get(
                f"{BASE_URL}/marketstat",
                params={'typeid': type_id, 'usesystem': system_id},
                timeout=10
            )
            if resp.status_code != 200:
                return None
            root = ET.fromstring(resp.text)
            mstat = root.find('.//type')
            if mstat is None:
                return None

            def _ext(el_name):
                el = mstat.find(el_name)
                if el is None:
                    return {}
                return {
                    'median': float(el.find('median').text) if el.find('median') is not None else 0.0,
                    'avg': float(el.find('avg').text) if el.find('avg') is not None else 0.0,
                    'min': float(el.find('min').text) if el.find('min') is not None else 0.0,
                    'max': float(el.find('max').text) if el.find('max') is not None else 0.0,
                    'volume': int(el.find('volume').text) if el.find('volume') is not None else 0,
                    'stddev': float(el.find('stddev').text) if el.find('stddev') is not None else 0.0,
                    'percentile': float(el.find('percentile').text) if el.find('percentile') is not None else 0.0,
                }

            result = {
                'buy': _ext('buy'),
                'sell': _ext('sell'),
                'all': _ext('all'),
            }
            self._cache[type_id] = {'ts': time.time(), 'data': result}
            return result
        except Exception:
            return None
