let selectedTypeId = null;
let debounceTimer = null;
let lastCalcData = null;

document.addEventListener('DOMContentLoaded', async () => {
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
  loadCategories();
});

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
  } catch {
    document.getElementById('categoryTree').textContent = '加载分类失败';
  }
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
  const t = document.createElement('span'); t.className = 'cat-toggle'; t.textContent = '▶'; h.appendChild(t);
  const n = document.createElement('span'); n.className = 'cat-name'; n.textContent = node.name; h.appendChild(n);
  if (node.hasTypes && (!node.children || !node.children.length)) {
    h.style.cursor = 'pointer';
    h.onclick = () => { loadCategoryItems(node.id, node.name); if (window.innerWidth <= 768) toggleSidebar(); };
  } else if (node.children && node.children.length) {
    let open = false;
    const cc = document.createElement('div'); cc.className = 'cat-children'; renderTree(node.children, cc);
    h.onclick = () => { open = !open; t.textContent = open ? '▼' : '▶'; cc.classList.toggle('open', open); };
    div.appendChild(h); div.appendChild(cc); return div;
  }
  div.appendChild(h); return div;
}
async function loadCategoryItems(gid, gname) {
  const a = document.getElementById('categoryItems'), l = document.getElementById('categoryItemList'), lb = document.getElementById('categoryLabel');
  a.style.display = 'block'; l.innerHTML = '<div style="color:#484f58;grid-column:span 2;padding:10px;text-align:center">加载中...</div>'; lb.textContent = gname;
  try {
    const r = await fetch(`/api/items-by-category?group_id=${gid}`), d = await r.json();
    document.getElementById('categoryCount').textContent = d.items.length;
    if (!d.items.length) { l.innerHTML = '<div style="color:#484f58;grid-column:span 2;padding:10px;text-align:center">此分类下暂无物品</div>'; return; }
    l.innerHTML = d.items.map(i => `<div class="cat-item" onclick="selectItem(${i.typeID},'${i.name.replace(/'/g,"\\'")}')">${i.name}</div>`).join('');
  } catch { l.innerHTML = '<div style="color:#f85149;grid-column:span 2;padding:10px;text-align:center">加载失败</div>'; }
}

// ========== 搜索 ==========
document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(debounceTimer);
  const q = e.target.value.trim();
  if (q.length < 1) { document.getElementById('searchResults').style.display = 'none'; return; }
  debounceTimer = setTimeout(async () => {
    try { const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`), d = await r.json(); renderSearchResults(d.items); } catch {}
  }, 250);
});
function renderSearchResults(items) {
  const c = document.getElementById('searchResults');
  if (!items || !items.length) { c.style.display = 'none'; return; }
  c.innerHTML = items.map(i => `<div class="search-result-item" onclick="selectItem(${i.typeID},'${i.name.replace(/'/g,"\\'")}')"><span>${i.name}</span><span class="result-typeid">#${i.typeID}</span></div>`).join('');
  c.style.display = 'block';
}

function selectItem(typeId, name) {
  selectedTypeId = typeId; document.getElementById('searchInput').value = name;
  document.getElementById('searchResults').style.display = 'none';
  fetchData(typeId);
}
function getCfg() {
  return {
    sci: parseFloat(document.getElementById('cfgSci').value)/100||0.03,
    bonus: parseFloat(document.getElementById('cfgBonus').value)/100||0.04,
    tax: parseFloat(document.getElementById('cfgTax').value)/100||0.01,
    me: parseInt(document.getElementById('cfgMe').value)||0,
  };
}
document.querySelectorAll('.config-bar input').forEach(el => {
  el.addEventListener('change', () => { if (selectedTypeId) fetchData(selectedTypeId); });
});

// ========== 主查询 ==========
async function fetchData(typeId) {
  const area = document.getElementById('resultArea');
  area.style.display = 'block';
  area.innerHTML = '<div class="loading">⏳ 拉取吉他市场数据...</div>';
  const [pRes, cRes] = await Promise.all([
    fetch(`/api/price?type_id=${typeId}`).catch(()=>null),
    fetch(`/api/calculate?type_id=${typeId}&sci=${getCfg().sci}&bonus=${getCfg().bonus}&tax=${getCfg().tax}&me=${getCfg().me}`).catch(()=>null),
  ]);
  let priceData = pRes ? await pRes.json() : null;
  let calcData = cRes ? await cRes.json() : null;
  if (!priceData || !priceData.ok) { area.innerHTML = '<div class="no-result">无法获取市场价格</div>'; return; }
  lastCalcData = calcData && calcData.ok ? calcData.data : null;
  renderResult(priceData, lastCalcData);
}

function fmt(v) { return v.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})+' ISK'; }
function fmtV(v) { return v.toLocaleString('zh-CN'); }

