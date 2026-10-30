# Integrace profilovky do Wagtailu

Návod pro FE/BE vývojáře webu ČT. Komponenta je čisté HTML + CSS + vanilla JS bez závislostí a bez buildu. Vkládá se přímo do šablony stránky (ne přes iframe), takže odpadají problémy s `sandbox`, `allow="web-share"` a výškou iframe.

Ukázky kódu níže jsou návrh pro Django 4.2+/5.x a Wagtail 6.x. Proti reálnému projektu ČT nebyly spuštěné, je potřeba je přizpůsobit (názvy aplikace, base šablona, oprávnění).

## 1. Co se přenáší

| Soubor v tomto repu | Kam v Django projektu | Poznámka |
|---|---|---|
| `static/profilovka/js/profilovka.js` | `profilovka/static/profilovka/js/` | logika editoru, beze změn |
| `static/profilovka/js/profilovka.config.js` | `profilovka/static/profilovka/js/` | seznam rámečků a nastavení výstupu |
| `static/profilovka/css/profilovka.css` | `profilovka/static/profilovka/css/` | styly, vše pod třídou `.ctp` |
| `static/profilovka/frames/*.png` | `profilovka/static/profilovka/frames/` | rámečky (PNG s alfa kanálem; SVG je také podporováno) |
| `templates/profilovka/profilovka.html` | `profilovka/templates/profilovka/` | markup komponenty (Django šablona) |
| `index.html`, `dev/`, `vite.config.js` | nepřenáší se | jen vývojový server a testovací stránka |

Předpokládáme novou Django aplikaci `profilovka` (`python manage.py startapp profilovka`) přidanou do `INSTALLED_APPS`.

Šablona `profilovka.html` obsahuje `<link>` na CSS a dva `<script defer>`. Pokud base šablona ČT má bloky pro CSS/JS (např. `{% block extra_css %}`), můžete je tam přesunout. Na stránce smí být komponenta **jen jednou** (používá pevná `id`).

## 2. Varianta A: samostatný typ stránky

Vhodné pro kampaňovou stránku typu `ceskatelevize.cz/profilovka/`.

```python
# profilovka/models.py
from wagtail.admin.panels import FieldPanel
from wagtail.fields import RichTextField
from wagtail.models import Page


class ProfilovkaPage(Page):
    intro = RichTextField(blank=True, verbose_name="Úvodní text")

    content_panels = Page.content_panels + [FieldPanel("intro")]

    template = "profilovka/profilovka_page.html"
    max_count = 1
    subpage_types = []

    class Meta:
        verbose_name = "Stránka s profilovkou"
```

```django
{# profilovka/templates/profilovka/profilovka_page.html #}
{% extends "base.html" %}
{% load wagtailcore_tags %}

{% block content %}
  {% if page.intro %}<div class="rich-text">{{ page.intro|richtext }}</div>{% endif %}
  {% include "profilovka/profilovka.html" %}
{% endblock %}
```

## 3. Varianta B: StreamField blok

Vhodné, když se má profilovka vložit do existující stránky (článek, stránka pořadu).

```python
# profilovka/blocks.py
from wagtail import blocks


class ProfilovkaBlock(blocks.StaticBlock):
    class Meta:
        template = "profilovka/blocks/profilovka_block.html"
        icon = "image"
        label = "Profilovka s rámečkem ČT"
        admin_text = "Vloží editor profilové fotky. Na stránce použijte jen jednou."
```

```django
{# profilovka/templates/profilovka/blocks/profilovka_block.html #}
{% include "profilovka/profilovka.html" %}
```

```python
# v modelu stránky, kde má být blok k dispozici
body = StreamField([
    # … stávající bloky …
    ("profilovka", ProfilovkaBlock()),
])
```

V šabloně stránky renderujte StreamField přes `{% include_block page.body %}` (ne `{{ page.body }}`), aby se do bloku předal kontext požadavku (`csrf_token`, `request`).

Pokud by redakce chtěla v bloku vybírat podmnožinu rámečků, změňte `StaticBlock` na `StructBlock` s `MultipleChoiceBlock` a seznam rámečků vykreslete do stránky přes `json_script` (viz kap. 7).

## 4. Počítadlo stažení

JS při kliknutí na „Stáhnout profilovku“ pošle na adresu z atributu `data-count-url`:

```
POST /api/profilovka/stazeni/
Content-Type: application/json
X-CSRFToken: <token>

{"frame": "ceska-je-srdce-modra"}
```

Požadavek je „fire-and-forget“ (`fetch` s `keepalive`). Jeho selhání nikdy nezablokuje stažení. Kromě toho komponenta vyvolá DOM událost `profilovka:download` (`event.detail.frame`), na kterou lze napojit analytiku webu (GA4, Gemius…) bez zásahu do `profilovka.js`.

