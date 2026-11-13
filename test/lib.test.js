import test from 'node:test';
import assert from 'node:assert/strict';
import { clip, wikiToCards, onThisDayToCards, shuffle, pickWeighted, topicWeight, dwellMs, TOPICS, LABELS } from '../lib.js';

const long = 'Bu bir deneme cümlesidir. '.repeat(10);

test('clip cümle sonunda keser', () => {
  const c = clip(long, 60);
  assert.ok(c.length <= 60);
  assert.ok(c.endsWith('.'));
  assert.equal(clip('kısa'), 'kısa');
});

test('wikiToCards kısa ve anlam ayrımı sayfalarını eler', () => {
  const json = { query: { pages: {
    1: { pageid: 1, title: 'A', extract: long, fullurl: 'u', thumbnail: { source: 'i' } },
    2: { pageid: 2, title: 'B', extract: 'kısa' },
    3: { pageid: 3, title: 'C', extract: 'C şu anlamlara gelebilir: ' + long },
  } } };
  const cards = wikiToCards(json, 'tip');
  assert.equal(cards.length, 1);
  assert.deepEqual({ ...cards[0], text: '' }, { id: 'w1', cat: 'tip', title: 'A', desc: '', text: '', img: 'i', url: 'u', src: 'Vikipedi' });
  assert.deepEqual(wikiToCards({}, 'x'), []);
});

test('onThisDayToCards', () => {
  const json = { events: [{ text: 'Olay', year: 1995, pages: [
    { content_urls: { desktop: { page: 'p1' } } },
    { thumbnail: { source: 'img' }, content_urls: { desktop: { page: 'p2' } } },
  ] }, { year: 1 }] };
  const c = onThisDayToCards(json, 11, 13);
  assert.equal(c.length, 1);
  assert.equal(c[0].title, '13 Kasım 1995');
  assert.equal(c[0].img, 'img');
  assert.equal(c[0].url, 'p2');
  assert.equal(c[0].id, 'g11-13-1995-0');
});

test('shuffle elemanları korur', () => {
  const a = [1, 2, 3, 4, 5];
  assert.deepEqual(shuffle(a).sort(), a);
});

test('pickWeighted', () => {
  assert.equal(pickWeighted(['a', 'b'], [0, 1]), 'b');
  assert.equal(pickWeighted(['a', 'b'], [1, 1], () => 0.1), 'a');
  assert.equal(pickWeighted(['a', 'b'], [1, 1], () => 0.9), 'b');
  assert.equal(pickWeighted([], []), undefined);
  assert.equal(pickWeighted(['a'], [0]), undefined);
});

test('ağırlık ve süre sınırları', () => {
  assert.equal(topicWeight(0), 1);
  assert.equal(topicWeight(100), 5);
  assert.equal(dwellMs(0), 4000);
  assert.equal(dwellMs(1e6), 22000);
});

test('her konunun etiketi var', () => {
  for (const t of TOPICS) assert.ok(LABELS[t.key]);
});

import { tokenize, orpIndex, splitOrp, wordDelay, rsvpDuration, clampWpm, nudgeWpm } from '../lib.js';

test('tokenize', () => {
  assert.deepEqual(tokenize(' Bir  iki\nüç. '), ['Bir', 'iki', 'üç.']);
  assert.deepEqual(tokenize(''), []);
});

test('orpIndex kelime uzunluğuna göre', () => {
  assert.equal(orpIndex('a'), 0);
  assert.equal(orpIndex('ve'), 1);
  assert.equal(orpIndex('kitap'), 1);
  assert.equal(orpIndex('İstanbul'), 2);
  assert.equal(orpIndex('ansiklopedi'), 3);
  assert.equal(orpIndex('(kitap),'), 2); // baştaki noktalama atlanır
});

test('splitOrp parçaları kelimeyi geri verir', () => {
  for (const w of ['a', 'Şimon', '"İstanbul",', '1995', '—']) {
    const [l, p, r] = splitOrp(w);
    assert.equal(l + p + r, w);
    assert.equal([...p].length, 1);
  }
  assert.deepEqual(splitOrp('kitap'), ['k', 'i', 'tap']);
});

