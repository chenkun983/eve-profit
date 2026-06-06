/* 工业管理系统前端 */
var _currentWH = null; // 当前查看的分仓库 ID

// ========== 页面渲染 ==========

function showIndustry() {
  hideUserMenu();
  var area = document.getElementById('pageIndustry');
  if (!area) return;
  area.innerHTML = '<div class="loading">加载工业管理系统...</div>';
  loadWarehouseList();
}

function loadWarehouseList() {
  var area = document.getElementById('pageIndustry');
  if (!area) return;
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/warehouses', { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (!d.ok || !d.warehouses) { area.innerHTML = '<div class="no-result">加载失败</div>'; return; }
    var ws = d.warehouses;
    var h = '<div class="industry-page">'+
      '<div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'+
      '<div><h3 style="margin:0">仓库清单 <span style="font-weight:normal;font-size:14px;color:#8b949e">('+ws.length+' 个)</span></h3>'+
      '<div style="font-size:12px;color:#8b949e;margin-top:2px">提示：点击仓库进入管理库存、生产线和物料缺口</div></div>'+
      '<button class="btn-primary" style="padding:6px 14px;font-size:13px" onclick="showCreateWH()">+ 新建</button></div>';
    if (ws.length === 0) {
      h += '<div class="no-result">暂无分仓库，点击"新建"创建一个</div>';
    } else {
      h += '<div style="display:flex;flex-wrap:wrap;gap:8px">';
      for (var i = 0; i < ws.length; i++) {
        var w = ws[i];
        h += '<div class="wh-card" onclick="showWarehouse('+w.id+')">'+
          '<div style="font-weight:bold;font-size:14px;margin-bottom:2px">'+escHtml(w.name)+'</div>'+
          '<div style="font-size:11px;color:#8b949e">'+escHtml(w.character_name||'?')+' @ '+escHtml(w.station_name||'?')+'</div>'+
          '<div style="font-size:11px;color:#3fb950;margin-top:4px">● '+(w.active_lines||0)+' 生产中</div>'+
          '</div>';
      }
      h += '</div>';
    }
    h += '<div style="margin-top:16px;padding:8px 12px;background:#0d1117;border:1px solid #21262d;border-radius:6px;font-size:12px;color:#8b949e">'+
      '💡 <strong>使用提示</strong><br>'+
      '1. 创建分仓库 → 从游戏粘贴仓库内容导入物料<br>'+
      '2. 配置生产线 → 选择产品、设置技能/建筑加成<br>'+
      '3. 查看物料缺口 → 系统自动算各线总需求<br>'+
      '4. 启动生产 → 确认后自动扣除物料、开始倒计时<br>'+
      '5. 倒计时结束 → "收付"下线、记录制造历史</div>'+
      '</div>';
    area.innerHTML = h;
  }).catch(function(){ area.innerHTML = '<div class="no-result">请求失败</div>'; });
}

// ========== 分仓库详情 ==========

function showWarehouse(wid) {
  _currentWH = wid;
  var area = document.getElementById('pageIndustry');
  area.innerHTML = '<div class="loading">加载中...</div>';
  var tk = window.authToken || localStorage.getItem('auth_token');
  Promise.all([
    fetch('/api/industry/warehouses', { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json();}).catch(function(){return {ok:false,warehouses:[]}}),
    fetch('/api/industry/inventory?warehouse_id='+wid, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json();}).catch(function(){return {ok:false,items:[]}}),
    fetch('/api/industry/line-configs?warehouse_id='+wid, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json();}).catch(function(){return {ok:false,configs:[]}}),
    fetch('/api/industry/jobs?warehouse_id='+wid, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json();}).catch(function(){return {ok:false,jobs:[]}}),
    fetch('/api/industry/shortage?warehouse_id='+wid, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json();}).catch(function(){return {ok:false,result:{}}}),
    fetch('/api/industry/warehouse-config?warehouse_id='+wid, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json();}).catch(function(){return {ok:false,config:{}}})
  ]).then(function(results){
    var wd = results[0], invd = results[1], lcd = results[2], jd = results[3], sd = results[4], cfgd = results[5];
    var w = wd.warehouses ? wd.warehouses.filter(function(x){return x.id===wid})[0] : null;
    if (!w) { area.innerHTML = '<div class="no-result">分仓库不存在</div>'; return; }
    var inv = invd.items || [];
    var configs = lcd.configs || [];
    var jobs = jd.jobs || [];
    var shortage = sd.result || {};
    var whConfig = cfgd.config || {};

    var h = '<div class="industry-page">';

    // 顶部：仓库名 + 操作按钮（分散布局）
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;flex-wrap:wrap;gap:4px">'+
      '<div><h3 style="margin:0">'+escHtml(w.name)+'</h3>'+
      '<div style="font-size:12px;color:#8b949e;margin-top:2px">'+escHtml(w.character_name||'-')+' @ '+escHtml(w.station_name||'-')+'</div></div>'+
      '<div style="font-size:12px;display:flex;gap:12px">'+
      '<span style="cursor:pointer;color:#8b949e" onclick="editWarehouse('+wid+')">✏️ 编辑</span>'+
      '<span style="cursor:pointer;color:#8b949e" onclick="loadWarehouseList()">← 返回</span>'+
      '<span style="cursor:pointer;color:#da3633" onclick="deleteWarehouse('+wid+')">🗑 删除</span>'+
      '</div></div>';

    // Tab 切换
    h += '<div class="profit-tabs" style="margin-bottom:12px">'+
      '<button class="profit-tab" onclick="switchWHTab(event,\'inventory\','+wid+')">📦 库存</button>'+
      '<button class="profit-tab active" onclick="switchWHTab(event,\'lines\','+wid+')">🔧 生产线</button>'+
      '<button class="profit-tab" onclick="switchWHTab(event,\'production\','+wid+')">📜 历史</button>'+
      '</div><div id="whTabContent">';

    h += renderLinesTab(wid, configs);
    h += '</div></div>';
    area.innerHTML = h;
    // 加载生产线缺口、填充下拉
    setTimeout(function(){
      populateLineSelects(wid, configs);
      // 绑定变更事件（所有系数输入框）
      ['timeSkill','timeBuild','timeRig','matRig','matBuild','matImplant'].forEach(function(id){
        var el = document.getElementById(id);
        if (el) el.onchange = function(){ recalcAllLines(wid); saveLineCoeffs(wid); };
      });
      loadShortageSummary(wid);
      // 加载数据库保存的系数
      fetch('/api/industry/line-coeffs?warehouse_id='+wid, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
        if (d.ok && d.coeffs) {
          if (d.coeffs.time_skill !== undefined) document.getElementById('timeSkill').value = d.coeffs.time_skill;
          if (d.coeffs.time_build !== undefined) document.getElementById('timeBuild').value = d.coeffs.time_build;
          if (d.coeffs.time_rig !== undefined) document.getElementById('timeRig').value = d.coeffs.time_rig;
          if (d.coeffs.mat_rig !== undefined) document.getElementById('matRig').value = d.coeffs.mat_rig;
          if (d.coeffs.mat_build !== undefined) document.getElementById('matBuild').value = d.coeffs.mat_build;
          if (d.coeffs.mat_implant !== undefined) document.getElementById('matImplant').value = d.coeffs.mat_implant;
        }
        recalcAllLines(wid);
        // 加载运行中的生产线倒计时
        loadRunningCountdowns(wid);
      });
    }, 200);
  });
}

function switchWHTab(ev, tab, wid) {
  var tabs = document.querySelectorAll('#pageIndustry .profit-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.remove('active');
    // 按 tab 名称高亮对应按钮
    if (tabs[i].getAttribute('onclick') && tabs[i].getAttribute('onclick').indexOf("'"+tab+"'") > -1) {
      tabs[i].classList.add('active');
    }
  }
  var tk = window.authToken || localStorage.getItem('auth_token');
  var area = document.getElementById('whTabContent');
  area.innerHTML = '<div class="loading">加载中...</div>';

  if (tab === 'inventory') {
    fetch('/api/industry/inventory?warehouse_id='+wid, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
      area.innerHTML = renderInventoryTab(wid, d.items||[]);
    });
  } else if (tab === 'lines') {
    fetch('/api/industry/line-configs?warehouse_id='+wid, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
      area.innerHTML = renderLinesTab(wid, d.configs||[]);
      setTimeout(function(){
        populateLineSelects(wid, d.configs||[]);
        // 给系数输入框绑定变更事件
        ['timeSkill','timeBuild','timeRig','matRig','matBuild','matImplant'].forEach(function(id){
          var el = document.getElementById(id);
          if (el) el.onchange = function(){ recalcAllLines(wid); saveLineCoeffs(wid); };
        });
        // 加载保存的系数
        fetch('/api/industry/line-coeffs?warehouse_id='+wid, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(cd){
          if (cd.ok && cd.coeffs) {
            if (cd.coeffs.time_skill !== undefined) document.getElementById('timeSkill').value = cd.coeffs.time_skill;
            if (cd.coeffs.time_build !== undefined) document.getElementById('timeBuild').value = cd.coeffs.time_build;
            if (cd.coeffs.time_rig !== undefined) document.getElementById('timeRig').value = cd.coeffs.time_rig;
            if (cd.coeffs.time_implant !== undefined) document.getElementById('timeImplant').value = cd.coeffs.time_implant;
            if (cd.coeffs.mat_rig !== undefined) document.getElementById('matRig').value = cd.coeffs.mat_rig;
            if (cd.coeffs.mat_build !== undefined) document.getElementById('matBuild').value = cd.coeffs.mat_build;
            if (cd.coeffs.mat_implant !== undefined) document.getElementById('matImplant').value = cd.coeffs.mat_implant;
          }
          recalcAllLines(wid);
          loadShortageSummary(wid);
          // 加载运行中的生产线倒计时
          loadRunningCountdowns(wid);
        });
      }, 200);
    });
  } else if (tab === 'production') {
    fetch('/api/industry/jobs?warehouse_id='+wid, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
      area.innerHTML = renderProductionTab(wid, d.jobs||[]);
    });
  }
}

