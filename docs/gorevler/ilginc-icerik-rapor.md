# İlgi çekici içerik + oynatma düğmeleri — rapor (2026-11-13)

## Yapılanlar
- Yeni kanallar: İlginç (başlığında "paradoksu, etkisi, sendromu…" geçen maddeler), Gündemde (dünün en çok okunanları), O gün popüler (geçmiş bir yılın bugününde en çok okunan film/dizi/şarkı maddeleri), Seçkin (seçkin + kaliteli maddeler).
- Karışık akış ağırlıkları bu kanallara kaydırıldı; Rastgele kanalında 5.000 bayttan kısa taslaklar atlanıyor.
- Kartlarda kısa açıklama (Vikiveri) ve okunma notu.
- Hızlı okumada baştan / geri al / oynat-duraklat / ileri sar düğmeleri, bağlam cümlesi, kalan kelime ve süre; klavyede boşluk ve sol/sağ ok.
- `sw.js` sürümü v2.

## Testler
- `npm test`: 18/18.
- Tarayıcı testi (yanıtlar taklit): klasik akış, depo, çevrimdışı, hızlı oku düğmeleri, beş yeni kanal — konsol hatası yok.

## Doğrulanmayanlar
- Wikimedia okunma verisi (pageviews/top) adresi bu ortamdan çağrılamadı; yanıt biçimi belgelerden bilinen hâliyle kodlandı. Canlıda Gündemde ve O gün popüler kanalları ilk denenecek yerler.
- Seçkin/Kaliteli kategori araması ve kısa açıklama alanı canlı API'de doğrulandı; "intitle:" aramaları doğrulanmadı.
- "O gün popüler" gerçek gişe/liste verisi değildir: o gün Türkçe Vikipedi'de en çok okunan film, dizi, şarkı maddeleridir.
- Kanal ağırlıkları ve bayt eşiği doğrulanmamış başlangıç değerleridir.
