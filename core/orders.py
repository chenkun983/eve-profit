"""订单系统"""
import sqlite3, os, json, time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE, 'data', 'users.db')

def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def _now():
    from datetime import datetime
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')

def _deadline(days=14):
    from datetime import datetime, timedelta
    return (datetime.now() + timedelta(days=days)).strftime('%Y-%m-%d %H:%M:%S')

# ========== 订单 CRUD ==========

def create_order(user_id, order_type, items, contact_name='', delivery_location='游戏内对接', notes='',
                 pricing_mode='sell', discount=1.0):
    """创建订单，items: [{type_id, name, qty, expected_price, notes}]"""
    total = sum(i.get('expected_price', 0) * i.get('qty', 0) for i in items)
    items_json = json.dumps(items, ensure_ascii=False)
    conn = _connect()
    conn.execute(
        "INSERT INTO orders (user_id, type, contact_name, delivery_location, notes, items, pricing_mode, discount, estimated_total) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (user_id, order_type, contact_name, delivery_location, notes, items_json, pricing_mode, discount, round(total, 2)))
    oid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()
    return oid


def get_public_orders():
    """获取公共池有效订单（未过期、公开状态、有剩余数量）"""
    conn = _connect()
    rows = conn.execute(
        "SELECT o.*, u.username FROM orders o JOIN users u ON o.user_id=u.id "
        "WHERE o.status='public' AND o.deadline > datetime('now') ORDER BY o.created_at DESC"
    ).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        items = json.loads(d['items'])
        # 过滤出还有剩余数量的订单
        has_remaining = any(i.get('remaining', i['qty']) > 0 for i in items)
        if has_remaining:
            d['items'] = items
            result.append(d)
    return result


def get_user_orders(user_id):
    """获取用户的所有订单（我发布的）"""
    conn = _connect()
    rows = conn.execute(
        "SELECT o.*, u.username FROM orders o JOIN users u ON o.user_id=u.id "
        "WHERE o.user_id=? ORDER BY o.created_at DESC", (user_id,)).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d['items'] = json.loads(d['items'])
        # 获取该订单的接单情况
        accs = _get_acceptances(d['id'])
        d['acceptances'] = accs
        result.append(d)
    return result


def get_my_acceptances(user_id):
    """获取我接受的订单"""
    conn = _connect()
    rows = conn.execute(
        "SELECT oa.*, o.contact_name, o.delivery_location, o.items as o_items, o.status as o_status, "
        "o.created_at as o_created_at, o.deadline, o.user_id as order_owner_id, o.type as order_type, "
        "u.username as order_owner_name "
        "FROM order_acceptances oa "
        "JOIN orders o ON oa.order_id=o.id "
        "JOIN users u ON o.user_id=u.id "
        "WHERE oa.accepted_by=? ORDER BY oa.created_at DESC", (user_id,)).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d['items'] = json.loads(d['o_items'])
        result.append(d)
    return result


def _get_acceptances(order_id):
    conn = _connect()
    rows = conn.execute(
        "SELECT oa.*, u.username as acceptor_name FROM order_acceptances oa "
        "JOIN users u ON oa.accepted_by=u.id WHERE oa.order_id=? ORDER BY oa.created_at DESC",
        (order_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_order_detail(order_id):
    conn = _connect()
    row = conn.execute(
        "SELECT o.*, u.username FROM orders o JOIN users u ON o.user_id=u.id WHERE o.id=?",
        (order_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d['items'] = json.loads(d['items'])
    d['acceptances'] = _get_acceptances(order_id)
    return d


def accept_order(order_id, user_id, items_accepted, expected_days=0, notes=''):
    """
    接受订单的部分或全部物品
    items_accepted: [{item_index, qty}]
    """
    conn = _connect()
    order = conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
    if not order or order['status'] != 'public':
        conn.close()
        return False, "订单不可接单"
    if order['user_id'] == user_id:
        conn.close()
        return False, "不能接自己的订单"
    # 采购单仅制造商可接
    if order['type'] == 'buy':
        from auth import get_user_role
        role = get_user_role(user_id)
        if role not in ('manufacturer', 'admin', 'super_admin'):
            conn.close()
            return False, "仅制造商可接采购单"
    items = json.loads(order['items'])
    for acc in items_accepted:
        idx = acc['item_index']
        qty = acc['qty']
        if idx < 0 or idx >= len(items):
            conn.close()
            return False, f"物品索引 {idx} 无效"
        remaining = items[idx].get('remaining', items[idx]['qty'])
        if qty <= 0 or qty > remaining:
            conn.close()
            return False, f"物品 {items[idx]['name']} 接单数量超出剩余"
        items[idx]['remaining'] = remaining - qty
        init_status = 'pending' if order['type'] == 'sell' else 'delivering'
        conn.execute(
            "INSERT INTO order_acceptances (order_id, item_index, accepted_by, qty, expected_days, notes, status) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (order_id, idx, user_id, qty, expected_days, notes, init_status))
    # 更新订单物品剩余量
    all_zero = all(i.get('remaining', i['qty']) == 0 for i in items)
    conn.execute("UPDATE orders SET items=? WHERE id=?", (json.dumps(items, ensure_ascii=False), order_id))
    if all_zero:
        conn.execute("UPDATE orders SET status='completed' WHERE id=?", (order_id,))
    conn.commit()
    conn.close()
    return True, "接单成功"


def update_acceptance_status(acc_id, user_id, new_status):
    """更新接单状态
    采购单: 制造商接→制造→交付(delivered)→下单人确认(completed)
    出售单: 买家接→卖家交货(delivered)→买家确认(completed)
    """
    conn = _connect()
    acc = conn.execute("SELECT * FROM order_acceptances WHERE id=?", (acc_id,)).fetchone()
    if not acc:
        conn.close()
        return False, "接单记录不存在"
    order = conn.execute("SELECT * FROM orders WHERE id=?", (acc['order_id'],)).fetchone()
    if not order:
        conn.close()
        return False, "订单不存在"
    is_sell = order['type'] == 'sell'
    # 权限检查
    if new_status == 'delivering':
        # pending → delivering（仅采购单：制造商自确认）
        if is_sell:
            conn.close()
            return False, "出售单无需此操作"
        if acc['accepted_by'] != user_id and order['user_id'] != user_id:
            conn.close()
            return False, "无权操作"
        if acc['status'] != 'pending':
            conn.close()
            return False, "当前状态不允许此操作"
    elif new_status == 'delivered':
        # 采购单：制造商(接单方)交付
        # 出售单：卖家(下单方)交货
        if is_sell:
            if order['user_id'] != user_id:
                conn.close()
                return False, "无权操作"
        else:
            if acc['accepted_by'] != user_id:
                conn.close()
                return False, "无权操作"
    elif new_status == 'completed':
        # 采购单：下单人确认
        # 出售单：买家(接单方)确认
        if is_sell:
            if acc['accepted_by'] != user_id:
                conn.close()
                return False, "无权操作"
        else:
            if order['user_id'] != user_id:
                conn.close()
                return False, "无权操作"
    elif new_status == 'cancelled':
        # 接单方或下单方都可取消
        if acc['accepted_by'] != user_id and order['user_id'] != user_id:
            conn.close()
            return False, "无权操作"
        # 退回数量到订单
        items = json.loads(order['items'])
        item = items[acc['item_index']]
        item['remaining'] = item.get('remaining', item['qty']) + acc['qty']
        conn.execute("UPDATE orders SET items=? WHERE id=?", (json.dumps(items, ensure_ascii=False), order['id']))
    conn.execute("UPDATE order_acceptances SET status=? WHERE id=?", (new_status, acc_id))
    conn.commit()
    conn.close()
    return True, "已更新"


def check_expired_orders():
    """将过期订单标记为 expired，并将超时未确认的接单自动完成"""
    conn = _connect()
    # 订单过期
    conn.execute("UPDATE orders SET status='expired' WHERE status='public' AND deadline < datetime('now')")
    affected = conn.execute("SELECT changes()").fetchone()[0]
    # 采购单：已交付超5天自动确认收货
    conn.execute("""
        UPDATE order_acceptances SET status='completed'
        WHERE status='delivered' AND order_id IN (
            SELECT id FROM orders WHERE type='buy'
        ) AND datetime(created_at, '+5 days') < datetime('now')
    """)
    buy_auto = conn.execute("SELECT changes()").fetchone()[0]
    # 出售单：已交付超3天自动确认收货
    conn.execute("""
        UPDATE order_acceptances SET status='completed'
        WHERE status='delivered' AND order_id IN (
            SELECT id FROM orders WHERE type='sell'
        ) AND datetime(created_at, '+3 days') < datetime('now')
    """)
    sell_auto = conn.execute("SELECT changes()").fetchone()[0]
    conn.commit()
    conn.close()
    total_auto = buy_auto + sell_auto
    if total_auto > 0:
        print(f"[Auto] 自动确认 {buy_auto} 个采购单 + {sell_auto} 个出售单")
    return affected


# ========== 用户资料 ==========

def update_game_contact(user_id, contact):
    conn = _connect()
    conn.execute("UPDATE users SET game_contact=? WHERE id=?", (contact, user_id))
    conn.commit()
    conn.close()
    return True


def get_game_contact(user_id):
    conn = _connect()
    row = conn.execute("SELECT game_contact FROM users WHERE id=?", (user_id,)).fetchone()
    conn.close()
    return row['game_contact'] if row else ''
