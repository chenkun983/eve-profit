"""诊断：分类扫描测试"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core.database import SDEDatabase
from core.market import MarketAPI
from core.calculator import ProfitCalculator, ManufacturingConfig
from core.ranking import scan_category

db = SDEDatabase()

# 测试几个二级分类（从 /api/categories 获取的实际ID）
test_groups = [
    (207, "舰船/战列舰"),
    (205, "舰船/护卫舰"),
    (209, "舰船装备"),
]

for gid, gname in test_groups:
    items = db.get_items_by_market_group(gid)
    print(f"\n[{gname}] (groupID={gid}): {len(items)} 个物品")
    for i in items[:5]:
        tid = i['typeID']
        # 检查是否有蓝图
        mats = db.get_manufacturing_materials(tid)
        has_bp = len(mats) > 0
        print(f"  {i['name']} (typeID={tid}) {'✅ 有蓝图' if has_bp else '❌ 无蓝图'}")
    if len(items) > 5:
        print(f"  ... 还有 {len(items)-5} 个")

# 测试扫描一个分类
print("\n\n开始扫描盖伦特护卫舰利润...")
data = scan_category(77)
print(f"扫描结果: {len(data)} 件有利润")
for d in data[:5]:
    print(f"  {d['name']}: 利润 {d['profit']:.0f} ISK, 利润率 {d['profit_margin']:.1f}%")
