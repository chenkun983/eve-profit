/* 覆盖 loadLiveProfits - 实时利润使用生产线完整加成成本 */
function loadLiveProfits(jobs) {
  var tk = window.authToken || localStorage.getItem('auth_token');
  for (var i = 0; i < jobs.length; i++) {
    var j = jobs[i];
    var snap = {};
    try { snap = JSON.parse(j.config_snapshot || '{}'); } catch(e) {}
    var cost = snap.cost_snapshot || {};
    if (!cost.bp_cost) continue;
    (function(jobId, typeId, qty, bpCost) {
      var pm = cost.price_mode || 'sell';
      var pd = cost.price_discount || 1.0;
      var cp = cost.custom_price || 0;
      fetch('/api/price?type_id='+typeId, { headers: {'Authorization': 'Bearer '+tk} }).then(function(r){return r.json()}).then(function(d){
        var w = (d||{}).windows || {};
        var last = w['7d'] || w['24h'] || {};
        var curSell = last.sell_min || 0;
        var curBuy = last.buy_max || 0;
        var curUnit = pm === 'sell' ? curSell * pd : (pm === 'buy' ? curBuy * pd : cp);
        var curRev = curUnit * qty;
        var curP = curRev - bpCost;
        var el = document.getElementById('liveProfit_'+jobId);
        if (el) {
          el.innerHTML = '<span style="color:#8b949e">实时</span><br>'+
            '利润: <strong style="color:'+(curP>=0?'#3fb950':'#da3633')+'">'+fmt(curP)+'</strong>';
        }
      }).catch(function(){});
    })(j.id, j.product_type_id, j.quantity, cost.bp_cost);
  }
}
