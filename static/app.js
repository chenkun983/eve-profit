let selectedTypeId = null;
let debounceTimer = null;
let lastCalcData = null;
let bomActive = false;

async function searchInputChanged() {
  clearTimeout(debounceTimer);
  var si = document.getElementById('searchInput');
  if (!si) return;
  var q = si.value.trim();
  if (q.length < 1) { var sr = document.getElementById('searchResults'); if (sr) sr.style.display = 'none'; return; }
  await new Promise(function(r){ debounceTimer = setTimeout(r, 200); });
  try {
    var r = await fetch('/api/search?q='+encodeURIComponent(q)), d = await r.json();
    var c = document.getElementById('searchResults');
    if (!c) return;
      if (!d.items || !d.items.length) { c.style.display = 'none'; return; }
      var html = '';
      for (var i = 0; i < d.items.length; i++) {
        html += '<div class="search-result-item" data-typeid="'+d.items[i].typeID+'" data-name="'+d.items[i].name.replace(/'/g,"\\'")+'"><span>'+d.items[i].name+'</span><span class="result-typeid">#'+d.items[i].typeID+'</span></div>';
      }
      c.innerHTML = html; c.style.display = 'block';
      // 给每个结果项绑定点击事件
      c.querySelectorAll('.search-result-item').forEach(function(el) {
        el.addEventListener('click', function(e) {
          e.stopPropagation();
          selectItem(parseInt(el.dataset.typeid), el.dataset.name);
        });
      });
    } catch(e) {}
}

document.addEventListener('DOMContentLoaded', async function() {
  try {
    var res = await fetch('/api/status'), data = await res.json(), el = document.getElementById('sdeStatus');
    if (data.sde_ok) { el.textContent = '已加载 ('+data.sde_info.size_mb+'MB, '+data.sde_info.blueprints+' 个蓝图)'; el.style.color = '#3fb950'; }
    else { el.textContent = '未加载 SDE'; el.style.color = '#f85149'; }
  } catch(e) {}
  try { loadCategories(); } catch(e) {}
  try { if (typeof checkLogin === 'function') checkLogin(); } catch(e) {}
  document.addEventListener('click', function(e) {
    var sr = document.getElementById('searchResults');
    if (sr && !e.target.closest('.search-box')) sr.style.display = 'none';
  });
});

function switchTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(function(t){ t.classList.remove('active'); });
  var sidebar = document.getElementById('sidebar');
  var pageCat = document.getElementById('pageCategories');
  var pageRank = document.getElementById('pageRanking');
  if (tab === 'categories') {
    document.querySelector('.nav-tab:nth-child(1)').classList.add('active');
    sidebar.style.display = 'block'; pageCat.style.display = 'block'; pageRank.style.display = 'none';
  } else if (tab === 'ranking') {
    document.querySelector('.nav-tab:nth-child(2)').classList.add('active');
    sidebar.style.display = 'none'; pageCat.style.display = 'none'; pageRank.style.display = 'block';
    if (typeof showRanking === 'function') showRanking();
  }
}
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('show'); }

