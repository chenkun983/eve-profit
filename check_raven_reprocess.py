import sqlite3
conn = sqlite3.connect('data/sde.sqlite')

# 乌鸦级(638)的化矿产物
r = conn.execute("SELECT * FROM invTypeMaterials WHERE typeID=638").fetchall()
print(f"乌鸦级(638): {len(r)} 种材料")
for row in r:
    name = conn.execute("SELECT typeName FROM invTypes WHERE typeID=?", (row[1],)).fetchone()
    print(f"  {name[0] if name else '?'} x{row[2]}")

# 以80%化矿率算
print(f"\n以80%化矿率:")
for row in r:
    qty_after = int(row[2] * 0.8)
    name = conn.execute("SELECT typeName FROM invTypes WHERE typeID=?", (row[1],)).fetchone()
    print(f"  {name[0] if name else '?'} x{qty_after}")
conn.close()
