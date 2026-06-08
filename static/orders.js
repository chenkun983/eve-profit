/* 订单系统 v3 */
var _orderTab = 'public';
var _orderStatusMap={'public':'公开','completed':'已完成','cancelled':'已取消','expired':'已过期','pending':'待确认','delivering':'交付中','delivered':'已交付'};
function _os(s){return _orderStatusMap[s]||s;}
var _pageMyOrders=1,_pageMyAccepts=1,_pagePublic=1;
function showOrders(){
  var a=document.getElementById('pageOrders');if(!a)return;
  a.innerHTML='<div class="industry-page">'+
    '<div class="profit-tabs" style="margin-bottom:12px">'+
    '<button class="profit-tab active" onclick="switchOrderTab(event,\'public\')">📋 订单池</button>'+
    '<button class="profit-tab" onclick="switchOrderTab(event,\'create\')">✏️ 发布订单</button>'+
    '<button class="profit-tab" onclick="switchOrderTab(event,\'mine\')">📁 我的订单</button>'+
    '<button class="profit-tab" onclick="switchOrderTab(event,\'accepts\')">📦 我的接单</button>'+
    '</div><div id="orderContent"><div class="loading">加载中...</div></div></div>';
  loadPublicOrders();
}
function switchOrderTab(ev,tab){
  _orderTab=tab;
  document.querySelectorAll('#pageOrders .profit-tab').forEach(function(t){t.classList.remove('active');});
  ev.target.classList.add('active');
  if(tab==='public'){_pagePublic=1;loadPublicOrders();}
  else if(tab==='create')showCreateOrder();
  else if(tab==='mine'){_pageMyOrders=1;loadMyOrders();}
  else if(tab==='accepts'){_pageMyAccepts=1;loadMyAcceptances();}
}

var _poolSearchTimer=null;
function loadPublicOrders(){
  var el=document.getElementById('orderContent');if(!el)return;
  var f=document.getElementById('poolFilter');var fv=f?f.value:'all';
  var sq=document.getElementById('poolSearch');var sv=sq?sq.value.trim():'';
  var _psId='_ps'+Date.now();sb='<input id="'+_psId+'" type="text" placeholder="搜索物品名.." value="'+escHtml(sv)+'" autocomplete="off" readonly onfocus="this.removeAttribute(\'readonly\')" style="width:180px;padding:4px 8px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px" oninput="clearTimeout(_poolSearchTimer);_poolSearchTimer=setTimeout(loadPublicOrders,300)" oncompositionstart="this._composing=true" oncompositionend="this._composing=false;if(!this._composing)loadPublicOrders()">';
  var fb='<select id="poolFilter" style="padding:4px 8px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px" onchange="loadPublicOrders()"><option value="all"'+(fv==='all'?' selected':'')+'>全部</option><option value="buy"'+(fv==='buy'?' selected':'')+'>采购单</option><option value="sell"'+(fv==='sell'?' selected':'')+'>出售单</option></select>';
  el.innerHTML='<div style="margin-bottom:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px;color:#8b949e">'+sb+fb+'</div><div class="loading">加载中...</div>';
  fetch('/api/orders/public').then(function(r){return r.json()}).then(function(d){
    var orders=d.orders||[];
    if(fv!=='all')orders=orders.filter(function(o){return o.type===fv;});
    if(sv){var kw=sv.toLowerCase();orders=orders.filter(function(o){var items=o.items||[];for(var k=0;k<items.length;k++){var nm=(items[k].name||'').toLowerCase();if(nm.indexOf(kw)>=0)return true;}return false;});}
    var total=orders.length;var page=_pagePublic;var pp=50;var pages=Math.ceil(total/pp)||1;if(page>pages)page=pages;
    var slice=orders.slice((page-1)*pp,page*pp);
    var h='<div style="margin-bottom:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px;color:#8b949e">'+sb+fb;
    if(total===0){
      el.innerHTML=h+'</div><div class="no-result">暂无匹配订单</div>';
      return;
    }
    h+=' <span style="color:#8b949e">共 '+total+' 条 第 '+page+'/'+pages+' 页</span></div><div style="display:flex;flex-wrap:wrap;gap:8px">';
    for(var i=0;i<slice.length;i++){
      var o=slice[i];var items=o.items||[];var isBuy=o.type==='buy';
      h+='<div class="wh-card" onclick="showOrderDetail('+o.id+')" style="width:calc(20% - 6.4px) !important;min-width:0;margin:0;display:inline-block;vertical-align:top">'+
        '<div style="font-weight:bold;font-size:13px;margin-bottom:2px">#'+o.id+' '+(o.contact_name||o.username)+'</div>'+
        '<div style="font-size:11px;padding:2px 6px;border-radius:3px;display:inline-block;'+(isBuy?'background:#1a4a2e;color:#3fb950':'background:#3c1a5e;color:#a371f7')+'">'+(isBuy?'采购':'出售')+'</div>'+
        '<div style="font-size:11px;color:#c9d1d9;margin-top:4px">'+escHtml(items.map(function(it){return (it.name||'#'+it.type_id)+' x'+(it.remaining||it.qty);}).join(', ').substring(0,30))+'...</div>'+
        '<div style="font-size:11px;color:#d29922;margin-top:2px">'+fmt(o.estimated_total||0)+'</div></div>';
    }
    h+='</div>';
    if(pages>1){h+='<div style="margin-top:8px;font-size:12px;text-align:center">';for(var p=1;p<=pages;p++){h+='<span style="cursor:pointer;padding:4px 8px;margin:2px;border:1px solid #30363d;border-radius:3px;'+(p===page?'background:#58a6ff;color:#fff':'color:#8b949e')+'" onclick="_pagePublic='+p+';loadPublicOrders()">'+p+'</span>';}h+='</div>';}
    el.innerHTML=h;
  }).catch(function(){el.innerHTML='<div class="no-result">加载失败</div>';});
}