function renderConfigTab(wid, cfg) {
  var h = '<h4 style="margin-bottom:8px">仓库加成配置</h4>'+
    '<div style="font-size:12px;color:#8b949e;margin-bottom:10px">所有生产线共用同一份加成数据，修改后需点击"保存"生效</div>'+
    '<div style="max-width:500px">'+
    '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px">'+
    '<div><label style="font-size:12px;color:#8b949e">ME 等级</label><br><input id="wcfg_me" type="number" value="'+(cfg.me_level||10)+'" min="0" max="10" style="width:60px;padding:6px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px"></div>'+
    '<div><label style="font-size:12px;color:#8b949e">TE 等级</label><br><input id="wcfg_te" type="number" value="'+(cfg.te_level||20)+'" min="0" max="20" style="width:60px;padding:6px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px"></div>'+
    '<div><label style="font-size:12px;color:#8b949e">技能系数</label><br><input id="wcfg_skill" type="number" value="'+(cfg.skill_bonus||0.85)+'" step="0.01" min="0" max="1" style="width:60px;padding:6px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px"></div>'+
    '<div><label style="font-size:12px;color:#8b949e">建筑加成</label><br><input id="wcfg_bd" type="number" value="'+(cfg.building_bonus||1.0)+'" step="0.01" min="0" max="2" style="width:60px;padding:6px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px"></div>'+
    '<div><label style="font-size:12px;color:#8b949e">脑插加成</label><br><input id="wcfg_im" type="number" value="'+(cfg.implant_bonus||1.0)+'" step="0.01" min="0" max="2" style="width:60px;padding:6px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px"></div>'+
    '</div>'+
    '<span style="font-size:12px;color:#58a6ff;cursor:pointer" onclick="saveWarehouseConfig('+wid+')">💾 保存加成</span>'+
    '</div>';
  return h;
}

// ========== 库存管理 Tab ==========

function renderInventoryTab(wid, inv) {
  var h = '<h4 style="margin-bottom:8px">库存</h4>'+
    '<div style="margin-bottom:10px">'+
    '<textarea id="invPaste_'+wid+'" style="width:100%;height:120px;padding:8px;border:1px solid #30363d;border-radius:6px;background:#161b22;color:#c9d1d9;font-size:13px;resize:vertical" placeholder="从游戏复制仓库内容粘贴到这里&#10;格式: 物品名 数量&#10;例如:&#10;三钛合金 50000&#10;类晶体胶矿 3000"></textarea>'+
    '<div style="margin-top:6px;display:flex;gap:8px;align-items:center">'+
    '<button class="btn-primary" style="padding:6px 14px;font-size:13px" onclick="doImport('+wid+')">添加进仓库</button>'+
    '<label style="font-size:12px;color:#8b949e"><input type="checkbox" id="invOverride_'+wid+'"> 覆盖（清空后再导入）</label>'+
    '<span style="font-size:12px;color:#30363d">|</span>'+
    '<span style="font-size:12px;color:#8b949e;cursor:pointer" onclick="showManualAdd('+wid+')">✏️ 手动</span>'+
    '<span style="font-size:12px;color:#da3633;cursor:pointer" onclick="showClearInventory('+wid+')">🗑 清空</span>'+
    '</div></div>'+
    '<div style="margin-bottom:6px"><input id="invSearch_'+wid+'" type="text" placeholder="搜索物品..." style="width:200px;padding:6px 10px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px" oninput="filterInventory('+wid+')"></div>';
  if (inv.length === 0) {
    h += '<div class="no-result">仓库为空</div>';
    return h;
  }
  h += '<div style="overflow-x:auto"><table class="ranking-table" style="font-size:13px" id="invTable_'+wid+'"><thead><tr><th>物品</th><th class="text-right">数量</th><th class="text-center">编辑</th></tr></thead><tbody>';
  for (var i = 0; i < inv.length; i++) {
    h += '<tr class="inv-row" data-name="'+escHtml((inv[i].name_cn||inv[i].name_en||'') ).toLowerCase()+'"><td>'+(inv[i].name_cn||inv[i].name_en||'#'+inv[i].type_id)+'</td>'+
      '<td class="text-right">'+inv[i].quantity.toLocaleString()+'</td>'+
      '<td class="text-center"><span style="font-size:12px;color:#8b949e;cursor:pointer" onclick="editInventoryItem('+wid+','+inv[i].type_id+')">修改</span></td></tr>';
  }
  h += '</tbody></table></div>';
  return h;
}

function filterInventory(wid) {
  var q = (document.getElementById('invSearch_'+wid).value || '').toLowerCase();
  var rows = document.querySelectorAll('#invTable_'+wid+' .inv-row');
  for (var i = 0; i < rows.length; i++) {
    rows[i].style.display = rows[i].getAttribute('data-name').indexOf(q) > -1 ? '' : 'none';
  }
}

function doImport(wid) {
  var text = document.getElementById('invPaste_'+wid).value.trim();
  if (!text) { alert('请先粘贴仓库内容'); return; }
  // 先解析文本看看有没有有效物料
  var tk = window.authToken || localStorage.getItem('auth_token');
  var btn = event.target; btn.disabled = true; btn.textContent = '解析中...';
  fetch('/api/industry/import?warehouse_id='+wid+'&mode=append', { method: 'POST', headers: {'Authorization': 'Bearer '+tk, 'Content-Type': 'application/json'}, body: JSON.stringify({text: text}) }).then(function(r){return r.json()}).then(function(d){
    btn.disabled = false; btn.textContent = '添加进仓库';
    if (d.imported === 0 && d.parsed > 0) {
      alert('未识别到有效的制造原料。过滤了 '+(d.skipped?d.skipped.length:0)+' 项非原料物品');
      btn.disabled = false; btn.textContent = '添加进仓库';
      return;
    }
    if (mode === 'override' && !confirm('确认清空当前仓库所有库存后再导入？')) { btn.disabled = false; btn.textContent = '添加进仓库'; return; }
    // 正式导入
    btn.disabled = true; btn.textContent = '导入中...';
    fetch('/api/industry/import?warehouse_id='+wid+'&mode='+mode, { method: 'POST', headers: {'Authorization': 'Bearer '+tk, 'Content-Type': 'application/json'}, body: JSON.stringify({text: text}) }).then(function(r2){return r2.json()}).then(function(d2){
      btn.disabled = false;
      var msg = d2.message || '';
      if (d2.skipped && d2.skipped.length) msg += '（已过滤非原料 '+d2.skipped.length+' 项）';
      alert(msg);
      if (d2.ok) showWarehouse(wid);  // 刷新仓库页面
    });
  }).catch(function(){ btn.disabled = false; btn.textContent = '添加进仓库'; });
}

// ========== 生产线 Tab（含缺口统计）==========

