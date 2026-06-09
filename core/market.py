"""CEVE-Market API 市场价格查询"""
import requests, time, xml.etree.ElementTree as ET, concurrent.futures

BASE_URL = "https://www.ceve-market.org/api"
# 默认查询星系：吉他(30000142) + 皮尔米特(30000144)
DEFAULT_SYSTEMS = [30000142, 30000144]

class MarketAPI:
    def __init__(self, cache_ttl=300):
        self.cache_ttl = cache_ttl
        self._cache = {}

    def get_prices_batch(self, type_ids, system_id=None):
        """批量查询价格，默认查吉他+皮尔米特，取最低卖价和最高买价（缓存 10 分钟）"""
        systems = [system_id] if system_id else DEFAULT_SYSTEMS
        cache_key = f"batch_{','.join(str(s) for s in systems)}"
        now = time.time()
        # 检查缓存
        cached = self._cache.get(cache_key)
        if cached and now - cached['ts'] < 600:
            hit = {tid: cached['data'].get(tid) for tid in type_ids if tid in cached['data']}
            miss = [tid for tid in type_ids if tid not in cached['data']]
            if not miss:
                return hit
            type_ids = miss
            result = cached['data'].copy()
        else:
            result = {}
        for sid in systems:
            for i in range(0, len(type_ids), 100):
                batch = type_ids[i:i+100]
                try:
                    resp = requests.get(f"{BASE_URL}/marketstat", params=[('typeid',t) for t in batch]+[('usesystem',sid)], timeout=30)
                    if resp.status_code == 200:
                        root = ET.fromstring(resp.text)
                        for m in root.findall('.//type'):
                            tid = int(m.attrib['id'])
                            def _ext(el):
                                e = m.find(el)
                                if e is None: return 0,0,0,0
                                return float(e.find('median').text) if e.find('median') is not None else 0, int(e.find('volume').text) if e.find('volume') is not None else 0, float(e.find('min').text) if e.find('min') is not None else 0, float(e.find('max').text) if e.find('max') is not None else 0
                            bp,bv,bmin,bmax = _ext('buy')
                            sp,sv,smin,smax = _ext('sell')
                            if tid not in result:
                                result[tid] = {'buy':0,'sell':0,'buy_volume':0,'sell_volume':0,'buy_max':0,'sell_min':0}
                            if sp > 0: result[tid]['sell'] = sp if result[tid]['sell']==0 else min(result[tid]['sell'], sp)
                            if bp > 0: result[tid]['buy'] = bp if result[tid]['buy']==0 else max(result[tid]['buy'], bp)
                            if smin > 0: result[tid]['sell_min'] = smin if result[tid]['sell_min']==0 else min(result[tid]['sell_min'], smin)
                            if bmax > 0: result[tid]['buy_max'] = bmax if result[tid]['buy_max']==0 else max(result[tid]['buy_max'], bmax)
                            result[tid]['sell_volume'] += sv
                            result[tid]['buy_volume'] += bv
                except: pass
        self._cache[cache_key] = {'ts': now, 'data': result.copy()}
        if system_id:
            return {tid: result.get(tid) for tid in type_ids}
        return result

    def get_market_quote(self, type_id, system_id=None):
        """查询单一物品行情，默认查吉他+皮尔米特合并"""
        systems = [system_id] if system_id else DEFAULT_SYSTEMS
        cache_key = f"{type_id}_{','.join(str(s) for s in systems)}"
        cached = self._cache.get(cache_key)
        if cached and time.time()-cached['ts']<self.cache_ttl:
            return cached['data']
        windows = {'24h':24,'3d':72,'7d':168,'30d':720,'90d':2160}
        def _ql_for_system(hours, sid):
            try:
                resp = requests.get(f"{BASE_URL}/quicklook", params={'typeid':type_id,'usesystem':sid,'sethours':hours}, timeout=15)
                if resp.status_code!=200: return None
                root = ET.fromstring(resp.text)
                ql = root.find('.//quicklook')
                if ql is None: return None
                orders = []
                for tag in ('buy_orders','sell_orders'):
                    c = ql.find(tag)
                    if c is None: continue
                    for o in c.findall('order'):
                        try:
                            p=float(o.find('price').text); v=int(o.find('vol_remain').text)
                            if p>0 and v>0: orders.append({'price':p,'volume':v})
                        except: continue
                all_sell=[]; all_buy=[]
                cs=ql.find('sell_orders')
                if cs:
                    for o in cs.findall('order'):
                        try: all_sell.append(float(o.find('price').text))
                        except: pass
                cb=ql.find('buy_orders')
                if cb:
                    for o in cb.findall('order'):
                        try: all_buy.append(float(o.find('price').text))
                        except: pass
                return {'orders':orders,'all_sell':all_sell,'all_buy':all_buy}
            except: return None
        result = {}
        for h_label, h_val in windows.items():
            # 查所有星系
            merged_orders = []
            all_sell = []
            all_buy = []
            for sid in systems:
                data = _ql_for_system(h_val, sid)
                if data:
                    merged_orders.extend(data['orders'])
                    all_sell.extend(data['all_sell'])
                    all_buy.extend(data['all_buy'])
            if not merged_orders:
                sell_min = min(all_sell) if all_sell else 0
                buy_max = max(all_buy) if all_buy else 0
                if sell_min > 0 or buy_max > 0:
                    result[h_label] = {'avg':0,'volume':0,'sell_min':sell_min,'buy_max':buy_max}
                continue
            pg={}
            for o in merged_orders: pg[o['price']]=pg.get(o['price'],0)+o['volume']
            sp=sorted(pg.keys())
            trim=2
            if len(sp)>trim*2: sp=sp[trim:-trim]
            tv=sum(pg[p] for p in sp)
            ta=sum(p*pg[p] for p in sp)
            result[h_label] = {
                'avg': round(ta/tv,2) if tv>0 else 0,'volume':tv,
                'sell_min':min(all_sell) if all_sell else 0,
                'buy_max':max(all_buy) if all_buy else 0
            }
        self._cache[cache_key]={'ts':time.time(),'data':result}
        return result
