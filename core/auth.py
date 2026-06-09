"""用户认证与数据库（SQLite）"""
import sqlite3
import os
import hashlib
import secrets
import time
from datetime import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE, 'data', 'users.db')


def _connect():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = _connect()
    # 兼容旧表迁移
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            email TEXT DEFAULT '',
            is_admin INTEGER DEFAULT 0,
            role TEXT DEFAULT 'user',
            manufacturer_expires_at TEXT DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );
        
        CREATE TABLE IF NOT EXISTS tokens (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at REAL NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS watchlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type_id INTEGER NOT NULL,
            name_cn TEXT,
            added_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, type_id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS ranking_cache (
            cache_key TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            cached_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS material_overrides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            product_type_id INTEGER NOT NULL,
            material_type_id INTEGER NOT NULL,
            pricing_mode TEXT NOT NULL DEFAULT 'sell',
            UNIQUE(user_id, product_type_id, material_type_id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id INTEGER NOT NULL,
            setting_key TEXT NOT NULL,
            setting_value TEXT NOT NULL DEFAULT '',
            UNIQUE(user_id, setting_key),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            app_type TEXT NOT NULL DEFAULT 'manufacturer',
            payment_id TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            reviewed_by INTEGER DEFAULT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS activation_codes (
            code TEXT PRIMARY KEY,
            duration_days INTEGER NOT NULL DEFAULT 30,
            max_uses INTEGER NOT NULL DEFAULT 1,
            used_count INTEGER NOT NULL DEFAULT 0,
            created_by INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            expires_at TEXT DEFAULT NULL,
            FOREIGN KEY(created_by) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS visit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            visited_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_user_id INTEGER NOT NULL,
            to_user_id INTEGER NOT NULL DEFAULT 0,
            title TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            is_read INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY(from_user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS admin_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT NOT NULL DEFAULT ''
        );
    """)
    conn.commit()
    # 初始化默认设置
    conn.execute("INSERT OR IGNORE INTO admin_settings (setting_key, setting_value) VALUES ('payment_recipient', '未设置')")
    conn.execute("INSERT OR IGNORE INTO admin_settings (setting_key, setting_value) VALUES ('free_trial_enabled', '0')")
    conn.execute("INSERT OR IGNORE INTO admin_settings (setting_key, setting_value) VALUES ('free_trial_days', '30')")
    conn.commit()
    # 迁移：兼容旧表（可能缺少某些列）
    try:
        conn.execute("ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''")
    except:
        pass
    try:
        conn.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0")
    except:
        pass
    try:
        conn.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'")
    except:
        pass
    try:
        conn.execute("ALTER TABLE users ADD COLUMN manufacturer_expires_at TEXT DEFAULT NULL")
    except:
        pass
    # 迁移：messages 表增加已处理标记
    try:
        conn.execute("ALTER TABLE messages ADD COLUMN is_processed INTEGER DEFAULT 0")
    except:
        pass
    # 迁移：工业管理系统表
    # 分仓库表加统一加成字段
    try:
        conn.execute("ALTER TABLE sub_warehouses ADD COLUMN me_level INTEGER DEFAULT 10")
    except:
        pass
    try:
        conn.execute("ALTER TABLE sub_warehouses ADD COLUMN te_level INTEGER DEFAULT 20")
    except:
        pass
    try:
        conn.execute("ALTER TABLE sub_warehouses ADD COLUMN skill_bonus REAL DEFAULT 0.85")
    except:
        pass
    try:
        conn.execute("ALTER TABLE sub_warehouses ADD COLUMN building_bonus REAL DEFAULT 1.0")
    except:
        pass
    try:
        conn.execute("ALTER TABLE sub_warehouses ADD COLUMN implant_bonus REAL DEFAULT 1.0")
    except:
        pass
    # 线配置加价格字段
    try:
        conn.execute("ALTER TABLE line_configs ADD COLUMN price_mode TEXT DEFAULT 'sell'")
    except:
        pass
    try:
        conn.execute("ALTER TABLE production_jobs ADD COLUMN activity_type TEXT DEFAULT 'manufacturing'")
    except:
        pass
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS reaction_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            warehouse_id INTEGER NOT NULL,
            line_number INTEGER NOT NULL,
            product_type_id INTEGER DEFAULT 0,
            price_mode TEXT DEFAULT 'sell',
            price_discount REAL DEFAULT 1.0,
            custom_price REAL DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(warehouse_id, line_number),
            FOREIGN KEY(warehouse_id) REFERENCES sub_warehouses(id) ON DELETE CASCADE
        );
    """)
    try:
        conn.execute("ALTER TABLE line_configs ADD COLUMN price_discount REAL DEFAULT 1.0")
    except:
        pass
    try:
        conn.execute("ALTER TABLE line_configs ADD COLUMN custom_price REAL DEFAULT 0")
    except:
        pass
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS material_master (
            type_id INTEGER PRIMARY KEY,
            name_cn TEXT NOT NULL DEFAULT '',
            name_en TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS manufacturable_cache (
            type_id INTEGER PRIMARY KEY,
            name_cn TEXT NOT NULL DEFAULT '',
            name_en TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS reaction_cache (
            type_id INTEGER PRIMARY KEY,
            name_cn TEXT NOT NULL DEFAULT '',
            name_en TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS sub_warehouses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            character_name TEXT DEFAULT '',
            station_name TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS warehouse_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            warehouse_id INTEGER NOT NULL,
            type_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(warehouse_id, type_id),
            FOREIGN KEY(warehouse_id) REFERENCES sub_warehouses(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS line_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            warehouse_id INTEGER NOT NULL,
            line_number INTEGER NOT NULL,
            product_type_id INTEGER DEFAULT 0,
            me_level INTEGER DEFAULT 10,
            te_level INTEGER DEFAULT 20,
            skill_bonus REAL DEFAULT 0.85,
            building_bonus REAL DEFAULT 1.0,
            implant_bonus REAL DEFAULT 1.0,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(warehouse_id, line_number),
            FOREIGN KEY(warehouse_id) REFERENCES sub_warehouses(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS production_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            warehouse_id INTEGER NOT NULL,
            line_number INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            product_type_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            batch_size INTEGER NOT NULL DEFAULT 1,
            started_at TEXT DEFAULT (datetime('now')),
            estimated_end_at TEXT NOT NULL,
            actual_end_at TEXT DEFAULT NULL,
            status TEXT NOT NULL DEFAULT 'running',
            config_snapshot TEXT DEFAULT '{}',
            FOREIGN KEY(warehouse_id) REFERENCES sub_warehouses(id)
        );
        CREATE TABLE IF NOT EXISTS manufacturing_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            customer_name TEXT NOT NULL,
            delivery_location TEXT DEFAULT '游戏内对接',
            items TEXT NOT NULL DEFAULT '[]',
            pricing_mode TEXT NOT NULL DEFAULT 'sell',
            discount REAL NOT NULL DEFAULT 1.0,
            estimated_total REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS manufacturing_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            warehouse_id INTEGER NOT NULL,
            product_type_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            materials_cost REAL NOT NULL DEFAULT 0,
            sell_price REAL NOT NULL DEFAULT 0,
            profit REAL NOT NULL DEFAULT 0,
            started_at TEXT NOT NULL,
            completed_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
    """)
    # 迁移：users 表加游戏联系人字段
    try:
        conn.execute("ALTER TABLE users ADD COLUMN game_contact TEXT DEFAULT ''")
    except:
        pass
    # 迁移：订单系统表
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL DEFAULT 'buy',
            contact_name TEXT DEFAULT '',
            delivery_location TEXT DEFAULT '游戏内对接',
            notes TEXT DEFAULT '',
            pricing_mode TEXT DEFAULT 'sell',
            discount REAL DEFAULT 1.0,
            estimated_total REAL DEFAULT 0,
            items TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'public',
            created_at TEXT DEFAULT (datetime('now')),
            deadline TEXT DEFAULT (datetime('now','+14 days')),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS order_acceptances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            item_index INTEGER NOT NULL,
            accepted_by INTEGER NOT NULL,
            qty INTEGER NOT NULL DEFAULT 0,
            expected_days INTEGER DEFAULT 0,
            notes TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY(order_id) REFERENCES orders(id),
            FOREIGN KEY(accepted_by) REFERENCES users(id)
        );
    """)
    # 迁移：将所有 is_admin=1 的用户设为对应角色
    conn.execute("UPDATE users SET role='super_admin' WHERE is_admin=1 AND id=(SELECT MIN(id) FROM users WHERE is_admin=1)")
    conn.execute("UPDATE users SET role='admin' WHERE is_admin=1 AND (role IS NULL OR role='' OR role='user')")
    conn.commit()
    conn.close()
    # 初始化国服补充数据表
    try:
        from core.cn_sde import init as cn_init
        cn_init()
    except Exception as e:
        print(f"[init] cn_sde 初始化失败: {e}")


def register(username: str, password: str) -> tuple[bool, str]:
    """注册，返回 (成功, 消息)"""
    if not username or len(username.strip()) < 2:
        return False, "用户名至少2个字符"
    if not password or len(password) < 4:
        return False, "密码至少4个字符"
    conn = _connect()
    try:
        h = hashlib.sha256(password.encode()).hexdigest()
        exists = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        is_admin = 1 if exists == 0 else 0
        role = 'super_admin' if exists == 0 else 'user'
        # 检查是否开启新用户免费试用制造商
        free_trial = conn.execute("SELECT setting_value FROM admin_settings WHERE setting_key='free_trial_enabled'").fetchone()
        trial_days = conn.execute("SELECT setting_value FROM admin_settings WHERE setting_key='free_trial_days'").fetchone()
        if role == 'user' and free_trial and free_trial['setting_value'] == '1':
            days = int(trial_days['setting_value']) if trial_days else 30
            from datetime import datetime, timedelta
            expires = (datetime.now() + timedelta(days=days)).strftime('%Y-%m-%d %H:%M:%S')
            role = 'manufacturer'
            conn.execute("INSERT INTO users (username, password_hash, is_admin, role, manufacturer_expires_at) VALUES (?, ?, ?, ?, ?)",
                         (username, h, is_admin, role, expires))
            msg = f"注册成功（制造商试用 {days} 天）"
        else:
            conn.execute("INSERT INTO users (username, password_hash, is_admin, role) VALUES (?, ?, ?, ?)",
                         (username, h, is_admin, role))
            msg = "注册成功" + ("（管理员）" if is_admin else "")
        conn.commit()
        return True, msg
    except sqlite3.IntegrityError:
        return False, "用户名已存在"
    finally:
        conn.close()


def login(username: str, password: str) -> tuple[bool, str, str | None]:
    """登录，返回 (成功, 消息, token)"""
    if not username or not password:
        return False, "用户名或密码不能为空", None
    conn = _connect()
    try:
        h = hashlib.sha256(password.encode()).hexdigest()
        row = conn.execute("SELECT id FROM users WHERE username=? AND password_hash=?",
                          (username, h)).fetchone()
        if not row:
            return False, "用户名或密码错误", None
        user_id = row['id']
        # 检查制造商是否过期
        check_manufacturer_expiry(user_id)
        token = secrets.token_hex(32)
        expires = time.time() + 86400 * 7  # 7 天有效
        conn.execute("INSERT OR REPLACE INTO tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
                    (token, user_id, expires))
        conn.commit()
        return True, "登录成功", token
    finally:
        conn.close()


def verify_token(token: str) -> int | None:
    """验证 token，返回 user_id 或 None"""
    if not token:
        return None
    conn = _connect()
    row = conn.execute("SELECT user_id, expires_at FROM tokens WHERE token=?",
                      (token,)).fetchone()
    conn.close()
    if not row:
        return None
    if time.time() > row['expires_at']:
        return None
    return row['user_id']


def verify_token_admin(token: str) -> int | None:
    """验证 token 是否为管理员，返回 user_id 或 None"""
    if not token:
        return None
    conn = _connect()
    row = conn.execute(
        "SELECT t.user_id FROM tokens t JOIN users u ON t.user_id=u.id "
        "WHERE t.token=? AND t.expires_at>? AND u.is_admin=1",
        (token, time.time())).fetchone()
    conn.close()
    return row['user_id'] if row else None


def logout(token: str):
    conn = _connect()
    conn.execute("DELETE FROM tokens WHERE token=?", (token,))
    conn.commit()
    conn.close()


# ========== 关注清单 ==========

def add_watchlist(user_id: int, type_id: int, name_cn: str = ""):
    conn = _connect()
    try:
        conn.execute("INSERT OR IGNORE INTO watchlist (user_id, type_id, name_cn) VALUES (?, ?, ?)",
                    (user_id, type_id, name_cn))
        conn.commit()
    finally:
        conn.close()


def remove_watchlist(user_id: int, type_id: int):
    conn = _connect()
    conn.execute("DELETE FROM watchlist WHERE user_id=? AND type_id=?", (user_id, type_id))
    conn.commit()
    conn.close()


def get_watchlist(user_id: int) -> list:
    conn = _connect()
    rows = conn.execute("SELECT type_id, name_cn FROM watchlist WHERE user_id=? ORDER BY added_at",
                       (user_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def is_watched(user_id: int, type_id: int) -> bool:
    conn = _connect()
    row = conn.execute("SELECT 1 FROM watchlist WHERE user_id=? AND type_id=?",
                      (user_id, type_id)).fetchone()
    conn.close()
    return row is not None


# ========== 材料来源保存 ==========

def save_material_overrides(user_id: int, product_type_id: int, overrides: dict):
    """保存用户对某物品的材料定价设置
    overrides: { material_type_id_str: 'buy'|'sell'|'self' }
    """
    conn = _connect()
    conn.execute("DELETE FROM material_overrides WHERE user_id=? AND product_type_id=?",
                (user_id, product_type_id))
    for mat_id_str, mode in overrides.items():
        try:
            if mat_id_str == '_config':
                import json as _json
                conn.execute("INSERT OR REPLACE INTO material_overrides (user_id, product_type_id, material_type_id, pricing_mode) VALUES (?, ?, ?, ?)",
                            (user_id, product_type_id, -1, _json.dumps(mode)))
            elif mat_id_str == '_ratios':
                import json as _json
                conn.execute("INSERT OR REPLACE INTO material_overrides (user_id, product_type_id, material_type_id, pricing_mode) VALUES (?, ?, ?, ?)",
                            (user_id, product_type_id, -2, _json.dumps(mode)))
            else:
                mat_id = int(mat_id_str)
                conn.execute(
                    "INSERT INTO material_overrides (user_id, product_type_id, material_type_id, pricing_mode) VALUES (?, ?, ?, ?)",
                    (user_id, product_type_id, mat_id, mode)
                )
        except (ValueError, sqlite3.IntegrityError):
            continue
    conn.commit()
    conn.close()


def load_material_overrides(user_id: int, product_type_id: int) -> dict:
    """加载用户对某物品的材料定价设置"""
    conn = _connect()
    rows = conn.execute(
        "SELECT material_type_id, pricing_mode FROM material_overrides WHERE user_id=? AND product_type_id=?",
        (user_id, product_type_id)
    ).fetchall()
    conn.close()
    result = {}
    for r in rows:
        if r['material_type_id'] == -1:
            import json as _json
            try:
                result['_config'] = _json.loads(r['pricing_mode'])
            except:
                pass
        elif r['material_type_id'] == -2:
            import json as _json
            try:
                result['_ratios'] = _json.loads(r['pricing_mode'])
            except:
                pass
        else:
            result[str(r['material_type_id'])] = r['pricing_mode']
    return result


# ========== 用户资料 ==========

def get_profile(user_id: int) -> dict:
    conn = _connect()
    row = conn.execute("SELECT username, email, is_admin, role, manufacturer_expires_at, created_at FROM users WHERE id=?",
                      (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else {}


def update_profile(user_id: int, email: str = None, old_password: str = None, new_password: str = None) -> tuple:
    """更新资料，返回 (成功, 消息)"""
    conn = _connect()
    try:
        if email is not None:
            conn.execute("UPDATE users SET email=? WHERE id=?", (email, user_id))
        if old_password and new_password:
            row = conn.execute("SELECT password_hash FROM users WHERE id=?", (user_id,)).fetchone()
            if not row or row['password_hash'] != hashlib.sha256(old_password.encode()).hexdigest():
                conn.close()
                return False, "原密码错误"
            conn.execute("UPDATE users SET password_hash=? WHERE id=?",
                        (hashlib.sha256(new_password.encode()).hexdigest(), user_id))
        conn.commit()
        return True, "更新成功"
    finally:
        conn.close()


def list_users() -> list:
    """管理员获取用户列表"""
    conn = _connect()
    rows = conn.execute("SELECT id, username, email, is_admin, role, manufacturer_expires_at, created_at FROM users ORDER BY id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def set_role(actor_id: int, target_id: int, new_role: str, days: int = 30) -> tuple:
    """设置用户角色，返回 (成功, 消息)
    actor_id: 操作者
    target_id: 目标用户
    new_role: user / manufacturer / admin
    只有 super_admin 可以设置 admin 角色
    不能自己操作自己
    """
    conn = _connect()
    try:
        actor = conn.execute("SELECT role FROM users WHERE id=?", (actor_id,)).fetchone()
        if not actor or actor['role'] not in ('super_admin', 'admin'):
            conn.close()
            return False, "无权限"
        if actor_id == target_id:
            conn.close()
            return False, "不能操作自己"
        if new_role == 'admin':
            if actor['role'] != 'super_admin':
                conn.close()
                return False, "只有超级管理员才能任命管理员"
            conn.execute("UPDATE users SET role='admin', is_admin=1 WHERE id=?", (target_id,))
        elif new_role == 'manufacturer':
            import time
            if days <= 0:
                expires = None  # 永久
            else:
                # 检查是否有已有到期时间，有则叠加
                row = conn.execute("SELECT manufacturer_expires_at FROM users WHERE id=?", (target_id,)).fetchone()
                if row and row['manufacturer_expires_at']:
                    try:
                        existing_ts = time.mktime(time.strptime(row['manufacturer_expires_at'], '%Y-%m-%d %H:%M:%S'))
                        now_ts = time.time()
                        base_ts = max(existing_ts, now_ts)  # 取现有到期时间和当前时间中的较晚者
                    except:
                        base_ts = time.time()
                else:
                    base_ts = time.time()
                expires = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(base_ts + days*86400))
            conn.execute("UPDATE users SET role='manufacturer', is_admin=0, manufacturer_expires_at=? WHERE id=?",
                        (expires, target_id))
        elif new_role == 'user':
            conn.execute("UPDATE users SET role='user', is_admin=0 WHERE id=?", (target_id,))
        else:
            conn.close()
            return False, "无效角色"
        conn.commit()
        return True, "修改成功"
    finally:
        conn.close()


def check_manufacturer_expiry(user_id: int) -> bool:
    """检查制造商是否过期，过期则降为用户"""
    conn = _connect()
    row = conn.execute("SELECT role, manufacturer_expires_at FROM users WHERE id=?", (user_id,)).fetchone()
    if not row or row['role'] != 'manufacturer':
        conn.close()
        return True  # 不是制造商，不需要检查
    expires = row['manufacturer_expires_at']
    if not expires:
        conn.close()
        return True
    import time
    try:
        exp_ts = time.mktime(time.strptime(expires, '%Y-%m-%d %H:%M:%S'))
        if time.time() > exp_ts:
            conn.execute("UPDATE users SET role='user', manufacturer_expires_at=NULL WHERE id=?", (user_id,))
            conn.commit()
            conn.close()
            return False  # 已过期降级
    except:
        pass
    conn.close()
    return True


def upgrade_manufacturer(user_id: int, days: int = 30) -> tuple:
    """用户自行升级或延长制造商"""
    import time
    conn = _connect()
    row = conn.execute("SELECT role, manufacturer_expires_at FROM users WHERE id=?", (user_id,)).fetchone()
    if not row:
        conn.close()
        return False, "用户不存在"
    if row['role'] in ('admin', 'super_admin'):
        conn.close()
        return False, "管理员无需升级"
    now = time.time()
    if row['role'] == 'manufacturer' and row['manufacturer_expires_at']:
        try:
            existing = time.mktime(time.strptime(row['manufacturer_expires_at'], '%Y-%m-%d %H:%M:%S'))
            if existing > now:
                now = existing  # 在现有到期时间上续期
        except:
            pass
    expires = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(now + days*86400))
    conn.execute("UPDATE users SET role='manufacturer', manufacturer_expires_at=? WHERE id=?", (expires, user_id))
    conn.commit()
    conn.close()
    return True, f"制造商资格已延长至 {expires}"


# ========== 申请系统 ==========

def submit_application(user_id: int, app_type: str, payment_id: str = "") -> tuple:
    conn = _connect()
    conn.execute("INSERT INTO applications (user_id, app_type, payment_id) VALUES (?, ?, ?)",
                (user_id, app_type, payment_id))
    conn.commit()
    conn.close()
    return True, "申请已提交，等待管理员审核"


def get_applications(status: str = None) -> list:
    conn = _connect()
    if status:
        rows = conn.execute("SELECT a.*, u.username FROM applications a JOIN users u ON a.user_id=u.id WHERE a.status=? ORDER BY a.created_at DESC", (status,)).fetchall()
    else:
        rows = conn.execute("SELECT a.*, u.username FROM applications a JOIN users u ON a.user_id=u.id ORDER BY a.created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def review_application(app_id: int, reviewer_id: int, status: str, notes: str = "") -> tuple:
    """审核申请, status: 'approved'/'rejected'"""
    conn = _connect()
    app = conn.execute("SELECT * FROM applications WHERE id=?", (app_id,)).fetchone()
    if not app:
        conn.close()
        return False, "申请不存在"
    if app['status'] != 'pending':
        conn.close()
        return False, "该申请已处理"
    conn.execute("UPDATE applications SET status=?, notes=?, reviewed_by=? WHERE id=?",
                (status, notes, reviewer_id, app_id))
    if status == 'approved':
        upgrade_manufacturer(app['user_id'], 30)
    conn.commit()
    conn.close()
    return True, f"申请已{status}"


# ========== 激活码系统 ==========

def generate_code(created_by: int, duration_days: int = 30, max_uses: int = 1, expires_days: int = 365) -> str:
    import secrets, time
    code = secrets.token_hex(8).upper()
    expires = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(time.time() + expires_days*86400))
    conn = _connect()
    conn.execute("INSERT INTO activation_codes (code, duration_days, max_uses, created_by, expires_at) VALUES (?, ?, ?, ?, ?)",
                (code, duration_days, max_uses, created_by, expires))
    conn.commit()
    conn.close()
    return code


def redeem_code(user_id: int, code: str) -> tuple:
    conn = _connect()
    row = conn.execute("SELECT * FROM activation_codes WHERE code=?", (code.upper(),)).fetchone()
    if not row:
        conn.close()
        return False, "激活码不存在"
    if row['used_count'] >= row['max_uses']:
        conn.close()
        return False, "激活码已用完"
    import time
    try:
        exp = time.mktime(time.strptime(row['expires_at'], '%Y-%m-%d %H:%M:%S'))
        if time.time() > exp:
            conn.close()
            return False, "激活码已过期"
    except:
        pass
    conn.execute("UPDATE activation_codes SET used_count=used_count+1 WHERE code=?", (code.upper(),))
    conn.commit()
    conn.close()
    upgrade_manufacturer(user_id, row['duration_days'])
    return True, f"激活成功，获得 {row['duration_days']} 天制造商资格"


def list_codes() -> list:
    conn = _connect()
    rows = conn.execute("SELECT c.*, u.username FROM activation_codes c JOIN users u ON c.created_by=u.id ORDER BY c.created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ========== 访问统计 ==========

def log_visit(ip: str):
    import time
    conn = _connect()
    conn.execute("INSERT INTO visit_logs (ip, visited_at) VALUES (?, ?)", (ip, time.time()))
    conn.commit()
    conn.close()


def get_visit_stats() -> dict:
    import time
    conn = _connect()
    now = time.time()
    stats = {}
    for label, seconds in [('24h', 86400), ('7d', 604800), ('30d', 2592000)]:
        cutoff = now - seconds
        total = conn.execute("SELECT COUNT(*) FROM visit_logs WHERE visited_at>?", (cutoff,)).fetchone()[0]
        unique = conn.execute("SELECT COUNT(DISTINCT ip) FROM visit_logs WHERE visited_at>?", (cutoff,)).fetchone()[0]
        stats[label] = {'total': total, 'unique': unique}
    conn.close()
    return stats
    conn.execute("UPDATE users SET is_admin=? WHERE id=?", (1 if is_admin else 0, user_id))
    conn.commit()
    conn.close()
    return True


def save_setting(user_id: int, key: str, value: str):
    conn = _connect()
    conn.execute("INSERT OR REPLACE INTO user_settings (user_id, setting_key, setting_value) VALUES (?, ?, ?)",
                (user_id, key, value))
    conn.commit()
    conn.close()



# ========== 站内消息系统 ==========

def send_message(from_id: int, to_id: int, title: str, content: str) -> tuple:
    """发送站内消息，to_id=0 表示发送给所有超级管理员，from_id=0 表示系统消息"""
    conn = _connect()
    if to_id == 0:
        admins = conn.execute("SELECT id FROM users WHERE role='super_admin'").fetchall()
        if not admins:
            conn.close()
            return False, "没有超级管理员"
        for a in admins:
            conn.execute("INSERT INTO messages (from_user_id, to_user_id, title, content) VALUES (?, ?, ?, ?)",
                        (from_id, a['id'], title, content))
    else:
        conn.execute("INSERT INTO messages (from_user_id, to_user_id, title, content) VALUES (?, ?, ?, ?)",
                    (from_id, to_id, title, content))
    conn.commit()
    conn.close()
    return True, "消息已发送"


def get_inbox(user_id: int, limit: int = 50) -> list:
    conn = _connect()
    rows = conn.execute(
        "SELECT m.*, CASE WHEN m.from_user_id=0 THEN '系统' ELSE u.username END as from_name, "
        "u.role as from_role FROM messages m "
        "LEFT JOIN users u ON m.from_user_id=u.id "
        "WHERE m.to_user_id=? ORDER BY m.created_at DESC LIMIT ?", (user_id, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_outbox(user_id: int, limit: int = 50) -> list:
    conn = _connect()
    rows = conn.execute(
        "SELECT m.*, u.username as to_name, u.role as to_role FROM messages m LEFT JOIN users u ON m.to_user_id=u.id "
        "WHERE m.from_user_id=? ORDER BY m.created_at DESC LIMIT ?", (user_id, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def mark_message_read(msg_id: int, user_id: int) -> bool:
    conn = _connect()
    conn.execute("UPDATE messages SET is_read=1 WHERE id=? AND to_user_id=?", (msg_id, user_id))
    conn.commit()
    conn.close()
    return True


def get_unread_count(user_id: int) -> int:
    conn = _connect()
    row = conn.execute("SELECT COUNT(*) as cnt FROM messages WHERE to_user_id=? AND is_read=0", (user_id,)).fetchone()
    conn.close()
    return row['cnt'] if row else 0


# ========== 管理员设置 ==========

def get_admin_setting(key: str, default: str = "") -> str:
    conn = _connect()
    row = conn.execute("SELECT setting_value FROM admin_settings WHERE setting_key=?", (key,)).fetchone()
    conn.close()
    return row['setting_value'] if row else default


def set_admin_setting(key: str, value: str) -> bool:
    conn = _connect()
    conn.execute("INSERT OR REPLACE INTO admin_settings (setting_key, setting_value) VALUES (?, ?)", (key, value))
    conn.commit()
    conn.close()
    return True


def load_setting(user_id: int, key: str, default: str = "") -> str:
    conn = _connect()
    row = conn.execute("SELECT setting_value FROM user_settings WHERE user_id=? AND setting_key=?",
                      (user_id, key)).fetchone()
    conn.close()
    return row['setting_value'] if row else default


# ========== 排行缓存 ==========

def set_cache(key: str, data: list):
    import json
    conn = _connect()
    conn.execute("INSERT OR REPLACE INTO ranking_cache (cache_key, data, cached_at) VALUES (?, ?, ?)",
                (key, json.dumps(data, ensure_ascii=False), time.time()))
    conn.commit()
    conn.close()


def get_cache(key: str, max_age: float = 86400) -> list | None:
    """获取缓存，max_age 秒内有效（默认 24h）"""
    import json
    conn = _connect()
    row = conn.execute("SELECT data, cached_at FROM ranking_cache WHERE cache_key=?",
                      (key,)).fetchone()
    conn.close()
    if not row:
        return None
    if time.time() - row['cached_at'] > max_age:
        return None
    return json.loads(row['data'])


# 初始化
init_db()
