/* =============================================
   YATIRIMLAR.JS v1.0
   Pozisyon takibi, alış/satış, kar/zarar,
   Yahoo Finance fiyat çekme (proxy üzerinden)
   ============================================= */

let pozisyonlar = JSON.parse(localStorage.getItem('yat_pozisyonlar') || '[]');
let islemler    = JSON.parse(localStorage.getItem('yat_islemler')    || '[]');
let hesaplar    = JSON.parse(localStorage.getItem('finans_hesaplar') || '[]');
let fiyatCache  = JSON.parse(localStorage.getItem('yat_fiyatlar')   || '{}'); // { ticker: { fiyat, zaman } }

let activeYFilter   = 'tümü';
let activeIslemFilter = 'tümü';
let activeIslemTip  = 'alis';
let katChart = null, varlikChart = null;

const TUR_ICONS = {
  hisse:'📈', fon:'📦', etf:'🗂️', kripto:'🪙',
  altin:'🥇', mevduat:'🏛️', doviz:'💱', diger:'📌'
};
const TUR_RENKLER = {
  hisse:'#60a5fa', fon:'#a78bfa', etf:'#34d399',
  kripto:'#fb923c', altin:'#d4a854', mevduat:'#4ade80',
  doviz:'#22d3ee', diger:'#8a8680'
};
const PARA_SEMBOLLERI = { TRY:'₺', USD:'$', EUR:'€', GBP:'£' };
const CHART_COLORS = ['#d4a854','#60a5fa','#4ade80','#f87171','#a78bfa','#fb923c','#34d399','#f472b6','#22d3ee','#e879f9'];

// Yahoo Finance proxy listesi — birini dene, çalışmazsa diğerine geç
const YAHOO_PROXIES = [
  'https://query1.finance.yahoo.com/v8/finance/chart/',
  'https://query2.finance.yahoo.com/v8/finance/chart/'
];

function saveAll() {
  localStorage.setItem('yat_pozisyonlar', JSON.stringify(pozisyonlar));
  localStorage.setItem('yat_islemler',    JSON.stringify(islemler));
  localStorage.setItem('yat_fiyatlar',    JSON.stringify(fiyatCache));
}

function today() { return new Date().toISOString().split('T')[0]; }

