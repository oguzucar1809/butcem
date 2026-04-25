/* =============================================
   FINANS TAKİP — APP LOGIC
   ============================================= */

// ---- DATA ----
let data = JSON.parse(localStorage.getItem('finans_data') || '[]');
let budgets = JSON.parse(localStorage.getItem('finans_budgets') || '{}');
let activeFilter = 'tümü';
let activeTur = 'gider';
let pieChart = null, barChart = null, yatirimChart = null;

const CATS = {
  gider: ['Market','Faturalar','Kira','Ulaşım','Sağlık','Eğlence','Restoran','Giyim','Eğitim','Abonelik','Diğer'],
  gelir: ['Maaş','Freelance / Serbest','Kira Geliri','Temettü','Hediye','Diğer'],
  yatirim: ['Hisse Senedi','Kripto Para','Altın','Yatırım Fonu','Döviz','Gayrimenkul','Diğer']
};

const EMOJIS = {
  'Market':'🛒','Faturalar':'💡','Kira':'🏠','Ulaşım':'🚗','Sağlık':'💊','Eğlence':'🎮',
  'Restoran':'🍽️','Giyim':'👗','Eğitim':'📚','Abonelik':'📱',
  'Maaş':'💼','Freelance / Serbest':'💻','Kira Geliri':'🏠','Temettü':'📈','Hediye':'🎁',
  'Hisse Senedi':'📊','Kripto Para':'🪙','Altın':'🥇','Yatırım Fonu':'📦','Döviz':'💱','Gayrimenkul':'🏢',
  'Diğer':'📌'
};

const CHART_COLORS = [
  '#f87171','#fb923c','#fbbf24','#a3e635','#4ade80',
  '#34d399','#22d3ee','#60a5fa','#a78bfa','#f472b6'
];

function save() {
  localStorage.setItem('finans_data', JSON.stringify(data));
}

