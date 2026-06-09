"""按 typeID 查高密度黑赭石的 SDE 体积数据"""
import sqlite3, os

BASE = os.path.dirname(os.path.abspath(__file__))
conn = sqlite3.connect(os.path.join(BASE, 'data', 'sde.sqlite'))
conn.row_factory = sqlite3.Row

tid = 62556  # 高密度黑赭石

r = conn.execute("SELECT typeID, typeName, volume, groupID FROM invTypes WHERE typeID=?", (tid,)).fetchone()
if r:
    gid = r['groupID']
    grp = conn.execute("SELECT groupName FROM invGroups WHERE groupID=?", (gid,)).fetchone()
    print(f'typeID={r["typeID"]}, groupID={gid}({grp["groupName"] if grp else "?"}), SDE体积={r["volume"]}m³')

    # ORE_GROUP_IDS 列表
    ore_gids = {450,451,452,453,454,455,456,457,458,459,460,461,462,463,464,465,
                467,468,469,470,471,472,473,474,475,476,
                477,478, 1136,1137,1138,1139,1140,1141,
                1855, 1885, 2836, 2840,2841,2842}
    if gid in ore_gids:
        print(f'groupID {gid} 在 ORE_GROUP_IDS 中 ✓')
        base_vol = conn.execute("SELECT MIN(volume) FROM invTypes WHERE groupID=? AND volume>0 AND published=1", (gid,)).fetchone()
        print(f'该组最小体积: {base_vol[0]}m³')
        if base_vol and base_vol[0] and base_vol[0] > 0 and abs(r['volume'] - base_vol[0]) > 0.001:
            corrected = base_vol[0] / 100.0
            print(f'压缩矿石 → 修正体积: {corrected}m³')
        else:
            print('体积与基础矿石一致，不作修正')
    else:
        print(f'groupID {gid} 不在 ORE_GROUP_IDS 中，不会修正 ❌')
else:
    print(f'typeID {tid} 在 SDE 中不存在')

conn.close()
