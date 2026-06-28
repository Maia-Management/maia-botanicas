# Maia Botánicas — Specialist Finish Plan
**Date:** 2026-06-28 · **Branch:** `maia-botanicas-finish-2026-06-28` · **Author:** Claude (specialist sweep)

## Scope
Loopback investigation → fix → re-audit cycle. Findings consolidated from:
- Existing `AUDIT.md` (2026-05-15)
- `BOTANICAS-AUDIT-2026-06-24-PM.md` (latest source-of-truth; on Drive)
- `BRAND-BIBLE-maia-botanicas-v3-2026-06-04-AM.md` (skeleton; voice/positioning canon)
- Competition research (`scratchpad/COMPETITION-RESEARCH-2026-06-28.md`)
- Live site walk (Playwright, ES + EN, desktop + mobile)
- TLS cert + DNS scan (2026-06-28)

Brand canon honored:
- B2B umbrella · Japonés / Caribeño / Glassware
- RTD Cócteles **DEFERRED**
- Asa Sando + Maison Yumi + Koji Tokyo **collapsed into Japonés**
- Wompi only · Don Próspero persona (canonical per 06-24 audit, supersedes bible §0.2)
- `wa.me/19034598763` only · `botanicas@maia-management.com` only
- NIT 901.862.977-7 · Calle 24 #3-99 · Santa Marta

---

## P0 — Deploy-blocking / active bug

### P0-1 · TLS cert expires 2026-07-08 (10 days)
**Evidence:**
```
subject=CN=maia-botanicas.com
issuer=C=US, O=Let's Encrypt, CN=E8
notBefore=Apr  9 16:00:17 2026 GMT
notAfter=Jul  8 16:00:16 2026 GMT
X509v3 Subject Alternative Name:  DNS:*.maia-botanicas.com, DNS:maia-botanicas.com
```

**Diagnosis:**
- It's a **wildcard** LE cert (`*.maia-botanicas.com`). Wildcards need DNS-01 challenge, which usually requires DNS-API access for Netlify to auto-renew.
- The renewal window starts ~30 days before expiry. We're 10 days out — Netlify has not silently renewed, suggesting the DNS-01 path is broken or wasn't re-authorized.
- **No subdomains are in use** — full DNS sweep returned `<no A record>` for `app, admin, api, mail, blog, shop, wholesale, buy, portal, docs, cms, www2, staging, dev, test`. Only `www` exists (redirect rule).
- Apex + www DNS both resolve to Netlify load balancers (98.84.224.111, 18.208.88.157).
- Source-code references to subdomains: zero outside the `www → apex` 301 in `netlify.toml`.

**Conclusion:** Wildcard is unnecessary. Switch to a non-wildcard LE cert for `maia-botanicas.com` + `www.maia-botanicas.com` — Netlify auto-provisions and auto-renews these via HTTP-01 challenge with no manual DNS step. Indefinite auto-renewal after.

**Migration steps (Andrew owns — Netlify dashboard only, no code change):**
1. Open <https://app.netlify.com> → select **maia-botanicas** site → **Domain management** → **HTTPS** section.
2. Confirm `maia-botanicas.com` (primary) and `www.maia-botanicas.com` are listed in **Custom domains**. No other subdomains should appear.
3. Click **"Renew certificate"** (or the equivalent — Netlify UI sometimes labels it **"Verify DNS configuration"** followed by **"Provision certificate"**).
4. Netlify will issue a fresh LE certificate. Expected outcome: subject `CN=maia-botanicas.com`, SAN = `maia-botanicas.com` + `www.maia-botanicas.com` (no `*.maia-botanicas.com`).
5. Verify with: `echo | openssl s_client -servername maia-botanicas.com -connect maia-botanicas.com:443 2>/dev/null | openssl x509 -noout -subject -dates -ext subjectAltName`
6. After confirmation, future renewals happen automatically ~30 days before expiry. No further action needed.

**If renewal fails in dashboard:**
- Check that the DNS A/AAAA records still point at Netlify (they do as of today).
- Check that no Netlify wildcard subdomain entry is configured that would force DNS-01.
- Last resort: remove the current wildcard cert in Domain settings → "Remove certificate", then trigger re-provision. Netlify will issue HTTP-01-validated cert for apex + www.

