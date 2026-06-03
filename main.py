"""EVE 制造利润分析器 - 服务器入口"""
import os, sys, shutil, bz2, json, subprocess, hmac, hashlib
from fastapi import FastAPI, Query, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import requests as req

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.database import SDEDatabase
from core.market import MarketAPI
from core.calculator import ProfitCalculator, ManufacturingConfig
from core.auth import register, login, verify_token, logout as auth_logout, add_watchlist, remove_watchlist, get_watchlist, save_material_overrides, load_material_overrides, get_profile, update_profile, list_users, set_admin, save_setting, load_setting
from core.ranking import scan_category, scan_watchlist

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
    windows = market.get_market_quote(type_id)
    if not windows:
        return {"ok": False, "message": "无法获取市场价格"}
    name_cn = db.get_chinese_name(type_id)
    name_en = db.get_english_name(type_id)
    return {
        "ok": True,
        "type_id": type_id,
        "name_cn": name_cn,
        "name_en": name_en,
        "windows": windows,       # 多时段汇总去极值
    }


@app.get("/api/calculate")
async def calculate(
    type_id: int = Query(...),
    sci: float = Query(0.03, ge=0, le=1),
    bonus: float = Query(0.04, ge=0, le=1),
    tax: float = Query(0.01, ge=0, le=1),
    me: int = Query(0, ge=0, le=10),
    te: int = Query(0, ge=0, le=20),
    overrides: str = Query(None),
    material_ratios: str = Query(None),
    bom: bool = Query(False),
):
    cfg = ManufacturingConfig(
        system_cost_index=sci,
        structure_bonus=bonus,
        facility_tax=tax,
        blueprint_me_level=me,
        blueprint_te_level=te,
    )
    calc = ProfitCalculator(db, market, cfg)
    mat_overrides = {}
    mat_ratios = {}
    if overrides:
        try:
            mat_overrides = json.loads(overrides)
        except:
            pass
    if material_ratios:
        try:
            # 转成数字 key
            raw = json.loads(material_ratios)
            for k, v in raw.items():
                mat_ratios[str(k)] = float(v)
        except:
            pass
    result = calc.calculate_with_modes(type_id, mat_overrides, use_bom=bom, material_ratios=mat_ratios)
    if result:
        return {"ok": True, "data": result}
    return {"ok": False, "message": "无法计算"}


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
async def update_sde(authorization: str = Header(None)):
    """管理员手动更新SDE"""
    from core.auth import verify_token_admin
    if not verify_token_admin(authorization[7:] if authorization and authorization.startswith("Bearer ") else None):
        raise HTTPException(403, "仅管理员可操作")
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


# ===================== 用户认证 =====================

class AuthForm(BaseModel):
    username: str
    password: str


@app.post("/api/auth/register")
async def api_register(form: AuthForm):
    ok, msg = register(form.username, form.password)
    return {"ok": ok, "message": msg}


@app.post("/api/auth/login")
async def api_login(form: AuthForm):
    ok, msg, token = login(form.username, form.password)
    return {"ok": ok, "message": msg, "token": token}


@app.post("/api/auth/logout")
async def api_logout(authorization: str = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        auth_logout(authorization[7:])
    return {"ok": True}


@app.get("/api/auth/status")
async def auth_status(authorization: str = Header(None)):
    token = authorization[7:] if authorization and authorization.startswith("Bearer ") else None
    uid = verify_token(token)
    is_admin = False
    if uid:
        from core import auth as a
        row = a._connect().execute("SELECT is_admin FROM users WHERE id=?", (uid,)).fetchone()
        is_admin = bool(row and row['is_admin'])
    return {"ok": True, "logged_in": uid is not None, "is_admin": is_admin}


# ===================== 关注清单 =====================

def _require_user(authorization: str | None) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "未登录")
    uid = verify_token(authorization[7:])
    if not uid:
        raise HTTPException(401, "登录已过期")
    return uid


@app.get("/api/watchlist")
async def api_watchlist(authorization: str = Header(None)):
    uid = _require_user(authorization)
    return {"items": get_watchlist(uid)}


@app.post("/api/watchlist/add")
async def api_watchlist_add(type_id: int = Query(...), name: str = Query(""),
                            authorization: str = Header(None)):
    uid = _require_user(authorization)
    add_watchlist(uid, type_id, name)
    return {"ok": True}


@app.post("/api/watchlist/remove")
async def api_watchlist_remove(type_id: int = Query(...),
                                authorization: str = Header(None)):
    uid = _require_user(authorization)
    remove_watchlist(uid, type_id)
    return {"ok": True}


# ===================== 材料来源保存 =====================

@app.post("/api/save-overrides")
async def api_save_overrides(type_id: int = Query(...), overrides: str = Query("{}"),
                              authorization: str = Header(None)):
    uid = _require_user(authorization)
    try:
        data = json.loads(overrides)
    except:
        data = {}
    save_material_overrides(uid, type_id, data)
    return {"ok": True}


@app.get("/api/load-overrides")
async def api_load_overrides(type_id: int = Query(...),
                              authorization: str = Header(None)):
    uid = _require_user(authorization)
    data = load_material_overrides(uid, type_id)
    return {"ok": True, "overrides": data}


# ===================== 利润排行 =====================

@app.get("/api/ranking/category")
async def ranking_category(group_id: int = Query(...), refresh: bool = False,
                           authorization: str = Header(None)):
    _require_user(authorization)
    key = f"cat_{group_id}"
    if refresh:
        data = scan_category(group_id)
        from core.auth import set_cache
        set_cache(key, data)
        return {"ok": True, "data": data, "total": len(data), "source": "fresh"}
    cached = from_cache(key)
    if cached is not None:
        return {"ok": True, "data": cached, "total": len(cached), "source": "cache"}
    data = scan_category(group_id)
    from core.auth import set_cache
    set_cache(key, data)
    return {"ok": True, "data": data, "total": len(data), "source": "fresh"}


