/* =============================================
   FINANS TAKİP v2.1 — APP LOGIC
   + İşlem düzenleme modal
   + Kredi kartı detayları (limit, kesim, ödeme, ekstre)
   ============================================= */

let data     = JSON.parse(localStorage.getItem('finans_data')    || '[]');
let hesaplar = JSON.parse(localStorage.getItem('finans_hesaplar')|| '[]');

let activeFilter = 'tümü';
let activeTur    = 'gider';
let activeEditTur = 'gider';
let pieChart = null, barChart = null;

// ── KATEGORİLER ──
const CATS = {
  gelir: [
    'Maaş','Ek Ödeme','Promosyon','Altın Günü','Temettü',
    'Yatırımdan Gelen (Hisse)','Yatırımdan Gelen (Fon)',
    'Yatırımdan Gelen (Mevduat)','Yatırımdan Gelen (Altın)',
    'Önceki Aydan Devir','Kredi','Nakit Avans','Diğer'
  ],
  gider: [
    'Fatura','Abonelik','Market','Akaryakıt','Yemek',
    'Kredi Kartı Ödemesi','Konaklama','Uçak / Otobüs',
    'Hediye','Yatırım','Verilen Borç','Sağlık Giderleri',
    'Düğün Masrafları','Kişisel Bakım','Eğlence',
    'Araba Giderleri','Kredi Taksiti','Önceki Aydan Devir','Diğer'
  ]
};

const EMOJIS = {
  'Maaş':'💼','Ek Ödeme':'💰','Promosyon':'🎁','Altın Günü':'✨',
  'Temettü':'📈','Yatırımdan Gelen (Hisse)':'📊','Yatırımdan Gelen (Fon)':'📦',
  'Yatırımdan Gelen (Mevduat)':'🏛️','Yatırımdan Gelen (Altın)':'🥇',
  'Önceki Aydan Devir':'🔄','Kredi':'🏦','Nakit Avans':'💵',
  'Fatura':'💡','Abonelik':'📱','Market':'🛒','Akaryakıt':'⛽',
  'Yemek':'🍽️','Kredi Kartı Ödemesi':'💳','Konaklama':'🏨',
  'Uçak / Otobüs':'✈️','Hediye':'🎁','Yatırım':'📊',
  'Verilen Borç':'🤝','Sağlık Giderleri':'💊','Düğün Masrafları':'💒',
  'Kişisel Bakım':'🪮','Eğlence':'🎮','Araba Giderleri':'🚗',
  'Kredi Taksiti':'🏦','Diğer':'📌'
};

const HESAP_ICONS  = { banka:'🏦', kredi:'💳', nakit:'💵', yatirim:'📈' };
const CHART_COLORS = ['#f87171','#fb923c','#fbbf24','#a3e635','#4ade80','#34d399','#22d3ee','#60a5fa','#a78bfa','#f472b6'];
const RENKLER      = ['#d4a854','#60a5fa','#4ade80','#f87171','#a78bfa','#fb923c','#34d399','#f472b6','#22d3ee','#e879f9'];
let secilenRenk    = RENKLER[0];

function save() {
  localStorage.setItem('finans_data',     JSON.stringify(data));
  localStorage.setItem('finans_hesaplar', JSON.stringify(hesaplar));
}

function today() { return new Date().toISOString().split('T')[0]; }

// ── BAŞLAT ──
function init() {
  document.getElementById('f-tarih').value = today();
  document.getElementById('v-tarih').value = today();
  document.getElementById('topbar-date').textContent =
    new Date().toLocaleDateString('tr-TR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  if(!hesaplar.length) {
    hesaplar.push({ id:Date.now(), ad:'Nakit', tur:'nakit', bakiye:0, renk:'#4ade80' });
    save();
  }

  fillMonthSelects();
  renderKategoriler();
  fillHesapSelects();
  renderOzet();
  renderHesaplar();
  renderIslemler();
  renderVirmanlar();

  const key = localStorage.getItem('anthropic_key');
  if(key) document.getElementById('api-key-input').value = key;
}

// ── AYLAR ──
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
      const lbl = new Date(y,mo-1,1).toLocaleDateString('tr-TR',{year:'numeric',month:'long'});
      return `<option value="${m}" ${m===cur?'selected':''}>${lbl}</option>`;
    }).join('');
    if(!cur || !months.includes(cur)) el.value = months[0];
  });
}

function fmt(n) {
  return '₺' + Math.abs(n).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
}

