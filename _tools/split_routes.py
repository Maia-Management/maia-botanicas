#!/usr/bin/env python3
"""
maia-botanicas — Route split: ES at /, EN at /en/.

For each ES source page, produce:
  - rewritten ES file at root (only ES content, switcher links to /en/, reciprocal hreflang)
  - new EN file at /en/<page> (only EN content, switcher links back to ES root, EN meta)

ONE-SHOT.  This consumes the bilingual source files at root and overwrites them with
the ES-only output, then writes EN-only files under /en/.  Re-running after a successful
split will produce broken output, because the EN content has already been stripped from the
root files.  To regenerate, `git checkout` the bilingual root files first.

Kept committed as documentation of the transformation; safe to delete once the team is
confident the new routes are stable.
"""
from __future__ import annotations
import os, re, sys
from pathlib import Path
from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parent.parent
EN_DIR = ROOT / "en"
SITE_ORIGIN = "https://maia-botanicas.com"

# Per-page EN metadata.  Source ES values stay in the root files untouched.
PAGES = {
    "index.html": {
        "url_es": "/",
        "url_en": "/en/",
        "title_en": "Maia Botánicas | B2B Botanical Ingredients Colombia",
        "desc_en": "Clarified syrups, precision ferments and export botanicals made in Colombia for bars, restaurants and international buyers.",
        "og_desc_en": "Clarified syrups, precision ferments and export botanicals made in Colombia. B2B from Santa Marta.",
        "tw_desc_en": "Clarified syrups, precision ferments and export botanicals. B2B from Santa Marta, Colombia.",
        "priority": "1.0",
        "changefreq": "monthly",
    },
    "nosotros.html": {
        "url_es": "/nosotros.html",
        "url_en": "/en/nosotros.html",
        "title_en": "About | Maia Botánicas — Made in Colombia",
        "desc_en": "Maia Botánicas makes premium Colombian clarified syrups for bars and export, replacing imported ingredients with local production.",
        "og_desc_en": "Colombia imports bar syrups from Spain. We make them here — and ship them back to the world. The Maia Botánicas story.",
        "tw_desc_en": "Colombia imports bar syrups from Spain. We make them here — and ship them back to the world.",
        "priority": "0.8",
        "changefreq": "monthly",
    },
    "productos.html": {
        "url_es": "/productos.html",
        "url_en": "/en/productos.html",
        "title_en": "B2B Product Catalogue | Maia Botánicas Colombia",
        "desc_en": "Clarified concentrates, cocktail syrups, dehydrated garnishes and Majín made with Colombian ingredients for bars and export.",
        "og_desc_en": "65° Brix concentrates, artisanal syrups, garnishes and Majín. Colombian botanicals for bars, restaurants and international export.",
        "tw_desc_en": "Clarified concentrates, artisanal syrups, garnishes and Majín. Premium Colombian botanicals.",
        "priority": "0.9",
        "changefreq": "monthly",
    },
    "mayoreo.html": {
        "url_es": "/mayoreo.html",
        "url_en": "/en/mayoreo.html",
        "title_en": "Wholesale & Export Terms | Maia Botánicas Colombia",
        "desc_en": "B2B wholesale and export programme for bars, restaurants and international distributors — MOQ, samples, freight, payment terms.",
        "og_desc_en": "Wholesale and export terms for Colombian botanical ingredients. Samples for qualified buyers, FOB Cartagena, monthly HORECA subscription.",
        "tw_desc_en": "Wholesale and export programme for Colombian botanicals. B2B samples, export quotes.",
        "priority": "0.9",
        "changefreq": "monthly",
    },
    "proceso.html": {
        "url_es": "/proceso.html",
        "url_en": "/en/proceso.html",
        "title_en": "Production Process | Maia Botánicas — Field to Concentrate",
        "desc_en": "From field to concentrate — the five-step process behind Maia Botánicas clarified syrups, ferments and export-grade botanicals.",
        "og_desc_en": "Five steps of precision: harvest, extraction, fermentation, clarification and stabilisation. Documented batch-level quality.",
        "tw_desc_en": "From field to concentrate: the five-step Maia Botánicas process.",
        "priority": "0.7",
        "changefreq": "monthly",
    },
    "sostenibilidad.html": {
        "url_es": "/sostenibilidad.html",
        "url_en": "/en/sostenibilidad.html",
        "title_en": "Sustainability | Maia Botánicas — Colombian Biodiversity",
        "desc_en": "How Maia Botánicas works with the second most biodiverse country on the planet — Colombian sourcing, traceability and rigorous processing.",
        "og_desc_en": "Colombian biodiversity, processed with rigour. Sourcing, traceability and sustainability practices behind Maia Botánicas.",
        "tw_desc_en": "The second most biodiverse country on the planet — processed with rigour.",
        "priority": "0.7",
        "changefreq": "monthly",
    },
    "contacto.html": {
        "url_es": "/contacto.html",
        "url_en": "/en/contacto.html",
        "title_en": "Request Samples — Contact | Maia Botánicas Colombia",
        "desc_en": "Request B2B samples, export quotes or trade information from Maia Botánicas. We respond within 24 hours.",
        "og_desc_en": "B2B samples, export quotes or trade enquiries — direct contact with Maia Botánicas in Santa Marta, Colombia.",
        "tw_desc_en": "Request tropical ingredient samples. B2B Colombia — Maia Botánicas.",
        "priority": "0.8",
        "changefreq": "monthly",
    },
    "privacy.html": {
        "url_es": "/privacy.html",
        "url_en": "/en/privacy.html",
        "title_en": "Privacy Policy | Maia Botánicas",
        "desc_en": "Privacy policy of Maia Management S.A.S. — how we collect, use and protect your personal information.",
        "og_desc_en": "Privacy policy of Maia Botánicas — how we collect, use and protect your personal information.",
        "tw_desc_en": "Privacy policy of Maia Botánicas.",
        "priority": "0.3",
        "changefreq": "yearly",
    },
    "terminos.html": {
        "url_es": "/terminos.html",
        "url_en": "/en/terminos.html",
        "title_en": "Terms of Service | Maia Botánicas",
        "desc_en": "Terms of service for Maia Botánicas — conditions of use, B2B sales, samples and intellectual property.",
        "og_desc_en": "Terms of service for Maia Botánicas — B2B trade conditions.",
        "tw_desc_en": "Terms of service for Maia Botánicas.",
        "priority": "0.3",
        "changefreq": "yearly",
    },
}


