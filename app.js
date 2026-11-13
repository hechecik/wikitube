import { TOPICS, LABELS, HUES, wikiToCards, onThisDayToCards, shuffle, pickWeighted, topicWeight, dwellMs,
  tokenize, splitOrp, wordDelay, rsvpDuration, clampWpm, nudgeWpm, WPM_STEP,
  AYLAR, MERAK, SECKIN_Q, MIN_BYTES_RANDOM, topTitles, isMedia, pastYears,
  sentenceStarts, sentenceRange, seekBack, seekFwd } from './lib.js';

const API = 'https://tr.wikipedia.org/w/api.php';
const REST = 'https://tr.wikipedia.org/api/rest_v1';
const PV = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/top/tr.wikipedia/all-access';
const IMG_CACHE = 'wikitube-img';
// Doğrulanmamış başlangıç değerleri
const BATCH = 20;          // API isteği başına madde (extracts sınırı 20)
const NET_TIMEOUT = 9000;  // ms
const KEEP_DOM = 90;       // ekranda tutulan en fazla kart
const MIX_TAKE = 6;        // karışık akışta bir kaynaktan art arda alınan kart

const $ = s => document.querySelector(s);
const feed = $('#feed');
const state = { cat: 'karisik', loading: false, seen: new Set(), pool: {}, auto: false, active: null, gen: 0, todayUsed: false, yearsUsed: new Set() };
const likes = JSON.parse(localStorage.getItem('likes') || '{}');
// mode: null = henüz seçilmedi (karşılama kartı sorar), 'rsvp' = hızlı oku, 'klasik'
const settings = Object.assign({ mode: null, wpm: 300, img: false }, JSON.parse(localStorage.getItem('ayar') || '{}'));
const saveSettings = () => localStorage.setItem('ayar', JSON.stringify(settings));
const today = () => new Date().toISOString().slice(0, 10);
const stats = Object.assign({ date: today(), words: 0, done: 0 }, JSON.parse(localStorage.getItem('okuma') || '{}'));
if (stats.date !== today()) Object.assign(stats, { date: today(), words: 0 });
const saveStats = () => localStorage.setItem('okuma', JSON.stringify(stats));