Když `data-count-url` chybí nebo je prázdné, nic se neposílá. Šablona používá `{% url "profilovka_stazeni" as count_url %}`, takže bez nakonfigurované URL nespadne, jen nepočítá.

### Model

```python
# profilovka/models.py
from django.db import models


class FrameDownloadCounter(models.Model):
    frame_id = models.SlugField("ID rámečku", max_length=64, unique=True)
    count = models.PositiveBigIntegerField("Počet stažení", default=0)
    updated_at = models.DateTimeField("Naposledy staženo", auto_now=True)

    class Meta:
        verbose_name = "Stažení rámečku"
        verbose_name_plural = "Stažení rámečků"
        ordering = ["-count"]

    def __str__(self):
        return f"{self.frame_id}: {self.count}"
```

Pokud bude potřeba vývoj v čase (graf po dnech), přidejte model `FrameDownloadDaily(frame_id, date, count)` s `unique_together = ("frame_id", "date")` a inkrementujte oba.

### View

```python
# profilovka/views.py
import json

from django.conf import settings
from django.db.models import F
from django.http import HttpResponseBadRequest, JsonResponse
from django.views.decorators.http import require_POST

from .models import FrameDownloadCounter


@require_POST
def profilovka_stazeni(request):
    try:
        frame_id = str(json.loads(request.body or b"{}").get("frame", ""))
    except (ValueError, AttributeError):
        return HttpResponseBadRequest()

    if frame_id not in settings.PROFILOVKA_FRAME_IDS:
        return JsonResponse({"ok": False}, status=400)

    counter, _ = FrameDownloadCounter.objects.get_or_create(frame_id=frame_id)
    FrameDownloadCounter.objects.filter(pk=counter.pk).update(count=F("count") + 1)
    return JsonResponse({"ok": True})
```

```python
# settings.py – musí odpovídat id v profilovka.config.js
PROFILOVKA_FRAME_IDS = {"ceska-je-srdce-modra", "ceska-je-moje-cervena", "ceska-je-moje-modra", "ceska-je-srdce-bila", "ceska-je-srdce-logo-modra"}
```

```python
# urls.py (projekt) – před wagtail_urls
from profilovka.views import profilovka_stazeni

urlpatterns = [
    path("api/profilovka/stazeni/", profilovka_stazeni, name="profilovka_stazeni"),
    # …
    path("", include(wagtail_urls)),
]
```

`F("count") + 1` je atomický `UPDATE`, takže souběžná stažení se neztratí. Whitelist `PROFILOVKA_FRAME_IDS` brání tomu, aby kdokoli zakládal libovolné řádky. Endpoint je veřejný, proto doporučujeme rate limit na úrovni proxy/CDN (případně `django-ratelimit`). Čísla berte jako orientační, ne jako auditovanou statistiku.

### Zobrazení ve Wagtail adminu

Wagtail 6 už neobsahuje `ModelAdmin` (přesunul se do samostatného balíčku `wagtail-modeladmin`). Doporučená cesta je `SnippetViewSet`:

```python
# profilovka/wagtail_hooks.py
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import SnippetViewSet

from .models import FrameDownloadCounter


class FrameDownloadCounterViewSet(SnippetViewSet):
    model = FrameDownloadCounter
    icon = "download"
    menu_label = "Profilovka – stažení"
    menu_order = 900
    add_to_admin_menu = True
    list_display = ["frame_id", "count", "updated_at"]
    list_export = ["frame_id", "count", "updated_at"]  # export CSV/XLSX z výpisu
    ordering = ["-count"]
    inspect_view_enabled = True


register_snippet(FrameDownloadCounterViewSet)
```

Redaktorům/marketingu přidělte ve skupině jen oprávnění **view** (ne add/change/delete), aby čísla nešla ručně měnit. Ověřte v použité verzi Wagtailu, že view-only oprávnění pro snippety je podporované. Pokud ne, nebo pokud chcete čistě read-only přehled s filtrem podle data, použijte vlastní report (`wagtail.admin.views.reports.ReportView`) registrovaný přes hook `register_reports_menu_item`.

## 5. CSRF

View výše je chráněný standardním `CsrfViewMiddleware`. JS posílá token v hlavičce `X-CSRFToken`. Bere ho z atributu `data-csrf-token` (šablona vkládá `{{ csrf_token }}`), jinak z cookie `csrftoken`.

Pozor na **cache stránek**. Weby ČT budou nejspíš za CDN nebo frontend cache. Když je v HTML `{{ csrf_token }}`, Django nastaví `Vary: Cookie` a token v cachované stránce může patřit jinému návštěvníkovi, takže POST skončí 403. Možnosti:

