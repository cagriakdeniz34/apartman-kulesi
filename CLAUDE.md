# Apartman Kulesi — Proje Rehberi

Bu dosya projenin tek doğru kaynağıdır. Her oturumda önce bunu oku; tasarım kararları burada yazdığı gibi uygulanır. Bir kuralı değiştirmen gerekirse önce bana sor, sonra bu dosyayı da güncelle.

## 1. Oyunun özeti

Ekranın üstünde sağa sola sallanan bir vinç var, ucunda bir apartman katı asılı. Oyuncu ekrana dokununca kat düşer ve kulenin üstüne oturur. Amaç olabildiğince yüksek bir kule kurmak.

Oyunun farkı: kayık oturan katın taşan kısmı **kesilip düşmez**. Kat olduğu gibi kalır ve kulenin **eğimi** o yöne artar. Eğim birikir, kule sallanmaya başlar; kritik açı aşılırsa kule yıkılır.

- Tür: tek dokunuşlu, sonsuz (endless) beceri oyunu
- Platform: mobil tarayıcı öncelikli, masaüstü tarayıcıda da oynanır
- Oturum süresi hedefi: 1–3 dakika
- Dil: arayüz metinleri Türkçe

## 2. Teknik kurallar

- **Saf HTML5 + Canvas 2D + vanilla JavaScript.** Harici kütüphane, framework, build aracı yok.
- Prototip aşamasında her şey tek dosyada: `index.html` (HTML, CSS ve JS birlikte). Dosya çift tıklanınca tarayıcıda çalışmalı; sunucu gerekmemeli.
- Aşama 3'te kod şu yapıya bölündü *(onaylandı)*:
  ```
  index.html       sadece canvas + script etiketleri
  src/config.js    tüm ayar sabitleri (CONFIG) ve Türkçe metinler (TEXT)
  src/utils.js     türetilmiş sabitler, küçük yardımcılar, localStorage sarmalayıcı
  src/audio.js     sesler (Web Audio)
  src/render.js    canvas ölçekleme, önbellekler, cepheler, arka plan, arayüz
  src/crane.js     vinç: sarkaç hareketi, bırakma, vinç çizimi
  src/tower.js     katlar, eğim, salınım, yerleşme, yıkılma, deprem
  src/main.js      oyun durumu, akış, giriş, oyun döngüsü
  ```
- **ES module kullanılmaz.** Klasik `<script>` etiketleri, yukarıdaki sırayla yüklenir ve ortak global kapsamı paylaşır; böylece `index.html` çift tıklanınca (`file://`) da çalışır. Yükleme sırası önemlidir.
- Kat yerleşme kuralı (farklı genişlikteki katlar için): yeni katın merkezi alttaki katın üstündeyse (`|offset| <= alttaki kat genişliği / 2`) oturur. Eğim formülündeki `blockWidth` her zaman standart kat genişliğidir.
- **Tüm ayar değerleri tek bir `CONFIG` nesnesinde** dursun (hızlar, açılar, puanlar, renkler). Oyunun dengesini ayarlarken sadece burayı değiştirmek yetmeli.
- Oyun döngüsü `requestAnimationFrame` ile, zaman adımı `deltaTime` tabanlı olsun. Fizik kare hızından bağımsız çalışmalı (60 Hz ve 120 Hz ekranlarda aynı his).
- Canvas cihaz piksel oranına (`devicePixelRatio`) göre ölçeklensin, bulanık görünmesin.
- Kod yorumları ve değişken adları İngilizce, arayüz metinleri Türkçe.

## 3. Ekran ve kontrol

- Dikey (portre) yönlendirme. Oyun alanı mantıksal olarak **9:16**, örneğin 360×640 birim. Ekrana sığacak şekilde ölçeklenir, kenarlarda boşluk kalırsa arka plan rengiyle doldurulur.
- Tek kontrol: **ekrana dokunma / tıklama / boşluk tuşu** = katı bırak.
- Mobilde: sayfa kaymasın, çift dokunuşta zoom olmasın, metin seçilmesin, dokunma gecikmesi olmasın (`touch-action: none`, `user-select: none`, uygun viewport meta etiketi).
- Bir kat düşerken yeni dokunuşlar yok sayılır.

## 4. Çekirdek mekanikler

