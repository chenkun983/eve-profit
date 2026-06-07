"""EVE 制造利润分析器 - 服务器入口"""
import os, sys, shutil, bz2, json, subprocess, hmac, hashlib
from fastapi import FastAPI, Query, Header, HTTPException, Request, Body
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import requests as req
from starlette.middleware.base import BaseHTTPMiddleware

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.database import SDEDatabase
from core.market import MarketAPI
from core.calculator import ProfitCalculator, ManufacturingConfig
from core.auth import register, login, verify_token, logout as auth_logout, add_watchlist, remove_watchlist, get_watchlist, save_material_overrides, load_material_overrides, get_profile, update_profile, list_users, set_role, upgrade_manufacturer, check_manufacturer_expiry, submit_application, get_applications, review_application, generate_code, redeem_code, list_codes, log_visit, get_visit_stats, save_setting, load_setting
from core.ranking import scan_category, scan_watchlist

@asynccontextmanager
async def my_lifespan(app):
    from core.industry import rebuild_production_cache
    from core.industry import _connect as ind_conn
    c = ind_conn()
    cnt = c.execute("SELECT COUNT(*) FROM manufacturable_cache").fetchone()[0]
    c.close()
    if cnt == 0:
        print("[startup] 重建可制造物品缓存...")
        try:
            p, r = rebuild_production_cache()
            print(f"[startup] 可制造 {p} 项, 反应 {r} 项")
        except Exception as e:
            print(f"[startup] 重建缓存失败: {e}")
    yield

