let selectedTypeId = null;
let debounceTimer = null;
let lastCalcData = null;
let bomActive = false;
if (!window._userRole) window._userRole = 'guest';

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

function searchSelectFirst() {
  var sr = document.getElementById('searchResults');
  if (!sr || sr.style.display === 'none') return;
  var first = sr.querySelector('.search-result-item');
  if (first) first.click();
}

function enterSearch() {
  var si = document.getElementById('searchInput');
  if (!si || !si.value.trim()) return;
  var sr = document.getElementById('searchResults');
  var first = sr ? sr.querySelector('.search-result-item') : null;
  if (first) { first.click(); return; }
  // 直接搜
  fetch('/api/search?q='+encodeURIComponent(si.value.trim())).then(function(r){return r.json()}).then(function(d){
    if (d.items && d.items.length > 0) selectItem(d.items[0].typeID, d.items[0].name);
  });
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
  // 搜索按钮
  try { var sb = document.getElementById('searchBtn'); if (sb) sb.addEventListener('click', function(){ enterSearch(); }); } catch(e) {}
});

function switchTab(tab) {
  if (typeof _importing !== 'undefined' && _importing) { alert('正在导入仓库数据，请稍候...'); return; }
  document.querySelectorAll('.nav-tab').forEach(function(t){ t.classList.remove('active'); });
  var sidebar = document.getElementById('sidebar');
  var pageCat = document.getElementById('pageCategories');
  var pageRank = document.getElementById('pageRanking');
  var pageEst = document.getElementById('pageEstimate');
  var pageInd = document.getElementById('pageIndustry');
  var pageOrd = document.getElementById('pageOrders');
  // 全部隐藏
  if (sidebar) sidebar.style.display = 'none';
  if (pageCat) pageCat.style.display = 'none';
  if (pageRank) pageRank.style.display = 'none';
  if (pageEst) { pageEst.style.display = 'none'; var er = document.getElementById('estResult'); if (er) er.style.display = 'none'; }
  if (pageInd) pageInd.style.display = 'none';
  if (pageOrd) pageOrd.style.display = 'none';
  var pageGuide = document.getElementById('pageGuide');
  var pageDonate = document.getElementById('pageDonate');
  if (pageGuide) pageGuide.style.display = 'none';
  if (pageDonate) pageDonate.style.display = 'none';
  if (tab === 'categories') {
    document.querySelector('.nav-tab:nth-child(1)').classList.add('active');
    if (sidebar) sidebar.style.display = 'block';
    if (pageCat) pageCat.style.display = 'block';
  } else if (tab === 'ranking') {
    document.querySelector('.nav-tab:nth-child(2)').classList.add('active');
    if (pageRank) { pageRank.style.display = 'block'; if (typeof showRanking === 'function') showRanking(); }
  } else if (tab === 'estimate') {
    document.querySelector('.nav-tab:nth-child(3)').classList.add('active');
    if (pageEst) pageEst.style.display = 'block';
  } else if (tab === 'industry') {
    var indTab = document.getElementById('tabIndustry');
    if (indTab) indTab.classList.add('active');
    if (pageInd) { pageInd.style.display = 'block'; if (typeof showIndustry === 'function') showIndustry(); }
  } else if (tab === 'guide') {
    document.querySelector('.nav-tab:nth-last-child(2)').classList.add('active');
    if (pageGuide) { pageGuide.style.display = 'block'; showGuide(); }
  } else if (tab === 'donate') {
    document.querySelector('.nav-tab:last-child').classList.add('active');
    if (pageDonate) { pageDonate.style.display = 'block'; showDonate(); }
  } else if (tab === 'orders') {
    if(!window.authToken&&!localStorage.getItem('auth_token')){showLogin();return;}
    var ordTab = document.getElementById('tabOrders');
    if (ordTab) ordTab.classList.add('active');
    if (pageOrd) { pageOrd.style.display = 'block'; if (typeof showOrders === 'function') showOrders(); }
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
  // 查关注状态
  window._itemWatched = false;
  var tk = window.authToken || localStorage.getItem('auth_token');
  if (tk && tk.length > 10) {
    fetch('/api/watchlist', { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
      if (d.items) {
        for (var i = 0; i < d.items.length; i++) {
          if (d.items[i].type_id === typeId) { window._itemWatched = true; break; }
        }
      }
      fetchData(typeId);
    });
  } else {
    fetchData(typeId);
  }
}
function getCfg() {
  var skillLv = parseInt(document.getElementById('cfgSkillLv').value) || 5;
  if (skillLv < 0) skillLv = 0;
  if (skillLv > 5) skillLv = 5;
  var skillFactor = 1.25 - 0.05 * skillLv; // 0:1.25, 5:1.0
  return {
    sci: parseFloat(document.getElementById('cfgSci').value)/100||0.03,
    tax: parseFloat(document.getElementById('cfgTax').value)/100||0.01,
    me: parseInt(document.getElementById('cfgMe').value)||10,
    te: parseInt(document.getElementById('cfgTe').value)||20,
    skill: skillFactor
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
  var role = window._userRole || 'guest';
  // 如果还没加载角色信息，检查登录状态元素
  if (role === 'guest' && document.getElementById('loginStatus')) {
    var hasLoginClass = document.getElementById('loginStatus').classList.contains('logged-in');
    if (hasLoginClass) role = 'user';  // 已登录但角色未知，保守处理
  }
  var isManufacturer = (role === 'manufacturer' || role === 'admin' || role === 'super_admin');
  // 非制造商不查询利润数据
  var p1 = fetch('/api/price?type_id='+typeId).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
  var p2 = isManufacturer ? fetch('/api/calculate?type_id='+typeId+'&sci='+cfg.sci+'&tax='+cfg.tax+'&me='+cfg.me+'&te='+cfg.te+(useBom ? '&bom=true' : '')).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; }) : Promise.resolve(null);
  var results = await Promise.all([p1, p2]);
  var priceData = results[0], calcData = results[1];
  if (!priceData || !priceData.ok) { area.innerHTML = '<div class="no-result">无法获取市场价格</div>'; return; }
  lastCalcData = calcData && calcData.ok ? calcData.data : null;
  // 非制造商不加载利润数据
  var role = window._userRole || 'guest';
  var isManufacturer = (role === 'manufacturer' || role === 'admin' || role === 'super_admin');
  if (!isManufacturer) {
    // 只显示价格行情
    var w = priceData.windows || {};
    var sellMin = 0, buyMax = 0, sellVol = 0, buyVol = 0;
    var d7 = w['7d']||{}, d90 = w['90d']||{}, d7avg = d7.avg||0, d90avg = d90.avg||0, diff = d7avg>0&&d90avg>0 ? d7avg-d90avg : 0;
    var ws = (w['7d']||{}); sellMin = ws.sell_min||0; buyMax = ws.buy_max||0; sellVol = ws.volume||0; buyVol = ws.volume||0;
    var spread = sellMin - buyMax, spPct = buyMax > 0 ? (spread/buyMax*100) : 0;
    var winOrder = ['24h','3d','7d','30d','90d'], winLabel = {'24h':'24h','3d':'3d','7d':'7d','30d':'30d','90d':'90d'};
    var histRows = '';
    for (var i = 0; i < winOrder.length; i++) { var wd = w[winOrder[i]]||{}; if (!wd.avg||wd.avg<=0) continue; histRows += '<tr><td>'+winLabel[winOrder[i]]+'</td><td class="text-right">'+fmt(wd.avg)+'</td><td class="text-right">'+fmtV(wd.volume)+'</td></tr>'; }
    area.innerHTML = '<div class="result-header"><h2>'+priceData.name_cn+' ('+priceData.name_en+')</h2><span class="quality-badge quality-complete">#'+priceData.type_id+'</span></div>'+
      '<div class="market-quote"><div class="quote-grid">'+
      '<div class="quote-card sell"><div class="qlabel">最低卖单价</div><div class="qval">'+fmt(sellMin)+'</div><div class="qvol">量 '+fmtV(sellVol)+'</div></div>'+
      '<div class="quote-card buy"><div class="qlabel">最高买单价</div><div class="qval">'+fmt(buyMax)+'</div><div class="qvol">量 '+fmtV(buyVol)+'</div></div>'+
      '<div class="quote-card '+(spread<=0?'negative':'')+'"><div class="qlabel">买卖价差</div><div class="qval">'+fmt(spread)+'</div><div class="qvol">'+spPct.toFixed(2)+'%</div></div>'+
      '<div class="quote-card"><div class="qlabel">7日去极值加权均价</div><div class="qval">'+fmt(d7avg)+'</div><div class="qvol">'+(diff>0?'📈 +':(diff<0?'📉 ':'➡ '))+fmt(Math.abs(diff))+' (7d-90d)</div></div>'+
      '</div></div>'+
      '<div class="history-table"><h3>多时段去极值加权均价</h3><table><thead><tr><th>时段</th><th class="text-right">去极值加权均价</th><th class="text-right">数量</th></tr></thead><tbody>'+histRows+'</tbody></table></div>';
    return;
  }
  renderResult(priceData, lastCalcData);
  if (typeof loadOverrides === 'function') setTimeout(function(){ loadOverrides(); }, 800);
}

