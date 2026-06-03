import sqlite3
conn = sqlite3.connect('data/sde.sqlite')
# 查几个常见矿石的 portionSize
for name, tid in [("凡晶石",1230), ("斜长岩",18), ("灼烧矿",20), ("水硼砂",21), ("艾克诺岩",22)]:
    r = conn.execute("SELECT typeName, portionSize FROM invTypes WHERE typeID=?", (tid,)).fetchone()
    print(f"{r[0]}: portionSize={r[1]}")

# 查不同 portionSize 的分布
d = conn.execute("SELECT portionSize, COUNT(*) as cnt FROM invTypes WHERE published=1 GROUP BY portionSize ORDER BY cnt DESC LIMIT 10").fetchall()
print("\nportionSize 分布:")
for r in d:
    print(f"  {r[0]}: {r[1]} 个物品")
conn.close()
