"""工业管理系统：仓库、生产线、缺口统计、制造订单"""
import sqlite3
import os
import json
import time
from datetime import datetime, timedelta

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE, 'data', 'users.db')


def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


# ========== 原料总表缓存 ==========

def rebuild_material_cache():
    """从 SDE 重建原料总表缓存"""
    from .database import SDEDatabase
    sde = SDEDatabase()
    conn = _connect()
    conn.execute("DELETE FROM material_master")
    sde_conn = sde._connect()
    rows = sde_conn.execute(
        "SELECT DISTINCT iam.materialTypeID, tz.text as name_cn, it.typeName as name_en "
        "FROM industryActivityMaterials iam "
        "JOIN invTypes it ON iam.materialTypeID = it.typeID "
        "LEFT JOIN trnTranslations tz ON tz.tcID=8 AND tz.keyID=iam.materialTypeID AND tz.languageID='zh'"
    ).fetchall()
    sde_conn.close()
    count = 0
    for row in rows:
        conn.execute("INSERT OR IGNORE INTO material_master (type_id, name_cn, name_en) VALUES (?, ?, ?)",
                     (row['materialTypeID'], row['name_cn'] or row['name_en'], row['name_en']))
        count += 1
    conn.commit()
    conn.close()
    return count


def rebuild_production_cache():
    """重建可制造物品缓存（制造 activityID=1）和反应缓存（activityID=11）"""
    from .database import SDEDatabase
    sde = SDEDatabase()
    conn = _connect()
    conn.execute("DELETE FROM manufacturable_cache")
    conn.execute("DELETE FROM reaction_cache")
    sde_conn = sde._connect()
    # 制造
    prod_rows = sde_conn.execute(
        "SELECT DISTINCT iap.productTypeID, tz.text as name_cn, it.typeName as name_en "
        "FROM industryActivityProducts iap "
        "JOIN invTypes it ON iap.productTypeID = it.typeID "
        "LEFT JOIN trnTranslations tz ON tz.tcID=8 AND tz.keyID=iap.productTypeID AND tz.languageID='zh' "
        "WHERE iap.activityID=1 AND it.published=1"
    ).fetchall()
    for row in prod_rows:
        conn.execute("INSERT OR IGNORE INTO manufacturable_cache (type_id, name_cn, name_en) VALUES (?, ?, ?)",
                     (row['productTypeID'], row['name_cn'] or row['name_en'], row['name_en']))
    # 反应
    react_rows = sde_conn.execute(
        "SELECT DISTINCT iap.productTypeID, tz.text as name_cn, it.typeName as name_en "
        "FROM industryActivityProducts iap "
        "JOIN invTypes it ON iap.productTypeID = it.typeID "
        "LEFT JOIN trnTranslations tz ON tz.tcID=8 AND tz.keyID=iap.productTypeID AND tz.languageID='zh' "
        "WHERE iap.activityID=11 AND it.published=1"
    ).fetchall()
    sde_conn.close()
    for row in react_rows:
        conn.execute("INSERT OR IGNORE INTO reaction_cache (type_id, name_cn, name_en) VALUES (?, ?, ?)",
                     (row['productTypeID'], row['name_cn'] or row['name_en'], row['name_en']))
    conn.commit()
    conn.close()
    return len(prod_rows), len(react_rows)


def is_manufacturable(type_id: int) -> bool:
    conn = _connect()
    row = conn.execute("SELECT 1 FROM manufacturable_cache WHERE type_id=?", (type_id,)).fetchone()
    conn.close()
    return row is not None


