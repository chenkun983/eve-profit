import sqlite3
conn = sqlite3.connect('data/sde.sqlite')
# 查矿石的 portionSize
ore_names = ['斜长岩','凡晶石','灼烧矿','水硼砂','艾克诺岩','灰岩','干焦岩','奥贝尔石']
for name in ore_names:
    r = conn.execute("SELECT typeName, portionSize FROM invTypes WHERE typeName LIKE ? AND published=1 LIMIT 1", (f'%{name}%',)).fetchone()
    if r:
        print(f"{r[0]}: portionSize={r[1]}")

# 总体分布
d = conn.execute("SELECT portionSize, COUNT(*) as cnt FROM invTypes WHERE published=1 AND portionSize>0 GROUP BY portionSize ORDER BY cnt DESC LIMIT 10").fetchall()
print("\nportionSize 分布（所有物品）:")
for r in d:
    print(f"  {r[0]}: {r[1]} 个物品")
conn.close()
