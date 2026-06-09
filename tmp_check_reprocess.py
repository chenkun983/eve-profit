"""查询海军电容注电器装料 400 的化矿材料"""
import sqlite3, os

BASE = os.path.dirname(os.path.abspath(__file__))
sde_path = os.path.join(BASE, 'data', 'sde.sqlite')

conn = sqlite3.connect(sde_path)
conn.row_factory = sqlite3.Row

type_id = 32006

# 查物品名
name = conn.execute("SELECT typeName FROM invTypes WHERE typeID=?", (type_id,)).fetchone()
print(f'物品: {name["typeName"] if name else "未找到"} (typeID={type_id})')

# 查化矿最小单位
portion = conn.execute("SELECT portionSize FROM invTypes WHERE typeID=?", (type_id,)).fetchone()
print(f'最小化矿单位: {portion["portionSize"] if portion else "N/A"}')

# 查分解材料
rows = conn.execute(
    "SELECT im.materialTypeID, im.quantity, tz.text as name_cn, it.typeName as name_en "
    "FROM invTypeMaterials im "
    "JOIN invTypes it ON im.materialTypeID = it.typeID "
    "LEFT JOIN trnTranslations tz ON tz.tcID=8 AND tz.keyID=im.materialTypeID AND tz.languageID='zh' "
    "WHERE im.typeID=?", (type_id,)
).fetchall()

print(f'\n分解材料清单（每 {portion["portionSize"]} 个一批）:')
total_vol = 0
for r in rows:
    nm = r['name_cn'] or r['name_en']
    print(f'  {nm}: {r["quantity"]} 个')
    # 查材料体积
    vol = conn.execute("SELECT volume FROM invTypes WHERE typeID=?", (r['materialTypeID'],)).fetchone()
    if vol:
        total_vol += vol['volume'] * r['quantity']

# 按 55% 化矿率计算 10 个的产出
print(f'\n化矿率 55%，输入 10 个（刚好 1 批）:')
for r in rows:
    raw = r['quantity']
    recovered = int(raw * 0.55)
    if recovered == 0 and raw > 0:
        recovered = max(1, round(raw * 0.55))
    if recovered > 0:
        nm = r['name_cn'] or r['name_en']
        print(f'  {nm}: {recovered} 个 (原始 {raw} × 55%)')

conn.close()
