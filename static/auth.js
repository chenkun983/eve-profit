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
      el.textContent = d.username || (d.is_admin ? '管理员' : '已登录');
      el.title = d.is_admin ? '管理员' : (d.role === 'manufacturer' ? '制造商' : '已登录');
      el.classList.add('logged-in');
      window._isAdmin = d.is_admin || false;
      window._userRole = d.role || 'user';
      window._manufacturerExpires = d.manufacturer_expires_at || null;
      // 缓存关注列表
      if (d.role === 'manufacturer' || d.role === 'admin' || d.role === 'super_admin') {
        fetch('/api/watchlist', { headers: {'Authorization': 'Bearer '+authToken} }).then(function(r){return r.json()}).then(function(d2){
          if (d2.items) window._watchlist = d2.items || [];
        });
      }
      updateNavTabs();
      return true;
    }
  } catch(e) {}
  el.textContent = '未登录'; el.classList.remove('logged-in');
  authToken = null; localStorage.removeItem('auth_token');
  window._isAdmin = false; window._userRole = 'guest';
  updateNavTabs();
  return false;
}

function updateNavTabs() {
  var role = window._userRole || 'guest';
  var rankingTab = document.getElementById('tabRanking');
  var indTab = document.getElementById('tabIndustry');
  // 制造商/管理员可见排行
  var showFull = (role === 'manufacturer' || role === 'admin' || role === 'super_admin');
  if (rankingTab) rankingTab.style.display = showFull ? '' : 'none';
  if (indTab) indTab.style.display = (role === 'manufacturer' || role === 'admin' || role === 'super_admin') ? '' : 'none';
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
  document.getElementById('loginMsg').textContent = '登录中...';
  try {
    var r = await fetch('/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:u,password:p}) });
    var d = await r.json();
    if (d.ok && d.token) { authToken = d.token; localStorage.setItem('auth_token', d.token); document.getElementById('loginMsg').textContent = '登录成功'; checkLogin(); setTimeout(hideLogin, 800); }
    else { document.getElementById('loginMsg').textContent = '错误: '+d.message; }
  } catch(e) { document.getElementById('loginMsg').textContent = '网络错误'; }
}

function showRegister() {
  document.getElementById('registerModal').style.display = 'flex';
  document.getElementById('regMsg').textContent = '';
}
function hideRegister() { document.getElementById('registerModal').style.display = 'none'; }

async function doRegister() {
  var u = document.getElementById('regUser').value, p1 = document.getElementById('regPass1').value, p2 = document.getElementById('regPass2').value;
  if (p1 !== p2) { document.getElementById('regMsg').textContent = '两次密码不一致'; return; }
  if (u.length < 2) { document.getElementById('regMsg').textContent = '用户名至少2个字符'; return; }
  if (p1.length < 4) { document.getElementById('regMsg').textContent = '密码至少4个字符'; return; }
  document.getElementById('regMsg').textContent = '注册中...';
  try {
    var r = await fetch('/api/auth/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:u,password:p1}) });
    var d = await r.json();
    document.getElementById('regMsg').textContent = d.ok ? '注册成功，请登录' : d.message;
    if (d.ok) setTimeout(function(){ hideRegister(); showLogin(); }, 1500);
  } catch(e) { document.getElementById('regMsg').textContent = '网络错误'; }
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
  var items = '<div class="user-menu-item" id="msgMenuItem" onclick="showMsgModal()">站内消息<span id="msgBadge" style="display:none;color:#da3633;margin-left:4px"></span></div><div class="user-menu-item" onclick="showProfile()">个人资料</div>';
  var r = window._userRole || 'guest';
  if (r !== 'super_admin' && r !== 'admin') {
    var isPermanent = (r === 'manufacturer' && !window._manufacturerExpires);
    if (!isPermanent) {
      items += '<div class="user-menu-item" onclick="showAppModal()">'+(r === 'manufacturer' ? '续费制造商' : '申请成为制造商')+'</div>';
    }
  }
  items += '<div class="user-menu-item" onclick="showChangePwd()">修改密码</div>';
  if (window._isAdmin) items += '<div class="user-menu-item" onclick="showAdmin()">管理后台</div>';
  items += '<div class="user-menu-item" onclick="doLogout()">退出登录</div>';
  d.innerHTML = items;
  document.getElementById('loginStatus').parentNode.appendChild(d);
  d.style.display = 'block';
  // 加载未读数
  if (authToken) {
    fetch('/api/messages/unread-count', { headers: {'Authorization': 'Bearer '+authToken} }).then(function(r){return r.json()}).then(function(d2){
      if (d2.ok && d2.count > 0) {
        var badge = document.getElementById('msgBadge');
        if (badge) { badge.textContent = '('+d2.count+')'; badge.style.display = ''; }
      }
    });
  }
}
function hideUserMenu() { var e = document.getElementById('userMenu'); if (e) e.style.display = 'none'; }
function doLogout() { authToken = null; localStorage.removeItem('auth_token'); hideUserMenu(); location.reload(); }

function showProfile() {
  hideUserMenu();
  if (!authToken) { showLogin(); return; }
  fetch('/api/profile', { headers: {'Authorization': 'Bearer '+authToken} }).then(function(r){return r.json()}).then(function(d){
    if (!d.ok || !d.profile) return;
    var p = d.profile;
    var o = document.querySelector('.profile-modal'); if (o) o.remove();
    var div = document.createElement('div'); div.className = 'modal profile-modal'; div.style.display = 'flex';
    div.innerHTML = '<div class="modal-content"><div class="modal-header"><h3>个人资料</h3><button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button></div><div class="modal-body"><p style="margin-bottom:8px;color:#8b949e">用户名: <strong style="color:#c9d1d9">'+p.username+'</strong></p>'+
      '<p style="margin-bottom:8px;color:#8b949e">角色: <strong style="color:'+(p.role==='manufacturer'?'#3fb950':(p.role==='admin'||p.role==='super_admin'?'#58a6ff':'#c9d1d9'))+'">'+
      ({'super_admin':'超级管理员','admin':'管理员','manufacturer':'制造商','user':'普通用户'}[p.role]||p.role||'未知')+'</strong>'+
      (p.role==='manufacturer'?' <span style="color:#8b949e;font-size:12px">'+(p.manufacturer_expires_at?'到期: '+p.manufacturer_expires_at:'永久')+'</span>':'')+
      '</p>'+
      '<label style="font-size:12px;color:#8b949e;display:block;margin-bottom:4px">邮箱</label><input id="profileEmail" class="modal-input" placeholder="选填" value="'+(p.email||'')+'">'+
      '<div id="profileMsg" class="modal-msg"></div>'+
      '<div class="modal-btns"><button class="btn-primary" onclick="saveProfile()">保存</button></div></div></div>';
    document.body.appendChild(div);
  }).catch(function(){});
}
function saveProfile() {
  var email = document.getElementById('profileEmail').value;
  fetch('/api/profile/update', { method: 'POST', headers: {'Content-Type':'application/json', 'Authorization': 'Bearer '+authToken}, body: JSON.stringify({email: email}) }).then(function(r){return r.json()}).then(function(d){ document.getElementById('profileMsg').textContent = d.ok ? '保存成功' : d.message; });
}

function showChangePwd() {
  hideUserMenu();
  var o = document.querySelector('.pwd-modal'); if (o) o.remove();
  var div = document.createElement('div'); div.className = 'modal pwd-modal'; div.style.display = 'flex';
  div.innerHTML = '<div class="modal-content"><div class="modal-header"><h3>修改密码</h3><button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button></div><div class="modal-body"><input id="pwdOld" class="modal-input" type="password" placeholder="原密码"><input id="pwdNew1" class="modal-input" type="password" placeholder="新密码"><input id="pwdNew2" class="modal-input" type="password" placeholder="再次输入新密码"><div id="pwdMsg" class="modal-msg"></div><div class="modal-btns"><button class="btn-primary" onclick="doChangePwd()">确认修改</button></div></div></div>';
  document.body.appendChild(div);
}
function doChangePwd() {
  var o = document.getElementById('pwdOld').value;
  var n1 = document.getElementById('pwdNew1').value;
  var n2 = document.getElementById('pwdNew2').value;
  if (n1 !== n2) { document.getElementById('pwdMsg').textContent = '两次密码不一致'; return; }
  if (n1.length < 4) { document.getElementById('pwdMsg').textContent = '密码至少4个字符'; return; }
  fetch('/api/profile/update', { method: 'POST', headers: {'Content-Type':'application/json', 'Authorization': 'Bearer '+authToken}, body: JSON.stringify({old_password: o, new_password: n1}) }).then(function(r){return r.json()}).then(function(d){ document.getElementById('pwdMsg').textContent = d.ok ? '密码修改成功' : d.message; });
}

function showAdmin() {
  hideUserMenu();
  var old = document.querySelector('.admin-modal');
  if (old) old.remove();
  var div = document.createElement('div');
  div.className = 'modal admin-modal';
  div.style.display = 'flex';
  div.innerHTML = '<div class="modal-content" style="width:700px;max-width:95vw;max-height:80vh;overflow-y:auto"><div class="modal-header"><h3>管理后台</h3><button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button></div><div class="modal-body" id="adminBody"><div class="loading">加载中...</div></div></div>';
  document.body.appendChild(div);
  loadAdminData();
}

function loadAdminData() {
  fetch('/api/admin/users', { headers: {'Authorization': 'Bearer '+authToken} }).then(function(r){return r.json()}).then(function(d){
    var body = document.getElementById('adminBody');
    if (!body) return;
    if (!d.ok) { body.innerHTML = '<div class="no-result">无权限</div>'; return; }
    var h = '<div id="sdeInfo" style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:12px;margin-bottom:16px"><div class="loading">加载 SDE 信息...</div></div>'+
      '<div id="visitStats" style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:12px;margin-bottom:16px"><div class="loading">加载访问统计...</div></div>'+
      '<h4 style="margin-bottom:8px">会员管理</h4><div style="overflow-x:auto"><table class="ranking-table"><thead><tr><th>ID</th><th>用户名</th><th>邮箱</th><th>角色</th><th>到期时间</th><th>操作</th><th>注册时间</th></tr></thead><tbody>';
    for (var i = 0; i < d.users.length; i++) { var u = d.users[i];
      var roleMap = {'super_admin':'超级管理员','admin':'管理员','manufacturer':'制造商','user':'普通用户'};
      var roleOrder = {'super_admin':0, 'admin':1, 'manufacturer':2, 'user':3};
      // 按角色排序
      d.users.sort(function(a,b){ return (roleOrder[a.role]||9) - (roleOrder[b.role]||9); });
      var h = '<div id="sdeInfo" style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:12px;margin-bottom:16px"><div class="loading">加载 SDE 信息...</div></div>'+
      '<div id="visitStats" style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:12px;margin-bottom:16px"><div class="loading">加载访问统计...</div></div>'+
      '<div id="paymentSetting" style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:12px;margin-bottom:16px"><div class="loading">加载设置...</div></div>'+
      '<div id="sdeCache" style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:12px;margin-bottom:16px"><div class="loading">原料缓存...</div></div>'+
      '<h4 style="margin-bottom:8px">会员管理</h4>'+
      '<div style="margin-bottom:10px"><input id="userSearch" type="text" placeholder="搜索用户名..." oninput="filterUsers()" style="padding:8px 12px;border:1px solid #30363d;border-radius:6px;background:#0d1117;color:#c9d1d9;width:280px;font-size:14px"></div>'+
      '<div style="overflow-x:auto"><table class="ranking-table" id="adminUserTable"><thead><tr><th>ID</th><th>用户名</th><th>邮箱</th><th>角色</th><th>到期时间</th><th>操作</th><th>注册时间</th></tr></thead><tbody>';
      for (var i = 0; i < d.users.length; i++) { var u = d.users[i];
        var roleName = roleMap[u.role] || u.role || '未知';
        var t = u.created_at;
        if (t) { try { var dt = new Date(t.replace(' ','T')+'Z'); dt.setHours(dt.getHours()+8); t = dt.toISOString().replace('T',' ').substring(0,19); } catch(e) {} }
        var expires = u.manufacturer_expires_at || '';
        var expiresDisplay = '—';
        if (expires) {
          try { var dt2 = new Date(expires.replace(' ','T')+'Z'); dt2.setHours(dt2.getHours()+8); expiresDisplay = dt2.toISOString().replace('T',' ').substring(0,19); } catch(e) { expiresDisplay = expires; }
        } else if (u.role === 'manufacturer') {
          expiresDisplay = '永久';
        }
        var isSuper = window._userRole === 'super_admin';
        var actions = '';
        if (u.role === 'user') {
          actions = '<span class="watch-btn-sm" onclick="setManufacturer('+u.id+')">设为制造商</span>';
          if (isSuper) actions += ' <span class="watch-btn-sm" onclick="changeRole('+u.id+',\'admin\')">设为管理员</span>';
        } else if (u.role === 'manufacturer') {
          actions = '<span class="watch-btn-sm" onclick="setManufacturer('+u.id+')">续期</span> <span class="watch-btn-sm" style="background:#da3633" onclick="if(confirm(\'确认取消制造商资格？\'))changeRole('+u.id+',\'user\')">取消制造商</span>';
          if (isSuper) actions += ' <span class="watch-btn-sm" onclick="changeRole('+u.id+',\'admin\')">设为管理员</span>';
        } else if (u.role === 'admin') {
          if (isSuper) actions = '<span class="watch-btn-sm" onclick="changeRole('+u.id+',\'manufacturer\',30)">设为制造商</span> <span class="watch-btn-sm" style="background:#da3633" onclick="if(confirm(\'确认取消管理员资格？\'))changeRole('+u.id+',\'user\')">取消管理员</span>';
          else actions = '—';
        } else if (u.role === 'super_admin') {
          actions = '<span style="color:#58a6ff">不可操作</span>';
        }
        h += '<tr class="user-row" data-username="'+u.username.toLowerCase()+'"><td>'+u.id+'</td><td>'+u.username+'</td><td>'+(u.email||'-')+'</td><td>'+roleName+'</td><td>'+(expiresDisplay||'—')+'</td><td>'+actions+'</td><td>'+t+'</td></tr>';
      }
    }
    h += '</tbody></table></div>';
    body.innerHTML = h;
    fetch('/api/admin/sde-info', { headers: {'Authorization': 'Bearer '+authToken} }).then(function(r){return r.json()}).then(function(d2){
      var el = document.getElementById('sdeInfo');
      if (!el || !d2.ok) return;
      var c = d2.current || {};
      el.innerHTML = '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">'+
        '<div><strong>SDE 当前版本</strong><br><span style="color:#8b949e;font-size:13px">'+c.size_mb+'MB | '+c.blueprints+' 个蓝图 | '+c.items+' 个物品</span></div>'+
        '<div><strong>GitHub 最新</strong><br><span style="color:#8b949e;font-size:13px">'+d2.latest_version+'</span></div></div>';
    });
    fetch('/api/admin/visit-stats', { headers: {'Authorization': 'Bearer '+authToken} }).then(function(r){return r.json()}).then(function(d){
      var el = document.getElementById('visitStats');
      if (!el || !d.ok) return;
      var s = d.stats || {};
      el.innerHTML = '<div style="display:flex;gap:16px;flex-wrap:wrap">'+
        '<div><strong>24小时</strong><br><span style="color:#8b949e;font-size:13px">访问 '+s['24h'].total+' 次 | IP '+s['24h'].unique+' 个</span></div>'+
        '<div><strong>7天</strong><br><span style="color:#8b949e;font-size:13px">访问 '+s['7d'].total+' 次 | IP '+s['7d'].unique+' 个</span></div>'+
        '<div><strong>30天</strong><br><span style="color:#8b949e;font-size:13px">访问 '+s['30d'].total+' 次 | IP '+s['30d'].unique+' 个</span></div></div>';
    });
    // 加载收款人设置
    fetch('/api/admin/settings', { headers: {'Authorization': 'Bearer '+authToken} }).then(function(r){return r.json()}).then(function(d){
      var el = document.getElementById('paymentSetting');
      if (!el || !d.ok) return;
      el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'+
        '<div><strong>游戏收款人</strong><br><span id="recipientDisplay" style="color:#8b949e;font-size:13px">'+(d.payment_recipient||'未设置')+'</span></div>'+
        '<div><input id="recipientInput" type="text" placeholder="新收款人角色名" value="'+(d.payment_recipient==='未设置'?'':d.payment_recipient)+'" style="padding:6px 10px;border:1px solid #30363d;border-radius:6px;background:#0d1117;color:#c9d1d9;width:180px;font-size:13px"> '+
        '<button class="watch-btn-sm" onclick="saveRecipient()">保存</button></div></div>';
    });
    // 原料缓存状态
    var el2 = document.getElementById('sdeCache');
    if (el2) {
      el2.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'+
        '<div><strong>制造原料缓存</strong><br><span style="color:#8b949e;font-size:13px">点击重建以支持工业管理系统</span></div>'+
        '<div><button class="watch-btn-sm" onclick="rebuildMaterialCache()">重建缓存</button></div></div>';
    }
  });
}

function showRanking() {
  if (!authToken) { showLogin(); return; }
  var area = document.getElementById('pageRanking');
  if (!area) return;
  area.innerHTML = '<div class="ranking-page"><h3>利润排行</h3><div class="ranking-header"><select id="rankMode" class="rank-select" onchange="onRankModeChange()"><option value="watchlist">我的关注</option><option value="category">按分类扫描</option></select><span id="rankCategoryWrap" style="display:none"><select id="rankCategory" class="rank-select"></select></span><span id="discountWrap" style="display:none;margin-left:8px">批发折扣 <select id="discountSel" class="rank-select" onchange="loadRanking()"><option value="1.0">100%</option><option value="0.95">95%</option><option value="0.9" selected>90%</option><option value="0.85">85%</option><option value="0.8">80%</option></select><button class="save-overrides-btn" onclick="saveDiscount()" style="margin-left:6px">保存</button></span></div><div class="profit-tabs"><button class="profit-tab active" onclick="switchProfitTab(event,\'flip\')">倒卖利润</button><button class="profit-tab" onclick="switchProfitTab(event,\'realistic\')">蓝图零售</button><button class="profit-tab" onclick="switchProfitTab(event,\'ideal\')">基础零售</button><button class="profit-tab" onclick="switchProfitTab(event,\'conservative\')">收单</button><button class="profit-tab" onclick="switchProfitTab(event,\'wholesale_bp\')">蓝图批发</button><button class="profit-tab" onclick="switchProfitTab(event,\'wholesale_bm\')">基础批发</button></div><div id="rankContent"><div class="loading">加载中...</div></div></div>';
  setTimeout(function(){ loadRanking(); }, 100);
  setTimeout(function(){ if (typeof loadDiscount === 'function') loadDiscount(); }, 200);
}

function switchProfitTab(ev, tab) {
  currentProfitTab = tab;
  var btns = document.querySelectorAll('.profit-tab');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
  ev.target.classList.add('active');
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
    var name = item.name.replace(/'/g, "\\'");
    html += '<tr onclick="selectItem('+item.type_id+',\''+name+'\')" style="cursor:pointer"><td><span class="rank-num">'+(i+1)+'</span></td><td>'+item.name.replace(/\\"/g,'"')+'</td><td class="text-right">'+fmt(sellPrice)+'</td><td class="text-right">'+fmt(costPrice)+'</td><td class="text-right '+pc+'">'+fmt(profit)+'</td><td class="text-right '+pc+'">'+margin.toFixed(1)+'%</td>'+(currentProfitTab==='flip'?'':'<td class="text-right '+pc+'">'+fmt(pro24)+'</td>')+'<td style="font-size:11px;color:#8b949e">'+(item.has_blueprint?'制造':'倒卖')+'</td>'+(isWL?'<td style="text-align:center"><span class="unwatch-btn" onclick="event.stopPropagation();unwatchItem('+item.type_id+')">x</span></td>':'<td style="text-align:center"><span class="watch-btn-sm" onclick="event.stopPropagation();watchFromRanking('+item.type_id+',\''+item.name.replace(/'/g,"\\'")+'\')">+ 关注</span></td>')+'</tr>';
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
    sel.innerHTML = '<option value="">-- 请选择分类 --</option>' + flat.map(function(f){ return '<option value="'+f.id+'">'+f.name+'</option>'; }).join('');
    sel.onchange = function(){ if (sel.value) loadRanking(); };
  } catch(e) { sel.innerHTML = '<option>加载失败</option>'; }
}

async function loadRanking(refresh) {
  var modeEl = document.getElementById('rankMode');
  if (!modeEl) return;
  var mode = modeEl.value, el = document.getElementById('rankContent');
  if (!el) return;
  el.innerHTML = '<div class="loading">正在计算利润排行...</div>';
  var url;
  if (mode === 'category') {
    var gid = document.getElementById('rankCategory').value;
    if (!gid) { el.innerHTML = '<div class="no-result">请选择分类</div>'; return; }
    url = '/api/ranking/category?group_id=' + gid;
  } else {
    url = '/api/ranking/watchlist?discount=' + (document.getElementById('discountSel') ? document.getElementById('discountSel').value : 0.9);
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
  if (!authToken && !window.authToken) { if (typeof showLogin==='function') showLogin(); return; }
  var tk = authToken || window.authToken;
  // 先检查是否已关注
  try {
    var r = await fetch('/api/watchlist', { headers: {'Authorization': 'Bearer '+tk} });
    var d = await r.json();
    if (d.ok && d.items) {
      for (var i = 0; i < d.items.length; i++) {
        if (d.items[i].type_id === typeId) {
          alert('已在关注列表中');
          var btn = document.getElementById('watchBtn');
          if (btn) { btn.textContent = '已关注'; btn.disabled = true; btn.style.opacity = '0.6'; }
          return;
        }
      }
    }
  } catch(e) {}
  // 添加关注
  try {
    var r = await fetch('/api/watchlist/add?type_id='+typeId+'&name='+encodeURIComponent(name), { method: 'POST', headers: {'Authorization': 'Bearer '+tk} });
    var d = await r.json();
    if (d.ok) { var btn = document.getElementById('watchBtn'); if (btn) { btn.textContent = '已关注'; btn.disabled = true; btn.style.opacity = '0.6'; } }
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
  try { await fetch('/api/save-setting?key=wholesale_discount&value='+sel.value, { method: 'POST', headers: {'Authorization': 'Bearer '+authToken} }); alert('保存成功'); } catch(e) {}
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
  try { var r = await fetch('/api/sde/update', { method: 'POST', headers: {'Authorization': 'Bearer '+authToken} }); var d = await r.json(); el.innerHTML = '<p>'+(d.ok?'SDE 更新完成':'SDE 更新失败')+'</p>'; if (d.ok) setTimeout(function(){ location.reload(); }, 1500); } catch(e) { el.innerHTML = '<p>请求失败</p>'; }
}

async function changeRole(uid, role, days) {
  try { var r = await fetch('/api/admin/set-role?user_id='+uid+'&role='+role+(days !== undefined && days !== null ? '&days='+days : ''), { method: 'POST', headers: {'Authorization': 'Bearer '+authToken} }); var d = await r.json(); if (d.ok) loadAdminData(); else alert(d.message); } catch(e) { alert('网络错误'); }
}

async function checkWatchStatus(typeId) {
  try {
    var r = await fetch('/api/watchlist', { headers: {'Authorization': 'Bearer '+authToken} });
    var d = await r.json();
    if (!d.items) return;
    for (var i = 0; i < d.items.length; i++) {
      if (d.items[i].type_id === typeId) {
        var btn = document.getElementById('watchBtn');
        if (btn) { btn.textContent = '已关注'; btn.disabled = true; btn.style.opacity = '0.6'; }
        break;
      }
    }
  } catch(e) {}
}

function setManufacturer(uid) {
  var days = prompt('设置制造商有效天数（1-365），留空或输入0设为永久：', '30');
  if (days === null) return;
  if (days.trim() === '' || days.trim() === '0') {
    changeRole(uid, 'manufacturer', 0);
    return;
  }
  days = parseInt(days);
  if (isNaN(days) || days < 1 || days > 365) { alert('请输入1-365之间的天数，或留空/输入0设为永久'); return; }
  changeRole(uid, 'manufacturer', days);
}

async function setAdmin(uid) {
  try { var r = await fetch('/api/admin/set-admin?user_id='+uid+'&is_admin=true', { method: 'POST', headers: {'Authorization': 'Bearer '+authToken} }); var d = await r.json(); if (d.ok) { var body = document.getElementById('adminBody'); if (body) loadAdminData(); } } catch(e) {}
}

function filterUsers() {
  var q = (document.getElementById('userSearch').value || '').toLowerCase();
  var rows = document.querySelectorAll('.user-row');
  for (var i = 0; i < rows.length; i++) {
    var name = rows[i].getAttribute('data-username') || '';
    rows[i].style.display = name.indexOf(q) > -1 ? '' : 'none';
  }
}

function saveRecipient() {
  var v = document.getElementById('recipientInput').value.trim();
  if (!v) { alert('请输入收款人角色名'); return; }
  fetch('/api/admin/settings?payment_recipient='+encodeURIComponent(v), { method: 'POST', headers: {'Authorization': 'Bearer '+authToken} }).then(function(r){return r.json()}).then(function(d){
    if (d.ok) { document.getElementById('recipientDisplay').textContent = v; alert('已更新'); }
    else alert('保存失败');
  }).catch(function(){ alert('网络错误'); });
}

function rebuildMaterialCache() {
  var btn = event.target;
  btn.disabled = true; btn.textContent = '重建中...';
  fetch('/api/industry/rebuild-cache', { method: 'POST', headers: {'Authorization': 'Bearer '+authToken} }).then(function(r){return r.json()}).then(function(d){
    alert('缓存已重建，共 '+d.count+' 种原料');
    btn.disabled = false; btn.textContent = '重建缓存';
  }).catch(function(){ alert('重建失败'); btn.disabled = false; btn.textContent = '重建缓存'; });
}

// ========== 制造商申请/续费 ==========

function showAppModal() {
  var isRenew = window._userRole === 'manufacturer';
  document.getElementById('appModalTitle').textContent = isRenew ? '续费制造商' : '申请成为制造商';
  document.getElementById('appCharName').value = '';
  document.getElementById('appNotes').value = '';
  document.getElementById('appMsg').textContent = '';
  document.getElementById('appModal').style.display = 'flex';
  // 加载收款人信息
  fetch('/api/payment-recipient').then(function(r){return r.json()}).then(function(d){
    if (d.ok && d.payment_recipient) {
      document.getElementById('appRecipientName').textContent = d.payment_recipient;
    }
  }).catch(function(){});
}

function hideAppModal() {
  document.getElementById('appModal').style.display = 'none';
}

async function submitApplication() {
  var charName = document.getElementById('appCharName').value.trim();
  if (!charName) { document.getElementById('appMsg').textContent = '请填写游戏角色名'; return; }
  var notes = document.getElementById('appNotes').value.trim();
  var btn = document.querySelector('#appModal .btn-primary');
  btn.disabled = true; btn.textContent = '提交中...';
  try {
    var r = await fetch('/api/apply-manufacturer?character_name='+encodeURIComponent(charName)+'&notes='+encodeURIComponent(notes), { method: 'POST', headers: {'Authorization': 'Bearer '+authToken} });
    var d = await r.json();
    document.getElementById('appMsg').textContent = d.message;
    if (d.ok) {
      btn.textContent = '已提交';
      setTimeout(function(){ hideAppModal(); }, 2000);
    } else {
      btn.disabled = false; btn.textContent = '提交申请';
    }
  } catch(e) {
    document.getElementById('appMsg').textContent = '网络错误';
    btn.disabled = false; btn.textContent = '提交申请';
  }
}

// ========== 站内消息 ==========

var _msgTab = 'inbox';

function showMsgModal() {
  document.getElementById('msgModal').style.display = 'flex';
  switchMsgTab('inbox');
}

function hideMsgModal() {
  document.getElementById('msgModal').style.display = 'none';
}

function switchMsgTab(tab) {
  _msgTab = tab;
  document.getElementById('msgTabInbox').className = tab === 'inbox' ? 'btn-primary' : 'btn-secondary';
  document.getElementById('msgTabOutbox').className = tab === 'outbox' ? 'btn-primary' : 'btn-secondary';
  if (tab === 'inbox') loadInbox();
  else loadOutbox();
}

async function loadInbox() {
  document.getElementById('msgList').innerHTML = '<div class="loading">加载中...</div>';
  try {
    var r = await fetch('/api/messages/inbox', { headers: {'Authorization': 'Bearer '+authToken} });
    var d = await r.json();
    if (!d.ok || !d.messages || d.messages.length === 0) {
      document.getElementById('msgList').innerHTML = '<div class="no-result">暂无消息</div>';
      return;
    }
    var h = '';
    var isAdmin = window._isAdmin;
    var isSuper = window._userRole === 'super_admin' || window._userRole === 'admin';
    for (var i = 0; i < d.messages.length; i++) {
      var m = d.messages[i];
      var isApp = m.title && m.title.indexOf('制造商申请') === 0 && !m.is_processed;
      var fromName = (m.from_role === 'admin' || m.from_role === 'super_admin') ? '站长' : (m.from_user_id === 0 ? '系统' : m.from_name);
      h += '<div style="padding:12px;background:'+(m.is_read?'#0d1117':'#161b22')+';border:1px solid #21262d;border-radius:6px;margin-bottom:8px">'+
        '<div style="display:flex;justify-content:space-between;font-size:12px;color:#8b949e;margin-bottom:4px">'+
        '<span><span class="msg-dot"'+(m.is_read?' style="background:#21262d"':' style="background:#58a6ff"')+'></span> 来自: <strong style="color:#c9d1d9">'+fromName+'</strong></span>'+
        '<span>'+m.created_at+'</span></div>'+
        '<div style="font-weight:bold;margin-bottom:4px;color:#c9d1d9">'+(m.title||'无标题')+'</div>'+
        '<div style="font-size:13px;color:#c9d1d9;white-space:pre-wrap">'+m.content+'</div>'+
        (isSuper && isApp
          ?'<div style="margin-top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">'+
            '<input id="appDays_'+m.id+'" type="number" min="0" max="365" value="30" style="width:60px;padding:4px 6px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px"> 天 '+
            '<button class="watch-btn-sm" onclick="confirmApplication('+m.from_user_id+','+m.id+')">确认通过</button>'+
            '<input id="rejectReason_'+m.id+'" type="text" placeholder="拒绝原因" style="width:160px;padding:4px 6px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px"> '+
            '<button class="watch-btn-sm" style="background:#da3633" onclick="rejectApplication('+m.from_user_id+','+m.id+')">拒绝</button></div>'
          :(m.is_processed?'<div style="margin-top:6px;font-size:12px;color:#8b949e">— 已处理 —</div>':''))+'</div>';
    }
    document.getElementById('msgList').innerHTML = h;
    // 标记已读
    for (var i = 0; i < d.messages.length; i++) {
      if (!d.messages[i].is_read) {
        fetch('/api/messages/read/'+d.messages[i].id, { method: 'PUT', headers: {'Authorization': 'Bearer '+authToken} });
      }
    }
  } catch(e) {
    document.getElementById('msgList').innerHTML = '<div class="no-result">加载失败</div>';
  }
}

async function loadOutbox() {
  document.getElementById('msgList').innerHTML = '<div class="loading">加载中...</div>';
  try {
    var r = await fetch('/api/messages/outbox', { headers: {'Authorization': 'Bearer '+authToken} });
    var d = await r.json();
    if (!d.ok || !d.messages || d.messages.length === 0) {
      document.getElementById('msgList').innerHTML = '<div class="no-result">暂无消息</div>';
      return;
    }
    var h = '';
    for (var i = 0; i < d.messages.length; i++) {
      var m = d.messages[i];
      var toName = (m.to_role === 'admin' || m.to_role === 'super_admin') ? '站长' : (m.to_name || '用户#'+m.to_user_id);
      h += '<div style="padding:12px;background:#0d1117;border:1px solid #21262d;border-radius:6px;margin-bottom:8px">'+
        '<div style="display:flex;justify-content:space-between;font-size:12px;color:#8b949e;margin-bottom:4px">'+
        '<span>发送至: <strong style="color:#c9d1d9">'+toName+'</strong></span>'+
        '<span>'+m.created_at+'</span></div>'+
        '<div style="font-weight:bold;margin-bottom:4px;color:#c9d1d9">'+(m.title||'无标题')+'</div>'+
        '<div style="font-size:13px;color:#c9d1d9;white-space:pre-wrap">'+m.content+'</div></div>';
    }
    document.getElementById('msgList').innerHTML = h;
  } catch(e) {
    document.getElementById('msgList').innerHTML = '<div class="no-result">加载失败</div>';
  }
}

async function confirmApplication(uid, msgId) {
  var days = parseInt(document.getElementById('appDays_'+msgId).value);
  if (isNaN(days) || days < 0 || days > 365) { alert('天数须在0-365之间'); return; }
  if (!confirm('确认将用户 #'+uid+' 设为制造商'+(days>0?' '+days+'天':'永久')+'？')) return;
  try {
    var r = await fetch('/api/admin/set-role?user_id='+uid+'&role=manufacturer'+(days>0?'&days='+days:'&days=0'), { method: 'POST', headers: {'Authorization': 'Bearer '+authToken} });
    var d = await r.json();
    if (d.ok) {
      alert('已设为制造商');
      // 标记消息已处理
      fetch('/api/messages/process/'+msgId, { method: 'PUT', headers: {'Authorization': 'Bearer '+authToken} });
      // 回复用户
      fetch('/api/messages/send?to_user_id='+uid+'&title=制造商申请已通过&content=你的制造商申请已通过，有效期'+(days>0?days+'天':'永久')+'。', { method: 'POST', headers: {'Authorization': 'Bearer '+authToken} });
      loadInbox();
    } else {
      alert(d.message);
    }
  } catch(e) { alert('网络错误'); }
}

async function rejectApplication(uid, msgId) {
  var reason = document.getElementById('rejectReason_'+msgId).value.trim();
  if (!reason) { alert('请填写拒绝原因'); return; }
  if (!confirm('确认拒绝该申请？')) return;
  try {
    // 标记消息已处理
    await fetch('/api/messages/process/'+msgId, { method: 'PUT', headers: {'Authorization': 'Bearer '+authToken} });
    // 回复用户
    await fetch('/api/messages/send?to_user_id='+uid+'&title=制造商申请未通过&content=你的制造商申请未通过，原因: '+encodeURIComponent(reason), { method: 'POST', headers: {'Authorization': 'Bearer '+authToken} });
    alert('已拒绝并回复用户');
    loadInbox();
  } catch(e) { alert('网络错误'); }
}