app = FastAPI(title="EVE 制造利润分析器", docs_url=None, redoc_url=None, openapi_url=None, lifespan=my_lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# 访问日志
from fastapi import Request
@app.middleware("http")
async def log_visits(request: Request, call_next):
    import time
    start = time.time()
    response = await call_next(request)
    try:
        ip = request.client.host if request.client else "unknown"
        log_visit(ip)
    except:
        pass
    return response

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

LOGO_PATH = os.path.join(BASE, 'eve_logo.jpg')
UPGRADE_IMG = os.path.join(BASE, '申请制造商示意.png')
ALIPAY_IMG = os.path.join(BASE, '支付宝.jpg')
BABY_IMG = os.path.join(BASE, 'baby_oye.png')

@app.get("/img/upgrade-guide")
async def serve_upgrade_guide():
    if os.path.exists(UPGRADE_IMG):
        return FileResponse(UPGRADE_IMG, media_type='image/png')
    return HTMLResponse(status_code=404)

@app.get("/img/baby")
async def serve_baby():
    if os.path.exists(BABY_IMG):
        return FileResponse(BABY_IMG, media_type='image/png')
    return HTMLResponse(status_code=404)

@app.get("/img/alipay")
async def serve_alipay():
    if os.path.exists(ALIPAY_IMG):
        return FileResponse(ALIPAY_IMG, media_type='image/jpeg')
    return HTMLResponse(status_code=404)

@app.get("/logo")
async def serve_logo():
    if os.path.exists(LOGO_PATH):
        return FileResponse(LOGO_PATH, media_type='image/jpeg')
    return HTMLResponse(status_code=404)

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
    quantity: int = Query(1, ge=1, le=100000),
    sci: float = Query(0.03, ge=0, le=1),
    tax: float = Query(0.01, ge=0, le=1),
    me: int = Query(0, ge=0, le=10),
    te: int = Query(0, ge=0, le=20),
    skill: float = Query(1.0, ge=0.5, le=1.0),
    overrides: str = Query(None),
    material_ratios: str = Query(None),
    bom: bool = Query(False),
):
    cfg = ManufacturingConfig(
        system_cost_index=sci,
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
        # 按数量倍乘材料
        if quantity > 1 and result.get('materials'):
            for m in result['materials']:
                m['quantity'] = m.get('quantity', 0) * quantity
                m['total_sell'] = m.get('total_sell', 0) * quantity
                m['total_buy'] = m.get('total_buy', 0) * quantity
        if quantity > 1 and result.get('deep_materials'):
            for m in result['deep_materials']:
                m['quantity'] = m.get('quantity', 0) * quantity
                m['total_sell'] = m.get('total_sell', 0) * quantity
                m['total_buy'] = m.get('total_buy', 0) * quantity
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
    username = ""
    role = "user"
    if uid:
        from core import auth as a
        row = a._connect().execute("SELECT is_admin, username, role, manufacturer_expires_at FROM users WHERE id=?", (uid,)).fetchone()
        if row:
            is_admin = bool(row['is_admin'])
            username = row['username']
            role = row['role'] or 'user'
    return {"ok": True, "logged_in": uid is not None, "is_admin": is_admin, "username": username, "role": role,
            "manufacturer_expires_at": (dict(row)['manufacturer_expires_at'] if row else None)}


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


@app.post("/api/admin/set-role")
async def api_set_role(user_id: int = Query(...), role: str = Query("user"),
                        days: int = Query(30, ge=0, le=365),
                        authorization: str = Header(None)):
    from core.auth import verify_token_admin
    admin_id = verify_token_admin(authorization[7:] if authorization and authorization.startswith("Bearer ") else None)
    if not admin_id:
        raise HTTPException(403, "仅超级管理员可操作")
    ok, msg = set_role(admin_id, user_id, role, days)
    return {"ok": ok, "message": msg}

from core.industry import (rebuild_material_cache, rebuild_production_cache,
    search_materials, is_material, is_manufacturable, search_manufacturable, search_reactions,
    list_warehouses, create_warehouse, update_warehouse, delete_warehouse,
    get_line_configs, save_line_config, set_line_count,
    get_reaction_configs, save_reaction_config, set_reaction_count,
    get_warehouse_config, save_warehouse_config,
    get_inventory, get_all_inventory, import_inventory, manual_add_material,
    parse_game_clipboard, calculate_material_requirements,
    start_production, collect_production, cancel_production,
    adjust_production_time, get_production_jobs,
    calc_shortage, create_order, get_orders, update_order_status,
    check_completed_jobs, mark_jobs_completed)

# ========== 订单系统 API ==========
from core.orders import (create_order, get_public_orders, get_user_orders, get_my_acceptances,
    get_order_detail, accept_order, update_acceptance_status, check_expired_orders,
    update_game_contact, get_game_contact)

@app.get("/api/orders/public")
async def api_public_orders():
    return {"ok": True, "orders": get_public_orders()}

@app.get("/api/orders/mine")
async def api_my_orders(authorization: str = Header(None)):
    uid = _require_user(authorization)
    return {"ok": True, "orders": get_user_orders(uid)}

@app.get("/api/orders/my-acceptances")
async def api_my_acceptances(authorization: str = Header(None)):
    uid = _require_user(authorization)
    return {"ok": True, "acceptances": get_my_acceptances(uid)}

@app.get("/api/orders/detail")
async def api_order_detail(order_id: int = Query(...)):
    order = get_order_detail(order_id)
    if not order:
        return {"ok": False, "message": "订单不存在"}
    return {"ok": True, "order": order}

@app.post("/api/orders/create")
async def api_create_order(order_type: str = Query('buy'), items: str = Query('[]'),
                           contact_name: str = Query(''), delivery_location: str = Query('游戏内对接'),
                           notes: str = Query(''), pricing_mode: str = Query('sell'), discount: float = Query(1.0),
                           authorization: str = Header(None)):
    uid = _require_user(authorization)
    import json
    try:
        item_list = json.loads(items)
    except:
        return {"ok": False, "message": "物品格式错误"}
    oid = create_order(uid, order_type, item_list, contact_name, delivery_location, notes, pricing_mode, discount)
    return {"ok": True, "order_id": oid}

@app.post("/api/orders/accept")
async def api_accept_order(order_id: int = Query(...), items_accepted: str = Query('[]'),
                          expected_days: int = Query(0), notes: str = Query(''),
                          authorization: str = Header(None)):
    uid = _require_user(authorization)
    import json
    try:
        acc_list = json.loads(items_accepted)
    except:
        return {"ok": False, "message": "格式错误"}
    ok, msg = accept_order(order_id, uid, acc_list, expected_days, notes)
    return {"ok": ok, "message": msg}

@app.post("/api/orders/cancel")
async def api_cancel_order(order_id: int = Query(...), authorization: str = Header(None)):
    uid = _require_user(authorization)
    from core.orders import _connect as _oconn
    conn = _oconn()
    order = conn.execute("SELECT * FROM orders WHERE id=? AND user_id=?", (order_id, uid)).fetchone()
    if not order:
        conn.close()
        return {"ok": False, "message": "订单不存在"}
    if order['status'] not in ('public', 'cancelled', 'expired'):
        conn.close()
        return {"ok": False, "message": "该订单当前状态不可删除"}
    conn.execute("UPDATE orders SET status='cancelled' WHERE id=?", (order_id,))
    conn.commit()
    conn.close()
    return {"ok": True, "message": "已删除"}

@app.post("/api/orders/accept-status")
async def api_accept_status(acc_id: int = Query(...), status: str = Query('cancelled'),
                           authorization: str = Header(None)):
    uid = _require_user(authorization)
    ok, msg = update_acceptance_status(acc_id, uid, status)
    return {"ok": ok, "message": msg}

@app.post("/api/orders/check-expired")
async def api_check_expired():
    count = check_expired_orders()
    return {"ok": True, "expired": count}

@app.get("/api/profile/game-contact")
async def api_game_contact(authorization: str = Header(None)):
    uid = _require_user(authorization)
    return {"ok": True, "contact": get_game_contact(uid)}

@app.post("/api/profile/game-contact")
async def api_set_game_contact(contact: str = Query(''), authorization: str = Header(None)):
    uid = _require_user(authorization)
    update_game_contact(uid, contact)
    return {"ok": True}

# ========== 工业管理系统 API ==========

# ---- 原料总表 ----
@app.post("/api/industry/rebuild-cache")
async def api_rebuild_cache(authorization: str = Header(None)):
    from core.auth import verify_token_admin
    if not verify_token_admin(authorization[7:] if authorization and authorization.startswith("Bearer ") else None):
        raise HTTPException(403, "仅管理员可操作")
    count = rebuild_material_cache()
    prod_count, react_count = rebuild_production_cache()
    return {"ok": True, "count": count, "products": prod_count, "reactions": react_count}

@app.get("/api/industry/search-materials")
async def api_search_materials(q: str = Query("")):
    return {"ok": True, "materials": search_materials(q)}

@app.get("/api/industry/search-reactions")
async def api_search_reactions(q: str = Query(""), limit: int = Query(20)):
    return {"ok": True, "materials": search_reactions(q, limit)}

@app.get("/api/industry/manufacturable-all")
async def api_manufacturable_all():
    """返回所有可制造物品"""
    from core.industry import _connect as ic
    conn = ic()
    rows = conn.execute(
        "SELECT type_id, name_cn, name_en FROM manufacturable_cache ORDER BY name_cn"
    ).fetchall()
    conn.close()
    return {"ok": True, "items": [dict(r) for r in rows]}


@app.get("/api/industry/check-manufacturable")
async def api_check_manufacturable(type_ids: str = Query("")):
    """批量检查 type_id 是否可制造"""
    ids = [int(x) for x in type_ids.split(',') if x.strip().isdigit()]
    result = {}
    for tid in ids:
        result[str(tid)] = is_manufacturable(tid)
    return {"ok": True, "result": result}

# ---- 分仓库 ----
@app.get("/api/industry/warehouses")
async def api_warehouses(authorization: str = Header(None)):
    uid = _require_user(authorization)
    return {"ok": True, "warehouses": list_warehouses(uid)}

@app.post("/api/industry/warehouse/create")
async def api_create_warehouse(name: str = Query(...), character_name: str = Query(""),
                                station_name: str = Query(""), authorization: str = Header(None)):
    uid = _require_user(authorization)
    ok, msg = create_warehouse(uid, name, character_name, station_name)
    return {"ok": ok, "message": msg}

@app.post("/api/industry/warehouse/update")
async def api_update_warehouse(wid: int = Query(...), name: str = Query(None),
                                character_name: str = Query(None), station_name: str = Query(None),
                                authorization: str = Header(None)):
    uid = _require_user(authorization)
    ok = update_warehouse(wid, uid, name, character_name, station_name)
    return {"ok": ok}

@app.post("/api/industry/warehouse/delete")
async def api_delete_warehouse(wid: int = Query(...), authorization: str = Header(None)):
    uid = _require_user(authorization)
    ok = delete_warehouse(wid, uid)
    return {"ok": ok}

# ---- 生产线 ----
@app.get("/api/industry/line-configs")
async def api_line_configs(warehouse_id: int = Query(...), authorization: str = Header(None)):
    _require_user(authorization)
    return {"ok": True, "configs": get_line_configs(warehouse_id)}

@app.get("/api/industry/reaction-configs")
async def api_reaction_configs(warehouse_id: int = Query(...), authorization: str = Header(None)):
    _require_user(authorization)
    return {"ok": True, "configs": get_reaction_configs(warehouse_id)}

@app.post("/api/industry/reaction-config/save")
async def api_save_reaction_config(warehouse_id: int = Query(...), line_number: int = Query(...),
                                   product_type_id: int = Query(0),
                                   price_mode: str = Query('sell'), price_discount: float = Query(1.0),
                                   custom_price: float = Query(0),
                                   authorization: str = Header(None)):
    _require_user(authorization)
    ok = save_reaction_config(warehouse_id, line_number, product_type_id, price_mode, price_discount, custom_price)
    return {"ok": ok}

@app.post("/api/industry/reaction-count")
async def api_reaction_count(warehouse_id: int = Query(...), count: int = Query(5),
                              authorization: str = Header(None)):
    uid = _require_user(authorization)
    ok, msg = set_reaction_count(warehouse_id, uid, count)
    return {"ok": ok, "message": msg}

@app.get("/api/industry/warehouse-config")
async def api_warehouse_config(warehouse_id: int = Query(...), authorization: str = Header(None)):
    uid = _require_user(authorization)
    return {"ok": True, "config": get_warehouse_config(warehouse_id, uid)}

@app.post("/api/industry/warehouse-config/save")
async def api_save_warehouse_config(warehouse_id: int = Query(...), config: str = Query("{}"),
                                    authorization: str = Header(None)):
    uid = _require_user(authorization)
    import json
    try:
        cfg = json.loads(config)
    except:
        return {"ok": False, "message": "格式错误"}
    ok = save_warehouse_config(warehouse_id, uid, cfg)
    return {"ok": ok}

@app.post("/api/industry/line-config/save")
async def api_save_line_config(warehouse_id: int = Query(...), line_number: int = Query(...),
                                product_type_id: int = Query(0),
                                price_mode: str = Query('sell'), price_discount: float = Query(1.0),
                                custom_price: float = Query(0),
                                authorization: str = Header(None)):
    _require_user(authorization)
    ok = save_line_config(warehouse_id, line_number, product_type_id, price_mode, price_discount, custom_price)
    return {"ok": ok}

@app.post("/api/industry/line-count")
async def api_set_line_count(warehouse_id: int = Query(...), count: int = Query(5),
                              authorization: str = Header(None)):
    uid = _require_user(authorization)
    ok, msg = set_line_count(warehouse_id, uid, count)
    return {"ok": ok, "message": msg}

@app.get("/api/industry/reaction-cost")
async def api_reaction_cost(warehouse_id: int = Query(...), line_number: int = Query(...),
                            product_type_id: int = Query(...), quantity: int = Query(1),
                            price_mode: str = Query('sell'), price_discount: float = Query(1.0),
                            custom_price: float = Query(0),
                            authorization: str = Header(None)):
    uid = _require_user(authorization)
    from core.database import SDEDatabase
    sde = SDEDatabase()
    mats = sde.get_manufacturing_materials(product_type_id, activity_id=11)
    if not mats:
        return {"ok": False, "message": "无反应配方"}
    # 获取单流程产出数量
    from core.database import SDEDatabase as _SDE
    _sde2 = _SDE()
    _conn2 = _sde2._connect()
    _oq = _conn2.execute("SELECT quantity FROM industryActivityProducts WHERE productTypeID=? AND activityID=11", (product_type_id,)).fetchone()
    output_qty = _oq['quantity'] if _oq else 1
    _conn2.close()
    type_ids = list(mats.keys()) + [product_type_id]
    prices = market.get_prices_batch(type_ids)
    total = 0
    for mid, qty in mats.items():
        mp = prices.get(mid, {})
        total += (mp.get('sell_min', 0) or 0) * qty * quantity
    prod_p = prices.get(product_type_id, {})
    market_sell = prod_p.get('sell_min', 0)
    market_buy = prod_p.get('buy_max', 0)
    if price_mode == 'sell':
        unit_price = market_sell * price_discount
    elif price_mode == 'buy':
        unit_price = market_buy * price_discount
    else:
        unit_price = custom_price
    revenue = round(unit_price * output_qty * quantity, 2)
    total = round(total, 2)
    profit = round(revenue - total, 2)
    margin = round((profit / total * 100), 2) if total > 0 else 0
    return {
        "ok": True,
        "data": {
            "product_name": sde.get_chinese_name(product_type_id),
            "output_qty": output_qty,
            "bp_cost": total, "deep_cost": total,
            "market_sell": market_sell, "market_buy": market_buy,
            "unit_price": round(unit_price, 2), "total_revenue": revenue,
            "profit_bp": profit, "profit_deep": profit,
            "margin_bp": margin, "margin_deep": margin,
            "prod_time": sde.get_manufacturing_time(product_type_id)
        }
    }

@app.get("/api/industry/reaction-materials")
async def api_reaction_materials(type_id: int = Query(...), quantity: int = Query(1),
                                   authorization: str = Header(None)):
    """获取反应产物的材料清单"""
    uid = _require_user(authorization)
    from core.database import SDEDatabase
    sde = SDEDatabase()
    mats = sde.get_manufacturing_materials(type_id, activity_id=11)
    if not mats:
        return {"ok": False, "materials": []}
    result = []
    for mid, qty_per_run in mats.items():
        result.append({
            'type_id': mid,
            'name': sde.get_chinese_name(mid),
            'quantity': qty_per_run * quantity
        })
    return {"ok": True, "materials": result}

@app.post("/api/industry/start-reaction")
async def api_start_reaction(warehouse_id: int = Query(...), line_number: int = Query(...),
                              product_type_id: int = Query(...), quantity: int = Query(1),
                              authorization: str = Header(None)):
    uid = _require_user(authorization)
    from core.database import SDEDatabase
    from core.auth import _connect
    sde = SDEDatabase()
    conn = _connect()
    # 检查库存并扣料
    mats = sde.get_manufacturing_materials(product_type_id, activity_id=11)
    if not mats:
        return {"ok": False, "message": "无反应配方"}
    shortage = []
    for mid, base_qty in mats.items():
        need = base_qty * quantity
        row = conn.execute("SELECT quantity FROM warehouse_inventory WHERE warehouse_id=? AND type_id=?",
                          (warehouse_id, mid)).fetchone()
        avail = row['quantity'] if row else 0
        if avail < need:
            shortage.append(sde.get_chinese_name(mid))
        else:
            conn.execute("UPDATE warehouse_inventory SET quantity=quantity-? WHERE warehouse_id=? AND type_id=?",
                        (need, warehouse_id, mid))
    if shortage:
        conn.close()
        return {"ok": False, "message": "材料不足: " + ', '.join(shortage)}
    from datetime import datetime, timedelta
    now = datetime.now()
    end_time = now + timedelta(seconds=sde.get_manufacturing_time(product_type_id))
    conn.execute(
        "INSERT INTO production_jobs (warehouse_id, line_number, user_id, product_type_id, quantity, activity_type, "
        "started_at, estimated_end_at, status) VALUES (?, ?, ?, ?, ?, 'reaction', datetime('now'), ?, 'running')",
        (warehouse_id, line_number, uid, product_type_id, quantity,
         end_time.strftime('%Y-%m-%d %H:%M:%S')))
    job_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()
    return {"ok": True, "result": {
        "job_id": job_id,
        "product_name": sde.get_chinese_name(product_type_id),
        "estimated_end_at": end_time.strftime('%Y-%m-%d %H:%M:%S')
    }}

# ---- 生产线系数保存 ----
@app.get("/api/industry/line-coeffs")
async def api_line_coeffs(warehouse_id: int = Query(...), prefix: str = Query(''), authorization: str = Header(None)):
    uid = _require_user(authorization)
    from core.auth import load_setting
    key = f"{prefix}line_coeffs_{warehouse_id}" if prefix else f"line_coeffs_{warehouse_id}"
    val = load_setting(uid, key, "{}")
    try:
        import json
        coeffs = json.loads(val)
    except:
        coeffs = {}
    return {"ok": True, "coeffs": coeffs}

@app.post("/api/industry/line-coeffs/save")
async def api_save_line_coeffs(warehouse_id: int = Query(...), coeffs: str = Query("{}"),
                               prefix: str = Query(''), authorization: str = Header(None)):
    uid = _require_user(authorization)
    from core.auth import save_setting
    key = f"{prefix}line_coeffs_{warehouse_id}" if prefix else f"line_coeffs_{warehouse_id}"
    save_setting(uid, key, coeffs)
    return {"ok": True}

@app.get("/api/industry/line-coeffs/load")
async def api_load_line_coeffs(warehouse_id: int = Query(...), prefix: str = Query(''),
                                authorization: str = Header(None)):
    uid = _require_user(authorization)
    from core.auth import load_setting
    import json
    key = f"{prefix}line_coeffs_{warehouse_id}" if prefix else f"line_coeffs_{warehouse_id}"
    val = load_setting(uid, key, "{}")
    try:
        coeffs = json.loads(val)
    except:
        coeffs = {}
    return {"ok": True, "coeffs": coeffs}

# ---- 生产线成本与利润（使用仓库加成）----
@app.get("/api/industry/line-cost")
async def api_line_cost(warehouse_id: int = Query(...), line_number: int = Query(...),
                         product_type_id: int = Query(...), quantity: int = Query(1),
                         price_mode: str = Query('sell'), price_discount: float = Query(1.0),
                         custom_price: float = Query(0),
                         mat_rig: float = Query(3.8),
                         mat_build: float = Query(0), mat_implant: float = Query(0),
                         line_me: int = Query(None), line_te: int = Query(None),
                         authorization: str = Header(None)):
    uid = _require_user(authorization)
    from core.database import SDEDatabase
    from core.calculator import ProfitCalculator, ManufacturingConfig
    from core.auth import load_material_overrides

    sde = SDEDatabase()
    # 读取分仓库的生产参数（优先），没有则从产品配置取
    from core.auth import load_setting
    import json as _json
    line_cfg_str = load_setting(uid, f'line_coeffs_{warehouse_id}', '{}')
    try:
        line_cfg = _json.loads(line_cfg_str)
    except:
        line_cfg = {}
    # 产品级别的定价配置
    overrides = load_material_overrides(uid, product_type_id)
    prod_config = overrides.get('-1', {})
    if isinstance(prod_config, str):
        try:
            prod_config = _json.loads(prod_config)
        except:
            prod_config = {}
    # 优先用分仓库参数，没有则用产品配置
    line_sci = line_cfg.get('line_sci', prod_config.get('sci', 0.03))
    line_tax = line_cfg.get('line_tax', prod_config.get('tax', 0.01))
    # 前台存的是百分比数值（如3=3%），转十进制
    if line_sci > 0.5: line_sci = line_sci / 100
    if line_tax > 0.5: line_tax = line_tax / 100
    line_me = line_me if line_me is not None else int(line_cfg.get('line_me', prod_config.get('me', 10)))
    line_te = line_te if line_te is not None else int(line_cfg.get('line_te', prod_config.get('te', 20)))
    line_skill_lv = int(line_cfg.get('line_skill', 5))
    line_skill_factor = 1.25 - 0.05 * line_skill_lv

    mfg_cfg = ManufacturingConfig(
        blueprint_me_level=line_me, blueprint_te_level=line_te,
        system_cost_index=line_sci,
        facility_tax=line_tax
    )
    calc = ProfitCalculator(sde, market, mfg_cfg)

    line_mat_factor = line_skill_factor * ((100 - mat_rig) / 100) * ((100 - mat_build) / 100) * ((100 - mat_implant) / 100)

    bp_result = calc.calculate_with_modes(product_type_id, use_bom=False)
    if not bp_result:
        return {"ok": False, "message": "无配方"}

    # 从 realistic 模式取蓝图材料成本，减去材系数后重算税费
    bp_total = 0
    if bp_result.get('modes'):
        for mo in bp_result['modes']:
            if mo.get('key') == 'realistic' and mo.get('material_cost_eff'):
                mat_eff = mo['material_cost_eff']
                sys_c = mo.get('system_cost', 0)
                fac_t = mo.get('facility_tax', 0)
                bp_total = round(mat_eff * line_mat_factor + sys_c + fac_t, 2)
                output_qty = mo.get('product_quantity', 1) or 1
                break
    if not bp_total:
        return {"ok": False, "message": "无法计算成本"}

    prod_time = sde.get_manufacturing_time(product_type_id)
    te_factor = 1.0 - (line_te * 0.01)  # 每级 1%
    if te_factor < 0.5:
        te_factor = 0.5
    adjusted_time = int(prod_time * te_factor)

    # 基础材料（BOM）成本和税费
    try:
        bom_result = calc.calculate_with_modes(product_type_id, use_bom=True)
        raw_deep = 0
        if bom_result:
            raw_deep = sum((bm.get('total_sell', 0) or 0) for bm in (bom_result.get('deep_materials') or []))
            # 如果 mode 里有 ideal，用它的 material_cost_eff（不含税费）
            if bom_result.get('modes'):
                for mo in bom_result['modes']:
                    if mo.get('key') == 'ideal' and mo.get('material_cost_eff'):
                        raw_deep = mo['material_cost_eff']
                        break
        if raw_deep:
            sci_rate = mfg_cfg.system_cost_index or 0
            tax_rate = mfg_cfg.facility_tax or 0
            deep_total = round(raw_deep * line_mat_factor + raw_deep * sci_rate + raw_deep * tax_rate, 2)
    except Exception as e:
        deep_total = 0

    prices = market.get_prices_batch([product_type_id])
    prod_price = prices.get(product_type_id, {})
    market_sell = prod_price.get('sell_min', 0)
    market_buy = prod_price.get('buy_max', 0)
    if price_mode == 'sell':
        unit_price = market_sell * price_discount
    elif price_mode == 'buy':
        unit_price = market_buy * price_discount
    else:
        unit_price = custom_price

    total_revenue = round(unit_price * output_qty * quantity, 2)

    return {
        "ok": True,
        "data": {
            "product_name": sde.get_chinese_name(product_type_id),
            "bp_cost": bp_total,
            "deep_cost": deep_total,
            "output_qty": output_qty,
            "market_sell": market_sell,
            "market_buy": market_buy,
            "unit_price": round(unit_price, 2),
            "total_revenue": total_revenue,
            "profit_bp": round(total_revenue - bp_total, 2),
            "profit_deep": round(total_revenue - deep_total, 2),
            "margin_bp": round(((total_revenue - bp_total) / bp_total * 100), 2) if bp_total > 0 else 0,
            "margin_deep": round(((total_revenue - deep_total) / deep_total * 100), 2) if deep_total > 0 else 0,
            "prod_time": adjusted_time,
            "_debug_config": {
                "me": line_me, "te": line_te,
                "line_sci": line_sci, "line_tax": line_tax,
                "line_mat_factor": round(line_mat_factor, 4),
                "mat_eff": round(mat_eff, 2),
                "sys_c": round(sys_c, 2),
                "fac_t": round(fac_t, 2)
            }
        }
    }


# ---- 库存 ----
@app.get("/api/industry/inventory")
async def api_inventory(warehouse_id: int = Query(...), authorization: str = Header(None)):
    _require_user(authorization)
    return {"ok": True, "items": get_inventory(warehouse_id)}

@app.get("/api/industry/all-inventory")
async def api_all_inventory(authorization: str = Header(None)):
    uid = _require_user(authorization)
    return {"ok": True, "items": get_all_inventory(uid)}

@app.post("/api/industry/import")
async def api_import_inventory(warehouse_id: int = Query(...), text: str = Body("", embed=True),
                                mode: str = Query("append"), authorization: str = Header(None)):
    uid = _require_user(authorization)
    parsed = parse_game_clipboard(text)
    # 解析 type_id
    from core.estimator import search_item
    items = []
    skipped = []
    for p in parsed:
        tid = search_item(p['name'])
        if tid:
            items.append({'type_id': tid, 'quantity': p['quantity']})
        else:
            skipped.append(p['name'])
    ok, msg = import_inventory(warehouse_id, uid, items, mode)
    return {"ok": ok, "message": msg, "parsed": len(parsed), "imported": len(items), "skipped": skipped}

@app.post("/api/industry/manual-add")
async def api_manual_add(warehouse_id: int = Query(...), type_id: int = Query(...),
                          quantity: int = Query(...), authorization: str = Header(None)):
    uid = _require_user(authorization)
    ok, msg = manual_add_material(warehouse_id, uid, type_id, quantity)
    return {"ok": ok, "message": msg}

# ---- 生产任务 ----
@app.post("/api/industry/start-production")
async def api_start_production(warehouse_id: int = Query(...), line_number: int = Query(...),
                                product_type_id: int = Query(...), quantity: int = Query(1),
                                time_skill: int = Query(32), time_build: int = Query(30), time_rig: int = Query(0),
                                mat_rig: float = Query(3.8),
                                mat_build: float = Query(0), mat_implant: float = Query(0),
                                authorization: str = Header(None)):
    uid = _require_user(authorization)
    ok, result = start_production(warehouse_id, line_number, uid, product_type_id, quantity,
                                  time_skill, time_build, time_rig, mat_rig, mat_build, mat_implant)
    return {"ok": ok, "result": result if isinstance(result, dict) else None, "message": result if isinstance(result, str) else None}

@app.post("/api/industry/mark-completed/{job_id}")
async def api_mark_completed(job_id: int, authorization: str = Header(None)):
    uid = _require_user(authorization)
    from core.auth import _connect
    conn = _connect()
    row = conn.execute(
        "SELECT p.status, sw.user_id as owner_id FROM production_jobs p "
        "JOIN sub_warehouses sw ON p.warehouse_id=sw.id WHERE p.id=?", (job_id,)).fetchone()
    if not row or row['owner_id'] != uid:
        conn.close()
        return {"ok": False}
    if row['status'] == 'running':
        conn.execute("UPDATE production_jobs SET status='completed', actual_end_at=datetime('now') WHERE id=?", (job_id,))
        conn.commit()
    conn.close()
    return {"ok": True}


@app.post("/api/industry/collect")
async def api_collect(job_id: int = Query(...), authorization: str = Header(None)):
    uid = _require_user(authorization)
    ok, msg = collect_production(job_id, uid)
    return {"ok": ok, "message": msg}

@app.post("/api/industry/cancel")
async def api_cancel(job_id: int = Query(...), authorization: str = Header(None)):
    uid = _require_user(authorization)
    ok, msg = cancel_production(job_id, uid)
    return {"ok": ok, "message": msg}

@app.post("/api/industry/adjust-time")
async def api_adjust_time(job_id: int = Query(...), new_end: str = Query(...),
                          authorization: str = Header(None)):
    uid = _require_user(authorization)
    ok, msg = adjust_production_time(job_id, uid, new_end)
    return {"ok": ok, "message": msg}

@app.get("/api/industry/jobs")
async def api_jobs(warehouse_id: int = Query(None), status: str = Query(None),
                   authorization: str = Header(None)):
    uid = _require_user(authorization)
    return {"ok": True, "jobs": get_production_jobs(warehouse_id, uid, status)}

# ---- 缺口统计 ----
@app.get("/api/industry/shortage")
async def api_shortage(warehouse_id: int = Query(...), mat_rig: float = Query(3.8),
                       mat_build: float = Query(0), mat_implant: float = Query(0),
                       authorization: str = Header(None)):
    uid = _require_user(authorization)
    result = calc_shortage(warehouse_id, uid, mat_rig, mat_build, mat_implant)
    return {"ok": True, "result": result}

# ---- 制造订单 ----
@app.post("/api/industry/order/create")
async def api_create_order(customer_name: str = Query(...), items: str = Query("[]"),
                            delivery_location: str = Query("游戏内对接"),
                            pricing_mode: str = Query("sell"), discount: float = Query(1.0),
                            authorization: str = Header(None)):
    uid = _require_user(authorization)
    import json
    try:
        item_list = json.loads(items)
    except:
        return {"ok": False, "message": "物品格式错误"}
    ok, msg, total = create_order(uid, customer_name, item_list, delivery_location, pricing_mode, discount)
    return {"ok": ok, "message": msg, "estimated_total": total}

@app.get("/api/industry/orders")
async def api_orders(status: str = Query(None), authorization: str = Header(None)):
    uid = _require_user(authorization)
    return {"ok": True, "orders": get_orders(uid, status)}

@app.post("/api/industry/order/status")
async def api_order_status(order_id: int = Query(...), status: str = Query("accepted"),
                           authorization: str = Header(None)):
    uid = _require_user(authorization)
    ok, msg = update_order_status(order_id, uid, status)
    return {"ok": ok, "message": msg}

# ---- 超时检查 ----
@app.get("/api/industry/check-completed")
async def api_check_completed(authorization: str = Header(None)):
    uid = _require_user(authorization)
    jobs = check_completed_jobs(uid)
    ids = [j['id'] for j in jobs]
    if ids:
        mark_jobs_completed(ids)
        # 发送站内消息
        for j in jobs:
            from core.auth import send_message
            send_message(0, uid, "生产完成", f"分仓库 '{j.get('warehouse_name','?')}' 的生产已完成，请及时收付。")
    return {"ok": True, "completed": len(ids)}


@app.post("/api/upgrade-manufacturer")
async def api_upgrade(days: int = Query(30, ge=1, le=365),
                       authorization: str = Header(None)):
    from core.auth import verify_token_admin
    admin_id = verify_token_admin(authorization[7:] if authorization and authorization.startswith("Bearer ") else None)
    if not admin_id:
        raise HTTPException(403, "仅管理员可操作")
    uid = _require_user(authorization)
    ok, msg = upgrade_manufacturer(uid, days)
    return {"ok": ok, "message": msg}


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
async def api_estimate(reprocess_rate: float = Query(0.55, ge=0, le=1), ore_rate: float = Query(0.825, ge=0, le=1),
                       text: str = Query("")):
    from core.estimator import estimate_items, parse_input_text, parse_item_line, estimate_is_ore
    lines = text.strip().split('\n')
    parsed = []
    for line in lines:
        items = parse_item_line(line)
        for name, qty in items:
            parsed.append({'name': name, 'quantity': qty})
    if not parsed:
        return {"ok": False, "message": "未识别到物品"}
    results = estimate_items(parsed, reprocess_rate, ore_rate)
    totals = {'direct_sell': 0, 'direct_buy': 0, 'mineral_sell': 0, 'mineral_buy': 0}
    for r in results:
        totals['direct_sell'] += r.get('direct_sell_total', 0)
        totals['direct_buy'] += r.get('direct_buy_total', 0)
        totals['mineral_sell'] += r.get('mineral_sell_total', 0)
        totals['mineral_buy'] += r.get('mineral_buy_total', 0)
    return {"ok": True, "results": results, "totals": totals}


# ===================== 制造商申请 & 激活码 =====================

@app.post("/api/apply-manufacturer")
async def api_apply(character_name: str = Query(""), notes: str = Query(""), authorization: str = Header(None)):
    uid = _require_user(authorization)
    ok, msg = submit_application(uid, 'manufacturer', character_name)
    if ok and character_name:
        # 同时发送站内消息给超级管理员
        from core.auth import send_message
        send_message(uid, 0, f"制造商申请 - {character_name}", f"游戏ID: {character_name}\n备注: {notes}")
    return {"ok": ok, "message": msg}


@app.get("/api/admin/applications")
async def api_applications(status: str = Query(None), authorization: str = Header(None)):
    from core.auth import verify_token_admin
    if not verify_token_admin(authorization[7:] if authorization and authorization.startswith("Bearer ") else None):
        raise HTTPException(403, "仅管理员可操作")
    return {"ok": True, "applications": get_applications(status)}


@app.get("/api/admin/visit-stats")
async def api_visit_stats(authorization: str = Header(None)):
    from core.auth import verify_token_admin
    if not verify_token_admin(authorization[7:] if authorization and authorization.startswith("Bearer ") else None):
        raise HTTPException(403, "仅管理员可查看")
    return {"ok": True, "stats": get_visit_stats()}


@app.post("/api/admin/review-application")
async def api_review(app_id: int = Query(...), status: str = Query("approved"),
                     notes: str = Query(""), authorization: str = Header(None)):
    from core.auth import verify_token_admin
    admin_id = verify_token_admin(authorization[7:] if authorization and authorization.startswith("Bearer ") else None)
    if not admin_id:
        raise HTTPException(403, "仅管理员可操作")
    ok, msg = review_application(app_id, admin_id, status, notes)
    return {"ok": ok, "message": msg}


@app.post("/api/admin/generate-code")
async def api_gen_code(duration: int = Query(30), max_uses: int = Query(1),
                       authorization: str = Header(None)):
    from core.auth import verify_token_admin
    admin_id = verify_token_admin(authorization[7:] if authorization and authorization.startswith("Bearer ") else None)
    if not admin_id:
        raise HTTPException(403, "仅管理员可操作")
    code = generate_code(admin_id, duration, max_uses)
    return {"ok": True, "code": code}


@app.post("/api/redeem-code")
async def api_redeem(code: str = Query(...), authorization: str = Header(None)):
    uid = _require_user(authorization)
    ok, msg = redeem_code(uid, code)
    return {"ok": ok, "message": msg}


# ========== 站内消息 ==========

@app.get("/api/messages/inbox")
async def api_inbox(authorization: str = Header(None)):
    uid = _require_user(authorization)
    from core.auth import get_inbox
    return {"ok": True, "messages": get_inbox(uid)}


@app.get("/api/messages/outbox")
async def api_outbox(authorization: str = Header(None)):
    uid = _require_user(authorization)
    from core.auth import get_outbox
    return {"ok": True, "messages": get_outbox(uid)}


@app.post("/api/messages/send")
async def api_send_msg(to_user_id: int = Query(0), title: str = Query(""), content: str = Query(""),
                       authorization: str = Header(None)):
    uid = _require_user(authorization)
    from core.auth import send_message
    ok, msg = send_message(uid, to_user_id, title, content)
    return {"ok": ok, "message": msg}


@app.put("/api/messages/read/{msg_id}")
async def api_read_msg(msg_id: int, authorization: str = Header(None)):
    uid = _require_user(authorization)
    from core.auth import mark_message_read
    mark_message_read(msg_id, uid)
    return {"ok": True}


@app.put("/api/messages/process/{msg_id}")
async def api_process_msg(msg_id: int, authorization: str = Header(None)):
    from core.auth import verify_token_admin
    if not verify_token_admin(authorization[7:] if authorization and authorization.startswith("Bearer ") else None):
        raise HTTPException(403, "仅管理员可操作")
    from core.auth import _connect
    conn = _connect()
    conn.execute("UPDATE messages SET is_processed=1 WHERE id=?", (msg_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/api/messages/unread-count")
async def api_unread_count(authorization: str = Header(None)):
    uid = _require_user(authorization)
    from core.auth import get_unread_count
    return {"ok": True, "count": get_unread_count(uid)}


# ========== 管理员设置 ==========

@app.get("/api/payment-recipient")
async def api_payment_recipient():
    """无需登录，返回游戏收款人"""
    from core.auth import get_admin_setting
    return {"ok": True, "payment_recipient": get_admin_setting("payment_recipient", "未设置")}


@app.get("/api/admin/settings")
async def api_admin_settings(authorization: str = Header(None)):
    from core.auth import verify_token_admin
    if not verify_token_admin(authorization[7:] if authorization and authorization.startswith("Bearer ") else None):
        raise HTTPException(403, "仅管理员可操作")
    from core.auth import get_admin_setting
    return {
        "ok": True,
        "payment_recipient": get_admin_setting("payment_recipient", "未设置"),
        "free_trial_enabled": get_admin_setting("free_trial_enabled", "0"),
        "free_trial_days": get_admin_setting("free_trial_days", "30")
    }


@app.post("/api/admin/settings")
async def api_set_admin_settings(payment_recipient: str = Query(""), free_trial_enabled: str = Query("0"), free_trial_days: str = Query("30"), authorization: str = Header(None)):
    from core.auth import verify_token_admin
    if not verify_token_admin(authorization[7:] if authorization and authorization.startswith("Bearer ") else None):
        raise HTTPException(403, "仅管理员可操作")
    from core.auth import set_admin_setting
    set_admin_setting("payment_recipient", payment_recipient)
    set_admin_setting("free_trial_enabled", free_trial_enabled)
    set_admin_setting("free_trial_days", free_trial_days)
    return {"ok": True, "message": "已更新"}


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
