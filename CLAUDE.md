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
  src/city.js      mahalle (Aşama 6): kayıt, kentsel dönüşüm, unvanlar, kozmetikler, mahalle ekranı
  src/share.js     paylaşım (Aşama 7): paylaşım görseli, Web Share / indirme, durum kaydı, yıkılma videosu
  src/main.js      oyun durumu, akış, giriş, oyun döngüsü
  manifest.webmanifest   PWA manifesti (Aşama 4)
  sw.js                  service worker, çevrimdışı önbellek (Aşama 4)
  icons/                 uygulama ikonları (PNG, kodla üretildi)
  ```
- **ES module kullanılmaz.** Klasik `<script>` etiketleri, yukarıdaki sırayla yüklenir ve ortak global kapsamı paylaşır; böylece `index.html` çift tıklanınca (`file://`) da çalışır. Yükleme sırası önemlidir.
- Kat yerleşme kuralı (farklı genişlikteki katlar için): yeni katın merkezi alttaki katın üstündeyse (`|offset| <= alttaki kat genişliği / 2`) oturur. Eğim formülündeki `blockWidth` her zaman standart kat genişliğidir.
- **Tüm ayar değerleri tek bir `CONFIG` nesnesinde** dursun (hızlar, açılar, puanlar, renkler). Oyunun dengesini ayarlarken sadece burayı değiştirmek yetmeli.
- Oyun döngüsü `requestAnimationFrame` ile, zaman adımı `deltaTime` tabanlı olsun. Fizik kare hızından bağımsız çalışmalı (60 Hz ve 120 Hz ekranlarda aynı his).
- Canvas cihaz piksel oranına (`devicePixelRatio`) göre ölçeklensin, bulanık görünmesin.
- Kod yorumları ve değişken adları İngilizce, arayüz metinleri Türkçe.
- **Commit mesajlarına `Co-Authored-By` satırı ekleme** (PR açıklamalarına da imza/atıf satırı ekleme). Proje ayarı `.claude/settings.json` içinde `attribution` boş bırakılarak kapatıldı.

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