function renderLinesTab(wid, configs) {
  var h = '<h4 style="margin-bottom:8px">生产线</h4>'+
    '<div style="margin-bottom:8px;font-size:12px;color:#8b949e">配置产品与售价，自动计算成本与利润</div>'+
    '<div style="margin-bottom:8px;font-size:12px;color:#8b949e;display:flex;gap:8px;flex-wrap:wrap">'+
    '技能减时: <input id="timeSkill" type="number" value="32" min="-10" max="100" step="1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px"> %'+
    ' 建筑减时: <input id="timeBuild" type="number" value="30" min="-10" max="100" step="1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px"> %'+
    ' 插件减时: <input id="timeRig" type="number" value="30" min="-10" max="100" step="1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px"> %'+
    ' 脑插减时: <input id="timeImplant" type="number" value="0" min="-10" max="100" step="1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px"> %'+
    '</div>'+
    '<div style="margin-bottom:8px;font-size:12px;color:#8b949e;display:flex;gap:8px;flex-wrap:wrap">'+
    ' 插件减材: <input id="matRig" type="number" value="3.8" min="0" max="10" step="0.1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px" onchange="recalcAllLines('+wid+')"> %'+
    ' 建筑减材: <input id="matBuild" type="number" value="0" min="0" max="5" step="0.1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px" onchange="recalcAllLines('+wid+')"> %'+
    ' 脑插减材: <input id="matImplant" type="number" value="0" min="0" max="5" step="0.1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px" onchange="recalcAllLines('+wid+')"> %'+
    ' 星系成本: <input id="lineSci" type="number" value="3" min="0" max="30" step="0.1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px"> %'+
    ' 设施税: <input id="lineTax" type="number" value="1" min="0" max="10" step="0.1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px"> %'+
    ' ME: <input id="lineMe" type="number" value="10" min="0" max="10" step="1" style="width:40px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px">'+
    ' TE: <input id="lineTe" type="number" value="20" min="0" max="20" step="1" style="width:40px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px">'+
    ' 技能等级: <input id="lineSkillLv" type="number" value="5" min="0" max="5" step="1" style="width:35px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px">'+
    ' <span style="font-size:12px;color:#58a6ff;cursor:pointer" onclick="saveLineCoeffs('+wid+');alert(\'参数已保存\')">💾 保存参数</span>'+
    '</div>'+
    '<div style="margin-bottom:8px;font-size:12px;color:#8b949e">数量: <input id="lineCountInput" type="number" value="'+configs.length+'" min="1" max="20" style="width:50px;padding:4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px">'+
    ' <span style="cursor:pointer;color:#8b949e" onclick="setLineCount('+wid+')">更新</span></div>'+
    '<div id="linesContainer">';
  for (var i = 0; i < configs.length; i++) {
    var c = configs[i];
    var hasProduct = c.product_type_id && c.product_type_id > 0;
    var pm = c.price_mode || 'sell';
    var pd = c.price_discount || 1.0;
    var cp = c.custom_price || 0;
    h += '<div class="line-card" id="lineCard_'+i+'" style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:8px;margin-bottom:6px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:6px">'+
      '<span style="font-weight:bold;font-size:12px">线 #'+(i+1)+'</span>'+
      '<span style="font-size:12px">产品: <select id="lpSel_'+(i+1)+'" style="padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#161b22;color:#c9d1d9;font-size:12px" onchange="onLineProductChange('+wid+','+(i+1)+')">'+
      '<option value="0">— 未选择 —</option></select></span>'+
      '<span style="font-size:12px">数量: <input id="lpQty_'+(i+1)+'" type="number" value="1" min="1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#161b22;color:#c9d1d9;font-size:12px" onchange="recalcLine('+wid+','+(i+1)+')"></span>'+
      '<span style="font-size:12px">售价: <select id="lpPrice_'+(i+1)+'" style="padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#161b22;color:#c9d1d9;font-size:12px" onchange="onPriceChange('+wid+','+(i+1)+')">'+
      '<option value="sell" '+(pm==='sell'?'selected':'')+'>最低卖单</option>'+
      '<option value="buy" '+(pm==='buy'?'selected':'')+'>最高收单</option>'+
      '<option value="custom" '+(pm==='custom'?'selected':'')+'>自定义</option></select>'+
      ' <span id="lpDiscountWrap_'+(i+1)+'" style="'+(pm==='custom'?'display:none':'')+'">折扣: <select id="lpDisc_'+(i+1)+'" style="padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#161b22;color:#c9d1d9;font-size:12px" onchange="recalcLine('+wid+','+(i+1)+')">'+
      '<option value="1.0" '+(pd>=1?'selected':'')+'>100%</option>'+
      '<option value="0.95" '+(pd>=0.95&&pd<1?'selected':'')+'>95%</option>'+
      '<option value="0.9" '+(pd>=0.9&&pd<0.95?'selected':'')+'>90%</option>'+
      '<option value="0.85" '+(pd>=0.85&&pd<0.9?'selected':'')+'>85%</option>'+
      '<option value="0.8" '+(pd>=0.8&&pd<0.85?'selected':'')+'>80%</option></select></span>'+
      ' <span id="lpCustomWrap_'+(i+1)+'" style="'+(pm==='custom'?'':'display:none')+'"><input id="lpCust_'+(i+1)+'" type="number" value="'+cp+'" min="0" step="10000" style="width:80px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#161b22;color:#c9d1d9;font-size:12px" placeholder="单价" onchange="recalcLine('+wid+','+(i+1)+')"> ISK</span>'+
      '</div>'+
      '<div id="lineProfit_'+i+'" style="font-size:12px;color:#8b949e">'+(hasProduct?'加载成本...':'— 选择产品后将显示成本与利润')+'</div>'+
      '</div>';
  }
  h += '</div><div id="shortageSummary" style="margin-top:10px"></div></div>';
  return h;
}

function onLineProductChange(wid, lineNum) {
  var sel = document.getElementById('lpSel_'+lineNum);
  var typeId = parseInt(sel.value) || 0;
  var tk = window.authToken || localStorage.getItem('auth_token');
  // 保存当前选择（包括未选择），供缺口统计用
  fetch('/api/industry/line-config/save?warehouse_id='+wid+'&line_number='+lineNum+'&product_type_id='+(typeId||0)+'&price_mode=sell&price_discount=1.0&custom_price=0', { method: 'POST', headers: {'Authorization': 'Bearer '+tk} });
  if (!typeId) { document.getElementById('lineProfit_'+(lineNum-1)).innerHTML = '<span style="color:#8b949e">— 选择产品后将显示成本与利润</span>'; loadShortageSummary(wid); return; }
  recalcLine(wid, lineNum);
  loadShortageSummary(wid);
}

function onPriceChange(wid, lineNum) {
  var pm = document.getElementById('lpPrice_'+lineNum).value;
  document.getElementById('lpDiscountWrap_'+lineNum).style.display = pm === 'custom' ? 'none' : '';
  document.getElementById('lpCustomWrap_'+lineNum).style.display = pm === 'custom' ? '' : 'none';
  recalcLine(wid, lineNum);
}

function recalcLine(wid, lineNum) {
  var sel = document.getElementById('lpSel_'+lineNum);
  var typeId = parseInt(sel.value) || 0;
  if (!typeId) return;
  var qty = parseInt(document.getElementById('lpQty_'+lineNum).value) || 1;
  var idx = lineNum - 1;
  var el = document.getElementById('lineProfit_'+idx);
  if (!el) return;
  el.innerHTML = '<span style="color:#8b949e">计算中...</span>';
  var tk = window.authToken || localStorage.getItem('auth_token');

  var pm = document.getElementById('lpPrice_'+lineNum).value;
  var pd = parseFloat(document.getElementById('lpDisc_'+lineNum).value) || 1.0;
  var cp = parseFloat(document.getElementById('lpCust_'+lineNum).value) || 0;
  var mr = parseFloat(document.getElementById('matRig').value) || 3.8;
  var mb = parseFloat(document.getElementById('matBuild').value) || 0;
  var mi = parseFloat(document.getElementById('matImplant').value) || 0;
  fetch('/api/industry/line-cost?warehouse_id='+wid+'&line_number='+lineNum+'&product_type_id='+typeId+'&quantity='+qty+
    '&price_mode='+pm+'&price_discount='+pd+'&custom_price='+cp+'&mat_rig='+mr+'&mat_build='+mb+'&mat_implant='+mi, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (!d.ok || !d.data) { el.innerHTML = '<span style="color:#da3633">计算失败</span>'; return; }
    var r = d.data;
    console.log('line-cost debug:', r._debug_config);
    var h = '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;margin-top:2px">'+
      '<div><span style="color:#8b949e">蓝图材料总成本</span><br><strong>'+fmt(r.bp_cost)+'</strong>'+
      '<br><span style="color:'+(r.profit_bp>=0?'#3fb950':'#da3633')+';font-size:11px">利润 '+fmt(r.profit_bp)+' ('+r.margin_bp+'%)</span></div>'+
      '<div><span style="color:#8b949e">基础材料总成本</span><br><strong>'+fmt(r.deep_cost)+'</strong>'+
      '<br><span style="color:'+(r.profit_deep>=0?'#3fb950':'#da3633')+';font-size:11px">利润 '+fmt(r.profit_deep)+' ('+r.margin_deep+'%)</span></div>'+
      '<div><span style="color:#8b949e">总售价</span><br><strong style="color:#58a6ff">'+fmt(r.total_revenue)+'</strong></div>'+
      '</div>'+
      '<div style="margin-top:6px"><span style="font-size:12px;color:#58a6ff;cursor:pointer" onclick="checkAndStart('+wid+','+lineNum+','+typeId+','+qty+')">▶ 启动生产</span></div>';
      '<div><span style="color:#8b949e">总售价</span><br><strong style="color:#58a6ff">'+fmt(r.total_revenue)+'</strong></div>'+
      '</div>'+
      '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;margin-top:4px">'+
      '<div><span style="color:#8b949e">按蓝图利润</span><br><strong style="color:'+(r.profit_bp>=0?'#3fb950':'#da3633')+'">'+fmt(r.profit_bp)+' ('+r.margin_bp+'%)</strong></div>'+
      '<div><span style="color:#8b949e">按基础利润</span><br><strong style="color:'+(r.profit_deep>=0?'#3fb950':'#da3633')+'">'+fmt(r.profit_deep)+' ('+r.margin_deep+'%)</strong></div>'+
      (r.mfg_cost ? '<div><span style="color:#8b949e">制造利润</span><br><strong style="color:'+((r.total_revenue-r.mfg_cost)>=0?'#3fb950':'#da3633')+'">'+fmt(r.total_revenue-r.mfg_cost)+' ('+((r.total_revenue-r.mfg_cost)/r.mfg_cost*100).toFixed(1)+'%)</strong></div>' : '')+
      '</div>'+
      (r._debug_config?'<div style="margin-top:4px;font-size:10px;color:#8b949e">debug: ME='+r._debug_config.me+' TE='+r._debug_config.te+' skill='+r._debug_config.skill+' build='+r._debug_config.build+' implant='+r._debug_config.implant+' factor='+r._debug_config.wh_factor+' mats='+r._debug_config.num_materials+'</div>':'')+
      '<div style="margin-top:6px"><span style="font-size:12px;color:#58a6ff;cursor:pointer" onclick="checkAndStart('+wid+','+lineNum+','+typeId+','+qty+')">▶ 启动生产</span></div>';
    el.innerHTML = h;
  });
}