// ---- INIT ----
function init() {
  // Set today's date
  document.getElementById('f-tarih').value = new Date().toISOString().split('T')[0];

  // Topbar date
  document.getElementById('topbar-date').textContent =
    new Date().toLocaleDateString('tr-TR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  fillMonthSelects();
  renderKategoriler();
  renderOzet();
  renderIslemler();
  renderYatirimlar();
  renderBudgetInputs();

  // Check API key
  const key = localStorage.getItem('anthropic_key');
  if(key) document.getElementById('api-key-input').value = key;
}

// ---- MONTHS ----
function getMonths() {
  const set = new Set();
  const now = new Date();
  set.add(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  data.forEach(d => { if(d.tarih) set.add(d.tarih.slice(0,7)); });
  return [...set].sort().reverse();
}

function fillMonthSelects() {
  const months = getMonths();
  ['ozet-month','analiz-month','tx-month'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    const cur = el.value;
    el.innerHTML = months.map(m => {
      const [y,mo] = m.split('-');
      const lbl = new Date(y, mo-1, 1).toLocaleDateString('tr-TR', { year:'numeric', month:'long' });
      return `<option value="${m}" ${m===cur?'selected':''}>${lbl}</option>`;
    }).join('');
    if(!cur || !months.includes(cur)) el.value = months[0];
  });
}

// ---- FORMAT ----
function fmt(n) {
  return '₺' + Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function fmtSign(n, tur) {
  if(tur==='gelir') return '+' + fmt(n);
  return '-' + fmt(n);
}

// ---- TAB SWITCH ----
function switchTab(tab, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('page-'+tab).classList.add('active');
  if(btn) btn.classList.add('active');
  else document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

  const titles = { ozet:'Özet', ekle:'İşlem Ekle', islemler:'İşlemler', yatirimlar:'Yatırımlar', analiz:'YZ Analizi', ayarlar:'Ayarlar' };
  document.getElementById('topbar-title').textContent = titles[tab] || '';

  if(tab==='ozet') renderOzet();
  if(tab==='islemler') renderIslemler();
  if(tab==='yatirimlar') renderYatirimlar();

  closeSidebar();
}

// ---- SIDEBAR ----
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('overlay').classList.add('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

// ---- TÜR / KATEGORİ ----
function setTur(tur, btn) {
  activeTur = tur;
  document.querySelectorAll('.tur-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderKategoriler();
  document.getElementById('yatirim-extra').style.display = tur==='yatirim' ? 'block' : 'none';
}

function renderKategoriler() {
  const sel = document.getElementById('f-kategori');
  sel.innerHTML = CATS[activeTur].map(c => `<option value="${c}">${c}</option>`).join('');
}

// ---- EKLE ----
function ekleIslem() {
  const aciklama = document.getElementById('f-aciklama').value.trim();
  const tutar = parseFloat(document.getElementById('f-tutar').value);
  const tarih = document.getElementById('f-tarih').value;
  const kategori = document.getElementById('f-kategori').value;
  const not = document.getElementById('f-not').value.trim();
  const miktar = document.getElementById('f-miktar').value.trim();

  if(!aciklama || !tutar || isNaN(tutar) || tutar <= 0 || !tarih) {
    alert('Lütfen açıklama, tutar ve tarih alanlarını doldurun.');
    return;
  }

  const item = {
    id: Date.now(),
    tur: activeTur,
    aciklama, tutar, tarih, kategori, not,
    ...(miktar && { miktar })
  };

  data.unshift(item);
  save();
  fillMonthSelects();

  // Reset form
  document.getElementById('f-aciklama').value = '';
  document.getElementById('f-tutar').value = '';
  document.getElementById('f-not').value = '';
  document.getElementById('f-miktar').value = '';

  // Show success
  const msg = document.getElementById('success-msg');
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 2000);
}

// ---- ÖZET ----
function renderOzet() {
  const month = document.getElementById('ozet-month')?.value;
  if(!month) return;

  const filtered = data.filter(d => d.tarih?.startsWith(month));
  const gelirler = filtered.filter(d => d.tur==='gelir');
  const giderler = filtered.filter(d => d.tur==='gider');
  const yatirimlar = filtered.filter(d => d.tur==='yatirim');

  const topGelir = gelirler.reduce((s,d) => s+d.tutar, 0);
  const topGider = giderler.reduce((s,d) => s+d.tutar, 0);
  const topYatirim = yatirimlar.reduce((s,d) => s+d.tutar, 0);
  const bakiye = topGelir - topGider - topYatirim;
  const tasarruf = topGelir > 0 ? ((topGelir - topGider) / topGelir * 100).toFixed(1) : 0;

  document.getElementById('k-gelir').textContent = fmt(topGelir);
  document.getElementById('k-gelir-sub').textContent = `${gelirler.length} işlem`;
  document.getElementById('k-gider').textContent = fmt(topGider);
  document.getElementById('k-gider-sub').textContent = `${giderler.length} işlem`;
  document.getElementById('k-yatirim').textContent = fmt(topYatirim);
  document.getElementById('k-yatirim-sub').textContent = `${yatirimlar.length} işlem`;
  document.getElementById('k-bakiye').textContent = (bakiye < 0 ? '-' : '') + fmt(Math.abs(bakiye));
  document.getElementById('k-tasarruf').textContent = `%${tasarruf} tasarruf`;

  // Pie chart (gider kategorileri)
  const giderCats = {};
  giderler.forEach(d => { giderCats[d.kategori] = (giderCats[d.kategori]||0) + d.tutar; });
  const catLabels = Object.keys(giderCats);
  const catVals = catLabels.map(c => giderCats[c]);

  if(pieChart) pieChart.destroy();
  const pieCtx = document.getElementById('pieChart').getContext('2d');
  if(catLabels.length) {
    pieChart = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: catLabels,
        datasets: [{ data: catVals, backgroundColor: CHART_COLORS.slice(0,catLabels.length), borderWidth: 0 }]
      },
      options: {
        plugins: {
          legend: { position:'bottom', labels: { font:{size:11}, color:'#8a8680', boxWidth:10, padding:10 } }
        },
        cutout: '60%',
        responsive: true,
        maintainAspectRatio: false
      }
    });
  } else {
    pieChart = new Chart(pieCtx, { type:'doughnut', data:{labels:['Veri yok'],datasets:[{data:[1],backgroundColor:['#2a2a2a'],borderWidth:0}]}, options:{plugins:{legend:{display:false}},cutout:'60%',responsive:true,maintainAspectRatio:false} });
  }

  // Bar chart (gelir vs gider)
  if(barChart) barChart.destroy();
  const barCtx = document.getElementById('barChart').getContext('2d');
  barChart = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels: ['Gelir','Gider','Yatırım','Bakiye'],
      datasets: [{
        data: [topGelir, topGider, topYatirim, Math.max(0,bakiye)],
        backgroundColor: ['rgba(74,222,128,0.7)','rgba(248,113,113,0.7)','rgba(96,165,250,0.7)','rgba(212,168,84,0.7)'],
        borderWidth: 0,
        borderRadius: 6
      }]
    },
    options: {
      plugins: { legend: { display:false } },
      scales: {
        x: { ticks:{color:'#8a8680',font:{size:11}}, grid:{color:'rgba(255,255,255,0.04)'} },
        y: { ticks:{color:'#8a8680',font:{size:11}, callback: v => '₺'+v.toLocaleString('tr-TR')}, grid:{color:'rgba(255,255,255,0.04)'} }
      },
      responsive: true,
      maintainAspectRatio: false
    }
  });

  // Category bars
  const barsEl = document.getElementById('cat-bars');
  if(!catLabels.length) {
    barsEl.innerHTML = '<div class="tx-empty">Bu ay gider yok</div>';
  } else {
    const maxVal = Math.max(...catVals);
    barsEl.innerHTML = catLabels.map((c,i) => {
      const pct = (catVals[i] / maxVal * 100).toFixed(1);
      const budgetLine = budgets[c] ? `<span style="color:${catVals[i]>budgets[c]?'#f87171':'#4ade80'}"> / Limit: ${fmt(budgets[c])}</span>` : '';
      return `<div class="cat-bar-row">
        <div class="cat-bar-label">
          <span>${EMOJIS[c]||'📌'} ${c}</span>
          <span>${fmt(catVals[i])}${budgetLine}</span>
        </div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width:${pct}%;background:${CHART_COLORS[i%CHART_COLORS.length]}"></div>
        </div>
      </div>`;
    }).join('');
  }

  // Son işlemler
  const sonEl = document.getElementById('son-islemler');
  const son = filtered.slice(0,5);
  sonEl.innerHTML = son.length ? son.map(d => txHtml(d)).join('') : '<div class="tx-empty">Bu ay işlem yok</div>';
}