// ── TAB ──
function switchTab(tab, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('page-'+tab).classList.add('active');
  (btn || document.querySelector(`[data-tab="${tab}"]`)).classList.add('active');
  const titles = {ozet:'Özet',hesaplar:'Hesaplar',ekle:'İşlem Ekle',virman:'Virman',islemler:'İşlemler',analiz:'YZ Analizi',ayarlar:'Ayarlar'};
  document.getElementById('topbar-title').textContent = titles[tab]||'';
  if(tab==='ozet')     renderOzet();
  if(tab==='hesaplar') renderHesaplar();
  if(tab==='islemler') renderIslemler();
  if(tab==='virman')   { fillVirmanSelects(); renderVirmanlar(); }
  closeSidebar();
}

// ── SİDEBAR ──
function openSidebar()  { document.getElementById('sidebar').classList.add('open');    document.getElementById('overlay').classList.add('show'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('show'); }

// ── TÜR ──
function setTur(tur, btn) {
  activeTur = tur;
  document.querySelectorAll('.tur-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderKategoriler();
  document.getElementById('hesap-label').textContent = tur==='gelir' ? 'Gelirin Geldiği Hesap' : 'Ödeme Hesabı / Kartı';
}

function renderKategoriler() {
  const sel = document.getElementById('f-kategori');
  sel.innerHTML = CATS[activeTur].map(c => `<option value="${c}">${EMOJIS[c]||'📌'} ${c}</option>`).join('');
}

// ── HESAP SELECT'LERİ ──
function fillHesapSelects() {
  const opts    = hesaplar.map(h => `<option value="${h.id}">${HESAP_ICONS[h.tur]||'🏦'} ${h.ad}</option>`).join('');
  const allOpt  = '<option value="">Tüm Hesaplar</option>';
  ['f-hesap','v-kaynak','v-hedef','edit-hesap'].forEach(id => {
    const el = document.getElementById(id); if(el) el.innerHTML = opts;
  });
  ['hesap-filter','tx-hesap-filter'].forEach(id => {
    const el = document.getElementById(id); if(el) el.innerHTML = allOpt + opts;
  });
}

function fillVirmanSelects() {
  const opts = hesaplar.map(h => `<option value="${h.id}">${HESAP_ICONS[h.tur]||'🏦'} ${h.ad}</option>`).join('');
  document.getElementById('v-kaynak').innerHTML = opts;
  document.getElementById('v-hedef').innerHTML  = opts;
}

// ══════════════════════════════════════════════
// HESAP YÖNETİMİ
// ══════════════════════════════════════════════
function toggleKrediFields() {
  const tur = document.getElementById('h-tur').value;
  document.getElementById('kredi-fields').style.display = tur==='kredi' ? 'block' : 'none';
  document.getElementById('bakiye-label').textContent =
    tur==='kredi' ? 'Mevcut Dönem Borcu (₺)' : 'Başlangıç Bakiyesi (₺)';
}

function showHesapModal(id) {
  secilenRenk = RENKLER[0];
  // Sıfırla
  ['h-ad','h-limit','h-borc','h-kesim','h-odeme','h-ekstre'].forEach(i => {
    const el = document.getElementById(i); if(el) el.value = '';
  });
  document.getElementById('h-bakiye').value = '';
  document.getElementById('h-tur').value    = 'banka';
  document.getElementById('h-edit-id').value = '';
  document.getElementById('modal-title').textContent = 'Hesap Ekle';
  document.getElementById('kredi-fields').style.display = 'none';
  document.getElementById('bakiye-label').textContent = 'Başlangıç Bakiyesi (₺)';
  renderColorPicker();

  if(id) {
    const h = hesaplar.find(x => x.id===id);
    if(!h) return;
    document.getElementById('modal-title').textContent  = 'Hesabı Düzenle';
    document.getElementById('h-edit-id').value = id;
    document.getElementById('h-ad').value      = h.ad;
    document.getElementById('h-tur').value     = h.tur;
    document.getElementById('h-bakiye').value  = h.bakiye || 0;
    secilenRenk = h.renk || RENKLER[0];
    renderColorPicker();
    toggleKrediFields();
    if(h.tur==='kredi') {
      document.getElementById('h-limit').value  = h.limit  || '';
      document.getElementById('h-borc').value   = h.borc   || '';
      document.getElementById('h-kesim').value  = h.kesim  || '';
      document.getElementById('h-odeme').value  = h.odeme  || '';
      document.getElementById('h-ekstre').value = h.ekstre || '';
    }
  }
  document.getElementById('hesap-modal').classList.add('open');
}

function closeHesapModal(e) {
  if(e && e.target !== document.getElementById('hesap-modal')) return;
  document.getElementById('hesap-modal').classList.remove('open');
}

function renderColorPicker() {
  document.getElementById('color-picker').innerHTML = RENKLER.map(r =>
    `<div class="color-swatch ${r===secilenRenk?'active':''}" style="background:${r}" onclick="secilenRenk='${r}';renderColorPicker()"></div>`
  ).join('');
}

function kaydetHesap() {
  const ad     = document.getElementById('h-ad').value.trim();
  const tur    = document.getElementById('h-tur').value;
  const bakiye = parseFloat(document.getElementById('h-bakiye').value)||0;
  const editId = parseInt(document.getElementById('h-edit-id').value)||0;
  if(!ad) { alert('Hesap adı gerekli.'); return; }

  const krediData = tur==='kredi' ? {
    limit:  parseFloat(document.getElementById('h-limit').value)||0,
    borc:   parseFloat(document.getElementById('h-borc').value)||0,
    kesim:  parseInt(document.getElementById('h-kesim').value)||0,
    odeme:  parseInt(document.getElementById('h-odeme').value)||0,
    ekstre: parseInt(document.getElementById('h-ekstre').value)||0,
  } : {};

  if(editId) {
    const h = hesaplar.find(x => x.id===editId);
    if(h) Object.assign(h, { ad, tur, bakiye, renk:secilenRenk, ...krediData });
  } else {
    hesaplar.push({ id:Date.now(), ad, tur, bakiye, renk:secilenRenk, ...krediData });
  }

  save();
  fillHesapSelects();
  renderHesaplar();
  document.getElementById('hesap-modal').classList.remove('open');
}

function silHesap(id) {
  const h = hesaplar.find(x => x.id===id);
  if(!h) return;
  if(data.some(d => d.hesapId===id||d.kaynakId===id||d.hedefId===id)) {
    alert('Bu hesaba bağlı işlemler var. Önce işlemleri silin.'); return;
  }
  if(!confirm(`"${h.ad}" hesabını silmek istiyor musunuz?`)) return;
  hesaplar = hesaplar.filter(x => x.id!==id);
  save(); fillHesapSelects(); renderHesaplar();
}

function hesapBakiyesiHesapla(hesapId) {
  const h = hesaplar.find(x => x.id===hesapId);
  if(!h) return 0;
  let bakiye = h.bakiye || 0;
  data.forEach(d => {
    if(d.tur==='virman') {
      if(d.hedefId===hesapId)  bakiye += d.tutar;
      if(d.kaynakId===hesapId) bakiye -= d.tutar;
    } else if(d.hesapId===hesapId) {
      bakiye += d.tur==='gelir' ? d.tutar : -d.tutar;
    }
  });
  return bakiye;
}

function renderHesaplar() {
  const grid = document.getElementById('hesap-grid');
  if(!hesaplar.length) {
    grid.innerHTML = '<div class="tx-empty">Henüz hesap yok.</div>'; return;
  }

  grid.innerHTML = hesaplar.map(h => {
    const bakiye = hesapBakiyesiHesapla(h.id);
    const renk   = h.renk || '#d4a854';
    const turAdi = {banka:'Banka Hesabı',kredi:'Kredi Kartı',nakit:'Nakit',yatirim:'Yatırım Hesabı'}[h.tur]||h.tur;

    // Kredi kartı ek bilgileri
    let krediInfo = '';
    if(h.tur==='kredi') {
      const kullanilanBorc = Math.abs(bakiye);  // bakiye negatif = borç
      const limit          = h.limit || 0;
      const kullanilanPct  = limit > 0 ? Math.min((kullanilanBorc/limit)*100,100).toFixed(0) : 0;
      const kalanLimit     = limit > 0 ? limit - kullanilanBorc : 0;
      const bugun          = new Date().getDate();

      // Yaklaşan tarih uyarısı
      let tarihUyari = '';
      if(h.kesim) {
        const kalan = h.kesim >= bugun ? h.kesim - bugun : (31 - bugun + h.kesim);
        tarihUyari += `<div class="kredi-tarih">✂️ Kesim: Her ayın <b>${h.kesim}.</b> günü (${kalan} gün kaldı)</div>`;
      }
      if(h.odeme) {
        const kalan = h.odeme >= bugun ? h.odeme - bugun : (31 - bugun + h.odeme);
        const acil  = kalan <= 3;
        tarihUyari += `<div class="kredi-tarih ${acil?'kredi-tarih-acil':''}">💳 Son Ödeme: Her ayın <b>${h.odeme}.</b> günü${acil?` ⚠️ ${kalan} gün kaldı!`:''}</div>`;
      }
      if(h.ekstre) {
        tarihUyari += `<div class="kredi-tarih">📄 Ekstre: Her ayın <b>${h.ekstre}.</b> günü</div>`;
      }

      krediInfo = `
        <div class="kredi-info">
          ${limit>0 ? `
          <div class="kredi-limit-row">
            <span>Limit Kullanımı</span>
            <span>${fmt(kullanilanBorc)} / ${fmt(limit)}</span>
          </div>
          <div class="kredi-bar-track">
            <div class="kredi-bar-fill" style="width:${kullanilanPct}%;background:${kullanilanPct>80?'var(--gider)':kullanilanPct>50?'#fb923c':'var(--gelir)'}"></div>
          </div>
          <div class="kredi-limit-row" style="margin-top:4px">
            <span style="font-size:11px;color:var(--text3)">Kalan limit</span>
            <span style="font-size:11px;color:var(--gelir)">${fmt(Math.max(0,kalanLimit))}</span>
          </div>` : ''}
          ${tarihUyari}
        </div>`;
    }

    return `<div class="hesap-card" style="border-top:3px solid ${renk}">
      <div class="hesap-card-header">
        <span class="hesap-icon">${HESAP_ICONS[h.tur]||'🏦'}</span>
        <span class="hesap-ad">${h.ad}</span>
        <div class="hesap-actions">
          <button onclick="showHesapModal(${h.id})" title="Düzenle">✎</button>
          <button onclick="silHesap(${h.id})"       title="Sil">×</button>
        </div>
      </div>
      <div class="hesap-bakiye" style="color:${renk}">${bakiye>=0?'':'-'}${fmt(Math.abs(bakiye))}</div>
      <div class="hesap-tur">${turAdi}</div>
      ${krediInfo}
    </div>`;
  }).join('');

  renderHesapIslemler();
}

function renderHesapIslemler() {
  const filterId = parseInt(document.getElementById('hesap-filter')?.value)||0;
  let filtered = [...data].sort((a,b) => b.tarih.localeCompare(a.tarih));
  if(filterId) filtered = filtered.filter(d => d.hesapId===filterId||d.kaynakId===filterId||d.hedefId===filterId);
  const list = document.getElementById('hesap-tx-list');
  list.innerHTML = filtered.length ? filtered.slice(0,50).map(d=>txHtml(d,true)).join('') : '<div class="tx-empty">İşlem bulunamadı</div>';
}

// ══════════════════════════════════════════════
// İŞLEM EKLE
// ══════════════════════════════════════════════
function ekleIslem() {
  const aciklama = document.getElementById('f-aciklama').value.trim();
  const tutar    = parseFloat(document.getElementById('f-tutar').value);
  const tarih    = document.getElementById('f-tarih').value;
  const kategori = document.getElementById('f-kategori').value;
  const not      = document.getElementById('f-not').value.trim();
  const hesapId  = parseInt(document.getElementById('f-hesap').value)||0;

  if(!aciklama||!tutar||isNaN(tutar)||tutar<=0||!tarih) {
    alert('Lütfen açıklama, tutar ve tarih alanlarını doldurun.'); return;
  }
  if(!hesapId) { alert('Lütfen bir hesap seçin.'); return; }

  data.unshift({ id:Date.now(), tur:activeTur, aciklama, tutar, tarih, kategori, not, hesapId });
  save();
  fillMonthSelects();
  document.getElementById('f-aciklama').value = '';
  document.getElementById('f-tutar').value    = '';
  document.getElementById('f-not').value      = '';

  const msg = document.getElementById('success-msg');
  msg.classList.add('show');
  setTimeout(()=>msg.classList.remove('show'), 2000);
}

// ══════════════════════════════════════════════
// İŞLEM DÜZENLEME
// ══════════════════════════════════════════════
function duzenleIslem(id) {
  const d = data.find(x => x.id===id);
  if(!d || d.tur==='virman') return;

  activeEditTur = d.tur;

  // Tür butonlarını ayarla
  document.querySelectorAll('#islem-modal .tur-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tur===d.tur);
  });

  // Kategori listesini doldur
  renderEditKategoriler(d.tur, d.kategori);

  // Hesap listesini doldur
  const hesapOpts = hesaplar.map(h => `<option value="${h.id}" ${h.id===d.hesapId?'selected':''}>${HESAP_ICONS[h.tur]||'🏦'} ${h.ad}</option>`).join('');
  document.getElementById('edit-hesap').innerHTML = hesapOpts;

  document.getElementById('edit-id').value        = id;
  document.getElementById('edit-aciklama').value  = d.aciklama;
  document.getElementById('edit-tutar').value     = d.tutar;
  document.getElementById('edit-tarih').value     = d.tarih;
  document.getElementById('edit-not').value       = d.not || '';

  document.getElementById('islem-modal').classList.add('open');
}

function setEditTur(tur, btn) {
  activeEditTur = tur;
  document.querySelectorAll('#islem-modal .tur-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderEditKategoriler(tur, null);
}

function renderEditKategoriler(tur, secilenKat) {
  const sel = document.getElementById('edit-kategori');
  sel.innerHTML = CATS[tur].map(c =>
    `<option value="${c}" ${c===secilenKat?'selected':''}>${EMOJIS[c]||'📌'} ${c}</option>`
  ).join('');
}

function closeIslemModal(e) {
  if(e && e.target !== document.getElementById('islem-modal')) return;
  document.getElementById('islem-modal').classList.remove('open');
}

function kaydetIslemDuzenle() {
  const id       = parseInt(document.getElementById('edit-id').value)||0;
  const aciklama = document.getElementById('edit-aciklama').value.trim();
  const tutar    = parseFloat(document.getElementById('edit-tutar').value);
  const tarih    = document.getElementById('edit-tarih').value;
  const kategori = document.getElementById('edit-kategori').value;
  const not      = document.getElementById('edit-not').value.trim();
  const hesapId  = parseInt(document.getElementById('edit-hesap').value)||0;

  if(!aciklama||!tutar||isNaN(tutar)||tutar<=0||!tarih) {
    alert('Lütfen zorunlu alanları doldurun.'); return;
  }
  if(!hesapId) { alert('Lütfen bir hesap seçin.'); return; }

  const idx = data.findIndex(x => x.id===id);
  if(idx===-1) { alert('İşlem bulunamadı.'); return; }

  data[idx] = { ...data[idx], tur:activeEditTur, aciklama, tutar, tarih, kategori, not, hesapId };
  save();
  fillMonthSelects();
  document.getElementById('islem-modal').classList.remove('open');
  renderOzet();
  renderIslemler();
  renderHesaplar();
}

// ══════════════════════════════════════════════
// VİRMAN
// ══════════════════════════════════════════════
function ekleVirman() {
  const kaynakId = parseInt(document.getElementById('v-kaynak').value)||0;
  const hedefId  = parseInt(document.getElementById('v-hedef').value)||0;
  const tutar    = parseFloat(document.getElementById('v-tutar').value);
  const tarih    = document.getElementById('v-tarih').value;
  const aciklama = document.getElementById('v-aciklama').value.trim() || 'Virman';

  if(!kaynakId||!hedefId) { alert('Kaynak ve hedef hesabı seçin.'); return; }
  if(kaynakId===hedefId)  { alert('Kaynak ve hedef hesap aynı olamaz.'); return; }
  if(!tutar||isNaN(tutar)||tutar<=0) { alert('Geçerli bir tutar girin.'); return; }
  if(!tarih) { alert('Tarih seçin.'); return; }

  const kaynak = hesaplar.find(h=>h.id===kaynakId);
  const hedef  = hesaplar.find(h=>h.id===hedefId);
  data.unshift({ id:Date.now(), tur:'virman', aciklama, tutar, tarih, kaynakId, hedefId, kaynakAd:kaynak?.ad||'', hedefAd:hedef?.ad||'' });
  save();
  fillMonthSelects();
  document.getElementById('v-tutar').value    = '';
  document.getElementById('v-aciklama').value = '';
  const msg = document.getElementById('virman-msg');
  msg.classList.add('show');
  setTimeout(()=>msg.classList.remove('show'), 2000);
  renderVirmanlar();
}

function renderVirmanlar() {
  const virmanlar = data.filter(d=>d.tur==='virman').slice(0,30);
  const list = document.getElementById('virman-list');
  list.innerHTML = virmanlar.length
    ? virmanlar.map(d => {
        const k  = hesaplar.find(h=>h.id===d.kaynakId);
        const he = hesaplar.find(h=>h.id===d.hedefId);
        const date = new Date(d.tarih+'T00:00:00').toLocaleDateString('tr-TR',{day:'2-digit',month:'short',year:'numeric'});
        return `<div class="tx-item">
          <div class="tx-emoji">⇄</div>
          <div class="tx-info">
            <div class="tx-desc">${d.aciklama}</div>
            <div class="tx-meta">${k?.ad||d.kaynakAd||'?'} → ${he?.ad||d.hedefAd||'?'} · ${date}</div>
          </div>
          <div class="tx-amount yatirim">${fmt(d.tutar)}</div>
          <button class="tx-del" onclick="silIslem(${d.id})">×</button>
        </div>`;
      }).join('')
    : '<div class="tx-empty">Henüz virman yok</div>';
}

// ══════════════════════════════════════════════
// ÖZET
// ══════════════════════════════════════════════
function renderOzet() {
  const month = document.getElementById('ozet-month')?.value;
  if(!month) return;

  const filtered = data.filter(d => d.tarih?.startsWith(month) && d.tur!=='virman');
  const gelirler = filtered.filter(d=>d.tur==='gelir');
  const giderler = filtered.filter(d=>d.tur==='gider');
  const yatirimGiderleri = giderler.filter(d=>d.kategori==='Yatırım');

  const topGelir   = gelirler.reduce((s,d)=>s+d.tutar,0);
  const topGider   = giderler.reduce((s,d)=>s+d.tutar,0);
  const topYatirim = yatirimGiderleri.reduce((s,d)=>s+d.tutar,0);
  const bakiye     = topGelir - topGider;
  const tasarruf   = topGelir>0 ? ((topGelir-topGider)/topGelir*100).toFixed(1) : 0;

  document.getElementById('k-gelir').textContent       = fmt(topGelir);
  document.getElementById('k-gelir-sub').textContent   = `${gelirler.length} işlem`;
  document.getElementById('k-gider').textContent       = fmt(topGider);
  document.getElementById('k-gider-sub').textContent   = `${giderler.length} işlem`;
  document.getElementById('k-yatirim').textContent     = fmt(topYatirim);
  document.getElementById('k-yatirim-sub').textContent = `${yatirimGiderleri.length} işlem`;
  document.getElementById('k-bakiye').textContent      = (bakiye<0?'-':'')+fmt(Math.abs(bakiye));
  document.getElementById('k-tasarruf').textContent    = `%${tasarruf} tasarruf`;

  // Hesap bakiye satırı
  document.getElementById('hesap-bakiye-list').innerHTML = hesaplar.map(h => {
    const bak  = hesapBakiyesiHesapla(h.id);
    const renk = h.renk||'#d4a854';
    return `<div class="hesap-bakiye-item" onclick="switchTab('hesaplar')">
      <span class="hesap-bakiye-icon" style="background:${renk}20;color:${renk}">${HESAP_ICONS[h.tur]||'🏦'}</span>
      <span class="hesap-bakiye-ad">${h.ad}</span>
      <span class="hesap-bakiye-tutar" style="color:${bak>=0?'var(--gelir)':'var(--gider)'}">${bak>=0?'':'-'}${fmt(Math.abs(bak))}</span>
    </div>`;
  }).join('');

  // Pie chart
  const giderCats = {};
  giderler.forEach(d=>{ giderCats[d.kategori]=(giderCats[d.kategori]||0)+d.tutar; });
  const catLabels = Object.keys(giderCats);
  const catVals   = catLabels.map(c=>giderCats[c]);

  if(pieChart) pieChart.destroy();
  pieChart = new Chart(document.getElementById('pieChart').getContext('2d'), {
    type:'doughnut',
    data:{ labels:catLabels.length?catLabels:['Veri yok'], datasets:[{ data:catVals.length?catVals:[1], backgroundColor:catVals.length?CHART_COLORS.slice(0,catLabels.length):['#2a2a2a'], borderWidth:0 }] },
    options:{ plugins:{legend:{position:'bottom',labels:{font:{size:10},color:'#8a8680',boxWidth:10,padding:8}}}, cutout:'60%', responsive:true, maintainAspectRatio:false }
  });

  // Bar chart
  if(barChart) barChart.destroy();
  barChart = new Chart(document.getElementById('barChart').getContext('2d'), {
    type:'bar',
    data:{ labels:['Gelir','Gider','Bakiye'], datasets:[{ data:[topGelir,topGider,Math.max(0,bakiye)], backgroundColor:['rgba(74,222,128,.7)','rgba(248,113,113,.7)','rgba(212,168,84,.7)'], borderWidth:0, borderRadius:6 }] },
    options:{ plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:'#8a8680',font:{size:11}},grid:{color:'rgba(255,255,255,.04)'}}, y:{ticks:{color:'#8a8680',font:{size:11},callback:v=>'₺'+v.toLocaleString('tr-TR')},grid:{color:'rgba(255,255,255,.04)'}} }, responsive:true, maintainAspectRatio:false }
  });

  // Category bars
  const barsEl = document.getElementById('cat-bars');
  if(!catLabels.length) { barsEl.innerHTML='<div class="tx-empty">Bu ay gider yok</div>'; }
  else {
    const maxVal = Math.max(...catVals);
    barsEl.innerHTML = catLabels.map((c,i)=>`
      <div class="cat-bar-row">
        <div class="cat-bar-label"><span>${EMOJIS[c]||'📌'} ${c}</span><span>${fmt(catVals[i])}</span></div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${(catVals[i]/maxVal*100).toFixed(1)}%;background:${CHART_COLORS[i%CHART_COLORS.length]}"></div></div>
      </div>`).join('');
  }

  // Son işlemler
  const son = filtered.slice(0,5);
  document.getElementById('son-islemler').innerHTML =
    son.length ? son.map(d=>txHtml(d)).join('') : '<div class="tx-empty">Bu ay işlem yok</div>';
}

