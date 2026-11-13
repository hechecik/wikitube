// Saf (ağa çıkmayan) yardımcılar — test/lib.test.js ile sınanır.

// Vikipedi "articletopic" anahtarları (CirrusSearch). hue: resimsiz kart zemini.
export const TOPICS = [
  { key: 'tip', label: 'Tıp', q: 'medicine-and-health', hue: 350 },
  { key: 'tarih', label: 'Tarih', q: 'history', hue: 30 },
  { key: 'uzay', label: 'Uzay', q: 'space', hue: 250 },
  { key: 'biyoloji', label: 'Canlılar', q: 'biology', hue: 140 },
  { key: 'teknoloji', label: 'Teknoloji', q: 'technology', hue: 200 },
  { key: 'fizik', label: 'Fizik', q: 'physics', hue: 220 },
  { key: 'cografya', label: 'Yeryüzü', q: 'earth-and-environment', hue: 170 },
  { key: 'felsefe', label: 'Felsefe', q: 'philosophy-and-religion', hue: 280 },
  { key: 'edebiyat', label: 'Edebiyat', q: 'literature', hue: 15 },
  { key: 'muzik', label: 'Müzik', q: 'music', hue: 310 },
  { key: 'sinema', label: 'Sinema', q: 'films', hue: 0 },
  { key: 'yemek', label: 'Yemek', q: 'food-and-drink', hue: 45 },
  { key: 'mimari', label: 'Mimari', q: 'architecture', hue: 190 },
  { key: 'matematik', label: 'Matematik', q: 'mathematics', hue: 260 },
];

export const LABELS = {
  karisik: 'Karışık', rastgele: 'Rastgele', bugun: 'Tarihte bugün', ilkyardim: 'İlk yardım',
  merak: 'İlginç', populer: 'Gündemde', ogun: 'O gün popüler', seckin: 'Seçkin',
  ...Object.fromEntries(TOPICS.map(t => [t.key, t.label])),
};
export const HUES = {
  rastgele: 205, bugun: 38, ilkyardim: 355, merak: 48, populer: 12, ogun: 300, seckin: 160,
  ...Object.fromEntries(TOPICS.map(t => [t.key, t.hue])),
};

export const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// Doğrulanmamış başlangıç değerleri: çok kısa taslak maddeleri ele, uzunları kırp.
export const MIN_EXTRACT = 140;
export const MAX_EXTRACT = 900;

/** Metni en yakın cümle sonunda kırpar. */
export function clip(text, max = MAX_EXTRACT) {
  const t = String(text || '').replace(/\n{2,}/g, '\n').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…');
}

/** MediaWiki action=query yanıtını kartlara çevirir. */
export function wikiToCards(json, cat, { minBytes = 0, idPrefix = 'w' } = {}) {
  const pages = Object.values(json?.query?.pages || {});
  const out = [];
  for (const p of pages) {
    const ex = (p.extract || '').trim();
    if (!p.pageid || ex.length < MIN_EXTRACT) continue;
    if ((p.length || 0) < minBytes) continue; // taslak maddeleri ele
    if (/anlamlara gelebilir|şu anlamlara gel/i.test(ex.slice(0, 200))) continue; // anlam ayrımı
    out.push({
      id: idPrefix + p.pageid, cat, title: p.title, desc: p.description || '', text: clip(ex),
      img: p.thumbnail?.source || '', url: p.fullurl || '', src: 'Vikipedi',
    });
  }
  return out;
}