// ---- İŞLEMLER ----
function setFilter(f, btn) {
  activeFilter = f;
  document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderIslemler();
}

function renderIslemler() {
  const month = document.getElementById('tx-month')?.value;
  let filtered = month ? data.filter(d => d.tarih?.startsWith(month)) : data;
  if(activeFilter !== 'tümü') filtered = filtered.filter(d => d.tur===activeFilter);

  const list = document.getElementById('tx-list');
  list.innerHTML = filtered.length
    ? filtered.map(d => txHtml(d, true)).join('')
    : '<div class="tx-empty">İşlem bulunamadı</div>';
}

function txHtml(d, showDel=false) {
  const emoji = EMOJIS[d.kategori] || (d.tur==='gelir'?'💵':d.tur==='yatirim'?'📊':'💳');
  const sign = d.tur==='gelir' ? '+' : '-';
  const date = new Date(d.tarih+'T00:00:00').toLocaleDateString('tr-TR', { day:'2-digit', month:'short', year:'numeric' });
  const delBtn = showDel ? `<button class="tx-del" onclick="silIslem(${d.id})" title="Sil">×</button>` : '';
  const notStr = d.not ? ` · ${d.not.slice(0,30)}` : '';
  return `<div class="tx-item">
    <div class="tx-emoji">${emoji}</div>
    <div class="tx-info">
      <div class="tx-desc">${d.aciklama}</div>
      <div class="tx-meta">${d.kategori} · ${date}${notStr}</div>
    </div>
    <div class="tx-amount ${d.tur}">${sign}${fmt(d.tutar)}</div>
    ${delBtn}
  </div>`;
}

function silIslem(id) {
  if(!confirm('Bu işlemi silmek istiyor musunuz?')) return;
  data = data.filter(d => d.id !== id);
  save();
  renderOzet();
  renderIslemler();
  renderYatirimlar();
}