function checkAndStart(wid, lineNum, typeId, qty) {
  if (!typeId) { alert('请先选择产品'); return; }
  var el = document.getElementById('lineMats_'+(lineNum-1));
  if (!el) return;
  el.innerHTML = '<span style="color:#8b949e">计算中...</span>';
  var tk = window.authToken || localStorage.getItem('auth_token');

  // 同时加载：材料列表（蓝图+基础）+ 用户保存的定价配置 + 库存
  Promise.all([
    fetch('/api/calculate?type_id='+typeId+'&quantity='+qty, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json();}).catch(function(){return null;}),
    fetch('/api/calculate?type_id='+typeId+'&quantity='+qty+'&bom=true', { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json();}).catch(function(){return null;}),
    fetch('/api/load-overrides?type_id='+typeId, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json();}).catch(function(){return null;}),
    fetch('/api/industry/inventory?warehouse_id='+wid, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json();}).catch(function(){return {items:[]};})
  ]).then(function(results){
    var calcD = results[0], bomD = results[1], ovD = results[2], invD = results[3];
    if (!calcD || !calcD.ok) { el.innerHTML = '<span style="color:#da3633">无法获取配方</span>'; return; }

    var calc = calcD.data;
    var bomCalc = bomD && bomD.ok ? bomD.data : null;
    var overrides = (ovD && ovD.data && ovD.data.overrides) || {};
    var inv = invD.items || [];

    // 蓝图材料列表
    var bpMats = (calc.materials || []).filter(function(m){ return m.type_id > 0; });
    // 基础材料列表
    var deepMats = (bomCalc && bomCalc.deep_materials) || [];

    // 库存映射
    var invMap = {};
    for (var i = 0; i < inv.length; i++) invMap[inv[i].type_id] = inv[i].quantity;

    var hasShortage = false;
    var bpCost = 0;
    var h = '';

    // === 蓝图材料 ===
    if (bpMats.length > 0) {
      h += '<div style="font-size:11px;margin-bottom:2px">'+
        '<span style="color:#8b949e;cursor:pointer" onclick="toggleLineBom(event,'+(lineNum-1)+','+typeId+','+qty+')">▸ 基础材料</span></div>';
      h += '<table style="width:100%;font-size:11px;border-collapse:collapse"><thead><tr style="color:#8b949e"><th style="text-align:left;padding:2px 4px">蓝图材料</th><th style="text-align:right;padding:2px 4px">需求</th><th style="text-align:right;padding:2px 4px">库存</th><th style="text-align:right;padding:2px 4px">缺口</th><th style="text-align:right;padding:2px 4px">成本</th></tr></thead><tbody>';
      for (var i = 0; i < bpMats.length; i++) {
        var m = bpMats[i];
        var required = m.quantity || 0;
        var available = invMap[m.type_id] || 0;
        var missing = Math.max(0, required - available);
        if (missing > 0) hasShortage = true;
        // 使用已保存的定价方式
        var ov = overrides[m.type_id];
        var price = ov ? (ov.pricing_mode === 'buy' ? (m.buy_price||0) : (m.sell_price||0)) : (m.sell_price||0);
        var total = missing * price;
        bpCost += total;
        h += '<tr style="border-top:1px solid #21262d"><td style="padding:2px 4px">'+(m.name||'#'+m.type_id)+'</td>'+
          '<td style="text-align:right;padding:2px 4px">'+required.toLocaleString()+'</td>'+
          '<td style="text-align:right;padding:2px 4px">'+available.toLocaleString()+'</td>'+
          '<td style="text-align:right;padding:2px 4px;color:'+(missing>0?'#da3633':'#3fb950')+'">'+missing.toLocaleString()+'</td>'+
          '<td style="text-align:right;padding:2px 4px;color:#d29922">'+(total>0?fmt(total):'—')+'</td></tr>';
      }
      h += '</tbody></table>';
    }

    // === 基础材料成本（简略）===
    var deepCost = 0;
    if (deepMats.length > 0) {
      var deepTable = '<table style="width:100%;font-size:11px;border-collapse:collapse;opacity:0.8"><thead><tr style="color:#8b949e"><th style="text-align:left;padding:2px 4px">基础材料</th><th style="text-align:right;padding:2px 4px">需求</th><th style="text-align:right;padding:2px 4px">单价</th><th style="text-align:right;padding:2px 4px">总价</th></tr></thead><tbody>';
      for (var i = 0; i < deepMats.length; i++) {
        var bm = deepMats[i];
        deepCost += bm.total_sell || 0;
        deepTable += '<tr style="border-top:1px solid #21262d"><td style="padding:2px 4px">'+bm.name+'</td><td style="text-align:right;padding:2px 4px">'+(bm.quantity||0).toLocaleString()+'</td><td style="text-align:right;padding:2px 4px">'+fmt(bm.sell_price||0)+'</td><td style="text-align:right;padding:2px 4px">'+fmt(bm.total_sell||0)+'</td></tr>';
      }
      deepTable += '</tbody></table>';
      // 存为 data 属性供展开用
      el.setAttribute('data-deep-html', deepTable);
    }

    // 成本汇总
    h += '<div style="margin-top:4px;font-size:11px;display:flex;gap:16px;flex-wrap:wrap">'+
      '<span>蓝图材料成本: <strong style="color:#d29922">'+(hasShortage?fmt(bpCost)+'（缺口）':'—')+'</strong></span>'+
      (deepCost>0?'<span>基础材料成本: <strong style="color:#58a6ff">'+fmt(deepCost)+'</strong></span>':'')+
      '</div>';

    el.innerHTML = h;
    el.setAttribute('data-has-shortage', hasShortage ? '1' : '0');
  });
}

function toggleLineBom(ev, idx, typeId, qty) {
  var el = document.getElementById('lineMats_'+idx);
  var toggler = ev.target;
  if (toggler.textContent.indexOf('▸') === 0) {
    toggler.textContent = '▾ 收起基础材料';
    var deepHtml = el.getAttribute('data-deep-html');
    if (deepHtml) {
      var div = document.getElementById('bom_'+idx);
      if (div) { div.style.display = ''; }
      else { el.innerHTML += '<div id="bom_'+idx+'">'+deepHtml+'</div>'; }
    }
  } else {
    toggler.textContent = '▸ 基础材料';
    var bom = document.getElementById('bom_'+idx);
    if (bom) bom.style.display = 'none';
  }
}

function loadShortageSummary(wid) {
  var summaryEl = document.getElementById('shortageSummary');
  if (!summaryEl) return;
  var tk = window.authToken || localStorage.getItem('auth_token');
  var mr = parseFloat(document.getElementById('matRig').value) || 3.8;
  var mb = parseFloat(document.getElementById('matBuild').value) || 0;
  var mi = parseFloat(document.getElementById('matImplant').value) || 0;
  fetch('/api/industry/shortage?warehouse_id='+wid+'&mat_rig='+mr+'&mat_build='+mb+'&mat_implant='+mi, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    var s = d.result || {};
    var required = s.total_required || {};
    var keys = Object.keys(required);
    if (keys.length === 0) { summaryEl.innerHTML = ''; return; }
    var h = '<h4 style="margin-bottom:6px;font-size:13px">物料缺口汇总 <span style="font-weight:normal;color:#8b949e">('+s.shortage_types+' 种缺料)</span></h4>'+
      '<div style="overflow-x:auto"><table style="width:100%;font-size:12px;border-collapse:collapse">'+
      '<thead><tr style="color:#8b949e"><th style="text-align:left;padding:4px 6px">材料</th><th style="text-align:right;padding:4px 6px">总需求</th><th style="text-align:right;padding:4px 6px">库存</th><th style="text-align:right;padding:4px 6px">缺口</th></tr></thead><tbody>';
    for (var tid in required) {
      var r = required[tid];
      h += '<tr style="border-top:1px solid #21262d"><td style="padding:4px 6px">'+(r.name_cn||'#'+tid)+'</td>'+
        '<td style="text-align:right;padding:4px 6px">'+r.required.toLocaleString()+'</td>'+
        '<td style="text-align:right;padding:4px 6px">'+(r.available||0).toLocaleString()+'</td>'+
        '<td style="text-align:right;padding:4px 6px;color:'+(r.missing>0?'#da3633':'#3fb950')+'">'+(r.missing||0).toLocaleString()+'</td></tr>';
    }
    h += '</tbody></table></div>';
    summaryEl.innerHTML = h;
  }).catch(function(){});
}

