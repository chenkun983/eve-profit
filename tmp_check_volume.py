"""检查高密度黑赭石的 SDE 数据"""
import sqlite3, os

BASE = os.path.dirname(os.path.abspath(__file__))
conn = sqlite3.connect(os.path.join(BASE, 'data', 'sde.sqlite'))
conn.row_factory = sqlite3.Row

# 搜高密度黑赭石
rows = conn.execute("""
    SELECT t.typeID, t.typeName, t.groupID, t.volume, g.groupName 
    FROM invTypes t JOIN invGroups g ON t.groupID=g.groupID 
    WHERE t.typeName LIKE '%高密度黑赭石%'
""").fetchall()

print("=== 高密度黑赭石 SDE 数据 ===")
for r in rows:
    print(f'typeID={r["typeID"]}, volume={r["volume"]}m³, groupID={r["groupID"]}, group={r["groupName"]}')

if rows:
    gid = rows[0]['groupID']
    base_vol = conn.execute('SELECT MIN(volume) FROM invTypes WHERE groupID=? AND volume>0 AND published=1', (gid,)).fetchone()
    print(f'\n该组最小体积: {base_vol[0]}m³')
    base_name = conn.execute(
        'SELECT typeName, volume FROM invTypes WHERE groupID=? AND volume=? AND published=1 LIMIT 1',
        (gid, base_vol[0])
    ).fetchone()
    if base_name:
        print(f'基础矿石: {base_name["typeName"]}, 体积={base_name["volume"]}m³')
        print(f'压缩矿石修正后: {base_vol[0] / 100.0}m³')
    print(f'\n组内所有矿石体积:')
    all_v = conn.execute(
        'SELECT typeName, volume FROM invTypes WHERE groupID=? AND volume>0 AND published=1 ORDER BY volume',
        (gid,)
    ).fetchall()
    for v in all_v:
        tag = ' ← 基础矿' if abs(v['volume'] - base_vol[0]) < 0.001 else ' ← 压缩矿'
        print(f'  {v["typeName"]}: {v["volume"]}m³{tag}')

# 检查 cn_sde 数据
cn_path = os.path.join(BASE, 'data', 'cn_sde.db')
if os.path.exists(cn_path):
    cn = sqlite3.connect(cn_path)
    cn.row_factory = sqlite3.Row
    row = cn.execute("SELECT * FROM cn_items WHERE name_cn LIKE '%高密度黑赭石%'").fetchall()
    print(f'\n=== 国服补充表数据 ===')
    for r in row:
        print(f'type_id={r["type_id"]}, name={r["name_cn"]}')
    print(f'总物品数: {cn.execute("SELECT COUNT(*) FROM cn_items").fetchone()[0]}')
    cn.close()
else:
    print('\n国服补充表不存在，请先在后台同步')

conn.close()
