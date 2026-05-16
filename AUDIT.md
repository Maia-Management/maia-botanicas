# Maia Botánicas — Site Audit
**Date:** 2026-05-15  
**Auditor:** Claude (Cowork mode)  
**Repo:** `C:\Users\ajsga\Desktop\Maia Web-Sites Folder\maia-botanicas`  
**Scope:** All HTML, JS, CSS, TOML, JSON, TXT, MD files + asset inventory

---

## Overall Score: 7.8 / 10

The site is well-structured, mobile-responsive, and passes all P0 zero-tolerance checks (correct WhatsApp number throughout, no personal email on public pages, NIT 901.862.977-7 correct everywhere, correct office address on all pages). Two P1 bugs were found and fixed during this audit. No P0 issues exist.

---

## P0 Checks — Zero Tolerance (PASS ✅)

| Check | Status | Notes |
|---|---|---|
| WhatsApp CTA = `wa.me/19034598763` only | ✅ PASS | All 20+ WA links use correct number |
| No `andrew@maia-management.com` on public pages | ✅ PASS | Not found anywhere |
| NIT = `901.862.977-7` (DV 7, not 1) | ✅ PASS | Correct in all footers, schema, legal pages |
| Office address correct | ✅ PASS | Calle 24 #3-99, Edificio Banco de Bogotá, Suite 1102, Level 11, Santa Marta — consistent |

---

## Bug List

### P1 — High (Deploy-Blocking / Significant Risk)

**1. `netlify.toml` line 159 — CSP header truncated, TOML invalid [FIXED ✅]**  
The `Content-Security-Policy` value had only its opening `"` — the file ended mid-string (`...img-src 'self' data: https://www.google-analytics.com`) with no closing quote and no remaining directives. TOML parse would fail on a fresh deploy from this file. The correct full CSP value was recovered from `.netlify/netlify.toml` and restored. Closing quote and missing directives (`connect-src`, `frame-src`, `base-uri`, `object-src`, `frame-ancestors`, `form-action`, `upgrade-insecure-requests`) are now present.

**2. `sostenibilidad.html` EOF — 15 null bytes appended after `</html>` [FIXED ✅]**  
The file contained `\x00 × 15` trailing after the closing HTML tag, causing `grep` to classify it as binary (blocking text-search tooling) and potentially causing issues with some CDN processors, HTML validators, and CI pipelines. Null bytes stripped. File size reduced from 39,576 to 39,561 bytes. Content unaffected.

---

### P2 — Medium (Functionality / SEO / Security)

**3. `netlify.toml` — No explicit 404 error page rule**  
`404.html` exists and Netlify serves it by convention, but there is no explicit `[[redirects]] from = "/*" to = "/404.html" status = 404` rule in `netlify.toml`. The `.netlify/netlify.toml` also has no 404 rule. Relying on Netlify convention is generally fine but explicit configuration is safer and avoids surprises on platform changes.  
*Fix:* Add `[[redirects]] from = "/*" to = "/404.html" status = 404` at the end of `netlify.toml`.

**4. `index.html` lines 5 & 79 — Duplicate favicon declarations pointing to different files**  
- Line 5: `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` → root `favicon.svg` (1,655 bytes)  
- Line 79: `<link rel="icon" href="favicon/favicon.svg" type="image/svg+xml">` → `favicon/favicon.svg` (610 bytes)  
These are two different SVG files. Browsers use the first declaration; the second is dead weight and creates confusion. Same duplicate appears across all HTML pages.  
*Fix:* Remove the `<head>`-bottom duplicate (line 79 pattern). Consolidate to `/favicon.svg` in `<head>` only. Decide which SVG is the canonical favicon.

**5. `contacto.html` lines 226/229, 236/239, 286/289 — Duplicate `name=` attributes in bilingual form**  
The bilingual contact form renders both ES and EN inputs simultaneously, with identical `name=` values (`nombre`, `empresa`, `mensaje`). The JS calls `syncLocalizedFormControls()` to `disabled` the inactive language's fields before submit, but:  
- The form uses `novalidate` — browser won't enforce disabled state on submit  
- On slow connections the JS may not have run `syncLocalizedFormControls()` before a user submits  
- Netlify Forms will receive doubled fields if both are enabled at submit time  
*Fix:* Either (a) use the same single input and swap `placeholder` text via JS, or (b) ensure the `disabled` attribute is set synchronously on page load before any user interaction.

**6. `netlify.toml` line 153 — CSP uses `'unsafe-inline'` for `script-src`**  
Inline event handlers (`onclick=`, language toggle, consent banner inline script) require `'unsafe-inline'` in `script-src`, which defeats much of XSS protection that CSP provides.  
*Fix (medium effort):* Migrate all `onclick=` handlers to `addEventListener` in `main.js`. Replace the inline consent banner script with a deferred external script. Then remove `'unsafe-inline'` from `script-src` and replace with a nonce or hash.

