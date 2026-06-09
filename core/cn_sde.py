"""
国服 SDE 补充数据
从 ceve-market.org 每日 Excel 中提取国服专属物品（山岳级等），
补充到 SDE 搜索中
"""
import os, sqlite3, json
from datetime import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE, 'data', 'cn_sde.db')

def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init():
    """创建补充表"""
    conn = _connect()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cn_items (
            type_id INTEGER PRIMARY KEY,
            name_cn TEXT NOT NULL,
            name_en TEXT DEFAULT '',
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cn_update_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            updated_at TEXT DEFAULT (datetime('now')),
            count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'ok'
        )
    """)
    conn.commit()
    conn.close()

def download_and_import():
    """下载 ceve-market.org 的 Excel 并导入"""
    import requests
    import openpyxl
    from io import BytesIO

    url = "https://www.ceve-market.org/dumps/evedata.xlsx"
    print(f"[cn_sde] 下载 {url}")
    resp = requests.get(url, timeout=60)
    if resp.status_code != 200:
        raise Exception(f"下载失败: HTTP {resp.status_code}")

    wb = openpyxl.load_workbook(BytesIO(resp.content), read_only=True, data_only=True)

    # 找包含物品数据的工作表
    # 通常第一个表是类型表
    ws = wb.active
    if ws is None:
        raise Exception("Excel 中没有工作表")

    # 解析表头，找 typeID 和 name 列
    headers = [cell.value for cell in next(ws.iter_rows(min_row=1, max_row=1))]
    tid_col = None
    name_col = None
    for i, h in enumerate(headers):
        h_str = str(h).lower() if h else ''
        if 'typeid' in h_str or 'type_id' in h_str or 'id' == h_str:
            tid_col = i
        if 'name' in h_str or 'chinese' in h_str or h_str in ('cn', 'zh'):
            name_col = i

    if tid_col is None:
        # 尝试找 typeID 列（常见命名）
        for i, h in enumerate(headers):
            if h and ('type' in str(h).lower() and 'id' in str(h).lower()):
                tid_col = i
                break
    if name_col is None:
        for i, h in enumerate(headers):
            if h and 'name' in str(h).lower():
                name_col = i
                break
    if name_col is None:
        # 找包含中文的列
        for i, h in enumerate(headers[:10]):
            if h and any('\u4e00' <= c <= '\u9fff' for c in str(h)):
                name_col = i
                break

    if tid_col is None or name_col is None:
        raise Exception(f"无法定位列: typeID={tid_col}, name={name_col}, headers={headers}")

    conn = _connect()
    count = 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        tid = row[tid_col]
        name = str(row[name_col]).strip() if row[name_col] else ''
        if tid and name:
            try:
                tid = int(float(tid))
                conn.execute(
                    "INSERT OR REPLACE INTO cn_items (type_id, name_cn, updated_at) VALUES (?, ?, datetime('now'))",
                    (tid, name)
                )
                count += 1
            except (ValueError, TypeError):
                continue

    conn.execute("INSERT INTO cn_update_log (count, status) VALUES (?, 'ok')", (count,))
    conn.commit()
    conn.close()
    wb.close()
    return count

def get_type_id(name: str):
    """在补充表中搜索物品 typeID"""
    conn = _connect()
    row = conn.execute(
        "SELECT type_id FROM cn_items WHERE name_cn=? LIMIT 1",
        (name,)
    ).fetchone()
    conn.close()
    return row['type_id'] if row else None

def search_name(name: str):
    """模糊搜索补充表"""
    conn = _connect()
    rows = conn.execute(
        "SELECT type_id, name_cn FROM cn_items WHERE name_cn LIKE ? LIMIT 10",
        (f'%{name}%',)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_stats():
    """获取统计信息"""
    conn = _connect()
    count = conn.execute("SELECT COUNT(*) FROM cn_items").fetchone()[0]
    last = conn.execute("SELECT * FROM cn_update_log ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    return {
        'count': count,
        'last_update': dict(last) if last else None
    }
