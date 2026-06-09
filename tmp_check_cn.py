"""查国服补充表里相近的物品名"""
import sqlite3, os

BASE = os.path.dirname(os.path.abspath(__file__))
conn = sqlite3.connect(os.path.join(BASE, 'data', 'cn_sde.db'))
conn.row_factory = sqlite3.Row

print("=== 搜索：渐融的不稳定冰体 ===")
rows = conn.execute("SELECT type_id, name_cn FROM cn_items WHERE name_cn LIKE '%冰体%' OR name_cn LIKE '%渐融%'").fetchall()
for r in rows:
    print(f'  type_id={r["type_id"]}, name="{r["name_cn"]}"')

print("\n=== 搜索：盈钒钾铀矿 ===")
rows = conn.execute("SELECT type_id, name_cn FROM cn_items WHERE name_cn LIKE '%盈钒%' OR name_cn LIKE '%钒钾铀%'").fetchall()
for r in rows:
    print(f'  type_id={r["type_id"]}, name="{r["name_cn"]}"')

print("\n=== 搜索：压缩/高密度 对照 ===")
rows = conn.execute("SELECT type_id, name_cn FROM cn_items WHERE name_cn LIKE '%压缩%' AND name_cn LIKE '%盈钒%'").fetchall()
for r in rows:
    print(f'  type_id={r["type_id"]}, name="{r["name_cn"]}"')

conn.close()
