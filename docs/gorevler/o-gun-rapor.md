# "O gün" kanalı: yabancı film, albüm ve tarihsel olay — rapor (2026-11-13)

- Kaynak değişti: okunma sayıları yerine Vikiveri'den "bu ay/günde yayımlanmış" kayıtlar.
  - Filmler: yapım ülkesi ABD, Birleşik Krallık, Fransa ya da Almanya olanlar.
  - Albümler: Türkiye kaynaklı olanlar (ülke ya da sanatçı) dışarıda.
  - Tarihsel olaylar: Vikipedi "Tarihte bugün" akışı.
- Hepsi en az 2 yıl öncesinden (`OGUN_GAP`); diziler kanaldan çıktı.
- Kart metinleri yine Türkçe Vikipedi'den; kartta "13 Kasım 1992 · gösterime giren film" notu.
- Karışık akışta bu kanalın ağırlığı artırıldı. `sw.js` sürümü v4.

Testler: `npm test` 19/19; tarayıcı testleri (taklit yanıtlarla) hatasız.
Doğrulananlar: film ve albüm Vikiveri sorguları canlıda çalıştırıldı (örnek sonuçlar: Temel İçgüdü 1992, Bram Stoker'dan Dracula 1992; Laundry Service 2001, You Can Dance 1987).
Doğrulanmayanlar: sorguların tarayıcıdan (CORS) çağrılması ve 400 satırlık tam sorgunun süresi canlı sitede denenmedi. Vikiveri'deki tarih bazen ilk gösterim değil, başka bir ülkedeki gösterim tarihidir.