**7. `index.html` line 132 — English H1 is a `<div>`, not `<h1>`**  
The Spanish H1 is a proper `<h1>` tag. The English equivalent uses `<div class="hero-h1" role="heading" aria-level="1">`. ARIA is present but search engine crawlers (Googlebot) strongly prefer semantic `<h1>` for ranking signals. This degrades SEO for English-language queries.  
*Fix:* Change the EN hero heading to `<h1 class="hero-h1" data-lang="en">`. Both H1s will be present in DOM; CSS `data-lang` hiding already handles display. Screen readers and crawlers seeing `display:none` on the inactive one is acceptable.

**8. `.netlify/` directory committed despite `.gitignore` entry**  
`.gitignore` correctly lists `.netlify/` but the directory is committed (visible in the working tree). The `.netlify/state.json` only contains the Netlify `siteId` (not sensitive), but the `.netlify/netlify.toml` is a compiled artifact that can drift from the source `netlify.toml`.  
*Fix:* Run `git rm -r --cached .netlify/` to remove from tracking. The `.gitignore` entry already exists so the directory won't be re-committed.

---

### P3 — Low (Polish / Best Practice)

**9. All HTML files — `<html lang="es">` is static; JS toggles it dynamically**  
All pages start with `lang="es"` hardcoded. The JS `setLang()` function updates `document.documentElement.lang` at runtime. Search engines indexing with JS disabled will always see `lang="es"` regardless of `?lang=en` parameter. The current hreflang setup (`es-co` / `en` alternates) is correct but actual content language detection will fail for bots.  
*Note:* Server-side language detection would resolve this but is complex on static Netlify. Low urgency.

**10. Most HTML pages — No `<noscript>` fallback**  
Pages with inline consent/cookie banners (`index.html`, `contacto.html`, etc.) have no `<noscript>` tag explaining that JS is required. Users on corporate networks with JS blocked see no consent banner and no language toggle.

**11. Heavy inline `style=` attributes across all HTML pages**  
Dozens of `style="..."` attribute blocks throughout the HTML. This conflicts with the CSP `style-src 'self' 'unsafe-inline'` requirement and makes visual maintenance harder. Consider moving repeated inline styles into `css/styles.css` utility classes.

**12. `robots.txt` — Legal pages indexed**  
`privacy.html` and `terminos.html` are in `robots.txt` as `Allow: /` (no disallow rules). These pages appear in `sitemap.xml` with `priority 0.3`. If you prefer they not appear in search results, add `X-Robots-Tag: noindex` via Netlify headers for those paths, or add `Disallow: /privacy.html` and `Disallow: /terminos.html` to `robots.txt` (and remove from sitemap).

**13. `sitemap.xml` — `.html` extensions but `pretty_urls = false`**  
`netlify.toml` sets `pretty_urls = false`, meaning Netlify will serve pages at their `.html` paths (e.g., `/nosotros.html`), not `/nosotros/`. The sitemap correctly uses `.html` extensions. However, the redirect rules map `/nosotros` → `/nosotros.html`, which is correct. Consistent. No action required, noted for awareness.

**14. `contacto.html` form — Action posts to `/contacto.html`**  
The Netlify form `action="/contacto.html"` will reload the current page on success. Standard Netlify Forms practice is to redirect to a dedicated `/gracias.html` success page so users get clear confirmation and you can fire a conversion event cleanly. Currently the JS intercepts submit via `fetch()` and shows a toast — this works but the `action` attribute is misleading and acts as a fallback if JS fails.

**15. `mayoreo.html` — No contact form, WhatsApp-only for wholesale leads**  
The wholesale/export page has no embedded form — all CTAs go to WhatsApp. B2B buyers (especially international) often prefer email/form contact. Consider adding the same Netlify form from `contacto.html` to `mayoreo.html` with a pre-selected "Mayoreo/Export" option.

---

## Audit by Category