// ========== 材料定价切换 ==========
function overrideMaterial(matId, mode) {
  if (!lastCalcData) return;
  const ov = {};
  for (const m of lastCalcData.materials) {
    const el = document.getElementById(`mat-mode-${m.type_id}`);
    if (el) ov[m.type_id] = el.value;
  }
  ov[matId] = mode;
  recalcWithOverrides(ov);
}

function recalcWithOverrides(overrides) {
  const cfg = getCfg();
  const area = document.getElementById('resultArea');
  const params = new URLSearchParams({
    type_id: selectedTypeId, sci: cfg.sci, bonus: cfg.bonus, tax: cfg.tax, me: cfg.me,
    overrides: JSON.stringify(overrides),
  });
  fetch(`/api/calculate?${params}`).then(r=>r.json()).then(d => {
    if (d.ok) { lastCalcData = d.data; renderProfit(d.data); }
  }).catch(()=>{});
}

// ========== 渲染 ==========
function renderResult(price, calc) {
  const area = document.getElementById('resultArea');
  const p = price, buy = p.buy||{}, sell = p.sell||{}, all = p.all||{};
  const sellMin = sell.min||0, buyMax = buy.max||0, spread = sellMin - buyMax;
  const spPct = buyMax > 0 ? (spread/buyMax*100) : 0;

  area.innerHTML = `
    <div class="result-header"><h2>${p.name_cn} (${p.name_en})</h2><span class="quality-badge quality-complete">#${p.type_id}</span></div>
    <div class="market-quote">
      <div class="quote-grid">
        <div class="quote-card sell"><div class="qlabel">📤 最低卖单价</div><div class="qval">${fmt(sellMin)}</div><div class="qvol">卖单总量: ${fmtV(sell.volume||0)}</div></div>
        <div class="quote-card buy"><div class="qlabel">📥 最高买单价</div><div class="qval">${fmt(buyMax)}</div><div class="qvol">买单总量: ${fmtV(buy.volume||0)}</div></div>
        <div class="quote-card ${spread<=0?'negative':''}"><div class="qlabel">📏 买卖价差</div><div class="qval">${fmt(spread)}</div><div class="qvol">${spPct.toFixed(2)}%</div></div>
        <div class="quote-card"><div class="qlabel">📊 24h 均价</div><div class="qval">${fmt(all.avg||0)}</div><div class="qvol">中位数: ${fmt(all.median||0)}</div></div>
      </div>
    </div>
    <div id="profitSection"></div>`;

  if (calc && calc.modes) {
    renderProfit(calc);
  } else {
    document.getElementById('profitSection').innerHTML = '<div class="no-result" style="padding:20px">此物品没有制造蓝图，仅展示市场行情</div>';
  }
}

