let selectedTypeId = null;
let debounceTimer = null;
let lastCalcData = null;
let bomActive = false;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    const el = document.getElementById('sdeStatus');
    if (data.sde_ok) {
      el.textContent = `已加载 (${data.sde_info.size_mb}MB, ${data.sde_info.blueprints} 个蓝图)`;
      el.style.color = '#3fb950';
    } else {
      el.textContent = '未加载 SDE';
      el.style.color = '#f85149';
    }
  } catch {}
  loadCategories();
  if (typeof checkLogin === 'function') checkLogin();
});

// ========== 标签切换 ==========
function switchTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  const sidebar = document.getElementById('sidebar');
  const pageCat = document.getElementById('pageCategories');
  const pageRank = document.getElementById('pageRanking');

  if (tab === 'categories') {
    document.querySelector('.nav-tab:nth-child(1)').classList.add('active');
    sidebar.style.display = 'block';
    pageCat.style.display = 'block';
    pageRank.style.display = 'none';
  } else if (tab === 'ranking') {
    document.querySelector('.nav-tab:nth-child(2)').classList.add('active');
    sidebar.style.display = 'none';
    pageCat.style.display = 'none';
    pageRank.style.display = 'block';
    showRanking();
  }
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

function toggleSidebar() {
  const s = document.getElementById('sidebar'), o = document.getElementById('overlay');
  const open = s.classList.toggle('open');
  o.classList.toggle('show', open);
}