def _abs(url_path: str) -> str:
    if url_path == "/":
        return SITE_ORIGIN + "/"
    return SITE_ORIGIN + url_path


def _remove_data_lang(soup: BeautifulSoup, keep_lang: str) -> None:
    """Remove elements with data-lang attribute that don't match keep_lang.
    Strip the data-lang attribute from kept elements.  Also strips .mb-es / .mb-en spans inside the
    consent banner that toggle by class."""
    drop = "en" if keep_lang == "es" else "es"
    keep_class = f"mb-{keep_lang}"
    drop_class = f"mb-{drop}"

    for el in list(soup.find_all(attrs={"data-lang": True})):
        v = el.get("data-lang")
        if v == drop:
            el.decompose()
        elif v == keep_lang:
            del el.attrs["data-lang"]

    for el in list(soup.find_all(class_=drop_class)):
        el.decompose()
    for el in list(soup.find_all(class_=keep_class)):
        cls = [c for c in el.get("class", []) if c != keep_class]
        if cls:
            el["class"] = cls
        else:
            del el.attrs["class"]
        # Drop the inline display:none that was used to hide the kept-side
        if "style" in el.attrs and re.search(r"display\s*:\s*none", el["style"]):
            el["style"] = re.sub(r"display\s*:\s*none\s*;?\s*", "", el["style"]).strip()
            if not el["style"]:
                del el.attrs["style"]


def _set_meta(soup: BeautifulSoup, attr_name: str, attr_value: str, content: str) -> None:
    el = soup.find("meta", attrs={attr_name: attr_value})
    if el:
        el["content"] = content


def _set_link(soup: BeautifulSoup, rel: str, hreflang: str | None, href: str) -> None:
    """Find existing <link rel=rel hreflang=hreflang> and overwrite, or insert new."""
    selector = {"rel": rel}
    if hreflang:
        selector["hreflang"] = hreflang
    el = soup.find("link", attrs=selector)
    if el is None:
        el = soup.new_tag("link", rel=rel, href=href)
        if hreflang:
            el["hreflang"] = hreflang
        head = soup.find("head")
        if head:
            head.append(el)
    el["href"] = href