/* ---------- IndexedDB ---------- */
let dbp;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('wikitube', 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore('cards', { keyPath: 'id' });
      s.createIndex('cat', 'cat');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function store(mode = 'readonly') { return (await db()).transaction('cards', mode).objectStore('cards'); }

/** Kartları depoya yazar; var olanın beğeni/kayıt durumunu korur. Yeni eklenenleri döndürür. */
async function putCards(cards) {
  if (!cards.length) return [];
  const s = await store('readwrite');
  const fresh = [];
  await Promise.all(cards.map(c => new Promise(res => {
    const g = s.get(c.id);
    g.onsuccess = () => {
      const old = g.result;
      if (old) { c.liked = old.liked; c.saved = old.saved; } else fresh.push(c);
      s.put({ ...c, ts: old?.ts || Date.now() }).onsuccess = res;
    };
    g.onerror = res;
  })));
  return fresh;
}
async function updateCard(c) { (await store('readwrite')).put({ ...c, ts: c.ts || Date.now() }); }
async function countCards(cat) { const s = await store(); return req(cat ? s.index('cat').count(cat) : s.count()); }
async function randomFromDb(cat, n) {
  const s = await store();
  const keys = await req(cat ? s.index('cat').getAllKeys(cat) : s.getAllKeys());
  let pick = shuffle(keys.filter(k => !state.seen.has(k)));
  if (!pick.length && keys.length) { // hepsi görüldü: baştan karıştır
    keys.forEach(k => state.seen.delete(k));
    pick = shuffle(keys);
  }
  const s2 = await store();
  return (await Promise.all(pick.slice(0, n).map(k => req(s2.get(k))))).filter(Boolean);
}

/* ---------- Ağ ---------- */
async function getJson(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), NET_TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
function baseParams() {
  return new URLSearchParams({
    action: 'query', format: 'json', origin: '*',
    prop: 'extracts|pageimages|info|description', exintro: 1, explaintext: 1, exlimit: BATCH,
    piprop: 'thumbnail', pithumbsize: 500, pilimit: BATCH, inprop: 'url',
  });
}
function searchUrl(q) {
  const p = baseParams();
  p.set('generator', 'search'); p.set('gsrsearch', q); p.set('gsrsort', 'random'); p.set('gsrlimit', BATCH); p.set('gsrnamespace', 0);
  return API + '?' + p;
}
function randomUrl() {
  const p = baseParams();
  p.set('generator', 'random'); p.set('grnnamespace', 0); p.set('grnlimit', BATCH);
  return API + '?' + p;
}
function titlesUrl(titles) {
  const p = baseParams();
  p.set('titles', titles.join('|')); p.set('redirects', 1);
  return API + '?' + p;
}
const pad = n => String(n).padStart(2, '0');

/** Bir günün Türkçe Vikipedi'de en çok okunan maddeleri (oturum boyunca önbellekte). */
const topCache = {};
async function topOfDay(y, m, d) {
  const key = `${y}/${pad(m)}/${pad(d)}`;
  return topCache[key] ||= topTitles(await getJson(`${PV}/${key}`));
}
function withNotes(cards, list, text) {
  const by = Object.fromEntries(list.map(x => [x.title, x]));
  for (const c of cards) {
    const x = by[c.title];
    c.note = text + (x ? ` · en çok okunanlarda ${x.rank}. sıra` : '');
  }
  return cards;
}
/** Gündemde: dünün (veri hazır değilse önceki günün) en çok okunanları. */
async function fetchPopular() {
  for (const back of [1, 2]) {
    const t = new Date(Date.now() - back * 864e5);
    const [y, m, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
    let list;
    try { list = await topOfDay(y, m, d); } catch { continue; }
    const pick = shuffle(list.filter(x => !state.seen.has('p' + x.title))).slice(0, BATCH);
    pick.forEach(x => state.seen.add('p' + x.title));
    if (!pick.length) return [];
    const cards = wikiToCards(await getJson(titlesUrl(pick.map(x => x.title))), 'populer');
    return withNotes(cards, list, `${d} ${AYLAR[m - 1]}`);
  }
  throw new Error('okunma verisi alınamadı');
}
/** O gün popüler: geçmiş bir yılın bugününde en çok okunan film, dizi ve şarkı maddeleri. */
async function fetchThatDay() {
  const now = new Date(), m = now.getMonth() + 1, d = now.getDate();
  const years = shuffle(pastYears(now).filter(y => !state.yearsUsed.has(y)));
  if (!years.length) { state.yearsUsed.clear(); return []; }
  for (const y of years.slice(0, 3)) {
    state.yearsUsed.add(y);
    const list = await topOfDay(y, m, d);
    const media = [];
    for (let i = 0; i < list.length && media.length < BATCH; i += 50) { // açıklamalar 50'şer sorulur
      const p = new URLSearchParams({ action: 'query', format: 'json', origin: '*', prop: 'description', redirects: 1,
        titles: list.slice(i, i + 50).map(x => x.title).join('|') });
      const j = await getJson(API + '?' + p);
      for (const pg of Object.values(j?.query?.pages || {})) if (isMedia(pg.description)) media.push(pg.title);
    }
    if (!media.length) continue;
    const cards = wikiToCards(await getJson(titlesUrl(media.slice(0, BATCH))), 'ogun', { idPrefix: `o${y}-` });
    if (cards.length) return withNotes(cards, list, `${d} ${AYLAR[m - 1]} ${y}`);
  }
  return [];
}

async function fetchCat(cat) {
  if (cat === 'bugun') {
    const d = new Date(), mm = d.getMonth() + 1, dd = d.getDate();
    const j = await getJson(`${REST}/feed/onthisday/events/${pad(mm)}/${pad(dd)}`);
    return onThisDayToCards(j, mm, dd);
  }
  if (cat === 'populer') return fetchPopular();
  if (cat === 'ogun') return fetchThatDay();
  if (cat === 'merak') return wikiToCards(await getJson(searchUrl(MERAK[Math.floor(Math.random() * MERAK.length)])), cat);
  if (cat === 'seckin') return wikiToCards(await getJson(searchUrl(SECKIN_Q)), cat);
  const t = TOPICS.find(t => t.key === cat);
  if (t) return wikiToCards(await getJson(searchUrl('articletopic:' + t.q)), cat);
  return wikiToCards(await getJson(randomUrl()), 'rastgele', { minBytes: MIN_BYTES_RANDOM });
}

/** Bir konudan kart getirir: önce ağ, olmazsa depo. */
async function source(cat, n) {
  if (cat !== 'ilkyardim' && navigator.onLine) {
    try {
      const cards = await fetchCat(cat);
      await putCards(cards);
      setNet(true);
      const unseen = cards.filter(c => !state.seen.has(c.id));
      if (unseen.length) return shuffle(unseen);
    } catch { setNet(false); }
  }
  return randomFromDb(cat, n);
}

/* ---------- Akış ---------- */
function pickMixSource() {
  // Doğrulanmamış başlangıç ağırlıkları: ilgi çekici kaynaklar öne, düz rastgele geriye
  const cats = ['merak', 'seckin', 'populer', 'ogun', 'rastgele', 'ilkyardim', ...TOPICS.map(t => t.key)];
  const w = [4, 3, 2, 1.5, 0.7, 0.4, ...TOPICS.map(t => topicWeight(likes[t.key]))];
  if (!state.todayUsed) { cats.push('bugun'); w.push(3); }
  return pickWeighted(cats, w);
}

async function nextCards() {
  const cat = state.cat;
  if (cat !== 'karisik') return source(cat, BATCH);
  if (!navigator.onLine) return randomFromDb(null, BATCH);
  for (let i = 0; i < 3; i++) {
    const c = pickMixSource();
    if (c === 'bugun') state.todayUsed = true;
    const pool = state.pool[c] ||= [];
    if (pool.length < MIX_TAKE) pool.push(...await source(c, BATCH));
    const take = pool.splice(0, c === 'ilkyardim' ? 1 : ['bugun', 'ogun', 'populer'].includes(c) ? 3 : MIX_TAKE).filter(x => !state.seen.has(x.id));
    if (take.length) return take;
  }
  return randomFromDb(null, BATCH);
}

async function refill() {
  if (state.loading) return;
  state.loading = true;
  const gen = state.gen;
  try {
    const cards = await nextCards();
    if (gen !== state.gen) return;
    feed.querySelector('.msg')?.remove();
    if (!cards.length) {
      if (!feed.querySelector('.card')) feed.append(msgCard('Depo boş', navigator.onLine
        ? 'Bu konuda şu an kart getirilemedi. Biraz sonra yeniden dene.'
        : 'Çevrimdışısın ve bu konuda indirilmiş kart yok. Bağlanınca Depo sekmesinden indirebilirsin.', 'Yeniden dene', () => restart()));
      return;
    }
    for (const c of cards) { state.seen.add(c.id); feed.append(cardEl(c)); }
  } catch (e) {
    console.error(e);
  } finally { state.loading = false; }
}

function restart(cat = state.cat) {
  state.cat = cat; state.gen++; state.loading = false; state.pool = {};
  rsvpStop();
  feed.replaceChildren(settings.mode ? msgCard('', 'Kartlar hazırlanıyor…', null, null, true) : welcomeCard());
  feed.scrollTop = 0;
  document.querySelectorAll('#chips button').forEach(b => b.classList.toggle('on', b.dataset.cat === cat));
  $('#chips .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  refill();
}

function msgCard(title, text, btn, fn, spin) {
  const el = document.createElement('section');
  el.className = 'card msg';
  if (spin) el.append(Object.assign(document.createElement('div'), { className: 'spin' }));
  if (title) el.append(Object.assign(document.createElement('h2'), { textContent: title }));
  el.append(Object.assign(document.createElement('p'), { textContent: text }));
  if (btn) { const b = Object.assign(document.createElement('button'), { textContent: btn }); b.onclick = fn; el.append(b); }
  return el;
}

const ICON = {
  like: '<path d="M12 21s-7.5-4.6-9.5-9.3C1 8 3.4 4.5 6.9 4.5c2 0 3.7 1 5.1 2.9 1.4-1.9 3.1-2.9 5.1-2.9 3.5 0 5.9 3.5 4.4 7.2C19.5 16.4 12 21 12 21z"/>',
  save: '<path d="M6 3h12v18l-6-4.5L6 21z"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3M7 8l5-5 5 5"/>',
  auto: '<path d="M7 4l13 8-13 8z"/>',
  mode: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
};
const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

function img(src, cls) {
  const i = new Image();
  i.className = cls; i.alt = ''; i.loading = 'lazy'; i.decoding = 'async';
  i.crossOrigin = 'anonymous'; // önbelleğe alınabilir (opak olmayan) yanıt için
  i.onerror = () => {
    if (i.crossOrigin) { i.removeAttribute('crossorigin'); i.src = src; }
    else { i.closest('.card')?.classList.add('noimg'); i.remove(); }
  };
  i.src = src;
  return i;
}

function cardEl(c) {
  const el = document.createElement('section');
  el.className = 'card' + (c.img && settings.img ? '' : ' noimg');
  el.style.setProperty('--h', HUES[c.cat] ?? 205);
  el.card = c;
  if (c.img && settings.img) el.append(img(c.img, 'bg'), img(c.img, 'pic'));
  el.append(Object.assign(document.createElement('div'), { className: 'shade' }));

  const txt = document.createElement('div');
  txt.className = 'txt';
  txt.append(
    Object.assign(document.createElement('span'), { className: 'tag', textContent: LABELS[c.cat] || c.cat }),
    Object.assign(document.createElement('h2'), { textContent: c.title }),
  );
  if (c.desc) txt.append(Object.assign(document.createElement('div'), { className: 'desc', textContent: c.desc }));
  if (c.note) txt.append(Object.assign(document.createElement('div'), { className: 'note', textContent: c.note }));
  txt.append(Object.assign(document.createElement('p'), { textContent: c.text }));
  if (c.url) txt.append(Object.assign(document.createElement('a'), { className: 'more', href: c.url, target: '_blank', rel: 'noopener', textContent: 'Tamamını oku' }));
  txt.append(Object.assign(document.createElement('div'), { className: 'src', textContent: c.cat === 'ilkyardim' ? 'Genel bilgilendirme · Acil durumda 112' : (c.src || 'Vikipedi') + ' · CC BY-SA' }));
  el.append(txt);

  const rail = document.createElement('div');
  rail.className = 'rail';
  rail.innerHTML =
    `<button class="like${c.liked ? ' on' : ''}" aria-label="Beğen">${svg('like')}</button>` +
    `<button class="save${c.saved ? ' on' : ''}" aria-label="Kaydet">${svg('save')}</button>` +
    `<button class="share" aria-label="Paylaş">${svg('share')}</button>` +
    `<button class="mode${settings.mode === 'rsvp' ? ' on' : ''}" aria-label="Hızlı oku">${svg('mode')}</button>` +
    `<button class="auto${state.auto ? ' on' : ''}" aria-label="Akıcı mod">${svg('auto')}</button>`;
  el.append(rail);
  seeObs.observe(el);
  return el;
}

function setLike(el, on, x, y) {
  const c = el.card;
  if (!!c.liked !== on) {
    c.liked = on;
    likes[c.cat] = Math.max(0, (likes[c.cat] || 0) + (on ? 1 : -1));
    localStorage.setItem('likes', JSON.stringify(likes));
    updateCard(c);
  }
  el.querySelector('.like').classList.toggle('on', on);
  if (on && x != null) {
    const b = Object.assign(document.createElement('div'), { className: 'burst', textContent: '♥' });
    b.style.left = x + 'px'; b.style.top = y + 'px';
    el.append(b); setTimeout(() => b.remove(), 750);
  }
}

let lastTap = 0;
feed.addEventListener('click', e => {
  const el = e.target.closest('.card');
  if (!el?.card) return;
  const c = el.card, btn = e.target.closest('button');
  if (btn?.classList.contains('like')) return setLike(el, !c.liked);
  if (btn?.classList.contains('save')) {
    c.saved = !c.saved; btn.classList.toggle('on', c.saved); updateCard(c);
    return toast(c.saved ? 'Kaydedildi' : 'Kayıt kaldırıldı');
  }
  if (btn?.classList.contains('share')) return share(c);
  if (btn?.classList.contains('auto')) return setAuto(!state.auto);
  if (btn?.classList.contains('mode')) return setMode(settings.mode === 'rsvp' ? 'klasik' : 'rsvp');
  if (e.target.closest('a')) return;
  if (e.target.closest('.stage')) return stageClick(el, btn);
  const now = Date.now(), r = el.getBoundingClientRect();
  if (now - lastTap < 300) { setLike(el, true, e.clientX - r.left, e.clientY - r.top); lastTap = 0; return; }
  lastTap = now;
  if (e.target.closest('.txt') && !el.classList.contains('rsvp')) el.classList.toggle('open');
});

async function share(c) {
  const data = { title: c.title, text: c.title, url: c.url || location.href };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(data.url); toast('Bağlantı kopyalandı'); }
  } catch { /* vazgeçildi */ }
}

/* ---------- Görünürlük, sonsuz kaydırma, DOM budama ---------- */
const seeObs = new IntersectionObserver(entries => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    state.active = en.target;
    if (settings.mode === 'rsvp' && en.target.card) rsvpStart(en.target); else rsvpStop();
    flowStart();
    const all = feed.children, idx = [...all].indexOf(en.target);
    if (all.length - idx < 5) refill();
    if (idx > KEEP_DOM) { // eski kartları at, kaydırma konumunu koru
      const drop = idx - 30, h = feed.clientHeight;
      feed.style.scrollSnapType = 'none';
      for (let i = 0; i < drop; i++) { seeObs.unobserve(all[0]); all[0].remove(); }
      feed.scrollTop -= drop * h;
      requestAnimationFrame(() => feed.style.scrollSnapType = '');
    }
  }
}, { root: feed, threshold: 0.6 });