async function loadCategories() {
  try { var r = await fetch('/api/categories'), d = await r.json(); renderTree(d.roots); }
  catch(e) { document.getElementById('categoryTree').textContent = 'failed'; }
}
function renderTree(nodes, container) {
  var root = container || document.getElementById('categoryTree'); root.innerHTML = '';
  for (var i = 0; i < nodes.length; i++) root.appendChild(createNode(nodes[i]));
}
function createNode(node) {
  var div = document.createElement('div'); div.className = 'cat-node';
  var h = document.createElement('div'); h.className = 'cat-node-header';
  var t = document.createElement('span'); t.className = 'cat-toggle'; t.textContent = '\u25b6'; h.appendChild(t);
  var n = document.createElement('span'); n.className = 'cat-name'; n.textContent = node.name; h.appendChild(n);
  if (node.hasTypes && (!node.children || !node.children.length)) {
    h.style.cursor = 'pointer';
    h.onclick = function(){ loadCategoryItems(node.id, node.name); if (window.innerWidth <= 768) closeSidebar(); };
  } else if (node.children && node.children.length) {
    var open = false;
    var cc = document.createElement('div'); cc.className = 'cat-children'; renderTree(node.children, cc);
    h.onclick = function(){ open = !open; t.textContent = open ? '\u25bc' : '\u25b6'; cc.classList.toggle('open', open); };
    div.appendChild(h); div.appendChild(cc); return div;
  }
  div.appendChild(h); return div;
}
async function loadCategoryItems(gid, gname) {
  var a = document.getElementById('categoryItems'), l = document.getElementById('categoryItemList'), lb = document.getElementById('categoryLabel');
  a.style.display = 'block'; l.innerHTML = '<div style="color:#484f58;padding:10px;text-align:center">loading...</div>'; lb.textContent = gname;
  try {
    var r = await fetch('/api/items-by-category?group_id='+gid), d = await r.json();
    document.getElementById('categoryCount').textContent = d.items.length;
    if (!d.items.length) { l.innerHTML = '<div style="color:#484f58;padding:10px;text-align:center">empty</div>'; return; }
    var html = '';
    for (var i = 0; i < d.items.length; i++) {
      html += '<div class="cat-item" data-typeid="'+d.items[i].typeID+'" data-name="'+d.items[i].name.replace(/'/g,"\\'")+'">'+d.items[i].name+'</div>';
    }
    l.innerHTML = html;
    // 事件委托：点击分类物品跳转
    l.onclick = function(e) {
      var target = e.target.closest('.cat-item');
      if (target) {
        var tid = parseInt(target.dataset.typeid);
        var name = target.dataset.name;
        if (tid) selectItem(tid, name);
      }
    };
  } catch(e) { l.innerHTML = '<div style="color:#f85149;padding:10px;text-align:center">failed</div>'; }
}

function selectItem(typeId, name) {
  selectedTypeId = typeId; document.getElementById('searchInput').value = name;
  document.getElementById('searchResults').style.display = 'none';
  bomActive = false;
  fetchData(typeId);
}
function getCfg() {
  return {
    sci: parseFloat(document.getElementById('cfgSci').value)/100||0.03,
    bonus: parseFloat(document.getElementById('cfgBonus').value)/100||0.04,
    tax: parseFloat(document.getElementById('cfgTax').value)/100||0.01,
    me: parseInt(document.getElementById('cfgMe').value)||10,
    te: parseInt(document.getElementById('cfgTe').value)||20,
  };
}
document.querySelectorAll('.config-bar input').forEach(function(el) {
  el.addEventListener('change', function(){ if (selectedTypeId) fetchData(selectedTypeId, bomActive); });
});

async function fetchData(typeId, useBom) {
  var area = document.getElementById('resultArea');
  area.style.display = 'block';
  area.innerHTML = '<div class="loading">正在拉取吉他市场数据...</div>';
  var cfg = getCfg();
  var calcUrl = '/api/calculate?type_id='+typeId+'&sci='+cfg.sci+'&bonus='+cfg.bonus+'&tax='+cfg.tax+'&me='+cfg.me+'&te='+cfg.te+(useBom ? '&bom=true' : '');
  // 并行请求，各自容错
  var p1 = fetch('/api/price?type_id='+typeId).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
  var p2 = fetch(calcUrl).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
  var results = await Promise.all([p1, p2]);
  var priceData = results[0], calcData = results[1];
  if (!priceData || !priceData.ok) { area.innerHTML = '<div class="no-result">无法获取市场价格</div>'; return; }
  lastCalcData = calcData && calcData.ok ? calcData.data : null;
  renderResult(priceData, lastCalcData);
  if (typeof loadOverrides === 'function') setTimeout(function(){ loadOverrides(); }, 500);
}

function fmt(v) { return v.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})+' ISK'; }
function fmtShort(v) { var abs = Math.abs(v); if (abs>=1e8) return (v/1e8).toFixed(2)+'e8'; if (abs>=1e4) return (v/1e4).toFixed(2)+'w'; return v.toFixed(2); }
function fmtV(v) { return v.toLocaleString('zh-CN'); }

