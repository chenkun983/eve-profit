"""查劲弩快速鱼雷的制造材料"""
import sqlite3, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core.database import SDEDatabase

db = SDEDatabase()
mats = db.get_manufacturing_materials(41223)
print(f'get_manufacturing_materials(41223) = {mats}')
print(f'bool(mats) = {bool(mats)}')

# 直接查 SQL
conn = db._connect()
r = conn.execute("SELECT typeID, quantity FROM industryActivityProducts WHERE productTypeID=41223 AND activityID=1").fetchone()
if r:
    print(f'蓝图 typeID={r["typeID"]}, 产出数量={r["quantity"]}')
    mats2 = conn.execute("SELECT COUNT(*) FROM industryActivityMaterials WHERE typeID=? AND activityID=1", (r['typeID'],)).fetchone()
    print(f'蓝图制造材料数: {mats2[0]}')
conn.close()