test('wordDelay noktalama ve uzunlukta bekler', () => {
  assert.equal(wordDelay('ev', 300), 200);
  assert.equal(wordDelay('ev,', 300), 300);
  assert.equal(wordDelay('ev.', 300), 440);
  assert.equal(wordDelay('ansiklopedi', 300), 250);
  assert.equal(rsvpDuration(['ev', 'ev.'], 300), 640);
});

test('hız sınırları ve öneri', () => {
  assert.equal(clampWpm(10), 150);
  assert.equal(clampWpm(9999), 800);
  assert.equal(clampWpm(330), 350);
  assert.equal(nudgeWpm(0, 300), null);
  assert.equal(nudgeWpm(3, 300), null);
  assert.equal(nudgeWpm(4, 300), 350);
  assert.equal(nudgeWpm(4, 800), null);
});

import { topTitles, isMedia, pastYears, sentenceStarts, sentenceRange, seekBack, seekFwd, MERAK } from '../lib.js';

test('wikiToCards: açıklama, bayt eşiği, kimlik öneki', () => {
  const json = { query: { pages: {
    1: { pageid: 1, title: 'A', extract: long, length: 9000, description: 'açıklama' },
    2: { pageid: 2, title: 'B', extract: long, length: 100 },
  } } };
  const c = wikiToCards(json, 'rastgele', { minBytes: 5000, idPrefix: 'o2019-' });
  assert.equal(c.length, 1);
  assert.equal(c[0].id, 'o2019-1');
  assert.equal(c[0].desc, 'açıklama');
});

test('topTitles ad alanlarını ve ana sayfayı atar', () => {
  const json = { items: [{ articles: [
    { article: 'Anasayfa', views: 9, rank: 1 }, { article: 'Özel:Ara', views: 8, rank: 2 },
    { article: 'Avatar:_Suyun_Yolu', views: 7, rank: 3 }, { article: '-', views: 6, rank: 4 },
    { article: 'Kurtlar_Vadisi', views: 5, rank: 5 },
  ] }] };
  assert.deepEqual(topTitles(json), [
    { title: 'Avatar: Suyun Yolu', views: 7, rank: 3 }, { title: 'Kurtlar Vadisi', views: 5, rank: 5 }]);
  assert.equal(topTitles(json, 1).length, 1);
  assert.deepEqual(topTitles({}), []);
});

test('isMedia', () => {
  for (const d of ['2019 ABD yapımı film', 'Türk televizyon dizisi', 'Tarkan şarkısı', 'Sezen Aksu albümü', '2009 filmi'])
    assert.ok(isMedia(d), d);
  for (const d of ['Fransız futbolcu', 'filmografi', 'Türk yönetmen', '', undefined]) assert.ok(!isMedia(d), String(d));
});

test('pastYears', () => {
  assert.deepEqual(pastYears(new Date(2019, 5, 1)), [2016, 2017, 2018]);
});

test('cümle içinde gezinme', () => {
  const w = 'Bir iki üç. Dört beş altı yedi! Sekiz.'.split(' ');
  const st = sentenceStarts(w);
  assert.deepEqual(st, [0, 3, 7]);
  assert.deepEqual(sentenceRange(st, 4, w.length), [3, 7]);
  assert.deepEqual(sentenceRange(st, 7, w.length), [7, 8]);
  assert.equal(seekBack(st, 6), 3);  // cümlenin içinde: başına
  assert.equal(seekBack(st, 4), 0);  // başına yakın: önceki cümle
  assert.equal(seekBack(st, 1), 0);
  assert.equal(seekFwd(st, 4), 7);
  assert.equal(seekFwd(st, 7), -1);
});

test('merak aramaları intitle ile başlar', () => {
  assert.ok(MERAK.length > 5 && MERAK.every(q => q.startsWith('intitle:')));
});
