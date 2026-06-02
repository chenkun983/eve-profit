import sqlite3
conn = sqlite3.connect('D:\\agent_workspace\\EVE国服服务器项目\\data\\sde.sqlite')
cur = conn.cursor()
# 看看翻译表里有市场分类相关的条目吗
rows = cur.execute('SELECT DISTINCT tcID FROM trnTranslations WHERE languageID=? ORDER BY tcID', ('zh',)).fetchall()
print('trnTranslations 中有的中文 tcID:', [r[0] for r in rows])
# 检查 marketGroupID=2 (Blueprints & Reactions) 有没有中文翻译
r = cur.execute("SELECT * FROM trnTranslations WHERE keyID=2 AND languageID='zh'").fetchone()
if r:
    print(f'tcID={r[0]}, keyID={r[1]}, text={r[3]}')
else:
    # 试试搜索 "蓝图"
    r = cur.execute("SELECT * FROM trnTranslations WHERE text LIKE '%蓝图%' AND languageID='zh' LIMIT 3").fetchall()
    print('搜索"蓝图":', r)
conn.close()