function showCreateOrder(){
  if(!window.authToken&&!localStorage.getItem('auth_token')){document.getElementById('orderContent').innerHTML='<div class="no-result">请先登录</div>';return;}
  var area=document.getElementById('orderContent');var tk=window.authToken||localStorage.getItem('auth_token');
  fetch('/api/profile/game-contact',{headers:{'Authorization':'Bearer '+tk}}).then(function(r){return r.json()}).then(function(cd){
    var contact=cd.contact||'';
    area.innerHTML='<h4 style="margin-bottom:8px">发布订单</h4><div style="max-width:600px"><div style="margin-bottom:8px">订单类型: <select id="ordType" style="padding:6px 10px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px"><option value="">— 请选择 —</option><option value="buy">采购单</option><option value="sell">出售单</option></select></div>'+
      '<div style="margin-bottom:8px">游戏内ID: <input id="ordContact" type="text" class="modal-input" value="'+escHtml(contact)+'" style="width:100%"></div>'+
      '<div style="margin-bottom:8px">交货地点: <input id="ordLocation" type="text" class="modal-input" value="游戏内对接" style="width:100%"></div>'+
      '<div style="margin-bottom:8px">订单备注: <textarea id="ordNotes" class="modal-input" style="width:100%;min-height:60px;resize:vertical" placeholder="选填"></textarea></div>'+
      '<div style="margin-bottom:8px;font-size:12px;color:#8b949e">物品清单</div><div id="ordItems"></div>'+
      '<button class="btn-secondary" style="margin-bottom:8px;padding:4px 12px;font-size:12px" onclick="addOrdItem()">+ 添加物品</button><br>'+
      '<button class="btn-primary" onclick="submitOrder()">发布订单</button></div>';
    addOrdItem();
  });
}
function addOrdItem(){
  var c=document.getElementById('ordItems');var idx=c.children.length;var div=document.createElement('div');div.className='ord-item-line';
  div.style.cssText='display:flex;gap:6px;margin-bottom:4px;flex-wrap:wrap;align-items:center';
  div.innerHTML='<input type="text" class="ordItemSearch" placeholder="搜索物品.." autocomplete="off" readonly onfocus="this.removeAttribute(\'readonly\')" style="flex:1;min-width:120px;padding:6px 8px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px" oninput="searchOrdItem(this,'+idx+')" oncompositionstart="this._composing=true" oncompositionend="this._composing=false">'+
    '<input type="hidden" class="ordItemId" value="0">数量: <input type="number" class="ordItemQty" value="1" min="1" style="width:110px;padding:6px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px">'+
    '<input type="text" class="ordItemPrice" value="" placeholder="吉他最低售单价" autocomplete="off" readonly onfocus="this.removeAttribute(\'readonly\')" style="width:150px;padding:6px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:13px;text-align:right"> ISK<span style="color:#da3633;cursor:pointer;font-size:13px" onclick="this.parentElement.remove()">\u2715</span>';
  c.appendChild(div);
}
function searchOrdItem(input,idx){
  if(input._composing||input._selected){input._selected=false;return;}
  var v=input.value.trim();if(v.length<1)return;
  var old=document.querySelector('.ord-search-menu');if(old)old.remove();
  fetch('/api/search?q='+encodeURIComponent(v)).then(function(r){return r.json()}).then(function(d){
    var list=(d.items||[]).filter(function(x){return x.name&&x.name.indexOf('ENV_')!==0;});if(list.length===0)return;
    var menu=document.createElement('div');menu.className='ord-search-menu';
    menu.style.cssText='position:fixed;background:#161b22;border:1px solid #30363d;border-radius:4px;z-index:100;max-height:200px;overflow-y:auto';
    var r=input.getBoundingClientRect();var estH=Math.min(list.length,15)*28;menu.style.left=r.left+'px';menu.style.width=Math.max(r.width,200)+'px';if(r.bottom+estH+4>window.innerHeight){menu.style.bottom=(window.innerHeight-r.top+4)+'px';menu.style.top='';menu.style.maxHeight=Math.min(estH+8,r.top-8)+'px';}else{menu.style.top=(r.bottom+4)+'px';menu.style.bottom='';}
    for(var i=0;i<Math.min(list.length,15);i++){
      var it=document.createElement('div');it.textContent=list[i].name;
      it.style.cssText='padding:6px 10px;cursor:pointer;font-size:12px;color:#c9d1d9';
      it.onmouseover=function(){this.style.background='#1c2128';};it.onmouseout=function(){this.style.background='transparent';};
      it.onclick=function(rid,rname,inp){return function(){
        inp.value=rname;inp.parentElement.querySelector('.ordItemId').value=rid;inp._selected=true;menu.remove();
        var pi=inp.parentElement.querySelector('.ordItemPrice');if(pi) fetch('/api/price?type_id='+rid).then(function(r2){return r2.json()}).then(function(pd){if(pd.ok&&pd.windows){var w=pd.windows['7d']||pd.windows['24h']||{};if(w.sell_min>0)pi.value=Number(w.sell_min).toLocaleString('zh-CN');}}).catch(function(){});
      };}(list[i].typeID,list[i].name,input);
      menu.appendChild(it);
    }
    document.body.appendChild(menu);input.onblur=function(){setTimeout(function(){if(menu.parentNode)menu.remove();},200);};
  });
}
function _parsePrice(v){if(!v)return 0;return parseFloat(String(v).replace(/,/g,''))||0;}
function submitOrder(){
  var ot=document.getElementById('ordType').value;if(!ot){alert('请选择订单类型');return;}
  var contact=document.getElementById('ordContact').value.trim();if(!contact){alert('请填写游戏内ID');return;}
  var items=[];var lines=document.querySelectorAll('.ord-item-line');
  for(var i=0;i<lines.length;i++){var tid=parseInt(lines[i].querySelector('.ordItemId').value)||0;var qty=parseInt(lines[i].querySelector('.ordItemQty').value)||0;var price=_parsePrice(lines[i].querySelector('.ordItemPrice').value);var name=lines[i].querySelector('.ordItemSearch').value.trim();if(tid&&qty>0)items.push({type_id:tid,name:name,qty:qty,expected_price:price});}
  if(items.length===0){alert('请至少添加一个有效物品');return;}
  var tk=window.authToken||localStorage.getItem('auth_token');var loc=document.getElementById('ordLocation').value.trim()||'游戏内对接';var notes=document.getElementById('ordNotes').value.trim();
  fetch('/api/orders/create?order_type='+ot+'&items='+encodeURIComponent(JSON.stringify(items))+'&contact_name='+encodeURIComponent(contact)+'&delivery_location='+encodeURIComponent(loc)+'&notes='+encodeURIComponent(notes),{method:'POST',headers:{'Authorization':'Bearer '+tk}}).then(function(r){return r.json()}).then(function(d){if(d.ok){alert('订单已发布！编号 #'+d.order_id);switchOrderTab({target:document.querySelectorAll('#pageOrders .profit-tab')[0]},'public');}else alert(d.message||'发布失败');});
}