function checkAndStart(wid, lineNum) {
  var sel = document.getElementById('lpSel_'+lineNum);
  var typeId = parseInt(sel.value) || 0;
  if (!typeId) { alert('请先选择产品'); return; }
  var qty = parseInt(document.getElementById('lpQty_'+lineNum).value) || 1;
  if (qty < 1) { alert('数量必须大于0'); return; }

  // 检查缺口
  var idx = lineNum - 1;
  var matsEl = document.getElementById('lineMats_'+idx);
  if (matsEl && matsEl.getAttribute('data-has-shortage') === '1') {
    alert('材料不足，无法启动！请补充库存后重试');
    return;
  }
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/start-production?warehouse_id='+wid+'&line_number='+lineNum+'&product_type_id='+typeId+'&quantity='+qty, { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (d.ok) {
      alert('已启动！预计完成: '+(d.result.estimated_end_at||''));
      switchWHTab({target:document.querySelector('#pageIndustry .profit-tab')}, 'production', wid);
    } else {
      alert(d.message||'启动失败');
    }
  });
}

// ========== 物料缺口 Tab ==========


function saveLineCoeffs(wid) {
  var getVal = function(id, def) {
    var el = document.getElementById(id);
    return el ? (parseFloat(el.value) || def) : def;
  };
  var coeffs = JSON.stringify({
    time_skill: getVal('timeSkill', 32),
    time_build: getVal('timeBuild', 30),
    time_rig: getVal('timeRig', 30),
    time_implant: getVal('timeImplant', 0),
    mat_rig: getVal('matRig', 3.8),
    line_sci: getVal('lineSci', 3),
    line_tax: getVal('lineTax', 1),
    line_me: getVal('lineMe', 10),
    line_te: getVal('lineTe', 20),
    line_skill: getVal('lineSkillLv', 5),
    mat_build: getVal('matBuild', 0),
    mat_implant: getVal('matImplant', 0)
  });
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/line-coeffs/save?warehouse_id='+wid+'&coeffs='+encodeURIComponent(coeffs), { method: 'POST', headers: {'Authorization': 'Bearer '+tk} });
}

function loadRunningCountdowns(wid) {
  var tk = window.authToken || localStorage.getItem('auth_token');
  // 清除所有 cd 元素的旧 interval（存在 data-cd-int 里）
  document.querySelectorAll('[id^="cd_"]').forEach(function(el){
    var oldInt = el.getAttribute('data-cd-int');
    if (oldInt) { clearInterval(parseInt(oldInt)); }
  });
  // 启动全局倒计时（每秒更新一次所有 cd_ 元素）
  if (!window._cdTimer) {
    window._cdTimer = setInterval(function(){
      document.querySelectorAll('[id^="cd_"]').forEach(function(el){
        // 已有交付按钮的跳过，避免覆盖按钮
        if (el.getAttribute('data-btn-added')) return;
        var endStr = el.getAttribute('data-end');
        if (!endStr) return;
        var endDate = new Date(endStr);
        if (isNaN(endDate)) return;
        var diff = endDate - new Date();
        if (diff <= 0) {
          el.innerHTML = '⏰ 已完成';
          if (!el.getAttribute('data-btn-added')) {
            el.setAttribute('data-btn-added', '1');
            var p = el.id.split('_');
            if (p.length>=3) el.innerHTML += ' <span style="font-size:12px;color:#3fb950;cursor:pointer" onclick="collectAndReset(0,'+p[2]+','+p[1]+')">📦 交付</span>';
          }
          return;
        }
        var h = Math.floor(diff / 3600000);
        var m = Math.floor((diff % 3600000) / 60000);
        var s = Math.floor((diff % 60000) / 1000);
        // 用 innerHTML 避免覆盖按钮
        el.innerHTML = '⏱ ' + h + 'h ' + m + 'm ' + s + 's';
      });
    }, 1000);
  }
  fetch('/api/industry/jobs?warehouse_id='+wid+'&status=running', { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    var jobs = d.jobs || [];
    // 不重置有运行中任务的线的产品选择
    var runningLines = {};
    for (var i = 0; i < jobs.length; i++) runningLines[jobs[i].line_number] = jobs[i];
    // 清理已完成的线：恢复下拉、移除文本、移除倒计时
    var allLineEls = document.querySelectorAll('[id^="lpSel_"]');
    for (var i = 0; i < allLineEls.length; i++) {
      var sel = allLineEls[i];
      var ln = parseInt(sel.id.replace('lpSel_',''));
      if (!runningLines[ln]) {
        // 恢复所有输入框、移除静态文本
        var restoreIds = ['lpSel_'+ln, 'lpQty_'+ln, 'lpPrice_'+ln, 'lpDisc_'+ln, 'lpCust_'+ln];
        for (var ri = 0; ri < restoreIds.length; ri++) {
          var inp2 = document.getElementById(restoreIds[ri]);
          if (inp2) inp2.style.display = '';
          var st2 = document.getElementById('lpStatic_'+restoreIds[ri]);
          if (st2) st2.remove();
        }
        if (sel) sel.value = '0';  // 重置选择
        // 清除数据库中的产品配置
        fetch('/api/industry/line-config/save?warehouse_id='+wid+'&line_number='+ln+'&product_type_id=0&price_mode=sell&price_discount=1.0&custom_price=0', { method: 'POST', headers: {'Authorization': 'Bearer '+tk} });
        var nameSpan = document.getElementById('lpName_'+ln);
        if (nameSpan) nameSpan.remove();
        var cd = document.getElementById('cd_'+ln+'_'+wid);
        if (cd) cd.parentNode.removeChild(cd);
      }
    }
    // 先加载这些线的产品到下拉框，再用正确产品重算成本
    fetch('/api/industry/line-configs?warehouse_id='+wid, { headers: {'Authorization': 'Bearer '+tk} }).then(function(cd){
      var configs = cd.configs || [];
      for (var i = 0; i < configs.length; i++) {
        var c = configs[i];
        if (runningLines[c.line_number]) {
          var sel = document.getElementById('lpSel_'+c.line_number);
          if (sel && c.product_type_id) sel.value = c.product_type_id + '';
        }
      }
      // 重新计算所有线的成本（现在运行中的线已有正确产品）
      recalcAllLines(wid);
    });
    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i];
      var ln = j.line_number;
      var el = document.getElementById('lineProfit_'+(ln-1));
      if (!el) continue;
      var endStr = j.estimated_end_at;
      if (!endStr) continue;
      var endDate = new Date(endStr.replace(' ','T')+'+08:00');
      // 保留现有成本信息，在下方追加倒计时
      var existing = el.innerHTML;
      if (existing.indexOf('cd_'+ln+'_'+wid) === -1) {
        el.innerHTML = '<div style="font-size:12px;color:#3fb950;margin-top:2px">✅ 生产中</div>'+
          '<div id="cd_'+ln+'_'+wid+'" style="font-size:14px;color:#58a6ff;font-weight:bold">计算中...</div>';
        // 隐藏下拉菜单，改为文本显示
        hideLineInputs(ln, wid, j.product_name || '#'+j.product_type_id);
      }
      // 设置 data-end 供全局倒计时使用
      var cdEl = document.getElementById('cd_'+ln+'_'+wid);
      if (cdEl) cdEl.setAttribute('data-end', endDate.toISOString());
      // 检查是否已完成
      if (new Date() >= endDate) {
        if (!cdEl.getAttribute('data-completed')) {
          cdEl.setAttribute('data-completed', '1');
          fetch('/api/industry/mark-completed/'+j.id, { method: 'POST', headers: {'Authorization': 'Bearer '+tk} });
        }
        cdEl.textContent = '⏰ 已完成';
        if (!cdEl.getAttribute('data-btn-added')) {
          cdEl.setAttribute('data-btn-added', '1');
          cdEl.innerHTML = cdEl.textContent + ' <span style="font-size:12px;color:#3fb950;cursor:pointer;margin-left:8px" onclick="collectAndReset('+j.id+','+wid+','+ln+')">📦 交付</span>';
        }
      }
    }
  }).catch(function(){});
}