// ---- YATIRIMLAR ----
function renderYatirimlar() {
  const yatirimlar = data.filter(d => d.tur==='yatirim');
  const toplam = yatirimlar.reduce((s,d) => s+d.tutar, 0);

  document.getElementById('y-toplam').textContent = fmt(toplam);
  document.getElementById('y-sayi').textContent = yatirimlar.length;

  // Yatırım dağılım chart
  const cats = {};
  yatirimlar.forEach(d => { cats[d.kategori] = (cats[d.kategori]||0) + d.tutar; });
  const labels = Object.keys(cats);
  const vals = labels.map(c => cats[c]);

  if(yatirimChart) yatirimChart.destroy();
  const ctx = document.getElementById('yatirimChart').getContext('2d');
  if(labels.length) {
    yatirimChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: vals,
          backgroundColor: 'rgba(96,165,250,0.7)',
          borderRadius: 6,
          borderWidth: 0
        }]
      },
      options: {
        plugins: { legend: { display:false } },
        scales: {
          x: { ticks:{color:'#8a8680',font:{size:11}}, grid:{color:'rgba(255,255,255,0.04)'} },
          y: { ticks:{color:'#8a8680',font:{size:11}, callback: v => '₺'+v.toLocaleString('tr-TR')}, grid:{color:'rgba(255,255,255,0.04)'} }
        },
        responsive: true, maintainAspectRatio: false
      }
    });
  } else {
    yatirimChart = new Chart(ctx, { type:'bar', data:{labels:['Veri yok'],datasets:[{data:[0],backgroundColor:['#2a2a2a']}]}, options:{plugins:{legend:{display:false}},responsive:true,maintainAspectRatio:false} });
  }

  // List
  const list = document.getElementById('yatirim-list');
  list.innerHTML = yatirimlar.length
    ? yatirimlar.map(d => txHtml(d, true)).join('')
    : '<div class="tx-empty">Henüz yatırım kaydı yok</div>';
}

// ---- YZ ANALİZ ----
async function yapaYZAnaliz() {
  const apiKey = localStorage.getItem('anthropic_key');
  if(!apiKey) {
    alert('Lütfen önce Ayarlar sayfasından Claude API anahtarınızı ekleyin.\n\nÜcretsiz API anahtarı için: console.anthropic.com');
    switchTab('ayarlar');
    return;
  }

  const month = document.getElementById('analiz-month')?.value;
  const filtered = month ? data.filter(d => d.tarih?.startsWith(month)) : data;

  if(!filtered.length) {
    document.getElementById('ai-output').textContent = 'Bu dönemde analiz edilecek işlem bulunmuyor.';
    return;
  }

  const [y,m] = month.split('-');
  const donem = new Date(y, m-1, 1).toLocaleDateString('tr-TR', { year:'numeric', month:'long' });

  const gelir = filtered.filter(d=>d.tur==='gelir').reduce((s,d)=>s+d.tutar,0);
  const gider = filtered.filter(d=>d.tur==='gider').reduce((s,d)=>s+d.tutar,0);
  const yatirim = filtered.filter(d=>d.tur==='yatirim').reduce((s,d)=>s+d.tutar,0);
  const giderCats = {};
  filtered.filter(d=>d.tur==='gider').forEach(d => { giderCats[d.kategori] = (giderCats[d.kategori]||0)+d.tutar; });

  const prompt = `Sen deneyimli bir kişisel finans danışmanısın. Kullanıcının ${donem} dönemine ait verileri:

📊 Özet:
- Toplam Gelir: ₺${gelir.toFixed(2)}
- Toplam Gider: ₺${gider.toFixed(2)}
- Toplam Yatırım: ₺${yatirim.toFixed(2)}
- Net Bakiye: ₺${(gelir-gider-yatirim).toFixed(2)}
- Tasarruf Oranı: %${gelir>0?((gelir-gider)/gelir*100).toFixed(1):0}

💸 Gider Kategorileri:
${Object.entries(giderCats).map(([k,v]) => `- ${k}: ₺${v.toFixed(2)}`).join('\n')}

📋 Tüm İşlemler:
${filtered.map(d => `[${d.tur.toUpperCase()}] ${d.aciklama} - ₺${d.tutar} (${d.kategori})`).join('\n')}

Lütfen aşağıdaki başlıklar altında kısa ve öz Türkçe analiz yap:

**📈 Genel Durum**
Bu ayın finansal tablosunu 2-3 cümlede özetle.

**⚠️ Dikkat Noktaları**
Yüksek harcama kalemleri veya endişe verici durumları belirt.

**💡 Tasarruf Önerileri**
3 somut ve uygulanabilir öneri sun.

**✅ Olumlu Yönler**
Güzel yapılan şeyleri de belirt (varsa).

Samimi, doğrudan ve motive edici bir dil kullan. 300-400 kelime.`;

  const output = document.getElementById('ai-output');
  output.className = 'ai-output loading';
  output.textContent = '';
  document.getElementById('ai-btn-text').textContent = '⏳ Analiz ediliyor...';

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const result = await resp.json();
    output.className = 'ai-output';
    output.textContent = result.content?.[0]?.text || 'Analiz alınamadı. API yanıtını kontrol edin.';
  } catch(e) {
    output.className = 'ai-output';
    output.textContent = 'Hata: ' + e.message + '\n\nAPI anahtarınızı Ayarlar sayfasından kontrol edin.';
  }

  document.getElementById('ai-btn-text').textContent = '✦ Tekrar Analiz Et';
}

