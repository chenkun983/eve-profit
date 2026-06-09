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


def prewarm_prices():
    """预热矿物价格缓存，减少估价等待时间"""
    from core.market import MarketAPI
    mk = MarketAPI()
    common_ids = [34,35,36,37,38,39,40,41,
        44,45,46,982,983,984,985,986,987,988,989,990,991,992,993,
        17464,17482,2312,2317,2319,2321,2327,2328,2329,
        11399,11400,11401,11402,11403,11404,11405,
        16672,16673,16678,16679,16680,16681,
        30370,30371,30372,30373,30374,30375,30376,
        4246,4247,4312]
    print(f"[cron] 预热 {len(common_ids)} 个常用物品价格...")
    try:
        prices = mk.get_prices_batch(common_ids)
        hit = sum(1 for v in prices.values() if v.get('sell_min',0) > 0)
        print(f"[cron] 价格预热完成，{hit}/{len(common_ids)} 个有数据")
    except Exception as e:
        print(f"[cron] 价格预热失败: {e}")


if __name__ == "__main__":
    run()
    prewarm_prices()