function hideLineInputs(lineNum, wid, prodName) {
  var inputIds = ['lpSel_'+lineNum, 'lpQty_'+lineNum, 'lpPrice_'+lineNum, 'lpDisc_'+lineNum, 'lpCust_'+lineNum];
  var labelMap = {'lpQty_':'数量: ','lpPrice_':'售价: ','lpDisc_':'折扣: ','lpCust_':'自定义: '};
  for (var ii = 0; ii < inputIds.length; ii++) {
    var inp = document.getElementById(inputIds[ii]);
    if (!inp) continue;
    inp.style.display = 'none';
    if (ii > 0) {
      var stxt = labelMap[inputIds[ii].replace(/\d+$/,'')] || '';
      if (inp.tagName === 'SELECT') stxt += inp.options[inp.selectedIndex] ? inp.options[inp.selectedIndex].text : inp.value;
      else stxt += inp.value;
      var span = document.createElement('span');
      span.id = 'lpStatic_'+inputIds[ii];
      span.style.cssText = 'font-size:12px;color:#8b949e;margin-left:4px';
      span.textContent = stxt;
      inp.parentNode.insertBefore(span, inp.nextSibling);
    }
  }
  // 产品名
  var sel = document.getElementById('lpSel_'+lineNum);
  if (sel) {
    var nameSpan = document.createElement('span');
    nameSpan.id = 'lpName_'+lineNum;
    nameSpan.style.cssText = 'font-size:12px;color:#c9d1d9;font-weight:bold;margin-left:4px';
    nameSpan.textContent = prodName;
    sel.parentNode.insertBefore(nameSpan, sel.nextSibling);
  }
}

function collectAndReset(jobId, wid, lineNum) {
  if (!confirm('确认交付？')) return;
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/collect?job_id='+jobId, { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (d.ok) {
      // 重置生产线：恢复所有输入框、移除静态文本
      var restoreIds = ['lpSel_'+lineNum, 'lpQty_'+lineNum, 'lpPrice_'+lineNum, 'lpDisc_'+lineNum, 'lpCust_'+lineNum];
      for (var ri = 0; ri < restoreIds.length; ri++) {
        var inp = document.getElementById(restoreIds[ri]);
        if (inp) inp.style.display = '';
        var st = document.getElementById('lpStatic_'+restoreIds[ri]);
        if (st) st.remove();
      }
      var nameSpan = document.getElementById('lpName_'+lineNum);
      if (nameSpan) nameSpan.remove();
      // 重置产品下拉
      var sel = document.getElementById('lpSel_'+lineNum);
      if (sel) sel.value = '0';
      var el = document.getElementById('lineProfit_'+(lineNum-1));
      if (el) el.innerHTML = '<span style="color:#8b949e">— 选择产品后将显示成本与利润</span>';
      // 移除倒计时元素
      var cd = document.getElementById('cd_'+lineNum+'_'+wid);
      if (cd) cd.remove();
      // 清除数据库中的产品配置
      fetch('/api/industry/line-config/save?warehouse_id='+wid+'&line_number='+lineNum+'&product_type_id=0&price_mode=sell&price_discount=1.0&custom_price=0', { method: 'POST', headers: {'Authorization': 'Bearer '+tk} });
      loadShortageSummary(wid);
    } else {
      alert(d.message || '交付失败');
    }
  });
}

// ========== 生产任务 Tab ==========

var _prodMonth = '';

function renderProductionTab(wid, jobs) {
  // 按月筛选
  if (!_prodMonth) {
    var now = new Date();
    _prodMonth = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  }
  var filtered = jobs.filter(function(j){ return j.started_at && j.started_at.indexOf(_prodMonth) === 0; });
  // 生成月份选项
  var months = {};
  for (var i = 0; i < jobs.length; i++) {
    if (jobs[i].started_at) months[jobs[i].started_at.substring(0,7)] = true;
  }
  var monthOpts = Object.keys(months).sort().reverse();
  if (monthOpts.indexOf(_prodMonth) === -1 && monthOpts.length > 0) _prodMonth = monthOpts[0];
  var h = '<h4 style="margin-bottom:8px">生产历史</h4>'+
    '<div style="margin-bottom:8px;font-size:12px;color:#8b949e">月份: <select id="prodMonthSel" style="padding:2px 6px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px" onchange="_prodMonth=this.value;switchWHTab({target:document.querySelectorAll(\'#pageIndustry .profit-tab\')[2]},\'production\','+wid+')">'+
    monthOpts.map(function(m){ return '<option value="'+m+'"'+(m===_prodMonth?' selected':'')+'>'+m+'</option>'; }).join('')+
    '</select> 共 '+(filtered.length)+' 条</div>';
  if (filtered.length === 0) {
    h += '<div class="no-result">该月暂无生产任务</div>';
    return h;
  }
  for (var i = 0; i < filtered.length; i++) {
    var j = filtered[i];
    var statusMap = {'running':'运行中','completed':'已完成','collected':'已收付','cancelled':'已取消'};
    var statusText = statusMap[j.status] || j.status;
    var statusColor = j.status==='running'?'#58a6ff':(j.status==='completed'||j.status==='collected'?'#3fb950':(j.status==='cancelled'?'#8b949e':'#da3633'));
    var snap = {};
    try { snap = JSON.parse(j.config_snapshot || '{}'); } catch(e) {}
    var cost = snap.cost_snapshot || {};
    h += '<div style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:10px;margin-bottom:8px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">'+
      '<div><strong>'+(j.product_name||'#'+j.product_type_id)+'</strong> x'+j.quantity+' <span style="color:'+statusColor+'">['+statusText+']</span></div>'+
      '<div style="font-size:12px;color:#8b949e">线#'+j.line_number+' | '+j.started_at+'</div></div>'+
      '<div style="font-size:12px;color:#8b949e;margin-top:4px">预结束: '+j.estimated_end_at+'</div>';
    // 利润显示
    if (cost.profit_bp !== undefined) {
      h += '<div style="margin-top:4px;display:flex;gap:16px;flex-wrap:wrap;font-size:12px">'+
        '<div><span style="color:#8b949e">预期利润（启动时锁定）</span><br>'+
        '蓝图利润: <strong style="color:'+(cost.profit_bp>=0?'#3fb950':'#da3633')+'">'+fmt(cost.profit_bp)+'</strong> | '+
        '基础利润: <strong style="color:'+(cost.profit_deep>=0?'#3fb950':'#da3633')+'">'+fmt(cost.profit_deep)+'</strong>'+
        '</div></div>';
    }
    if (j.status === 'completed') {
      h += '<div style="margin-top:6px"><button class="watch-btn-sm" onclick="collectJob('+j.id+')">收付</button></div>';
    }
    if (j.status === 'running') {
      // 去掉秒数，避免格式错误
      var endVal = j.estimated_end_at.replace(' ','T');
      if (endVal.length > 16) endVal = endVal.substring(0, 16);
      h += '<div style="margin-top:6px;display:flex;gap:6px;align-items:center;font-size:12px">'+
        '<input id="adjTime_'+j.id+'" type="datetime-local" value="'+endVal+'" style="padding:4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px">'+
        ' <span style="color:#8b949e;cursor:pointer" onclick="adjustTime('+j.id+')">调整</span>'+
        ' <span style="color:#da3633;cursor:pointer" onclick="cancelJob('+j.id+')">取消</span></div>';
    }
    h += '</div>';
  }
  return h;
}

function loadLiveProfits(jobs) {
  var tk = window.authToken || localStorage.getItem('auth_token');
  for (var i = 0; i < jobs.length; i++) {
    var j = jobs[i];
    var snap = {};
    try { snap = JSON.parse(j.config_snapshot || '{}'); } catch(e) {}
    var cost = snap.cost_snapshot || {};
    var mats = snap.materials || [];
    if (!cost.profit_bp || !mats.length) continue;
    (function(jobId, typeId, qty, matsData) {
      var allIds = [typeId];
      for (var mi = 0; mi < matsData.length; mi++) allIds.push(matsData[mi].type_id);
      var url = '/api/price?type_id=' + allIds.join('&type_id=');
      fetch(url, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json();}).then(function(d){
        // d is only for the first type_id, need batch approach
        // Instead, fetch current material costs from a dedicated endpoint
        var pm = cost.price_mode || 'sell';
        var pd = cost.price_discount || 1.0;
        var cp = cost.custom_price || 0;
        // 用当前市场价重新计算材料成本
        var curMatCost = 0;
        var remaining = matsData.length;
        for (var mi = 0; mi < matsData.length; mi++) {
          (function(mid, mqty){
            fetch('/api/price?type_id='+mid, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(pd2){
              var w2 = (pd2||{}).windows || {};
              var last2 = w2['7d'] || w2['24h'] || {};
              var price = last2.sell_min || 0;
              curMatCost += price * mqty;
              remaining--;
              if (remaining === 0) {
                // 所有材料价格加载完毕，计算产品当前售价
                fetch('/api/price?type_id='+typeId, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(prodD){
                  var pw = (prodD||{}).windows || {};
                  var pl = pw['7d'] || pw['24h'] || {};
                  var curSell = pl.sell_min || 0;
                  var curBuy = pl.buy_max || 0;
                  var curUnit = pm === 'sell' ? curSell * pd : (pm === 'buy' ? curBuy * pd : cp);
                  var curRevenue = curUnit * qty;
                  var curProfitBP = curRevenue - curMatCost;
                  var el = document.getElementById('liveProfit_'+jobId);
                  if (el) {
                    el.innerHTML = '<span style="color:#8b949e">实时</span><br>'+
                      '蓝图利润: <strong style="color:'+(curProfitBP>=0?'#3fb950':'#da3633')+'">'+fmt(curProfitBP)+'</strong>';
                  }
                });
              }
            }).catch(function(){ remaining--; if (remaining <= 0) { var el = document.getElementById('liveProfit_'+jobId); if (el) el.innerHTML = ''; } });
          })(matsData[mi].type_id, matsData[mi].quantity);
        }
      }).catch(function(){});
    })(j.id, j.product_type_id, j.quantity, mats);
  }
}

