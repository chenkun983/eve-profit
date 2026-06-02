"""EVE 制造利润分析器 - 服务器入口"""
import os, sys, shutil, bz2, json
from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import requests as req

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.database import SDEDatabase
from core.market import MarketAPI
from core.calculator import ProfitCalculator, ManufacturingConfig

app = FastAPI(title="EVE 制造利润分析器")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE, 'data')
DB_PATH = os.path.join(DATA_DIR, 'sde.sqlite')
os.makedirs(DATA_DIR, exist_ok=True)

# ===== 代理配置 =====
# V2Ray HTTP 代理，走代理下载 SDE 可加速（国内访问 GitHub）
PROXY = "http://127.0.0.1:10809"
# 如果不想用代理，设 PROXY = None

db = SDEDatabase(DB_PATH)
market = MarketAPI()

STATIC_DIR = os.path.join(BASE, 'static')
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def root():
    return HTMLResponse(open(os.path.join(STATIC_DIR, 'index.html'), encoding='utf-8').read())


@app.get("/api/search")
async def search(q: str = Query(..., min_length=1)):
    items = db.search_by_name(q)
    return {"items": items}


@app.get("/api/price")
async def price(type_id: int = Query(...)):
    """查询单一物品的吉他市场行情"""
    quote = market.get_market_quote(type_id)
    if not quote:
        return {"ok": False, "message": "无法获取市场价格"}
    name_cn = db.get_chinese_name(type_id)
    name_en = db.get_english_name(type_id)
    return {
        "ok": True,
        "type_id": type_id,
        "name_cn": name_cn,
        "name_en": name_en,
        "buy": quote['buy'],
        "sell": quote['sell'],
        "all": quote['all'],
    }


@app.get("/api/calculate")
async def calculate(
    type_id: int = Query(...),
    sci: float = Query(0.03, ge=0, le=1),
    bonus: float = Query(0.04, ge=0, le=1),
    tax: float = Query(0.01, ge=0, le=1),
    me: int = Query(0, ge=0, le=10),
    overrides: str = Query(None),  # JSON: {"材料typeID":"buy|sell|self"}
):
    cfg = ManufacturingConfig(
        system_cost_index=sci,
        structure_bonus=bonus,
        facility_tax=tax,
        blueprint_me_level=me,
    )
    calc = ProfitCalculator(db, market, cfg)
    mat_overrides = {}
    if overrides:
        try:
            mat_overrides = json.loads(overrides)
        except:
            pass
    result = calc.calculate_with_modes(type_id, mat_overrides)
    if result:
        return {"ok": True, "data": result}
    return {"ok": False, "message": "无法计算（该物品可能没有制造蓝图）"}


@app.get("/api/categories")
async def categories():
    groups = db.get_market_groups()
    # 构造成树
    children = {gid: [] for gid in [g['marketGroupID'] for g in groups]}
    roots = []
    for g in groups:
        gid = g['marketGroupID']
        pid = g['parentGroupID']
        node = {
            'id': gid,
            'name': g['marketGroupName'],
            'hasTypes': bool(g['hasTypes']),
        }
        if pid == 0 or pid is None:
            roots.append(node)
        elif pid in children:
            children[pid].append(node)

    def build_tree(nodes):
        for n in nodes:
            kids = children.get(n['id'], [])
            if kids:
                n['children'] = build_tree(kids)
        return nodes

    return {"roots": build_tree(roots)}


@app.get("/api/items-by-category")
async def items_by_category(group_id: int = Query(...)):
    items = db.get_items_by_market_group(group_id)
    return {"items": items}


@app.get("/api/status")
async def status():
    return {
        "sde_ok": db.exists(),
        "sde_info": db.get_sde_version() if db.exists() else None,
    }


@app.post("/api/sde/update")
async def update_sde():
    """管理员手动更新SDE"""
    try:
        r = req.get(
            "https://api.github.com/repos/garveen/eve-sde-converter/releases/latest",
            headers={"Accept": "application/vnd.github+json"},
            timeout=15,
        )
        if r.status_code != 200:
            return {"ok": False, "message": "无法获取最新 SDE 版本信息"}
        release = r.json()
        tag = release["tag_name"]
        download_url = (
            f"https://github.com/garveen/eve-sde-converter/releases/download/{tag}/sde.sqlite.bz2"
        )

        print(f"  [+] 下载 SDE: {tag}")
        bz2_path = os.path.join(DATA_DIR, "sde.sqlite.bz2")
        proxies = {"http": PROXY, "https": PROXY} if PROXY else None
        resp = req.get(download_url, stream=True, timeout=600, proxies=proxies)
        if resp.status_code != 200:
            return {"ok": False, "message": f"下载失败: HTTP {resp.status_code}"}
        with open(bz2_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"  [+] 下载完成: {os.path.getsize(bz2_path)/1024/1024:.1f} MB")

        tmp_path = os.path.join(DATA_DIR, "sde.sqlite.tmp")
        with bz2.open(bz2_path, "rb") as f_in:
            with open(tmp_path, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)
        os.replace(tmp_path, DB_PATH)
        os.remove(bz2_path)

        global db
        db = SDEDatabase(DB_PATH)

        return {
            "ok": True,
            "message": f"SDE 更新完成 ({tag})",
            "info": db.get_sde_version(),
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"ok": False, "message": f"更新失败: {str(e)}"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=2333)
