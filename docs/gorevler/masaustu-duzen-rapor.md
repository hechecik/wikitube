# Geniş ekran düzeni ve hizalama — rapor (2026-11-13)

- Geniş ekranda (≥900 px) kanallar solda dikey liste, sahne ortada tam genişlik; yan boşluk kalmıyor.
- Hızlı okumada odak harfi tam ortada; oynat düğmesi, hız satırı ve ilerleme çubuğu aynı eksende (ölçüldü: 1920 ve 390 px genişlikte sapma 0 px).
- Uzun kelimeler ölçülerek iki yana sığacak kadar küçültülüyor.
- "Sonraki kart" düğmesi eklendi (oynat düğmesi beşli sıranın ortasında).
- Telefonda hızlı okurken beğen/kaydet/paylaş düğmeleri alta yatay sıraya iniyor; sahneyle çakışma yok (360×640 ve 390×844'te ölçüldü).
- Kanal şeridinde seçili kanal ortaya kayıyor, sağ kenar soluyor.
- `sw.js` sürümü v3.

Testler: `npm test` 18/18; tarayıcı testleri (taklit yanıtlarla) hatasız.
Doğrulanmayan: gerçek cihazda (iPhone Safari) görünüm denenmedi.