function renderProfit(calc) {
  const section = document.getElementById('profitSection');
  if (!calc || !calc.modes) { section.innerHTML = '<div class="no-result" style="padding:20px">此物品没有制造蓝图</div>'; return; }

  // 3 种模式卡片
  const modeCards = calc.modes.map(m => {
    const pClass = m.profit > 0 ? 'positive' : (m.profit < 0 ? 'negative' : 'warning');
    const qClass = m.data_quality === '数据完整' ? 'quality-complete' :
                   m.data_quality === '部分缺失' ? 'quality-partial' : 'quality-warn';
    const h = Math.floor(calc.manufacturing_time / 3600);
    const mn = Math.floor((calc.manufacturing_time % 3600) / 60);
    let missHtml = '';
    if (m.missing_materials && m.missing_materials.length) {
      missHtml = `<div class="missing-mat">⚠ 缺 ${m.missing_materials.length} 种材料价格</div>`;
    }
    return `<div class="mode-card">
      <div class="mode-header">
        <span class="mode-label">${m.label}</span>
        <span class="quality-badge ${qClass}">${m.data_quality} (${m.priced_count}/${m.total_count})</span>
      </div>
      <div class="mode-desc">${m.desc}</div>
      ${missHtml}
      <div class="mode-numbers">
        <div class="mode-num"><span class="mode-num-label">收入</span><span class="mode-num-val">${fmt(m.revenue)}</span></div>
        <div class="mode-num"><span class="mode-num-label">成本</span><span>${fmt(m.total_cost)}</span></div>
        <div class="mode-num"><span class="mode-num-label ${pClass}">利润</span><span class="${pClass}">${fmt(m.profit)}</span></div>
        <div class="mode-num"><span class="mode-num-label ${pClass}">利润率</span><span class="${pClass}">${m.profit_margin.toFixed(1)}%</span></div>
        <div class="mode-num"><span class="mode-num-label">${h}h${mn}m</span><span class="${pClass}">${fmt(m.isk_per_hour)}/h</span></div>
      </div>
    </div>`;
  }).join('');

  // 成本分项（取 ideal 模式的）
  const ideal = calc.modes.find(m => m.key === 'ideal') || calc.modes[0];

  // 材料表格（含定价切换）
  const matRows = calc.materials.map(m => {
    const flag = m.has_price ? '' : ' <span class="text-danger">[无数据]</span>';
    return `<tr>
      <td>${m.name}${flag}</td>
      <td class="text-right">${m.quantity.toLocaleString()}</td>
      <td class="text-right">${fmt(m.buy_price)}</td>
      <td class="text-right">${fmt(m.sell_price)}</td>
      <td class="text-center">
        <select id="mat-mode-${m.type_id}" class="mat-mode-select" onchange="overrideMaterial(${m.type_id}, this.value)" ${m.has_price?'':'disabled'}>
          <option value="buy" ${m.default_pricing_mode==='buy'?'selected':''}>收单</option>
          <option value="sell" ${m.default_pricing_mode==='sell'?'selected':''}>卖单</option>
          <option value="self" ${m.default_pricing_mode==='self'?'selected':''}>自产</option>
        </select>
      </td>
    </tr>`;
  }).join('');

  section.innerHTML = `
    <div class="profit-section">
      <h3>📊 利润计算</h3>
      <div class="mode-grid">${modeCards}</div>
      <div class="cost-breakdown" style="margin-top:16px">
        <h4>成本分项（基于理想模式）</h4>
        <div class="breakdown-row"><span>基础材料成本</span><span>${fmt(ideal.material_cost)}</span></div>
        <div class="breakdown-row"><span>效率修正后</span><span>${fmt(ideal.material_cost_eff)}</span></div>
        <div class="breakdown-row"><span>星系成本指数</span><span>${fmt(ideal.system_cost)}</span></div>
        <div class="breakdown-row"><span>设施税</span><span>${fmt(ideal.facility_tax)}</span></div>
        <div class="breakdown-row total"><span>总制造费用</span><span>${fmt(ideal.total_cost)}</span></div>
      </div>
      <div class="materials-table">
        <h4>材料清单 <span style="font-size:12px;color:#484f58;font-weight:400">（可逐项切换定价方式）</span></h4>
        <table>
          <thead><tr>
            <th>材料</th><th class="text-right">数量</th><th class="text-right">收单价</th><th class="text-right">卖单价</th><th class="text-center">定价</th>
          </tr></thead>
          <tbody>${matRows}</tbody>
        </table>
      </div>
    </div>`;
}
