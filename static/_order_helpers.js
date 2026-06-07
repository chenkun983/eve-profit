/* 订单系统辅助函数 */
function cancelAcceptance(a){
  if(!confirm('确认取消接单？'))return;
  var t=window.authToken||localStorage.getItem('auth_token');
  fetch('/api/orders/accept-status?acc_id='+a+'&status=cancelled',{method:'POST',headers:{'Authorization':'Bearer '+t}})
    .then(function(r){return r.json()})
    .then(function(d){
      if(typeof loadMyAcceptances==='function')loadMyAcceptances();
      if(typeof loadIndustryOrders==='function')setTimeout(loadIndustryOrders,300);
    });
}
function markDelivered(a){
  if(!confirm('确认已交付？'))return;
  var t=window.authToken||localStorage.getItem('auth_token');
  fetch('/api/orders/accept-status?acc_id='+a+'&status=delivered',{method:'POST',headers:{'Authorization':'Bearer '+t}})
    .then(function(r){return r.json()})
    .then(function(d){
      if(typeof loadMyAcceptances==='function')loadMyAcceptances();
      if(typeof loadIndustryOrders==='function')setTimeout(loadIndustryOrders,300);
    });
}
function acceptDelivered(a){
  if(!confirm('确认收到货物？'))return;
  var t=window.authToken||localStorage.getItem('auth_token');
  fetch('/api/orders/accept-status?acc_id='+a+'&status=completed',{method:'POST',headers:{'Authorization':'Bearer '+t}})
    .then(function(r){return r.json()})
    .then(function(d){
      _pageMyOrders=1;
      setTimeout(function(){loadMyOrders();},100);
    });
}
function sellerDeliver(accId,orderId){
  if(!confirm('确认已交货给买家？'))return;
  var t=window.authToken||localStorage.getItem('auth_token');
  fetch('/api/orders/accept-status?acc_id='+accId+'&status=delivered',{method:'POST',headers:{'Authorization':'Bearer '+t}})
    .then(function(r){return r.json()})
    .then(function(d){
      _pageMyOrders=1;
      setTimeout(function(){loadMyOrders();},100);
      if(typeof loadIndustryOrders==='function')setTimeout(loadIndustryOrders,100);
    });
}
function selfConfirmAcceptance(accId){
  var t=window.authToken||localStorage.getItem('auth_token');
  fetch('/api/orders/accept-status?acc_id='+accId+'&status=delivering',{method:'POST',headers:{'Authorization':'Bearer '+t}})
    .then(function(r){return r.json()})
    .then(function(d){
      if(typeof loadIndustryOrders==='function')setTimeout(loadIndustryOrders,300);
      if(typeof loadMyAcceptances==='function')loadMyAcceptances();
    });
}
function deleteOrder(o){
  if(!confirm('确认删除此订单？'))return;
  var t=window.authToken||localStorage.getItem('auth_token');
  fetch('/api/orders/cancel?order_id='+o,{method:'POST',headers:{'Authorization':'Bearer '+t}})
    .then(function(r){return r.json()})
    .then(function(d){if(d.ok&&typeof loadMyOrders==='function')loadMyOrders();});
}
function _canAccept(o){
  return o.status==='public' && (o.type==='sell' || window._userRole==='manufacturer'||window._userRole==='admin'||window._userRole==='super_admin');
}
function showOrderDetail(id){
  var area=document.getElementById('orderContent');
  if(!area){showOrderModal(id);return;}
  area.innerHTML='<div class="loading">加载中...</div>';
  fetch('/api/orders/detail?order_id='+id).then(function(r){return r.json()}).then(function(d){
    if(!d.ok||!d.order){area.innerHTML='<div class="no-result">订单不存在</div>';return;}
    var o=d.order;var canAcc=_canAccept(o);var items=o.items||[];
    var h='<div style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:14px;margin-bottom:12px">'+
      '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;margin-bottom:8px">'+
      '<div><h4 style="margin:0">订单 #'+o.id+'</h4><span style="color:#8b949e;font-size:12px">'+(o.type==='buy'?'采购':'出售')+' | 状态: ['+_os(o.status)+']</span></div>'+
      '<div style="font-size:12px;color:#8b949e;text-align:right">'+o.created_at+'<br>截止: '+o.deadline+'</div></div>'+
      '<div style="font-size:13px;color:#c9d1d9;margin-bottom:6px">下单人: '+(o.contact_name||o.username)+'</div>'+
      '<div style="font-size:13px;color:#c9d1d9;margin-bottom:6px">交货: '+escHtml(o.delivery_location||'游戏内对接')+'</div>'+(o.notes?'<div style="font-size:13px;color:#c9d1d9;margin-bottom:6px">备注: '+escHtml(o.notes)+'</div>':'')+
      '<table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:8px"><thead><tr style="color:#8b949e"><th style="text-align:left;padding:4px 6px;border-bottom:1px solid #21262d">物品</th><th style="text-align:right;padding:4px 6px;border-bottom:1px solid #21262d">总量</th><th style="text-align:right;padding:4px 6px;border-bottom:1px solid #21262d">剩余</th><th style="text-align:right;padding:4px 6px;border-bottom:1px solid #21262d">预期单价</th>'+
      (canAcc?'<th style="text-align:center;padding:4px 6px;border-bottom:1px solid #21262d">接单数</th>':'')+'</tr></thead><tbody>';
    for(var i=0;i<items.length;i++){var it=items[i];var rem=it.remaining!==undefined?it.remaining:it.qty;
      h+='<tr style="border-bottom:1px solid #21262d"><td style="padding:4px 6px">'+(it.name||'#'+it.type_id)+'</td><td style="text-align:right;padding:4px 6px">'+it.qty.toLocaleString()+'</td><td style="text-align:right;padding:4px 6px;color:'+(rem>0?'#d29922':'#3fb950')+'">'+rem.toLocaleString()+'</td><td style="text-align:right;padding:4px 6px">'+fmt(it.expected_price||0)+'</td>'+
      (canAcc?'<td style="text-align:center;padding:4px 6px"><input id="accQty_'+i+'" type="number" value="0" min="0" max="'+rem+'" style="width:100px;padding:4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px;text-align:center"></td>':'')+'</tr>';}
    h+='</tbody></table>';
    if(canAcc){h+='<div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">预期交付天数: <input id="accDays" type="number" value="7" min="1" max="30" style="width:60px;padding:4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px"> <span style="font-size:12px;color:#58a6ff;cursor:pointer" onclick="acceptThisOrder('+o.id+','+items.length+')">📩 接受订单</span></div>';}
    h+='</div>';area.innerHTML=h;
  });
}
function showOrderModal(id){
  var old=document.querySelector('.order-modal');if(old)old.remove();
  var m=document.createElement('div');m.className='order-modal';m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:400;display:flex;align-items:center;justify-content:center';
  var c=document.createElement('div');c.style.cssText='background:#161b22;border:1px solid #30363d;border-radius:12px;width:600px;max-width:95vw;max-height:80vh;overflow-y:auto;padding:0';
  c.innerHTML='<div style="padding:16px 20px;border-bottom:1px solid #30363d;display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0;font-size:16px">订单 #'+id+'</h3><span style="cursor:pointer;color:#8b949e;font-size:18px" onclick="this.parentElement.parentElement.parentElement.remove()">✕</span></div><div id="orderModalBody" style="padding:20px"><div class="loading">加载中...</div></div>';
  m.appendChild(c);document.body.appendChild(m);
  fetch('/api/orders/detail?order_id='+id).then(function(r){return r.json()}).then(function(d){
    var body=document.getElementById('orderModalBody');if(!body)return;
    if(!d.ok||!d.order){body.innerHTML='<div class="no-result">订单不存在</div>';return;}
    var o=d.order;var canAcc=_canAccept(o);var items=o.items||[];
    var h='<div style="font-size:13px;color:#c9d1d9;margin-bottom:6px">下单人: '+(o.contact_name||o.username)+' | 状态: ['+_os(o.status)+'] | '+(o.type==='buy'?'采购':'出售')+'</div>'+
      '<div style="font-size:13px;color:#c9d1d9;margin-bottom:6px">交货: '+escHtml(o.delivery_location||'游戏内对接')+'</div>'+(o.notes?'<div style="font-size:13px;color:#c9d1d9;margin-bottom:6px">备注: '+escHtml(o.notes)+'</div>':'')+
      '<table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:8px"><thead><tr style="color:#8b949e"><th style="text-align:left;padding:4px 6px">物品</th><th style="text-align:right;padding:4px 6px">总量</th><th style="text-align:right;padding:4px 6px">剩余</th><th style="text-align:right;padding:4px 6px">预期单价</th>'+
      (canAcc?'<th style="text-align:center;padding:4px 6px">接单数</th>':'')+'</tr></thead><tbody>';
    for(var i=0;i<items.length;i++){var it=items[i];var rem=it.remaining!==undefined?it.remaining:it.qty;
      h+='<tr style="border-bottom:1px solid #21262d"><td style="padding:4px 6px">'+(it.name||'#'+it.type_id)+'</td><td style="text-align:right;padding:4px 6px">'+it.qty.toLocaleString()+'</td><td style="text-align:right;padding:4px 6px;color:'+(rem>0?'#d29922':'#3fb950')+'">'+rem.toLocaleString()+'</td><td style="text-align:right;padding:4px 6px">'+fmt(it.expected_price||0)+'</td>'+
      (canAcc?'<td style="text-align:center;padding:4px 6px"><input id="accQty_'+i+'" type="number" value="0" min="0" max="'+rem+'" style="width:100px;padding:4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px;text-align:center"></td>':'')+'</tr>';}
    h+='</tbody></table>';
    if(canAcc){h+='<div style="margin-top:10px">预期交付天数: <input id="accDays" type="number" value="7" min="1" max="30" style="width:60px;padding:4px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px"> <span style="font-size:12px;color:#58a6ff;cursor:pointer" onclick="acceptThisOrder('+o.id+','+items.length+')">📩 接受订单</span></div>';}
    body.innerHTML=h;
  });
}
function acceptThisOrder(orderId,itemCount){
  var items=[];
  for(var i=0;i<itemCount;i++){
    var el=document.getElementById('accQty_'+i);if(!el)continue;
    var qty=parseInt(el.value)||0;if(qty>0)items.push({item_index:i,qty:qty});
  }
  if(items.length===0){alert('请至少选择一个物品并填写接单数量');return;}
  var days=parseInt(document.getElementById('accDays').value)||7;
  var tk=window.authToken||localStorage.getItem('auth_token');
  fetch('/api/orders/accept?order_id='+orderId+'&items_accepted='+encodeURIComponent(JSON.stringify(items))+'&expected_days='+days,{method:'POST',headers:{'Authorization':'Bearer '+tk}})
    .then(function(r){return r.json()})
    .then(function(d){
      if(d.ok){
        var tabs=document.querySelectorAll('#pageOrders .profit-tab');
        if(tabs.length>=4)switchOrderTab({target:tabs[3]},'accepts');
      } else alert(d.message||'接单失败');
    });
}
