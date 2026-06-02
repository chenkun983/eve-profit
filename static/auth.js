/* EVE 利润分析器 - 用户认证与排行 */
var authToken = localStorage.getItem('auth_token') || null;
var rankData = [];
var currentProfitTab = 'flip';
var sortField = 'profit';
var sortAsc = false;

async function checkLogin() {
  var el = document.getElementById('loginStatus');
  if (!el) return;
  if (!authToken) { el.textContent = '未登录'; el.classList.remove('logged-in'); return false; }
  try {
    var r = await fetch('/api/auth/status', { headers: {'Authorization': 'Bearer '+authToken} });
    var d = await r.json();
    if (d.logged_in) {
      el.textContent = d.is_admin ? '管理员' : '已登录';
      el.classList.add('logged-in');
      window._isAdmin = d.is_admin || false;
      return true;
    }
  } catch(e) {}
  el.textContent = '未登录'; el.classList.remove('logged-in');
  authToken = null; localStorage.removeItem('auth_token');
  return false;
}

function showLogin() {
  if (authToken) { authToken = null; localStorage.removeItem('auth_token'); checkLogin(); return; }
  document.getElementById('loginModal').style.display = 'flex';
  document.getElementById('loginMsg').textContent = '';
}

function hideLogin() { document.getElementById('loginModal').style.display = 'none'; }

