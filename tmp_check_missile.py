"""查炼狱轻型导弹的化矿数据"""
import sqlite3, os
BASE = os.path.dirname(os.path.abspath(__file__))
conn = sqlite3.connect(os.path.join(BASE, 'data', 'sde.sqlite'))
conn.row_factory = sqlite3.Row
tid = 211
# invTypes 里的原始材料
rows = conn.execute("SELECT materialTypeID, quantity FROM invTypeMaterials WHERE typeID=?", (tid,)).fetchall()
print(f'炼狱轻型导弹 (typeID={tid}) invTypeMaterials:')
for r in rows:
    n = conn.execute("SELECT typeName FROM invTypes WHERE typeID=?", (r['materialTypeID'],)).fetchone()
    cn = conn.execute("SELECT text FROM trnTranslations WHERE tcID=8 AND keyID=? AND languageID='zh'", (r['materialTypeID'],)).fetchone()
    nm = cn['text'] if cn else (n['typeName'] if n else str(r['materialTypeID']))
    print(f'  {nm}: {r["quantity"]} 每批')
# portionSize
p = conn.execute("SELECT portionSize FROM invTypes WHERE typeID=?", (tid,)).fetchone()
print(f'\nportionSize: {p["portionSize"] if p else "?"}')
print(f'\n如果 invTypeMaterials 存的是原始值:')
print(f'  55%回收: int(58*0.55)=31, int(72*0.55)=39')
print(f'\n如果 invTypeMaterials 存的是50%基础化矿后的值:')
print(f'  原始 = 58/0.50=116, 72/0.50=144')
print(f'  55%回收: int(116*0.55)=63, int(144*0.55)=79')
conn.close()
