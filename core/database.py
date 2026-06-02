"""SDE 蓝图数据查询层（服务器版）"""
import sqlite3
import os


class SDEDatabase:
    DATA_DIR = 'data'

    def __init__(self, db_path=None):
        if db_path is None:
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            db_path = os.path.join(base, self.DATA_DIR, 'sde.sqlite')
        self.db_path = db_path

    def _connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def get_chinese_name(self, type_id: int) -> str:
        conn = self._connect()
        row = conn.execute(
            "SELECT text FROM trnTranslations WHERE tcID=8 AND keyID=? AND languageID='zh'",
            (type_id,)
        ).fetchone()
        if row:
            return row['text']
        row = conn.execute("SELECT typeName FROM invTypes WHERE typeID=?", (type_id,)).fetchone()
        return row['typeName'] if row else str(type_id)

    def get_english_name(self, type_id: int) -> str:
        conn = self._connect()
        row = conn.execute("SELECT typeName FROM invTypes WHERE typeID=?", (type_id,)).fetchone()
        return row['typeName'] if row else str(type_id)

    def get_manufacturing_materials(self, product_type_id: int) -> dict:
        conn = self._connect()
        bp_row = conn.execute(
            "SELECT typeID, quantity as outputQty FROM industryActivityProducts "
            "WHERE productTypeID=? AND activityID=1",
            (product_type_id,)
        ).fetchone()
        if not bp_row:
            return {}
        bp_type_id = bp_row['typeID']
        materials = conn.execute(
            "SELECT materialTypeID, quantity FROM industryActivityMaterials "
            "WHERE typeID=? AND activityID=1",
            (bp_type_id,)
        ).fetchall()
        return {row['materialTypeID']: row['quantity'] for row in materials}

    def get_manufacturing_time(self, product_type_id: int) -> int:
        conn = self._connect()
        bp_row = conn.execute(
            "SELECT typeID FROM industryActivityProducts "
            "WHERE productTypeID=? AND activityID=1",
            (product_type_id,)
        ).fetchone()
        if not bp_row:
            return 0
        row = conn.execute(
            "SELECT time FROM industryActivity WHERE typeID=? AND activityID=1",
            (bp_row['typeID'],)
        ).fetchone()
        return row['time'] if row else 0

    def search_by_name(self, keyword: str, limit: int = 30) -> list:
        conn = self._connect()
        rows = conn.execute(
            "SELECT keyID as typeID, text as name FROM trnTranslations "
            "WHERE tcID=8 AND languageID='zh' AND text LIKE ? "
            "ORDER BY keyID LIMIT ?",
            (f'%{keyword}%', limit)
        ).fetchall()
        return [dict(row) for row in rows]

    # ========== 市场分类翻译 ==========
    _zh_groups = {
        # 根分类
        'Blueprints & Reactions':'蓝图和反应','Ships':'舰船','Ship Equipment':'舰船装备',
        'Ammo & Charges':'军火和弹药','Trade Goods':'贸易货物','Implants & Boosters':'植入体和增强',
        'Drones & Probes':'无人机和探测器','Materials':'材料','Apparel':'外观',
        'Structure & Services':'建筑和服务',

        # 舰船子类
        'Frigates':'护卫舰','Cruisers':'巡洋舰','Battleships':'战列舰',
        'Haulers':'运载舰','Destroyers':'驱逐舰','Battlecruisers':'战列巡洋舰',
        'Dreadnoughts':'无畏舰','Carriers':'航母','Titans':'泰坦',
        'Freighters':'货舰','Shuttles':'穿梭机','Rookie Ships':'新手船',
        'Interceptors':'拦截舰','Covert Ops':'隐形特勤舰',
        'Logistics':'后勤舰','Heavy Assault Cruisers':'重突',
        'Assault Frigates':'突击护卫舰','Mining Barges':'采矿驳船',
        'Transport Ships':'运输舰','Interdictors':'拦截舰','Command Ships':'指挥舰',
        'Exhumers':'采掘者','Marauders':'掠夺舰','Black Ops':'黑隐特勤舰',
        'Recon Ships':'侦察舰','Capital Industrial Ships':'旗舰工业舰',
        'Force Auxiliaries':'武力辅助舰','Industrial Command Ships':'工业指挥舰',
        'Jump Freighters':'跳跃货舰','Expedition Frigates':'远征护卫舰',
        'Logistics Frigates':'后勤护卫舰','Electronic Attack Frigates':'电子攻击护卫舰',
        'Heavy Interdiction Cruisers':'重型拦截巡洋舰','Strategic Cruisers':'战略巡洋舰',
        'Flag Cruisers':'旗舰巡洋舰','Tactical Destroyers':'战术驱逐舰',
        'Command Destroyers':'指挥驱逐舰',

        # 标准/势力/高级舰船
        'Standard Frigates':'标准护卫舰','Standard Cruisers':'标准巡洋舰',
        'Standard Battleships':'标准战列舰','Standard Destroyers':'标准驱逐舰',
        'Standard Battlecruisers':'标准战列巡洋舰','Standard Haulers':'标准运载舰',
        'Standard Carriers':'标准航母','Standard Dreadnoughts':'标准无畏舰',
        'Standard Titans':'标准泰坦','Standard Corvettes':'标准护卫舰',
        'Faction Frigates':'势力护卫舰','Faction Cruisers':'势力巡洋舰',
        'Faction Battleships':'势力战列舰','Faction Destroyers':'势力驱逐舰',
        'Faction Battlecruisers':'势力战列巡洋舰',
        'Faction Carriers':'势力航母','Faction Dreadnoughts':'势力无畏舰',
        'Faction Titans':'势力泰坦','Faction Force Auxiliaries':'势力武力辅助舰',
        'Navy Faction':'海军势力','Pirate Faction':'海盗势力',
        'Advanced Frigates':'高级护卫舰','Advanced Cruisers':'高级巡洋舰',
        'Advanced Battleships':'高级战列舰','Advanced Destroyers':'高级驱逐舰',
        'Advanced Battlecruisers':'高级战列巡洋舰','Advanced Haulers':'高级运载舰',
        'Advanced Dreadnoughts':'高级无畏舰',
        'Precursor Frigates':'先驱护卫舰','Precursor Cruisers':'先驱巡洋舰',
        'Precursor Battleships':'先驱战列舰','Precursor Destroyers':'先驱驱逐舰',
        'Precursor Battlecruisers':'先驱战列巡洋舰','Precursor Dreadnoughts':'先驱无畏舰',

        # 种族
        'Caldari':'加达里','Minmatar':'米玛塔尔','Amarr':'艾玛','Gallente':'盖伦特',
        'ORE':'ORE','Upwell':'UPWELL','Triglavian':'特里格拉夫','EDENCOM':'EDENCOM',
        'CONCORD':'统合部','Sisters of EVE':'EVE姐妹会',

        # 装备 - 护甲
        'Armor':'装甲','Armor Hardeners':'装甲增强器','Armor Plates':'装甲板',
        'Damage Controls':'损伤控制','Energized Armor Membranes':'通电装甲薄膜',
        'Armor Coatings':'装甲涂层','Energized Armor Resistance Membranes':'通电装甲抗性薄膜',
        'Armor Resistance Coatings':'装甲抗性涂层','Layered Armor Coatings':'复合装甲涂层',
        'Layered Energized Armor Membranes':'复合通电装甲薄膜',
        'Armor Repairers':'装甲维修器','Remote Armor Repairers':'远程装甲维修器',
        'Mutadaptive Remote Armor Repairers':'变异适应远程装甲维修器',
        'Reactive Armor Hardeners':'反应式装甲增强器',
        'Scriptable Armor Hardeners':'可编程装甲增强器',
        'Mass Entangler':'质量缠绕器','Mass Entanglers':'质量缠绕器',

        # 装备 - 护盾
        'Shield':'护盾','Shield Flux Coils':'护盾通量线圈','Shield Hardeners':'护盾增强器',
        'Shield Extenders':'护盾扩展器','Shield Power Relays':'护盾能源继电器',
        'Shield Rechargers':'护盾回充器','Shield Boosters':'护盾回充增量器',
        'Shield Boost Amplifiers':'护盾回充增量放大器','Boost Amplifiers':'增量放大器',
        'Shield Resistance Amplifiers':'护盾抗性放大器',
        'Remote Shield Boosters':'远程护盾回充增量器',
        'Shield Transporters':'护盾传输器',

        # 装备 - 推进
        'Propulsion':'推进','Afterburners':'加速器','Microwarpdrives':'微型跃迁引擎',
        'Propulsion Upgrades':'推进升级','Micro Jump Drives':'微型跳跃引擎',
        'Micro Jump Field Generators':'微型跳跃场发生器',

        # 装备 - 工程
        'Engineering':'工程','Engineering Equipment':'工程装备',
        'Capacitor Batteries':'电容电池','Capacitor Rechargers':'电容回充器',
        'Capacitor Power Relays':'电容能源继电器','Capacitor Flux Coils':'电容通量线圈',
        'Capacitor Boosters':'电容注电器','Auxiliary Power Controls':'辅助电源控制',
        'Power Diagnostic Systems':'电源诊断系统','Reactor Control Units':'反应堆控制单元',
        'Energy Neutralizers':'能量中和器','Energy Nosferatu':'掠能器',
        'Energy Nositers':'掠能器','Energy Transfer Arrays':'能量传输阵列',
        'Remote Capacitor Transmitters':'远程电容传输装置',
        'Armor Reinforcers':'装甲强化器','Point Defense Batteries':'近防炮台',

        # 装备 - 电子
        'Electronics':'电子','Electronics and Sensor Upgrades':'电子和感应升级',
        'Electronic Warfare':'电子战','Electronic Warfare Drones':'电子战无人机',
        'ECM':'ECM','ECCM':'反ECM','ECM Burst':'ECM脉冲',
        'Electronic Counter Measures':'电子反制',
        'Sensor Dampeners':'感应抑阻','Tracking Disruptors':'跟踪干扰',
        'Target Painters':'目标标记','Warp Scramblers':'跃迁扰断器',
        'Warp Disruptors':'跃迁扰频器','Warp Disruption Field Generators':'跃迁扰断力场发生器',
        'Stasis Webs':'停滞缠绕','Stasis Webifiers':'停滞缠绕光束',
        'Stasis Grapplers':'停滞抓取器','Burst Projectors':'爆发投射器',
        'Interdiction Sphere Launchers':'拦截弹发射器',
        'Weapon Disruptors':'武器干扰','Sensor Backup Arrays':'感应备份阵列',
        'Automated Targeting Systems':'自动锁定系统',
        'Passive Targeting Systems':'被动锁定系统',
        'Sensor Boosters':'感应增强器','Remote Sensor Boosters':'远程感应增强器',
        'Remote Sensor Dampeners':'远程感应抑阻','Projected ECCM':'投射式反ECM',
        'Signature Suppressor':'信号抑制器','Cloaking Devices':'隐形装置',
        'CPU Upgrades':'CPU升级','Signal Amplifiers':'信号放大器',
        'Warp Disruption Probes':'跃迁干扰探针','Scanner Upgrades':'扫描升级',
        'Electronics Upgrades':'电子升级',

        # 装备 - 炮台
        'Turret & Launchers':'炮台和发射器','Turrets & Launchers':'炮台和发射器',
        'Turrets & Bays':'炮台和发射仓',
        'Hybrid Turrets':'混合炮台','Laser Turrets':'能量炮台','Projectile Turrets':'射弹炮台',
        'Energy Turrets':'能量炮台',
        'Railguns':'磁轨炮','Blasters':'疾速炮',
        'Autocannons':'自动加农炮','Artillery Cannons':'加农火炮',
        'Beam Lasers':'集束激光器','Pulse Lasers':'脉冲激光器',
        'Precursor Turrets':'先驱炮台','Entropic Disintegrators':'熵分解器',
        'Vorton Projectors':'涡旋投射器','Breacher Pod Launchers':'破舱投射器',
        'Missile Launchers':'导弹发射器',
        'Superweapons':'超级武器','Bomb Launchers':'炸弹发射器',
        'Doomsday Devices':'末日武器',

        # 武器升级
        'Weapon Upgrades':'武器升级',
        'Ballistic Control Systems':'弹道控制系统','Gyrostabilizers':'回转稳定器',
        'Heat Sinks':'散热槽','Magnetic Field Stabilizers':'磁场稳定器',
        'Tracking Computers':'跟踪计算机','Tracking Enhancers':'跟踪增强器',
        'Remote Tracking Computers':'远程跟踪计算机',
        'Siege Modules':' siege模块','Missile Guidance Computers':'导弹制导计算机',
        'Missile Guidance Enhancers':'导弹制导增强器',
        'Entropic Radiation Sinks':'熵辐射散热槽','Vorton Tuning Systems':'涡旋调谐系统',

        # 无人机
        'Drones':'无人机','Mining Drones':'采矿无人机','Combat Drones':'战斗无人机',
        'Fighters':'铁骑舰载机','Fighter Bombers':'铁骑轰炸机',
        'Light Fighters':'轻型铁骑','Heavy Fighters':'重型铁骑',
        'Support Fighters':'支援铁骑','Combat Utility Drones':'战斗效用无人机',
        'Salvage Drones':'打捞无人机','Logistic Drones':'后勤无人机',
        'Heavy Attack Drones':'重型攻击无人机','Light Scout Drones':'轻型侦察无人机',
        'Medium Scout Drones':'中型侦察无人机','Sentry Drones':'岗哨无人机',
        'Repair Drones':'修理无人机','Drone Upgrades':'无人机升级装备',
        'Carrier-based Fighters':'航母铁骑','Structure-based Fighters':'建筑铁骑',
        'Standup Light Fighters':'驻守轻型铁骑','Standup Heavy Fighters':'驻守重型铁骑',
        'Standup Support Fighters':'驻守支援铁骑',

        # 弹药
        'Ammo':'弹药','Charges':'弹药','Projectile Ammo':'射弹弹药',
        'Hybrid Charges':'混合弹药','Frequency Crystals':'频率晶体',
        'Missiles':'导弹','Auto-Targeting':'自动锁定','Defender':'防御',
        'Light Missiles':'轻型导弹','Heavy Missiles':'重型导弹',
        'Rockets':'火箭','Torpedoes':'鱼雷','Cruise Missiles':'巡航导弹',
        'Heavy Assault Missiles':'重型突击导弹',
        'XL Torpedoes':'超大型鱼雷','XL Cruise Missiles':'超大型巡航导弹',
        'Structure Antisubcapital Missiles':'建筑反次级旗舰导弹',
        'Structure Anticapital Missiles':'建筑反旗舰导弹',
        'Standard Ammo':'标准弹药','Advanced Artillery Ammo':'高级火炮弹药',
        'Advanced Autocannon Ammo':'高级自动加农炮弹药',
        'Advanced Blaster Charges':'高级疾速弹药',
        'Advanced Railgun Charges':'高级磁轨弹药',
        'Advanced Beam Laser Crystals':'高级集束激光晶体',
        'Advanced Pulse Laser Crystals':'高级脉冲激光晶体',
        'Faction Ammo':'势力弹药','Faction Charges':'势力弹药',
        'Faction Crystals':'势力晶体','Faction Missiles':'势力导弹',
        'Standard Charges':'标准弹药','Standard Crystals':'标准晶体',
        'Standard Missiles':'标准导弹',
        'Advanced High Precision Light Missiles':'高精度轻型导弹',
        'Advanced High Damage Light Missiles':'高伤害轻型导弹',
        'Advanced Long Range Rockets':'远程火箭',
        'Advanced Anti-Ship Rockets':'反舰火箭',
        'Advanced Long Range Torpedoes':'远程鱼雷',
        'Advanced Anti-Ship Torpedoes':'反舰鱼雷',
        'Advanced High Precision Heavy Missiles':'高精度重型导弹',
        'Advanced High Damage Heavy Missiles':'高伤害重型导弹',
        'Advanced Long Range Heavy Assault Missiles':'远程重型突击导弹',
        'Advanced Anti-Ship Heavy Assault Missile':'反舰重型突击导弹',
        'Advanced High Precision Cruise Missiles':'高精度巡航导弹',
        'Advanced High Damage Cruise Missiles':'高伤害巡航导弹',
        'Advanced Anti-Ship XL Torpedoes':'反舰超大型鱼雷',
        'Advanced Long Range XL Torpedoes':'远程超大型鱼雷',
        'Advanced High Precision XL Cruise Missiles':'高精度超大型巡航导弹',
        'Advanced High Damage XL Cruise Missiles':'高伤害超大型巡航导弹',
        'Standard Auto-Targeting':'标准自动锁定',
        'Faction Auto-Targeting':'势力自动锁定',

        # 弹药物理尺寸
        'Small':'小型','Medium':'中型','Large':'大型',
        'Extra Large':'超大型','Capital':'旗舰','Micro':'微型','Heavy':'重型',
        'X-Large':'特大型',

        # 改装件
        'Rigs':'改装件','Ship Modifications':'舰船改装',
        'Armor Rigs':'装甲改装件','Astronautic Rigs':'宇航改装件',
        'Drone Rigs':'无人机改装件','Electronics Superiority Rigs':'电子优势改装件',
        'Engineering Rigs':'工程改装件','Energy Weapon Rigs':'能量武器改装件',
        'Hybrid Weapon Rigs':'混合武器改装件','Missile Launcher Rigs':'导弹发射器改装件',
        'Projectile Weapon Rigs':'射弹武器改装件','Shield Rigs':'护盾改装件',
        'Resource Processing Rigs':'资源处理改装件','Scanning Rigs':'扫描改装件',
        'Targeting Rigs':'锁定改装件',
        'Structure Modifications':'建筑改装',
        'Structure Combat Rigs':'建筑战斗改装','Structure Engineering Rigs':'建筑工程改装',
        'Structure Resource Processing Rigs':'建筑资源处理改装',

        # 子系统
        'Subsystems':'子系统',
        'Amarr Subsystems':'艾玛子系统','Caldari Subsystems':'加达里子系统',
        'Minmatar Subsystems':'米玛塔尔子系统','Gallente Subsystems':'盖伦特子系统',
        'Amarr Core Subsystems':'艾玛核心子系统','Amarr Defensive Subsystems':'艾玛防御子系统',
        'Amarr Offensive Subsystems':'艾玛进攻子系统','Amarr Propulsion Subsystems':'艾玛推进子系统',
        'Caldari Core Subsystems':'加达里核心子系统','Caldari Defensive Subsystems':'加达里防御子系统',
        'Caldari Offensive Subsystems':'加达里进攻子系统','Caldari Propulsion Subsystems':'加达里推进子系统',
        'Minmatar Core Subsystems':'米玛塔尔核心子系统','Minmatar Defensive Subsystems':'米玛塔尔防御子系统',
        'Minmatar Offensive Subsystems':'米玛塔尔进攻子系统','Minmatar Propulsion Subsystems':'米玛塔尔推进子系统',
        'Gallente Core Subsystems':'盖伦特核心子系统','Gallente Defensive Subsystems':'盖伦特防御子系统',
        'Gallente Offensive Subsystems':'盖伦特进攻子系统','Gallente Propulsion Subsystems':'盖伦特推进子系统',

        # 智能炸弹、舰队辅助
        'Smartbombs':'智能炸弹','Fleet Assistance Modules':'舰队辅助装备',
        'Command Bursts':'指挥脉冲','Command Processors':'指挥处理器',
        'Jump Portal Generators':'跳跃通道发生器','Cynosural Field Generators':'诱导力场发生器',
        'Clone Vat Bays':'克隆舱','Warfare Links':'战斗链接',
        'Command Burst Charges':'指挥脉冲弹药',
        'Armor Command Burst Charges':'装甲指挥脉冲弹药',
        'Information Command Burst Charges':'信息指挥脉冲弹药',
        'Mining Foreman Burst Charges':'采矿领班脉冲弹药',
        'Shield Command Burst Charges':'护盾指挥脉冲弹药',
        'Skirmish Command Burst Charges':'游击指挥脉冲弹药',
        'Expedition Command Burst Charges':'远征指挥脉冲弹药',

        # 扫描、采集
        'Scanning Equipment':'扫描装备','Harvest Equipment':'采集装备',
        'Mining Lasers':'采矿激光器','Strip Miners':'提炼采矿器',
        'Ice Harvesters':'冰矿采集器','Gas Cloud Harvesters':'气体采集器',
        'Salvagers':'打捞器','Tractor Beams':'牵引光束',
        'Mining Upgrades':'采矿升级','Analyzers':'分析仪',
        'Data Miners':'数据破解器','Relic Analyzers':'遗迹分析仪',
        'Scan Probe Launchers':'扫描探针发射器','Survey Probe Launchers':'测量探针发射器',
        'Entosis Links':'固化连接',
        'Scanners':'扫描器','Scan Probes':'扫描探针','Survey Probes':'测量探针',
        'Interdiction Probes':'拦截探针',
        'Cargo Scanners':'货柜扫描器','Ship Scanners':'舰船扫描器',
        'Survey Scanners':'测量扫描器','Scanning Upgrades':'扫描升级',
        'Mining Survey Chipsets':'采矿测量芯片',
        'Gas Cloud Scoops':'气体收集器','Ice Mining Lasers':'冰矿采矿激光器',
        'Compressors':'压缩器','Compressor Blueprints':'压缩器蓝图',

        # 弹药其他
        'Cap Booster Charges':'电容注电器装料',
        'Mining Crystals':'采矿晶体','Bombs':'炸弹','Scripts':'脚本',
        'Nanite Repair Paste':'纳米修复贴',
        'Exotic Plasma Charges':'异种等离子弹药',
        'Condenser Packs':'冷凝弹仓','Breacher Pods':'破舱弹',
        'Structure Guided Bombs':'建筑制导炸弹',
        'Structure Area Denial Ammunition':'建筑区域阻绝弹药',
        'Asteroid Mining Crystals':'小行星采矿晶体',
        'Moon Mining Crystals':'月矿采矿晶体',
        'Orbital Strike':'轨道打击',
        'Faction Ammo':'势力弹药',

        # 材料 - 矿物
        'Minerals':'矿物','Raw Materials':'原材料',
        'Standard Ores':'标准矿石','Ice Ores':'冰矿',
        'Moon Ores':'月矿','Alloys & Compounds':'合金与化合物',
        'Abyssal Materials':'深渊材料','Unrefined Minerals':'未精炼矿物',
        'Gas Clouds Materials':'气体云材料',
        'Booster Gas Clouds':'增强气体云','Fullerenes':'富勒烯',
        'Compressed Gas':'压缩气体',
        'Ice Products':'冰矿产品',
        'Reaction Materials':'反应材料','Advanced Moon Materials':'高级月矿材料',
        'Processed Moon Materials':'加工月矿材料','Raw Moon Materials':'原始月矿材料',
        'Booster Materials':'增强材料','Polymer Materials':'聚合物材料',
        'Molecular-Forged Materials':'分子锻造材料',
        'Planetary Materials':'行星材料','Raw Planetary Materials':'原始行星材料',
        'Processed Planetary Materials':'加工行星材料',
        'Refined Planetary Materials':'精炼行星材料',
        'Specialized Planetary Materials':'专业行星材料',
        'Advanced Planetary Materials':'高级行星材料',
        'Salvage Materials':'打捞材料','Ancient Salvaged Materials':'远古打捞材料',
        'Salvaged Materials':'打捞材料',
        'Faction Materials':'势力材料','Named Components':'命名组件',
        'Advanced Protective Technology':'高级防护技术',
        'Molecular-Forging Tools':'分子锻造工具',
        'Colony Reagents':'殖民地试剂','Infomorph Systems':'信息形态系统',
        'Atavum':'返祖物质',

        # 矿石明细
        'Arkonor':'艾克诺岩','Bistot':'灰岩','Pyroxeres':'斜长岩',
        'Plagioclase':'斜长岩','Spodumain':'锂辉石','Veldspar':'凡晶石',
        'Scordite':'灼烧矿','Crokite':'克洛基石','Dark Ochre':'暗赭石',
        'Kernite':'干焦岩','Gneiss':'片麻岩','Omber':'奥贝尔石',
        'Hedbergite':'希博岩','Hemorphite':'水硼砂','Jaspet':'杰斯贝矿',
        'Mercoxit':'水硼砂',
        'Bezdnacine':'贝兹纳辛','Rakovene':'拉科文','Talassonite':'塔拉索尼特',

        # 月矿明细
        'Ubiquitous Moon Ores':'常见月矿','Common Moon Ores':'普通月矿',
        'Uncommon Moon Ores':'稀有月矿','Rare Moon Ores':'罕见月矿',
        'Exceptional Moon Ores':'非凡月矿',

        # 组件
        'Components':'组件','Standard Capital Ship Components':'标准旗舰组件',
        'Advanced Capital Components':'高级旗舰组件','Advanced Capital Ship Components':'高级旗舰组件',
        'Advanced Components':'高级组件','Structure Components':'建筑组件',
        'Subsystem Components':'子系统组件','Outpost Components':'哨站组件',
        'Construction Platforms':'建造平台','Improvement Platforms':'改进平台',
        'Outpost Upgrade Platforms':'哨站升级平台',
        'Fuel Blocks':'燃料块','R.A.M.':'RAM','R.Db':'RDb',
        'Protective Components':'防护组件',

        # 研发
        'Research Equipment':'研发设备','Manufacture & Research':'制造与研究',
        'Datacores':'数据核心','Decryptors':'解码器','Ancient Relics':'远古遗物',

        # 植入体
        'Implants':'植入体','Implant Slot 06':'植入体槽6','Implant Slot 07':'植入体槽7',
        'Implant Slot 08':'植入体槽8','Implant Slot 09':'植入体槽9',
        'Implant Slot 10':'植入体槽10','Implant Slot 01':'植入体槽1',
        'Implant Slot 02':'植入体槽2','Implant Slot 03':'植入体槽3',
        'Implant Slot 04':'植入体槽4','Implant Slot 05':'植入体槽5',
        'Attribute Enhancers':'属性增强','Skill Hardwiring':'技能硬接线',
        'Armor Implants':'装甲植入体','Electronic Systems Implants':'电子系统植入体',
        'Engineering Implants':'工程植入体','Faction Omega Implants':'势力终极植入体',
        'Gunnery Implants':'炮术植入体','Industry Implants':'工业植入体',
        'Fleet Support Implants':'舰队支援植入体','Missile Implants':'导弹植入体',
        'Navigation Implants':'导航植入体','Science Implants':'科学植入体',
        'Shield Implants':'护盾植入体','Targeting Implants':'锁定植入体',
        'Resource Processing Implants':'资源处理植入体',
        'Scanning Implants':'扫描植入体','Neural Enhancement Implants':'神经增强植入体',
        'Drone Implants':'无人机植入体','Booster':'回旋加速器',
        'Booster Slot 01':'回旋加速器槽1','Booster Slot 02':'回旋加速器槽2',
        'Booster Slot 03':'回旋加速器槽3','Booster Slot 11':'回旋加速器槽11',
        'Booster Slot 12':'回旋加速器槽12','Booster Slot 14':'回旋加速器槽14',
        'Booster Slot 15':'回旋加速器槽15','Booster Slot 16':'回旋加速器槽16',
        'Booster Slot 17':'回旋加速器槽17',
        'Blue Pill':'蓝药','Exile':'流放','Mindflood':'心潮','X-Instinct':'X本能',
        'Antipharmakon':'反药','Drop':'坠','Frentix':'弗伦提斯','Sooth Sayer':'预言者',
        'Crash':'崩','Hardshell':'硬甲','Overclocker':'超频','Pyrolancea':'焰矛',
        'Clone Mappers':'克隆映射','Cerebral Accelerators':'大脑加速器',

        # 其他
        'Cerebral Accelerators':'大脑加速器',
        'Other':'其他',

        # 建筑
        'Structures':'建筑','Structure & Construction':'建筑与堡垒',
        'Citadels':'堡垒','Standard Citadels':'标准堡垒','Faction Citadels':'势力堡垒',
        'Engineering Complexes':'工程复合体','Refineries':'精炼厂',
        'FLEX Structures':'FLEX建筑','Navigation Structures':'导航建筑',
        'Mining Structures':'采矿建筑',
        'Deployable Structures':'可部署建筑',
        'Mobile Depots':'移动仓库','Mobile Tractor Units':'移动牵引装置',
        'Mobile Cynosural Inhibitors':'移动诱导抑制剂',
        'Mobile Micro Jump Units':'移动微型跳跃装置',
        'Mobile Scan Inhibitors':'移动扫描抑制剂',
        'Mobile Siphon Units':'移动虹吸装置',
        'Mobile Cynosural Beacons':'移动诱导信标',
        'Mobile Observatories':'移动观测站',
        'Mobile Phase Anchors':'移动相位锚点',
        'Mercenary Dens':'佣兵据点',
        'Analysis Beacons':'分析信标',
        'Mobile Strategic Objectives':'移动战略目标',
        'Warp Disruption Fields':'跃迁干扰力场',
        'Cargo Containers':'货柜',
        'Secure Containers':'安全货柜','Audit Log Containers':'审计日志货柜',
        'Freight Containers':'货运货柜','Standard Containers':'标准货柜',
        'Station Containers':'空间站货柜',
        'Encounter Surveillance Systems':'会战监视系统',
        'Starbase & Sovereignty':'空间站与主权',
        'Starbase Structures':'空间站建筑',
        'Control Towers':'控制塔','Assembly Arrays':'装配阵列',
        'Corporate Hangar Arrays':'公司机库阵列','Personal Hangar Arrays':'私人机库阵列',
        'Cynosural Generator Arrays':'诱导发生器阵列',
        'Cynosural System Jammers':'星域诱导干扰器',
        'Jump Bridge':'跳跃桥接',
        'Reactors':'反应堆','Moon Harvesting Arrays':'月矿采集阵列',
        'Reprocessing Arrays':'精炼阵列','Shield Hardening Arrays':'护盾增强阵列',
        'Silos':'仓库','Laboratories':'实验室','Laboratory':'实验室',
        'Weapon Batteries':'武器炮台','Ship Maintenance Arrays':'舰船维护阵列',
        'Compression Array':'压缩阵列',
        'System Scanning Array':'星系扫描阵列',
        'Personal Hangar Arrays':'私人机库阵列',
        'Sovereignty Structures':'主权建筑','Territorial Claim Units':'领土声明装置',
        'Sovereignty Blockade Units':'主权封锁装置','Sovereignty Hubs':'主权枢纽',
        'Infrastructure Upgrades':'基础设施升级',
        'Strategic Upgrades':'战略升级','Industrial Upgrades':'工业升级',
        'Military Upgrades':'军事升级','Colony Resources Management':'殖民地资源管理',
        'Signature Detection Arrays':'信号探测阵列','System Effect Generator Upgrades':'星系效果发生器升级',
        'Resource Management Upgrades':'资源管理升级',
        'Signature Detection Array Upgrades':'信号探测阵列升级',
        'System Effect Generator Upgrades':'星系效果发生器升级',

        # 建筑相关SKIN
        'Quantum Cores':'量子核心',

        # 反应公式
        'Reaction Formulas':'反应公式',
        'Simple Reactions':'简单反应','Complex Reactions':'复杂反应',
        'Simple Biochemical Reactions':'简单生化反应','Complex Biochemical Reactions':'复杂生化反应',
        'Polymer Reactions':'聚合物反应',
        'Biochemical Reaction Formulas':'生化反应公式',
        'Composite Reaction Formulas':'复合反应公式',
        'Polymer Reaction Formulas':'聚合物反应公式',
        'Molecular-Forged Reaction Formulas':'分子锻造反应公式',
        'Erratic Ore Formulas':'不稳定矿石公式',

        # 结构装备
        'Structure Equipment':'建筑装备',
        'Structure Weapons':'建筑武器','Service Modules':'服务模块',
        'Fighter Upgrades':'铁骑升级',
        'Structure Service Modules':'建筑服务模块',
        'Citadel Service Modules':'堡垒服务模块',
        'Resource Processing Service Modules':'资源处理服务模块',
        'Engineering Service Modules':'工程服务模块',
        'Structure Missile Launchers':'建筑导弹发射器',
        'Ship Tractor Beams':'舰船牵引光束',

        # SKIN
        'Ship SKINs':'舰船涂装',
        'Special Edition SKINs':'特别版涂装',
        'Multiple Hull SKINs':'多船体涂装',
        'Capsules':'胶囊',
        'Capsules':'胶囊','Special Edition Capsules':'特别版胶囊',
        'Special Edition Ships':'特别版舰船',
        'Special Edition Industrial Ships':'特别版工业舰',
        'Special Edition Shuttles':'特别版穿梭机',
        'Special Edition Frigates':'特别版护卫舰',
        'Special Edition Battleships':'特别版战列舰',
        'Special Edition Heavy Assault Cruisers':'特别版重突',
        'Special Edition Assault Frigates':'特别版突击护卫舰',
        'Special Edition Logistics':'特别版后勤舰',
        'Special Edition Battlecruisers':'特别版战列巡洋舰',
        'Special Edition Cruisers':'特别版巡洋舰',
        'Special Edition Recon Ships':'特别版侦察舰',
        'Special Edition Covert Ops':'特别版隐形特勤舰',
        'Special Edition Interceptors':'特别版拦截舰',
        'Special Edition Heavy Interdiction Cruisers':'特别版重型拦截巡洋舰',
        'Special Edition Destroyers':'特别版驱逐舰',
        'Special Edition Corvettes':'特别版护卫舰/新手船',
        'Special Edition Electronic Attack Frigates':'特别版电子攻击护卫舰',
        'Special Edition Capsules':'特别版胶囊',
        'Special Edition Haulers':'特别版运载舰',
        'Special Edition Frigates':'特别版护卫舰',
        'Standard Corvettes':'标准新手船',
        'Faction Corvettes':'势力新手船',
        'Special Shuttles':'特别穿梭机',
        'Expedition Command Ships':'远征指挥舰',

        # 外观
        'Apparel':'外观',
        "Men's Clothing":"男装","Women's Clothing":"女装",
        'Accessories':'配饰','Tops':'上衣','Outerwear':'外套',
        'Footwear':'鞋','Bottoms':'下装',
        'Eyewear':'眼镜','Tattoos':'纹身','Augmentations':'增强体',
        'Headwear':'头饰','Masks':'面具','Portrait Backgrounds':'肖像背景',
        'Bottoms, extras':'下装(附加)',

        # 特殊物品
        'Special Edition Assets':'特别版资产',
        'Special Edition Tournament Cards':'特别版锦标赛卡',
        'Alliance Tournament Cards':'联盟锦标赛卡',
        'New Eden Open Cards':'新伊甸公开赛卡',
        'NEO YC 114 Team Cards':'NEO YC114战队卡',
        'Alliance Tournament All Star Teams':'联盟锦标赛全明星战队',
        'Special Edition Commodities':'特别版商品',
        'Special Blueprint Crates':'特殊蓝图箱',
        'Special Cosmetic Crates':'特殊外观箱',
        'Special Trade Items':'特殊贸易品',
        'Event Assets':'活动资产',
        'Crimson Harvest Assets':'猩红收割活动资产',
        'Capsuleer Day Assets':'飞行员日活动资产',
        'Empire Days Assets':'帝国日活动资产',
        "Guardian's Gala Assets":"守护者节日资产",
        'Interstellar Convergence Assets':'星际聚合资产',
        'Winter Nexus Assets':'冬季枢纽资产',
        'Gallente Election Assets':'盖伦特选举资产',
        'Trinkets and misc.':'小饰品和杂项',
        'Special Edition Apparel':'特别版外观',
        'Special Edition Festival Assets':'特别版节日资产',
        'Special Edition Implants':'特别版植入体',

        # 飞行员服务
        "Pilot's Services":"飞行员服务",
        'PLEX':'PLEX','Skill Trading':'技能交易',
        'HyperNet Relay':'超网中继器',
        'Expert Systems':'专家系统',

        # 行星设施
        'Planetary Infrastructure':'行星设施',
        'Command Centers':'指挥中心','Orbital Infrastructure':'轨道设施',
        'Orbital Skyhooks':'天钩',

        # 贸易货物
        'Industrial Goods':'工业货物','Radioactive Goods':'放射性货物',
        'Passengers':'乘客','Narcotics':'麻醉品','Consumer Products':'消费品',
        'Criminal Evidence':'犯罪证据',
        "Overseer's Personal Effects":"监督者个人物品",
        'Criminal DNA Patterns':'犯罪DNA样本',
        'Pirate Insurgency Contraband':'海盗叛乱违禁品',
        'Insignias':'徽章',
        'Amarr Navy':'艾玛海军','Ammatar Navy':'艾玛塔海军',
        'Caldari Navy':'加达里海军','Gallente Navy':'盖伦特海军',
        'Minmatar Fleet':'米玛塔尔舰队','Khanid Navy':'卡尼迪海军',
        'Individuals':'个人',
        'Nexus Chips':'连接芯片','Criminal Dog Tags':'犯罪狗牌',
        'Angels':'天使','Blood Raiders':'血袭者','Dark Blood':'暗血',
        'Domination':'统治','Dread Guristas':'恐惧古斯塔斯',
        'Guristas':'古斯塔斯','Sansha':'萨沙',
        'Serpentis':'天蛇','Shadow Serpentis':'暗影天蛇',
        'True Sansha':'真萨沙','Commanders':'指挥官',
        'Political Paraphernalia':'政治物品',
        'Starbase Charters':'空间站租约',
        'Sleeper Components':'冬眠者组件',
        'Aurum Tokens':'奥拉令牌',
        'Security Tags':'安全标签',
        'Covert Research Tools':'隐蔽研究工具',
        'Bounty Encrypted Bonds':'赏金加密债券',
        'Unknown Components':'未知组件',
        'Strong Boxes':'保险箱',
        'Filaments':'纤维',
        'Exotic Filaments':'异种纤维','Dark Filaments':'暗纤维',
        'Firestorm Filaments':'火风暴纤维','Gamma Filaments':'伽马纤维',
        'Electrical Filaments':'电纤维','Jump Filaments':'跳跃纤维',
        'Proving Ground Filaments':'试炼场纤维',
        'Triglavian Space Outbound':'特里格拉夫空间出向',
        'Triglavian Space Inbound':'特里格拉夫空间入向',
        'Triglavian Data':'特里格拉夫数据',
        'Rogue Drone Data':'自由无人机数据',
        'AEGIS Databases':'AEGIS数据库',
        'Acceleration Gate Keys':'加速门钥匙',
        'Limited Rarities':'限量珍品',
        'Mordunium':'莫杜尼姆','Ytirium':'提里姆',
        'Eifyrium':'艾弗里姆','Ducinium':'杜西尼姆',
        'Kylixium':'基利克斯','Nocxite':'诺克斯',
        'Ueganite':'尤加尼特','Hezorime':'赫佐林',
        'Griemeer':'格里梅尔','Tyranite':'泰拉尼特',
        'Prismaticite':'棱彩矿',

        # 变异质体
        'Mutaplasmids':'变异质体',
        'Armor Mutaplasmids':'装甲变异质体',
        'Shield Mutaplasmids':'护盾变异质体',
        'Astronautic Mutaplasmids':'宇航变异质体',
        'Engineering Mutaplasmids':'工程变异质体',
        'Warp Disruption Mutaplasmids':'跃迁干扰变异质体',
        'Stasis Webifier Mutaplasmids':'停滞缠绕变异质体',
        'Weapon Upgrade Mutaplasmids':'武器升级变异质体',
        'Damage Control Mutaplasmids':'损伤控制变异质体',
        'Assault Damage Control Mutaplasmids':'突击损伤控制变异质体',
        'Smartbomb Mutaplasmids':'智能炸弹变异质体',
        'Drone Mutaplasmids':'无人机变异质体',
        'Harvesting Mutaplasmids':'采集变异质体',
        'Siege Module Mutaplasmids':' siege模块变异质体',
        'Vorton Tuning System Mutaplasmids':'涡旋调谐系统变异质体',
        'Entropic Radiation Sink Mutaplasmids':'熵辐射散热槽变异质体',
        'Ballistic Control System Mutaplasmids':'弹道控制系统变异质体',
        'Gyrostabilizer Mutaplasmids':'回转稳定器变异质体',
        'Heat Sink Mutaplasmids':'散热槽变异质体',
        'Magnetic Field Stabilizer Mutaplasmids':'磁场稳定器变异质体',
        'Small Armor Mutaplasmids':'小型装甲变异质体',
        'Medium Armor Mutaplasmids':'中型装甲变异质体',
        'Large Armor Mutaplasmids':'大型装甲变异质体',
        'Capital Armor Mutaplasmids':'旗舰装甲变异质体',
        'Small Shield Mutaplasmids':'小型护盾变异质体',
        'Medium Shield Mutaplasmids':'中型护盾变异质体',
        'Large Shield Mutaplasmids':'大型护盾变异质体',
        'X-Large Shield Mutaplasmids':'特大型护盾变异质体',
        'Capital Shield Mutaplasmids':'旗舰护盾变异质体',
        'Small Astronautic Mutaplasmids':'小型宇航变异质体',
        'Medium Astronautic Mutaplasmids':'中型宇航变异质体',
        'Large Astronautic Mutaplasmids':'大型宇航变异质体',
        'Capital Astronautic Mutaplasmids':'旗舰宇航变异质体',
        'Small Engineering Mutaplasmids':'小型工程变异质体',
        'Medium Engineering Mutaplasmids':'中型工程变异质体',
        'Large Engineering Mutaplasmids':'大型工程变异质体',
        'Capital Engineering Mutaplasmids':'旗舰工程变异质体',
        'Light Drone Mutaplasmids':'轻型无人机变异质体',
        'Medium Drone Mutaplasmids':'中型无人机变异质体',
        'Heavy Drone Mutaplasmids':'重型无人机变异质体',
        'Sentry Drone Mutaplasmids':'岗哨无人机变异质体',
        'Drone Module Mutaplasmids':'无人机模块变异质体',
        'Harvesting Drone Mutaplasmids':'采集无人机变异质体',
        'Small Smartbomb Mutaplasmids':'小型智能炸弹变异质体',
        'Medium Smartbomb Mutaplasmids':'中型智能炸弹变异质体',
        'Large Smartbomb Mutaplasmids':'大型智能炸弹变异质体',
        'Laser Miners':'激光采矿器',
        'Strip Miners':'提炼采矿器',
        'Ice Mining Lasers':'冰矿采矿激光器',
        'Ice Harvesters':'冰矿采集器',
        'Gas Cloud Scoops':'气体收集器',
        'Gas Cloud Harvesters':'气体采集器',

        # 重突相关
        'Heavy Assault Launchers':'重型突击发射器',
        'Rapid Light Missile Launchers':'快速轻型导弹发射器',
        'Rapid Heavy Missile Launchers':'快速重型导弹发射器',
        'Rapid Torpedo Launchers':'快速鱼雷发射器',
        'Defender Launchers':'防御导弹发射器',
        'Rocket Launchers':'火箭发射器',
        'Light Missile Launchers':'轻型导弹发射器',
        'Heavy Launchers':'重型发射器',
        'Cruise Launchers':'巡航发射器',
        'Torpedo Launchers':'鱼雷发射器',
        'XL Launchers':'超大型发射器',

        # 弹药尺寸
        'Standard XL Torpedoes':'标准超大型鱼雷',
        'Faction XL Torpedoes':'势力超大型鱼雷',
        'Standard XL Cruise Missiles':'标准超大型巡航导弹',
        'Faction XL Cruise Missiles':'势力超大型巡航导弹',
        'Standard Light Missiles':'标准轻型导弹',
        'Standard Heavy Missiles':'标准重型导弹',
        'Standard Cruise Missiles':'标准巡航导弹',
        'Standard Torpedoes':'标准鱼雷',
        'Standard Rockets':'标准火箭',
        'Standard Heavy Assault Missiles':'标准重型突击导弹',
        'Faction Light Missiles':'势力轻型导弹',
        'Faction Heavy Missiles':'势力重型导弹',
        'Faction Cruise Missiles':'势力巡航导弹',
        'Faction Torpedoes':'势力鱼雷',
        'Faction Rockets':'势力火箭',
        'Faction Heavy Assault Missiles':'势力重型突击导弹',

        # 其他大小规格
        '100mm Armor Plate':'100mm装甲板','200mm Armor Plate':'200mm装甲板',
        '400mm Armor Plate':'400mm装甲板','800mm Armor Plate':'800mm装甲板',
        '1600mm Armor Plate':'1600mm装甲板','25000mm Armor Plate':'25000mm装甲板',
        'Hull Upgrade Modules':'船体升级模块',
        'Reinforced Bulkheads':'加固舱壁','Nanofiber Internal Structures':'纳米纤维内部结构',
        'Expanded Cargoholds':'扩展货柜舱',
        'Inertial Stabilizers':'惯性稳定器','Overdrives':'超载推进系统',
        'Warp Core Stabilizers':'跃迁核心稳定器',
        'Warp Accelerators':'跃迁加速器','Jump Economizers':'跳跃省油器',
        'Interdiction Nullifiers':'拦截抵消器',
        'Hackers':'破解器','Codebreakers':'破译器','Logic Processors':'逻辑处理器',

        # 装甲尺寸对应的抗性涂层/薄膜
        'Thermal Coatings':'热能涂层','Kinetic Coatings':'动能涂层',
        'Explosive Coatings':'爆炸涂层','EM Coatings':'电磁涂层',
        'Multispectrum Coatings':'多谱式涂层',
        'Thermal Armor Hardeners':'热能装甲增强器',
        'Kinetic Armor Hardeners':'动能装甲增强器',
        'Explosive Armor Hardeners':'爆炸装甲增强器',
        'EM Armor Hardeners':'电磁装甲增强器',
        'Multispectrum Armor Hardeners':'多谱式装甲增强器',
        'Scriptable Armor Hardeners':'可编程装甲增强器',
        'Thermal Shield Hardeners':'热能护盾增强器',
        'Kinetic Shield Hardeners':'动能护盾增强器',
        'Explosive Shield Hardeners':'爆炸护盾增强器',
        'EM Shield Hardeners':'电磁护盾增强器',
        'Multispectrum Shield Hardeners':'多谱式护盾增强器',
        'Scriptable Shield Hardeners':'可编程护盾增强器',
        'Thermal Shield Amplifiers':'热能护盾放大器',
        'Kinetic Shield Amplifiers':'动能护盾放大器',
        'Explosive Shield Amplifiers':'爆炸护盾放大器',
        'EM Shield Amplifiers':'电磁护盾放大器',
        'Thermal Energized Membranes':'热能通电薄膜',
        'Kinetic Energized Membranes':'动能通电薄膜',
        'Explosive Energized Membranes':'爆炸通电薄膜',
        'EM Energized Membranes':'电磁通电薄膜',
        'Multispectrum Energized Membranes':'多谱式通电薄膜',

        # 护盾扩展
        'Small Shield Extender':'小型护盾扩展器',
        'Small Shield Extenders':'小型护盾扩展器',

        # 改装件尺寸前缀
        'Small Armor Rigs':'小型装甲改装件','Medium Armor Rigs':'中型装甲改装件',
        'Large Armor Rigs':'大型装甲改装件','Capital Armor Rigs':'旗舰装甲改装件',
        'Small Astronautic Rigs':'小型宇航改装件','Medium Astronautic Rigs':'中型宇航改装件',
        'Large Astronautic Rigs':'大型宇航改装件','Capital Astronautic Rigs':'旗舰宇航改装件',
        'Small Drone Rigs':'小型无人机改装件','Medium Drone Rigs':'中型无人机改装件',
        'Large Drone Rigs':'大型无人机改装件','Capital Drone Rigs':'旗舰无人机改装件',
        'Small Electronics Superiority Rigs':'小型电子优势改装件',
        'Medium Electronics Superiority Rigs':'中型电子优势改装件',
        'Large Electronics Superiority Rigs':'大型电子优势改装件',
        'Capital Electronics Superiority Rigs':'旗舰电子优势改装件',
        'Small Engineering Rigs':'小型工程改装件','Medium Engineering Rigs':'中型工程改装件',
        'Large Engineering Rigs':'大型工程改装件','Capital Engineering Rigs':'旗舰工程改装件',
        'Small Energy Weapon Rigs':'小型能量武器改装件',
        'Medium Energy Weapon Rigs':'中型能量武器改装件',
        'Large Energy Weapon Rigs':'大型能量武器改装件',
        'Capital Energy Weapon Rigs':'旗舰能量武器改装件',
        'Small Hybrid Weapon Rigs':'小型混合武器改装件',
        'Medium Hybrid Weapon Rigs':'中型混合武器改装件',
        'Large Hybrid Weapon Rigs':'大型混合武器改装件',
        'Capital Hybrid Weapon Rigs':'旗舰混合武器改装件',
        'Small Missile Launcher Rigs':'小型导弹发射器改装件',
        'Medium Missile Launcher Rigs':'中型导弹发射器改装件',
        'Large Missile Launcher Rigs':'大型导弹发射器改装件',
        'Capital Missile Launcher Rigs':'旗舰导弹发射器改装件',
        'Small Projectile Weapon Rigs':'小型射弹武器改装件',
        'Medium Projectile Weapon Rigs':'中型射弹武器改装件',
        'Large Projectile Weapon Rigs':'大型射弹武器改装件',
        'Capital Projectile Weapon Rigs':'旗舰射弹武器改装件',
        'Small Shield Rigs':'小型护盾改装件','Medium Shield Rigs':'中型护盾改装件',
        'Large Shield Rigs':'大型护盾改装件','Capital Shield Rigs':'旗舰护盾改装件',
        'Small Resource Processing Rigs':'小型资源处理改装件',
        'Medium Resource Processing Rigs':'中型资源处理改装件',
        'Large Resource Processing Rigs':'大型资源处理改装件',
        'Capital Resource Processing Rigs':'旗舰资源处理改装件',
        'Small Scanning Rigs':'小型扫描改装件','Medium Scanning Rigs':'中型扫描改装件',
        'Large Scanning Rigs':'大型扫描改装件','Capital Scanning Rigs':'旗舰扫描改装件',
        'Small Targeting Rigs':'小型锁定改装件','Medium Targeting Rigs':'中型锁定改装件',
        'Large Targeting Rigs':'大型锁定改装件','Capital Targeting Rigs':'旗舰锁定改装件',

        # 矿晶
        'Simple Asteroid Mining Crystals':'简单小行星采矿晶体',
        'Coherent Asteroid Mining Crystals':'凝聚小行星采矿晶体',
        'Variegated Asteroid Mining Crystals':'杂色小行星采矿晶体',
        'Complex Asteroid Mining Crystals':'复杂小行星采矿晶体',
        'Mercoxit Asteroid Mining Crystals':'水硼砂小行星采矿晶体',
        'Abyssal Asteroid Mining Crystals':'深渊小行星采矿晶体',
        'Phased Asteroid Mining Crystals':'相位小行星采矿晶体',
        'Common Moon Mining Crystals':'普通月矿采矿晶体',
        'Ubiquitous Moon Mining Crystals':'常见月矿采矿晶体',
        'Uncommon Moon Mining Crystals':'稀有月矿采矿晶体',
        'Rare Moon Mining Crystals':'罕见月矿采矿晶体',
        'Exceptional Moon Mining Crystals':'非凡月矿采矿晶体',

        # 结构 (第二组)
        'Structure Anticapital Launcher':'建筑反旗舰发射器',
        'Structure Antisubcapital Launcher':'建筑反次级旗舰发射器',
        'Guided Bomb Launchers':'制导炸弹发射器',
        'Ballistic Control Systems':'弹道控制系统',
        'Missile Guidance Enhancers':'导弹制导增强器',

        # 势力材料
        'Angel Cartel':'天使企业','Blood Raiders':'血袭者',
        'Guristas':'古斯塔斯','Serpentis':'天蛇集团',
        'Sleeper':'冬眠者','Talocan':'塔洛坎',
        'Yan Jung':'延钟','Takmahl':'塔克马',
        'Rogue Drones':'自由无人机',
        'Amarr Empire':'艾玛帝国','Minmatar Republic':'米玛塔尔共和国',
        'Caldari State':'加达里合众国','Gallente Federation':'盖伦特联邦',
        "Mordu's Legion":"莫德团",
        "Sansha's Nation":"萨沙国度",
        'Sisters of EVE':'EVE姐妹会',

        # 舰船 (第二层级 - 制造蓝图的子分类)
        'Amarr Subsystems':'艾玛子系统',
        'Standard Launchers':'标准发射器',

        # 弹药 - 自动锁定
        'Standard Auto-Targeting':'标准自动锁定',
        'Faction Auto-Targeting':'势力自动锁定',

        # 弹药 - 防御
        'Defender Missiles':'防御导弹',
        'Standard Auto-Targeting Missiles':'标准自动锁定导弹',
        'Defender Missile I':'防御导弹I',

        # 外域纤维入口
        'Hull & Armor':'船体和装甲',
    }

    def _translate_group(self, name: str) -> str:
        if name in self._zh_groups:
            return self._zh_groups[name]
        # 规则翻译兜底
        rules = [
            ('Abyssal ', '深渊'), ('Advanced Capital ', '高级旗舰'),
            ('Advanced ', '高级'), ('Standard ', '标准'),
            ('Faction ', '势力'), ('Special Edition ', '特别版'),
            ('Special ', '特别'), ('Capital ', '旗舰'),
            ('Elite ', '精英'),
            ('Implants', '植入体'), ('Blueprints', '蓝图'),
            ('Reactions', '反应'), ('Formulas', '公式'),
            ('Modules', '装备'), ('Upgrades', '升级'),
            ('Equipment', '装备'), ('Subsystems', '子系统'),
            ('Components', '组件'), ('Materials', '材料'),
            ('Outpost ', '哨站'), ('Mobile ', '移动'),
            ('Starbase ', '空间站'), ('Structure ', '建筑'),
            ('Deployable ', '可部署'),
            ('Batteries', '炮台'), ('Arrays', '阵列'),
            ('Platforms', '平台'),
            ('Burst ', '脉冲'), ('Bursts', '脉冲'),
            ('Charges', '弹药'), ('Crystals', '晶体'),
            ('Launchers', '发射器'), ('Turrets', '炮台'),
            ('Hardwiring', '硬接线'), ('Enhancers', '增强器'),
            ('Skill ', '技能'), ('Repairers', '维修器'),
            ('Booster', '增强器/回旋'), ('Boosters', '增强器'),
            ('Amplifiers', '放大器'),
            ('Backup Arrays', '备份阵列'),
            ('Disruptors', '干扰器'),
            ('Neutralizers', '中和器'),
            ('Nositers', '掠能器'),
            ('Nosferatu', '掠能器'),
            ('Transmitters', '传输装置'),
            ('Structures', '建筑'),
            ('Ships', '舰船'),
            ('Weapon', '武器'),
            ('Scanner', '扫描'),
            ('Scanning', '扫描'),
            ('Rigs', '改装件'),
            ('Resistance', '抗性'),
            ('Membranes', '薄膜'),
            ('Coatings', '涂层'),
            ('Plates', '板'),
            ('Hardeners', '增强器'),
            ('Extenders', '扩展器'),
            ('Rechargers', '回充器'),
            ('Relays', '继电器'),
            ('Coils', '线圈'),
            ('Batteries', '电池'),
            ('Systems', '系统'),
            ('Controls', '控制'),
            ('Units', '单元'),
            ('Generators', '发生器'),
            ('Filaments', '纤维'),
            ('Probes', '探针'),
            ('Drones', '无人机'),
            ('Fighters', '铁骑舰载机'),
            ('Missiles', '导弹'),
            ('Torpedoes', '鱼雷'),
            ('Rockets', '火箭'),
            ('Bombs', '炸弹'),
            ('Scripts', '脚本'),
            ('Crystals', '晶体'),
            ('Ammo', '弹药'),
            ('Cap Booster', '电容注电器'),
            ('Nanite Repair Paste', '纳米修复贴'),
            ('Implants', '植入体'),
            ('Boosters', '增强器'),
        ]
        for eng, chn in rules:
            if name.startswith(eng):
                return chn + name[len(eng):]
            if name.endswith(eng):
                return name[:-len(eng)] + chn
        return name

    def get_market_groups(self) -> list:
        conn = self._connect()
        rows = conn.execute(
            "SELECT marketGroupID, parentGroupID, marketGroupName, hasTypes "
            "FROM invMarketGroups ORDER BY marketGroupID"
        ).fetchall()
        conn.close()
        result = []
        for r in rows:
            d = dict(r)
            en = d['marketGroupName']
            d['marketGroupName'] = self._translate_group(en)
            result.append(d)
        return result

    def get_items_by_market_group(self, group_id: int) -> list:
        """获取指定分类下所有物品（递归包含子分类）"""
        conn = self._connect()
        # 递归获取所有子分类ID
        all_ids = self._get_descendant_group_ids(conn, group_id)
        placeholders = ','.join('?' * len(all_ids))
        rows = conn.execute(
            f"SELECT t.typeID, COALESCE(zh.text, t.typeName) as name, t.typeName as name_en "
            f"FROM invTypes t "
            f"LEFT JOIN trnTranslations zh ON zh.tcID=8 AND zh.keyID=t.typeID AND zh.languageID='zh' "
            f"WHERE t.marketGroupID IN ({placeholders}) AND t.published=1 "
            f"ORDER BY t.typeName LIMIT 500",
            tuple(all_ids)
        ).fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def _get_descendant_group_ids(self, conn, gid: int) -> set:
        """递归获取分类及其所有子分类ID"""
        rows = conn.execute(
            "SELECT marketGroupID FROM invMarketGroups WHERE parentGroupID=?", (gid,)
        ).fetchall()
        ids = {gid}
        for r in rows:
            ids.update(self._get_descendant_group_ids(conn, r['marketGroupID']))
        return ids

    def get_sde_version(self) -> dict:
        conn = self._connect()
        items = conn.execute("SELECT COUNT(*) FROM invTypes WHERE published=1").fetchone()[0]
        bps = conn.execute("SELECT COUNT(*) FROM industryActivityProducts WHERE activityID=1").fetchone()[0]
        mats = conn.execute("SELECT COUNT(*) FROM industryActivityMaterials WHERE activityID=1").fetchone()[0]
        conn.close()
        size_mb = os.path.getsize(self.db_path) / 1024 / 1024
        return {
            'size_mb': round(size_mb, 1),
            'items': items,
            'blueprints': bps,
            'materials': mats,
        }

    def exists(self):
        return os.path.exists(self.db_path)
