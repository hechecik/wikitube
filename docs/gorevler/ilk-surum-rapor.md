# İlk sürüm + hızlı okuma — rapor (2026-11-13)

## Yapılanlar
- Kaydırmalı akış, 17 kanal, çevrimdışı depo (IndexedDB + service worker), akıcı mod, beğeni ağırlığı.
- Hızlı oku (RSVP) motoru: odak harfi (ORP) hizalı kelime gösterimi, noktalama/uzun kelime beklemesi, duraklatma, hız ayarı, bitiş paneli, hızlanma önerisi, günlük kelime sayacı.
- İlk açılışta okuma biçimi seçimi; resimler varsayılan kapalı.

## Testler
- `npm test`: 12/12 (lib.js saf fonksiyonları).
- Telefon boyutunda tarayıcı testi (Vikipedi yanıtları taklit edilerek): klasik akış, depo indirme, çevrimdışı akış, RSVP akışı — konsol hatası yok.

## Doğrulanmayanlar
- Canlı Vikipedi ile uçtan uca çalışma bu ortamdan denenemedi (erişim kapalı). API adreslerinin yanıt biçimi ayrıca doğrulandı.
- Resimli kart görünümü gerçek resimle denenmedi.
- `lib.js` ve `sw.js` içindeki eşikler "doğrulanmamış başlangıç değeri" olarak işaretli.
- İlk yardım kartlarının metni tıbbi gözden geçirme bekliyor.

## Sıradaki adım
- Pages'i aç: Settings → Pages → Deploy from a branch → main / (root).
- Telefonda dene; hız varsayılanları ve öneri sıklığını (NUDGE_EVERY) kullanıma göre ayarla.