function fmt(v) { return v.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})+' ISK'; }
function fmtShort(v) { var abs = Math.abs(v); if (abs>=1e8) return (v/1e8).toFixed(2)+'e8'; if (abs>=1e4) return (v/1e4).toFixed(2)+'w'; return v.toFixed(2); }
function fmtV(v) { return v.toLocaleString('zh-CN'); }

function doEstimate() {
  var text = document.getElementById('estInput').value.trim();
  if (!text) { alert('请输入物品清单'); return; }
  var oreRate = parseFloat(document.getElementById('estOreRate').value) / 100 || 0.825;
  var otherRate = 0.55; // 固定
  var area = document.getElementById('estResult');
  area.style.display = 'block';
  area.innerHTML = '<div class="loading">估价中...</div>';
  fetch('/api/estimate?text='+encodeURIComponent(text)+'&reprocess_rate='+otherRate+'&ore_rate='+oreRate, { method: 'POST' })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if (!d.ok) { area.innerHTML = '<div class="no-result">'+d.message+'</div>'; return; }
    var h = '<h3 style="margin-bottom:12px">估价结果</h3>';
    // 汇总
    h += '<div class="quote-grid" style="grid-template-columns:1fr 1fr 1fr 1fr;margin-bottom:16px">'+
      '<div class="quote-card"><div class="qlabel">卖单价（最低卖单）汇总</div><div class="qval positive">'+fmt(d.totals.direct_sell)+'</div></div>'+
      '<div class="quote-card"><div class="qlabel">收单价（最高收单）汇总</div><div class="qval">'+fmt(d.totals.direct_buy)+'</div></div>'+
      '<div class="quote-card"><div class="qlabel">化矿卖价汇总</div><div class="qval positive">'+fmt(d.totals.mineral_sell)+'</div></div>'+
      '<div class="quote-card"><div class="qlabel">化矿买价汇总</div><div class="qval">'+fmt(d.totals.mineral_buy)+'</div></div>'+
      '</div>';
    // 逐件明细
    h += '<div style="overflow-x:auto"><table class="ranking-table" style="table-layout:fixed"><colgroup><col style="width:26%"><col style="width:8%"><col style="width:10%"><col style="width:10%"><col style="width:11%"><col style="width:11%"><col style="width:12%"><col style="width:12%"></colgroup><thead><tr><th>物品</th><th class="text-right">数量</th><th class="text-right">卖单价</th><th class="text-right">收单价</th><th class="text-right">卖价总额</th><th class="text-right">收价总额</th><th class="text-right">化矿卖价</th><th class="text-right">化矿买价</th></tr></thead><tbody>';
    for (var i = 0; i < d.results.length; i++) {
      var r = d.results[i];
      var hasSub = (r.minerals && r.minerals.length);
      var toggleIcon = hasSub ? '<span class="est-toggle" id="et'+i+'">▶</span>' : '';
      h += '<tr onclick="toggleEstDetail('+i+')" style="cursor:pointer"><td>'+toggleIcon+' '+(r.error ? r.name+' (未找到)' : r.name)+'</td><td class="text-right">'+r.quantity.toLocaleString()+'</td>'+
        '<td class="text-right">'+(r.sell_price!=null ? fmt(r.sell_price) : '-')+'</td>'+
        '<td class="text-right">'+(r.buy_price!=null ? fmt(r.buy_price) : '-')+'</td>'+
        '<td class="text-right">'+(r.direct_sell_total ? fmt(r.direct_sell_total) : '-')+'</td>'+
        '<td class="text-right">'+(r.direct_buy_total ? fmt(r.direct_buy_total) : '-')+'</td>'+
        '<td class="text-right">'+(r.mineral_sell_total ? fmt(r.mineral_sell_total) : '-')+'</td>'+
        '<td class="text-right">'+(r.mineral_buy_total ? fmt(r.mineral_buy_total) : '-')+'</td></tr>';
      // 化矿明细（可折叠，用 tr 实现）
      if (r.minerals && r.minerals.length) {
        for (var j = 0; j < r.minerals.length; j++) {
          var mm = r.minerals[j];
          var up = mm.total_sell / mm.quantity;
          var bp = mm.total_buy / mm.quantity;
          h += '<tr class="est-detail" data-idx="'+i+'" style="display:none;opacity:0.7"><td style="padding-left:28px;font-size:12px"><span style="display:inline-block;width:1.2em;text-align:right">↳</span> '+mm.name+'</td><td class="text-right">'+mm.quantity.toLocaleString()+'</td><td class="text-right">'+fmt(up)+'</td><td class="text-right">'+fmt(bp)+'</td><td></td><td></td><td class="text-right">'+fmt(mm.total_sell)+'</td><td class="text-right">'+fmt(mm.total_buy)+'</td></tr>';
        }
        // 矿渣（不够一批的剩余）
        if (r.residue && r.residue > 0) {
          h += '<tr class="est-detail" data-idx="'+i+'" style="display:none;opacity:0.5;font-style:italic"><td style="padding-left:28px;font-size:12px"><span style="display:inline-block;width:1.2em;text-align:right">↳</span> 矿渣 '+r.residue.toLocaleString()+' 块</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
        }
      }
      if (!r.minerals && !r.error) {
        h += '<tr class="est-detail" data-idx="'+i+'" style="display:none;opacity:0.5;font-style:italic"><td style="padding-left:28px;font-size:12px"><span style="display:inline-block;width:1.2em;text-align:right">↳</span> 矿渣</td><td></td><td></td><td></td><td class="text-right">'+(r.direct_sell_total?fmt(r.direct_sell_total):'-')+'</td><td class="text-right">'+(r.direct_buy_total?fmt(r.direct_buy_total):'-')+'</td><td></td><td></td></tr>';
      }
    }
    h += '</tbody></table></div>';
    area.innerHTML = h;
  })
  .catch(function(){ area.innerHTML = '<div class="no-result">请求失败</div>'; });
}

