import sqlite3
conn = sqlite3.connect('data/sde.sqlite')
cur = conn.cursor()
for tc in [6,7,8,58,63,74,75,119,122,138]:
    r = cur.execute('SELECT * FROM trnTranslations WHERE tcID=? AND keyID=2 AND languageID="zh"', (tc,)).fetchone()
    if r:
        print(f'tcID={tc}: text={r[3]}')
print('---')
r = cur.execute('SELECT * FROM trnTranslations WHERE text="蓝图" AND languageID="zh"').fetchall()
print(f'精确匹配蓝图: {r}')
r = cur.execute('SELECT * FROM trnTranslations WHERE text LIKE "%%" AND languageID="zh" AND tcID=8 GROUP BY text LIMIT 5').fetchall()
print(f'tcID=8 前5: {r}')
conn.close()
