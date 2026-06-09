"""查月矿相关 groupID"""
import sqlite3, os
BASE = os.path.dirname(os.path.abspath(__file__))
conn = sqlite3.connect(os.path.join(BASE, 'data', 'sde.sqlite'))
conn.row_factory = sqlite3.Row

# 搜索月矿相关的分组
rows = conn.execute("SELECT groupID, groupName, categoryID FROM invGroups WHERE groupName LIKE '%Moon%' OR groupName LIKE '%moon%' OR groupName LIKE '%卫星%' OR groupName LIKE '%月%'").fetchall()
print("=== 月矿相关分组 ===")
for r in rows:
    print(f'  groupID={r["groupID"]}, groupName={r["groupName"]}, categoryID={r["categoryID"]}')

# 查 Rare Moon Asteroids 分组
print("\n=== Rare Moon Asteroids ===")
rows = conn.execute("SELECT groupID, groupName, categoryID FROM invGroups WHERE groupName LIKE '%Rare%Moon%' OR groupName LIKE '%Asteroid%'").fetchall()
for r in rows:
    print(f'  groupID={r["groupID"]}, groupName={r["groupName"]}, categoryID={r["categoryID"]}')

# 查卫星矿的中文名分组
print("\n=== 卫星矿分组 ===")
rows = conn.execute("SELECT g.groupID, g.groupName, g.categoryID FROM invGroups g WHERE g.groupID IN (1922,1923,1924,1925,1926,1927,1928)").fetchall()
for r in rows:
    print(f'  groupID={r["groupID"]}, groupName={r["groupName"]}, categoryID={r["categoryID"]}')

conn.close()