@app.get("/api/ranking/watchlist")
async def ranking_watchlist(discount: float = Query(0.9, ge=0.5, le=1.0),
                              authorization: str = Header(None)):
    """关注清单实时扫描"""
    uid = _require_user(authorization)
    data = scan_watchlist(uid, discount=discount)
    return {"ok": True, "data": data, "total": len(data)}


# ===================== 用户资料 =====================

@app.get("/api/profile")
async def api_profile(authorization: str = Header(None)):
    uid = _require_user(authorization)
    return {"ok": True, "profile": get_profile(uid)}


class ProfileForm(BaseModel):
    email: str = ""
    old_password: str = ""
    new_password: str = ""


@app.post("/api/profile/update")
async def api_update_profile(form: ProfileForm, authorization: str = Header(None)):
    uid = _require_user(authorization)
    ok, msg = update_profile(uid, email=form.email or None,
                             old_password=form.old_password or None,
                             new_password=form.new_password or None)
    return {"ok": ok, "message": msg}


@app.get("/api/admin/users")
async def api_admin_users(authorization: str = Header(None)):
    from core.auth import verify_token_admin
    if not verify_token_admin(authorization[7:] if authorization and authorization.startswith("Bearer ") else None):
        raise HTTPException(403, "仅管理员可查看")
    return {"ok": True, "users": list_users()}

@app.get("/api/admin/sde-info")
async def api_sde_info(authorization: str = Header(None)):
    from core.auth import verify_token_admin
    if not verify_token_admin(authorization[7:] if authorization and authorization.startswith("Bearer ") else None):
        raise HTTPException(403, "仅管理员可查看")
    info = db.get_sde_version()
    import requests as _req
    latest = "未知"
    try:
        r = _req.get("https://api.github.com/repos/garveen/eve-sde-converter/releases/latest",
                     headers={"Accept": "application/vnd.github+json"}, timeout=10)
        if r.status_code == 200: latest = r.json()["tag_name"]
    except: pass
    return {"ok": True, "current": info, "latest_version": latest}

@app.post("/api/save-setting")
async def api_save_setting(key: str = Query(...), value: str = Query(""),
                            authorization: str = Header(None)):
    uid = _require_user(authorization)
    save_setting(uid, key, value)
    return {"ok": True}


@app.get("/api/load-setting")
async def api_load_setting(key: str = Query(...), default: str = Query(""),
                            authorization: str = Header(None)):
    uid = _require_user(authorization)
    val = load_setting(uid, key, default)
    return {"ok": True, "value": val}


@app.post("/api/admin/set-admin")
async def api_set_admin(user_id: int = Query(...), is_admin: bool = Query(True),
                         authorization: str = Header(None)):
    from core.auth import verify_token_admin
    if not verify_token_admin(authorization[7:] if authorization and authorization.startswith("Bearer ") else None):
        raise HTTPException(403, "仅管理员可操作")
    set_admin(user_id, is_admin)
    return {"ok": True}


# ===================== GitHub Webhook（自动部署） =====================

import subprocess
import hmac
import hashlib

WEBHOOK_SECRET = "eve-profit-deploy-2024"  # 可改成你自己的密钥


@app.post("/webhook")
async def github_webhook(request: Request, x_hub_signature_256: str = Header(None)):
    body = await request.body()
    # 验签
    if x_hub_signature_256:
        sig = "sha256=" + hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, x_hub_signature_256):
            raise HTTPException(403, "签名验证失败")

    payload = json.loads(body)
    branch = payload.get("ref", "")
    if "main" not in branch and "master" not in branch:
        return {"ok": True, "message": "忽略非主分支推送"}

    # 后台执行部署
    subprocess.Popen([
        "bash", "-c",
        "cd /home/xiaonaizhao/eve-profit && "
        "git pull && "
        "pkill -f main.py && "
        "nohup venv/bin/python3 main.py > eve.log 2>&1 &"
    ])

    return {"ok": True, "message": "代码已拉取"}


# ===================== 矿物估价 =====================

@app.post("/api/estimate")
async def api_estimate(reprocess_rate: float = Query(0.55, ge=0, le=1), text: str = Query("")):
    from core.estimator import estimate_items, parse_input_text, parse_item_line
    lines = text.strip().split('\n')
    parsed = []
    for line in lines:
        items = parse_item_line(line)
        for name, qty in items:
            parsed.append({'name': name, 'quantity': qty})
    if not parsed:
        return {"ok": False, "message": "未识别到物品"}
    results = estimate_items(parsed, reprocess_rate)
    totals = {'direct_sell': 0, 'direct_buy': 0, 'mineral_sell': 0, 'mineral_buy': 0}
    for r in results:
        totals['direct_sell'] += r.get('direct_sell_total', 0)
        totals['direct_buy'] += r.get('direct_buy_total', 0)
        totals['mineral_sell'] += r.get('mineral_sell_total', 0)
        totals['mineral_buy'] += r.get('mineral_buy_total', 0)
    return {"ok": True, "results": results, "totals": totals}


def from_cache(key):
    import json, time
    from core import auth as a
    row = a._connect().execute(
        "SELECT data, cached_at FROM ranking_cache WHERE cache_key=?", (key,)).fetchone()
    if row and time.time() - row['cached_at'] < 86400:
        return json.loads(row['data'])
    return None


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=2333)