// ========== 对话框 ==========

function showCreateWH() {
  var name = prompt('分仓库名称:', '');
  if (!name) return;
  var charName = prompt('游戏角色名（选填）:', '');
  var stationName = prompt('空间站名称（选填）:', '');
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/warehouse/create?name='+encodeURIComponent(name)+'&character_name='+encodeURIComponent(charName||'')+'&station_name='+encodeURIComponent(stationName||''), { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    alert(d.message||'已创建');
    if (d.ok) loadWarehouseList();
  }).catch(function(){ alert('网络错误'); });
}

function editWarehouse(wid) {
  var name = prompt('新名称:', '');
  if (!name) return;
  var charName = prompt('游戏角色名:', '');
  var stationName = prompt('空间站名称:', '');
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/warehouse/update?wid='+wid+'&name='+encodeURIComponent(name)+'&character_name='+encodeURIComponent(charName||'')+'&station_name='+encodeURIComponent(stationName||''), { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (d.ok) showWarehouse(wid);
  });
}

function deleteWarehouse(wid) {
  if (!confirm('确认删除此分仓库及其所有数据？')) return;
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/warehouse/delete?wid='+wid, { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (d.ok) loadWarehouseList();
  });
}

// ---- 库存导入 ----
function showImport(wid) {
  var text = prompt('从游戏中复制仓库内容并粘贴到这里：\n（格式：物品名 数量，每行一个）', '');
  if (!text) return;
  var mode = confirm('点击"确定"为累加模式，点击"取消"为先清空再导入') ? 'append' : 'override';
  if (mode === 'override' && !confirm('确认清空当前仓库所有库存？')) return;
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/import?warehouse_id='+wid+'&text='+encodeURIComponent(text)+'&mode='+mode, { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    var msg = d.message || '导入完成';
    if (d.skipped && d.skipped.length) msg += '\n已过滤 '+(d.skipped.length)+' 项非制造原料';
    alert(msg);
    if (d.ok) switchWHTab({target:document.querySelector('#pageIndustry .profit-tab')}, 'inventory', wid);
  });
}

function showManualAdd(wid) {
  var name = prompt('输入物料名称（中文）:', '');
  if (!name) return;
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/search-materials?q='+encodeURIComponent(name), { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (!d.ok || !d.materials || d.materials.length === 0) { alert('未找到物料'); return; }
    var opts = '';
    for (var i = 0; i < d.materials.length; i++) {
      opts += (i+1)+': '+d.materials[i].name_cn+'\n';
    }
    var idx = prompt('找到以下物料，请输入序号：\n'+opts, '1');
    if (!idx) return;
    idx = parseInt(idx) - 1;
    if (isNaN(idx) || idx < 0 || idx >= d.materials.length) { alert('序号无效'); return; }
    var mid = d.materials[idx].type_id;
    var qty = parseInt(prompt('数量:', '0'));
    if (isNaN(qty)) return;
    fetch('/api/industry/manual-add?warehouse_id='+wid+'&type_id='+mid+'&quantity='+qty, { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d2){
      alert(d2.message||'已更新');
      if (d2.ok) switchWHTab({target:document.querySelector('#pageIndustry .profit-tab')}, 'inventory', wid);
    });
  });
}

function editInventoryItem(wid, typeId) {
  var qty = parseInt(prompt('新数量（0=删除）:', ''));
  if (isNaN(qty) || qty < 0) return;
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/manual-add?warehouse_id='+wid+'&type_id='+typeId+'&quantity='+qty, { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (d.ok) switchWHTab({target:document.querySelector('#pageIndustry .profit-tab')}, 'inventory', wid);
  });
}

function showClearInventory(wid) {
  if (!confirm('确认清空此分仓库的所有库存？此操作不可撤销！')) return;
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/import?warehouse_id='+wid+'&text=&mode=override', { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (d.ok) switchWHTab({target:document.querySelector('#pageIndustry .profit-tab')}, 'inventory', wid);
  });
}

// ---- 生产线 ----
function populateLineSelects(wid, configs) {
  /* 填充所有产品下拉框（从关注列表），只显示可制造物品 */
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/watchlist', { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    var items = d.items || [];
    if (items.length === 0) { clearSelects(); return; }
    // 批量检查哪些可制造
    var ids = items.map(function(x){return x.type_id;}).join(',');
    fetch('/api/industry/check-manufacturable?type_ids='+ids, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r2){return r2.json()}).then(function(d2){
      var manu = d2.result || {};
      var filtered = items.filter(function(x){ return manu[String(x.type_id)] === true; });
      populateSelectsFromList(filtered);
    }).catch(function(){ populateSelectsFromList(items); });
  });
  function populateSelectsFromList(list) {
    var selects = document.querySelectorAll('[id^="lpSel_"]');
    for (var i = 0; i < selects.length; i++) {
      var sel = selects[i];
      var curVal = sel.value;
      sel.innerHTML = '<option value="0">— 未选择 —</option>';
      for (var j = 0; j < list.length; j++) {
        var opt = document.createElement('option');
        opt.value = list[j].type_id;
        opt.textContent = list[j].name_cn || '#'+list[j].type_id;
        sel.appendChild(opt);
      }
      sel.value = curVal > 0 ? curVal : '0';
    }
  }
  function clearSelects() {
    document.querySelectorAll('[id^="lpSel_"]').forEach(function(s){ s.innerHTML = '<option value="0">— 未选择 —</option>'; s.value = '0'; });
  }
}

function recalcAllLines(wid) {
  for (var i = 1; i <= 20; i++) {
    var sel = document.getElementById('lpSel_'+i);
    if (sel && parseInt(sel.value) > 0) recalcLine(wid, i);
  }
  loadShortageSummary(wid);
}

function saveWarehouseConfig(wid) {
  var cfg = JSON.stringify({
    me_level: parseInt(document.getElementById('wcfg_me').value) || 10,
    te_level: parseInt(document.getElementById('wcfg_te').value) || 20,
    skill_bonus: parseFloat(document.getElementById('wcfg_skill').value) || 0.85,
    building_bonus: parseFloat(document.getElementById('wcfg_bd').value) || 1.0,
    implant_bonus: parseFloat(document.getElementById('wcfg_im').value) || 1.0
  });
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/warehouse-config/save?warehouse_id='+wid+'&config='+encodeURIComponent(cfg), { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (d.ok) alert('已保存');
  });
}

function setLineCount(wid) {
  var count = parseInt(document.getElementById('lineCountInput').value);
  if (isNaN(count) || count < 1 || count > 20) { alert('1-20'); return; }
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/line-count?warehouse_id='+wid+'&count='+count, { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    alert(d.message||'已更新');
    if (d.ok) switchWHTab({target:document.querySelector('#pageIndustry .profit-tab')}, 'lines', wid);
  });
}

// ---- 生产 ----
function startProduction(wid, lineNum) {
  var tk = window.authToken || localStorage.getItem('auth_token');
  var sel = document.getElementById('lpSel_'+lineNum);
  if (!sel) { alert('请先配置产品'); return; }
  var tid = parseInt(sel.value) || 0;
  if (!tid) { alert('请先从关注列表选择产品'); return; }
  var qty = parseInt(prompt('生产数量:', '1'));
  if (!qty || qty < 1) return;
  fetch('/api/industry/start-production?warehouse_id='+wid+'&line_number='+lineNum+'&product_type_id='+tid+'&quantity='+qty, { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (d.ok) {
      alert('已启动！预计完成: '+(d.result.estimated_end_at||''));
      switchWHTab({target:document.querySelector('#pageIndustry .profit-tab')}, 'production', wid);
    } else {
      alert(d.message||'启动失败');
    }
  });
}

function collectJob(jobId) {
  if (!confirm('确认收付？')) return;
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/collect?job_id='+jobId, { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (d.ok) { alert('已收付'); switchWHTab({target:document.querySelector('#pageIndustry .profit-tab')}, 'production', _currentWH); loadRunningCountdowns(_currentWH); }
    else alert(d.message);
  });
}

function cancelJob(jobId) {
  if (!confirm('确认取消生产？材料将回退到仓库！')) return;
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/cancel?job_id='+jobId, { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (d.ok) { alert('已取消'); switchWHTab({target:document.querySelector('#pageIndustry .profit-tab')}, 'production', _currentWH); loadRunningCountdowns(_currentWH); }
    else alert(d.message);
  });
}