function fmt(n, para='TRY') {
  const s = PARA_SEMBOLLERI[para] || '₺';
  return s + Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtAdet(n) {
  return n % 1 === 0 ? n.toLocaleString('tr-TR') : n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

// ── INIT ──
function init() {
  document.getElementById('topbar-date') && (document.getElementById('topbar-date').textContent =
    new Date().toLocaleDateString('tr-TR', { weekday:'long', day:'numeric', month:'long', year:'numeric' }));

  fillHesapSelects();
  renderPortfoy();
  renderIslemler();
  renderKapali();
  renderDagilim();
  renderKPIs();

  // Auto fiyat güncelle (son güncellemeden 15 dk geçtiyse)
  const tickerliPoz = pozisyonlar.filter(p => p.ticker && p.durum === 'acik');
  if (tickerliPoz.length > 0) {
    const enEski = tickerliPoz.reduce((min, p) => {
      const cache = fiyatCache[p.ticker];
      if (!cache) return 0;
      return Math.min(min, cache.zaman);
    }, Date.now());
    if (Date.now() - enEski > 15 * 60 * 1000) {
      fiyatlariGuncelle();
    } else {
      const tarih = new Date(enEski);
      document.getElementById('price-update-info').textContent =
        `Son: ${tarih.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })}`;
    }
  }
}

// ── SIDEBAR ──
function openSidebar()  { document.getElementById('sidebar').classList.add('open');    document.getElementById('overlay').classList.add('show'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('show'); }

// ── TAB ──
function switchYTab(tab, btn) {
  document.querySelectorAll('.ypanel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.ytab').forEach(b => b.classList.remove('active'));
  document.getElementById('ypanel-'+tab).classList.add('active');
  btn.classList.add('active');
  if (tab === 'dagilim') renderDagilim();
}

// ── HESAP SELECT ──
function fillHesapSelects() {
  const opts = hesaplar.length
    ? hesaplar.map(h => `<option value="${h.id}">${h.ad}</option>`).join('')
    : '<option value="">— Önce hesap ekleyin —</option>';
  document.getElementById('p-hesap').innerHTML = opts;
}

function fillPozisyonSelect() {
  const acikPoz = pozisyonlar.filter(p => p.durum === 'acik');
  document.getElementById('i-pozisyon').innerHTML = acikPoz.length
    ? acikPoz.map(p => `<option value="${p.id}">${TUR_ICONS[p.tur]||'📌'} ${p.ad}${p.ticker ? ' ('+p.ticker+')' : ''}</option>`).join('')
    : '<option value="">Açık pozisyon yok</option>';
}

// ── FİYAT ÇEKME (Yahoo Finance) ──
async function tickerFiyatCek(ticker) {
  // Yahoo Finance CORS izin veriyor (bazı tarayıcılarda, bazı tickerlar için)
  // Farklı proxy URL formatları dene
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const result = data?.chart?.result?.[0];
      if (!result) continue;
      const meta = result.meta;
      const fiyat = meta.regularMarketPrice || meta.previousClose;
      if (fiyat) return fiyat;
    } catch (e) {
      // Sonraki URL'yi dene
    }
  }
  return null;
}

async function fiyatlariGuncelle() {
  const btn = document.getElementById('refresh-btn');
  const info = document.getElementById('price-update-info');
  btn.classList.add('loading');
  btn.textContent = '↻ Güncelleniyor...';
  info.textContent = 'Fiyatlar çekiliyor...';

  const tickerliPoz = pozisyonlar.filter(p => p.ticker && p.durum === 'acik');
  if (!tickerliPoz.length) {
    info.textContent = 'Ticker tanımlı pozisyon yok';
    btn.classList.remove('loading');
    btn.textContent = '↻ Güncelle';
    return;
  }

  // Benzersiz tickerları topla
  const tickers = [...new Set(tickerliPoz.map(p => p.ticker))];
  let basarili = 0, basarisiz = 0;

  for (const ticker of tickers) {
    const fiyat = await tickerFiyatCek(ticker);
    if (fiyat !== null) {
      fiyatCache[ticker] = { fiyat, zaman: Date.now() };
      basarili++;
    } else {
      basarisiz++;
    }
    // Rate limit için kısa bekleme
    await new Promise(r => setTimeout(r, 300));
  }

  saveAll();
  renderPortfoy();
  renderKPIs();

  const saat = new Date().toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
  if (basarili > 0) {
    info.textContent = `${basarili} güncellendi · ${saat}`;
  } else {
    info.textContent = `⚠ Fiyat çekilemedi — CORS engeli olabilir`;
  }
  if (basarisiz > 0 && basarili === 0) {
    info.textContent += ' · Manuel fiyat girin';
  }

  btn.classList.remove('loading');
  btn.textContent = '↻ Güncelle';
}

// ── POZİSYON — GÜNCEL FİYAT ──
function guncelFiyatAl(poz) {
  if (poz.ticker && fiyatCache[poz.ticker]) {
    return { fiyat: fiyatCache[poz.ticker].fiyat, kaynak: 'live' };
  }
  if (poz.guncelFiyat && poz.guncelFiyat > 0) {
    return { fiyat: poz.guncelFiyat, kaynak: 'manuel' };
  }
  return { fiyat: poz.alisFiyati || 0, kaynak: 'alis' };
}

// ── KPIs ──
function renderKPIs() {
  const acikPoz = pozisyonlar.filter(p => p.durum === 'acik');
  const kapaliPoz = pozisyonlar.filter(p => p.durum === 'kapali');

  let topMaliyet = 0, topDeger = 0;
  acikPoz.forEach(p => {
    const maliyet = (p.miktar || 0) * (p.alisFiyati || 0);
    const { fiyat } = guncelFiyatAl(p);
    const deger = (p.miktar || 0) * fiyat;
    topMaliyet += maliyet;
    topDeger   += deger;
  });

  const karZarar = topDeger - topMaliyet;
  const karPct   = topMaliyet > 0 ? (karZarar / topMaliyet * 100) : 0;

  document.getElementById('kpi-maliyet').textContent = fmt(topMaliyet);
  document.getElementById('kpi-deger').textContent   = fmt(topDeger);
  document.getElementById('kpi-kar').textContent     = (karZarar >= 0 ? '+' : '-') + fmt(Math.abs(karZarar));
  document.getElementById('kpi-kar').style.color     = karZarar >= 0 ? 'var(--gelir)' : 'var(--gider)';
  document.getElementById('kpi-kar-pct').textContent = `${karPct >= 0 ? '+' : ''}${karPct.toFixed(2)}%`;
  document.getElementById('kpi-kar-pct').style.color = karZarar >= 0 ? 'var(--gelir)' : 'var(--gider)';
  document.getElementById('kpi-kar-kart').className  = `kpi ${karZarar >= 0 ? 'kpi-gelir' : 'kpi-gider'}`;
  document.getElementById('kpi-acik').textContent    = acikPoz.length;
  document.getElementById('kpi-kapali-text').textContent = `${kapaliPoz.length} kapalı`;

  // Kapalı kar/zarar
  let realizeKar = 0, realizeZarar = 0;
  kapaliPoz.forEach(p => {
    const kz = p.kapanisKarZarar || 0;
    if (kz >= 0) realizeKar += kz; else realizeZarar += Math.abs(kz);
  });
  document.getElementById('realize-kar').textContent   = '+' + fmt(realizeKar);
  document.getElementById('realize-zarar').textContent = '-' + fmt(realizeZarar);
  const net = realizeKar - realizeZarar;
  document.getElementById('realize-net').textContent   = (net >= 0 ? '+' : '-') + fmt(Math.abs(net));
  document.getElementById('realize-net').style.color   = net >= 0 ? 'var(--gelir)' : 'var(--gider)';
}

// ── PORTFÖY RENDER ──
function setYFilter(f, btn) {
  activeYFilter = f;
  document.querySelectorAll('#ypanel-portfoy .fbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderPortfoy();
}

function renderPortfoy() {
  let filtered = pozisyonlar.filter(p => p.durum === 'acik');
  if (activeYFilter !== 'tümü') filtered = filtered.filter(p => p.tur === activeYFilter);

  const grid = document.getElementById('pozisyon-grid');
  if (!filtered.length) {
    grid.innerHTML = '<div class="poz-empty">Henüz açık pozisyon yok.<br>+ Pozisyon Ekle butonuna tıklayın.</div>';
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const { fiyat, kaynak } = guncelFiyatAl(p);
    const maliyet  = (p.miktar || 0) * (p.alisFiyati || 0);
    const deger    = (p.miktar || 0) * fiyat;
    const karZarar = deger - maliyet;
    const karPct   = maliyet > 0 ? (karZarar / maliyet * 100) : 0;
    const cls      = karZarar > 0 ? 'kar' : karZarar < 0 ? 'zarar' : 'notr';
    const renk     = TUR_RENKLER[p.tur] || '#8a8680';

    // Hedef fiyat çubuğu
    let hedefHtml = '';
    if (p.hedefFiyat && p.hedefFiyat > 0 && p.alisFiyati > 0) {
      const pct = Math.min(((fiyat - p.alisFiyati) / (p.hedefFiyat - p.alisFiyati)) * 100, 100);
      hedefHtml = `<div class="poz-hedef-bar">
        <div class="poz-hedef-label">
          <span>Hedefe ilerleme</span>
          <span>Hedef: ${fmt(p.hedefFiyat, p.para)}</span>
        </div>
        <div class="poz-hedef-track">
          <div class="poz-hedef-fill" style="width:${Math.max(0,pct).toFixed(1)}%"></div>
        </div>
      </div>`;
    }

    // Mevduat vade
    let vadeBadge = '';
    if (p.tur === 'mevduat' && p.vadeTarihi) {
      const kalan = Math.ceil((new Date(p.vadeTarihi) - new Date()) / 86400000);
      vadeBadge = `<div class="poz-vade-badge ${kalan <= 7 ? 'acil' : ''}">
        ${kalan > 0 ? `${kalan} gün kaldı` : 'Vade doldu!'} · ${new Date(p.vadeTarihi).toLocaleDateString('tr-TR')}
      </div>`;
    }

    // Faiz bilgisi
    let faizHtml = '';
    if (p.tur === 'mevduat' && p.faiz) {
      faizHtml = `<div class="poz-stat">
        <div class="poz-stat-label">Yıllık Faiz</div>
        <div class="poz-stat-value">%${p.faiz}</div>
      </div>`;
    }

    // Fiyat durumu
    const priceStatusText = kaynak === 'live' ? '● Canlı fiyat' : kaynak === 'manuel' ? '◌ Manuel fiyat' : '— Alış fiyatı';
    const priceStatusCls  = kaynak === 'live' ? 'live' : 'stale';
    const cacheZaman      = p.ticker && fiyatCache[p.ticker] ? new Date(fiyatCache[p.ticker].zaman).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : '';

    return `<div class="poz-card ${cls}">
      <div class="poz-header">
        <div class="poz-icon" style="background:${renk}20;color:${renk}">${TUR_ICONS[p.tur]||'📌'}</div>
        <div class="poz-title">
          <div class="poz-ad">${p.ad}</div>
          <div class="poz-ticker">${p.ticker || p.tur.toUpperCase()} · ${p.hesapAd || ''}</div>
        </div>
        <div class="poz-actions">
          <button class="poz-btn" onclick="showIslemModal('${p.id}')" title="Alım/Satım Ekle">+</button>
          <button class="poz-btn" onclick="showPozisyonModal('${p.id}')" title="Düzenle">✎</button>
          <button class="poz-btn" onclick="pozisyonKapat('${p.id}')" title="Pozisyonu Kapat">✓</button>
          <button class="poz-btn" onclick="silPozisyon('${p.id}')" title="Sil" style="color:var(--gider)">×</button>
        </div>
      </div>

      <div class="poz-body">
        <div class="poz-stat">
          <div class="poz-stat-label">Miktar</div>
          <div class="poz-stat-value">${fmtAdet(p.miktar || 0)}</div>
        </div>
        <div class="poz-stat">
          <div class="poz-stat-label">Alış Fiyatı</div>
          <div class="poz-stat-value">${fmt(p.alisFiyati || 0, p.para)}</div>
        </div>
        <div class="poz-stat">
          <div class="poz-stat-label">Güncel Fiyat</div>
          <div class="poz-stat-value ${cls}">${fmt(fiyat, p.para)}</div>
        </div>
        <div class="poz-stat">
          <div class="poz-stat-label">Toplam Değer</div>
          <div class="poz-stat-value">${fmt(deger, p.para)}</div>
        </div>
        <div class="poz-stat">
          <div class="poz-stat-label">Maliyet</div>
          <div class="poz-stat-value">${fmt(maliyet, p.para)}</div>
        </div>
        ${faizHtml}
      </div>

      <div class="poz-kar-row ${cls}">
        <span class="poz-kar-label">Kar / Zarar</span>
        <span>
          <span class="poz-kar-val ${cls}">${karZarar >= 0 ? '+' : '-'}${fmt(Math.abs(karZarar), p.para)}</span>
          <span class="poz-kar-pct" style="color:${cls==='kar'?'var(--gelir)':cls==='zarar'?'var(--gider)':'var(--text3)'}">
            ${karPct >= 0 ? '+' : ''}${karPct.toFixed(2)}%
          </span>
        </span>
      </div>

      ${hedefHtml}
      ${vadeBadge}
      ${p.not ? `<div style="font-size:11px;color:var(--text3);margin-top:6px">${p.not}</div>` : ''}
      <div class="poz-price-status ${priceStatusCls}">${priceStatusText}${cacheZaman ? ' · '+cacheZaman : ''}</div>
    </div>`;
  }).join('');
}

// ── İŞLEMLER RENDER ──
function setIslemFilter(f, btn) {
  activeIslemFilter = f;
  document.querySelectorAll('#ypanel-islemler .fbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderIslemler();
}

function renderIslemler() {
  let filtered = [...islemler].sort((a,b) => b.tarih.localeCompare(a.tarih));
  if (activeIslemFilter !== 'tümü') filtered = filtered.filter(i => i.tip === activeIslemFilter);

  const list = document.getElementById('islem-list');
  if (!filtered.length) { list.innerHTML = '<div class="tx-empty">İşlem bulunamadı</div>'; return; }

  list.innerHTML = filtered.map(i => {
    const poz  = pozisyonlar.find(p => p.id === i.pozId);
    const date = new Date(i.tarih+'T00:00:00').toLocaleDateString('tr-TR', { day:'2-digit', month:'short', year:'numeric' });
    const tutar = (i.miktar || 0) * (i.fiyat || 0);
    const komisyon = i.komisyon ? ` · Kom: ₺${i.komisyon}` : '';
    const karHtml = i.tip === 'satis' && i.karZarar !== undefined
      ? `<div style="font-size:11px;font-family:var(--font-mono);color:${i.karZarar>=0?'var(--gelir)':'var(--gider)'}">${i.karZarar>=0?'+':'-'}${fmt(Math.abs(i.karZarar))}</div>` : '';

    return `<div class="islem-item">
      <span class="islem-tip-badge ${i.tip}">${i.tip === 'alis' ? '↓ ALIŞ' : '↑ SATIŞ'}</span>
      <div class="islem-info">
        <div class="islem-poz">${poz ? poz.ad : '—'}</div>
        <div class="islem-meta">${fmtAdet(i.miktar)} adet · ${fmt(i.fiyat, poz?.para)} · ${date}${komisyon}${i.not ? ' · '+i.not : ''}</div>
      </div>
      <div class="islem-tutar">
        <div>${fmt(tutar, poz?.para)}</div>
        ${karHtml}
      </div>
      <button class="tx-del" onclick="silIslem('${i.id}')" title="Sil">×</button>
    </div>`;
  }).join('');
}

// ── KAPALI POZİSYONLAR ──
function renderKapali() {
  const kapaliPoz = pozisyonlar.filter(p => p.durum === 'kapali');
  const list = document.getElementById('kapali-list');
  if (!kapaliPoz.length) { list.innerHTML = '<div class="tx-empty">Kapalı pozisyon yok</div>'; return; }

  list.innerHTML = kapaliPoz.map(p => {
    const kz    = p.kapanisKarZarar || 0;
    const pct   = p.kapanisKarPct || 0;
    const renk  = TUR_RENKLER[p.tur] || '#8a8680';
    const cls   = kz > 0 ? 'kar' : kz < 0 ? 'zarar' : 'notr';
    return `<div class="islem-item">
      <div class="poz-icon" style="background:${renk}20;color:${renk};width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${TUR_ICONS[p.tur]||'📌'}</div>
      <div class="islem-info">
        <div class="islem-poz">${p.ad}</div>
        <div class="islem-meta">${p.miktar ? fmtAdet(p.miktar)+' adet · ' : ''}Alış: ${fmt(p.alisFiyati||0,p.para)} · Kapanış: ${p.kapanisTarihi||'—'}</div>
      </div>
      <div class="islem-tutar">
        <div style="color:${kz>=0?'var(--gelir)':'var(--gider)'}">${kz>=0?'+':'-'}${fmt(Math.abs(kz),p.para)}</div>
        <div style="font-size:11px;color:${kz>=0?'var(--gelir)':'var(--gider)'}">${pct>=0?'+':''}${pct.toFixed(2)}%</div>
      </div>
      <button class="poz-btn" onclick="pozisyonYenidenAc('${p.id}')" title="Tekrar Aç" style="color:var(--accent)">↺</button>
      <button class="tx-del" onclick="silPozisyon('${p.id}')" title="Sil">×</button>
    </div>`;
  }).join('');
}

// ── DAĞILIM ──
function renderDagilim() {
  const acikPoz = pozisyonlar.filter(p => p.durum === 'acik');

  // Kategori bazlı
  const katDeger = {};
  acikPoz.forEach(p => {
    const { fiyat } = guncelFiyatAl(p);
    const deger = (p.miktar || 0) * fiyat;
    katDeger[p.tur] = (katDeger[p.tur] || 0) + deger;
  });
  const katLabels = Object.keys(katDeger).map(k => {
    const isimler = {hisse:'Hisse',fon:'Fon',etf:'ETF',kripto:'Kripto',altin:'Altın',mevduat:'Mevduat',doviz:'Döviz',diger:'Diğer'};
    return (TUR_ICONS[k]||'') + ' ' + (isimler[k]||k);
  });
  const katVals = Object.values(katDeger);

  if (katChart) katChart.destroy();
  katChart = new Chart(document.getElementById('katChart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: katLabels.length ? katLabels : ['Veri yok'],
      datasets: [{ data: katVals.length ? katVals : [1], backgroundColor: katVals.length ? CHART_COLORS.slice(0,katLabels.length) : ['#2a2a2a'], borderWidth: 0 }]
    },
    options: { plugins:{ legend:{ position:'bottom', labels:{ font:{size:11}, color:'#8a8680', boxWidth:10, padding:8 } } }, cutout:'60%', responsive:true, maintainAspectRatio:false }
  });

  // Varlık bazlı (top 8)
  const varlikDeger = acikPoz.map(p => {
    const { fiyat } = guncelFiyatAl(p);
    return { ad: p.ad, deger: (p.miktar||0)*fiyat };
  }).sort((a,b) => b.deger-a.deger).slice(0,8);

  if (varlikChart) varlikChart.destroy();
  varlikChart = new Chart(document.getElementById('varlikChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: varlikDeger.map(v => v.ad.slice(0,12)),
      datasets: [{ data: varlikDeger.map(v => v.deger), backgroundColor: 'rgba(212,168,84,.7)', borderRadius: 6, borderWidth: 0 }]
    },
    options: { plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ color:'#8a8680', font:{size:10} }, grid:{ color:'rgba(255,255,255,.04)' } }, y:{ ticks:{ color:'#8a8680', font:{size:10}, callback: v=>'₺'+v.toLocaleString('tr-TR') }, grid:{ color:'rgba(255,255,255,.04)' } } }, responsive:true, maintainAspectRatio:false }
  });

  // Dağılım bars
  const topDeger = katVals.reduce((s,v)=>s+v,0);
  const barsEl = document.getElementById('dagilim-bars');
  if (!katLabels.length) { barsEl.innerHTML = '<div class="tx-empty">Veri yok</div>'; return; }
  barsEl.innerHTML = `<div class="section-title" style="margin-top:20px">Detaylı Dağılım</div>` +
    katLabels.map((lbl, i) => {
      const pct = topDeger > 0 ? (katVals[i]/topDeger*100).toFixed(1) : 0;
      return `<div class="dagilim-bar-row">
        <div class="dagilim-bar-label"><span>${lbl}</span><span>${fmt(katVals[i])} · %${pct}</span></div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${CHART_COLORS[i%CHART_COLORS.length]}"></div></div>
      </div>`;
    }).join('');
}