function loadMyOrders(){
  var el=document.getElementById('orderContent');if(!el)return;
  if(!window.authToken&&!localStorage.getItem('auth_token')){el.innerHTML='<div class="no-result">请先登录</div>';return;}
  var f=document.getElementById('mineFilter');var fv=f?f.value:'all';
  var ft=document.getElementById('mineTypeFilter');var ftv=ft?ft.value:'all';
  el.innerHTML='<div style="margin-bottom:10px;font-size:12px;color:#8b949e">筛选: <select id="mineFilter" style="padding:4px 8px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px" onchange="_pageMyOrders=1;loadMyOrders()"><option value="all"'+(fv==='all'?' selected':'')+'>全部</option><option value="public"'+(fv==='public'?' selected':'')+'>公开</option><option value="completed"'+(fv==='completed'?' selected':'')+'>已完成</option><option value="cancelled"'+(fv==='cancelled'?' selected':'')+'>已取消</option></select> <select id="mineTypeFilter" style="padding:4px 8px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px" onchange="_pageMyOrders=1;loadMyOrders()"><option value="all"'+(ftv==='all'?' selected':'')+'>全部类型</option><option value="buy"'+(ftv==='buy'?' selected':'')+'>采购单</option><option value="sell"'+(ftv==='sell'?' selected':'')+'>出售单</option></select></div><div class="loading">加载中...</div>';
  var tk=window.authToken||localStorage.getItem('auth_token');
  fetch('/api/orders/mine',{headers:{'Authorization':'Bearer '+tk}}).then(function(r){return r.json()}).then(function(d){
    var orders=d.orders||[];
    if(fv!=='all')orders=orders.filter(function(o){return o.status===fv;});
    if(ftv!=='all')orders=orders.filter(function(o){return o.type===ftv;});
    var total=orders.length;var page=_pageMyOrders;var ps=20;var pages=Math.ceil(total/ps)||1;if(page>pages)page=pages;
    var slice=orders.slice((page-1)*ps,page*ps);
    var h='<div style="margin-bottom:10px;font-size:12px;color:#8b949e">筛选: <select id="mineFilter" style="padding:4px 8px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px" onchange="_pageMyOrders=1;loadMyOrders()"><option value="all"'+(fv==='all'?' selected':'')+'>全部</option><option value="public"'+(fv==='public'?' selected':'')+'>公开</option><option value="completed"'+(fv==='completed'?' selected':'')+'>已完成</option><option value="cancelled"'+(fv==='cancelled'?' selected':'')+'>已取消</option></select> <select id="mineTypeFilter" style="padding:4px 8px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px" onchange="_pageMyOrders=1;loadMyOrders()"><option value="all"'+(ftv==='all'?' selected':'')+'>全部类型</option><option value="buy"'+(ftv==='buy'?' selected':'')+'>采购单</option><option value="sell"'+(ftv==='sell'?' selected':'')+'>出售单</option></select> <span style="color:#8b949e">共 '+total+' 条 第 '+page+'/'+pages+' 页</span></div>';
    var smap={'pending':'待确认','delivering':'制作中','delivered':'待验收','completed':'已完成','cancelled':'已取消'};
    for(var i=0;i<slice.length;i++){
      var o=slice[i];var accs=o.acceptances||[];
      h+='<div style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:10px;margin-bottom:8px">'+
        '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px">'+
        '<div><strong>#'+o.id+'</strong> <span style="color:#8b949e;font-size:12px">('+(o.type==='buy'?'采购':'出售')+')</span>'+
        ' <span style="color:'+(o.status==='public'?'#58a6ff':(o.status==='completed'?'#3fb950':(o.status==='cancelled'?'#8b949e':'#d29922')))+'">['+_os(o.status)+']</span></div>'+
        '<div style="font-size:12px;color:#8b949e">'+o.created_at+'</div></div>'+
        '<div style="font-size:12px;color:#8b949e;margin-top:4px">联系人: '+(o.contact_name||o.username)+'</div>'+
        '<div style="font-size:13px;color:#c9d1d9;margin-top:4px">'+(o.items||[]).map(function(it){return (it.name||'#'+it.type_id)+' x'+it.qty;}).join(', ')+'</div>'+
        (accs.length>0?'<div style="font-size:12px;color:#c9d1d9;margin-top:6px;padding:6px 8px;background:#161b22;border:1px solid #21262d;border-radius:4px;line-height:2">接单明细:'+accs.map(function(a){var ai=(o.items||[])[a.item_index];var nm=(ai?ai.name||'#'+ai.type_id:'?');var isSell=o.type==='sell';var sc=a.status==='completed'?'#3fb950':(a.status==='delivered'?'#58a6ff':(a.status==='delivering'?'#d29922':'#8b949e'));var btn='';if(isSell){if(a.status==='pending')btn='<span style="color:#3fb950;cursor:pointer;font-weight:bold" onclick="event.stopPropagation();sellerDeliver('+a.id+','+o.id+')">交货</span>';else if(a.status==='delivered')btn='<span style="color:#58a6ff">等待买家确认</span>';}else{if(a.status==='delivered')btn='<span style="color:#3fb950;cursor:pointer;font-weight:bold" onclick="event.stopPropagation();acceptDelivered('+a.id+');">确认收货</span>';}return '<div style="display:grid;grid-template-columns:1fr auto auto auto auto;gap:8px;align-items:center"><span>'+nm+'</span><span style="color:#8b949e">'+a.acceptor_name+'</span><span style="color:#d29922">x'+a.qty.toLocaleString()+'</span><span style="color:'+sc+'">'+(smap[a.status]||a.status)+'</span><span>'+btn+'</span></div>';}).join('')+'</div>':'')+
        (function(){var ha=accs.some(function(a){return a.status==='pending'||a.status==='delivering'||a.status==='delivered';});if(!ha&&o.status==='public')return '<div style="margin-top:6px"><span style="font-size:12px;color:#da3633;cursor:pointer" onclick="deleteOrder('+o.id+')"> 删除订单</span></div>';return '';})()+'</div>';
    }
    if(pages>1){h+='<div style="margin-top:8px;font-size:12px">';for(var p=1;p<=pages;p++){h+='<span style="cursor:pointer;padding:4px 8px;margin:2px;border:1px solid #30363d;border-radius:3px;'+(p===page?'background:#58a6ff;color:#fff':'color:#8b949e')+'" onclick="_pageMyOrders='+p+';loadMyOrders()">'+p+'</span>';}h+='</div>';}
    el.innerHTML=h;
  });
}