function toggleEstDetail(idx) {
  var rows = document.querySelectorAll('.est-detail[data-idx="'+idx+'"]');
  var show = false;
  if (rows.length > 0) show = rows[0].style.display !== 'none';
  for (var i = 0; i < rows.length; i++) rows[i].style.display = show ? 'none' : '';
  var toggle = document.getElementById('et'+idx);
  if (toggle) toggle.textContent = show ? '▶' : '▼';
}

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
  // 收集当前所有比率
  var ratios = {};
  var list = bomActive && lastCalcData.deep_bom ? lastCalcData.deep_bom : lastCalcData.materials;
  for (var i = 0; i < list.length; i++) {
    var rl = document.getElementById('mat-ratio-'+list[i].type_id);
    if (rl) ratios[list[i].type_id] = parseFloat(rl.value);
  }
  var params = new URLSearchParams({type_id: selectedTypeId, sci: cfg.sci, tax: cfg.tax, me: cfg.me, te: cfg.te, skill: cfg.skill, overrides: JSON.stringify(overrides), material_ratios: JSON.stringify(ratios)});
  if (bomActive) params.append('bom', 'true');
  fetch('/api/calculate?'+params.toString()).then(function(r){return r.json()}).then(function(d){ if (d.ok) { lastCalcData = d.data; renderProfit(d.data); } });
}

