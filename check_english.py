import sqlite3
import re

conn = sqlite3.connect('data/sde.sqlite')
rows = conn.execute(
    "SELECT marketGroupID, parentGroupID, marketGroupName, hasTypes "
    "FROM invMarketGroups ORDER BY marketGroupID"
).fetchall()
conn.close()

def is_english(s):
    return not bool(re.search(r'[\u4e00-\u9fff]', s))

print(f'总共 {len(rows)} 个分类，仍为英文的 {len([r for r in rows if is_english(r[2])])} 个\n')
for r in rows:
    if is_english(r[2]):
        print(f"'{r[2]}':'',")