Aşama 5'te eklendi:
- **Kiracılar** (`CONFIG.tenants`): kat yerleşince kiracı taşınır. Oturuşa göre: çok kayık (offset > kat genişliğinin %30'u) → öğrenci, diğer normal → aile, mükemmel → emekli teyze, mükemmel + combo ≥ 2 → seçkin kiracı. Perde, pencere süsü (kedi, bayrak, çiçek kutusu, lamba), balkon eşyası (çamaşır, sardunya, biber dizisi, kedi, pankart, büyük bitki) ve gece ışığı kiracıya göre seçilir. Kiracı **sadece kira puanı** verir (0 / 2 / 5 / 10), eğime etkisi yoktur. Vinçteki ve ıskalanan katlar boştur. Oyun başına kiracı sayıları `game.tenantCounts`'ta tutulur (Aşama 6 için).
- **Kaçak kat** (`CONFIG.shapes.kacak`): 8. kattan sonra %8 ihtimal; sıvasız briket, filiz demiri, "SATILIK" tabelası, vinçte kırmızı "KAÇAK" etiketi. Eğim etkisi ×1,5, +40 puan. Depremle hiçbir bağlantısı yoktur; oyun sonu başlığı her zaman "Kule Yıkıldı!".
- **Tapu** (`CONFIG.tapu`): her 25. katta kuledeki kaçak katlar sıvanıp boyanır, her biri +30 puan, "Tapu çıktı!" yazısı. Kulede kaçak kat yoksa yazı çıkmaz.

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
- Arka plan: 3 katmanlı **İstanbul silueti** (Aşama 5; esinlenme, birebir kopya değil): uzakta boğaz suyu, karşı kıyı tepeleri ve asma köprü; ortada kaskad kubbeli camiler, ince minareler, konik külahlı yuvarlak kule; önde bacalı, antenli, çanaklı sık apartmanlar. Parallax ile yavaş kayar. Süzülen bulutlar, yüksekte ara sıra martılar.
- Kat dönemleri (`CONFIG.eras`, Aşama 5): 1–9. kat **gecekondu** (yamalı sıva, soluk renkler, ahşap pencereler, sac saçak, soba borusu, çanak anten, sac çatı; en üst gecekondu katında filiz demiri), 10–29 **apartman** (klasik cephe, klima, çanak anten), 30+ **gökdelen** (cam giydirme cephe, cam korkuluk, çatı katı yerine teknik kat + ikaz ışıkları). Sınırlarda 2'şer katlık karışık geçiş bandı. Gökyüzü kat sayısına göre gündüz → gün batımı → gece (yıldızlı) geçer.
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

## 8c. Mahalle (Aşama 6)

- Oyun bittiği anda (kule yıkılmadan önce) **en az 5 katlık** kule mahalleye bina olarak kaydedilir. Kayıt `localStorage`'da (`CONFIG.storage.city`, JSON, sürüm numaralı): kat başına bir harf (kiracı: s/f/t/e, kaçak kalmışsa büyük harf), puan, tarih, bitiş sebebi, görünüm tohumu. Bozuk ya da erişilemeyen veri boş mahalle sayılır.
- **Kentsel dönüşüm:** 40 bina aşılınca **en kısa** bina yıkılır (eşitlikte en eski). **Rekor binası (en yüksek puan) ve en yüksek 3 bina asla yıkılmaz.** Yeni bina en kısaysa kendisi yıkılır.
- **Unvanlar** toplam inşa edilen kata göre (yıkılanlar da sayılır): Gecekondu mahallesi (0) → Mahalle (60) → Semt (150) → İlçe (300) → Şehir (550) → Metropol (1000). Her unvan bir kozmetik ve bir mahalle simgesi açar (çay bahçesi, park, metro, cami, saat kulesi).
- **Kozmetikler** (`CONFIG.cosmetics`): vinç rengi (Sarı, Kırmızı, Turkuaz, Mor) ve apartman kat paleti (Klasik, Pastel, Boğaz). Mahalle ekranındaki "Görünüm" butonundan seçilir, seçim `CONFIG.storage.look`'ta saklanır. İkaz şeritleri her zaman sarıdır (`colors.hazard`). **Oyun mekaniğine hiçbir etkisi yoktur.**
- Mahalle ekranı: sağa sola kaydırılan sokak, binaya dokununca bilgi kartı (kat, puan, tarih, kiracılar, Rekor / Korunuyor etiketi), yeni bina yükselme animasyonu ve "Kentsel dönüşüm!" / "Yeni unvan" bildirimleri. Menüde "Mahallem", oyun sonunda "Mahalleye bak" butonu.

## 8d. Paylaşım (Aşama 7)

- **Görsel:** oyun sonunda (en az 1 kat) 1080×1920 (9:16) PNG: oyunun adı, bitiş sebebi, kulenin zirvedeki hali (`endGame` anındaki anlık görüntü, kule henüz ayakta), kat sayısı, puan, "Yeni rekor!" etiketi, kiracı özeti ve adres `cagriakdeniz34.github.io/apartman-kulesi`. 18 kata kadar kulenin tamamı, daha yüksekte üstteki 12 kat yakın plan + yanda "tam boy" silueti. Görsel panel açılınca önceden üretilir.
- **Paylaşım:** "Paylaş" butonu Web Share API ile telefonun paylaşım menüsünü açar; `navigator.canShare({files})` desteklemiyorsa ya da paylaşım hata verirse dosya indirilir ("Görsel indirildi"). Kullanıcı iptal ederse bir şey olmaz.
- **Kullanıcı etkileşimi kuralı:** `navigator.share()` yalnızca dokunuş bırakılınca çalışır. Paylaşım butonları ve video ekranı `touchend` (dokunmatik) / `pointerup` (fare) ile tepki verir, `pointerdown` ile değil.
- **Video sadece kule yıkılınca** sunulur (canlar bitince yalnızca görsel). Oyun sırasında piksel kaydedilmez: `Replay` son ~2,5 sn'nin durumunu (kamera, açılar, hareketli katlar, parçacıklar, ses olayları) saniyede 30 örnekle tutar; yıkılmadan sonra 3 sn daha, ağır çekim kısmı için 60 örnekle. "Video"ya basınca bu kayıt ekran dışı 720×1280 canvas'ta normal çizim fonksiyonlarıyla yeniden oynatılır ve `MediaRecorder` ile kaydedilir (~8,5 sn: yıkılmadan 2,2 sn önce, 0,5× ağır çekim devrilme, "Kule Yıkıldı!" yazısı, sonda 1,8 sn paylaşım görseli; altta adres şeridi). Kayıt sırasında önizleme, ilerleme çubuğu ve "İptal" görünür.
- **Ses:** oyun sesleri `MediaStreamDestination` ile videoya eklenir; ses kapalıysa video sessizdir.
- **Destek:** video butonu yalnızca `MediaRecorder`, `canvas.captureStream` ve desteklenen bir format (önce MP4/H.264, yoksa WebM) varsa görünür. Kayıt bozuk/boş çıkarsa (`minBytes`, süre < 1 sn) `CONFIG.storage.videoFail` yazılır ve o cihazda video butonu bir daha gösterilmez. Kaydın başında kodlayıcı ısınana kadar atılan bir ön kayıt yapılır (ilk kayıtta kare kaybını önler).
- Ayarlar `CONFIG.share`, metinler `TEXT` içinde. Kayıt sırasında `ctx`/`view`/önbellekler geçici olarak kayıt canvas'ına yönlendirilir ve her karede geri alınır; pencere boyutu değişirse kayıt bitince uygulanır.

## 8b. PWA (Aşama 4)

- `manifest.webmanifest`: ad "Apartman Kulesi", `display: standalone` (çentik/kamera deliği arayüzü örtmesin diye tam ekran değil), dikey yön, göreli yollar (`./`). Böylece site bir alt klasörde (ör. GitHub Pages) de çalışır.
- `sw.js`: kurulumda tüm oyun dosyalarını önbelleğe alır, sonra önce önbellekten sunar (cache-first). İlk ziyaretten sonra çevrimdışı çalışır.
- **Dosyalardan biri değiştiğinde `sw.js` içindeki `CACHE_VERSION` artırılmalı** (`v1` → `v2` …). Yoksa kurulu oyuncular eski sürümü görmeye devam eder. Yeni dosya eklenirse `ASSETS` listesine de yazılmalı.
- Service worker yalnızca `http(s)` üzerinde kaydedilir; `file://` ile açınca oyun yine çalışır, sadece çevrimdışı önbellek olmaz. Çevrimdışı mod HTTPS ister (yerel ağdaki `http://192.168…` adresinde etkin olmaz, `localhost`'ta olur).
- iOS: manifest ikonu yerine `apple-touch-icon` kullanılır; ana ekrana ekleme Safari → Paylaş → "Ana Ekrana Ekle" ile yapılır.

## 9. Ekranlar ve akış

Durum makinesi: `MENU → PLAYING → GAME_OVER → (yeniden) PLAYING`; ayrıca `MENU ⇄ CITY` ve `GAME_OVER → CITY → MENU` (Aşama 6).

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
4. **Aşama 4 — Mobil paket:** PWA (ana ekrana ekleme, çevrimdışı çalışma), gerekirse Capacitor ile Android paketi. *(PWA kısmı yapıldı, bkz. 8b; Capacitor henüz yapılmadı.)*

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

## 13. Sonraki aşamalar (5–8)

Eski "sonraya bırakılan fikirler" listesi bu sırayla aşamalara dönüştürüldü. Her aşamada önce plan sunulur, onaydan sonra kodlanır.

5. **Aşama 5 — Sakinler + İstanbul teması** *(yapıldı, bkz. 6 ve 7)*: katlara kiracılar taşınır; iyi oturan kat daha "kaliteli" kiracı çeker (pencerelerde ışık, balkonda çamaşır, kedi, çiçek kiracı tipine göre değişir). Arka plan İstanbul silueti (kubbeler, minareler, Galata benzeri kule, boğaz ve köprü; esinlenme, birebir kopya değil). Alt katlar gecekondu, yükseldikçe apartman, en üstte modern gökdelen. "Kaçak kat" mizahı.
6. **Aşama 6 — Şehir meta oyunu** *(yapıldı, bkz. 8c)*: her oyundaki bina bir mahalleye eklenir.
7. **Aşama 7 — Paylaşılabilir yıkılma görüntüsü** *(yapıldı, bkz. 8d)*: oyun sonu paylaşım görseli ve kısa yıkılma videosu (TikTok / Reels için).
8. **Aşama 8 — Günlük meydan okuma:** herkes aynı rüzgâr düzeniyle oynar, günlük liderlik tablosu.