// ══════════════════════════════════════════════
// POZİSYON MODAL
// ══════════════════════════════════════════════
function turDegisti() {
  const tur = document.getElementById('p-tur').value;
  document.getElementById('mevduat-fields').style.display = tur==='mevduat' ? 'block' : 'none';
  document.getElementById('ticker-group').style.display   = ['mevduat','altin','diger'].includes(tur) ? 'none' : 'block';
  const miktarLabels = { hisse:'Adet', fon:'Adet (pay)', etf:'Adet', kripto:'Adet', altin:'Gram', mevduat:'Tutar (₺)', doviz:'Tutar', diger:'Miktar' };
  document.getElementById('miktar-label').textContent = miktarLabels[tur] || 'Miktar';
}

function showPozisyonModal(id) {
  // Sıfırla
  ['p-ad','p-ticker','p-not'].forEach(i => { document.getElementById(i).value = ''; });
  ['p-miktar','p-alis','p-guncel','p-hedef','p-faiz'].forEach(i => { const el=document.getElementById(i); if(el) el.value=''; });
  document.getElementById('p-tur').value   = 'hisse';
  document.getElementById('p-para').value  = 'TRY';
  document.getElementById('p-tarih').value = today();
  document.getElementById('p-edit-id').value = '';
  document.getElementById('poz-modal-title').textContent = 'Pozisyon Ekle';
  turDegisti();
  fillHesapSelects();

  if (id) {
    const p = pozisyonlar.find(x => x.id === id);
    if (!p) return;
    document.getElementById('poz-modal-title').textContent = 'Pozisyonu Düzenle';
    document.getElementById('p-edit-id').value = id;
    document.getElementById('p-ad').value      = p.ad;
    document.getElementById('p-tur').value     = p.tur;
    document.getElementById('p-ticker').value  = p.ticker || '';
    document.getElementById('p-miktar').value  = p.miktar || '';
    document.getElementById('p-alis').value    = p.alisFiyati || '';
    document.getElementById('p-guncel').value  = p.guncelFiyat || '';
    document.getElementById('p-hedef').value   = p.hedefFiyat || '';
    document.getElementById('p-para').value    = p.para || 'TRY';
    document.getElementById('p-tarih').value   = p.tarihi || today();
    document.getElementById('p-not').value     = p.not || '';
    if (p.faiz)       document.getElementById('p-faiz').value  = p.faiz;
    if (p.vadeTarihi) document.getElementById('p-vade').value  = p.vadeTarihi;

    // Hesap seç
    const hesapSel = document.getElementById('p-hesap');
    if (p.hesapId) hesapSel.value = p.hesapId;

    turDegisti();
  }
  document.getElementById('pozisyon-modal').classList.add('open');
}