function adjustTime(jobId) {
  var val = document.getElementById('adjTime_'+jobId).value;
  if (!val) return;
  // 验证不能早于当前时间
  var selDate = new Date(val);
  if (isNaN(selDate.getTime())) { alert('时间格式无效'); return; }
  var now = new Date();
  if (selDate <= now) { alert('终点时间不能早于当前时间'); return; }
  // 格式化为 YYYY-MM-DD HH:MM:00
  var newEnd = val.replace('T',' ');
  if (newEnd.length === 16) newEnd += ':00';
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/adjust-time?job_id='+jobId+'&new_end='+encodeURIComponent(newEnd), { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (d.ok) { alert('已调整'); if (window._currentWH) loadRunningCountdowns(window._currentWH); }
  });
}

// ========== 制造订单 ==========

function showOrders() {
  var tk = window.authToken || localStorage.getItem('auth_token');
  var area = document.getElementById('pageIndustry');
  area.innerHTML = '<div class="industry-page"><h3>制造订单</h3>'+
    '<button class="btn-primary" onclick="showCreateOrder()" style="margin-bottom:12px">+ 创建订单</button>'+
    '<div id="orderList"><div class="loading">加载中...</div></div></div>';
  fetch('/api/industry/orders', { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    renderOrderList(d.orders||[]);
  });
}

function renderOrderList(orders) {
  var el = document.getElementById('orderList');
  if (!el) return;
  if (orders.length === 0) { el.innerHTML = '<div class="no-result">暂无订单</div>'; return; }
  var h = '';
  var statusMap = {'pending':'待处理','accepted':'已接单','completed':'已完成','cancelled':'已取消'};
  for (var i = 0; i < orders.length; i++) {
    var o = orders[i];
    var items = o.items;
    try { items = JSON.parse(o.items); } catch(e) {}
    var itemStr = '';
    if (items && items.length) {
      itemStr = items.map(function(x){ return (x.name||'#'+x.type_id)+' x'+x.quantity; }).join(', ');
    }
    h += '<div style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:10px;margin-bottom:8px">'+
      '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">'+
      '<div><strong>'+escHtml(o.customer_name)+'</strong> <span style="color:'+(o.status==='pending'?'#d29922':(o.status==='completed'?'#3fb950':'#8b949e'))+'">['+(statusMap[o.status]||o.status)+']</span></div>'+
      '<div style="font-size:12px;color:#8b949e">'+(o.created_at||'')+'</div></div>'+
      '<div style="font-size:13px;color:#c9d1d9;margin-top:4px">交货: '+escHtml(o.delivery_location||'游戏内对接')+'</div>'+
      '<div style="font-size:13px;color:#c9d1d9;margin-top:4px">物品: '+itemStr+'</div>'+
      '<div style="color:#58a6ff;font-weight:bold;margin-top:4px">预估总价: '+fmt(parseFloat(o.estimated_total||0))+'</div>'+
      (o.status==='pending'?'<div style="margin-top:6px"><button class="watch-btn-sm" onclick="acceptOrder('+o.id+')">接单</button></div>':'')+
      '</div>';
  }
  el.innerHTML = h;
}

function showCreateOrder() {
  var area = document.getElementById('pageIndustry');
  area.innerHTML = '<div class="industry-page"><h3>创建订单</h3>'+
    '<div style="max-width:500px"><div style="margin-bottom:8px">下单人游戏ID: <input id="ordCustomer" type="text" class="modal-input" style="width:100%"></div>'+
    '<div style="margin-bottom:8px">期望交货地点: <input id="ordLocation" type="text" class="modal-input" style="width:100%" value="游戏内对接"></div>'+
    '<div style="margin-bottom:8px">定价方式: <select id="ordPricing" class="rank-select"><option value="sell">最低卖单价</option><option value="buy">最高收单价</option></select>'+
    ' 折扣: <select id="ordDiscount" class="rank-select"><option value="1.0">100%</option><option value="0.95">95%</option><option value="0.9">90%</option><option value="0.85">85%</option><option value="0.8">80%</option></select></div>'+
    '<div id="ordItems" style="margin-bottom:8px"><div class="ord-item" style="display:flex;gap:6px;margin-bottom:4px">'+
    '物品: <input type="text" class="ordItemName" placeholder="搜索物品..." style="flex:1;padding:6px 8px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px">'+
    ' <input type="hidden" class="ordItemId" value="0">'+
    '数量: <input type="number" class="ordItemQty" value="1" min="1" style="width:60px;padding:6px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px">'+
    '</div></div>'+
    '<button class="btn-secondary" onclick="addOrderItem()">+ 添加物品</button> '+
    '<button class="btn-primary" onclick="submitOrder()">创建订单</button> '+
    '<button class="btn-secondary" onclick="showOrders()">取消</button></div></div>';
}

function addOrderItem() {
  var div = document.createElement('div');
  div.className = 'ord-item';
  div.style.cssText = 'display:flex;gap:6px;margin-bottom:4px';
  div.innerHTML = '物品: <input type="text" class="ordItemName" placeholder="搜索物品..." style="flex:1;padding:6px 8px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px" oninput="searchOrderItem(this)">'+
    ' <input type="hidden" class="ordItemId" value="0">'+
    '数量: <input type="number" class="ordItemQty" value="1" min="1" style="width:60px;padding:6px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px">'+
    ' <span class="watch-btn-sm" onclick="this.parentElement.remove()" style="background:#da3633">×</span>';
  document.getElementById('ordItems').appendChild(div);
}

function searchOrderItem(input) {
  var val = input.value.trim();
  if (val.length < 2) return;
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/search?q='+encodeURIComponent(val), { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (!d.ok || !d.results || d.results.length === 0) return;
    var menu = document.createElement('div');
    menu.style.cssText = 'position:absolute;background:#161b22;border:1px solid #30363d;border-radius:4px;z-index:100;max-height:200px;overflow-y:auto';
    var rect = input.getBoundingClientRect();
    menu.style.left = rect.left+'px'; menu.style.top = (rect.bottom+2)+'px'; menu.style.width = rect.width+'px';
    for (var i = 0; i < Math.min(d.results.length, 10); i++) {
      var r = d.results[i];
      var item = document.createElement('div');
      item.textContent = r.name;
      item.style.cssText = 'padding:6px 10px;cursor:pointer;font-size:13px;color:#c9d1d9';
      item.onmouseover = function(){this.style.background='#1c2128'};
      item.onmouseout = function(){this.style.background='transparent'};
      item.onclick = function(rid, rname, inp){ return function(){
        inp.value = rname;
        inp.parentElement.querySelector('.ordItemId').value = rid;
        if (menu.parentNode) menu.parentNode.removeChild(menu);
      };}(r.id, r.name, input);
      menu.appendChild(item);
    }
    var old = document.querySelector('.ord-search-menu');
    if (old) old.remove();
    menu.className = 'ord-search-menu';
    document.body.appendChild(menu);
    input.onblur = function(){ setTimeout(function(){ if (menu.parentNode) menu.parentNode.removeChild(menu); }, 200); };
  });
}

async function submitOrder() {
  var customer = document.getElementById('ordCustomer').value.trim();
  if (!customer) { alert('请填写下单人游戏ID'); return; }
  var location = document.getElementById('ordLocation').value.trim() || '游戏内对接';
  var pricing = document.getElementById('ordPricing').value;
  var discount = parseFloat(document.getElementById('ordDiscount').value) || 1.0;
  var itemEls = document.querySelectorAll('.ord-item');
  var items = [];
  for (var i = 0; i < itemEls.length; i++) {
    var tid = parseInt(itemEls[i].querySelector('.ordItemId').value) || 0;
    var qty = parseInt(itemEls[i].querySelector('.ordItemQty').value) || 0;
    var name = itemEls[i].querySelector('.ordItemName').value.trim();
    if (tid && qty > 0) items.push({type_id: tid, quantity: qty, name: name});
  }
  if (items.length === 0) { alert('请至少添加一个有效物品'); return; }
  var tk = window.authToken || localStorage.getItem('auth_token');
  try {
    var r = await fetch('/api/industry/order/create?customer_name='+encodeURIComponent(customer)+
      '&items='+encodeURIComponent(JSON.stringify(items))+
      '&delivery_location='+encodeURIComponent(location)+
      '&pricing_mode='+pricing+'&discount='+discount, { method: 'POST', headers: {'Authorization': 'Bearer '+tk} });
    var d = await r.json();
    alert((d.message||'已创建')+' 预估总价: '+fmt(d.estimated_total));
    if (d.ok) showOrders();
  } catch(e) { alert('网络错误'); }
}

function acceptOrder(orderId) {
  if (!confirm('确认接单？')) return;
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/order/status?order_id='+orderId+'&status=accepted', { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (d.ok) showOrders();
  });
}

// ========== 工具函数 ==========

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmt(v) {
  if (v === undefined || v === null) return '0.00 ISK';
  return v.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})+' ISK';
}