async function doLogin() {
  var u = document.getElementById('loginUser').value, p = document.getElementById('loginPass').value;
  document.getElementById('loginMsg').textContent = '登录中...';
  try {
    var r = await fetch('/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:u, password:p}) });
    var d = await r.json();
    if (d.ok && d.token) { authToken = d.token; localStorage.setItem('auth_token', d.token); document.getElementById('loginMsg').textContent = '登录成功'; checkLogin(); setTimeout(hideLogin, 800); }
    else { document.getElementById('loginMsg').textContent = d.message; }
  } catch(e) { document.getElementById('loginMsg').textContent = '请求失败'; }
}

async function doRegister() {
  var u = document.getElementById('loginUser').value, p = document.getElementById('loginPass').value;
  document.getElementById('loginMsg').textContent = '注册中...';
  try {
    var r = await fetch('/api/auth/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:u, password:p}) });
    var d = await r.json();
    document.getElementById('loginMsg').textContent = d.ok ? d.message : d.message;
  } catch(e) { document.getElementById('loginMsg').textContent = '请求失败'; }
}

function showRanking() {
  if (!authToken) { showLogin(); return; }
  var area = document.getElementById('pageRanking');
  if (!area) return;
  area.innerHTML = '<div class="ranking-page"><h3>利润排行</h3><div class="ranking-header">' +
    '<select id="rankMode" class="rank-select" onchange="onRankModeChange()"><option value="watchlist">我的关注</option><option value="category">按分类扫描</option></select>' +
    '<span id="rankCategoryWrap" style="display:none"><select id="rankCategory" class="rank-select"></select></span></div>' +
    '<div class="profit-tabs"><button class="profit-tab active" onclick="switchProfitTab(event,\'flip\')">倒卖利润</button><button class="profit-tab" onclick="switchProfitTab(event,\'ideal\')">理想利润</button><button class="profit-tab" onclick="switchProfitTab(event,\'realistic\')">实时利润</button><button class="profit-tab" onclick="switchProfitTab(event,\'conservative\')">保守利润</button></div>' +
    '<div id="rankContent"><div class="loading">加载中...</div></div></div>';
  setTimeout(function(){ loadRanking(); }, 100);
}

function switchProfitTab(ev, tab) {
  currentProfitTab = tab;
  var btns = document.querySelectorAll('.profit-tab');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
  ev.target.classList.add('active');
  renderRankingTable();
}

function toggleSort(field) {
  if (sortField === field) sortAsc = !sortAsc;
  else { sortField = field; sortAsc = false; }
  renderRankingTable();
}

function renderRankingTable() {
  var el = document.getElementById('rankContent');
  if (!el || !rankData.length) { el.innerHTML = '<div class="no-result">暂无数据</div>'; return; }
  var data = rankData.map(function(item) {
    var profit = 0, margin = 0;
    if (currentProfitTab === 'flip') { profit = item.flip_profit||0; margin = item.flip_margin||0; }
    else if (item[currentProfitTab]) { profit = item[currentProfitTab].profit||0; margin = item[currentProfitTab].margin||0; }
    return { item: item, profit: profit, margin: margin };
  });
  data.sort(function(a,b){
    var va = sortField==='profit'?a.profit:a.margin, vb = sortField==='profit'?b.profit:b.margin;
    return sortAsc ? va-vb : vb-va;
  });
  var html = '<div style="font-size:12px;color:#484f58;margin-bottom:8px">共 '+rankData.length+' 件</div><div style="overflow-x:auto"><table class="ranking-table"><thead><tr><th>#</th><th>物品</th>'+
    '<th class="text-right" onclick="toggleSort(\'profit\')" style="cursor:pointer">利润 '+(sortField==='profit'?(sortAsc?'▲':'▼'):'')+'</th>'+
    '<th class="text-right" onclick="toggleSort(\'margin\')" style="cursor:pointer">利润率 '+(sortField==='margin'?(sortAsc?'▲':'▼'):'')+'</th>'+
    '<th class="text-right">24h利润</th><th>类型</th></tr></thead><tbody>';
  for (var i = 0; i < data.length; i++) {
    var item = data[i].item, profit = data[i].profit, margin = data[i].margin;
    var pc = profit > 0 ? 'positive' : (profit < 0 ? 'negative' : '');
    var pro24 = 0;
    if (currentProfitTab === 'flip') pro24 = profit * 86400 / 600;
    else if (item[currentProfitTab]) pro24 = item[currentProfitTab].profit_24h||0;
    var name = item.name.replace(/'/g, "\\'");
    html += '<tr onclick="selectItem('+item.type_id+',\''+name+'\')" style="cursor:pointer"><td><span class="rank-num">'+(i+1)+'</span></td><td>'+item.name.replace(/\\"/g,'"')+'</td><td class="text-right '+pc+'">'+fmt(profit)+'</td><td class="text-right '+pc+'">'+margin.toFixed(1)+'%</td><td class="text-right '+pc+'">'+fmt(pro24)+'</td><td style="font-size:11px;color:#8b949e">'+(item.has_blueprint?'制造':'倒卖')+'</td></tr>';
  }
  html += '</tbody></table></div>';
  el.innerHTML = html;
}

function onRankModeChange() {
  var mode = document.getElementById('rankMode').value;
  var wrap = document.getElementById('rankCategoryWrap');
  if (mode === 'category') { wrap.style.display = 'inline-block'; loadCategorySelect(); }
  else { wrap.style.display = 'none'; }
  loadRanking();
}

async function loadCategorySelect() {
  var sel = document.getElementById('rankCategory');
  try {
    var r = await fetch('/api/categories'), d = await r.json();
    var flat = [];
    function walk(nodes, depth) {
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (depth === 0 && n.name === '蓝图和反应') continue;
        if (depth === 0) { flat.push({id: n.id, name: n.name}); continue; }
        if (n.children) walk(n.children, depth + 1);
      }
    }
    walk(d.roots, 0);
    sel.innerHTML = flat.map(function(f){ return '<option value="'+f.id+'">'+f.name+'</option>'; }).join('');
    sel.onchange = function(){ loadRanking(); };
  } catch(e) { sel.innerHTML = '<option>加载失败</option>'; }
}

async function loadRanking(refresh) {
  var modeEl = document.getElementById('rankMode');
  if (!modeEl) return;
  var mode = modeEl.value, el = document.getElementById('rankContent');
  if (!el) return;
  el.innerHTML = '<div class="loading">正在计算利润排行（首次需逐个查询市价，约 30 秒）...</div>';
  var url;
  if (mode === 'category') {
    var gid = document.getElementById('rankCategory').value;
    if (!gid) { el.innerHTML = '<div class="no-result">请选择分类</div>'; return; }
    url = '/api/ranking/category?group_id=' + gid + (refresh ? '&refresh=true' : '');
  } else {
    url = '/api/ranking/watchlist' + (refresh ? '?refresh=true' : '');
  }
  try {
    var r = await fetch(url, { headers: {'Authorization': 'Bearer '+authToken} });
    var d = await r.json();
    if (!d.ok) { el.innerHTML = '<div class="no-result">'+(d.detail||d.message||'请求失败')+'</div>'; return; }
    if (!d.data || !d.data.length) { el.innerHTML = '<div class="no-result">暂无数据</div>'; return; }
    rankData = d.data;
    renderRankingTable();
  } catch(e) { el.innerHTML = '<div class="no-result">请求失败</div>'; }
}

async function toggleWatch(typeId, name) {
  if (!authToken) { showLogin(); return; }
  var btn = document.getElementById('watchBtn');
  try {
    var r = await fetch('/api/watchlist/add?type_id='+typeId+'&name='+encodeURIComponent(name), { method: 'POST', headers: {'Authorization': 'Bearer '+authToken} });
    var d = await r.json();
    if (d.ok) { btn.textContent = '已关注'; btn.disabled = true; btn.style.opacity = '0.6'; }
  } catch(e) {}
}

async function updateSDE() {
  var el = document.getElementById('rankContent');
  el.innerHTML = '<div class="loading">正在下载最新 SDE...</div>';
  try {
    var r = await fetch('/api/sde/update', { method: 'POST', headers: {'Authorization': 'Bearer '+authToken} });
    var d = await r.json();
    el.innerHTML = '<p>'+(d.ok?'SDE 更新完成':'SDE 更新失败')+'</p>';
    if (d.ok) setTimeout(function(){ location.reload(); }, 1500);
  } catch(e) { el.innerHTML = '<p>请求失败</p>'; }
}