function closePozisyonModal(e) {
  if (e && e.target !== document.getElementById('pozisyon-modal')) return;
  document.getElementById('pozisyon-modal').classList.remove('open');
}

function kaydetPozisyon() {
  const ad        = document.getElementById('p-ad').value.trim();
  const tur       = document.getElementById('p-tur').value;
  const ticker    = document.getElementById('p-ticker').value.trim().toUpperCase();
  const miktar    = parseFloat(document.getElementById('p-miktar').value) || 0;
  const alisFiyati= parseFloat(document.getElementById('p-alis').value) || 0;
  const guncelFiyat = parseFloat(document.getElementById('p-guncel').value) || 0;
  const hedefFiyat  = parseFloat(document.getElementById('p-hedef').value) || 0;
  const para      = document.getElementById('p-para').value;
  const tarihi    = document.getElementById('p-tarih').value;
  const not       = document.getElementById('p-not').value.trim();
  const faiz      = parseFloat(document.getElementById('p-faiz')?.value) || 0;
  const vadeTarihi= document.getElementById('p-vade')?.value || '';
  const hesapId   = parseInt(document.getElementById('p-hesap').value) || 0;
  const hesapAd   = hesaplar.find(h=>h.id===hesapId)?.ad || '';
  const editId    = document.getElementById('p-edit-id').value;

  if (!ad) { alert('Varlık adı gerekli.'); return; }
  if (miktar <= 0) { alert('Miktar/adet sıfırdan büyük olmalı.'); return; }

  const obj = { ad, tur, ticker, miktar, alisFiyati, guncelFiyat, hedefFiyat, para, tarihi, not, faiz, vadeTarihi, hesapId, hesapAd, durum:'acik' };

  if (editId) {
    const idx = pozisyonlar.findIndex(x => x.id === editId);
    if (idx !== -1) pozisyonlar[idx] = { ...pozisyonlar[idx], ...obj };
  } else {
    pozisyonlar.unshift({ id: Date.now().toString(), ...obj });
  }

  saveAll();
  renderPortfoy();
  renderKPIs();
  renderDagilim();
  document.getElementById('pozisyon-modal').classList.remove('open');
}