function go(dir) { feed.scrollBy({ top: dir * feed.clientHeight, behavior: 'smooth' }); }
addEventListener('keydown', e => {
  if (e.target.closest('select,input') || $('.sheet:not([hidden])')) return;
  if (rs.el) {
    if (e.key === ' ') { e.preventDefault(); return transport(rs.el, 'play'); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); return transport(rs.el, 'back'); }
    if (e.key === 'ArrowRight') { e.preventDefault(); return transport(rs.el, 'fwd'); }
  }
  if (['ArrowDown', ' ', 'j'].includes(e.key)) { e.preventDefault(); go(1); }
  if (['ArrowUp', 'k'].includes(e.key)) { e.preventDefault(); go(-1); }
  if (e.key === 'l' && state.active?.card) setLike(state.active, !state.active.card.liked);
});

/* ---------- Akıcı mod ---------- */
const flow = $('#flow'), flowBar = flow.firstElementChild;
let flowT0 = 0, flowDur = 0, flowRaf = 0, holding = false;
function setAuto(on) {
  state.auto = on;
  flow.classList.toggle('on', on);
  document.querySelectorAll('.rail .auto').forEach(b => b.classList.toggle('on', on));
  toast(on ? 'Akıcı mod açık: kartlar kendiliğinden ilerler' : 'Akıcı mod kapalı');
  if (on && rs.done) go(1);
  flowStart();
}
function flowStart() {
  cancelAnimationFrame(flowRaf);
  flowBar.style.width = '0';
  if (!state.auto || !state.active?.card || settings.mode === 'rsvp') return;
  flowDur = dwellMs(state.active.card.text.length);
  let elapsed = 0; flowT0 = performance.now();
  const tick = now => {
    const paused = holding || document.hidden || state.active.classList.contains('open') || $('.sheet:not([hidden])');
    if (!paused) elapsed += now - flowT0;
    flowT0 = now;
    flowBar.style.width = Math.min(100, elapsed / flowDur * 100) + '%';
    if (elapsed >= flowDur) return go(1);
    flowRaf = requestAnimationFrame(tick);
  };
  flowRaf = requestAnimationFrame(tick);
}
feed.addEventListener('pointerdown', () => holding = true);
['pointerup', 'pointercancel', 'pointerleave'].forEach(t => feed.addEventListener(t, () => holding = false));