def _rewrite_canonical_hreflang(soup: BeautifulSoup, page: dict, current: str) -> None:
    canonical_url = _abs(page["url_en"]) if current == "en" else _abs(page["url_es"])
    es_url = _abs(page["url_es"])
    en_url = _abs(page["url_en"])

    # Remove any existing hreflang variants we might have written before (including legacy es-co)
    for el in list(soup.find_all("link", attrs={"rel": "alternate"})):
        if el.get("hreflang"):
            el.decompose()

    canon = soup.find("link", attrs={"rel": "canonical"})
    if canon:
        canon["href"] = canonical_url

    head = soup.find("head")

    def add_alt(hreflang: str, href: str) -> None:
        tag = soup.new_tag("link")
        tag["rel"] = "alternate"
        tag["hreflang"] = hreflang
        tag["href"] = href
        if canon and canon.parent is head:
            canon.insert_after(tag)
        else:
            head.append(tag)

    # Order: es, en, x-default (insert_after stacks in reverse, so write in reverse)
    add_alt("x-default", es_url)
    add_alt("en", en_url)
    add_alt("es", es_url)


def _set_og_url(soup: BeautifulSoup, abs_url: str) -> None:
    el = soup.find("meta", attrs={"property": "og:url"})
    if el:
        el["content"] = abs_url


def _set_og_locale(soup: BeautifulSoup, primary: str, alt: str) -> None:
    el = soup.find("meta", attrs={"property": "og:locale"})
    if el:
        el["content"] = primary
    el_alt = soup.find("meta", attrs={"property": "og:locale:alternate"})
    if el_alt:
        el_alt["content"] = alt
    elif soup.find("meta", attrs={"property": "og:locale"}):
        new = soup.new_tag("meta")
        new["property"] = "og:locale:alternate"
        new["content"] = alt
        soup.find("meta", attrs={"property": "og:locale"}).insert_after(new)


def _replace_lang_toggle(soup: BeautifulSoup, current: str, page: dict) -> None:
    """Replace the ES/EN button pair with a single navigating <a>."""
    container = soup.find(class_="lang-toggle")
    if container is None:
        return
    target_url = page["url_es"] if current == "en" else page["url_en"]
    target_label = "ES" if current == "en" else "EN"
    target_hreflang = "es" if current == "en" else "en"

    container.clear()
    a = soup.new_tag("a")
    a["href"] = target_url
    a["class"] = ["lang-btn", "lang-btn--navigate"]
    a["hreflang"] = target_hreflang
    a["rel"] = "alternate"
    a["aria-label"] = (
        "Switch to Spanish version" if current == "en" else "Ver versión en inglés"
    )
    a.string = target_label
    container.append(a)


def _fix_relative_paths_for_en(soup: BeautifulSoup) -> None:
    """In /en/ files convert relative asset & page paths to root-relative so the page works from /en/."""
    rel_prefixes = ("js/", "css/", "images/", "assets/", "content/", "favicon")

    def fix_attr(el: Tag, attr: str) -> None:
        if not el.has_attr(attr):
            return
        v = el[attr]
        if not isinstance(v, str):
            return
        if v.startswith(rel_prefixes):
            el[attr] = "/" + v

    for el in soup.find_all(["script", "link", "img", "source", "video", "audio", "iframe"]):
        for a in ("src", "href"):
            fix_attr(el, a)
    # Also fix inline style background-image url(images/...) — none currently present, but cheap.

    # Internal HTML page links: keep relative (nosotros.html etc.) — those resolve to /en/nosotros.html
    # which is the intended same-language sibling.  But we DO need to fix sitemap.xml link.
    sitemap_link = soup.find("link", attrs={"rel": "sitemap"})
    if sitemap_link and sitemap_link.get("href", "").startswith(("sitemap", "/sitemap")):
        sitemap_link["href"] = "/sitemap.xml"


def _strip_inline_lang_default_attrs(html_tag: Tag) -> None:
    for k in ("data-lang-default", "data-lang-toggle", "data-title-es", "data-title-en", "data-desc-es", "data-desc-en"):
        if k in html_tag.attrs:
            del html_tag.attrs[k]