function silPozisyon(id) {
  const p = pozisyonlar.find(x => x.id === id);
  if (!confirm(`"${p?.ad}" pozisyonunu silmek istiyor musunuz? İlgili işlemler de silinecek.`)) return;
  pozisyonlar = pozisyonlar.filter(x => x.id !== id);
  islemler    = islemler.filter(i => i.pozId !== id);
  saveAll();
  renderPortfoy(); renderIslemler(); renderKapali(); renderKPIs(); renderDagilim();
}

function pozisyonKapat(id) {
  const p = pozisyonlar.find(x => x.id === id);
  if (!p) return;
  const kapanisFiyatStr = prompt(`"${p.ad}" kapatılıyor.\nKapanış fiyatını girin (${PARA_SEMBOLLERI[p.para]||'₺'}):`, '');
  if (kapanisFiyatStr === null) return;
  const kapanisFiyat = parseFloat(kapanisFiyatStr);
  if (isNaN(kapanisFiyat) || kapanisFiyat <= 0) { alert('Geçerli fiyat girin.'); return; }

  const kz  = (kapanisFiyat - p.alisFiyati) * p.miktar;
  const pct = p.alisFiyati > 0 ? ((kapanisFiyat - p.alisFiyati) / p.alisFiyati * 100) : 0;

  p.durum            = 'kapali';
  p.kapanisFiyati    = kapanisFiyat;
  p.kapanisKarZarar  = kz;
  p.kapanisKarPct    = pct;
  p.kapanisTarihi    = new Date().toLocaleDateString('tr-TR');

  saveAll();
  renderPortfoy(); renderKapali(); renderKPIs();
}

