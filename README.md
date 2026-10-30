# Profilovka s rámečkem ČT (mockup)

Webová komponenta, ve které si fanoušci České televize přidají rámeček ČT na profilovou fotku pro Facebook. Funkčně vychází z [verejnopravne.cz/profilovka_verejnost.html](https://www.verejnopravne.cz/profilovka_verejnost.html), vizuálně z Manuálu značky ČT a webu ceskatelevize.cz.

Je to **vanilla JS + CSS + PNG rámečky bez závislostí a bez buildu**, připravené k vložení přímo do Wagtail (Django) šablony. Vite slouží jen jako lokální vývojový server.

**Pro vývojáře ČT:** předávací dokument s postupem nasazení do Wagtailu je v [`PREDANI.md`](PREDANI.md), technické detaily v [`docs/wagtail-integrace.md`](docs/wagtail-integrace.md).

## Funkce

- nahrání fotky tlačítkem nebo přetažením (na mobilu galerie i fotoaparát)
- posun fotky myší, prstem nebo šipkami; přiblížení posuvníkem (100–400 %)
- výběr rámečku s náhledy; rámečky jsou v jednom seznamu v `profilovka.config.js`
- kulatý náhled jako na Facebooku (do staženého souboru se nepromítne)
- stažení čtvercového PNG 1080×1080 se stejnou logikou jako reference:
  - **iOS**: nativní sdílecí list (Web Share API) → „Uložit obrázek“ do Fotek; bez podpory overlay s podržením prstu
  - **in-app prohlížeče** (Facebook, Instagram, Messenger, TikTok…): overlay „Podržte prst na obrázku…“
  - **desktop a Android**: běžné stažení; na mobilu navíc odkaz „Stahování nezačalo?“ s overlayem
- počítadlo stažení: `POST {frame: id}` na konfigurovatelnou URL (v mockupu falešný endpoint ve Vite) + DOM událost `profilovka:download` pro analytiku
- chybové stavy: soubor není obrázek, soubor větší než 30 MB, HEIC v prohlížeči, který ho neumí, nepodařené načtení rámečku
- velké fotky se při načtení zmenší na max. 2048 px (plynulý posun, limity paměti iOS)
- fotka neopouští zařízení, vše probíhá v `<canvas>`

## Spuštění

Potřebujete Node.js 18+.

```bash
npm install
npm run dev
```

Otevřete <http://localhost:4317>. Vývojový server:

- vloží šablonu `templates/profilovka/profilovka.html` do `index.html` (jednoduchá náhrada `{% static %}`, `{% url %}`, `{{ csrf_token }}`), takže vidíte přesně ten markup, který půjde do Wagtailu;
- obsluhuje falešné počítadlo `POST /api/profilovka/stazeni/` (počítá v paměti a vypisuje do terminálu).

## Struktura

```
static/profilovka/            → do Django static (beze změn)
  js/profilovka.js            logika editoru
  js/profilovka.config.js     seznam rámečků, velikost výstupu, limity
  css/profilovka.css          styly (vše pod .ctp)
  frames/*.png                finální rámečky od marketingu (RGBA, 889×889)
templates/profilovka/
  profilovka.html             markup komponenty jako Django šablona
docs/wagtail-integrace.md     integrace do Wagtailu: typ stránky, StreamField blok,
                              model + view počítadla, admin, CSRF, collectstatic
index.html, dev/, vite.config.js   jen vývojová stránka (samotná komponenta)
```

## Přidání rámečku

1. Uložte PNG s alfa kanálem do `static/profilovka/frames/` (čtverec, ideálně aspoň 1080×1080 px, průhledné pozadí, obsah uvnitř vepsaného kruhu). SVG je také podporováno.
2. Přidejte řádek do `frames` v `static/profilovka/js/profilovka.config.js`:
   ```js
   { id: 'muj-ramecek', label: 'Můj rámeček', file: 'muj-ramecek.png' },
   ```
3. Na produkci přidejte `id` do whitelistu počítadla (viz integrační návod).

## Nasazení na GitHub Pages

Mockup lze zveřejnit jako statický náhled. Workflow `.github/workflows/pages.yml` při každém pushi do `main` spustí `npm run build` a nasadí obsah `dist/` přes GitHub Pages.

1. Pushněte repozitář na GitHub (větev `main`).
2. V **Settings → Pages** nastavte **Source: GitHub Actions**.
3. Po doběhnutí workflow je náhled na `https://<uživatel>.github.io/<repo>/`.

Build používá relativní cesty (`base: './'`), takže funguje v libovolné podsložce. Pokud je potřeba absolutní základ, nastavte `BASE_PATH=/ct-profilovka/ npm run build`. Statická verze nemá backend: počítadlo stažení se v ní neodesílá (prázdné `data-count-url`), stažení funguje normálně.

Lokální ověření buildu:

```bash
npm run build
npm run preview   # http://localhost:4318
```

## Vizuální styl a jeho omezení

Podle veřejného [Manuálu značky České televize v1.2](https://www.ceskatelevize.cz/vse-o-ct/zakony-a-pravidla/smluvni-podminky-ct/) a design systému webu ceskatelevize.cz:

- **barvy**: ČT modrá `#041E42` (Pantone 282 C) jako primární, ČT červená `#ED1C24` (Pantone 185 C) jako akcent; neutrální šedé z webu ČT (`#F2F4F8`, `#DEE0E4`, `#6B6F77`, `#202632`); bílé pozadí, malé zaoblení (4–8 px)
- **písmo**: ČT používá licencované písmo **TV Sans Screen** (Marek Pistora, Studio Najbrt). Mockup ho nenačítá ani nelinkuje. CSS ho uvádí první ve `font-family`, takže na webu ČT, který ho už načítá, se použije samo. Jinak záloha **Source Sans Pro / Source Sans 3** (písmo textů na ceskatelevize.cz, licence OFL), pokud je v systému, a dále systémové bezpatkové písmo.

Rámečky jsou **finální grafika od marketingu** (5× PNG 889×889 s alfa kanálem). Výstup má 1080×1080, takže se rámečky při exportu mírně zvětšují. Pro ostřejší výsledek je lepší zdroj v rozlišení aspoň 1080 px.

## Co mockup záměrně nemá

Pinch-zoom a zoom kolečkem (stejně jako reference), konverzi HEIC (jen srozumitelná chyba), personalizovaný text v rámečku, správu rámečků z adminu, analytiku třetích stran.

## Otestováno

Chrome (headless) na desktopu 1366×900 a 1440×1000 a v mobilní emulaci Pixel 7. Prošlo nahrání, posun, zoom, výběr rámečku, export PNG 1080×1080, POST na počítadlo, chybové stavy (ne-obrázek, 31 MB, HEIC) a overlay pro in-app prohlížeč a iOS bez Web Share. Na reálných zařízeních (iPhone Safari, Facebook in-app) testováno nebylo.
