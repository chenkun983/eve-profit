# manufacturing profit calculator
import json
from typing import Optional


class ManufacturingConfig:
    def __init__(self, solar_system_id=30000142, system_cost_index=0.03,
                 structure_bonus=0.04, facility_tax=0.01,
                 blueprint_me_level=10, blueprint_te_level=20):
        self.solar_system_id = solar_system_id
        self.system_cost_index = system_cost_index
        self.structure_bonus = structure_bonus
        self.facility_tax = facility_tax
        self.blueprint_me_level = blueprint_me_level
        self.blueprint_te_level = blueprint_te_level


class ProfitCalculator:
    PRICING_MODES = [
        {'key': 'realistic', 'label': '蓝图材料利润',
         'desc': '按蓝图直接材料用量 × 卖单价计算实时利润',
         'mat_price_mode': 'sell', 'prod_price_mode': 'sell'},
        {'key': 'ideal', 'label': '基础材料利润',
         'desc': '全量追溯至基础矿物/终端物料 × 卖单价计算实时利润',
         'mat_price_mode': 'sell', 'prod_price_mode': 'sell', 'use_bom': True},
        {'key': 'conservative', 'label': '保守利润',
         'desc': '材料按卖单价秒买，成品按收单价秒出',
         'mat_price_mode': 'sell', 'prod_price_mode': 'buy'},
    ]

    def __init__(self, sde_db, market_api, config: ManufacturingConfig = None):
        self.db = sde_db
        self.market = market_api
        self.config = config or ManufacturingConfig()

    def calculate_with_modes(self, type_id, material_overrides=None, use_bom=False):
        materials = self.db.get_manufacturing_materials(type_id)
        if not materials:
            return None

        all_ids = [type_id] + list(materials.keys())
        prices = self.market.get_prices_batch(all_ids, self.config.solar_system_id)

        if use_bom:
            bom_flat = self._resolve_deep_bom(type_id, prices, flatten_only=True)
            new_materials = {}
            for item in bom_flat:
                tid = item['type_id']
                new_materials[tid] = new_materials.get(tid, 0) + item['total_quantity']
            materials = new_materials
            extra_ids = [tid for tid in materials if tid not in prices]
            if extra_ids:
                extra_prices = self.market.get_prices_batch(extra_ids, self.config.solar_system_id)
                prices.update(extra_prices)
            all_ids = list(materials.keys())

        mat_info = []
        for mat_id, qty in materials.items():
            pd = prices.get(mat_id, {})
            mat_info.append({
                'type_id': mat_id,
                'name': self.db.get_chinese_name(mat_id),
                'name_en': self.db.get_english_name(mat_id),
                'quantity': qty,
                'buy_price': pd.get('buy', 0) if pd else 0,
                'sell_price': pd.get('sell', 0) if pd else 0,
                'has_price': bool(pd and pd.get('buy', 0) > 0),
            })

        product_pd = prices.get(type_id)
        product_has_price = bool(product_pd and product_pd.get('sell', 0) > 0)
        product_buy = product_pd.get('buy', 0) if product_pd else 0
        product_sell = product_pd.get('sell', 0) if product_pd else 0

        total_me = self.config.structure_bonus + self.config.blueprint_me_level * 0.01
        efficiency = 1.0 / (1.0 + total_me)

        bp = self._bp_info(type_id)
        output_qty = bp['outputQty'] if bp else 1
        mfg_time = self.db.get_manufacturing_time(type_id)
        te_total = self.config.blueprint_te_level * 0.02
        eff_time = int(mfg_time / (1 + te_total)) if mfg_time > 0 else 0

        overrides = material_overrides or {}
        default_mode = 'sell'

        for m in mat_info:
            mid = m['type_id']
            m['default_pricing_mode'] = overrides.get(str(mid), default_mode)

        models = []

        for mode in self.PRICING_MODES:
            # 如果该模式需要 BOM，解析全量材料
            mode_mats = mat_info
            if mode.get('use_bom'):
                bom_flat = self._resolve_deep_bom(type_id, prices, flatten_only=True)
                bom_dict = {}
                for item in bom_flat:
                    tid = item['type_id']
                    bom_dict[tid] = bom_dict.get(tid, 0) + item['total_quantity']
                # 补充查询 BOM 材料中缺失的价格
                missing_ids = [tid for tid in bom_dict if tid not in prices]
                if missing_ids:
                    extra = self.market.get_prices_batch(missing_ids, self.config.solar_system_id)
                    prices.update(extra)
                mode_mats = []
                for tid, qty in bom_dict.items():
                    pd = prices.get(tid, {})
                    mode_mats.append({
                        'type_id': tid,
                        'name': self.db.get_chinese_name(tid),
                        'name_en': self.db.get_english_name(tid),
                        'quantity': qty,
                        'buy_price': pd.get('buy', 0) if pd else 0,
                        'sell_price': pd.get('sell', 0) if pd else 0,
                        'has_price': bool(pd and pd.get('buy', 0) > 0),
                        'default_pricing_mode': overrides.get(str(tid), 'sell'),
                    })

            mat_cost = 0.0
            mat_cost_eff = 0.0
            missing = []
            priced_count = 0
            detail = []

            for m in mode_mats:
                mid = m['type_id']
                override = overrides.get(str(mid))
                if override == 'self':
                    price = 0.0
                    has_p = True
                elif override is not None:
                    price = m['buy_price'] if override == 'buy' else m['sell_price']
                    has_p = price > 0
                else:
                    price = m['buy_price'] if mode['mat_price_mode'] == 'buy' else m['sell_price']
                    has_p = m['has_price'] if mode['mat_price_mode'] == 'buy' else (m['sell_price'] > 0)

                if has_p:
                    priced_count += 1
                else:
                    missing.append({
                        'type_id': mid,
                        'name': m['name'],
                        'name_en': m['name_en'],
                        'quantity': m['quantity'],
                    })

                base = price * m['quantity']
                eff = base * efficiency
                mat_cost += base
                mat_cost_eff += eff
                detail.append({
                    'type_id': mid,
                    'name': m['name'],
                    'name_en': m['name_en'],
                    'quantity': m['quantity'],
                    'price_per_unit': round(price, 2),
                    'buy_price': m['buy_price'],
                    'sell_price': m['sell_price'],
                    'base_cost': round(base, 2),
                    'effective_cost': round(eff, 2),
                    'has_price': has_p,
                    'pricing_mode': override or mode['mat_price_mode'],
                })

            prod_price = product_sell if mode['prod_price_mode'] == 'sell' else product_buy
            revenue = prod_price * output_qty

            sys_cost = mat_cost_eff * self.config.system_cost_index
            fac_tax = mat_cost_eff * self.config.facility_tax
            total = mat_cost_eff + sys_cost + fac_tax
            profit = revenue - total
            margin = (profit / total * 100) if total > 0 else 0.0
            isk_hr = profit / (eff_time / 3600.0) if eff_time > 0 else 0.0
            profit_24h = profit * (24 * 3600 / eff_time) if eff_time > 0 else 0.0

            if not product_has_price or prod_price <= 0:
                quality = "成品无价"
            elif priced_count == 0:
                quality = "无数据"
            elif priced_count < len(mat_info):
                quality = "部分缺失"
            else:
                quality = "数据完整"

            models.append({
                'key': mode['key'],
                'label': mode['label'],
                'desc': mode['desc'],
                'data_quality': quality,
                'priced_count': priced_count,
                'total_count': len(mat_info),
                'product_price': round(prod_price, 2),
                'revenue': round(revenue, 2),
                'material_cost': round(mat_cost, 2),
                'material_cost_eff': round(mat_cost_eff, 2),
                'system_cost': round(sys_cost, 2),
                'facility_tax': round(fac_tax, 2),
                'total_cost': round(total, 2),
                'profit': round(profit, 2),
                'profit_margin': round(margin, 2),
                'isk_per_hour': round(isk_hr, 2),
                'profit_24h': round(profit_24h, 2),
                'missing_materials': missing,
            })

        return {
            'type_id': type_id,
            'name_cn': self.db.get_chinese_name(type_id),
            'name_en': self.db.get_english_name(type_id),
            'product_buy_price': product_buy,
            'product_sell_price': product_sell,
            'product_quantity': output_qty,
            'manufacturing_time': mfg_time,
            'effective_time': eff_time,
            'materials': mat_info,
            'modes': models,
            'deep_bom': self._resolve_deep_bom(type_id, prices),
        }

    def _resolve_deep_bom(self, product_type_id, prices=None, flatten_only=False):
        BASE_MINERALS = {34, 35, 36, 37, 38, 39, 40}

        def _resolve(tid, qty, depth=0, max_d=10, visited=None):
            if visited is None:
                visited = set()
            if depth >= max_d or tid in visited:
                return {tid: qty}
            visited.add(tid)
            if tid in BASE_MINERALS:
                visited.discard(tid)
                return {tid: qty}
            materials = self.db.get_manufacturing_materials(tid)
            if not materials:
                visited.discard(tid)
                return {tid: qty}
            result = {}
            for mat_id, mat_qty in materials.items():
                sub = _resolve(mat_id, mat_qty * qty, depth + 1, max_d, visited)
                for sub_id, sub_qty in sub.items():
                    result[sub_id] = result.get(sub_id, 0) + sub_qty
            visited.discard(tid)
            return result

        bp = self._bp_info(product_type_id)
        output_qty = bp['outputQty'] if bp else 1
        flat = _resolve(product_type_id, output_qty)

        result = []
        for tid, total_qty in sorted(flat.items(), key=lambda x: -x[1]):
            if flatten_only:
                result.append({'type_id': tid, 'total_quantity': total_qty})
            else:
                pd = prices.get(tid, {}) if prices else {}
                buy_p = pd.get('buy', 0) if pd else 0
                sell_p = pd.get('sell', 0) if pd else 0
                has_bp = bool(self.db.get_manufacturing_materials(tid))
                is_base = tid in BASE_MINERALS
                result.append({
                    'type_id': tid,
                    'name': self.db.get_chinese_name(tid),
                    'name_en': self.db.get_english_name(tid),
                    'total_quantity': total_qty,
                    'buy_price': buy_p,
                    'sell_price': sell_p,
                    'total_buy_cost': round(buy_p * total_qty, 2),
                    'total_sell_cost': round(sell_p * total_qty, 2),
                    'is_base_mineral': is_base,
                    'is_terminal': not has_bp,
                })
        return result

    def _bp_info(self, type_id):
        conn = self.db._connect()
        row = conn.execute(
            "SELECT typeID, productTypeID, quantity as outputQty "
            "FROM industryActivityProducts WHERE productTypeID=? AND activityID=1",
            (type_id,)
        ).fetchone()
        return dict(row) if row else None