/* ---------- Hızlı okuma (RSVP) ---------- */
const rs = { el: null, words: [], starts: [0], i: 0, t: 0, paused: false, done: false, t0: 0 };
const fmt = n => n.toLocaleString('tr-TR');

const TI = {
  restart: '<path d="M4 4v6h6"/><path d="M4.6 14.5A8 8 0 1 0 6.3 6.3L4 10"/>',
  back: '<path d="M11 6l-7 6 7 6zM20 6l-7 6 7 6z"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  pause: '<path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z"/>',
  fwd: '<path d="M13 6l7 6-7 6zM4 6l7 6-7 6z"/>',
  next: '<path d="M5 5l10 7-10 7zM17 5h2.5v14H17z"/>',
};
const tsvg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${TI[k]}</svg>`;

function stageOf(el) {
  let st = el.querySelector('.stage');
  if (st) return st;
  st = document.createElement('div');
  st.className = 'stage';
  st.innerHTML =
    '<div class="word" role="button" aria-label="Duraklat ya da sürdür"><span class="l"></span><span class="p"></span><span class="r"></span></div>' +
    '<div class="ctx"></div><div class="rbar"><i></i></div><div class="meta"></div>' +
    '<div class="tp">' +
      `<button data-tp="restart" aria-label="Baştan başlat">${tsvg('restart')}</button>` +
      `<button data-tp="back" aria-label="Geri al: cümle başı">${tsvg('back')}</button>` +
      `<button data-tp="play" class="pp" aria-label="Oynat ya da duraklat">${tsvg('pause')}</button>` +
      `<button data-tp="fwd" aria-label="İleri sar: sonraki cümle">${tsvg('fwd')}</button>` +
      `<button data-tp="next" aria-label="Sonraki kart">${tsvg('next')}</button>` +
    '</div>' +
    '<div class="ctl"><button class="slow" aria-label="Yavaşlat">−</button><span class="wpm"></span><button class="fast" aria-label="Hızlandır">+</button></div>' +
    '<div class="end" hidden></div>';
  el.querySelector('.txt').after(st);
  return st;
}
function showWord(st, w) {
  const [l, p, r] = splitOrp(w);
  st.querySelector('.l').textContent = l;
  st.querySelector('.p').textContent = p;
  st.querySelector('.r').textContent = r;
  // Odak harfi tam ortada durur; taşan uzun kelime iki yana sığacak kadar küçültülür.
  const word = st.querySelector('.word');
  word.style.setProperty('--s', 1);
  const half = word.clientWidth / 2 - 14;
  const need = Math.max(st.querySelector('.l').scrollWidth, st.querySelector('.r').scrollWidth);
  if (half > 0 && need > half) word.style.setProperty('--s', half / need);
}
function paintWpm() {
  document.querySelectorAll('.stage .wpm').forEach(x => x.textContent = `${settings.wpm} kelime/dk`);
  const d = $('#s-wpm'); if (d) d.textContent = `${settings.wpm} kelime/dk`;
}
/** Etkin kartın sahnesini güncel kelimeye göre çizer. */
function paint() {
  const el = rs.el;
  if (!el) return;
  const st = stageOf(el), n = rs.words.length, i = Math.min(rs.i, n - 1);
  showWord(st, rs.words[i]);
  st.querySelector('.rbar i').style.width = (i + 1) / n * 100 + '%';
  const [a, b] = sentenceRange(rs.starts, i, n);
  const ctx = st.querySelector('.ctx');
  if (ctx.dataset.a !== String(a)) { // yeni cümle: bağlam satırını kur
    ctx.dataset.a = a;
    ctx.replaceChildren(...rs.words.slice(a, b).flatMap(w => [Object.assign(document.createElement('span'), { textContent: w }), ' ']));
  }
  [...ctx.children].forEach((sp, k) => { sp.className = a + k === i ? 'cur' : a + k < i ? 'past' : ''; });
  const left = n - i - 1, sec = Math.round(rsvpDuration(rs.words.slice(i + 1), settings.wpm) / 1000);
  st.querySelector('.meta').textContent = rs.done ? '' : (rs.paused ? 'Duraklatıldı · ' : '') + `${fmt(left)} kelime kaldı · yaklaşık ${sec} sn`;
  st.querySelector('.pp').innerHTML = tsvg(rs.paused || rs.done ? 'play' : 'pause');
  el.classList.toggle('paused', rs.paused && !rs.done);
  el.classList.toggle('done', rs.done);
}
function schedule(extra = 0) {
  clearTimeout(rs.t);
  if (rs.el && !rs.paused && !rs.done) rs.t = setTimeout(rsvpStep, extra + wordDelay(rs.words[rs.i], settings.wpm));
}
function rsvpStop() {
  clearTimeout(rs.t);
  rs.el = null; rs.done = false;
}
function rsvpStart(el) {
  rsvpStop();
  const st = stageOf(el);
  el.classList.add('rsvp'); el.classList.remove('open');
  st.querySelector('.end').hidden = true;
  st.querySelector('.ctx').dataset.a = '';
  const words = tokenize(el.card.text);
  if (!words.length) return;
  Object.assign(rs, { el, words, starts: sentenceStarts(words), i: 0, paused: false, done: false, t0: performance.now() });
  paintWpm();
  paint();
  schedule(650); // göz odak noktasına yerleşsin
}
function rsvpStep() {
  const el = rs.el;
  if (!el || !el.isConnected || rs.paused || rs.done) return;
  if (document.hidden || $('.sheet:not([hidden])')) { rs.t = setTimeout(rsvpStep, 200); return; }
  if (rs.i + 1 >= rs.words.length) return rsvpFinish();
  rs.i++;
  paint();
  schedule();
}
function rsvpPause(on) {
  if (!rs.el || rs.done) return;
  rs.paused = on;
  paint();
  schedule();
}
/** Geri al / ileri sar / baştan: i. kelimeye atlar; duraklatılmışsa duraklı kalır. */
function rsvpSeek(i) {
  if (!rs.el) return;
  rs.done = false;
  stageOf(rs.el).querySelector('.end').hidden = true;
  rs.i = Math.max(0, Math.min(i, rs.words.length - 1));
  paint();
  schedule(250);
}
function rsvpFinish() {
  const el = rs.el, st = stageOf(el), n = rs.words.length;
  clearTimeout(rs.t);
  rs.done = true; rs.paused = false;
  paint();
  if (stats.date !== today()) Object.assign(stats, { date: today(), words: 0 });
  stats.words += n; stats.done += 1; saveStats();
  const sec = Math.max(1, Math.round((performance.now() - rs.t0) / 1000));
  const faster = nudgeWpm(stats.done, settings.wpm);
  const end = st.querySelector('.end');
  end.replaceChildren(
    Object.assign(document.createElement('b'), { textContent: `Bitti · ${fmt(n)} kelime · ${sec} sn` }),
    Object.assign(document.createElement('small'), { textContent: `Bugün ${fmt(stats.words)} kelime okudun` }),
  );
  const acts = [['next', 'Sıradaki'], ['text', 'Metni göster']];
  if (faster) acts.unshift(['faster', `Hızlan: ${faster} kelime/dk`]);
  const row = document.createElement('div');
  row.className = 'acts';
  row.append(...acts.map(([a, t]) => { const b = Object.assign(document.createElement('button'), { textContent: t }); b.dataset.act = a; if (a === 'faster') b.dataset.wpm = faster; return b; }));
  end.append(row);
  end.hidden = false;
  if (state.auto) rs.t = setTimeout(() => { if (rs.el === el && rs.done) go(1); }, faster ? 3500 : 1300);
}
function setWpm(w) {
  const v = clampWpm(w);
  if (v === settings.wpm) return;
  settings.wpm = v; saveSettings();
  stats.done = 0; saveStats(); // öneri sayacı yeni hızda baştan başlar
  paintWpm();
  if (rs.el) paint();
}
function transport(el, tp) {
  if (tp === 'next') return go(1);
  if (rs.el !== el) return rsvpStart(el);
  if (tp === 'restart') return rsvpStart(el);
  if (tp === 'play') return rs.done ? rsvpStart(el) : rsvpPause(!rs.paused);
  if (tp === 'back') return rsvpSeek(seekBack(rs.starts, rs.done ? rs.words.length - 1 : rs.i));
  if (tp === 'fwd') { const nx = seekFwd(rs.starts, rs.i); return nx < 0 ? (rs.done || rsvpFinish()) : rsvpSeek(nx); }
}
function stageClick(el, btn) {
  if (btn?.dataset.tp) return transport(el, btn.dataset.tp);
  if (btn?.classList.contains('slow')) return setWpm(settings.wpm - WPM_STEP);
  if (btn?.classList.contains('fast')) return setWpm(settings.wpm + WPM_STEP);
  const act = btn?.dataset.act;
  if (act) {
    clearTimeout(rs.t);
    if (act === 'next') return go(1);
    if (act === 'faster') { setWpm(+btn.dataset.wpm); toast(`Yeni hız: ${settings.wpm} kelime/dk`); return go(1); }
    if (act === 'text') { rsvpStop(); el.classList.remove('rsvp', 'paused'); el.classList.add('open'); return; }
  }
  if (rs.el === el && !rs.done) rsvpPause(!rs.paused);
}
function setMode(mode, quiet) {
  settings.mode = mode; saveSettings();
  document.querySelectorAll('.rail .mode').forEach(b => b.classList.toggle('on', mode === 'rsvp'));
  document.querySelectorAll('#s-mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  if (mode === 'rsvp') { if (state.active?.card) rsvpStart(state.active); }
  else { rsvpStop(); document.querySelectorAll('.card.rsvp').forEach(c => c.classList.remove('rsvp', 'paused')); }
  flowStart();
  if (!quiet) toast(mode === 'rsvp' ? 'Hızlı oku: kelimeler tek tek gelir' : 'Klasik okuma');
}

/** İlk açılışta okuma biçimini soran kart; üstünde canlı bir örnek döner. */
function welcomeCard() {
  const el = document.createElement('section');
  el.className = 'card pick';
  el.style.setProperty('--h', 38);
  const demo = document.createElement('div');
  demo.className = 'stage demo';
  demo.innerHTML = '<div class="word"><span class="l"></span><span class="p"></span><span class="r"></span></div>';
  const words = tokenize('Gözünü turuncu harften ayırma. Kelimeler sana gelir, sen sadece bakarsın. Böyle okumak ister misin?');
  let i = 0;
  const tick = () => {
    if (!el.isConnected && i > 0) return;
    showWord(demo, words[i % words.length]);
    setTimeout(tick, wordDelay(words[i++ % words.length], 260));
  };
  tick();
  const box = document.createElement('div');
  box.className = 'opts';
  box.append(
    Object.assign(document.createElement('h2'), { textContent: 'Nasıl okumak istersin?' }),
    ...[
      ['rsvp', 250, 'Hızlı oku · rahat', '250 kelime/dk — başlamak için önerilen'],
      ['rsvp', 350, 'Hızlı oku · tempolu', '350 kelime/dk — alışkınsan'],
      ['klasik', 0, 'Klasik', 'Metni kendi hızımda okurum'],
    ].map(([mode, wpm, t, d]) => {
      const b = document.createElement('button');
      b.append(Object.assign(document.createElement('b'), { textContent: t }), Object.assign(document.createElement('small'), { textContent: d }));
      b.onclick = () => {
        if (wpm) { settings.wpm = wpm; paintWpm(); }
        setMode(mode, true);
        if (feed.children.length > 1) go(1); else refill();
      };
      return b;
    }),
    Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Şimşek düğmesiyle istediğin an değiştirirsin.' }),
  );
  el.append(demo, box);
  return el;
}

/* ---------- Üst çubuk, sekmeler, paneller ---------- */
const CHIPS = ['karisik', 'merak', 'populer', 'ogun', 'seckin', 'bugun', 'felsefe', ...TOPICS.map(t => t.key).filter(k => k !== 'felsefe'), 'rastgele', 'ilkyardim'];
$('#chips').append(...CHIPS.map(k => {
  const b = Object.assign(document.createElement('button'), { textContent: LABELS[k] });
  b.dataset.cat = k;
  b.onclick = () => { openTab('feed'); restart(k); };
  return b;
}));

function setNet(on) { $('#net').classList.toggle('off', !on); $('#net').title = on ? 'Çevrimiçi' : 'Çevrimdışı: depodan gösteriliyor'; }
addEventListener('online', () => setNet(true));
addEventListener('offline', () => { setNet(false); toast('Çevrimdışı: depodaki kartlar gösteriliyor'); });

let toastT;
function toast(t) {
  const el = $('#toast'); el.textContent = t; el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2200);
}

function openTab(tab) {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#sheet-saved').hidden = tab !== 'saved';
  $('#sheet-depot').hidden = tab !== 'depot';
  if (tab === 'saved') renderSaved();
  if (tab === 'depot') renderDepot();
}
$('#tabs').addEventListener('click', e => { const t = e.target.dataset.tab; if (t) openTab(t); });
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => openTab('feed'));

async function renderSaved() {
  const s = await store();
  const all = (await req(s.getAll())).filter(c => c.saved || c.liked).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const box = $('#saved-list');
  if (!all.length) return box.replaceChildren(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Henüz bir şey yok. Kartta kalbe ya da yer imine dokun; çift dokunmak da beğenir.' }));
  box.replaceChildren(...all.map(c => {
    const b = document.createElement('button');
    b.className = 'item'; b.style.setProperty('--h', HUES[c.cat] ?? 205);
    const pic = c.img ? Object.assign(new Image(), { src: c.img, alt: '', loading: 'lazy' }) : Object.assign(document.createElement('div'), { className: 'ph' });
    const t = document.createElement('div');
    t.append(Object.assign(document.createElement('b'), { textContent: c.title }),
      Object.assign(document.createElement('small'), { textContent: `${LABELS[c.cat] || c.cat}${c.saved ? ' · kayıtlı' : ''}${c.liked ? ' · beğenildi' : ''}` }));
    b.append(pic, t);
    b.onclick = () => {
      openTab('feed');
      const el = cardEl(c);
      const anchor = state.active?.isConnected ? state.active : feed.lastElementChild;
      if (anchor) anchor.after(el); else feed.append(el);
      el.scrollIntoView({ behavior: 'smooth' });
    };
    return b;
  }));
}

/* ---------- Depo: toplu indirme ---------- */
const DCATS = ['merak', 'seckin', ...TOPICS.map(t => t.key), 'rastgele'];
$('#d-cat').append(...DCATS.map(k => new Option(LABELS[k], k)));

$('#s-mode').addEventListener('click', e => { const m = e.target.dataset.mode; if (m) setMode(m, true); });
$('#s-slow').onclick = () => setWpm(settings.wpm - WPM_STEP);
$('#s-fast').onclick = () => setWpm(settings.wpm + WPM_STEP);
$('#s-img').onchange = e => { settings.img = e.target.checked; saveSettings(); restart(); };

async function renderDepot() {
  document.querySelectorAll('#s-mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === settings.mode));
  $('#s-img').checked = settings.img;
  $('#s-stats').textContent = `Bugün hızlı okumayla ${fmt(stats.date === today() ? stats.words : 0)} kelime okudun.`;
  paintWpm();
  $('#d-total').textContent = (await countCards()).toLocaleString('tr-TR');
  const est = await navigator.storage?.estimate?.().catch(() => null);
  $('#d-space').textContent = est?.quota ? `Kullanılan alan: ${(est.usage / 1e6).toFixed(1)} MB · tarayıcının ayırabildiği: ${(est.quota / 1e9).toFixed(1)} GB` : '';
  const rows = [];
  for (const k of Object.keys(LABELS).filter(k => k !== 'karisik')) {
    const n = await countCards(k);
    if (n) rows.push(Object.assign(document.createElement('span'), { textContent: LABELS[k] }), Object.assign(document.createElement('span'), { textContent: n.toLocaleString('tr-TR') }));
  }
  $('#d-cats').replaceChildren(...rows);
}

let dl = null;
async function cacheImages(cards) {
  if (!('caches' in window)) return;
  const cache = await caches.open(IMG_CACHE);
  await Promise.allSettled(cards.filter(c => c.img).map(async c => {
    if (await cache.match(c.img)) return;
    const r = await fetch(c.img, { mode: 'cors' });
    if (r.ok) await cache.put(c.img, r);
  }));
}
async function download(cat, target, withImg) {
  if (dl) return;
  if (!navigator.onLine) return toast('İndirmek için internet gerekli');
  navigator.storage?.persist?.();
  dl = { stop: false };
  $('#d-prog').hidden = false; $('#d-sizes').hidden = true;
  let added = 0, dry = 0, fail = 0;
  const show = t => { $('#d-bar').style.width = Math.min(100, added / target * 100) + '%'; $('#d-msg').textContent = t; };
  show('Başlıyor…');
  while (added < target && !dl.stop) {
    const res = await Promise.allSettled([0, 1, 2].map(() => fetchCat(cat)));
    const cards = res.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    if (res.every(r => r.status === 'rejected')) { if (++fail >= 3) break; } else fail = 0;
    const fresh = await putCards(cards);
    if (withImg) await cacheImages(fresh);
    added += fresh.length;
    dry = fresh.length ? 0 : dry + 1;
    show(`${added.toLocaleString('tr-TR')} / ${target.toLocaleString('tr-TR')} yeni kart`);
    if (dry >= 5) break; // bu konuda yeni kart çıkmıyor
    await new Promise(r => setTimeout(r, 250)); // Vikipedi'ye nazik ol
  }
  const why = dl.stop ? 'Durduruldu' : fail >= 3 ? 'Bağlantı koptu' : added >= target ? 'Tamamlandı' : 'Bu konuda yeni kart kalmadı';
  show(`${why}: ${added.toLocaleString('tr-TR')} yeni kart eklendi.`);
  dl = null; $('#d-sizes').hidden = false; $('#d-stop').hidden = true;
  renderDepot();
}
$('#d-sizes').addEventListener('click', e => {
  const n = +e.target.dataset.n;
  if (n) { $('#d-stop').hidden = false; download($('#d-cat').value, n, $('#d-img').checked); }
});
$('#d-stop').onclick = () => { if (dl) dl.stop = true; };

/* ---------- Başlangıç ---------- */
async function boot() {
  setNet(navigator.onLine);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.warn);
  try { // yerleşik ilk yardım kartları her zaman depoda dursun
    const iy = await (await fetch('data/ilkyardim.json')).json();
    await putCards(iy.map(c => ({ ...c, cat: 'ilkyardim', img: '', url: '', src: 'İlk yardım' })));
  } catch (e) { console.warn(e); }
  restart('karisik');
}
boot();