### 4.1 Vinç ve sarkaç
- Vinç ekranın üst kısmında sabit bir noktadan sarkar. Katı tutan halat bir **sarkaç** gibi sağa sola salınır.
- Salınım açısı: `angle = maxAngle * sin(time * swingSpeed)`.
- Başlangıç değerleri: `maxAngle = 30°`, `swingSpeed = 1.6 rad/s`.
- Kat halatın ucunda, halatla birlikte hafifçe döner (görsel his için).

### 4.2 Bırakma ve düşme
- Dokununca kat halattan kopar, o anki yatay konum ve yatay hızıyla serbest düşer (yerçekimi `g = 1800 birim/s²`).
- Düşerken dönmez; düz iner.

### 4.3 Oturma ve kayma payı
- Kat kulenin en üst katına değdiğinde yerleşir.
- **Kayma payı (offset):** yeni katın merkezinin alttaki katın merkezine göre yatay farkı.
- Kayma payı kat genişliğinin yarısından büyükse kat kuleyi **ıskalamış** sayılır: düşer, kaybolur ve bir **can** gider.
- İlk kat zemindeki temele oturur.

### 4.4 Mükemmel oturtma
- `|offset| <= perfectThreshold` ise (başlangıç: kat genişliğinin %6'sı) "Mükemmel!" sayılır.
- Mükemmel olunca kat tam merkeze hizalanır (offset = 0 olarak kaydedilir).
- Ekranda kısa bir "Mükemmel!" yazısı ve parıltı efekti çıkar.
- Üst üste mükemmeller **combo** sayacını artırır. Normal oturuş combo'yu sıfırlar.
- Her mükemmel, kulenin toplam eğimini **%25 azaltır** (düzeltir).

### 4.5 Eğim (oyunun ana fikri)
- Taşan kısım kesilmez. Her katın offset'i kaydedilir.
- Kulenin eğimi her yerleşmede güncellenir:
  `tilt += offset / blockWidth * tiltFactor`
  Başlangıç: `tiltFactor = 6°`. Yani yarım kat genişliğinde kayan bir kat eğimi yaklaşık 3° artırır.
- Eğim pozitifse kule sağa, negatifse sola yatar.
- Kule, temelin ortasındaki pivot noktası etrafında `tilt` açısıyla döndürülerek çizilir.
- Yeni katlar, eğik kulenin o anki en üst katının **gerçek konumuna** oturmalı. Yani düşme hesabı eğik geometriye göre yapılır.
- **Yıkılma:** `|tilt| > maxTilt` olursa (başlangıç `maxTilt = 15°`) kule yıkılır ve oyun biter.
- Eğim büyüdükçe kule kendi kendine hafifçe salınır (bkz. zorluk). Bu salınım yerleşme hesabına da etki eder.

### 4.6 Canlar
- Oyuncunun **3 canı** var. Iskalanan her kat bir can götürür.
- Can bitince ya da kule yıkılınca oyun biter.

### 4.7 Kamera
- Kule yükseldikçe kamera yumuşakça yukarı kayar; en üst kat ekranın yaklaşık ortasında kalır.
- Vinç her zaman ekranın üst kısmında sabit görünür.
- Kamera kulenin tepesini **yatayda da** takip eder (eğik/basamaklı kulenin tepesi vincin erişiminde kalsın diye). *(Onaylandı, Aşama 1 sonrası.)*
- Ekran yerleşimi asılı katın alt kenarından türetilir: kule tepesi ondan `dropGap` (98), ilk temel `firstDropGap` (134) birim aşağıda. Kat ya da halat boyu değişse de düşüş mesafesi, yani bırakma hissi aynı kalır. *(Onaylandı.)*

## 5. Puanlama

| Olay | Puan |
| --- | --- |
| Normal oturuş | 10 |
| Mükemmel oturuş | 25 + (combo × 10) |
| Iskalama | 0, bir can gider |

- Formüldeki `combo`, bu oturuştan **önceki** art arda mükemmel sayısıdır: 25, 35, 45, … *(Onaylandı.)*

- Ekranda büyük yazıyla **kat sayısı** (kule yüksekliği), küçük yazıyla **puan** gösterilir.
- En yüksek puan `localStorage`'da saklanır. Okuma ve yazma `try/catch` içinde olsun; erişim yoksa oyun yine çalışmalı.

## 6. Zorluk artışı

Zorluk **kat sayısına** göre artar. Değerler `CONFIG` içinde bir tablo olarak tutulsun:

| Kat sayısı | Değişiklik |
| --- | --- |
| 0–9 | Başlangıç değerleri |
| 10+ | Sallanma hızı %15 artar |
| 20+ | Sallanma genliği 30° → 38° |
| 30+ | Kule eğime bağlı olarak kendi kendine salınmaya başlar (genlik ≈ eğim × 0.3) |
| 40+ | Rüzgâr: vincin salınım merkezi bir yöne kayar, ekranda yönünü gösteren küçük bir bayrak çıkar |
| 50+ | Sallanma hızı bir kez daha %15 artar |
| 60+ | Gece teması: arka plan koyulaşır, pencerelerde ışık yanar |

Aşama 3'te eklendi:
- Farklı kat şekilleri (`CONFIG.shapes`): **dar kat** (6. kattan sonra rastgele, %76 genişlik, üstüne gelen katı tutturmak zorlaşır, +5), **balkonlu kat** (3. kattan sonra rastgele, iki yana taşan balkonlar, sadece görsel, +5), **çatı katı** (her 10. kat, kiremitli mansard çatı ve çatı pencereleri, üstü düz teras, +50).
- Deprem (`CONFIG.quake`): 15. kattan sonra her yerleşmede %12 ihtimal, iki deprem arası en az 12 kat. Uyarıdan 0,8 sn sonra 4,5 sn sürer; ekran ve kule sarsılır, eğim dışa doğru itilir (mükemmel bırakmalar düzeltir). Kule yıkılmadan biterse +150.

## 7. Görsel stil

- **Düz renkli, minimal, temiz** çizim. Görsel dosya yok, her şey kodla çiziliyor.
- Kat: dikdörtgen gövde, iki ya da üç pencere sırası, ince koyu kontur. Her kat paletten sırayla bir renk alır.
- Palet (başlangıç önerisi):
  - Arka plan gökyüzü: `#BFE3F5` → `#F7F3E8` dikey geçiş
  - Kat renkleri: `#E07A5F`, `#F2CC8F`, `#81B29A`, `#3D85C6`, `#F4A261`
  - Kontur ve metin: `#2B2D42`
  - Vinç: `#F2B705` (sarı) ve koyu gri
- Kat yüksekliği `CONFIG.block.height` tek değerinden gelir (şu an 62; ilk hâlinden ~%40 yüksek). Cephe düzeni buna oranla ölçeklenir.
- Kat detayları (Aşama 2'de eklendi): çerçeveli pencereler, rastgele perde / yanan ışık, bazı katlarda balkon + korkuluk, balkonda ara sıra saksı ya da asılı çamaşır, katın altında ince kat silmesi. Detaylar kat oluşturulurken bir kez seçilir, her karede değişmez.
- Arka plan: 2–3 katmanlı şehir silueti (uzaktaki daha soluk, parallax ile yavaş kayar), süzülen bulutlar, yüksekte ara sıra kuşlar. Gökyüzü kat sayısına göre gündüz → gün batımı → gece (yıldızlı) geçer.
- Vinç: gergi halatı olmayan düz tepeli (flat-top) kule vinci. Solda kafes kule gövdesi (ekranın altına kadar, kulenin arkasında), çapraz bağlı kafes kol, kol üstünde içinde operatör silüeti olan kabin, arka uçta karşı ağırlık, kol ucunda kırmızı ikaz ışığı (gece yanıp söner), iki makaralı kanca bloğu (kanca sallanırken hafifçe döner), sarı-siyah ikaz şeritleri. Metal parçalarda bir taraf açık, bir taraf koyu. Puan alanının üstünden halat/çizgi geçmez.
- Performans: kat görüntüleri, siluet katmanları, bulutlar, yıldızlar ve vincin sabit kısmı önceden çizilip önbelleğe alınır.
- Zeminde temel ve birkaç sade şehir silueti.
- Mükemmel oturuşta kısa parıltı; ıskalanan kat dönerek aşağı düşer.
- Kule yıkılırken katlar fiziksel olarak dağılarak düşsün (basit, sahte fizik yeterli).
- Yazı tipi: sistem sans-serif, kalın.

## 8. Ses (aşama 2)

- Web Audio API ile kodla üretilen kısa sesler; ses dosyası kullanma.
- Olaylar: katın oturması (tok "tak"), mükemmel (parlak "ding", combo arttıkça perdesi yükselir), ıskalama, kule yıkılması.
- Ekranda ses aç/kapa butonu olsun. Tarayıcılar ilk dokunuştan önce sesi engellediği için ses ilk etkileşimde başlatılsın.
- Mobil: AudioContext yalnızca "kullanıcı etkileşimi" sayılan olaylarda açılabilir/devam ettirilebilir: `pointerup`, `touchend`, `click`, `keydown` (dokunmatikte `pointerdown`/`touchstart` sayılmaz). İlk açılışta sessiz 1 örneklik buffer çalınır. iOS sessiz modu için `navigator.audioSession.type = 'playback'`, yoksa döngüdeki sessiz `<audio>` öğesi kullanılır. Sekme geri gelince context tekrar `resume()` edilir.
- Ses telefonda test edildi ve çalışıyor (AudioContext "running"); geçici durum yazısı kaldırıldı.

## 9. Ekranlar ve akış

Durum makinesi: `MENU → PLAYING → GAME_OVER → (yeniden) PLAYING`

- **Menü:** oyun adı "Apartman Kulesi", en yüksek puan, "Başlamak için dokun" yazısı. Arkada vinç boşta sallanır.
- **Oyun:** üstte kat sayısı ve puan, köşede canlar (küçük kat ikonu ile), combo varsa "x3 Combo" yazısı.
- **Oyun sonu:** kısa yıkılma animasyonu, ardından kat sayısı, puan, en yüksek puan ("Yeni rekor!" etiketi) ve **"Tekrar Oyna"** butonu.
- Sekme arka plana geçince oyun otomatik duraklasın (`visibilitychange`).

## 10. Performans ve kalite

- Orta seviye bir telefonda akıcı **60 FPS**.
- Ekrandan çıkan eski katlar ayrı ayrı çizilmesin ya da önbelleğe alınmış tek bir görüntü olarak çizilsin; 200+ katta yavaşlama olmasın.
- Konsolda hata olmasın.

## 11. Geliştirme aşamaları

Her aşama bitince bana kısa bir özet ver ve bir sonraki aşamaya geçmeden onay bekle.

1. **Aşama 1 — Çekirdek prototip:** vinç ve sarkaç, bırakma, oturma, eğim, yıkılma, ıskalama ve canlar, kamera, puan, oyun sonu ve yeniden başlatma. Düz renkli basit görseller.
2. **Aşama 2 — His ve cila:** mükemmel ve combo efektleri, sesler, yıkılma animasyonu, menü ekranı, en yüksek puan, zorluk tablosunun tamamı.
3. **Aşama 3 — İçerik:** farklı kat şekilleri, deprem olayı, gece teması, dosyaların `src/` yapısına bölünmesi.
4. **Aşama 4 — Mobil paket:** PWA (ana ekrana ekleme, çevrimdışı çalışma), gerekirse Capacitor ile Android paketi.

## 12. Kabul kontrol listesi (Aşama 1)

- [ ] `index.html` çift tıklanınca tarayıcıda açılıp çalışıyor
- [ ] Telefonda dokunarak oynanıyor, sayfa kaymıyor ya da zoom olmuyor
- [ ] Vinç düzgün bir sarkaç gibi sallanıyor
- [ ] Kayık oturan katın taşan kısmı düşmüyor, kulenin eğimi artıyor
- [ ] Mükemmel oturuş eğimi azaltıyor ve combo sayıyor
- [ ] Eğim 15°'yi geçince kule yıkılıyor ve oyun bitiyor
- [ ] Iskalanan kat düşüyor ve bir can gidiyor; 3 iskalamada oyun bitiyor
- [ ] Kamera kule ile birlikte yukarı kayıyor
- [ ] Oyun sonu ekranında skor ve "Tekrar Oyna" var
- [ ] Tüm ayar değerleri `CONFIG` içinde

## 13. Sonraya bırakılan fikirler (şimdilik yapma)

- Katlara sakinlerin taşınması: pencerelerde ışık, balkonda çamaşır, kediler; iyi oturan kule daha "kaliteli" kiracı çeker
- Şehir meta oyunu: her oyundaki bina bir mahalleye eklenir
- İstanbul teması: gecekondudan gökdelene, "kaçak kat" mizahı
- Günlük meydan okuma: herkes aynı rüzgâr düzeniyle oynar, günlük liderlik tablosu
- Oyun sonunda paylaşılabilir kısa yıkılma tekrarı (TikTok / Reels için)
