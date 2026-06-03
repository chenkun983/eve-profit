var authToken = localStorage.getItem('auth_token') || null;
var rankData = [];
var currentProfitTab = 'flip';
var sortField = 'profit';
var sortAsc = false;

async function checkLogin() {
  var el = document.getElementById('loginStatus');
  if (!el) return;
  if (!authToken) { el.textContent = '\u672a\u767b\u5f55'; el.classList.remove('logged-in'); return false; }
  try {
    var r = await fetch('/api/auth/status', { headers: {'Authorization': 'Bearer '+authToken} });
    var d = await r.json();
    if (d.logged_in) {
      el.textContent = d.is_admin ? '\u7ba1\u7406\u5458' : '\u5df2\u767b\u5f55';
      el.classList.add('logged-in');
      window._isAdmin = d.is_admin || false;
      return true;
    }
  } catch(e) {}
  el.textContent = '\u672a\u767b\u5f55'; el.classList.remove('logged-in');
  authToken = null; localStorage.removeItem('auth_token');
  return false;
}

function showLogin() {
  var tk = localStorage.getItem('auth_token');
  if (tk && tk !== 'null' && tk.length > 0) {
    authToken = tk;
    var m = document.getElementById('userMenu');
    if (m) { m.style.display = m.style.display==='block'?'none':'block'; return; }
    showUserMenu(); return;
  }
  document.getElementById('loginModal').style.display = 'flex';
  document.getElementById('loginMsg').textContent = '';
}

function hideLogin() { document.getElementById('loginModal').style.display = 'none'; }