// ========== 分类树 ==========
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    renderTree(data.roots);
  } catch { document.getElementById('categoryTree').textContent = '加载分类失败'; }
}
function renderTree(nodes, container) {
  const root = container || document.getElementById('categoryTree');
  root.innerHTML = '';
  nodes.forEach(n => root.appendChild(createNode(n)));
}
function createNode(node) {
  const div = document.createElement('div');
  div.className = 'cat-node';
  const h = document.createElement('div');
  h.className = 'cat-node-header';
  const t = document.createElement('span'); t.className = 'cat-toggle'; t.textContent = '\u25b6'; h.appendChild(t);
  const n = document.createElement('span'); n.className = 'cat-name'; n.textContent = node.name; h.appendChild(n);
  if (node.hasTypes && (!node.children || !node.children.length)) {
    h.style.cursor = 'pointer';
    h.onclick = () => { loadCategoryItems(node.id, node.name); if (window.innerWidth <= 768) toggleSidebar(); };
  } else if (node.children && node.children.length) {
    let open = false;
    const cc = document.createElement('div'); cc.className = 'cat-children'; renderTree(node.children, cc);
    h.onclick = () => { open = !open; t.textContent = open ? '\u25bc' : '\u25b6'; cc.classList.toggle('open', open); };
    div.appendChild(h); div.appendChild(cc); return div;
  }
  div.appendChild(h); return div;
}
async function loadCategoryItems(gid, gname) {
  const a = document.getElementById('categoryItems'), l = document.getElementById('categoryItemList'), lb = document.getElementById('categoryLabel');
  a.style.display = 'block'; l.innerHTML = '<div style="color:#484f58;padding:10px;text-align:center">加载中...</div>'; lb.textContent = gname;
  try {
    const r = await fetch('/api/items-by-category?group_id='+gid), d = await r.json();
    document.getElementById('categoryCount').textContent = d.items.length;
    if (!d.items.length) { l.innerHTML = '<div style="color:#484f58;padding:10px;text-align:center">此分类下暂无物品</div>'; return; }
    l.innerHTML = d.items.map(i => '<div class="cat-item" onclick="selectItem('+i.typeID+',\''+i.name.replace(/'/g,"\\'")+'\')">'+i.name+'</div>').join('');
  } catch { l.innerHTML = '<div style="color:#f85149;padding:10px;text-align:center">加载失败</div>'; }
}

// ========== 搜索 ==========
document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(debounceTimer);
  const q = e.target.value.trim();
  if (q.length < 1) { document.getElementById('searchResults').style.display = 'none'; return; }
  debounceTimer = setTimeout(async () => {
    try { const r = await fetch('/api/search?q='+encodeURIComponent(q)), d = await r.json(); renderSearchResults(d.items); } catch {}
  }, 250);
});
function renderSearchResults(items) {
  const c = document.getElementById('searchResults');
  if (!items || !items.length) { c.style.display = 'none'; return; }
  c.innerHTML = items.map(i => '<div class="search-result-item" onclick="selectItem('+i.typeID+',\''+i.name.replace(/'/g,"\\'")+')"><span>'+i.name+'</span><span class="result-typeid">#'+i.typeID+'</span></div>').join('');
  c.style.display = 'block';
}

function selectItem(typeId, name) {
  selectedTypeId = typeId; document.getElementById('searchInput').value = name;
  document.getElementById('searchResults').style.display = 'none';
  bomActive = false;
  fetchData(typeId);
}

function getCfg() {
  return {
    sci: parseFloat(document.getElementById('cfgSci').value)/100||0.03,
    bonus: parseFloat(document.getElementById('cfgBonus').value)/100||0.04,
    tax: parseFloat(document.getElementById('cfgTax').value)/100||0.01,
    me: parseInt(document.getElementById('cfgMe').value)||0,
    te: parseInt(document.getElementById('cfgTe').value)||0,
  };
}
document.querySelectorAll('.config-bar input').forEach(el => {
  el.addEventListener('change', () => { if (selectedTypeId) fetchData(selectedTypeId, bomActive); });
});

// ========== 主查询 ==========
async function fetchData(typeId, useBom) {
  const area = document.getElementById('resultArea');
  area.style.display = 'block';
  area.innerHTML = '<div class="loading">正在拉取吉他市场数据...</div>';
  const cfg = getCfg();
  const calcUrl = '/api/calculate?type_id='+typeId+'&sci='+cfg.sci+'&bonus='+cfg.bonus+'&tax='+cfg.tax+'&me='+cfg.me+'&te='+cfg.te+(useBom ? '&bom=true' : '');
  const [pRes, cRes] = await Promise.all([
    fetch('/api/price?type_id='+typeId).catch(()=>null),
    fetch(calcUrl).catch(()=>null),
  ]);
  let priceData = pRes ? await pRes.json() : null;
  let calcData = cRes ? await cRes.json() : null;
  if (!priceData || !priceData.ok) { area.innerHTML = '<div class="no-result">无法获取市场价格</div>'; return; }
  lastCalcData = calcData && calcData.ok ? calcData.data : null;
  renderResult(priceData, lastCalcData);
}

function fmt(v) { return v.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})+' ISK'; }
function fmtShort(v) {
  const abs = Math.abs(v);
  if (abs >= 1e8) return (v/1e8).toFixed(2)+'亿';
  if (abs >= 1e4) return (v/1e4).toFixed(2)+'万';
  return v.toFixed(2);
}
function fmtV(v) { return v.toLocaleString('zh-CN'); }

// ========== 材料定价切换 ==========
function overrideMaterial(matId, mode) {
  if (!lastCalcData) return;
  const ov = {};
  const list = bomActive && lastCalcData.deep_bom ? lastCalcData.deep_bom : lastCalcData.materials;
  for (const m of list) {
    const el = document.getElementById('mat-mode-'+m.type_id);
    if (el) ov[m.type_id] = el.value;
  }
  ov[matId] = mode;
  recalcWithOverrides(ov);
}
function recalcWithOverrides(overrides) {
  const cfg = getCfg();
  const area = document.getElementById('resultArea');
  const params = new URLSearchParams({
    type_id: selectedTypeId, sci: cfg.sci, bonus: cfg.bonus, tax: cfg.tax, me: cfg.me, te: cfg.te,
    overrides: JSON.stringify(overrides),
  });
  if (bomActive) params.append('bom', 'true');
  fetch('/api/calculate?'+params.toString()).then(r=>r.json()).then(d => {
    if (d.ok) { lastCalcData = d.data; renderProfit(d.data); }
  }).catch(()=>{});
}

