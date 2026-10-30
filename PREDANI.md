# Předání vývojářům ČT: Profilovka s rámečkem ČT

Stručný předávací dokument pro FE/BE vývojáře, kteří komponentu nasadí do webu ČT na Wagtailu. Kód a ukázky Pythonu jsou v [`docs/wagtail-integrace.md`](docs/wagtail-integrace.md), zde se neopakují.

## 1. Co to je a rozsah

- Komponenta, ve které si návštěvník nahraje fotku, vybere rámeček ČT a stáhne hotovou profilovku pro Facebook (čtvercové PNG 1080×1080, kruh si ořízne Facebook).
- Základní funkce stejné jako reference [verejnopravne.cz](https://www.verejnopravne.cz/profilovka_verejnost.html): nahrání a přetažení fotky, posun (myš, prst, šipky), zoom posuvníkem, výběr rámečku s náhledy, kulatý náhled, stažení s ošetřením iOS a in-app prohlížečů.
- **Vše běží v prohlížeči** (HTML5 canvas). Fotka ani žádné osobní údaje neopouštějí zařízení. Na server jde jen anonymní `POST {frame: "<id>"}` při stažení (počítadlo).
- Vanilla JS + CSS + PNG, **žádné runtime závislosti, žádný build**. Vkládá se přímo do šablony, ne přes iframe.
- Mimo rozsah: pinch-zoom, konverze HEIC (jen chybová hláška), personalizovaný text, správa rámečků z adminu, analytika třetích stran.

## 2. Kde je zdroj

| | |
|---|---|
| Hlavní repozitář | Origin `petr-van-k/ct-profilovka` |
| Větev | `cursor/ct-profilovka-mockup-1808` (PR #1 do `main`) |
| Commit | aktuální hlava větve (tento dokument přibyl po commitu `68bc61f`, finální rámečky) |
| GitHub zrcadlo | `github.com/sazenibot/ct-profilovka` (náhled přes GitHub Pages, pokud je zrcadlo naplněné a Pages zapnuté) |

## 3. Mapa souborů

| Soubor | Do Django? | Účel |
|---|---|---|
| `static/profilovka/js/profilovka.js` | ano → `profilovka/static/profilovka/js/` | logika editoru |
| `static/profilovka/js/profilovka.config.js` | ano → totéž | seznam rámečků, velikost výstupu, limity |
| `static/profilovka/css/profilovka.css` | ano → `profilovka/static/profilovka/css/` | styly, vše pod `.ctp` |
| `static/profilovka/frames/*.png` | ano → `profilovka/static/profilovka/frames/` | 5 finálních rámečků |
| `templates/profilovka/profilovka.html` | ano → `profilovka/templates/profilovka/` | markup komponenty (Django šablona) |
| `docs/wagtail-integrace.md` | ne (dokumentace) | model, view, admin, CSRF, statika |
| `index.html`, `dev/`, `vite.config.js`, `package*.json` | **ne** | jen lokální vývojový server a build pro náhled |
| `.github/workflows/pages.yml` | **ne** | nasazení náhledu na GitHub Pages |

## 4. Postup integrace (checklist)

Detaily a kód: [`docs/wagtail-integrace.md`](docs/wagtail-integrace.md), kapitoly v závorce.

- [ ] Založit aplikaci `profilovka` a přidat ji do `INSTALLED_APPS` (kap. 1).
- [ ] Zkopírovat `static/profilovka/` a `templates/profilovka/` do aplikace (kap. 1).
- [ ] Zvolit vložení: **typ stránky** `ProfilovkaPage` (kap. 2), nebo **StreamField blok** `ProfilovkaBlock` (kap. 3). U bloku renderovat přes `{% include_block %}`. Komponenta smí být na stránce jen jednou.
- [ ] Případně přesunout `<link>`/`<script>` ze šablony do CSS/JS bloků base šablony.
- [ ] Počítadlo: model `FrameDownloadCounter` → `makemigrations` + `migrate` (kap. 4).
- [ ] View `profilovka_stazeni` + URL `api/profilovka/stazeni/` s názvem `profilovka_stazeni`, před `wagtail_urls` (kap. 4).
- [ ] `settings.PROFILOVKA_FRAME_IDS` = id z `profilovka.config.js` (kap. 4).
- [ ] Admin: `SnippetViewSet` ve `wagtail_hooks.py`, marketingu jen oprávnění *view* (kap. 4).
- [ ] Rozhodnout CSRF vs. cache stránky (kap. 5, níže v bodě 7).
- [ ] `collectstatic`, ověřit CORS/CSP pro statiku (kap. 6).
- [ ] Projít testovací matici (bod 8).

## 5. Rámečky: přidání a výměna

- Formát: **PNG s alfa kanálem (RGBA)**, čtverec, průhledné tam, kde má být vidět fotka. SVG je podporováno také (texty v křivkách, `width`/`height` + `viewBox` 1080).
- Velikost: **alespoň 1080×1080 px** (výstup má 1080 px). Menší rámeček se při exportu zvětší a změkne.
- Bezpečná zóna: texty a logo uvnitř **vepsaného kruhu** (střed 50 %/50 %, poloměr 50 % strany). Facebook zobrazuje profilovku kruhově a rohy ořízne.
- Postup: soubor do `static/profilovka/frames/` → řádek `{ id, label, file }` do `frames` v `profilovka.config.js` → `id` do `PROFILOVKA_FRAME_IDS` → `collectstatic`.
- `id`: jen `a–z`, `0–9`, `-`, max. 64 znaků, neměnit po spuštění (jsou na něj navázané počty). Při změně grafiky soubor přejmenovat kvůli cache (např. `-v2.png`).
- Aktuální id: `ceska-je-srdce-modra`, `ceska-je-moje-cervena`, `ceska-je-moje-modra`, `ceska-je-srdce-bila`, `ceska-je-srdce-logo-modra`.

## 6. Konfigurace

Atributy na `<section data-profilovka>` v šabloně:

| Atribut | Význam |
|---|---|
| `data-frames-base` | URL složky rámečků, `{% static 'profilovka/frames/' %}` |
| `data-count-url` | URL počítadla. Prázdné = nic se neposílá (komponenta funguje i bez backendu). |
| `data-csrf-token` | token pro hlavičku `X-CSRFToken`. Bez něj se použije cookie `csrftoken`. |

`profilovka.config.js` (`window.PROFILOVKA_CONFIG`): `outputSize` (1080), `fileName`, `maxFileSizeMB` (30), `maxWorkingPx` (2048, zmenšení velkých fotek), `frames`.

Analytika: při každém stažení se na komponentě vyvolá DOM událost `profilovka:download` (`bubbles: true`, `event.detail.frame`). Lze na ni navázat GA4/Gemius bez zásahu do `profilovka.js`:

```js
document.addEventListener('profilovka:download', (e) => {
  // např. dataLayer.push({ event: 'profilovka_download', frame: e.detail.frame });
});
```

## 7. Bezpečnost a infrastruktura

- **CSRF vs. cache:** `{{ csrf_token }}` v cachované stránce (CDN, frontend cache) vede k 403. Doporučení: view označit `@csrf_exempt`, kontrolovat `Origin` (domény ČT), držet whitelist id a odstranit `data-csrf-token` ze šablony. Alternativy jsou v kap. 5 integračního návodu.
- **Rate limit** na endpoint počítadla (proxy/CDN nebo `django-ratelimit`). Počty berte jako orientační.
- **CORS:** pokud statika běží na jiné doméně (CDN/S3), musí rámečky vracet `Access-Control-Allow-Origin`. Načítají se s `crossOrigin="anonymous"`, jinak by nešel exportovat canvas.
- **CSP:** `img-src` doména statiky + `data:` + `blob:`; `connect-src 'self'` pro počítadlo. Komponenta nemá inline skripty.
- Žádné cookies ani úložiště v prohlížeči, žádné osobní údaje na serveru.

## 8. Testovací matice

| Zařízení / prohlížeč | Co ověřit |
|---|---|
| iPhone, Safari | nahrání z Fotek i fotoaparátu, HEIC, posun prstem, **sdílecí list → „Uložit obrázek“** uloží do Fotek |
| iPhone, Chrome | totéž (také používá Web Share) |
| Android, Chrome | běžné stažení do Stažených souborů, odkaz „Stahování nezačalo?“ otevře overlay |
| **In-app prohlížeč Facebooku / Instagramu / Messengeru** (iOS i Android) | po kliknutí na stažení se ukáže overlay, uložení **podržením prstu** na obrázku |
| Desktop Chrome, Firefox, Safari, Edge | drag & drop, posun myší, šipky, stažení PNG 1080×1080 |
| HEIC na desktop Chrome/Firefox | srozumitelná chybová hláška |
| Soubor > 30 MB, ne-obrázek | chybová hláška, editor zůstane použitelný |
| Počítadlo | POST projde (200), počet v adminu roste; při chybě se stažení nezablokuje |
| Cachovaná produkční stránka | POST nepadá na CSRF 403 |

Mockup byl ověřen jen v headless Chrome (desktop + mobilní emulace). Reálná zařízení zatím testována nebyla.

## 9. Známá omezení a otevřené body

- **Rámečky mají 889×889 px.** Při exportu do 1080 px se zvětšují. Pro ostřejší výsledek si od marketingu vyžádat export **≥ 1080 px** (ideálně 2160 px).
- Rámeček `ceska-je-srdce-bila` má ve spodní části **neprůhledný bílý přechod** (alfa až 255). Pokud měl být jen tmavý text na průhledném pozadí, je potřeba nový export.
- **Písmo TV Sans Screen** je licencované písmo ČT. Komponenta ho nenačítá, jen ho uvádí první ve `font-family`. Na webu ČT, který ho už načítá, se použije samo, jinak záloha Source Sans Pro / systémové písmo.
- **Logo ČT:** v rámečcích je grafika od marketingu. Pokud by se logo přidávalo do UI, použít oficiální soubory z Manuálu značky (`CT-V1-lg*`), ne překreslení.
- **Ukázky Wagtail kódu** (model, view, `SnippetViewSet`, bloky) **nebyly spuštěny** proti reálnému projektu ČT. Je potřeba je přizpůsobit verzi Wagtailu a struktuře projektu (zejména view-only oprávnění snippetů).
- Pinch-zoom a konverze HEIC nejsou implementované.

## 10. Lokální spuštění mockupu

Node.js 18+:

```bash
npm install
npm run dev        # http://localhost:4317, šablona + falešné počítadlo
npm run build      # statický build do dist/ (bez počítadla)
npm run preview    # http://localhost:4318
```

Dev server vkládá Django šablonu `templates/profilovka/profilovka.html` do `index.html`, takže vidíte přesně markup, který půjde do Wagtailu.
