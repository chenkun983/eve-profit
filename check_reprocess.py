import sqlite3
conn = sqlite3.connect('data/sde.sqlite')
cur = conn.cursor()

tables = cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
for t in tables:
    name = t[0]
    if 'material' in name.lower() or 'reprocess' in name.lower():
        cols = [c[1] for c in cur.execute(f"PRAGMA table_info({name})").fetchall()]
        cnt = cur.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
        print(f"{name}: {cnt}行, 列={cols[:10]}")

print("\n斜长岩(18)的材料:")
r = cur.execute("SELECT * FROM invTypeMaterials WHERE typeID=18").fetchall()
for row in r:
    print(f"  矿物 typeID={row[1]} x{row[2]}")
    name = cur.execute("SELECT typeName FROM invTypes WHERE typeID=?", (row[1],)).fetchone()
    if name: print(f"    名称: {name[0]}")

print("\n凡晶石(1230)的材料:")
r = cur.execute("SELECT * FROM invTypeMaterials WHERE typeID=1230").fetchall()
for row in r:
    print(f"  矿物 typeID={row[1]} x{row[2]}")
    name = cur.execute("SELECT typeName FROM invTypes WHERE typeID=?", (row[1],)).fetchone()
    if name: print(f"    名称: {name[0]}")

print("\n基础矿物 typeID 34-40:")
for tid in range(34,41):
    name = cur.execute("SELECT typeName FROM invTypes WHERE typeID=?", (tid,)).fetchone()
    print(f"  {tid}: {name[0] if name else '?'}")
conn.close()
