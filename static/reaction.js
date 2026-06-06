/* 反应线管理 */
function renderReactLinesTab(wid, configs) {
  var h = '<h4 style="margin-bottom:8px">反应线</h4>'+
    '<div style="margin-bottom:8px;font-size:12px;color:#8b949e;display:flex;gap:8px;flex-wrap:wrap">'+
    '技能减时: <input id="rcTimeSkill" type="number" value="32" min="-10" max="100" step="1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px"> %'+
    ' 建筑减时: <input id="rcTimeBuild" type="number" value="30" min="-10" max="100" step="1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px"> %'+
    ' 插件减时: <input id="rcTimeRig" type="number" value="30" min="-10" max="100" step="1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px"> %'+
    ' 脑插减时: <input id="rcTimeImp" type="number" value="0" min="-10" max="100" step="1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px"> %'+
    '</div>'+
    '<div style="margin-bottom:8px;font-size:12px;color:#8b949e;display:flex;gap:8px;flex-wrap:wrap">'+
    ' 插件减材: <input id="rcMatRig" type="number" value="3.8" min="0" max="10" step="0.1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px"> %'+
    ' 建筑减材: <input id="rcMatBuild" type="number" value="0" min="0" max="5" step="0.1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px"> %'+
    ' 脑插减材: <input id="rcMatImp" type="number" value="0" min="0" max="5" step="0.1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px"> %'+
    ' <span style="font-size:12px;color:#58a6ff;cursor:pointer" onclick="saveRcCoeffs('+wid+');alert(\'参数已保存\')">💾 保存参数</span>'+
    '</div>'+
    '<div style="margin-bottom:8px;font-size:12px;color:#8b949e">反应线数量: <input id="rcCountInput" type="number" value="'+configs.length+'" min="1" max="20" style="width:50px;padding:4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px">'+
    ' <span style="cursor:pointer;color:#8b949e" onclick="setReactionCount('+wid+')">更新</span></div>'+
    '<div id="rcContainer">';
  for (var i = 0; i < configs.length; i++) {
    var c = configs[i];
    var pm = c.price_mode || 'sell'; var pd = c.price_discount || 1.0; var cp = c.custom_price || 0;
    h += '<div class="line-card" id="rcCard_'+i+'" style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:8px;margin-bottom:6px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:4px">'+
      '<span style="font-weight:bold;font-size:12px">线 #'+(i+1)+'</span>'+
      '<span style="font-size:12px">产品: <select id="rcSel_'+(i+1)+'" style="padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#161b22;color:#c9d1d9;font-size:12px" onchange="onRcChange('+wid+','+(i+1)+')">'+
      '<option value="0">— 未选择 —</option></select></span>'+
      '<span style="font-size:12px">流程: <input id="rcQty_'+(i+1)+'" type="number" value="1" min="1" style="width:50px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#161b22;color:#c9d1d9;font-size:12px" onchange="onRcChange('+wid+','+(i+1)+')"></span>'+
      '<span id="rcOut_'+(i+1)+'" style="font-size:12px;color:#8b949e"></span>'+
      '<span style="font-size:12px">售价: <select id="rcPrice_'+(i+1)+'" style="padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#161b22;color:#c9d1d9;font-size:12px" onchange="onRcChange('+wid+','+(i+1)+')">'+
      '<option value="sell" '+(pm==='sell'?'selected':'')+'>最低卖单</option>'+
      '<option value="buy" '+(pm==='buy'?'selected':'')+'>最高收单</option>'+
      '<option value="custom" '+(pm==='custom'?'selected':'')+'>自定义</option></select>'+
      ' <span id="rcDiscWrap_'+(i+1)+'" style="'+(pm==='custom'?'display:none':'')+'">折扣: <select id="rcDisc_'+(i+1)+'" style="padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#161b22;color:#c9d1d9;font-size:12px" onchange="onRcChange('+wid+','+(i+1)+')">'+
      '<option value="1.0" '+(pd>=1?'selected':'')+'>100%</option><option value="0.95" '+(pd>=0.95&&pd<1?'selected':'')+'>95%</option><option value="0.9" '+(pd>=0.9&&pd<0.95?'selected':'')+'>90%</option><option value="0.85" '+(pd>=0.85&&pd<0.9?'selected':'')+'>85%</option><option value="0.8" '+(pd>=0.8&&pd<0.85?'selected':'')+'>80%</option></select></span>'+
      ' <span id="rcCustWrap_'+(i+1)+'" style="'+(pm==='custom'?'':'display:none')+'"><input id="rcCust_'+(i+1)+'" type="number" value="'+cp+'" min="0" step="10000" style="width:80px;padding:2px 4px;border:1px solid #30363d;border-radius:4px;background:#161b22;color:#c9d1d9;font-size:12px" placeholder="单价" onchange="onRcChange('+wid+','+(i+1)+')"> ISK</span>'+
      '</div>'+
      '<div id="rcProfit_'+i+'" style="font-size:12px;color:#8b949e">— 选择产品后将显示成本与利润</div>'+
      '<div id="rcMats_'+i+'" style="font-size:11px;color:#8b949e;margin-top:4px"></div>'+
      '</div>';
  }
  h += '</div><div id="rcShortage" style="margin-top:10px"></div></div>';
  return h;
}

