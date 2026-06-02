"""制造利润计算引擎（服务器版，支持多模式）"""
from typing import Optional


class ManufacturingConfig:
    def __init__(self, solar_system_id=30000142, system_cost_index=0.03,
                 structure_bonus=0.04, facility_tax=0.01, blueprint_me_level=0):
        self.solar_system_id = solar_system_id
        self.system_cost_index = system_cost_index
        self.structure_bonus = structure_bonus
        self.facility_tax = facility_tax
        self.blueprint_me_level = blueprint_me_level


class ProfitCalculator:
    PRICING_MODES = [
        {
            'key': 'ideal',
            'label': '理想利润',
            'desc': '材料按收单价采购，成品按卖单价卖出',
            'mat_price_mode': 'buy',    # 材料用收单价
            'prod_price_mode': 'sell',  # 成品用卖单价
        },
        {
            'key': 'realistic',
            'label': '时实利润',
            'desc': '材料按卖单价秒买，成品按卖单价挂单卖出',
            'mat_price_mode': 'sell',
            'prod_price_mode': 'sell',
        },
        {
            'key': 'conservative',
            'label': '保守利润',
            'desc': '材料按卖单价秒买，成品按收单价秒出',
            'mat_price_mode': 'sell',
            'prod_price_mode': 'buy',
        },
    ]

    def __init__(self, sde_db, market_api, config: ManufacturingConfig = None):
        self.db = sde_db
        self.market = market_api
        self.config = config or ManufacturingConfig()

    def calculate_with_modes(self, type_id: int,
                             material_overrides: dict = None) -> Optional[dict]:
        """
        计算指定物品的利润，返回 3 种模式的结果

        material_overrides: { materialTypeID: 'buy'|'sell'|'self' }
            用于单独指定某些材料的定价策略
        """
        materials = self.db.get_manufacturing_materials(type_id)
        if not materials:
            return None

        all_ids = [type_id] + list(materials.keys())
        prices = self.market.get_prices_batch(all_ids, self.config.solar_system_id)

        # 获取材料信息
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

        overrides = material_overrides or {}
        default_mode = 'sell'  # 默认用卖单价

        # 给 mat_info 加上 default_pricing_mode
        for m in mat_info:
            mid = m['type_id']
            m['default_pricing_mode'] = overrides.get(str(mid), default_mode)

        models = []

        for mode in self.PRICING_MODES:
            mat_cost = 0.0
            mat_cost_eff = 0.0
            missing = []
            priced_count = 0
            detail = []

            for m in mat_info:
                mid = m['type_id']
                # 检查是否有单独指定
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

            # 成品价格
            prod_price = product_sell if mode['prod_price_mode'] == 'sell' else product_buy
            revenue = prod_price * output_qty

            # 制造附加费用
            sys_cost = mat_cost_eff * self.config.system_cost_index
            fac_tax = mat_cost_eff * self.config.facility_tax
            total = mat_cost_eff + sys_cost + fac_tax
            profit = revenue - total
            margin = (profit / total * 100) if total > 0 else 0.0
            isk_hr = profit / (mfg_time / 3600.0) if mfg_time > 0 else 0.0

            # 数据质量
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
            'materials': mat_info,
            'modes': models,
        }

    def _bp_info(self, type_id: int) -> Optional[dict]:
        conn = self.db._connect()
        row = conn.execute(
            "SELECT typeID, productTypeID, quantity as outputQty "
            "FROM industryActivityProducts WHERE productTypeID=? AND activityID=1",
            (type_id,)
        ).fetchone()
        return dict(row) if row else None
