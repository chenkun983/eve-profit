"""每日定时扫描脚本 - 由 cron 调用"""
import sys, os, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.ranking import scan_category
from core import auth

# 要扫描的主要分类ID（一级分类）
MAIN_CATEGORIES = [
    # 舰船
    (1361, "舰船/护卫舰"), (1367, "舰船/巡洋舰"), (1372, "舰船/驱逐舰"),
    (1374, "舰船/战列巡洋舰"), (1376, "舰船/战列舰"),
    (1382, "舰船/运载舰"), (1384, "舰船/采矿驳船"),
    # 舰船装备
    (10, "装备/炮台"), (14, "装备/船体装甲"), (52, "装备/推进"),
    (554, "装备/护盾"), (655, "装备/工程"), (656, "装备/电子"),
    # 弹药
    (99, "弹药/射弹"), (100, "弹药/混合"), (101, "弹药/晶体"),
    (114, "弹药/导弹"), (120, "弹药/探针"),
    # 无人机
    (358, "无人机/采矿"), (1530, "无人机/战斗"), (2237, "无人机/铁骑"),
    # 材料
    (533, "材料/原材料"), (1035, "材料/组件"),
]

def run():
    print(f"[cron] 开始每日扫描 - {time.strftime('%Y-%m-%d %H:%M:%S')}")
    total = 0
    for gid, gname in MAIN_CATEGORIES:
        print(f"  扫描 {gname}...", end=" ", flush=True)
        try:
            data = scan_category(gid)
            key = f"cat_{gid}"
            auth.set_cache(key, data)
            print(f"{len(data)} 条")
            total += len(data)
        except Exception as e:
            print(f"失败: {e}")
    print(f"[cron] 完成，共缓存 {total} 条数据")

if __name__ == "__main__":
    run()
