"""
矿物估价引擎
"""
from core.database import SDEDatabase
from core.market import MarketAPI

db = SDEDatabase()
market = MarketAPI(cache_ttl=300)

# 基础矿物 ID
BASE_ORE_IDS = {34, 35, 36, 37, 38, 39, 40}


def parse_item_line(line: str) -> list:
    """
    解析一行输入，返回 [(名称, 数量), ...]
    支持单行多物品: "斜长岩 1000 凡晶石 5030"
    支持标签: "三钛合金 20000 矿物"
    """
    line = line.strip()
    if not line:
        return []
    import re
    # 按空白分割
    tokens = re.split(r'[\s\t]+', line)
    if not tokens:
        return []
    
    result = []
    i = 0
    while i < len(tokens):
        # 找数字
        qty = None
        for j in range(i, len(tokens)):
            clean = tokens[j].replace(',', '').replace('x','').replace('X','').replace('×','')
            try:
                v = int(float(clean))
                if v > 0:
                    qty = v
                    # 从 i 到 j-1 是名称
                    name = ' '.join(tokens[i:j])
                    if name:
                        result.append((name, qty))
                    i = j + 1
                    break
            except:
                continue
        if qty is None:
            break  # 剩余文本无法解析，跳过
    return result


def parse_input_text(text: str) -> list:
    """解析完整输入文本，返回 [(名称, 数量), ...]"""
    result = []
    for line in text.strip().split('\n'):
        result.extend(parse_item_line(line))
    return result


def search_item(name: str):
    """搜索物品，返回 typeID"""
    results = db.search_by_name(name, limit=5)
    if results:
        return results[0]['typeID']
    # 尝试英文搜索
    conn = db._connect()
    row = conn.execute(
        "SELECT typeID FROM invTypes WHERE typeName LIKE ? AND published=1 LIMIT 1",
        (f'%{name}%',)
    ).fetchone()
    conn.close()
    return row['typeID'] if row else None


def get_reprocess_materials(type_id: int, item_qty: int, reprocess_rate: float = 0.55):
    """获取化矿产物，考虑最小化矿单位"""
    portion = get_portion_size(type_id)
    valid_qty = (item_qty // portion) * portion  # 可化矿的数量
    if valid_qty <= 0:
        return None, item_qty  # 全部作为矿渣
    conn = db._connect()
    rows = conn.execute(
        "SELECT materialTypeID, quantity FROM invTypeMaterials WHERE typeID=?",
        (type_id,)
    ).fetchall()
    conn.close()
    if not rows:
        return None, item_qty
    result = []
    batches = valid_qty // portion  # 可化矿的批次数
    for row in rows:
        per_batch = int(row['quantity'] * reprocess_rate)  # 每批产出（向下取整）
        total = per_batch * batches
        if total > 0:
            result.append({'type_id': row['materialTypeID'], 'quantity': total})
    residue = item_qty - valid_qty  # 不够一批的矿渣
    return result, residue


def get_portion_size(type_id: int) -> int:
    """获取物品的最小化矿单位（portionSize）"""
    conn = db._connect()
    r = conn.execute("SELECT portionSize FROM invTypes WHERE typeID=?", (type_id,)).fetchone()
    conn.close()
    return r['portionSize'] if r and r['portionSize'] > 0 else 1


def estimate_items(items: list, reprocess_rate: float = 0.55):
    """
    批量估价
    items: [{'name': '斜长岩', 'quantity': 1000}, ...]
    返回每件物品的明细 + 汇总
    """
    results = []
    all_mineral_ids = set()

    for item in items:
        name = item['name']
        qty = item['quantity']
        tid = search_item(name)
        if not tid:
            results.append({'name': name, 'quantity': qty, 'error': '未找到'})
            continue

        # 市场价（用 marketstat 批量查价，与商品页面一致）
        mp = market.get_prices_batch([tid])
        pd = mp.get(tid, {})
        sell_min = pd.get('sell_min', 0)
        buy_max = pd.get('buy_max', 0)

        # 化矿
        mats, residue = get_reprocess_materials(tid, qty, reprocess_rate)
        if mats:
            for m in mats:
                all_mineral_ids.add(m['type_id'])
            # 查询矿物市场价
            mineral_prices = {}
            mids = list(set(m['type_id'] for m in mats))
            if mids:
                mp = market.get_prices_batch(mids)
                for mid in mids:
                    pd = mp.get(mid, {})
                    mineral_prices[mid] = {'sell_min': pd.get('sell_min', 0), 'buy_max': pd.get('buy_max', 0)}

            mineral_details = []
            for m in mats:
                mp = mineral_prices.get(m['type_id'], {})
                mineral_details.append({
                    'type_id': m['type_id'],
                    'name': db.get_chinese_name(m['type_id']),
                    'name_en': db.get_english_name(m['type_id']),
                    'quantity': m['quantity'],
                    'total_buy': round(m['quantity'] * mp.get('buy_max', 0), 2),
                    'total_sell': round(m['quantity'] * mp.get('sell_min', 0), 2),
                })

            results.append({
                'name': name,
                'name_en': db.get_english_name(tid),
                'quantity': qty,
                'has_reprocess': True,
                'residue': residue,
                'sell_price': sell_min,
                'buy_price': buy_max,
                'direct_sell_total': round(sell_min * qty, 2),
                'direct_buy_total': round(buy_max * qty, 2),
                'minerals': mineral_details,
                'mineral_sell_total': round(sum(m['total_sell'] for m in mineral_details), 2),
                'mineral_buy_total': round(sum(m['total_buy'] for m in mineral_details), 2),
            })
        elif tid in BASE_ORE_IDS:
            # 基础矿物：化矿价值等于自身市场价值
            results.append({
                'name': name, 'name_en': db.get_english_name(tid),
                'quantity': qty, 'has_reprocess': False,
                'sell_price': sell_min, 'buy_price': buy_max,
                'direct_sell_total': round(sell_min * qty, 2),
                'direct_buy_total': round(buy_max * qty, 2),
                'mineral_sell_total': round(sell_min * qty, 2),
                'mineral_buy_total': round(buy_max * qty, 2),
                'minerals': None,
            })
        else:
            results.append({
                'name': name,
                'name_en': db.get_english_name(tid),
                'quantity': qty,
                'has_reprocess': False,
                'sell_price': sell_min,
                'buy_price': buy_max,
                'direct_sell_total': round(sell_min * qty, 2),
                'direct_buy_total': round(buy_max * qty, 2),
            })

    return results