1. **Doporučeno:** počítadlo je anonymní a neškodné. Označte view `@csrf_exempt`, ověřujte hlavičku `Origin` (musí být doména ČT), držte whitelist id a rate limit. Z `profilovka.html` pak odstraňte `data-csrf-token="{{ csrf_token }}"`, aby stránka zůstala cachovatelná.
2. Ponechat CSRF, ale token získat až z cookie `csrftoken` (`CSRF_COOKIE_HTTPONLY = False`). Cookie se ale nastaví jen tehdy, když ji nějaká necachovaná odpověď vydá. U plně cachovaných stránek je to nespolehlivé.
3. Stránku s profilovkou necachovat (nejjednodušší, ale nejdražší při špičce po TV upoutávce).

Neúspěšný POST (403/400) uživatel nevidí, stažení proběhne vždy. Chybějící počty proto hledejte v logu serveru.

## 6. Statické soubory a `collectstatic`

```bash
python manage.py collectstatic --noinput
```

- Cesty k rámečkům skládá JS jako `data-frames-base` + `file` z configu. `data-frames-base` je `{% static 'profilovka/frames/' %}`.
- **ManifestStaticFilesStorage** (hashované názvy): `collectstatic` zachová i nehashované originály, takže to funguje, ale soubory rámečků nebudou mít cache-busting. Při změně grafiky rámeček přejmenujte (`ceska-je-moje-modra-v2.png`) nebo použijte variantu s `json_script` (kap. 7), kde se URL generují přes `{% static %}` a jsou hashované.
- **Statické soubory na jiné doméně** (CDN, S3): rámečky se načítají s `crossOrigin="anonymous"`, aby šel výsledný canvas exportovat. Server statiky proto musí u rámečků vracet `Access-Control-Allow-Origin` (doména webu nebo `*`). Bez toho se rámeček nenačte (zobrazí se chybová hláška).
- Rámečky musí mít správný `Content-Type` (`image/png`, případně `image/svg+xml`).
- **CSP** webu musí povolit: `img-src` pro doménu statiky + `data:` + `blob:` (náhled k uložení a stažení), `connect-src 'self'` (počítadlo). Komponenta nepoužívá inline skripty ani inline styly v atributech.

## 7. Rámečky

Seznam je v `static/profilovka/js/profilovka.config.js`:

```js
frames: [
  { id: 'ceska-je-srdce-modra', label: 'Česká je ♥ – modrá', file: 'ceska-je-srdce-modra.png' },
  // …
]
```

Nový rámeček: nahrát PNG (nebo SVG) do `static/profilovka/frames/`, přidat řádek do configu, přidat `id` do `PROFILOVKA_FRAME_IDS`, spustit `collectstatic`.

Požadavky na rámeček:

- **PNG (doporučeno):** čtverec s alfa kanálem (RGBA), průhledné všude, kde má být vidět fotka. Rozměr **alespoň 1080×1080 px**, protože výstup má 1080 px a menší rámeček se při exportu zvětšuje a mírně změkne. Aktuální finální rámečky mají 889×889 px; pro ostřejší výsledek si od marketingu vyžádejte export 1080 px (nebo 2160 px).
- **SVG (alternativa):** `viewBox="0 0 1080 1080"` a zároveň `width="1080" height="1080"` (Firefox jinak nevykreslí SVG do canvasu ve správné velikosti), žádné externí odkazy, **texty převedené na křivky** (SVG vložené jako obrázek nenačte webové fonty);
- důležitý obsah uvnitř vepsaného kruhu (střed 540/540, poloměr 540), protože Facebook zobrazuje profilovku kruhově;
- oficiální značka ČT ze zdrojových souborů manuálu (`CT-V1-lg*.eps` / `.png`), ne překreslená. Placeholdery obsahují pouze přibližnou kresbu symbolu.

Pokud se rámečky mají spravovat z Wagtailu (bez nasazení), lze vytvořit snippet `ProfilovkaFrame(id, label, image: Image, order, active)`, v šabloně vyrenderovat seznam přes `{{ frames|json_script:"profilovka-frames" }}` a v `profilovka.config.js` ho načíst místo pevného pole. To je rozšíření nad rámec mockupu.

## 8. Kontrolní seznam před spuštěním

- [ ] Finální rámečky od marketingu v rozlišení aspoň 1080×1080 px (PNG s alfa kanálem, bezpečná zóna kruhu)
- [ ] Písmo: pokud web ČT načítá TV Sans Screen přes `@font-face`, UI komponenty ho použije samo (`font-family: 'TV Sans Screen', …`)
- [ ] `PROFILOVKA_FRAME_IDS` odpovídá configu
- [ ] Rozhodnutí o CSRF vs. cache (kap. 5)
- [ ] CORS a CSP pro statiku (kap. 6)
- [ ] Test na reálných zařízeních: iPhone Safari (sdílecí list → Uložit obrázek), Android Chrome (stažení), in-app prohlížeč Facebooku/Instagramu (overlay s podržením prstu), desktop Chrome/Firefox/Safari, nahrání HEIC z iPhonu