function overrideMaterial(matId, mode) {
  if (!lastCalcData) return;
  var ov = {};
  var list = bomActive && lastCalcData.deep_bom ? lastCalcData.deep_bom : lastCalcData.materials;
  for (var i = 0; i < list.length; i++) { var el = document.getElementById('mat-mode-'+list[i].type_id); if (el) ov[list[i].type_id] = el.value; }
  ov[matId] = mode;
  recalcWithOverrides(ov);
}
function recalcWithOverrides(overrides) {
  var cfg = getCfg();
  var params = new URLSearchParams({type_id: selectedTypeId, sci: cfg.sci, bonus: cfg.bonus, tax: cfg.tax, me: cfg.me, te: cfg.te, overrides: JSON.stringify(overrides)});
  if (bomActive) params.append('bom', 'true');
  fetch('/api/calculate?'+params.toString()).then(function(r){return r.json()}).then(function(d){ if (d.ok) { lastCalcData = d.data; renderProfit(d.data); } });
}

function recalcWithRatios() {
  if (!lastCalcData || !selectedTypeId) return;
  var ov = {}, ratios = {};
  var list = bomActive && lastCalcData.deep_bom ? lastCalcData.deep_bom : lastCalcData.materials;
  for (var i = 0; i < list.length; i++) {
    var el = document.getElementById('mat-mode-'+list[i].type_id);
    if (el) ov[list[i].type_id] = el.value;
    var rl = document.getElementById('mat-ratio-'+list[i].type_id);
    if (rl) ratios[list[i].type_id] = parseFloat(rl.value);
  }
  var cfg = getCfg();
  var params = new URLSearchParams({type_id: selectedTypeId, sci: cfg.sci, bonus: cfg.bonus, tax: cfg.tax, me: cfg.me, te: cfg.te,
    overrides: JSON.stringify(ov), material_ratios: JSON.stringify(ratios)});
  if (bomActive) params.append('bom', 'true');
  fetch('/api/calculate?'+params.toString()).then(function(r){return r.json()}).then(function(d){ if (d.ok) { lastCalcData = d.data; renderProfit(d.data); } });
}

