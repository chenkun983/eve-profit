"""CEVE-Market API 市场价格查询"""
import requests, time, xml.etree.ElementTree as ET, concurrent.futures

BASE_URL = "https://www.ceve-market.org/api"

class MarketAPI:
    def __init__(self, cache_ttl=300):
        self.cache_ttl = cache_ttl
        self._cache = {}

    def get_prices_batch(self, type_ids, system_id=30000142):
        result = {}
        for i in range(0, len(type_ids), 100):
            batch = type_ids[i:i+100]
            try:
                resp = requests.get(f"{BASE_URL}/marketstat", params=[('typeid',t) for t in batch]+[('usesystem',system_id)], timeout=30)
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
                        result[tid] = {'buy':bp,'sell':sp,'buy_volume':bv,'sell_volume':sv,'buy_max':bmax,'sell_min':smin}
            except: pass
        return result

    def get_market_quote(self, type_id, system_id=30000142):
        cached = self._cache.get(type_id)
        if cached and time.time()-cached['ts']<self.cache_ttl:
            return cached['data']
        result = {}
        windows = {'24h':24,'3d':72,'7d':168,'30d':720,'90d':2160}
        def _ql(hours):
            try:
                resp = requests.get(f"{BASE_URL}/quicklook", params={'typeid':type_id,'usesystem':system_id,'sethours':hours}, timeout=15)
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
                # 取原始买卖单的 min/max (不取极值)
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
                if not orders:
                    return {'avg':0,'volume':0,'sell_min':min(all_sell) if all_sell else 0,'buy_max':max(all_buy) if all_buy else 0}
                pg={}
                for o in orders: pg[o['price']]=pg.get(o['price'],0)+o['volume']
                sp=sorted(pg.keys())
                trim=2
                if len(sp)>trim*2: sp=sp[trim:-trim]
                tv=sum(pg[p] for p in sp)
                ta=sum(p*pg[p] for p in sp)
                return {'avg': round(ta/tv,2) if tv>0 else 0,'volume':tv,
                    'sell_min':min(all_sell) if all_sell else 0,'buy_max':max(all_buy) if all_buy else 0}
            except: return None
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
            fut={ex.submit(_ql,h):l for l,h in windows.items()}
            fut[ex.submit(lambda:_ql(8760))]='trimmed'
            for f in concurrent.futures.as_completed(fut):
                label=fut[f]; data=f.result()
                if data and data.get('avg',0)>0: result[label]=data
        self._cache[type_id]={'ts':time.time(),'data':result}
        return result
