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
        // 隐藏下拉菜单，改为文本
        var sel = document.getElementById('lpSel_'+lineNum);
        if (sel) {
          var prodName = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '#'+typeId;
          sel.style.display = 'none';
          var nameSpan = document.createElement('span');
          nameSpan.id = 'lpName_'+lineNum;
          nameSpan.style.cssText = 'font-size:12px;color:#c9d1d9;font-weight:bold;margin-left:4px';
          nameSpan.textContent = prodName;
          sel.parentNode.insertBefore(nameSpan, sel.nextSibling);
        }
        // 更新缺口汇总（已扣除本线的材料）
        loadShortageSummary(wid);
        setInterval(function(){
          var cd = document.getElementById('cd_'+lineNum+'_'+wid);
          if (!cd) return;
          var now = new Date();
          var diff = endDate - now;
          if (diff <= 0) {
            cd.textContent = '⏰ 已完成，请收付';
            return;
          }
          var h = Math.floor(diff / 3600000);
          var m = Math.floor((diff % 3600000) / 60000);
          var s = Math.floor((diff % 60000) / 1000);
          cd.textContent = '⏱ ' + h + 'h ' + m + 'm ' + s + 's';
        }, 1000);
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