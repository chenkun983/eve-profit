"""每日定时扫描脚本 - 由 cron 调用"""
import sys, os, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.ranking import scan_category
from core import auth

# 要扫描的主要分类ID（一级分类）
MAIN_CATEGORIES = [
    (4, "舰船"), (9, "舰船装备"),
    (11, "弹药"), (157, "无人机"),
    (19, "贸易货物"), (475, "制造与研究"), (477, "建筑"),
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
