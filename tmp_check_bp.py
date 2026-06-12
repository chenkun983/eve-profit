"""查劲弩紧凑型快速鱼雷发射器是否有蓝图材料"""
import sqlite3, os
BASE = os.path.dirname(os.path.abspath(__file__))
conn = sqlite3.connect(os.path.join(BASE, 'data', 'sde.sqlite'))
conn.row_factory = sqlite3.Row

# 搜 typeID
rows = conn.execute("SELECT typeID, typeName FROM invTypes WHERE typeName LIKE '%劲弩紧凑型快速鱼雷发射器%' OR typeName LIKE '%Arbalest%Rapid%Torpedo%'").fetchall()
print("匹配结果:")
for r in rows:
    print(f'  typeID={r["typeID"]}, name={r["typeName"]}')

if rows:
    tid = rows[0]['typeID']
    mats = conn.execute("SELECT COUNT(*) FROM industryActivityMaterials WHERE typeID=?", (tid,)).fetchone()
    products = conn.execute("SELECT COUNT(*) FROM industryActivityProducts WHERE productTypeID=?", (tid,)).fetchone()
    print(f'\nindustryActivityMaterials: {mats[0]} 条')
    print(f'industryActivityProducts: {products[0]} 条')

conn.close()