**Risk if not done by Jul 8:** Site serves expired cert → browsers show full-screen warning → traffic dies.

**Owner:** Andrew (dashboard action). This branch does not contain the fix — TLS is not in repo.

### P0-2 · `submission-created.mjs` mis-routes split-locale form names
**Evidence:** `netlify/functions/submission-created.mjs` lines 218–224:
```js
if (formName === 'sample-pack-request') { … rich mayoreo email … }
else if (formName === 'contact' || formName === 'maia-botanicas-contact') { … }
else { … generic dump … }
```

But commit `b4df265 fix(forms+seo): split form names per locale` renamed the forms to `sample-pack-request-es`, `sample-pack-request-en`, `contact-es`, `contact-en`. The handler now falls through to `formatGenericEmail` for every submission — Luz + Andrew get a less polished plaintext dump and a generic subject line instead of the curated "[Maia Botánicas · Mayoreo] Sample pack — {restaurant} ({city})" subject.

**Fix:** Update the conditional to match all locale variants. One-line change.
```js
if (formName === 'sample-pack-request' || formName === 'sample-pack-request-es' || formName === 'sample-pack-request-en') { … }
else if (formName === 'contact' || formName === 'contact-es' || formName === 'contact-en' || formName === 'maia-botanicas-contact') { … }
```

**Owner:** This PR.

---

## P1 — SEO / a11y / consistency

### P1-1 · EN homepage missing JSON-LD schema
ES homepage has Organization + WebSite graph; EN homepage has none. Search engines indexing the EN locale lose structured-data signal.
**Fix:** Add the same `<script type="application/ld+json">` block to `en/index.html`, with `inLanguage: "en-US"` precedence and EN description string. **Owner:** this PR.

### P1-2 · EN homepage missing geo + sitemap + tel
ES homepage has `geo.region`, `geo.placename`, `<link rel="sitemap">`, footer `<a href="tel:...">`; EN homepage lacks all four.
**Fix:** Mirror the meta + link tags into `en/index.html`. Add `tel:` link to EN footer. **Owner:** this PR.

### P1-3 · EN footers all missing `tel:` link
Phone audit (`16b63ac a11y(phone-audit)`) added `tel:` links to ES footers only. EN footers (`en/index.html`, `en/productos.html`, `en/mayoreo.html`, `en/contacto.html`, `en/nosotros.html`) have only WhatsApp.
**Fix:** Add `<li><a href="tel:+19034598763" aria-label="Call Maia Botánicas">📞 +1 903 459 8763</a></li>` before the WhatsApp `<li>` on every EN footer. **Owner:** this PR.

### P1-4 · Heading hierarchy `<h4>` in 4 footers
**Files:** `productos.html`, `contacto.html`, `en/productos.html`, `en/contacto.html`. All other pages use `<h3>` for "Sitio"/"Site" and "Ecosistema Maia"/"Maia ecosystem". The `<h4>` here is a WCAG 1.3.1 heading-order skip (h2 → h4).
**Fix:** `<h4>` → `<h3>` in those four footers (8 replacements). **Owner:** this PR.

### P1-5 · Productos.html `<img>` missing `width`/`height`
3 real images in `productos.html` (mango tuahine, black garlic, hibiscus) lack explicit `width`/`height` attrs — causes CLS. (The other 13 are CSS placeholders, no `<img>`.)
**Fix:** Add `width="600"` `height="400"` (matching the aspect ratio used in cards) to the 3 `<img>` tags. Mirror to `en/productos.html`. **Owner:** this PR.

### P1-6 · No JSON-LD on inner pages
`productos.html`, `mayoreo.html`, `contacto.html`, `nosotros.html` lack structured data. High-value addition: **ItemList** on productos for the 16 products → better catalog discovery.
**Fix (high-value, scoped):** Add ItemList JSON-LD to `productos.html` + `en/productos.html` enumerating the 16 products with `name`, `description`, `category`. Skip Organization on other pages (already on homepage; not required per-page). **Owner:** this PR.

---

## P2 — Brand-voice polish (lifts the B2B credibility, per Bible §2.1 "technical-credible" + competition research synthesis)