function saveRcCoeffs(wid) {
  var coeffs = JSON.stringify({
    time_skill: parseInt(document.getElementById('rcTimeSkill').value)||32,
    time_build: parseInt(document.getElementById('rcTimeBuild').value)||30,
    time_rig: parseInt(document.getElementById('rcTimeRig').value)||30,
    time_imp: parseInt(document.getElementById('rcTimeImp').value)||0,
    mat_rig: parseFloat(document.getElementById('rcMatRig').value)||3.8,
    mat_build: parseFloat(document.getElementById('rcMatBuild').value)||0,
    mat_imp: parseFloat(document.getElementById('rcMatImp').value)||0
  });
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/line-coeffs/save?warehouse_id='+wid+'&coeffs='+encodeURIComponent(coeffs)+'&prefix=rc_', { method: 'POST', headers: {'Authorization': 'Bearer '+tk} });
}

function loadRcCoeffs(wid) {
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/line-coeffs/load?warehouse_id='+wid+'&prefix=rc_', { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (d.ok && d.coeffs) {
      if (d.coeffs.time_skill !== undefined) document.getElementById('rcTimeSkill').value = d.coeffs.time_skill;
      if (d.coeffs.time_build !== undefined) document.getElementById('rcTimeBuild').value = d.coeffs.time_build;
      if (d.coeffs.time_rig !== undefined) document.getElementById('rcTimeRig').value = d.coeffs.time_rig;
      if (d.coeffs.time_imp !== undefined) document.getElementById('rcTimeImp').value = d.coeffs.time_imp;
      if (d.coeffs.mat_rig !== undefined) document.getElementById('rcMatRig').value = d.coeffs.mat_rig;
      if (d.coeffs.mat_build !== undefined) document.getElementById('rcMatBuild').value = d.coeffs.mat_build;
      if (d.coeffs.mat_imp !== undefined) document.getElementById('rcMatImp').value = d.coeffs.mat_imp;
    }
  });
}

function populateReactionSelects(wid, configs) {
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/search-reactions?q=&limit=500', { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    var items = d.materials || [];
    var selects = document.querySelectorAll('[id^="rcSel_"]');
    for (var i = 0; i < selects.length; i++) {
      var sel = selects[i];
      sel.innerHTML = '<option value="0">— 未选择 —</option>';
      for (var j = 0; j < items.length; j++) {
        var opt = document.createElement('option');
        opt.value = items[j].type_id;
        opt.textContent = items[j].name_cn || items[j].name_en || '#'+items[j].type_id;
        sel.appendChild(opt);
      }
      sel.value = '0';
    }
  });
}

function onRcChange(wid, lineNum) {
  var sel = document.getElementById('rcSel_'+lineNum);
  var typeId = parseInt(sel.value) || 0;
  var el = document.getElementById('rcMats_'+(lineNum-1));
  if (!typeId) {
    document.getElementById('rcProfit_'+(lineNum-1)).innerHTML = '<span style="color:#8b949e">— 选择产品后将显示成本与利润</span>';
    if (el) el.innerHTML = '';
    return;
  }
  var tk = window.authToken || localStorage.getItem('auth_token');
  var pm = document.getElementById('rcPrice_'+lineNum).value;
  var pd = parseFloat(document.getElementById('rcDisc_'+lineNum).value) || 1.0;
  var cp = parseFloat(document.getElementById('rcCust_'+lineNum).value) || 0;
  if (pm === 'custom') {
    document.getElementById('rcDiscWrap_'+lineNum).style.display = 'none';
    document.getElementById('rcCustWrap_'+lineNum).style.display = '';
  } else {
    document.getElementById('rcDiscWrap_'+lineNum).style.display = '';
    document.getElementById('rcCustWrap_'+lineNum).style.display = 'none';
  }
  fetch('/api/industry/reaction-config/save?warehouse_id='+wid+'&line_number='+lineNum+'&product_type_id='+typeId+
    '&price_mode='+pm+'&price_discount='+pd+'&custom_price='+cp, { method: 'POST', headers: {'Authorization': 'Bearer '+tk} });
  recalcRcLine(wid, lineNum);
  loadRcShortage(wid);
}

