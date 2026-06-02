"""利润排行扫描器（全批量版）"""
import requests, xml.etree.ElementTree as ET
from core.calculator import ProfitCalculator, ManufacturingConfig
from core.database import SDEDatabase
from core.market import MarketAPI
from core import auth

db_sde = SDEDatabase()
market_api = MarketAPI(cache_ttl=3600)


def batch_get_prices(type_ids):
    """批量查 marketstat，返回 {typeID: {buy_median, sell_median, buy_max, sell_min}}"""
    result = {}
    for i in range(0, len(type_ids), 100):
        batch = type_ids[i:i+100]
        try:
            resp = requests.get(
                "https://www.ceve-market.org/api/marketstat",
                params=[('typeid', t) for t in batch] + [('usesystem', 30000142)],
                timeout=30
            )
            if resp.status_code == 200:
                root = ET.fromstring(resp.text)
                for m in root.findall('.//type'):
                    tid = int(m.attrib['id'])
                    def _ext(el_name):
                        el = m.find(el_name)
                        if el is None: return {}
                        return {
                            'median': float(el.find('median').text) if el.find('median') is not None else 0,
                            'min': float(el.find('min').text) if el.find('min') is not None else 0,
                            'max': float(el.find('max').text) if el.find('max') is not None else 0,
                            'volume': int(el.find('volume').text) if el.find('volume') is not None else 0,
                        }
                    b = _ext('buy')
                    s = _ext('sell')
                    result[tid] = {
                        'buy_median': b.get('median', 0),
                        'sell_median': s.get('median', 0),
                        'buy_max': b.get('max', 0),
                        'sell_min': s.get('min', 0),
                    }
        except:
            continue
    return result


def scan_category(group_id):
    """按分类扫描：全批量 marketstat，无需单次 API"""
    items = db_sde.get_items_by_market_group(group_id)
    if not items:
        return []

    type_ids = [i['typeID'] for i in items]
    print(f"[scan] {len(type_ids)} 件物品，批量查价中...")

    # 一次批量查价
    prices = batch_get_prices(type_ids)
    print(f"[scan] 查价完成，{len(prices)} 件有价格")

    result = []
    broker_fee = 0.0075
    sales_tax = 0.01

    for item in items:
        tid = item['typeID']
        p = prices.get(tid, {})
        sell_min = p.get('sell_min', 0)
        buy_max = p.get('buy_max', 0)
        buy_med = p.get('buy_median', 0)
        sell_med = p.get('sell_median', 0)

        if sell_min == 0 and buy_max == 0:
            continue

        # 倒卖利润：按收单价买入，按卖单价卖出
        # 买入成本 = 收单中位数 × (1 + 挂单费率)
        buy_cost = buy_med * (1 + broker_fee) if buy_med > 0 else 0
        # 卖出收入 = 卖单中位数 × (1 - 挂单费率 - 销售税率)
        sell_revenue = sell_med * (1 - broker_fee - sales_tax) if sell_med > 0 else 0
        flip_profit = round(sell_revenue - buy_cost, 2) if buy_cost > 0 and sell_revenue > 0 else 0
        flip_margin = round((sell_revenue - buy_cost) / buy_cost * 100, 1) if buy_cost > 0 and sell_revenue > buy_cost else 0

        item_data = {
            'type_id': tid,
            'name': item.get('name') or db_sde.get_chinese_name(tid),
            'name_en': item.get('name_en') or db_sde.get_english_name(tid),
            'flip_profit': flip_profit,
            'flip_margin': flip_margin,
            'has_blueprint': False,
            'ideal': None, 'realistic': None, 'conservative': None,
        }

        # 制造利润
        mats = db_sde.get_manufacturing_materials(tid)
        if mats:
            item_data['has_blueprint'] = True
            all_ids = [tid] + list(mats.keys())
            # 构造伪价格字典
            mock_prices = {}
            for aid in all_ids:
                mp = prices.get(aid, {})
                mock_prices[aid] = {
                    'buy': mp.get('buy_median', 0),
                    'sell': mp.get('sell_median', 0),
                    'buy_volume': 0, 'sell_volume': 0,
                }
            cfg = ManufacturingConfig()
            calc = ProfitCalculator(db_sde, market_api, cfg)
            calc.market.get_prices_batch = lambda ids, sys=30000142: mock_prices
            r = calc.calculate_with_modes(tid)
            if r:
                for m in r['modes']:
                    item_data[m['key']] = {
                        'profit': m['profit'],
                        'margin': m['profit_margin'],
                        'isk_hour': m['isk_per_hour'],
                        'profit_24h': m['profit_24h'],
                        'cost': m['total_cost'],
                        'revenue': m['revenue'],
                        'quality': m['data_quality'],
                    }

        result.append(item_data)

    result.sort(key=lambda x: max(x['ideal']['profit'] if x['ideal'] else 0, x['flip_profit']), reverse=True)
    print(f"[scan] 完成：{len(result)} 条")
    return result