### Security ✅ (Good with caveats)
- HSTS: ✅ `max-age=31536000; includeSubDomains; preload`
- X-Frame-Options: ✅ `DENY`
- X-Content-Type-Options: ✅ `nosniff`
- Referrer-Policy: ✅ `strict-origin-when-cross-origin`
- Permissions-Policy: ✅ camera, mic, geolocation denied
- CSP: ⚠️ Now complete (fixed P1) but `'unsafe-inline'` in script-src is a weakness (P2 #6)
- No personal PII on public pages: ✅
- Google Analytics: ✅ Only loads after consent via Consent Mode v2

### Business Data Accuracy ✅
- WhatsApp: ✅ `wa.me/19034598763` — all 20+ links correct
- NIT: ✅ `901.862.977-7` — correct in index, nosotros, mayoreo, proceso, privacy, terminos, 404, schema JSON-LD
- Address: ✅ `Calle 24 #3-99, Edificio Banco de Bogotá, Suite 1102, Level 11, Santa Marta` — consistent
- Email: ✅ `info@maia-botanicas.com` — correct throughout, no personal email exposed

### SEO / Meta Tags ✅ (Good)
- Canonical: ✅ All pages have correct canonical URLs
- OG tags: ✅ `og:title`, `og:description`, `og:image`, `og:url`, `og:locale` present on all pages
- Twitter cards: ✅ `summary_large_image` configured
- JSON-LD Schema: ✅ Organization + LocalBusiness + WebSite schema on index, Organization on legal pages
- Geo meta: ✅ `geo.region`, `geo.placename`, `geo.position`, `ICBM` on index
- hreflang: ✅ `es-co` / `en` / `x-default` configured
- Sitemap: ✅ Valid XML with 9 URLs, correct `lastmod` dates
- Robots.txt: ✅ `Allow: /` with sitemap reference
- EN H1 semantic issue: ⚠️ (P2 #7)

### Accessibility ⚠️ (Mostly Good)
- All `<img>` tags have non-empty `alt` attributes: ✅
- `aria-label` on WhatsApp float button: ✅
- Mobile menu button has `aria-label="Menú"`: ✅
- EN hero H1 is a `<div>` not `<h1>`: ⚠️ (P2 #7)
- `prefers-reduced-motion` CSS: ✅ Present in styles.css
- No `<noscript>` fallbacks: ⚠️ (P3 #10)
- Color contrast: Not tested (visual inspection required)

### Performance ✅ (Good)
- Images: ✅ All served as `.webp` with PNG redirect fallbacks
- `loading="lazy"` on below-fold images, `loading="eager"` on hero: ✅
- `width`/`height` attributes on all `<img>` tags (prevents CLS): ✅
- CSS/JS minification: ✅ Configured in `netlify.toml`
- Image compression: ✅ Configured in `netlify.toml`
- Long-lived cache headers for static assets (1 year): ✅
- No render-blocking scripts (all `defer` or end-of-body): ✅
- IntersectionObserver for scroll animations: ✅
- Animation fallback after 3s: ✅

### Asset Integrity ✅
- All `src=` image references resolve to existing files: ✅ (no broken images found)
- `og-image.jpg`: ✅ Present (69,781 bytes)
- `favicon.svg`: ✅ Present at root (1,655 bytes)
- `favicon/favicon.svg`: ✅ Present in subdirectory (610 bytes) — duplicate, different file (P2 #4)

### Netlify Configuration ⚠️
- Build settings: ✅
- CSS/JS/HTML/Image processing: ✅
- www → non-www redirect: ✅
- .html extension redirects: ✅ (clean URLs)
- `netlify.toml` CSP: Fixed ✅ (was P1 truncation)
- Explicit 404 rule: ⚠️ Missing (P2 #3)
- `.netlify/` committed to git: ⚠️ (P2 #8)

---

## Files Audited

| File | Size | Status |
|---|---|---|
| `index.html` | ~18KB | ✅ (minor issues noted) |
| `nosotros.html` | ~26KB | ✅ |
| `productos.html` | ~47KB | ✅ |
| `mayoreo.html` | ~35KB | ✅ |
| `proceso.html` | ~29KB | ✅ |
| `sostenibilidad.html` | ~39KB | Fixed (null bytes) |
| `contacto.html` | ~28KB | ✅ (form issue noted) |
| `privacy.html` | ~22KB | ✅ |
| `terminos.html` | ~27KB | ✅ |
| `404.html` | ~15KB | ✅ |
| `js/consent.js` | ~1.5KB | ✅ |
| `js/main.js` | ~4KB | ✅ |
| `css/styles.css` | ~30KB | ✅ |
| `netlify.toml` | ~3.6KB | Fixed (CSP truncation) |
| `.netlify/netlify.toml` | — | Reference only (compiled) |
| `robots.txt` | ~70B | ✅ |
| `sitemap.xml` | ~2.5KB | ✅ |

---

## Fixes Applied in This Audit

1. **`netlify.toml` line 159** — Restored complete CSP header value (was truncated, unclosed string, TOML invalid)
2. **`sostenibilidad.html` EOF** — Removed 15 trailing null bytes (file was detected as binary by grep)

---

## Recommended Next Actions (Priority Order)

1. **P2 #3** — Add explicit `[[redirects]] from = "/*" to = "/404.html" status = 404` to `netlify.toml`
2. **P2 #4** — Consolidate to single favicon reference; decide which SVG file is canonical
3. **P2 #7** — Change EN hero heading `<div>` to `<h1>` in `index.html` (SEO impact)
4. **P2 #8** — `git rm -r --cached .netlify/` to stop tracking compiled artifacts
5. **P2 #5** — Audit bilingual form field disable logic; test form submission in both languages
6. **P2 #6** — Plan inline-script migration to remove `'unsafe-inline'` from CSP (longer-term)
7. **P3 #12** — Decide on indexing of legal pages; add `noindex` if preferred
8. **P3 #14** — Add a `/gracias.html` success page for form submissions