function recalcWithRatios() {}

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
  var isManufacturer = loggedIn && (window._userRole === 'manufacturer' || window._userRole === 'admin' || window._userRole === 'super_admin');
  if (isManufacturer) {
    watchBtn = '<button class="watch-btn" id="watchBtn" onclick="toggleWatch('+price.type_id+',\''+price.name_cn.replace(/'/g,"\\'")+'\')">+ 关注</button>';
  }
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
  // 已登录制造商：检查关注状态
  if (isManufacturer && window._itemWatched) {
    setTimeout(function(){
      var btn = document.getElementById('watchBtn');
      if (btn) { btn.textContent = '已关注'; btn.disabled = true; btn.style.opacity = '0.6'; }
    }, 50);
  }
  window._itemWatched = false;

  // 兜底：500ms 后再检查一次
  if (isManufacturer) {
    setTimeout(function(){
      var btn = document.getElementById('watchBtn');
      if (!btn || btn.disabled) return;
      var tk = window.authToken || localStorage.getItem('auth_token');
      if (!tk || tk.length < 10) return;
      fetch('/api/watchlist', { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
        if (!d.items) return;
        for (var i = 0; i < d.items.length; i++) {
          if (d.items[i].type_id === price.type_id) {
            var b2 = document.getElementById('watchBtn');
            if (b2 && !b2.disabled) { b2.textContent = '已关注'; b2.disabled = true; b2.style.opacity = '0.6'; }
            break;
          }
        }
      });
    }, 500);
  }
}

