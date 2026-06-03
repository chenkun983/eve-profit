"""利润排行扫描器"""
import requests, xml.etree.ElementTree as ET
from core.calculator import ProfitCalculator, ManufacturingConfig
from core.database import SDEDatabase
from core.market import MarketAPI
from core import auth

db_sde = SDEDatabase()
market_api = MarketAPI(cache_ttl=3600)

def batch_get_prices(type_ids):
    result = {}
    for i in range(0, len(type_ids), 100):
        batch = type_ids[i:i+100]
        try:
            resp = requests.get("https://www.ceve-market.org/api/marketstat", params=[('typeid',t) for t in batch]+[('usesystem',30000142)], timeout=30)
            if resp.status_code == 200:
                root = ET.fromstring(resp.text)
                for m in root.findall('.//type'):
                    tid = int(m.attrib['id'])
                    def _ext(el):
                        e = m.find(el)
                        if e is None: return {}
                        return {'median':float(e.find('median').text) if e.find('median') is not None else 0,
                                'min':float(e.find('min').text) if e.find('min') is not None else 0,
                                'max':float(e.find('max').text) if e.find('max') is not None else 0,'volume':int(e.find('volume').text) if e.find('volume') is not None else 0}
                    b = _ext('buy'); s = _ext('sell')
                    result[tid] = {'buy_median':b.get('median',0),'sell_median':s.get('median',0),'buy_max':b.get('max',0),'sell_min':s.get('min',0)}
        except: pass
    return result

def _prices_to_mock(raw):
    r = {}
    for pid, p in raw.items():
        r[pid] = {'buy':p.get('buy_median',0),'sell':p.get('sell_median',0),'sell_min':p.get('sell_min',0),'buy_max':p.get('buy_max',0),'buy_volume':0,'sell_volume':0}
    return r

def _fill_modes(r, idata):
    if not r: return
    for m in r['modes']:
        cp = m['total_cost'] / r['product_quantity'] if r['product_quantity'] > 0 else 0
        idata[m['key']] = {'profit':m['profit'],'margin':m['profit_margin'],'isk_hour':m['isk_per_hour'],
            'profit_24h':m['profit_24h'],'cost':m['total_cost'],'revenue':m['revenue'],
            'quality':m['data_quality'],'sell_price':m['product_price'],'cost_price':round(cp,2)}

def scan_category(group_id):
    items = db_sde.get_items_by_market_group(group_id)
    if not items: return []
    all_ids = set(i['typeID'] for i in items)
    for item in items:
        m = db_sde.get_manufacturing_materials(item['typeID'])
        if m: all_ids.update(m.keys())
        try:
            bom = ProfitCalculator(db_sde, market_api).resolve_deep_bom_flat(item['typeID'])
            all_ids.update(b['type_id'] for b in bom)
        except: pass
    raw_prices = batch_get_prices(list(all_ids))
    prices = _prices_to_mock(raw_prices)
    result = []; bfee = 0.0075; stax = 0.01
    for item in items:
        tid = item['typeID']; p = prices.get(tid, {})
        sm = p.get('sell',0); bm = p.get('buy',0)
        if sm == 0 and bm == 0: continue
        bc = bm * (1 + bfee) if bm > 0 else 0
        sr = sm * (1 - bfee - stax) if sm > 0 else 0
        fp = round(sr - bc, 2) if bc > 0 and sr > 0 else 0
        fm = round((sr - bc) / bc * 100, 1) if bc > 0 and sr > bc else 0
        idata = {'type_id':tid, 'name':item.get('name') or db_sde.get_chinese_name(tid),
            'name_en':item.get('name_en') or db_sde.get_english_name(tid),
            'flip_profit':fp, 'flip_margin':fm, 'flip_sell_price':sm, 'flip_cost_price':bc,
            'has_blueprint':False,
            'realistic':None, 'ideal':None, 'conservative':None, 'wholesale_bp':None, 'wholesale_bm':None}
        mats = db_sde.get_manufacturing_materials(tid)
        if mats:
            idata['has_blueprint'] = True
            calc = ProfitCalculator(db_sde, market_api, ManufacturingConfig())
            calc.market.get_prices_batch = lambda ids, s=30000142: prices
            _fill_modes(calc.calculate_with_modes(tid), idata)
        result.append(idata)
    result.sort(key=lambda x: max(x['realistic']['profit'] if x['realistic'] else 0, x['flip_profit']), reverse=True)
    return result

def scan_watchlist(user_id, discount=0.9):
    watch = auth.get_watchlist(user_id)
    if not watch: return []
    all_ids = set(w['type_id'] for w in watch)
    for w in watch:
        m = db_sde.get_manufacturing_materials(w['type_id'])
        if m: all_ids.update(m.keys())
        try:
            bom = ProfitCalculator(db_sde, market_api).resolve_deep_bom_flat(w['type_id'])
            all_ids.update(b['type_id'] for b in bom)
        except: pass
    raw_prices = batch_get_prices(list(all_ids))
    prices = _prices_to_mock(raw_prices)
    result = []; bfee = 0.0075; stax = 0.01
    for item in watch:
        tid = item['type_id']; p = prices.get(tid, {})
        bm = p.get('buy',0); sm = p.get('sell',0)
        bc = bm * (1 + bfee) if bm > 0 else 0
        sr = sm * (1 - bfee - stax) if sm > 0 else 0
        fp = round(sr - bc, 2) if bm > 0 and sm > 0 else 0
        fm = round((sr - bc) / bc * 100, 1) if bc > 0 and sr > bc else 0
        idata = {'type_id':tid, 'name':item.get('name_cn') or db_sde.get_chinese_name(tid),
            'name_en':db_sde.get_english_name(tid),
            'flip_profit':fp, 'flip_margin':fm, 'flip_sell_price':sm, 'flip_cost_price':bc,
            'has_blueprint':False,
            'realistic':None, 'ideal':None, 'conservative':None, 'wholesale_bp':None, 'wholesale_bm':None}
        mats = db_sde.get_manufacturing_materials(tid)
        if mats:
            idata['has_blueprint'] = True
            saved = auth.load_material_overrides(user_id, tid)
            calc = ProfitCalculator(db_sde, market_api, ManufacturingConfig(wholesale_discount=discount))
            calc.market.get_prices_batch = lambda ids, s=30000142: prices
            _fill_modes(calc.calculate_with_modes(tid, material_overrides=saved), idata)
        result.append(idata)
    result.sort(key=lambda x: max(x['realistic']['profit'] if x['realistic'] else 0, x['flip_profit']), reverse=True)
    return result
