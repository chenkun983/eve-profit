function checkAndStart(wid, lineNum, typeId, qty) {
  if (!typeId) { alert('请先选择产品'); return; }
  qty = parseInt(document.getElementById('lpQty_'+lineNum).value) || 1;
  if (qty < 1) { alert('数量必须大于0'); return; }
  var tk = window.authToken || localStorage.getItem('auth_token');
  var pm = document.getElementById('lpPrice_'+lineNum).value;
  var pd = parseFloat(document.getElementById('lpDisc_'+lineNum).value) || 1.0;
  var cp = parseFloat(document.getElementById('lpCust_'+lineNum).value) || 0;
  var tSkill = parseFloat(document.getElementById('timeSkill').value) || 32;
  var tBuild = parseFloat(document.getElementById('timeBuild').value) || 30;
  var tRig = parseFloat(document.getElementById('timeRig').value) || 0;
  var mRig = parseFloat(document.getElementById('matRig').value) || 3.8;
  var mBuild = parseFloat(document.getElementById('matBuild').value) || 0;
  var mImplant = parseFloat(document.getElementById('matImplant').value) || 0;
  fetch('/api/industry/start-production?warehouse_id='+wid+'&line_number='+lineNum+'&product_type_id='+typeId+'&quantity='+qty+
    '&time_skill='+tSkill+'&time_build='+tBuild+'&time_rig='+tRig+'&mat_rig='+mRig+'&mat_build='+mBuild+'&mat_implant='+mImplant, { method: 'POST', headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
    if (d.ok) {
      fetch('/api/industry/line-config/save?warehouse_id='+wid+'&line_number='+lineNum+'&product_type_id='+typeId+
        '&price_mode='+pm+'&price_discount='+pd+'&custom_price='+cp, { method: 'POST', headers: {'Authorization': 'Bearer '+tk} });
      // 显示倒计时在卡片上
      var el = document.getElementById('lineProfit_'+(lineNum-1));
      var endStr = d.result.estimated_end_at || '';
      if (el && endStr) {
        var endDate = new Date(endStr.replace(' ','T')+'+08:00');
        el.innerHTML = '<div style="font-size:12px;color:#3fb950;margin-top:2px">✅ 生产中，预计 ' + endStr + '</div>'+
          '<div id="cd_'+lineNum+'_'+wid+'" style="font-size:14px;color:#58a6ff;font-weight:bold">计算倒计时...</div>';
        hideLineInputs(lineNum, wid, '#'+typeId);
        // 更新缺口汇总（已扣除本线的材料）
        loadShortageSummary(wid);
        var jobId = d.result ? d.result.job_id : 0;
        // 设置 data-end 供全局倒计时使用
        var cdEl = document.getElementById('cd_'+lineNum+'_'+wid);
        if (cdEl && endStr) {
          var et = new Date(endStr.replace(' ','T')+'+08:00');
          cdEl.setAttribute('data-end', et.toISOString());
        }
        // 确保全局倒计时已启动
        if (!window._cdTimer) {
          window._cdTimer = setInterval(function(){
            document.querySelectorAll('[id^="cd_"]').forEach(function(el2){
              var es = el2.getAttribute('data-end');
              if (!es) return;
              var ed = new Date(es);
              if (isNaN(ed)) return;
              var df = ed - new Date();
              if (df <= 0) { el2.textContent = '⏰ 已完成'; return; }
              el2.textContent = '⏱ ' + Math.floor(df/3600000) + 'h ' + Math.floor((df%3600000)/60000) + 'm ' + Math.floor((df%60000)/1000) + 's';
            });
          }, 1000);
        }
        // 检查是否已完成
        if (cdEl && cdEl.getAttribute('data-end')) {
          var endD = new Date(cdEl.getAttribute('data-end'));
          if (!isNaN(endD) && new Date() >= endD) {
            cdEl.textContent = '⏰ 已完成';
            if (!cdEl.getAttribute('data-btn-added')) {
              cdEl.setAttribute('data-btn-added', '1');
              cdEl.innerHTML = cdEl.textContent + ' <span style="font-size:12px;color:#3fb950;cursor:pointer" onclick="collectAndReset('+jobId+','+wid+','+lineNum+')">📦 交付</span>';
            }
          }
        }
      } else {
        alert('已启动！预计完成: ' + endStr);
      }
    } else {
      alert(d.message||'启动失败');
    }
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