def _patch_jsonld_for_en(soup: BeautifulSoup, page: dict) -> None:
    """Rewrite inLanguage and page URL inside JSON-LD blocks for the EN version.
    Minimal text rewrite — keep schema structure intact."""
    for s in soup.find_all("script", attrs={"type": "application/ld+json"}):
        text = s.string
        if not text:
            continue
        new = text
        new = new.replace('"inLanguage": "es-CO"', '"inLanguage": "en-US"')
        new = new.replace('"inLanguage":"es-CO"', '"inLanguage":"en-US"')
        # Update @id / url / item references that point at the ES page to the EN equivalent
        es_abs = _abs(page["url_es"])
        en_abs = _abs(page["url_en"])
        # Only swap when es URL ends with .html or / and matches whole-string boundaries inside JSON
        if page["url_es"] != "/":
            new = new.replace(es_abs, en_abs)
        # Breadcrumb ES "Inicio" → "Home"
        new = re.sub(r'"name"\s*:\s*"Inicio"', '"name": "Home"', new)
        s.string = NavigableString(new)


def _render(soup: BeautifulSoup) -> str:
    # Preserve the DOCTYPE.  BeautifulSoup includes it via str(soup) when parsed.
    return str(soup)


def transform_es(source_path: Path, page: dict) -> str:
    raw = source_path.read_text(encoding="utf-8")
    soup = BeautifulSoup(raw, "html.parser")

    html = soup.find("html")
    if html:
        html["lang"] = "es"
        _strip_inline_lang_default_attrs(html)

    _remove_data_lang(soup, "es")
    _rewrite_canonical_hreflang(soup, page, current="es")
    _set_og_url(soup, _abs(page["url_es"]))
    _set_og_locale(soup, "es_CO", "en_US")
    _replace_lang_toggle(soup, "es", page)

    return _render(soup)


def transform_en(source_path: Path, page: dict) -> str:
    raw = source_path.read_text(encoding="utf-8")
    soup = BeautifulSoup(raw, "html.parser")

    html = soup.find("html")
    if html:
        html["lang"] = "en"
        _strip_inline_lang_default_attrs(html)

    _remove_data_lang(soup, "en")
    _rewrite_canonical_hreflang(soup, page, current="en")
    _set_og_url(soup, _abs(page["url_en"]))
    _set_og_locale(soup, "en_US", "es_CO")

    # Title & description swaps
    title_tag = soup.find("title")
    if title_tag:
        title_tag.string = page["title_en"]
    _set_meta(soup, "name", "description", page["desc_en"])
    _set_meta(soup, "property", "og:title", page["title_en"])
    _set_meta(soup, "property", "og:description", page["og_desc_en"])
    _set_meta(soup, "property", "og:image:alt", "Maia Botánicas — B2B botanical ingredients from Colombia")
    _set_meta(soup, "name", "twitter:title", page["title_en"])
    _set_meta(soup, "name", "twitter:description", page["tw_desc_en"])

    _replace_lang_toggle(soup, "en", page)
    _patch_jsonld_for_en(soup, page)
    _fix_relative_paths_for_en(soup)

    return _render(soup)


def write_sitemap() -> None:
    today = "2026-05-24"
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ]
    for slug, page in PAGES.items():
        es_url = _abs(page["url_es"])
        en_url = _abs(page["url_en"])
        for loc in (es_url, en_url):
            lines.append("  <url>")
            lines.append(f"    <loc>{loc}</loc>")
            lines.append(f"    <lastmod>{today}</lastmod>")
            lines.append(f"    <changefreq>{page['changefreq']}</changefreq>")
            lines.append(f"    <priority>{page['priority']}</priority>")
            lines.append(f'    <xhtml:link rel="alternate" hreflang="es" href="{es_url}"/>')
            lines.append(f'    <xhtml:link rel="alternate" hreflang="en" href="{en_url}"/>')
            lines.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{es_url}"/>')
            lines.append("  </url>")
    lines.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    if not (ROOT / "index.html").exists():
        print(f"ERROR: index.html not found in {ROOT}", file=sys.stderr)
        return 1

    EN_DIR.mkdir(exist_ok=True)

    for slug, page in PAGES.items():
        src = ROOT / slug
        if not src.exists():
            print(f"  skip {slug} — missing", file=sys.stderr)
            continue
        # Build EN first (from the bilingual source), THEN ES (which overwrites the source).
        en_out = transform_en(src, page)
        (EN_DIR / slug).write_text(en_out, encoding="utf-8")
        print(f"  wrote en/{slug}", file=sys.stderr)

        es_out = transform_es(src, page)
        (ROOT / slug).write_text(es_out, encoding="utf-8")
        print(f"  wrote {slug}", file=sys.stderr)

    write_sitemap()
    print("  wrote sitemap.xml", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