function setReactionCount(wid) {
  var count = parseInt(document.getElementById('rcCountInput').value);
  if (isNaN(count) || count < 1 || count > 20) { alert('1-20'); return; }
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/reaction-count?warehouse_id='+wid+'&count='+count, { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    alert(d.message||'已更新');
    if (d.ok) switchWHTab({target:document.querySelectorAll('#pageIndustry .profit-tab')[3]}, 'reaction', wid);
  });
}

function recalcRcLine(wid, lineNum) {
  var sel = document.getElementById('rcSel_'+lineNum);
  var typeId = parseInt(sel ? sel.value : 0) || 0;
  if (!typeId) return;
  var qty = parseInt(document.getElementById('rcQty_'+lineNum).value) || 1;
  var el = document.getElementById('rcProfit_'+(lineNum-1));
  if (!el) return;
  el.innerHTML = '<span style="color:#8b949e">计算中...</span>';
  var tk = window.authToken || localStorage.getItem('auth_token');
  var pm = document.getElementById('rcPrice_'+lineNum).value;
  var pd = parseFloat(document.getElementById('rcDisc_'+lineNum).value) || 1.0;
  var cp = parseFloat(document.getElementById('rcCust_'+lineNum).value) || 0;
  fetch('/api/industry/reaction-cost?warehouse_id='+wid+'&line_number='+lineNum+'&product_type_id='+typeId+'&quantity='+qty+
    '&price_mode='+pm+'&price_discount='+pd+'&custom_price='+cp, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (!d.ok || !d.data) { el.innerHTML = '<span style="color:#da3633">计算失败</span>'; return; }
    var r = d.data;
    var outEl = document.getElementById('rcOut_'+lineNum);
    if (outEl && r.output_qty) outEl.textContent = '× '+r.output_qty+'件/流程 = '+(r.output_qty*qty)+'件';
    var profit = r.total_revenue - r.bp_cost;
    var margin = r.bp_cost > 0 ? (profit / r.bp_cost * 100).toFixed(1) : 0;
    el.innerHTML = '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;margin-top:2px">'+
      '<div><span style="color:#8b949e">材料成本</span><br><strong>'+fmt(r.bp_cost)+'</strong>'+
      '<br><span style="color:'+(profit>=0?'#3fb950':'#da3633')+';font-size:11px">利润 '+fmt(profit)+' ('+margin+'%)</span></div>'+
      '<div><span style="color:#8b949e">总售价</span><br><strong style="color:#58a6ff">'+fmt(r.total_revenue)+'</strong></div>'+
      '</div>'+
      '<div style="margin-top:6px"><span style="font-size:12px;color:#58a6ff;cursor:pointer" onclick="startReaction('+wid+','+lineNum+','+typeId+','+qty+')">▶ 启动反应</span></div>';
    loadRcMaterialList(wid, lineNum, typeId, qty);
  });
}

function loadRcMaterialList(wid, lineNum, typeId, qty) {
  var el = document.getElementById('rcMats_'+(lineNum-1));
  if (!el) return;
  var tk = window.authToken || localStorage.getItem('auth_token');
  Promise.all([
    fetch('/api/industry/reaction-materials?type_id='+typeId+'&quantity='+qty, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).catch(function(){return {materials:[]}}),
    fetch('/api/industry/inventory?warehouse_id='+wid, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).catch(function(){return {items:[]}})
  ]).then(function(results){
    var matD = results[0], invD = results[1];
    var mats = matD.materials || [];
    if (mats.length === 0) return;
    var invMap = {};
    for (var i = 0; i < (invD.items||[]).length; i++) invMap[invD.items[i].type_id] = invD.items[i].quantity;
    var h = '<div style="font-size:11px;color:#8b949e;margin-top:2px">需求材料:</div><table style="width:100%;font-size:11px;border-collapse:collapse"><thead><tr style="color:#8b949e"><th style="text-align:left;padding:2px 4px">材料</th><th style="text-align:right;padding:2px 4px">需求</th><th style="text-align:right;padding:2px 4px">库存</th><th style="text-align:right;padding:2px 4px">缺口</th></tr></thead><tbody>';
    for (var i = 0; i < mats.length; i++) {
      var m = mats[i];
      var avail = invMap[m.type_id] || 0;
      var missing = Math.max(0, m.quantity - avail);
      h += '<tr style="border-top:1px solid #21262d"><td style="padding:2px 4px">'+(m.name||'#'+m.type_id)+'</td>'+
        '<td style="text-align:right;padding:2px 4px">'+m.quantity.toLocaleString()+'</td>'+
        '<td style="text-align:right;padding:2px 4px">'+avail.toLocaleString()+'</td>'+
        '<td style="text-align:right;padding:2px 4px;color:'+(missing>0?'#da3633':'#3fb950')+'">'+missing.toLocaleString()+'</td></tr>';
    }
    h += '</tbody></table>';
    el.innerHTML = h;
  });
}