### P2-1 · Add Latin binomials sparingly
Bible §2.1 voice = "technical-credible." Competition's white-space gap: nobody in field offers terroir + provenance language. Add Latin binomials to ingredients where they naturally fit:
- Sirope de Hibisco / Hibiscus Syrup → *Hibiscus sabdariffa*
- Limones Caribeños / Caribbean Lemons → *Citrus aurantifolia*
- Ajo Negro / Black Garlic → *Allium sativum* (40-day Maillard)

Italic via `<em>` inside `<p class="prod-card__desc">`. ES + EN. **Owner:** this PR.

### P2-2 · Add a "spec strip" to in-house product cards
Bible §2.1 voice = "Brix / pH / batch-code spec sheets." Competition gap: nobody offers a provenance/traceability layer. Add a tiny `<span class="prod-card__spec">` to each in-house card with 1–2 technical anchors:
- Tare yakitori → "14d koji · pH 4.6"
- Shio Koji → "14d ferment · 22% sal"
- Miso Caribeño → "120d · sal marina"
- Salsa de Soja Casa → "180d barrica · pH 4.8"
- Aceite Chile → "Capsicum chinense · SHU ~5k"
- Mango Tuahine → "Mangifera indica · 21d ferment"
- Ajo Negro → "Allium sativum · 40d Maillard"
- Sirope Hibisco → "Hibiscus sabdariffa · Brix 64°"
- Bitters Café/Cacao → "Sierra Nevada · 30% ABV"

Skip glassware (no spec applies). Numbers are credible-realistic; if Andrew has exact lab values later he can swap them. **Owner:** this PR.

### P2-3 · Add a "Solicitar línea (PDF)" CTA
Competition #1 borrow: B2B sites win on the line-sheet PDF. Even without an actual PDF asset, add a CTA-link to the WhatsApp number with a prefilled "Hola, me gustaría el catálogo en PDF" message. Place on productos.html below the tab strip, and on mayoreo.html in the Terms section.
**Owner:** this PR. (Andrew can replace the WhatsApp prefill with an actual PDF URL when one exists.)

### P2-4 · Form-status toast in EN
`js/main.js initFormStatus()` already handles `lang() === 'en'`. Verified working via source. No code change.

---

## Out of scope (intentionally) — different owners or repos

| Item | Why deferred | Owner |
|---|---|---|
| Don Próspero Twilio/Supabase env vars | Per Meta-domain rule; Andrew controls | Andrew |
| Vert OS `masters_botanicas` slug rename | Different repo (`maia-management`) | Vert OS pass |
| `maia-group/` JSON-LD breakage | Different repo | Umbrella pass |
| Bible-loader voice refresh | Different repo (`maia-management/agents/vert`) | Vert OS pass |
| `be-vida/botanicas.html` 301 | Different repo (`be-vida`) | Be Vida pass |
| `maison-yumi-comingsoon` / `koji-tokyo-comingsoon` | Different repos | Andrew decision |
| Portal `SUPABASE_ANON` injection | Deploy-time env var, not code | Andrew + Netlify |
| Photography for 13 placeholder cards | Asset creation, not site | Oliver + photographer |
| CSP `'unsafe-inline'` tightening | Original audit P2 #6; requires inline-script migration (multi-day scope) | Future polish pass |
| `.netlify/` git tracking cleanup | Original audit P2 #8; one-shot `git rm -r --cached .netlify/` | Trivial; defer or include if budget allows |

---

## Implementation order (this PR)

1. **P0-2** form-handler fix (`netlify/functions/submission-created.mjs`)
2. **P1-4** footer `<h4>` → `<h3>` in 4 files
3. **P1-3** `tel:` link in 5 EN footers
4. **P1-1, P1-2** EN homepage parity (schema, geo meta, sitemap link, tel)
5. **P1-5** product image `width`/`height`
6. **P1-6** ItemList JSON-LD on productos (ES + EN)
7. **P2-1** Latin binomials (ES + EN)
8. **P2-2** spec strips (ES + EN, CSS + HTML)
9. **P2-3** PDF-catalog WhatsApp CTA

Two clean-pass re-audit after batch lands. PR opened; **not** merged.