function loadMyAcceptances(){
  var el=document.getElementById('orderContent');if(!el)return;
  if(!window.authToken&&!localStorage.getItem('auth_token')){el.innerHTML='<div class="no-result">请先登录</div>';return;}
  var f=document.getElementById('accFilter');var fv=f?f.value:'all';
  el.innerHTML='<div style="margin-bottom:10px;font-size:12px;color:#8b949e">筛选: <select id="accFilter" style="padding:4px 8px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px" onchange="_pageMyAccepts=1;loadMyAcceptances()"><option value="all"'+(fv==='all'?' selected':'')+'>全部</option><option value="active"'+(fv==='active'?' selected':'')+'>进行中</option><option value="completed"'+(fv==='completed'?' selected':'')+'>已完成</option><option value="cancelled"'+(fv==='cancelled'?' selected':'')+'>已取消</option></select></div><div class="loading">加载中...</div>';
  var tk=window.authToken||localStorage.getItem('auth_token');
  fetch('/api/orders/my-acceptances',{headers:{'Authorization':'Bearer '+tk}}).then(function(r){return r.json()}).then(function(d){
    var accs=d.acceptances||[];
    if(fv==='active')accs=accs.filter(function(a){return a.status==='pending'||a.status==='delivering'||a.status==='delivered';});
    else if(fv==='completed')accs=accs.filter(function(a){return a.status==='completed';});
    else if(fv==='cancelled')accs=accs.filter(function(a){return a.status==='cancelled';});
    var total=accs.length;var page=_pageMyAccepts;var ps=20;var pages=Math.ceil(total/ps)||1;if(page>pages)page=pages;
    var slice=accs.slice((page-1)*ps,page*ps);
    var h='<div style="margin-bottom:10px;font-size:12px;color:#8b949e">筛选: <select id="accFilter" style="padding:4px 8px;border:1px solid #30363d;border-radius:4px;background:#0d1117;color:#c9d1d9;font-size:12px" onchange="_pageMyAccepts=1;loadMyAcceptances()"><option value="all"'+(fv==='all'?' selected':'')+'>全部</option><option value="active"'+(fv==='active'?' selected':'')+'>进行中</option><option value="completed"'+(fv==='completed'?' selected':'')+'>已完成</option><option value="cancelled"'+(fv==='cancelled'?' selected':'')+'>已取消</option></select> <span style="color:#8b949e">共 '+total+' 条 第 '+page+'/'+pages+' 页</span></div>';
    for(var i=0;i<slice.length;i++){
      var a=slice[i];var item=(a.items||[])[a.item_index]||{};var isSell=a.order_type==='sell';
      var sm=isSell?{'pending':'待交货','delivering':'交付中','delivered':'待确认','completed':'已完成','cancelled':'已取消'}:{'pending':'待确认','delivering':'交付中','delivered':'待验收','completed':'已完成','cancelled':'已取消'};
      var sc=a.status==='pending'?'#d29922':(a.status==='completed'?'#3fb950':(a.status==='cancelled'?'#8b949e':'#58a6ff'));
      var btns='';
      if(isSell){
        if(a.status==='pending')btns='<span style="font-size:12px;color:#da3633;cursor:pointer" onclick="cancelAcceptance('+a.id+')">取消接单</span>';
        else if(a.status==='delivered')btns='<span style="font-size:12px;color:#58a6ff">✅ 卖家已发货</span> <span style="font-size:12px;color:#3fb950;cursor:pointer" onclick="acceptDelivered('+a.id+')">确认收货</span>';
      }else{
        if(a.status==='pending')btns='<span style="font-size:12px;color:#da3633;cursor:pointer" onclick="cancelAcceptance('+a.id+')">取消</span>';
        if(a.status==='delivered')btns='<span style="font-size:12px;color:#58a6ff;cursor:pointer" onclick="acceptDelivered('+a.id+')">确认交付</span>';
        if(a.status==='delivering')btns='<span style="font-size:12px;color:#3fb950;cursor:pointer" onclick="markDelivered('+a.id+')">去交付</span>';
      }
      h+='<div style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:10px;margin-bottom:8px">'+
        '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px">'+
        '<div><strong>#'+a.order_id+'</strong> <span style="color:'+(isSell?'#a371f7':'#3fb950')+';font-size:11px">'+(isSell?'[出售]':'[采购]')+'</span> '+(item.name||'#'+item.type_id)+' x'+a.qty+' <span style="color:'+sc+'">['+(sm[a.status]||a.status)+']</span></div>'+
        '<div style="font-size:12px;color:#8b949e">'+(isSell?'卖家':'下单')+': '+(a.contact_name||a.order_owner_name||'')+'</div></div>'+
        '<div style="font-size:12px;color:#8b949e;margin-top:4px">交货: '+(a.delivery_location||'游戏内对接')+'</div>'+
        (btns?'<div style="margin-top:6px">'+btns+'</div>':'')+
        '</div>';
    }
    if(pages>1){h+='<div style="margin-top:8px;font-size:12px">';for(var p=1;p<=pages;p++)h+='<span style="cursor:pointer;padding:4px 8px;margin:2px;border:1px solid #30363d;border-radius:3px;'+(p===page?'background:#58a6ff;color:#fff':'color:#8b949e')+'" onclick="_pageMyAccepts='+p+';loadMyAcceptances()">'+p+'</span>';h+='</div>';}
    el.innerHTML=h;
  });
}