/** REST feed/onthisday/events yanıtını kartlara çevirir. */
export function onThisDayToCards(json, mm, dd) {
  const out = [];
  (json?.events || []).forEach((e, i) => {
    if (!e?.text) return;
    const pages = e.pages || [];
    const withImg = pages.find(p => p.thumbnail?.source);
    const last = pages[pages.length - 1];
    out.push({
      id: `g${mm}-${dd}-${e.year}-${i}`, cat: 'bugun',
      title: `${dd} ${AYLAR[mm - 1]} ${e.year}`, text: e.text,
      img: withImg?.thumbnail?.source || '',
      url: last?.content_urls?.desktop?.page || '', src: 'Vikipedi · Tarihte bugün',
    });
  });
  return out;
}

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Ağırlıklı rastgele seçim. weights: items ile aynı uzunlukta, negatif olmayan sayılar. */
export function pickWeighted(items, weights, rnd = Math.random) {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (!items.length || total <= 0) return undefined;
  let r = rnd() * total;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/** Beğeni sayısından konu ağırlığı: beğendikçe artar, tavanı vardır (doğrulanmamış başlangıç değerleri). */
export function topicWeight(likes = 0) {
  return 1 + Math.min(Math.max(0, likes) * 0.5, 4);
}

/** Akıcı modda kartın ekranda kalma süresi (ms) — doğrulanmamış başlangıç değerleri. */
export function dwellMs(textLen = 0) {
  return Math.min(4000 + textLen * 45, 22000);
}

/* ---------- Hızlı okuma (RSVP) ---------- */
// Doğrulanmamış başlangıç değerleri
export const WPM_MIN = 150, WPM_MAX = 800, WPM_STEP = 50;
export const NUDGE_EVERY = 4; // aynı hızda bu kadar kart bitince hızlanma önerilir

/** Metni RSVP kelimelerine böler. */
export function tokenize(text) {
  return String(text || '').split(/\s+/).filter(Boolean);
}

/** Gözün odaklandığı harfin (ORP) dizini: kelimenin ortasının biraz solu. Noktalama sayılmaz. */
export function orpIndex(word) {
  const lead = (word.match(/^[^\p{L}\p{N}]+/u) || [''])[0].length;
  const core = word.slice(lead).replace(/[^\p{L}\p{N}]+$/u, '');
  const n = [...core].length;
  const i = n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4;
  return lead + i;
}

/** Kelimeyi ORP harfine göre üçe böler: [sol, odak, sağ]. */
export function splitOrp(word) {
  const ch = [...word], i = Math.min(orpIndex(word), ch.length - 1);
  return [ch.slice(0, i).join(''), ch[i] || '', ch.slice(i + 1).join('')];
}

/** Kelimenin ekranda kalma süresi (ms): noktalama ve uzun kelimede nefes payı. */
export function wordDelay(word, wpm) {
  let f = 1;
  if (/[.!?…]["”')\]]?$/.test(word)) f = 2.2;
  else if (/[,;:—–]$/.test(word)) f = 1.5;
  const n = [...word].length;
  if (n > 12) f *= 1.5; else if (n > 8) f *= 1.25;
  return Math.round(60000 / wpm * f);
}

export function rsvpDuration(words, wpm) {
  return words.reduce((s, w) => s + wordDelay(w, wpm), 0);
}

export function clampWpm(w) {
  return Math.min(WPM_MAX, Math.max(WPM_MIN, Math.round(w / WPM_STEP) * WPM_STEP));
}

/** Aynı hızda biten kart sayısına göre hızlanma önerisi; önerilecek hız ya da null. */
export function nudgeWpm(doneAtSpeed, wpm) {
  if (doneAtSpeed > 0 && doneAtSpeed % NUDGE_EVERY === 0 && wpm < WPM_MAX) return clampWpm(wpm + WPM_STEP);
  return null;
}

/* ---------- İlgi çekici içerik kaynakları ---------- */
// "X etkisi", "X paradoksu" gibi kısa ve merak uyandıran maddeleri yakalayan aramalar.
export const MERAK = ['paradoksu', 'etkisi', 'sendromu', 'yanılgısı', 'deneyi', 'yasası', 'illüzyonu', 'fenomeni',
  'hipotezi', 'gizemi', 'efsanesi', 'ilkesi', 'problemi', 'teorisi'].map(w => 'intitle:' + w);
export const SECKIN_Q = 'incategory:"Seçkin maddeler|Kaliteli maddeler"';
// Doğrulanmamış başlangıç değerleri
export const MIN_BYTES_RANDOM = 5000; // rastgele kanalda bundan kısa (bayt) maddeler atlanır
export const TOP_TAKE = 150;          // günün en çok okunanlarından kaç madde alınır
export const PV_FIRST_YEAR = 2016;    // okunma verisi 2015 ortasında başlar

const NS_RE = /^(Özel|Vikipedi|Dosya|Kategori|Kullanıcı|Şablon|Portal|Yardım|Tartışma|Modül|Special|Wikipedia|MediaWiki):/;

/** Wikimedia pageviews/top yanıtından madde listesini çıkarır: [{title, views, rank}]. */
export function topTitles(json, limit = TOP_TAKE) {
  const arts = json?.items?.[0]?.articles || [];
  return arts
    .filter(a => a?.article && a.article !== 'Anasayfa' && a.article !== '-' && !NS_RE.test(a.article))
    .slice(0, limit)
    .map(a => ({ title: a.article.replace(/_/g, ' '), views: a.views, rank: a.rank }));
}

const MEDIA_RE = /(?<!\p{L})(film|filmi|dizi|dizisi|şarkı|şarkısı|albüm|albümü|tekli|teklisi|single|anime)(?!\p{L})/iu;
/** Kısa açıklama bir film, dizi ya da şarkı/albümü mü anlatıyor? */
export function isMedia(desc) {
  return MEDIA_RE.test(String(desc || ''));
}

/** Bugünün ay/gününe denk gelen geçmiş yıllar. */
export function pastYears(now = new Date()) {
  const out = [];
  for (let y = PV_FIRST_YEAR; y < now.getFullYear(); y++) out.push(y);
  return out;
}

/* ---------- Cümle içinde gezinme (geri al / ileri sar) ---------- */
/** Cümle başlangıcı olan kelime dizinleri. */
export function sentenceStarts(words) {
  const out = [0];
  for (let i = 0; i < words.length - 1; i++) if (/[.!?…]["”')\]]?$/.test(words[i])) out.push(i + 1);
  return out;
}
/** i. kelimenin içinde bulunduğu cümle: [başlangıç, bitiş). */
export function sentenceRange(starts, i, n) {
  let a = 0, b = n;
  for (const s of starts) { if (s <= i) a = s; else { b = s; break; } }
  return [a, b];
}
/** Geri al: cümlenin içindeysen başına, başındaysan önceki cümleye. */
export function seekBack(starts, i) {
  const [a] = sentenceRange(starts, i, Infinity);
  if (i - a > 2) return a;
  const k = starts.indexOf(a);
  return k > 0 ? starts[k - 1] : 0;
}
/** İleri sar: sonraki cümlenin başı; yoksa -1. */
export function seekFwd(starts, i) {
  const nx = starts.find(s => s > i);
  return nx === undefined ? -1 : nx;
}