def search_manufacturable(keyword: str, limit: int = 20) -> list:
    conn = _connect()
    rows = conn.execute(
        "SELECT type_id, name_cn, name_en FROM manufacturable_cache "
        "WHERE name_cn LIKE ? OR name_en LIKE ? LIMIT ?",
        (f'%{keyword}%', f'%{keyword}%', limit)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def search_reactions(keyword: str, limit: int = 20) -> list:
    conn = _connect()
    rows = conn.execute(
        "SELECT type_id, name_cn, name_en FROM reaction_cache "
        "WHERE name_cn LIKE ? OR name_en LIKE ? LIMIT ?",
        (f'%{keyword}%', f'%{keyword}%', limit)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def search_materials(keyword: str, limit: int = 20) -> list:
    """搜索原料总表（自动补全）"""
    conn = _connect()
    rows = conn.execute(
        "SELECT type_id, name_cn, name_en FROM material_master WHERE name_cn LIKE ? OR name_en LIKE ? LIMIT ?",
        (f'%{keyword}%', f'%{keyword}%', limit)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def is_material(type_id: int) -> bool:
    """检查是否在原料总表中"""
    conn = _connect()
    row = conn.execute("SELECT 1 FROM material_master WHERE type_id=?", (type_id,)).fetchone()
    conn.close()
    return row is not None


# ========== 分仓库管理 ==========

def list_warehouses(user_id: int) -> list:
    conn = _connect()
    rows = conn.execute(
        "SELECT w.*, (SELECT COUNT(*) FROM production_jobs p WHERE p.warehouse_id=w.id AND p.status='running') as active_lines "
        "FROM sub_warehouses w WHERE w.user_id=? ORDER BY w.id", (user_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_warehouse(user_id: int, name: str, character_name: str = "", station_name: str = "") -> tuple:
    conn = _connect()
    # 查最大行数
    row = conn.execute("SELECT COUNT(*) as cnt FROM sub_warehouses WHERE user_id=?", (user_id,)).fetchone()
    if row and row['cnt'] >= 20:
        conn.close()
        return False, "最多 20 个分仓库"
    conn.execute("INSERT INTO sub_warehouses (user_id, name, character_name, station_name) VALUES (?, ?, ?, ?)",
                (user_id, name, character_name, station_name))
    wid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    # 自动创建 5 条生产线
    for i in range(1, 6):
        conn.execute("INSERT INTO line_configs (warehouse_id, line_number) VALUES (?, ?)", (wid, i))
    conn.commit()
    conn.close()
    return True, "分仓库已创建"


def update_warehouse(wid: int, user_id: int, name: str = None, character_name: str = None, station_name: str = None) -> bool:
    conn = _connect()
    sets = []
    params = []
    if name is not None: sets.append("name=?"); params.append(name)
    if character_name is not None: sets.append("character_name=?"); params.append(character_name)
    if station_name is not None: sets.append("station_name=?"); params.append(station_name)
    if not sets: return True
    params.extend([wid, user_id])
    conn.execute(f"UPDATE sub_warehouses SET {', '.join(sets)} WHERE id=? AND user_id=?", params)
    conn.commit()
    conn.close()
    return True


def delete_warehouse(wid: int, user_id: int) -> bool:
    conn = _connect()
    conn.execute("DELETE FROM warehouse_inventory WHERE warehouse_id=?", (wid,))
    conn.execute("DELETE FROM line_configs WHERE warehouse_id=?", (wid,))
    conn.execute("DELETE FROM production_jobs WHERE warehouse_id=?", (wid,))
    conn.execute("DELETE FROM sub_warehouses WHERE id=? AND user_id=?", (wid, user_id))
    conn.commit()
    conn.close()
    return True


# ========== 生产线管理 ==========

def get_warehouse_config(warehouse_id: int, user_id: int) -> dict:
    """获取仓库统一加成配置"""
    conn = _connect()
    row = conn.execute(
        "SELECT * FROM sub_warehouses WHERE id=? AND user_id=?", (warehouse_id, user_id)).fetchone()
    conn.close()
    if not row:
        return {}
    w = dict(row)
    return {
        'me_level': int(w.get('me_level', 10) or 10),
        'te_level': int(w.get('te_level', 20) or 20),
        'skill_bonus': float(w.get('skill_bonus', 0.85) or 0.85),
        'building_bonus': float(w.get('building_bonus', 1.0) or 1.0),
        'implant_bonus': float(w.get('implant_bonus', 1.0) or 1.0),
    }


def save_warehouse_config(warehouse_id: int, user_id: int, config: dict) -> bool:
    conn = _connect()
    conn.execute(
        "UPDATE sub_warehouses SET me_level=?, te_level=?, skill_bonus=?, building_bonus=?, implant_bonus=?, "
        "updated_at=datetime('now') WHERE id=? AND user_id=?",
        (config.get('me_level', 10), config.get('te_level', 20),
         config.get('skill_bonus', 0.85), config.get('building_bonus', 1.0), config.get('implant_bonus', 1.0),
         warehouse_id, user_id))
    conn.commit()
    conn.close()
    return True


def get_line_configs(warehouse_id: int) -> list:
    conn = _connect()
    rows = conn.execute(
        "SELECT line_number, product_type_id FROM line_configs WHERE warehouse_id=? ORDER BY line_number",
        (warehouse_id,)).fetchall()
    conn.close()
    result = [dict(r) for r in rows]
    from .database import SDEDatabase
    sde = SDEDatabase()
    for r in result:
        if r['product_type_id'] and r['product_type_id'] > 0:
            r['product_name'] = sde.get_chinese_name(r['product_type_id'])
        else:
            r['product_name'] = ''
    return result


def get_reaction_configs(warehouse_id: int) -> list:
    conn = _connect()
    rows = conn.execute(
        "SELECT line_number, product_type_id FROM reaction_configs WHERE warehouse_id=? ORDER BY line_number",
        (warehouse_id,)).fetchall()
    conn.close()
    result = [dict(r) for r in rows]
    from .database import SDEDatabase
    sde = SDEDatabase()
    for r in result:
        if r['product_type_id'] and r['product_type_id'] > 0:
            r['product_name'] = sde.get_chinese_name(r['product_type_id'])
        else:
            r['product_name'] = ''
    return result


def save_reaction_config(warehouse_id: int, line_number: int, product_type_id: int,
                         price_mode: str = 'sell', price_discount: float = 1.0, custom_price: float = 0) -> bool:
    conn = _connect()
    conn.execute(
        "UPDATE reaction_configs SET product_type_id=?, price_mode=?, price_discount=?, custom_price=?, updated_at=datetime('now') "
        "WHERE warehouse_id=? AND line_number=?",
        (product_type_id, price_mode, price_discount, custom_price, warehouse_id, line_number))
    conn.commit()
    conn.close()
    return True


def set_reaction_count(warehouse_id: int, user_id: int, count: int) -> tuple:
    if count < 1 or count > 20:
        return False, "反应线数量须在 1-20 之间"
    conn = _connect()
    w = conn.execute("SELECT id FROM sub_warehouses WHERE id=? AND user_id=?", (warehouse_id, user_id)).fetchone()
    if not w:
        conn.close()
        return False, "分仓库不存在"
    existing = conn.execute("SELECT COUNT(*) as cnt FROM reaction_configs WHERE warehouse_id=?", (warehouse_id,)).fetchone()
    cur = existing['cnt'] if existing else 0
    if count > cur:
        for i in range(cur + 1, count + 1):
            conn.execute("INSERT OR IGNORE INTO reaction_configs (warehouse_id, line_number) VALUES (?, ?)", (warehouse_id, i))
    elif count < cur:
        conn.execute("DELETE FROM reaction_configs WHERE warehouse_id=? AND line_number > ?", (warehouse_id, count))
    conn.commit()
    conn.close()
    return True, "已更新"


def save_line_config(warehouse_id: int, line_number: int, product_type_id: int,
                     price_mode: str = 'sell', price_discount: float = 1.0, custom_price: float = 0) -> bool:
    conn = _connect()
    conn.execute(
        "UPDATE line_configs SET product_type_id=?, price_mode=?, price_discount=?, custom_price=?, updated_at=datetime('now') "
        "WHERE warehouse_id=? AND line_number=?",
        (product_type_id, price_mode, price_discount, custom_price, warehouse_id, line_number))
    conn.commit()
    conn.close()
    return True


def set_line_count(warehouse_id: int, user_id: int, count: int) -> tuple:
    """调整生产线数量"""
    if count < 1 or count > 20:
        return False, "生产线数量须在 1-20 之间"
    conn = _connect()
    # 验证拥有权
    w = conn.execute("SELECT id FROM sub_warehouses WHERE id=? AND user_id=?", (warehouse_id, user_id)).fetchone()
    if not w:
        conn.close()
        return False, "分仓库不存在"
    existing = conn.execute("SELECT COUNT(*) as cnt FROM line_configs WHERE warehouse_id=?", (warehouse_id,)).fetchone()
    cur = existing['cnt'] if existing else 0
    if count > cur:
        for i in range(cur + 1, count + 1):
            conn.execute("INSERT OR IGNORE INTO line_configs (warehouse_id, line_number) VALUES (?, ?)", (warehouse_id, i))
    elif count < cur:
        # 检查运行中的生产线
        running = conn.execute(
            "SELECT COUNT(*) as cnt FROM production_jobs p JOIN line_configs lc ON p.warehouse_id=lc.warehouse_id AND p.line_number=lc.line_number "
            "WHERE p.warehouse_id=? AND p.status='running' AND lc.line_number > ?",
            (warehouse_id, count)).fetchone()
        if running and running['cnt'] > 0:
            conn.close()
            return False, f"无法减少：第 {count+1} 条生产线之后还有 {running['cnt']} 条生产线正在运行"
        conn.execute("DELETE FROM line_configs WHERE warehouse_id=? AND line_number > ?", (warehouse_id, count))
    conn.commit()
    conn.close()
    return True, "已更新"


# ========== 库存管理 ==========

def get_inventory(warehouse_id: int) -> list:
    """获取分仓库库存"""
    conn = _connect()
    rows = conn.execute(
        "SELECT wi.*, mm.name_cn, mm.name_en FROM warehouse_inventory wi "
        "LEFT JOIN material_master mm ON wi.type_id=mm.type_id "
        "WHERE wi.warehouse_id=? AND wi.quantity>0 ORDER BY mm.name_cn", (warehouse_id,)).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        # 如果 material_master 没有名字，从 SDE 翻译表取
        if not d.get('name_cn') and not d.get('name_en'):
            from .database import SDEDatabase
            sde = SDEDatabase()
            sde_conn = sde._connect()
            row = sde_conn.execute(
                "SELECT tz.text as name_cn, it.typeName as name_en "
                "FROM invTypes it LEFT JOIN trnTranslations tz ON tz.tcID=8 AND tz.keyID=it.typeID AND tz.languageID='zh' "
                "WHERE it.typeID=?", (d['type_id'],)).fetchone()
            if row:
                d['name_cn'] = row['name_cn'] or row['name_en']
                d['name_en'] = row['name_en']
            sde_conn.close()
        result.append(d)
    return result


def get_all_inventory(user_id: int) -> list:
    """获取用户所有仓库库存汇总"""
    conn = _connect()
    rows = conn.execute(
        "SELECT wi.type_id, SUM(wi.quantity) as quantity, mm.name_cn, mm.name_en "
        "FROM warehouse_inventory wi "
        "JOIN sub_warehouses sw ON wi.warehouse_id=sw.id "
        "LEFT JOIN material_master mm ON wi.type_id=mm.type_id "
        "WHERE sw.user_id=? AND wi.quantity>0 GROUP BY wi.type_id ORDER BY mm.name_cn",
        (user_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def import_inventory(warehouse_id: int, user_id: int, items: list, mode: str = 'append'):
    """
    导入库存
    items: [{'type_id': 1234, 'quantity': 100}, ...]
    mode: 'append' 累加 / 'override' 覆盖
    """
    conn = _connect()
    w = conn.execute("SELECT id FROM sub_warehouses WHERE id=? AND user_id=?", (warehouse_id, user_id)).fetchone()
    if not w:
        conn.close()
        return False, "分仓库不存在"
    if mode == 'override':
        conn.execute("DELETE FROM warehouse_inventory WHERE warehouse_id=?", (warehouse_id,))
    for item in items:
        tid = item['type_id']
        qty = item['quantity']
        conn.execute(
            "INSERT INTO warehouse_inventory (warehouse_id, type_id, quantity, updated_at) VALUES (?, ?, ?, datetime('now')) "
            "ON CONFLICT(warehouse_id, type_id) DO UPDATE SET quantity=quantity+?, updated_at=datetime('now')",
            (warehouse_id, tid, qty, qty))
    conn.commit()
    conn.close()
    return True, "导入成功"


def parse_game_clipboard(text: str) -> list:
    """解析游戏剪贴板内容，返回 [{'name': 'xxx', 'quantity': N}, ...]"""
    from .estimator import parse_item_line
    lines = text.strip().split('\n')
    results = []
    for line in lines:
        items = parse_item_line(line)
        for name, qty in items:
            results.append({'name': name, 'quantity': qty})
    return results


def manual_add_material(warehouse_id: int, user_id: int, type_id: int, quantity: int) -> tuple:
    """手动添加/修改仓库物料"""
    if quantity < 0:
        return False, "数量不能为负数"
    conn = _connect()
    w = conn.execute("SELECT id FROM sub_warehouses WHERE id=? AND user_id=?", (warehouse_id, user_id)).fetchone()
    if not w:
        conn.close()
        return False, "分仓库不存在"
    if quantity == 0:
        conn.execute("DELETE FROM warehouse_inventory WHERE warehouse_id=? AND type_id=?", (warehouse_id, type_id))
    else:
        conn.execute(
            "INSERT INTO warehouse_inventory (warehouse_id, type_id, quantity, updated_at) VALUES (?, ?, ?, datetime('now')) "
            "ON CONFLICT(warehouse_id, type_id) DO UPDATE SET quantity=?, updated_at=datetime('now')",
            (warehouse_id, type_id, quantity, quantity))
    conn.commit()
    conn.close()
    return True, "已更新"


# ========== 生产任务 ==========

def calculate_material_requirements(product_type_id: int, quantity: int, me_level: int = 10, te_level: int = 20) -> tuple:
    """
    计算生产需求
    材料量 = 原始量 × (1 - ME×0.01)
    返回 (materials, production_time_seconds)
    """
    from .database import SDEDatabase

    sde = SDEDatabase()
    bp_mats = sde.get_manufacturing_materials(product_type_id)
    if not bp_mats:
        return [], 0

    me_factor = 1.0 - (me_level * 0.01)
    if me_factor < 0.5:
        me_factor = 0.5

    materials = []
    for mid, base_qty in bp_mats.items():
        actual_qty = max(1, int(base_qty * quantity * me_factor + 0.5))
        name_cn = sde.get_chinese_name(mid)
        materials.append({'type_id': mid, 'name_cn': name_cn, 'quantity': actual_qty})

    prod_time = sde.get_manufacturing_time(product_type_id)
    te_factor = 1.0 - (te_level * 0.01)
    if te_factor < 0.5:
        te_factor = 0.5
    adjusted_time = int(prod_time * te_factor)

    return materials, adjusted_time

    # 材料效率系数
    waste_factor = 1.0 - (me_level * 0.005)  # 每级 ME 减少 0.5% 浪费
    if waste_factor < 0.5:
        waste_factor = 0.5  # ME 10 是 50%（基础）
    # 技能加成
    skill_factor = skill_bonus
    # 建筑/脑插加成
    facility_factor = building_bonus * implant_bonus

    total_factor = waste_factor * skill_factor * facility_factor

    materials = []
    for mid, base_qty in bp_mats.items():
        actual_qty = max(1, int(base_qty * quantity * total_factor + 0.5))
        name_cn = sde.get_chinese_name(mid)
        materials.append({'type_id': mid, 'name_cn': name_cn, 'quantity': actual_qty})

    # 生产时间
    prod_time = sde.get_manufacturing_time(product_type_id)
    # TE 加成（每级 1%）
    te_factor = 1.0 - (te_level * 0.01)
    if te_factor < 0.5:
        te_factor = 0.5
    adjusted_time = int(prod_time * te_factor * (1.0 / building_bonus))

    return materials, adjusted_time


def start_production(warehouse_id: int, line_number: int, user_id: int,
                     product_type_id: int, quantity: int = 1,
                     time_skill: int = 32, time_build: int = 30, time_rig: int = 0,
                     mat_rig: float = 3.8, mat_build: float = 0, mat_implant: float = 0) -> tuple:
    """启动生产线"""
    from .database import SDEDatabase
    sde = SDEDatabase()

    conn = _connect()
    row = conn.execute("SELECT * FROM sub_warehouses WHERE id=? AND user_id=?", (warehouse_id, user_id)).fetchone()
    if not row:
        conn.close()
        return False, "分仓库不存在"
    w = dict(row)

    # 检查生产线是否空闲
    running = conn.execute(
        "SELECT id FROM production_jobs WHERE warehouse_id=? AND line_number=? AND status='running'",
        (warehouse_id, line_number)).fetchone()
    if running:
        conn.close()
        return False, "该生产线正在运行"

    # 检查生产线是否配置了产品
    cfg = conn.execute(
        "SELECT product_type_id FROM line_configs WHERE warehouse_id=? AND line_number=?",
        (warehouse_id, line_number)).fetchone()
    if not cfg or not cfg['product_type_id']:
        conn.close()
        return False, "该生产线未配置产品"

    me = int(w.get('me_level', 10) or 10)
    te = int(w.get('te_level', 20) or 20)

    # 计算需求
    materials, prod_time = calculate_material_requirements(
        product_type_id, quantity, me, te)
    if not materials:
        conn.close()
        return False, "该物品无制造配方"

    # 检查库存是否足够
    shortage = []
    for m in materials:
        row = conn.execute(
            "SELECT quantity FROM warehouse_inventory WHERE warehouse_id=? AND type_id=?",
            (warehouse_id, m['type_id'])).fetchone()
        available = row['quantity'] if row else 0
        if available < m['quantity']:
            shortage.append({'type_id': m['type_id'], 'name_cn': m['name_cn'],
                             'required': m['quantity'], 'available': available, 'missing': m['quantity'] - available})

    if shortage:
        conn.close()
        return False, f"材料不足，缺少 {len(shortage)} 种物料"

    # 扣除材料（含插件减材）
    mat_rig_factor = (100 - mat_rig) / 100
    mat_build_factor = (100 - mat_build) / 100
    mat_implant_factor = (100 - mat_implant) / 100
    line_mat_reduction = mat_rig_factor * mat_build_factor * mat_implant_factor
    deducted_materials = []
    for m in materials:
        actual_qty = max(1, int(m['quantity'] * line_mat_reduction + 0.5))
        deducted_materials.append({'type_id': m['type_id'], 'quantity': actual_qty})
        conn.execute(
            "UPDATE warehouse_inventory SET quantity=quantity-?, updated_at=datetime('now') "
            "WHERE warehouse_id=? AND type_id=?",
            (actual_qty, warehouse_id, m['type_id']))

    # 计算成本快照（锁定启动时的利润）
    from .market import MarketAPI
    mk = MarketAPI()
    type_ids = [m['type_id'] for m in materials] + [product_type_id]
    prices = mk.get_prices_batch(type_ids)
    line_price_cfg = conn.execute(
        "SELECT price_mode, price_discount, custom_price FROM line_configs WHERE warehouse_id=? AND line_number=?",
        (warehouse_id, line_number)).fetchone()
    if line_price_cfg:
        pm, pd, cp = line_price_cfg['price_mode'] or 'sell', line_price_cfg['price_discount'] or 1.0, line_price_cfg['custom_price'] or 0
    else:
        pm, pd, cp = 'sell', 1.0, 0
    prod_p = prices.get(product_type_id, {})
    market_sell = prod_p.get('sell_min', 0)
    market_buy = prod_p.get('buy_max', 0)
    if pm == 'sell':
        unit_price = market_sell * pd
    elif pm == 'buy':
        unit_price = market_buy * pd
    else:
        unit_price = cp
    # 粗略计算材料成本（含生产线减材，不带比率，只记市场价）
    bp_cost = 0
    for m in materials:
        mp = prices.get(m['type_id'], {})
        adj_qty = max(1, int(m['quantity'] * line_mat_reduction + 0.5))
        bp_cost += (mp.get('sell_min', 0) or 0) * adj_qty
    total_revenue = unit_price * quantity
    # 计算基础材料成本（调用 bom）
    from .calculator import ProfitCalculator, ManufacturingConfig
    calc = ProfitCalculator(sde, mk, ManufacturingConfig(blueprint_me_level=me, blueprint_te_level=te, system_cost_index=0, structure_bonus=0, facility_tax=0))
    try:
        bom_result = calc.calculate_with_modes(product_type_id, use_bom=True)
        deep_cost = sum((bm.get('total_sell', 0) or 0) for bm in (bom_result.get('deep_materials') or [])) * quantity
    except:
        deep_cost = 0

    # 创建生产任务——重新计算时间（含 TE + 技能/建筑/插头加成）
    t_skill = (100 - time_skill) / 100
    t_build = (100 - time_build) / 100
    t_rig = (100 - time_rig) / 100
    adjusted_prod_time = int(prod_time * t_skill * t_build * t_rig)
    if adjusted_prod_time < 60:
        adjusted_prod_time = 60
    now = datetime.now()
    end_time = now + timedelta(seconds=adjusted_prod_time)
    config_snapshot = json.dumps({
        'me': me, 'te': te,
        'materials': materials,
        'deducted_materials': deducted_materials,
        'cost_snapshot': {
            'bp_cost': round(bp_cost, 2),
            'deep_cost': round(deep_cost, 2),
            'total_revenue': round(total_revenue, 2),
            'market_sell': market_sell,
            'market_buy': market_buy,
            'unit_price': round(unit_price, 2),
            'price_mode': pm,
            'price_discount': pd,
            'custom_price': cp,
            'profit_bp': round(total_revenue - bp_cost, 2),
            'profit_deep': round(total_revenue - bp_cost - deep_cost, 2),
        }
    })
    conn.execute(
        "INSERT INTO production_jobs (warehouse_id, line_number, user_id, product_type_id, quantity, "
        "started_at, estimated_end_at, status, config_snapshot) "
        "VALUES (?, ?, ?, ?, ?, datetime('now'), ?, 'running', ?)",
        (warehouse_id, line_number, user_id, product_type_id, quantity,
         end_time.strftime('%Y-%m-%d %H:%M:%S'), config_snapshot))
    job_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    return True, {
        'job_id': job_id,
        'product_name': sde.get_chinese_name(product_type_id),
        'estimated_end_at': end_time.strftime('%Y-%m-%d %H:%M:%S'),
        'materials': materials
    }


def collect_production(job_id: int, user_id: int) -> tuple:
    """收付：完成生产"""
    conn = _connect()
    job = conn.execute(
        "SELECT p.*, sw.user_id as owner_id FROM production_jobs p "
        "JOIN sub_warehouses sw ON p.warehouse_id=sw.id WHERE p.id=?", (job_id,)).fetchone()
    if not job or job['owner_id'] != user_id:
        conn.close()
        return False, "生产任务不存在"
    if job['status'] != 'completed':
        # 如果还没到时间但用户手动收付，允许
        pass
    conn.execute("UPDATE production_jobs SET status='collected', actual_end_at=datetime('now') WHERE id=?", (job_id,))
    conn.commit()
    conn.close()
    return True, "已收付"


def cancel_production(job_id: int, user_id: int) -> tuple:
    """取消生产，材料回退"""
    conn = _connect()
    job = conn.execute(
        "SELECT p.*, sw.user_id as owner_id FROM production_jobs p "
        "JOIN sub_warehouses sw ON p.warehouse_id=sw.id WHERE p.id=?", (job_id,)).fetchone()
    if not job or job['owner_id'] != user_id:
        conn.close()
        return False, "生产任务不存在"
    if job['status'] != 'running':
        conn.close()
        return False, "只有运行中的任务可以取消"

    # 材料回退
    cfg = json.loads(job['config_snapshot']) if job['config_snapshot'] else {}
    materials = cfg.get('deducted_materials') or cfg.get('materials', [])
    for m in materials:
        conn.execute(
            "INSERT INTO warehouse_inventory (warehouse_id, type_id, quantity, updated_at) VALUES (?, ?, ?, datetime('now')) "
            "ON CONFLICT(warehouse_id, type_id) DO UPDATE SET quantity=quantity+?, updated_at=datetime('now')",
            (job['warehouse_id'], m['type_id'], m['quantity'], m['quantity']))

    conn.execute("UPDATE production_jobs SET status='cancelled', actual_end_at=datetime('now') WHERE id=?", (job_id,))
    conn.commit()
    conn.close()
    return True, "已取消，材料已回退"


def adjust_production_time(job_id: int, user_id: int, new_end_time: str) -> tuple:
    """手动调整倒计时"""
    conn = _connect()
    job = conn.execute(
        "SELECT p.*, sw.user_id as owner_id FROM production_jobs p "
        "JOIN sub_warehouses sw ON p.warehouse_id=sw.id WHERE p.id=?", (job_id,)).fetchone()
    if not job or job['owner_id'] != user_id:
        conn.close()
        return False, "生产任务不存在"
    if job['status'] != 'running':
        conn.close()
        return False, "只有运行中的任务可调整时间"
    conn.execute("UPDATE production_jobs SET estimated_end_at=? WHERE id=?", (new_end_time, job_id))
    conn.commit()
    conn.close()
    return True, "已调整"


def get_production_jobs(warehouse_id: int = None, user_id: int = None, status: str = None) -> list:
    """查询生产任务"""
    conn = _connect()
    sql = ("SELECT p.*, sw.name as warehouse_name "
           "FROM production_jobs p "
           "LEFT JOIN sub_warehouses sw ON p.warehouse_id=sw.id WHERE 1=1")
    params = []
    if warehouse_id:
        sql += " AND p.warehouse_id=?"
        params.append(warehouse_id)
    if user_id:
        sql += " AND p.user_id=?"
        params.append(user_id)
    if status:
        sql += " AND p.status=?"
        params.append(status)
    sql += " ORDER BY p.started_at DESC"
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    result = [dict(r) for r in rows]
    # 补充产品中文名
    from .database import SDEDatabase
    sde = SDEDatabase()
    for r in result:
        if r['product_type_id']:
            r['product_name'] = sde.get_chinese_name(r['product_type_id'])
    return result


# ========== 缺口统计 ==========

def calc_shortage(warehouse_id: int, user_id: int, mat_rig: float = 3.8,
                  mat_build: float = 0, mat_implant: float = 0) -> dict:
    """统计分仓库所有生产线物料缺口"""
    conn = _connect()
    w = conn.execute("SELECT * FROM sub_warehouses WHERE id=? AND user_id=?", (warehouse_id, user_id)).fetchone()
    if not w:
        conn.close()
        return {}
    wd = dict(w)

    lines = conn.execute(
        "SELECT * FROM line_configs WHERE warehouse_id=? AND product_type_id>0",
        (warehouse_id,)).fetchall()
    if not lines:
        conn.close()
        return {}

    # 排除已有运行中任务的线（材料已扣除）
    running_lines = set()
    rows = conn.execute(
        "SELECT DISTINCT line_number FROM production_jobs WHERE warehouse_id=? AND status='running'",
        (warehouse_id,)).fetchall()
    for r in rows:
        running_lines.add(r['line_number'])
    lines = [l for l in lines if l['line_number'] not in running_lines]

    if not lines:
        conn.close()
        return {}

    from .database import SDEDatabase
    sde = SDEDatabase()

    me = int(wd.get('me_level', 10) or 10)
    te = int(wd.get('te_level', 20) or 20)

    total_required = {}
    line_details = []
    rig_factor = ((100 - mat_rig) / 100) * ((100 - mat_build) / 100) * ((100 - mat_implant) / 100)

    for line in lines:
        cfg = dict(line)
        materials, _ = calculate_material_requirements(
            cfg['product_type_id'], 1, me, te)
        line_mats = []
        for m in materials:
            adj_qty = max(1, int(m['quantity'] * rig_factor + 0.5))
            line_mats.append({'type_id': m['type_id'], 'name_cn': m['name_cn'], 'quantity': adj_qty})
            if m['type_id'] in total_required:
                total_required[m['type_id']]['required'] += adj_qty
            else:
                total_required[m['type_id']] = {'required': adj_qty, 'name_cn': m['name_cn']}
        line_details.append({
            'line_number': cfg['line_number'],
            'product_name': sde.get_chinese_name(cfg['product_type_id']),
            'product_type_id': cfg['product_type_id'],
            'materials': line_mats
        })

    # 查库存
    for tid in total_required:
        row = conn.execute(
            "SELECT quantity FROM warehouse_inventory WHERE warehouse_id=? AND type_id=?",
            (warehouse_id, tid)).fetchone()
        available = row['quantity'] if row else 0
        total_required[tid]['available'] = available
        total_required[tid]['missing'] = max(0, total_required[tid]['required'] - available)

    conn.close()
    return {
        'lines': line_details,
        'total_required': total_required,
        'total_lines': len(lines),
        'shortage_types': sum(1 for v in total_required.values() if v['missing'] > 0)
    }


# ========== 制造订单 ==========

def create_order(user_id: int, customer_name: str, items: list,
                 delivery_location: str = "游戏内对接",
                 pricing_mode: str = "sell", discount: float = 1.0) -> tuple:
    """创建制造订单"""
    from .market import get_prices_batch
    type_ids = [i['type_id'] for i in items]
    prices = get_prices_batch(type_ids)
    total = 0
    for i in items:
        tid = i['type_id']
        price = prices.get(tid, {})
        base = price.get('sell_min', 0) if pricing_mode == 'sell' else price.get('buy_max', 0)
        i['unit_price'] = base
        i['total'] = round(base * i['quantity'] * discount, 2)
        total += i['total']

    conn = _connect()
    conn.execute(
        "INSERT INTO manufacturing_orders (user_id, customer_name, delivery_location, items, pricing_mode, discount, estimated_total) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, customer_name, delivery_location, json.dumps(items, ensure_ascii=False),
         pricing_mode, discount, total))
    conn.commit()
    conn.close()
    return True, "订单已创建", total


def get_orders(user_id: int, status: str = None) -> list:
    """获取用户的制造订单"""
    conn = _connect()
    sql = "SELECT * FROM manufacturing_orders WHERE user_id=?"
    params = [user_id]
    if status:
        sql += " AND status=?"
        params.append(status)
    sql += " ORDER BY created_at DESC"
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_order_status(order_id: int, user_id: int, status: str) -> tuple:
    conn = _connect()
    conn.execute("UPDATE manufacturing_orders SET status=? WHERE id=? AND user_id=?", (status, order_id, user_id))
    conn.commit()
    conn.close()
    return True, "已更新"


# ========== 检查超时任务、发送通知 ==========

def check_completed_jobs(user_id: int = None) -> list:
    """返回所有已到期但仍为 running 状态的任务"""
    conn = _connect()
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    if user_id:
        rows = conn.execute(
            "SELECT p.*, sw.user_id as owner_id FROM production_jobs p "
            "JOIN sub_warehouses sw ON p.warehouse_id=sw.id "
            "WHERE p.estimated_end_at<=? AND p.status='running' AND sw.user_id=?",
            (now, user_id)).fetchall()
    else:
        rows = conn.execute(
            "SELECT p.*, sw.user_id as owner_id FROM production_jobs p "
            "JOIN sub_warehouses sw ON p.warehouse_id=sw.id "
            "WHERE p.estimated_end_at<=? AND p.status='running'",
            (now,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def mark_jobs_completed(ids: list) -> int:
    """标记任务为已完成"""
    if not ids:
        return 0
    conn = _connect()
    placeholders = ','.join('?' * len(ids))
    conn.execute(f"UPDATE production_jobs SET status='completed', actual_end_at=datetime('now') WHERE id IN ({placeholders})", ids)
    conn.commit()
    count = conn.execute("SELECT changes()").fetchone()[0]
    conn.close()
    return count