function yapaYZSoru() {
  const wrap = document.getElementById('ai-q-wrap');
  wrap.style.display = wrap.style.display === 'none' ? 'flex' : 'none';
}

async function gonderSoru() {
  const apiKey = localStorage.getItem('anthropic_key');
  if(!apiKey) { alert('Lütfen önce API anahtarı ekleyin.'); return; }

  const soru = document.getElementById('ai-question').value.trim();
  if(!soru) return;

  const month = document.getElementById('analiz-month')?.value;
  const filtered = month ? data.filter(d => d.tarih?.startsWith(month)) : data;
  const gelir = filtered.filter(d=>d.tur==='gelir').reduce((s,d)=>s+d.tutar,0);
  const gider = filtered.filter(d=>d.tur==='gider').reduce((s,d)=>s+d.tutar,0);

  const context = `Kullanıcının bu ayki verileri: Gelir: ₺${gelir.toFixed(2)}, Gider: ₺${gider.toFixed(2)}. İşlemler: ${filtered.map(d=>`${d.aciklama}(${d.kategori}):₺${d.tutar}`).join(', ')}`;
  const prompt = `${context}\n\nKullanıcı sorusu: ${soru}\n\nKısa ve net Türkçe yanıt ver.`;

  const output = document.getElementById('ai-output');
  output.className = 'ai-output loading';
  output.textContent = soru + '\n\n';

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const result = await resp.json();
    output.className = 'ai-output';
    output.textContent = soru + '\n\n' + (result.content?.[0]?.text || 'Yanıt alınamadı.');
  } catch(e) {
    output.className = 'ai-output';
    output.textContent = 'Hata: ' + e.message;
  }

  document.getElementById('ai-question').value = '';
}

// ---- AYARLAR ----
function saveApiKey() {
  const key = document.getElementById('api-key-input').value.trim();
  if(!key) { alert('API anahtarı boş bırakılamaz.'); return; }
  localStorage.setItem('anthropic_key', key);
  const msg = document.getElementById('api-success');
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 2000);
}

function renderBudgetInputs() {
  const cats = CATS.gider;
  const el = document.getElementById('budget-inputs');
  el.innerHTML = cats.map(c => `
    <div class="budget-input-row">
      <label>${EMOJIS[c]||'📌'} ${c}</label>
      <input type="number" placeholder="Limit yok" value="${budgets[c]||''}" data-cat="${c}" min="0">
    </div>`).join('');
}

function saveBudgets() {
  document.querySelectorAll('#budget-inputs input').forEach(input => {
    const cat = input.dataset.cat;
    const val = parseFloat(input.value);
    if(val > 0) budgets[cat] = val;
    else delete budgets[cat];
  });
  localStorage.setItem('finans_budgets', JSON.stringify(budgets));
  const msg = document.getElementById('budget-success');
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 2000);
}

// ---- DATA EXPORT/IMPORT ----
function exportData() {
  const blob = new Blob([JSON.stringify({ data, budgets, exportedAt: new Date().toISOString() }, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `finans-yedek-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
}

function importData() {
  document.getElementById('import-input').click();
}

function handleImport(e) {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const imported = JSON.parse(ev.target.result);
      if(!imported.data || !Array.isArray(imported.data)) { alert('Geçersiz dosya formatı.'); return; }
      if(!confirm(`${imported.data.length} işlem içe aktarılacak. Mevcut veriler korunacak. Devam edilsin mi?`)) return;
      data = [...imported.data, ...data];
      save();
      if(imported.budgets) {
        budgets = { ...imported.budgets, ...budgets };
        localStorage.setItem('finans_budgets', JSON.stringify(budgets));
      }
      fillMonthSelects();
      renderOzet();
      alert('Veriler başarıyla içe aktarıldı!');
    } catch(err) {
      alert('Dosya okunamadı: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function clearAll() {
  if(!confirm('TÜM veriler silinecek! Bu işlem geri alınamaz.\n\nDevam edilsin mi?')) return;
  if(!confirm('Emin misiniz? Tüm gelir, gider ve yatırım kayıtları silinecek.')) return;
  data = [];
  save();
  fillMonthSelects();
  renderOzet();
  renderIslemler();
  renderYatirimlar();
  alert('Tüm veriler silindi.');
}

// ---- START ----
init();