// ══════════════════════════════════════════════
// İŞLEMLER LİSTESİ
// ══════════════════════════════════════════════
function setFilter(f, btn) {
  activeFilter = f;
  document.querySelectorAll('.fbtn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderIslemler();
}

function renderIslemler() {
  const month    = document.getElementById('tx-month')?.value;
  const hesapFId = parseInt(document.getElementById('tx-hesap-filter')?.value)||0;
  let filtered   = data.filter(d => d.tarih?.startsWith(month));
  if(activeFilter!=='tümü') filtered = filtered.filter(d=>d.tur===activeFilter);
  if(hesapFId) filtered = filtered.filter(d=>d.hesapId===hesapFId||d.kaynakId===hesapFId||d.hedefId===hesapFId);
  const list = document.getElementById('tx-list');
  list.innerHTML = filtered.length ? filtered.map(d=>txHtml(d,true)).join('') : '<div class="tx-empty">İşlem bulunamadı</div>';
}

function hesapAdi(id) { return hesaplar.find(h=>h.id===id)?.ad || '—'; }

function txHtml(d, showActions=false) {
  const emoji  = d.tur==='virman' ? '⇄' : (EMOJIS[d.kategori]||(d.tur==='gelir'?'💵':'💳'));
  const sign   = d.tur==='gelir' ? '+' : d.tur==='virman' ? '' : '-';
  const amtCls = d.tur==='gelir' ? 'gelir' : d.tur==='virman' ? 'yatirim' : 'gider';
  const date   = new Date(d.tarih+'T00:00:00').toLocaleDateString('tr-TR',{day:'2-digit',month:'short',year:'numeric'});

  let meta = d.tur==='virman'
    ? `${hesapAdi(d.kaynakId)||d.kaynakAd} → ${hesapAdi(d.hedefId)||d.hedefAd} · ${date}`
    : `${d.kategori||''} · ${hesapAdi(d.hesapId)} · ${date}`;

  const editBtn = (showActions && d.tur!=='virman') ? `<button class="tx-edit" onclick="duzenleIslem(${d.id})" title="Düzenle">✎</button>` : '';
  const delBtn  = showActions ? `<button class="tx-del" onclick="silIslem(${d.id})" title="Sil">×</button>` : '';

  return `<div class="tx-item">
    <div class="tx-emoji">${emoji}</div>
    <div class="tx-info">
      <div class="tx-desc">${d.aciklama}</div>
      <div class="tx-meta">${meta}</div>
    </div>
    <div class="tx-amount ${amtCls}">${sign}${fmt(d.tutar)}</div>
    ${editBtn}${delBtn}
  </div>`;
}

function silIslem(id) {
  if(!confirm('Bu işlemi silmek istiyor musunuz?')) return;
  data = data.filter(d=>d.id!==id);
  save();
  renderOzet(); renderIslemler(); renderVirmanlar(); renderHesaplar();
}

// ══════════════════════════════════════════════
// YZ ANALİZ
// ══════════════════════════════════════════════
async function yapaYZAnaliz() {
  const apiKey = localStorage.getItem('anthropic_key');
  if(!apiKey) { alert('Lütfen Ayarlar sayfasından Claude API anahtarınızı ekleyin.\n\nÜcretsiz: console.anthropic.com'); switchTab('ayarlar'); return; }

  const month    = document.getElementById('analiz-month')?.value;
  const filtered = data.filter(d=>d.tarih?.startsWith(month)&&d.tur!=='virman');
  if(!filtered.length) { document.getElementById('ai-output').textContent='Bu dönemde analiz edilecek işlem yok.'; return; }

  const [y,m] = month.split('-');
  const donem  = new Date(y,m-1,1).toLocaleDateString('tr-TR',{year:'numeric',month:'long'});
  const gelir  = filtered.filter(d=>d.tur==='gelir').reduce((s,d)=>s+d.tutar,0);
  const gider  = filtered.filter(d=>d.tur==='gider').reduce((s,d)=>s+d.tutar,0);
  const giderCats = {};
  filtered.filter(d=>d.tur==='gider').forEach(d=>{giderCats[d.kategori]=(giderCats[d.kategori]||0)+d.tutar;});

  const hesapOzet = hesaplar.map(h=>`${h.ad}: ${fmt(hesapBakiyesiHesapla(h.id))}`).join(', ');
  const prompt = `Sen kişisel finans danışmanısın. Kullanıcının ${donem} verileri:

Gelir: ₺${gelir.toFixed(2)} | Gider: ₺${gider.toFixed(2)} | Net: ₺${(gelir-gider).toFixed(2)}
Tasarruf oranı: %${gelir>0?((gelir-gider)/gelir*100).toFixed(1):0}
Hesap bakiyeleri: ${hesapOzet}
Gider kategorileri: ${Object.entries(giderCats).map(([k,v])=>`${k}: ₺${v.toFixed(2)}`).join(' | ')}
İşlemler: ${filtered.map(d=>`[${d.tur}] ${d.aciklama} ₺${d.tutar} (${d.kategori}) — ${hesapAdi(d.hesapId)}`).join('\n')}

Türkçe analiz yap:
**📈 Genel Durum** (2-3 cümle)
**⚠️ Dikkat Noktaları**
**💡 3 Somut Tasarruf Önerisi**
**✅ Olumlu Yönler**
Samimi, motive edici, 300-400 kelime.`;

  const output = document.getElementById('ai-output');
  output.className = 'ai-output loading'; output.textContent = '';
  document.getElementById('ai-btn-text').textContent = '⏳ Analiz ediliyor...';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-opus-4-5',max_tokens:1024,messages:[{role:'user',content:prompt}]})});
    const result = await resp.json();
    output.className = 'ai-output';
    output.textContent = result.content?.[0]?.text || 'Analiz alınamadı.';
  } catch(e) { output.className='ai-output'; output.textContent='Hata: '+e.message; }
  document.getElementById('ai-btn-text').textContent = '✦ Tekrar Analiz Et';
}

