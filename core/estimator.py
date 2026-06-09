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
    # 如果有 Tab，优先按 Tab 分割（物品名可能包含空格）
    if '\t' in line:
        parts = [p.strip() for p in line.split('\t') if p.strip()]
        if len(parts) >= 2:
            # 从后往前找数字：可能格式为 名称\t数量 或 名称\t数量\t类型
            for idx in range(len(parts)-1, -1, -1):
                try:
                    qty = int(float(parts[idx]))
                    if qty > 0:
                        name = ' '.join(parts[:idx])
                        if name:
                            return [(name, qty)]
                except:
                    continue
    # 没有 Tab，按空白分割
    tokens = re.split(r'[\s\t]+', line)
    if not tokens:
        return []
    result = []
    i = 0
    while i < len(tokens):
        qty = None
        for j in range(i, len(tokens)):
            clean = tokens[j].replace(',', '').replace('x','').replace('X','').replace('×','')
            try:
                v = int(float(clean))
                if v > 0:
                    qty = v
                    name = ' '.join(tokens[i:j])
                    if name:
                        result.append((name, qty))
                    i = j + 1
                    break
            except:
                continue
        if qty is None:
            break
    return result


def parse_input_text(text: str) -> list:
    """解析完整输入文本，返回 [(名称, 数量), ...]"""
    result = []
    for line in text.strip().split('\n'):
        result.extend(parse_item_line(line))
    return result


def search_item(name: str):
    """搜索物品，返回 typeID — SDE 精确匹配优先，无则 cn_sde 补充"""
    import re
    # 策略1: SDE 翻译表精确匹配
    results = db.search_by_name(name, limit=20)
    if results:
        for r in results:
            if r['name'].strip() == name.strip():
                return r['typeID']
    # 策略2: cn_sde 精确匹配（SDE 没有的国服独占物品）
    try:
        from core.cn_sde import get_type_id
        tid = get_type_id(name)
        if tid:
            return tid
    except:
        pass
    return None


def search_item_cn(name: str):
    """只在国服补充表中搜索"""
    try:
        from core.cn_sde import search_name
        return search_name(name)
    except:
        return []


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
        # 先算总量再取整，避免每批截断累积损失
        total = int(row['quantity'] * batches * reprocess_rate)
        if total == 0 and row['quantity'] > 0:
            total = max(1, round(row['quantity'] * batches * reprocess_rate))
        if total > 0:
            result.append({'type_id': row['materialTypeID'], 'quantity': total})
    residue = item_qty - valid_qty  # 不够一批的矿渣
    return result, residue

def get_item_volume(type_id: int) -> float:
    """获取物品体积（立方米），对压缩矿石做修正 (高密度 = 基础 / 100)"""
    conn = db._connect()
    r = conn.execute("SELECT volume, groupID FROM invTypes WHERE typeID=?", (type_id,)).fetchone()
    if not r:
        conn.close()
        return 0.0
    vol = r['volume']
    gid = r['groupID']
    # 矿石类：SDE 体积为 0 或与基础矿不一致的，视为压缩矿石
    # 实际体积 = 基础体积 / 100
    if gid and gid in ORE_GROUP_IDS:
        base = conn.execute(
            "SELECT MIN(volume) FROM invTypes WHERE groupID=? AND volume>0 AND published=1",
            (gid,)).fetchone()
        if base and base[0] and base[0] > 0:
            if vol == 0 or abs(vol - base[0]) > 0.001:
                vol = base[0] / 100.0
    conn.close()
    return vol


def get_portion_size(type_id: int) -> int:
    """获取物品的最小化矿单位（portionSize）"""
    conn = db._connect()
    r = conn.execute("SELECT portionSize FROM invTypes WHERE typeID=?", (type_id,)).fetchone()
    conn.close()
    return r['portionSize'] if r and r['portionSize'] > 0 else 1


# 矿石 groupID 列表（EVE SDE 标准）
ORE_GROUP_IDS = {450,451,452,453,454,455,456,457,458,459,460,461,462,463,464,465,
                 467,468,469,470,471,472,473,474,475,476,
                 477,478,  # 冰矿
                 1136,1137,1138,1139,1140,1141,  # 月矿
                 1855,  # 冰产品（用于制造）
                 1885,  # 气云
                 2836,  # 压缩矿石 Compressed Ores
                 2840,2841,2842}  # 压缩冰矿


def estimate_is_ore(type_id: int) -> bool:
    """判断物品是否是矿石（通过 SDE groupID）"""
    from .database import SDEDatabase
    db = SDEDatabase()
    conn = db._connect()
    try:
        row = conn.execute("SELECT groupID FROM invTypes WHERE typeID=?", (type_id,)).fetchone()
        if row:
            return row['groupID'] in ORE_GROUP_IDS
        return False
    finally:
        conn.close()


def estimate_items(items: list, reprocess_rate: float = 0.55, ore_rate: float = 0.825):
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
        # 验证匹配结果
        sde_cn = db.get_chinese_name(tid) or ''
        sde_en = db.get_english_name(tid) or ''
        from_cn = False
        try:
            from core.cn_sde import get_type_id
            if get_type_id(name) == tid:
                from_cn = True
        except:
            pass
        if not from_cn:
            if sde_cn and len(name) >= 4:
                if name.lower() not in sde_cn.lower() and sde_cn.lower() not in name.lower():
                    results.append({'name': name, 'quantity': qty, 'error': f'未匹配（"{name}"→"{sde_cn}"）'})
                    continue
        # 检查 SDE 是否有该 typeID 的基础数据
        sde_tid_ok = bool(sde_cn or sde_en)
        if not sde_tid_ok:
            results.append({'name': name, 'quantity': qty, 'error': f'已匹配 typeID={tid}，但 SDE 中无此物品数据（{sde_cn}/{sde_en}）'})
            continue

        # 市场价
        mp = market.get_prices_batch([tid])
        pd = mp.get(tid, {})
        sell_min = pd.get('sell_min', 0)
        buy_max = pd.get('buy_max', 0)

        # 化矿
        is_ore = estimate_is_ore(tid)
        actual_rate = ore_rate if is_ore else reprocess_rate
        mats, residue = get_reprocess_materials(tid, qty, actual_rate)
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
            total_product_qty = 0
            for m in mats:
                mp = mineral_prices.get(m['type_id'], {})
                total_product_qty += m['quantity']
                mineral_details.append({
                    'type_id': m['type_id'],
                    'name': db.get_chinese_name(m['type_id']),
                    'name_en': db.get_english_name(m['type_id']),
                    'quantity': m['quantity'],
                    'volume': get_item_volume(m['type_id']),
                    'total_buy': round(m['quantity'] * mp.get('buy_max', 0), 2),
                    'total_sell': round(m['quantity'] * mp.get('sell_min', 0), 2),
                })

            item_volume = get_item_volume(tid)
            pre_volume = round(item_volume * qty, 2)
            post_volume = round(sum(m['quantity'] * (m.get('volume') or get_item_volume(m['type_id'])) for m in mineral_details), 2)

            results.append({
                'name': name,
                'name_en': db.get_english_name(tid),
                'quantity': qty,
                'volume': item_volume,
                'pre_volume': pre_volume,
                'post_volume': post_volume,
                'total_product_qty': total_product_qty,
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
                'residue': residue,
                'sell_price': sell_min,
                'buy_price': buy_max,
                'direct_sell_total': round(sell_min * qty, 2),
                'direct_buy_total': round(buy_max * qty, 2),
            })

    # 按化矿前体积从大到小排序
    results.sort(key=lambda r: r.get('pre_volume', 0), reverse=True)
    return results