def scan_watchlist(user_id):
    watch = auth.get_watchlist(user_id)
    if not watch:
        return []
    type_ids = [w['type_id'] for w in watch]
    
    # 收集所有材料ID一并查价
    all_mat_ids = set(type_ids)
    for w in watch:
        mats = db_sde.get_manufacturing_materials(w['type_id'])
        if mats:
            all_mat_ids.update(mats.keys())
    
    prices = batch_get_prices(list(all_mat_ids))

    result = []
    broker_fee = 0.0075
    sales_tax = 0.01

    for item in watch:
        tid = item['type_id']
        p = prices.get(tid, {})
        buy_med = p.get('buy_median', 0)
        sell_med = p.get('sell_median', 0)

        buy_cost = buy_med * (1 + broker_fee) if buy_med > 0 else 0
        sell_revenue = sell_med * (1 - broker_fee - sales_tax) if sell_med > 0 else 0
        flip_profit = round(sell_revenue - buy_cost, 2) if buy_med > 0 and sell_med > 0 else 0
        flip_margin = round((sell_revenue - buy_cost) / buy_cost * 100, 1) if buy_cost > 0 and sell_revenue > buy_cost else 0

        item_data = {
            'type_id': tid,
            'name': item.get('name_cn') or db_sde.get_chinese_name(tid),
            'name_en': db_sde.get_english_name(tid),
            'flip_profit': flip_profit,
            'flip_margin': flip_margin,
            'has_blueprint': False,
            'ideal': None, 'realistic': None, 'conservative': None,
        }

        mats = db_sde.get_manufacturing_materials(tid)
        if mats:
            item_data['has_blueprint'] = True
            all_ids = [tid] + list(mats.keys())
            mock_prices = {}
            for aid in all_ids:
                mp = prices.get(aid, {})
                mock_prices[aid] = {
                    'buy': mp.get('buy_median', 0),
                    'sell': mp.get('sell_median', 0),
                    'buy_volume': 0, 'sell_volume': 0,
                }
            # 加载用户保存的材料定价配置
            saved = auth.load_material_overrides(user_id, tid)
            cfg = ManufacturingConfig()
            calc = ProfitCalculator(db_sde, market_api, cfg)
            calc.market.get_prices_batch = lambda ids, sys=30000142: mock_prices
            r = calc.calculate_with_modes(tid, material_overrides=saved)
            if r:
                for m in r['modes']:
                    item_data[m['key']] = {
                        'profit': m['profit'],
                        'margin': m['profit_margin'],
                        'isk_hour': m['isk_per_hour'],
                        'profit_24h': m['profit_24h'],
                        'cost': m['total_cost'],
                        'revenue': m['revenue'],
                        'quality': m['data_quality'],
                    }

        result.append(item_data)

    result.sort(key=lambda x: max(x['realistic']['profit'] if x['realistic'] else 0, x['flip_profit']), reverse=True)
    return result