function renderProfit(calc) {
  var section = document.getElementById('profitSection');
  if (!calc || !calc.modes) { section.innerHTML = '<div class="no-result">no blueprint</div>'; return; }
  var modeCards = '';
  var bpMode = null, deepMode = null;
  for (var i = 0; i < calc.modes.length; i++) {
    var m = calc.modes[i];
    if (m.key === 'realistic') bpMode = m;
    if (m.key === 'ideal') deepMode = m;
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
  var bp = bpMode || calc.modes[0] || {};
  var dm = deepMode || calc.modes[1] || {};
  var matRows = '';
  for (var i = 0; i < calc.materials.length; i++) {
    var m = calc.materials[i];
    var ratio = m.ratio || 1.0;
    matRows += '<tr><td>'+m.name+(m.has_price?'':' [nodata]')+'</td><td class="text-right">'+m.quantity.toLocaleString()+'</td><td class="text-right">'+fmt(m.buy_price)+'</td><td class="text-right">'+fmt(m.sell_price)+'</td><td class="text-right">'+fmt(m.buy_price*m.quantity)+'</td><td class="text-right">'+fmt(m.sell_price*m.quantity)+'</td>'+
      '<td class="text-center"><select id="mat-mode-'+m.type_id+'" class="mat-mode-select" onchange="overrideMaterial('+m.type_id+',this.value)"'+(m.has_price?'':' disabled')+'>'+
      '<option value="buy"'+(m.default_pricing_mode==='buy'?' selected':'')+'>收单</option>'+
      '<option value="sell"'+(m.default_pricing_mode==='sell'?' selected':'')+'>卖单</option>'+
      '<option value="self"'+(m.default_pricing_mode==='self'?' selected':'')+'>自产</option></select></td>'+
      '<td class="text-center"><select id="mat-ratio-'+m.type_id+'" class="mat-mode-select">'+
      [100,95,90,85,80].map(function(v){ return '<option value="'+(v/100)+'"'+(Math.abs(ratio-(v/100))<0.01?' selected':'')+'>'+v+'%</option>'; }).join('')+
      '</select></td></tr>';
  }
  var bomBtn = (calc.deep_bom && calc.deep_bom.length) ? '<button id="deepBomBtn" class="bom-toggle" onclick="toggleDeepBom()" style="margin-right:8px">'+(bomActive?'收起基础材料':'展开基础材料')+'</button>' : '';
  var isManufacturer = (document.getElementById('loginStatus') && document.getElementById('loginStatus').classList.contains('logged-in')) && (window._userRole === 'manufacturer' || window._userRole === 'admin' || window._userRole === 'super_admin');
  var saveBtn = isManufacturer ? '<button class="save-overrides-btn" onclick="saveOverrides()">保存配置</button>' : '';
  var actionRow = (bomBtn || saveBtn) ? '<div style="display:flex;gap:8px;align-items:center;margin:8px 0">'+bomBtn+saveBtn+'</div>' : '';
  section.innerHTML = '<div class="profit-section"><h3>利润计算</h3><div class="mode-grid">'+modeCards+'</div>'+
    '<div class="cost-breakdown"><h4>成本分项</h4>'+
    '<div class="breakdown-row total" style="border-top:none;color:#58a6ff"><span>蓝图材料总成本</span><span>'+fmt(bp.total_cost)+'</span></div>'+
    '<div class="breakdown-row"><span>效率修正后</span><span>'+fmt(bp.material_cost_eff)+'</span></div>'+
    '<div class="breakdown-row"><span>星系成本指数</span><span>'+fmt(bp.system_cost)+'</span></div>'+
    '<div class="breakdown-row"><span>设施税</span><span>'+fmt(bp.facility_tax)+'</span></div>'+
    '<div class="breakdown-row total"><span>蓝图总制造费用</span><span>'+fmt(bp.total_cost)+'</span></div>'+
    '<div style="margin:8px 0;border-top:1px solid #21262d"></div>'+
    '<div class="breakdown-row total" style="border-top:none;color:#3fb950"><span>基础材料总成本</span><span>'+fmt(dm.total_cost)+'</span></div>'+
    '<div class="breakdown-row"><span>效率修正后</span><span>'+fmt(dm.material_cost_eff)+'</span></div>'+
    '<div class="breakdown-row"><span>星系成本指数</span><span>'+fmt(dm.system_cost)+'</span></div>'+
    '<div class="breakdown-row"><span>设施税</span><span>'+fmt(dm.facility_tax)+'</span></div>'+
    '<div class="breakdown-row total"><span>基础总制造费用</span><span>'+fmt(dm.total_cost)+'</span></div></div>'+
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
  var mats = document.querySelector('.materials-table');
  var bom = document.getElementById('deepBomContainer');
  if (mats) mats.style.display = bomActive ? 'none' : '';
  if (bom) bom.style.display = bomActive ? '' : 'none';
}

async function saveOverrides() {
  if (!window.authToken || !lastCalcData || !selectedTypeId) { if (typeof showLogin==='function') showLogin(); return; }
  var ov = {}, ratios = {};
  var list = bomActive && lastCalcData.deep_bom ? lastCalcData.deep_bom : lastCalcData.materials;
  for (var i = 0; i < list.length; i++) {
    var el = document.getElementById('mat-mode-'+list[i].type_id);
    if (el) ov[list[i].type_id] = el.value;
    var rl = document.getElementById('mat-ratio-'+list[i].type_id);
    if (rl) ratios[list[i].type_id] = parseFloat(rl.value);
  }
  var cfg = getCfg();
  ov['_config'] = {sci: cfg.sci, tax: cfg.tax, me: cfg.me, te: cfg.te, skill: cfg.skill, bom: bomActive};
  ov['_ratios'] = ratios;
  try {
    var r = await fetch('/api/save-overrides?type_id='+selectedTypeId+'&overrides='+encodeURIComponent(JSON.stringify(ov)), { method: 'POST', headers: {'Authorization': 'Bearer '+window.authToken} });
    var d = await r.json();
    if (d.ok) {
      alert('配置已保存');
      if (typeof loadOverrides === 'function') setTimeout(function(){ loadOverrides(); }, 200);
    }
  } catch(e) { alert('保存失败'); }
}

async function loadOverrides() {
  if (!window.authToken || !selectedTypeId) return;
  try {
    var r = await fetch('/api/load-overrides?type_id='+selectedTypeId, { headers: {'Authorization': 'Bearer '+window.authToken} });
    var d = await r.json();
    if (!d.ok || !d.overrides) return;
    // 没有保存的配置就不刷新
    var hasConfig = false;
    for (var k in d.overrides) { if (k !== '_config' && k !== '_ratios') { hasConfig = true; break; } }
    if (!hasConfig && !d.overrides['_config']) return;
    var cfg = getCfg();
    var config = d.overrides['_config'] || {};
    var savedRatios = d.overrides['_ratios'] || {};
    delete d.overrides['_config'];
    delete d.overrides['_ratios'];
    if (config.sci !== undefined) { document.getElementById('cfgSci').value = (config.sci*100).toFixed(1); }
    if (config.bonus !== undefined) { document.getElementById('cfgBonus').value = (config.bonus*100).toFixed(1); }
    if (config.tax !== undefined) { document.getElementById('cfgTax').value = (config.tax*100).toFixed(1); }
    if (config.me !== undefined) { document.getElementById('cfgMe').value = config.me; }
    if (config.te !== undefined) { document.getElementById('cfgTe').value = config.te; }
    if (config.skill !== undefined) {
      // 从 factor 反推等级
      var lv = Math.round((1.25 - config.skill) / 0.05);
      if (lv < 0) lv = 0; if (lv > 5) lv = 5;
      document.getElementById('cfgSkillLv').value = lv;
    }
    if (config.bom !== undefined) bomActive = config.bom;
    var newCfg = getCfg();
    var params = new URLSearchParams({type_id: selectedTypeId, sci: newCfg.sci, tax: newCfg.tax, me: newCfg.me, te: newCfg.te, skill: newCfg.skill, overrides: JSON.stringify(d.overrides), material_ratios: JSON.stringify(savedRatios)});
    if (bomActive) params.append('bom', 'true');
    var res = await fetch('/api/calculate?'+params.toString());
    var calcData = await res.json();
    if (calcData.ok) {
      lastCalcData = calcData.data;
      var priceRes = await fetch('/api/price?type_id='+selectedTypeId);
      var priceData = await priceRes.json();
      if (priceData.ok) renderResult(priceData, lastCalcData);
    }
  } catch(e) {}
}

function showGuide(){
  var el=document.getElementById('pageGuide');
  if(!el)return;
  el.innerHTML='<div style="padding:24px;max-width:800px;margin:0 auto">'+
    '<h2 style="margin-bottom:20px;color:#58a6ff">📖 使用说明</h2>'+
    '<div style="background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:20px;margin-bottom:16px">'+
    '<h3 style="color:#c9d1d9;margin-bottom:12px">用户角色说明</h3>'+
    '<table style="width:100%;font-size:13px;border-collapse:collapse">'+
    '<thead><tr style="color:#8b949e"><th style="text-align:left;padding:8px;border-bottom:1px solid #30363d">角色</th><th style="text-align:left;padding:8px;border-bottom:1px solid #30363d">功能范围</th></tr></thead><tbody>'+
    '<tr style="border-bottom:1px solid #21262d"><td style="padding:8px;color:#8b949e">👤 游客</td><td style="padding:8px">市场查询、矿物估价</td></tr>'+
    '<tr style="border-bottom:1px solid #21262d"><td style="padding:8px;color:#c9d1d9">👥 普通用户</td><td style="padding:8px">游客权限 + 发布/接受出售单、关注物品</td></tr>'+
    '<tr><td style="padding:8px;color:#d29922">🏭 制造商</td><td style="padding:8px">普通用户权限 + 利润排行 + 发布采购单、接采购单、工业管理（仓库/产线/反应）、订单系统完整功能</td></tr>'+
    '</tbody></table></div>'+
    '<div style="background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:20px;margin-bottom:16px">'+
    '<h3 style="color:#c9d1d9;margin-bottom:12px">升级为制造商</h3>'+
    '<p style="font-size:13px;color:#c9d1d9;line-height:1.8">'+
    '1️⃣ 游戏内向 <strong style="color:#d29922">baby oye</strong> 转账 <strong style="color:#3fb950">10E ISK</strong>（一个月）<br>'+
    '2️⃣ 在网站右上角点击个人信息 → <strong style="color:#58a6ff">申请升级成为制造商</strong><br>'+
    '3️⃣ 填写你的游戏角色名并提交申请<br>'+
    '4️⃣ 站长审核通过后自动升级</p>'+
    '<p style="font-size:13px;color:#8b949e;margin-top:8px">收款人游戏内截图：</p>'+
    '<div style="margin-top:8px;text-align:center"><img src="/img/baby" alt="baby oye" style="max-width:200px;border-radius:8px;border:1px solid #30363d"></div>'+
    '<div style="margin-top:12px;text-align:center"><img src="/img/upgrade-guide" alt="申请制造商示意" style="max-width:100%;border-radius:8px;border:1px solid #30363d"></div></div>'+
    '<div style="background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:20px;margin-bottom:16px">'+
    '<h3 style="color:#c9d1d9;margin-bottom:12px">订单系统说明</h3>'+
    '<p style="font-size:13px;color:#c9d1d9;line-height:1.8">'+
    '<strong>📋 订单池</strong>：查看所有公开订单，可按类型（采购/出售）和物品名筛选<br>'+
    '<strong>✏️ 发布订单</strong>：选择采购单或出售单，填写物品清单和交货信息<br>'+
    '<strong>📁 我的订单</strong>：查看自己发布的订单及接单情况，可操作交货/确认收货<br>'+
    '<strong>📦 我的接单</strong>：查看自己接的订单状态，可操作交付/确认收货<br><br>'+
    '<strong>采购单流程：</strong>制造商接单 → 制造 → 标记交付 → 下单人确认收货（5天自动确认）<br>'+
    '<strong>出售单流程：</strong>买家接单 → 卖家交货 → 买家确认收货（3天自动确认）</p></div>'+
    '</div>';
}

function showDonate(){
  var el=document.getElementById('pageDonate');
  if(!el)return;
  el.innerHTML='<div style="padding:24px;max-width:600px;margin:0 auto;text-align:center">'+
    '<h2 style="margin-bottom:20px;color:#58a6ff">☕ 投喂站长</h2>'+
    '<div style="background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:24px;margin-bottom:16px">'+
    '<p style="font-size:14px;color:#c9d1d9;margin-bottom:16px">'+
    '如果这个工具对你有帮助，请站长喝杯奶茶吧 ☕</p>'+
    '<img src="/img/alipay" alt="支付宝收款码" style="max-width:300px;width:100%;border-radius:8px;border:1px solid #30363d">'+
    '<p style="font-size:12px;color:#8b949e;margin-top:12px">支付宝扫码投喂</p></div>'+
    '<div style="background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:20px;margin-bottom:16px;text-align:left">'+
    '<h3 style="color:#c9d1d9;margin-bottom:12px">未来计划</h3>'+
    '<ul style="font-size:13px;color:#c9d1d9;line-height:2;padding-left:20px">'+
    '<li>目前以服务器 IP 地址作为入口</li>'+
    '<li>未来视众筹情况将增加域名和硬件升级</li>'+
    '<li>欢迎在游戏内写信给 <strong style="color:#d29922">baby oye</strong> 反馈 BUG 或建议</li>'+
    '<li>QQ：<strong style="color:#58a6ff">58309362</strong></li>'+
    '<li>邮箱：<strong style="color:#58a6ff">58309362@qq.com</strong></li>'+
    '</ul></div></div>';
}
