/* 订单系统状态中文显示修正 */
(function(){
  var sm = {'public':'公开','completed':'已完成','cancelled':'已取消','expired':'已过期'};
  var orig = window.showOrders;
  if (typeof orig !== 'function') return;
  window.showOrders = function() {
    orig();
    // 加载完成后替换状态文本
    var check = setInterval(function(){
      var els = document.querySelectorAll('#orderContent [style*="color"]');
      if (els.length > 0) {
        for (var i = 0; i < els.length; i++) {
          var t = els[i].textContent;
          for (var k in sm) {
            if (t.indexOf(k) !== -1) {
              els[i].textContent = t.replace(k, sm[k]);
            }
          }
        }
        clearInterval(check);
      }
    }, 100);
  };
})();