function loadRcShortage(wid) {
  var el = document.getElementById('rcShortage');
  if (!el) return;
  var tk = window.authToken || localStorage.getItem('auth_token');
  var typeIds = [];
  document.querySelectorAll('[id^="rcSel_"]').forEach(function(s){ var v=parseInt(s.value)||0; if(v>0) typeIds.push(v); });
  if (typeIds.length === 0) { el.innerHTML = ''; return; }
  fetch('/api/industry/inventory?warehouse_id='+wid, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(invD){
    var invMap = {};
    for (var i = 0; i < (invD.items||[]).length; i++) invMap[invD.items[i].type_id] = invD.items[i].quantity;
    var allMats = {}; var pending = typeIds.length;
    typeIds.forEach(function(tid){
      fetch('/api/industry/reaction-materials?type_id='+tid, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
        if (d.materials) d.materials.forEach(function(m){
          if (allMats[m.type_id]) allMats[m.type_id].required += m.quantity;
          else allMats[m.type_id] = {name: m.name, required: m.quantity, available: invMap[m.type_id]||0};
        });
        pending--;
        if (pending <= 0) renderRcShortage(el, allMats);
      }).catch(function(){ pending--; if(pending<=0) el.innerHTML=''; });
    });
  });
}

function renderRcShortage(el, mats) {
  var keys = Object.keys(mats);
  if (keys.length === 0) { el.innerHTML = ''; return; }
  var h = '<h4 style="margin-bottom:6px;font-size:13px">物料缺口 <span style="font-weight:normal;color:#8b949e">('+keys.length+' 种)</span></h4>'+
    '<div style="overflow-x:auto"><table style="width:100%;font-size:12px;border-collapse:collapse"><thead><tr style="color:#8b949e"><th style="text-align:left;padding:4px 6px">材料</th><th style="text-align:right;padding:4px 6px">需求</th><th style="text-align:right;padding:4px 6px">库存</th><th style="text-align:right;padding:4px 6px">缺口</th></tr></thead><tbody>';
  for (var tid in mats) {
    var m = mats[tid];
    var missing = Math.max(0, m.required - m.available);
    h += '<tr style="border-top:1px solid #21262d"><td style="padding:4px 6px">'+(m.name||'#'+tid)+'</td>'+
      '<td style="text-align:right;padding:4px 6px">'+m.required.toLocaleString()+'</td>'+
      '<td style="text-align:right;padding:4px 6px">'+m.available.toLocaleString()+'</td>'+
      '<td style="text-align:right;padding:4px 6px;color:'+(missing>0?'#da3633':'#3fb950')+'">'+missing.toLocaleString()+'</td></tr>';
  }
  h += '</tbody></table></div>';
  el.innerHTML = h;
}

function startReaction(wid, lineNum, typeId, qty) {
  if (!typeId) { alert('请先选择产品'); return; }
  var tk = window.authToken || localStorage.getItem('auth_token');
  fetch('/api/industry/start-reaction?warehouse_id='+wid+'&line_number='+lineNum+'&product_type_id='+typeId+'&quantity='+qty, { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (d.ok) {
      var el = document.getElementById('rcProfit_'+(lineNum-1));
      var endStr = d.result.estimated_end_at || '';
      if (el && endStr) {
        el.innerHTML = '<div style="font-size:12px;color:#3fb950">✅ 反应中，预计 '+endStr+'</div>'+
          '<div id="rcCd_'+lineNum+'_'+wid+'" style="font-size:14px;color:#58a6ff;font-weight:bold">计算倒计时...</div>';
        var et = new Date(endStr.replace(' ','T')+'+08:00');
        var cdEl = document.getElementById('rcCd_'+lineNum+'_'+wid);
        if (cdEl) {
          cdEl.setAttribute('data-end', et.toISOString());
          if (!window._cdTimer) {
            window._cdTimer = setInterval(function(){
              document.querySelectorAll('[id^="rcCd_"], [id^="cd_"]').forEach(function(el2){
                var es = el2.getAttribute('data-end'); if (!es) return;
                var ed = new Date(es); if (isNaN(ed)) return;
                var df = ed - new Date();
                if (df <= 0) { el2.textContent = '⏰ 已完成'; return; }
                el2.textContent = '⏱ '+Math.floor(df/3600000)+'h '+Math.floor((df%3600000)/60000)+'m '+Math.floor((df%60000)/1000)+'s';
              });
            }, 1000);
          }
        }
      } else alert('已启动！');
    } else alert(d.message||'启动失败');
  });
}
