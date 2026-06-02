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
    """)
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
    conn.commit()
    conn.close()


def register(username: str, password: str) -> tuple[bool, str]:
    """注册，返回 (成功, 消息)"""
    if not username or len(username.strip()) < 2:
        return False, "用户名至少2个字符"
    if not password or len(password) < 4:
        return False, "密码至少4个字符"
    conn = _connect()
    try:
        h = hashlib.sha256(password.encode()).hexdigest()
        # 第一个注册的用户自动成为管理员
        exists = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        is_admin = 1 if exists == 0 else 0
        conn.execute("INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)",
                     (username, h, is_admin))
        conn.commit()
        msg = "注册成功" + ("（管理员）" if is_admin else "")
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
                # 保存配置参数
                import json as _json
                conn.execute("INSERT OR REPLACE INTO material_overrides (user_id, product_type_id, material_type_id, pricing_mode) VALUES (?, ?, ?, ?)",
                            (user_id, product_type_id, -1, _json.dumps(mode)))
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
        else:
            result[str(r['material_type_id'])] = r['pricing_mode']
    return result


# ========== 用户资料 ==========

def get_profile(user_id: int) -> dict:
    conn = _connect()
    row = conn.execute("SELECT username, email, is_admin, created_at FROM users WHERE id=?",
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
    rows = conn.execute("SELECT id, username, email, is_admin, created_at FROM users ORDER BY id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def set_admin(user_id: int, is_admin: bool = True) -> bool:
    """设置/取消管理员"""
    conn = _connect()
    conn.execute("UPDATE users SET is_admin=? WHERE id=?", (1 if is_admin else 0, user_id))
    conn.commit()
    conn.close()
    return True


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