// ========== 渲染 ==========
function renderResult(price, calc) {
  const area = document.getElementById('resultArea');
  const trimmed = price.trimmed || {};
  const trimmedBuy = trimmed.buy || {};
  const trimmedSell = trimmed.sell || {};
  const w = price.windows || {};

  const sellMin = trimmedSell.min || 0;
  const buyMax = trimmedBuy.max || 0;
  const sellVol = trimmedSell.volume || 0;
  const buyVol = trimmedBuy.volume || 0;
  const spread = sellMin - buyMax;
  const spPct = buyMax > 0 ? (spread/buyMax*100) : 0;

  const d7 = w['7d'] || {};
  const d90 = w['90d'] || {};
  const d7avg = d7.avg || 0;
  const d90avg = d90.avg || 0;
  const diff = d7avg > 0 && d90avg > 0 ? d7avg - d90avg : 0;

  const winOrder = ['24h','3d','7d','30d','90d'];
  const winLabel = {'24h':'24\u5c0f\u65f6','3d':'3\u5929','7d':'7\u5929','30d':'30\u5929','90d':'90\u5929'};
  const histRows = winOrder.map(k => {
    const d = w[k] || {};
    if (!d.avg || d.avg <= 0) return '';
    return '<tr><td>'+winLabel[k]+'</td><td class="text-right">'+fmt(d.avg)+'</td><td class="text-right">'+fmtV(d.volume)+'</td></tr>';
  }).filter(r => r).join('');

  var watchBtn = '';
  if (typeof authToken !== 'undefined' && authToken) {
    watchBtn = '<button class="watch-btn" onclick="toggleWatch('+price.type_id+',\''+price.name_cn.replace(/'/g,"\\'")+'\')" id="watchBtn">+ \u5173\u6ce8</button>';
  }

  area.innerHTML = '<div class="result-header"><h2>'+price.name_cn+' ('+price.name_en+')</h2><div><span class="quality-badge quality-complete">#'+price.type_id+'</span>'+watchBtn+'</div></div>'+
    '<div class="market-quote"><div class="quote-grid">'+
    '<div class="quote-card sell"><div class="qlabel">最低卖单价 <span style="font-size:10px;color:#484f58">(去极值)</span></div><div class="qval">'+fmt(sellMin)+'</div><div class="qvol">量 '+fmtV(sellVol)+' | 权均 '+fmtShort(trimmedSell.avg||0)+' | 中位 '+fmtShort(trimmedSell.median||0)+'</div></div>'+
    '<div class="quote-card buy"><div class="qlabel">最高买单价 <span style="font-size:10px;color:#484f58">(去极值)</span></div><div class="qval">'+fmt(buyMax)+'</div><div class="qvol">量 '+fmtV(buyVol)+' | 权均 '+fmtShort(trimmedBuy.avg||0)+' | 中位 '+fmtShort(trimmedBuy.median||0)+'</div></div>'+
    '<div class="quote-card '+(spread<=0?'negative':'')+'"><div class="qlabel">买卖价差</div><div class="qval">'+fmt(spread)+'</div><div class="qvol">'+spPct.toFixed(2)+'%</div></div>'+
    '<div class="quote-card"><div class="qlabel">7日去极值加权均价</div><div class="qval">'+fmt(d7avg)+'</div><div class="qvol">7d-90d '+(diff>0?'+':(diff<0?'':' '))+fmt(Math.abs(diff))+'</div></div>'+
    '</div></div>'+
    '<div class="history-table"><h3>多时段去极值加权均价</h3><table><thead><tr><th>时段</th><th class="text-right">去极值加权均价</th><th class="text-right">数量</th></tr></thead><tbody>'+histRows+'</tbody></table></div>'+
    '<div id="profitSection"></div>';

  if (calc && calc.modes) { renderProfit(calc); }
  else { document.getElementById('profitSection').innerHTML = '<div class="no-result" style="padding:20px">此物品没有制造蓝图</div>'; }
}

function renderProfit(calc) {
  const section = document.getElementById('profitSection');
  if (!calc || !calc.modes) { section.innerHTML = '<div class="no-result" style="padding:20px">此物品没有制造蓝图</div>'; return; }

  const modeCards = calc.modes.map(m => {
    const pClass = m.profit > 0 ? 'positive' : (m.profit < 0 ? 'negative' : 'warning');
    const qClass = m.data_quality === '\u6570\u636e\u5b8c\u6574' ? 'quality-complete' : (m.data_quality === '\u90e8\u5206\u7f3a\u5931' ? 'quality-partial' : 'quality-warn');
    const h = Math.floor(calc.manufacturing_time / 3600);
    const mn = Math.floor((calc.manufacturing_time % 3600) / 60);
    let missHtml = '';
    if (m.missing_materials && m.missing_materials.length) { missHtml = '<div class="missing-mat">缺 '+m.missing_materials.length+' 种材料价格</div>'; }
    return '<div class="mode-card"><div class="mode-header"><span class="mode-label">'+m.label+'</span><span class="quality-badge '+qClass+'">'+m.data_quality+' ('+m.priced_count+'/'+m.total_count+')</span></div>'+
      '<div class="mode-desc">'+m.desc+'</div>'+missHtml+
      '<div class="mode-numbers">'+
      '<div class="mode-num"><span class="mode-num-label">'+(m===calc.modes[0]?'\u6536\u5165':'\u6536\u5165')+'</span><span class="mode-num-val">'+fmt(m.revenue)+'</span></div>'+
      '<div class="mode-num"><span class="mode-num-label">'+(m===calc.modes[0]?'\u6210\u672c':'\u6210\u672c')+'</span><span class="mode-num-val">'+fmt(m.total_cost)+'</span></div>'+
      '<div class="mode-num"><span class="mode-num-label '+pClass+'">\u5229\u6da6</span><span class="mode-num-val '+pClass+'">'+fmt(m.profit)+'</span></div>'+
      '<div class="mode-num"><span class="mode-num-label '+pClass+'">\u5229\u6da6\u7387</span><span class="mode-num-val '+pClass+'">'+m.profit_margin.toFixed(1)+'%</span></div>'+
      '<div class="mode-num"><span class="mode-num-label">'+h+'h '+mn+'m</span><span class="mode-num-val '+pClass+'">'+fmt(m.isk_per_hour)+'</span></div>'+
      '<div class="mode-num"><span class="mode-num-label">24h\u5229\u6da6</span><span class="mode-num-val '+pClass+'">'+fmt(m.profit_24h)+'</span></div>'+
      '</div></div>';
  }).join('');

  const ideal = calc.modes.find(m => m.key === 'ideal') || calc.modes[0];

  const matRows = calc.materials.map(m => {
    const flag = m.has_price ? '' : ' <span class="text-danger">[\u65e0\u6570\u636e]</span>';
    return '<tr><td>'+m.name+flag+'</td><td class="text-right">'+m.quantity.toLocaleString()+'</td><td class="text-right">'+fmt(m.buy_price)+'</td><td class="text-right">'+fmt(m.sell_price)+'</td>'+
      '<td class="text-center"><select id="mat-mode-'+m.type_id+'" class="mat-mode-select" onchange="overrideMaterial('+m.type_id+', this.value)"'+(m.has_price?'':' disabled')+'>'+
      '<option value="buy"'+(m.default_pricing_mode==='buy'?' selected':'')+'>\u6536\u5355</option>'+
      '<option value="sell"'+(m.default_pricing_mode==='sell'?' selected':'')+'>\u5356\u5355</option>'+
      '<option value="self"'+(m.default_pricing_mode==='self'?' selected':'')+'>\u81ea\u4ea7</option></select></td></tr>';
  }).join('');

  const bomBtn = calc.deep_bom && calc.deep_bom.length ? '<button id="deepBomBtn" class="bom-toggle" onclick="toggleDeepBom()" style="margin:10px 0">'+(bomActive?'收起全量材料':'展开全量材料')+'</button>' : '';

  section.innerHTML = '<div class="profit-section"><h3>利润计算</h3><div class="mode-grid">'+modeCards+'</div>'+
    '<div class="cost-breakdown" style="margin-top:16px"><h4>成本分项（基于理想模式）</h4>'+
    '<div class="breakdown-row"><span>基础材料成本</span><span>'+fmt(ideal.material_cost)+'</span></div>'+
    '<div class="breakdown-row"><span>效率修正后</span><span>'+fmt(ideal.material_cost_eff)+'</span></div>'+
    '<div class="breakdown-row"><span>星系成本指数</span><span>'+fmt(ideal.system_cost)+'</span></div>'+
    '<div class="breakdown-row"><span>设施税</span><span>'+fmt(ideal.facility_tax)+'</span></div>'+
    '<div class="breakdown-row total"><span>总制造费用</span><span>'+fmt(ideal.total_cost)+'</span></div></div>'+
    bomBtn+
    '<div class="materials-table" id="directMaterialsTable" style="display:'+(bomActive?'none':'block')+'"><h4>材料清单</h4><table><thead><tr><th>材料</th><th class="text-right">数量</th><th class="text-right">收单价</th><th class="text-right">卖单价</th><th class="text-center">定价</th></tr></thead><tbody>'+matRows+'</tbody></table></div>'+
    '<div id="deepBomContainer" class="deep-bom" style="display:'+(bomActive?'block':'none')+';margin-top:8px"><h4>全量材料追溯</h4>'+
    '<table><thead><tr><th>材料</th><th class="text-right">总数量</th><th class="text-right">收单价</th><th class="text-right">卖单价</th><th class="text-right">收单总价</th><th class="text-right">卖单总价</th><th class="text-center">类型</th><th class="text-center">定价</th></tr></thead><tbody>'+
    (calc.deep_bom||[]).map(m => {
      const matInfo = (calc.materials||[]).find(x => x.type_id === m.type_id) || {};
      const mode = matInfo.default_pricing_mode || 'sell';
      return '<tr><td>'+m.name+'</td><td class="text-right">'+m.total_quantity.toLocaleString()+'</td><td class="text-right">'+fmt(m.buy_price)+'</td><td class="text-right">'+fmt(m.sell_price)+'</td><td class="text-right">'+fmt(m.total_buy_cost)+'</td><td class="text-right">'+fmt(m.total_sell_cost)+'</td><td class="text-center" style="font-size:11px;color:#8b949e">'+(m.is_base_mineral?'\u57fa\u7840\u77ff\u7269':(m.is_terminal?'\u7ec8\u7aef\u7269\u6599':'\u4e2d\u95f4\u6750\u6599'))+'</td>'+
      '<td class="text-center"><select id="mat-mode-'+m.type_id+'" class="mat-mode-select" onchange="overrideMaterial('+m.type_id+', this.value)">'+
      '<option value="buy"'+(mode==='buy'?' selected':'')+'>收单</option><option value="sell"'+(mode==='sell'?' selected':'')+'>卖单</option><option value="self"'+(mode==='self'?' selected':'')+'>自产</option></select></td></tr>';
    }).join('')+'</tbody></table></div></div>';
}

function toggleDeepBom() {
  bomActive = !bomActive;
  const btn = document.getElementById('deepBomBtn');
  if (btn) btn.textContent = bomActive ? '收起全量材料' : '展开全量材料';
  fetchData(selectedTypeId, bomActive);
}