async function doLogin() {
  var u = document.getElementById('loginUser').value, p = document.getElementById('loginPass').value;
  document.getElementById('loginMsg').textContent = '\u767b\u5f55\u4e2d...';
  try {
    var r = await fetch('/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:u,password:p}) });
    var d = await r.json();
    if (d.ok && d.token) { authToken = d.token; localStorage.setItem('auth_token', d.token); document.getElementById('loginMsg').textContent = '\u767b\u5f55\u6210\u529f'; checkLogin(); setTimeout(hideLogin, 800); }
    else { document.getElementById('loginMsg').textContent = '\u9519\u8bef: '+d.message; }
  } catch(e) { document.getElementById('loginMsg').textContent = '\u7f51\u7edc\u9519\u8bef'; }
}

async function doRegister() {
  var u = document.getElementById('loginUser').value, p = document.getElementById('loginPass').value;
  document.getElementById('loginMsg').textContent = '\u6ce8\u518c\u4e2d...';
  try {
    var r = await fetch('/api/auth/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:u,password:p}) });
    var d = await r.json();
    document.getElementById('loginMsg').textContent = d.ok ? '\u6ce8\u518c\u6210\u529f\uff0c\u8bf7\u767b\u5f55' : '\u9519\u8bef: '+d.message;
  } catch(e) { document.getElementById('loginMsg').textContent = '\u7f51\u7edc\u9519\u8bef'; }
}

document.addEventListener('click', function(e) {
  var m = document.getElementById('userMenu');
  var s = document.getElementById('loginStatus');
  if (m && s && !s.contains(e.target) && !m.contains(e.target)) m.style.display = 'none';
});

function showUserMenu() {
  var ex = document.getElementById('userMenu');
  if (ex) { ex.style.display = 'block'; return; }
  var d = document.createElement('div');
  d.id = 'userMenu'; d.className = 'user-menu';
  var items = '<div class="user-menu-item" onclick="showProfile()">\u4e2a\u4eba\u8d44\u6599</div>';
  items += '<div class="user-menu-item" onclick="showChangePwd()">\u4fee\u6539\u5bc6\u7801</div>';
  if (window._isAdmin) items += '<div class="user-menu-item" onclick="showAdmin()">\u7ba1\u7406\u540e\u53f0</div>';
  items += '<div class="user-menu-item" onclick="doLogout()">\u9000\u51fa\u767b\u5f55</div>';
  d.innerHTML = items;
  document.getElementById('loginStatus').parentNode.appendChild(d);
  d.style.display = 'block';
}
function hideUserMenu() { var e = document.getElementById('userMenu'); if (e) e.style.display = 'none'; }
function doLogout() { authToken = null; localStorage.removeItem('auth_token'); hideUserMenu(); checkLogin(); }

function showProfile() {
  hideUserMenu();
  if (!authToken) { showLogin(); return; }
  fetch('/api/profile', { headers: {'Authorization': 'Bearer '+authToken} }).then(function(r){return r.json()}).then(function(d){
    if (!d.ok || !d.profile) return;
    var p = d.profile;
    var o = document.querySelector('.profile-modal'); if (o) o.remove();
    var div = document.createElement('div'); div.className = 'modal profile-modal'; div.style.display = 'flex';
    div.innerHTML = '<div class="modal-content"><div class="modal-header"><h3>\u4e2a\u4eba\u8d44\u6599</h3><button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button></div><div class="modal-body"><p style="margin-bottom:12px;color:#8b949e">\u7528\u6237\u540d: <strong style="color:#c9d1d9">'+p.username+'</strong></p><label style="font-size:12px;color:#8b949e;display:block;margin-bottom:4px">\u90ae\u7bb1</label><input id="profileEmail" class="modal-input" placeholder="\u9009\u586b" value="'+(p.email||'')+'"><div id="profileMsg" class="modal-msg"></div><div class="modal-btns"><button class="btn-primary" onclick="saveProfile()">\u4fdd\u5b58</button></div></div></div>';
    document.body.appendChild(div);
  }).catch(function(){});
}
function saveProfile() {
  var email = document.getElementById('profileEmail').value;
  fetch('/api/profile/update', { method: 'POST', headers: {'Content-Type':'application/json', 'Authorization': 'Bearer '+authToken}, body: JSON.stringify({email: email}) }).then(function(r){return r.json()}).then(function(d){ document.getElementById('profileMsg').textContent = d.ok ? '\u4fdd\u5b58\u6210\u529f' : d.message; });
}

function showChangePwd() {
  hideUserMenu();
  var o = document.querySelector('.pwd-modal'); if (o) o.remove();
  var div = document.createElement('div'); div.className = 'modal pwd-modal'; div.style.display = 'flex';
  div.innerHTML = '<div class="modal-content"><div class="modal-header"><h3>\u4fee\u6539\u5bc6\u7801</h3><button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button></div><div class="modal-body"><input id="pwdOld" class="modal-input" type="password" placeholder="\u539f\u5bc6\u7801"><input id="pwdNew1" class="modal-input" type="password" placeholder="\u65b0\u5bc6\u7801"><input id="pwdNew2" class="modal-input" type="password" placeholder="\u518d\u6b21\u8f93\u5165\u65b0\u5bc6\u7801"><div id="pwdMsg" class="modal-msg"></div><div class="modal-btns"><button class="btn-primary" onclick="doChangePwd()">\u786e\u8ba4\u4fee\u6539</button></div></div></div>';
  document.body.appendChild(div);
}
function doChangePwd() {
  var o = document.getElementById('pwdOld').value;
  var n1 = document.getElementById('pwdNew1').value;
  var n2 = document.getElementById('pwdNew2').value;
  if (n1 !== n2) { document.getElementById('pwdMsg').textContent = '\u4e24\u6b21\u5bc6\u7801\u4e0d\u4e00\u81f4'; return; }
  if (n1.length < 4) { document.getElementById('pwdMsg').textContent = '\u5bc6\u7801\u81f3\u5c114\u4e2a\u5b57\u7b26'; return; }
  fetch('/api/profile/update', { method: 'POST', headers: {'Content-Type':'application/json', 'Authorization': 'Bearer '+authToken}, body: JSON.stringify({old_password: o, new_password: n1}) }).then(function(r){return r.json()}).then(function(d){ document.getElementById('pwdMsg').textContent = d.ok ? '\u5bc6\u7801\u4fee\u6539\u6210\u529f' : d.message; });
}

function showAdmin() {
  hideUserMenu();
  // 切到排行标签页（隐藏其他页面）
  switchTab('ranking');
  var area = document.getElementById('pageRanking');
  area.style.display = 'block';
  area.innerHTML = '<h3 style="margin-bottom:12px">\u7ba1\u7406\u540e\u53f0</h3><div class="loading">\u52a0\u8f7d\u4e2d...</div>';
  fetch('/api/admin/users', { headers: {'Authorization': 'Bearer '+authToken} }).then(function(r){return r.json()}).then(function(d){
    if (!d.ok) { area.innerHTML = '<div class="no-result">\u65e0\u6743\u9650</div>'; return; }
    var h = '<div id="sdeInfo" style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:12px;margin-bottom:16px"><div class="loading">加载 SDE 信息...</div></div>'+
      '<h4 style="margin-bottom:8px">会员管理</h4><div style="overflow-x:auto"><table class="ranking-table"><thead><tr><th>ID</th><th>用户名</th><th>邮箱</th><th>管理员</th><th>注册时间</th></tr></thead><tbody>';
    for (var i = 0; i < d.users.length; i++) { var u = d.users[i]; 
      var regTime = u.created_at;
      if (regTime) { try { var dt = new Date(regTime.replace(' ','T')+'Z'); dt.setHours(dt.getHours()+8); regTime = dt.toISOString().replace('T',' ').substring(0,19); } catch(e) {} }
      h += '<tr><td>'+u.id+'</td><td>'+u.username+'</td><td>'+(u.email||'-')+'</td><td>'+(u.is_admin?'是':'<span class="watch-btn-sm" onclick="setAdmin('+u.id+')">设为管理员</span>')+'</td><td>'+regTime+'</td></tr>'; }
    h += '</tbody></table></div>';
    area.innerHTML = h;
    // 加载 SDE 版本信息
    fetch('/api/admin/sde-info', { headers: {'Authorization': 'Bearer '+authToken} }).then(function(r){return r.json()}).then(function(d){
      var el = document.getElementById('sdeInfo');
      if (!el || !d.ok) return;
      var c = d.current || {};
      el.innerHTML = '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">'+
        '<div><strong>SDE 当前版本</strong><br><span style="color:#8b949e;font-size:13px">'+c.size_mb+'MB | '+c.blueprints+' 个蓝图 | '+c.items+' 个物品</span></div>'+
        '<div><strong>GitHub 最新</strong><br><span style="color:#8b949e;font-size:13px">'+d.latest_version+'</span></div></div>';
      if (d.current && d.latest_version && d.current.version !== d.latest_version) {
        el.innerHTML += '<div style="margin-top:8px"><button class="save-overrides-btn" onclick="updateSDE()">更新 SDE</button></div>';
      }
    });
  });
}

function showRanking() {
  if (!authToken) { showLogin(); return; }
  var area = document.getElementById('pageRanking');
  if (!area) return;
  area.innerHTML = '<div class="ranking-page"><h3>\u5229\u6da6\u6392\u884c</h3><div class="ranking-header"><select id="rankMode" class="rank-select" onchange="onRankModeChange()"><option value="watchlist">\u6211\u7684\u5173\u6ce8</option><option value="category">\u6309\u5206\u7c7b\u626b\u63cf</option></select><span id="rankCategoryWrap" style="display:none"><select id="rankCategory" class="rank-select"></select></span><span id="discountWrap" style="display:none;margin-left:8px">\u6279\u53d1\u6298\u6263 <select id="discountSel" class="rank-select" onchange="loadRanking()"><option value="1.0">100%</option><option value="0.95">95%</option><option value="0.9" selected>90%</option><option value="0.85">85%</option><option value="0.8">80%</option></select><button class="save-overrides-btn" onclick="saveDiscount()" style="margin-left:6px">\u4fdd\u5b58</button></span></div><div class="profit-tabs"><button class="profit-tab active" onclick="switchProfitTab(event,\'flip\')">\u5012\u5356\u5229\u6da6</button><button class="profit-tab" onclick="switchProfitTab(event,\'realistic\')">\u84dd\u56fe\u96f6\u552e</button><button class="profit-tab" onclick="switchProfitTab(event,\'ideal\')">\u57fa\u7840\u96f6\u552e</button><button class="profit-tab" onclick="switchProfitTab(event,\'conservative\')">\u6536\u5355</button><button class="profit-tab" onclick="switchProfitTab(event,\'wholesale_bp\')">\u84dd\u56fe\u6279\u53d1</button><button class="profit-tab" onclick="switchProfitTab(event,\'wholesale_bm\')">\u57fa\u7840\u6279\u53d1</button></div><div id="rankContent"><div class="loading">\u52a0\u8f7d\u4e2d...</div></div></div>';
  setTimeout(function(){ loadRanking(); }, 100);
  setTimeout(function(){ if (typeof loadDiscount === 'function') loadDiscount(); }, 200);
}

function switchProfitTab(ev, tab) {
  currentProfitTab = tab;
  var btns = document.querySelectorAll('.profit-tab');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
  ev.target.classList.add('active');
  // 批发利润标签时显示折扣下拉
  var dw = document.getElementById('discountWrap');
  if (dw) dw.style.display = (tab.indexOf('wholesale') === 0 && document.getElementById('rankMode').value === 'watchlist') ? 'inline-block' : 'none';
  renderRankingTable();
}

function toggleSort(field) {
  if (sortField === field) sortAsc = !sortAsc;
  else { sortField = field; sortAsc = false; }
  renderRankingTable();
}

function renderRankingTable() {
  var el = document.getElementById('rankContent');
  if (!el || !rankData.length) { el.innerHTML = '<div class="no-result">\u6682\u65e0\u6570\u636e</div>'; return; }
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
  var html = '<div style="font-size:12px;color:#484f58;margin-bottom:8px">共 '+rankData.length+' 件</div><div style="overflow-x:auto"><table class="ranking-table"><thead><tr><th>#</th><th>物品</th><th class="text-right">售价</th><th class="text-right">成本价</th><th class="text-right" onclick="toggleSort(\'profit\')" style="cursor:pointer">利润 '+(sortField==='profit'?(sortAsc?'▲':'▼'):'')+'</th><th class="text-right" onclick="toggleSort(\'margin\')" style="cursor:pointer">利润率 '+(sortField==='margin'?(sortAsc?'▲':'▼'):'')+'</th>'+(currentProfitTab==='flip'?'':'<th class="text-right">24h利润</th>')+'<th>类型</th><th></th></tr></thead><tbody>';
  for (var i = 0; i < data.length; i++) {
    var item = data[i].item, profit = data[i].profit, margin = data[i].margin;
    var pc = profit > 0 ? 'positive' : (profit < 0 ? 'negative' : '');
    var pro24 = (currentProfitTab !== 'flip' && item[currentProfitTab]) ? item[currentProfitTab].profit_24h||0 : 0;
    var sellPrice = 0, costPrice = 0;
    if (currentProfitTab === 'flip') { sellPrice = item.flip_sell_price||0; costPrice = item.flip_cost_price||0; }
    else if (item[currentProfitTab]) { sellPrice = item[currentProfitTab].sell_price||0; costPrice = item[currentProfitTab].cost_price||0; }
    var mEl = document.getElementById('rankMode');
    var isWL = mEl && mEl.value === 'watchlist';
    var isWS = currentProfitTab.indexOf('wholesale') === 0;
    var name = item.name.replace(/'/g, "\\'");
    html += '<tr onclick="selectItem('+item.type_id+',\''+name+'\')" style="cursor:pointer"><td><span class="rank-num">'+(i+1)+'</span></td><td>'+item.name.replace(/\\"/g,'"')+'</td><td class="text-right">'+fmt(sellPrice)+'</td><td class="text-right">'+fmt(costPrice)+'</td><td class="text-right '+pc+'">'+fmt(profit)+'</td><td class="text-right '+pc+'">'+margin.toFixed(1)+'%</td>'+(currentProfitTab==='flip'?'':'<td class="text-right '+pc+'">'+fmt(pro24)+'</td>')+'<td style="font-size:11px;color:#8b949e">'+(item.has_blueprint?'制造':'倒卖')+'</td>'+
      (isWL && isWS ? '<td style="text-align:center"><span class="unwatch-btn" onclick="event.stopPropagation();unwatchItem('+item.type_id+')">x</span></td>' :
      (isWL ? '<td style="text-align:center"><span class="unwatch-btn" onclick="event.stopPropagation();unwatchItem('+item.type_id+')">x</span></td>' :
       '<td style="text-align:center"><span class="watch-btn-sm" onclick="event.stopPropagation();watchFromRanking('+item.type_id+',\''+item.name.replace(/'/g,"\\'")+'\')">+ 关注</span></td>'))+
      '</tr>';
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
        if (depth === 0 && n.name === '\u84dd\u56fe\u548c\u53cd\u5e94') continue;
        if (depth === 0) { flat.push({id: n.id, name: n.name}); continue; }
        if (n.children) walk(n.children, depth + 1);
      }
    }
    walk(d.roots, 0);
    sel.innerHTML = '<option value="">-- \u8bf7\u9009\u62e9\u5206\u7c7b --</option>' + flat.map(function(f){ return '<option value="'+f.id+'">'+f.name+'</option>'; }).join('');
    sel.onchange = function(){ if (sel.value) loadRanking(); };
  } catch(e) { sel.innerHTML = '<option>\u52a0\u8f7d\u5931\u8d25</option>'; }
}

async function loadRanking(refresh) {
  var modeEl = document.getElementById('rankMode');
  if (!modeEl) return;
  var mode = modeEl.value, el = document.getElementById('rankContent');
  if (!el) return;
  el.innerHTML = '<div class="loading">\u6b63\u5728\u8ba1\u7b97\u5229\u6da6\u6392\u884c...</div>';
  var url;
  if (mode === 'category') {
    var gid = document.getElementById('rankCategory').value;
    if (!gid) { el.innerHTML = '<div class="no-result">\u8bf7\u9009\u62e9\u5206\u7c7b</div>'; return; }
    url = '/api/ranking/category?group_id=' + gid;
  } else {
    url = '/api/ranking/watchlist?discount=' + (document.getElementById('discountSel') ? document.getElementById('discountSel').value : 0.9);
  }
  try {
    var r = await fetch(url, { headers: {'Authorization': 'Bearer '+authToken} });
    var d = await r.json();
    if (!d.ok) { el.innerHTML = '<div class="no-result">'+(d.detail||d.message||'\u8bf7\u6c42\u5931\u8d25')+'</div>'; return; }
    if (!d.data || !d.data.length) { el.innerHTML = '<div class="no-result">\u6682\u65e0\u6570\u636e</div>'; return; }
    rankData = d.data;
    renderRankingTable();
  } catch(e) { el.innerHTML = '<div class="no-result">\u8bf7\u6c42\u5931\u8d25</div>'; }
}

async function toggleWatch(typeId, name) {
  if (!authToken) { showLogin(); return; }
  try {
    var r = await fetch('/api/watchlist/add?type_id='+typeId+'&name='+encodeURIComponent(name), { method: 'POST', headers: {'Authorization': 'Bearer '+authToken} });
    var d = await r.json();
    if (d.ok) { var btn = document.getElementById('watchBtn'); if (btn) { btn.textContent = '\u5df2\u5173\u6ce8'; btn.disabled = true; btn.style.opacity = '0.6'; } }
  } catch(e) {}
}

async function unwatchItem(typeId) {
  try { var r = await fetch('/api/watchlist/remove?type_id='+typeId, { method: 'POST', headers: {'Authorization': 'Bearer '+authToken} }); var d = await r.json(); if (d.ok) loadRanking(); } catch(e) {}
}

async function watchFromRanking(typeId, name) {
  try { var r = await fetch('/api/watchlist/add?type_id='+typeId+'&name='+encodeURIComponent(name), { method: 'POST', headers: {'Authorization': 'Bearer '+authToken} }); var d = await r.json(); if (d.ok) loadRanking(true); } catch(e) {}
}

async function saveDiscount() {
  var sel = document.getElementById('discountSel');
  if (!sel) return;
  try { await fetch('/api/save-setting?key=wholesale_discount&value='+sel.value, { method: 'POST', headers: {'Authorization': 'Bearer '+authToken} }); alert('\u4fdd\u5b58\u6210\u529f'); } catch(e) {}
}

async function loadDiscount() {
  try {
    var r = await fetch('/api/load-setting?key=wholesale_discount&default=0.9', { headers: {'Authorization': 'Bearer '+authToken} });
    var d = await r.json();
    if (d.ok && d.value) {
      var sel = document.getElementById('discountSel');
      if (sel) { sel.value = d.value; loadRanking(); }
    }
  } catch(e) {}
}

async function updateSDE() {
  var el = document.getElementById('rankContent') || document.getElementById('sdeInfo');
  if (!el) return;
  el.innerHTML = '<div class="loading">正在下载最新 SDE（需几分钟）...</div>';
  try { var r = await fetch('/api/sde/update', { method: 'POST', headers: {'Authorization': 'Bearer '+authToken} }); var d = await r.json(); el.innerHTML = '<p>'+(d.ok?'SDE \u66f4\u65b0\u5b8c\u6210':'SDE \u66f4\u65b0\u5931\u8d25')+'</p>'; if (d.ok) setTimeout(function(){ location.reload(); }, 1500); } catch(e) { el.innerHTML = '<p>\u8bf7\u6c42\u5931\u8d25</p>'; }
}