function renderResult(price, calc) {
  var area = document.getElementById('resultArea');
  var w = price.windows || {};
  // 利润数据优先，否则从市场批量价取
  var sellMin = (calc && calc.product_sell_min) ? calc.product_sell_min : ((w['7d']||{}).sell_min || 0);
  var buyMax = (calc && calc.product_buy_max) ? calc.product_buy_max : ((w['7d']||{}).buy_max || 0);
  var sellVol = (w['7d']||{}).volume || 0;
  var buyVol = (w['7d']||{}).volume || 0;
  var d7sell_med = 0;
  var spread = sellMin - buyMax, spPct = buyMax > 0 ? (spread/buyMax*100) : 0;
  var d7 = w['7d']||{}, d90 = w['90d']||{}, d7avg = d7.avg||0, d90avg = d90.avg||0, diff = d7avg>0&&d90avg>0 ? d7avg-d90avg : 0;
  var winOrder = ['24h','3d','7d','30d','90d'], winLabel = {'24h':'24h','3d':'3d','7d':'7d','30d':'30d','90d':'90d'};
  var histRows = '';
  for (var i = 0; i < winOrder.length; i++) {
    var d = w[winOrder[i]]||{}; if (!d.avg||d.avg<=0) continue;
    histRows += '<tr><td>'+winLabel[winOrder[i]]+'</td><td class="text-right">'+fmt(d.avg)+'</td><td class="text-right">'+fmtV(d.volume)+'</td></tr>';
  }
  var watchBtn = '';
  var loggedIn = (document.getElementById('loginStatus') && document.getElementById('loginStatus').classList.contains('logged-in')) || window.authToken;
  if (loggedIn) watchBtn = '<button class="watch-btn" onclick="toggleWatch('+price.type_id+',\''+price.name_cn.replace(/'/g,"\\'")+'\')" id="watchBtn">+ 关注</button>';
  area.innerHTML = '<div class="result-header"><h2>'+price.name_cn+' ('+price.name_en+')</h2><div><span class="quality-badge quality-complete">#'+price.type_id+'</span>'+watchBtn+'</div></div>'+
    '<div class="market-quote"><div class="quote-grid">'+
    '<div class="quote-card sell"><div class="qlabel">最低卖单价</div><div class="qval">'+fmt(sellMin)+'</div><div class="qvol">量 '+fmtV(sellVol)+'</div></div>'+
    '<div class="quote-card buy"><div class="qlabel">最高买单价</div><div class="qval">'+fmt(buyMax)+'</div><div class="qvol">量 '+fmtV(buyVol)+'</div></div>'+
    '<div class="quote-card '+(spread<=0?'negative':'')+'"><div class="qlabel">买卖价差</div><div class="qval">'+fmt(spread)+'</div><div class="qvol">'+spPct.toFixed(2)+'%</div></div>'+
    '<div class="quote-card"><div class="qlabel">7日去极值加权均价</div><div class="qval">'+fmt(d7avg)+'</div><div class="qvol">'+(diff>0?'📈 +':(diff<0?'📉 ':'➡ '))+fmt(Math.abs(diff))+' (7d-90d)</div></div>'+
    '</div></div>'+
    '<div class="history-table"><h3>多时段去极值加权均价</h3><table><thead><tr><th>时段</th><th class="text-right">去极值加权均价</th><th class="text-right">数量</th></tr></thead><tbody>'+histRows+'</tbody></table></div>'+
    '<div id="profitSection"></div>';
  if (calc && calc.modes) renderProfit(calc);
  else document.getElementById('profitSection').innerHTML = '<div class="no-result">no blueprint</div>';
}

function renderProfit(calc) {
  var section = document.getElementById('profitSection');
  if (!calc || !calc.modes) { section.innerHTML = '<div class="no-result">no blueprint</div>'; return; }
  var modeCards = '';
  for (var i = 0; i < calc.modes.length; i++) {
    var m = calc.modes[i];
    var pClass = m.profit > 0 ? 'positive' : (m.profit < 0 ? 'negative' : 'warning');
    var qClass = m.data_quality === '数据完整' ? 'quality-complete' : (m.data_quality === '部分缺失' ? 'quality-partial' : 'quality-warn');
    var h = Math.floor(calc.manufacturing_time / 3600), mn = Math.floor((calc.manufacturing_time % 3600) / 60);
    var missHtml = (m.missing_materials && m.missing_materials.length) ? '<div class="missing-mat">缺 '+m.missing_materials.length+' 种材料</div>' : '';
    modeCards += '<div class="mode-card"><div class="mode-header"><span class="mode-label">'+m.label+'</span><span class="quality-badge '+qClass+'">'+m.data_quality+'</span></div><div class="mode-desc">'+m.desc+'</div>'+missHtml+
      '<div class="mode-numbers">'+
      '<div class="mode-num"><span class="mode-num-label">收入</span><span class="mode-num-val">'+fmt(m.revenue)+'</span></div>'+
      '<div class="mode-num"><span class="mode-num-label">成本</span><span class="mode-num-val">'+fmt(m.total_cost)+'</span></div>'+
      '<div class="mode-num"><span class="mode-num-label '+pClass+'">利润</span><span class="mode-num-val '+pClass+'">'+fmt(m.profit)+'</span></div>'+
      '<div class="mode-num"><span class="mode-num-label '+pClass+'">利润率</span><span class="mode-num-val '+pClass+'">'+m.profit_margin.toFixed(1)+'%</span></div>'+
      '<div class="mode-num"><span class="mode-num-label">'+h+'h'+mn+'m</span><span class="mode-num-val '+pClass+'">'+fmt(m.isk_per_hour)+'</span></div>'+
      '<div class="mode-num"><span class="mode-num-label">24h利润</span><span class="mode-num-val '+pClass+'">'+fmt(m.profit_24h)+'</span></div>'+
      '</div></div>';
  }
  var ideal = calc.modes[0] || {};
  var matRows = '';
  for (var i = 0; i < calc.materials.length; i++) {
    var m = calc.materials[i];
    var ratio = m.ratio || 1.0;
    matRows += '<tr><td>'+m.name+(m.has_price?'':' [nodata]')+'</td><td class="text-right">'+m.quantity.toLocaleString()+'</td><td class="text-right">'+fmt(m.buy_price)+'</td><td class="text-right">'+fmt(m.sell_price)+'</td><td class="text-right">'+fmt(m.buy_price*m.quantity)+'</td><td class="text-right">'+fmt(m.sell_price*m.quantity)+'</td>'+
      '<td class="text-center"><select id="mat-mode-'+m.type_id+'" class="mat-mode-select" onchange="overrideMaterial('+m.type_id+',this.value)"'+(m.has_price?'':' disabled')+'>'+
      '<option value="buy"'+(m.default_pricing_mode==='buy'?' selected':'')+'>收单</option>'+
      '<option value="sell"'+(m.default_pricing_mode==='sell'?' selected':'')+'>卖单</option>'+
      '<option value="self"'+(m.default_pricing_mode==='self'?' selected':'')+'>自产</option></select></td>'+
      '<td class="text-center"><select id="mat-ratio-'+m.type_id+'" class="mat-mode-select" onchange="recalcWithRatios()">'+
      [100,95,90,85,80].map(function(v){ return '<option value="'+(v/100)+'"'+(Math.abs(ratio-(v/100))<0.01?' selected':'')+'>'+v+'%</option>'; }).join('')+
      '</select></td></tr>';
  }
  var bomBtn = (calc.deep_bom && calc.deep_bom.length) ? '<button id="deepBomBtn" class="bom-toggle" onclick="toggleDeepBom()" style="margin-right:8px">'+(bomActive?'收起基础材料':'展开基础材料')+'</button>' : '';
  var loggedIn = (document.getElementById('loginStatus') && document.getElementById('loginStatus').classList.contains('logged-in')) || window.authToken;
  var saveBtn = loggedIn ? '<button class="save-overrides-btn" onclick="saveOverrides()">保存配置</button>' : '';
  var actionRow = (bomBtn || saveBtn) ? '<div style="display:flex;gap:8px;align-items:center;margin:8px 0">'+bomBtn+saveBtn+'</div>' : '';
  section.innerHTML = '<div class="profit-section"><h3>利润计算</h3><div class="mode-grid">'+modeCards+'</div>'+
    '<div class="cost-breakdown"><h4>成本分项</h4>'+
    '<div class="breakdown-row"><span>基础材料成本</span><span>'+fmt(ideal.material_cost)+'</span></div>'+
    '<div class="breakdown-row"><span>效率修正后</span><span>'+fmt(ideal.material_cost_eff)+'</span></div>'+
    '<div class="breakdown-row"><span>星系成本指数</span><span>'+fmt(ideal.system_cost)+'</span></div>'+
    '<div class="breakdown-row"><span>设施税</span><span>'+fmt(ideal.facility_tax)+'</span></div>'+
    '<div class="breakdown-row total"><span>总制造费用</span><span>'+fmt(ideal.total_cost)+'</span></div></div>'+
    actionRow +
    '<div class="materials-table" style="display:'+(bomActive?'none':'block')+'"><h4>蓝图材料清单</h4><table><thead><tr><th>材料</th><th class="text-right">数量</th><th class="text-right">收单价</th><th class="text-right">卖单价</th><th class="text-right">收单总价</th><th class="text-right">卖单总价</th><th class="text-center">定价</th><th class="text-center">比率</th></tr></thead><tbody>'+matRows+'</tbody></table></div>'+
    '<div id="deepBomContainer" class="deep-bom" style="display:'+(bomActive?'block':'none')+'"><h4>基础材料清单</h4>'+
    (calc.deep_bom && calc.deep_bom.length ? '<table><thead><tr><th>材料</th><th class="text-right">总数量</th><th class="text-right">收单价</th><th class="text-right">卖单价</th><th class="text-right">收单总价</th><th class="text-right">卖单总价</th><th class="text-center">类型</th><th class="text-center">定价</th><th class="text-center">比率</th></tr></thead><tbody>'+
      calc.deep_bom.map(function(m){
        var mi = (calc.materials||[]).find(function(x){ return x.type_id === m.type_id; }) || {};
        var mode = mi.default_pricing_mode || 'sell';
        var ratio = mi.ratio || 1.0;
        return '<tr><td>'+m.name+'</td><td class="text-right">'+m.total_quantity.toLocaleString()+'</td><td class="text-right">'+fmt(m.buy_price)+'</td><td class="text-right">'+fmt(m.sell_price)+'</td><td class="text-right">'+fmt(m.total_buy_cost)+'</td><td class="text-right">'+fmt(m.total_sell_cost)+'</td><td class="text-center" style="font-size:11px;color:#8b949e">'+(m.is_base_mineral?'基础矿物':(m.is_terminal?'终端物料':'中间材料'))+'</td><td class="text-center"><select id="mat-mode-'+m.type_id+'" class="mat-mode-select" onchange="overrideMaterial('+m.type_id+',this.value)"><option value="buy"'+(mode==='buy'?' selected':'')+'>收单</option><option value="sell"'+(mode==='sell'?' selected':'')+'>卖单</option><option value="self"'+(mode==='self'?' selected':'')+'>自产</option></select></td><td class="text-center"><select id="mat-ratio-'+m.type_id+'" class="mat-mode-select" onchange="recalcWithRatios()">'+
        [100,95,90,85,80].map(function(v){ return '<option value="'+(v/100)+'"'+(Math.abs(ratio-(v/100))<0.01?' selected':'')+'>'+v+'%</option>'; }).join('')+
        '</select></td></tr>';
      }).join('')+'</tbody></table>' : '')+
    '</div></div>';
}

function toggleDeepBom() {
  bomActive = !bomActive;
  var btn = document.getElementById('deepBomBtn');
  if (btn) btn.textContent = bomActive ? '收起基础材料' : '展开基础材料';
  fetchData(selectedTypeId, bomActive);
}

async function saveOverrides() {
  if (!window.authToken || !lastCalcData || !selectedTypeId) { if (typeof showLogin==='function') showLogin(); return; }
  var ov = {};
  var list = bomActive && lastCalcData.deep_bom ? lastCalcData.deep_bom : lastCalcData.materials;
  for (var i = 0; i < list.length; i++) { var el = document.getElementById('mat-mode-'+list[i].type_id); if (el) ov[list[i].type_id] = el.value; }
  var cfg = getCfg();
  ov['_config'] = {sci: cfg.sci, bonus: cfg.bonus, tax: cfg.tax, me: cfg.me, te: cfg.te, bom: bomActive};
  try {
    var r = await fetch('/api/save-overrides?type_id='+selectedTypeId+'&overrides='+encodeURIComponent(JSON.stringify(ov)), { method: 'POST', headers: {'Authorization': 'Bearer '+window.authToken} });
    var d = await r.json();
    if (d.ok) alert('配置已保存');
  } catch(e) { alert('保存失败'); }
}

async function loadOverrides() {
  if (!window.authToken || !selectedTypeId) return;
  try {
    var r = await fetch('/api/load-overrides?type_id='+selectedTypeId, { headers: {'Authorization': 'Bearer '+window.authToken} });
    var d = await r.json();
    if (d.ok && d.overrides) {
      var cfg = getCfg();
      var config = d.overrides['_config'] || {};
      delete d.overrides['_config'];
      if (config.sci !== undefined) { document.getElementById('cfgSci').value = (config.sci*100).toFixed(1); }
      if (config.bonus !== undefined) { document.getElementById('cfgBonus').value = (config.bonus*100).toFixed(1); }
      if (config.tax !== undefined) { document.getElementById('cfgTax').value = (config.tax*100).toFixed(1); }
      if (config.me !== undefined) { document.getElementById('cfgMe').value = config.me; }
      if (config.te !== undefined) { document.getElementById('cfgTe').value = config.te; }
      bomActive = config.bom || false;
      var newCfg = getCfg();
      var params = new URLSearchParams({type_id: selectedTypeId, sci: newCfg.sci, bonus: newCfg.bonus, tax: newCfg.tax, me: newCfg.me, te: newCfg.te, overrides: JSON.stringify(d.overrides)});
      if (bomActive) params.append('bom', 'true');
      var res = await fetch('/api/calculate?'+params.toString());
      var calcData = await res.json();
      if (calcData.ok) {
        lastCalcData = calcData.data;
        var priceRes = await fetch('/api/price?type_id='+selectedTypeId);
        var priceData = await priceRes.json();
        if (priceData.ok) renderResult(priceData, lastCalcData);
      }
    }
  } catch(e) {}
}