function yapaYZSoru() {
  const w = document.getElementById('ai-q-wrap');
  w.style.display = w.style.display==='none' ? 'flex' : 'none';
}

async function gonderSoru() {
  const apiKey = localStorage.getItem('anthropic_key');
  if(!apiKey) { alert('Lütfen önce API anahtarı ekleyin.'); return; }
  const soru = document.getElementById('ai-question').value.trim();
  if(!soru) return;
  const month   = document.getElementById('analiz-month')?.value;
  const filtered= data.filter(d=>d.tarih?.startsWith(month)&&d.tur!=='virman');
  const gelir   = filtered.filter(d=>d.tur==='gelir').reduce((s,d)=>s+d.tutar,0);
  const gider   = filtered.filter(d=>d.tur==='gider').reduce((s,d)=>s+d.tutar,0);
  const prompt  = `Veriler: Gelir ₺${gelir.toFixed(2)}, Gider ₺${gider.toFixed(2)}. İşlemler: ${filtered.map(d=>`${d.aciklama}(${d.kategori}):₺${d.tutar}`).join(', ')}\n\nSoru: ${soru}\n\nKısa Türkçe yanıt.`;
  const output  = document.getElementById('ai-output');
  output.className='ai-output loading'; output.textContent='';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-opus-4-5',max_tokens:512,messages:[{role:'user',content:prompt}]})});
    const result = await resp.json();
    output.className='ai-output';
    output.textContent=`❓ ${soru}\n\n`+(result.content?.[0]?.text||'Yanıt alınamadı.');
  } catch(e) { output.className='ai-output'; output.textContent='Hata: '+e.message; }
  document.getElementById('ai-question').value='';
}