function pozisyonYenidenAc(id) {
  const p = pozisyonlar.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`"${p.ad}" tekrar açılsın mı?`)) return;
  p.durum = 'acik';
  delete p.kapanisFiyati; delete p.kapanisKarZarar; delete p.kapanisKarPct; delete p.kapanisTarihi;
  saveAll();
  renderPortfoy(); renderKapali(); renderKPIs();
}

// ══════════════════════════════════════════════
// İŞLEM MODAL (Alış/Satış)
// ══════════════════════════════════════════════
function setIslemTip(tip, btn) {
  activeIslemTip = tip;
  document.querySelectorAll('#islem-modal-yat .tur-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function showIslemModal(pozId) {
  fillPozisyonSelect();
  document.getElementById('i-miktar').value   = '';
  document.getElementById('i-fiyat').value    = '';
  document.getElementById('i-komisyon').value = '';
  document.getElementById('i-not').value      = '';
  document.getElementById('i-tarih').value    = today();
  document.getElementById('i-edit-id').value  = '';
  activeIslemTip = 'alis';
  document.querySelectorAll('#islem-modal-yat .tur-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('itip-alis').classList.add('active');

  if (pozId) {
    const sel = document.getElementById('i-pozisyon');
    for (let opt of sel.options) { if (opt.value === pozId) { sel.value = pozId; break; } }
  }
  document.getElementById('islem-modal-yat').classList.add('open');
}

function closeIslemModal(e) {
  if (e && e.target !== document.getElementById('islem-modal-yat')) return;
  document.getElementById('islem-modal-yat').classList.remove('open');
}

function kaydetIslem() {
  const pozId    = document.getElementById('i-pozisyon').value;
  const miktar   = parseFloat(document.getElementById('i-miktar').value);
  const fiyat    = parseFloat(document.getElementById('i-fiyat').value);
  const tarih    = document.getElementById('i-tarih').value;
  const komisyon = parseFloat(document.getElementById('i-komisyon').value) || 0;
  const not      = document.getElementById('i-not').value.trim();

  if (!pozId) { alert('Pozisyon seçin.'); return; }
  if (!miktar || miktar <= 0) { alert('Geçerli miktar girin.'); return; }
  if (!fiyat  || fiyat  <= 0) { alert('Geçerli fiyat girin.'); return; }
  if (!tarih) { alert('Tarih seçin.'); return; }

  const poz = pozisyonlar.find(p => p.id === pozId);
  if (!poz) { alert('Pozisyon bulunamadı.'); return; }

  let karZarar = undefined;
  if (activeIslemTip === 'satis') {
    karZarar = (fiyat - poz.alisFiyati) * miktar - komisyon;
    // Miktarı güncelle
    poz.miktar = Math.max(0, (poz.miktar || 0) - miktar);
    if (poz.miktar === 0) poz.durum = 'kapali';
  } else {
    // Ortalama maliyet güncelle
    const eskiToplam = (poz.miktar || 0) * (poz.alisFiyati || 0);
    const yeniToplam = miktar * fiyat + komisyon;
    const yeniMiktar = (poz.miktar || 0) + miktar;
    poz.alisFiyati = yeniMiktar > 0 ? (eskiToplam + yeniToplam) / yeniMiktar : fiyat;
    poz.miktar = yeniMiktar;
  }

  islemler.unshift({ id: Date.now().toString(), tip: activeIslemTip, pozId, miktar, fiyat, tarih, komisyon, not, karZarar });
  saveAll();
  renderPortfoy(); renderIslemler(); renderKapali(); renderKPIs();
  document.getElementById('islem-modal-yat').classList.remove('open');
}

function silIslem(id) {
  if (!confirm('Bu işlemi silmek istiyor musunuz? Pozisyon miktarı otomatik güncellenmez, manuel kontrol edin.')) return;
  islemler = islemler.filter(i => i.id !== id);
  saveAll();
  renderIslemler();
}

// ── BAŞLAT ──
init();
