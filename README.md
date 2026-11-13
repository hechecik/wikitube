# WikiTube

Kaydırdıkça öğren: Reels/Shorts gibi dikey kaydırılan, Türkçe bilgi akışı. [Project N.O.M.A.D.](https://github.com/Crosstalk-Solutions/project-nomad) fikrinden esinlenir; sunucu gerektirmez, GitHub Pages üzerinde çalışır.

## Ne yapar

- **Sonsuz akış:** kartlar Türkçe Vikipedi'den canlı ve rastgele gelir (16 konu + "Tarihte bugün").
- **Çevrimdışı depo:** görülen her kart cihaza kaydedilir. Depo sekmesinden 500 / 2.000 / 10.000 kart toplu indirilir; internet gidince akış depodan devam eder.
- **Yerleşik ilk yardım kartları:** internet hiç olmasa da açılır (`data/ilkyardim.json`).
- **Hızlı oku (RSVP):** kelimeler tek tek, büyük puntoyla ve odak harfi vurgulanarak gelir. Hız 150–800 kelime/dk arasında ayarlanır; aynı hızda birkaç kart bitince hızlanma önerilir. İlk açılışta okuma biçimi sorulur, şimşek düğmesiyle değişir.
- **Metin öncelikli:** resimler varsayılan olarak kapalıdır, Ayarlar'dan açılır.
- **Akıcı mod:** kartlar metin uzunluğuna göre kendiliğinden ilerler.
- **Beğeni ağırlığı:** beğendiğin konular karışık akışta daha sık çıkar.
- Ana ekrana eklenebilir (PWA). Sunucu, hesap, takip yok; veriler yalnızca cihazda durur.

## Yayına alma

Repo ayarlarında **Settings → Pages → Deploy from a branch → main / (root)**. Derleme adımı yoktur.

## Geliştirme

```
python3 -m http.server 8000   # http://localhost:8000
npm test                      # lib.js birim testleri
```

JS/CSS değişince `sw.js` içindeki `V` sürümünü artır.

## İçerik ve lisans

Kart metinleri ve görseller Vikipedi/Wikimedia Commons kaynaklıdır (metin CC BY-SA 4.0; görsellerin lisansı dosyaya göre değişir, kaynak bağlantısı karttadır). İlk yardım kartları genel bilgilendirme amaçlıdır; acil durumda 112.