// ══════════════════════════════════════════════
// AYARLAR
// ══════════════════════════════════════════════
function saveApiKey() {
  const key = document.getElementById('api-key-input').value.trim();
  if(!key) { alert('API anahtarı boş bırakılamaz.'); return; }
  localStorage.setItem('anthropic_key', key);
  const msg = document.getElementById('api-success');
  msg.classList.add('show'); setTimeout(()=>msg.classList.remove('show'),2000);
}

function exportData() {
  const blob = new Blob([JSON.stringify({data,hesaplar,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `finans-yedek-${today()}.json`;
  a.click();
}

function importData() { document.getElementById('import-input').click(); }

function handleImport(e) {
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imp = JSON.parse(ev.target.result);
      if(!imp.data||!Array.isArray(imp.data)) { alert('Geçersiz dosya.'); return; }
      if(!confirm(`${imp.data.length} işlem içe aktarılacak. Devam?`)) return;
      data = [...imp.data,...data];
      if(imp.hesaplar?.length) imp.hesaplar.forEach(h=>{ if(!hesaplar.find(x=>x.id===h.id)) hesaplar.push(h); });
      save(); fillMonthSelects(); fillHesapSelects(); renderOzet(); renderHesaplar();
      alert('İçe aktarma tamamlandı!');
    } catch(err) { alert('Dosya okunamadı: '+err.message); }
  };
  reader.readAsText(file); e.target.value='';
}

function clearAll() {
  if(!confirm('TÜM veriler silinecek! Geri alınamaz.')) return;
  if(!confirm('Emin misiniz?')) return;
  data=[]; hesaplar=[]; save();
  fillMonthSelects(); fillHesapSelects();
  renderOzet(); renderHesaplar(); renderIslemler();
  alert('Tüm veriler silindi.');
}

init();
