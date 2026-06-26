/* Maia Botánicas — Vert OS client-side event tracker
 * Sends beacons to /.netlify/functions/vert-event for:
 *   - page_view
 *   - product_card_click  (any [data-vert-product] or .prod-card CTA click)
 *   - category_browse     (tab activation)
 *   - whatsapp_click      (any wa.me/* anchor click)
 *   - form_submission     (any [data-vert-form] form's submit)
 *
 * Fail-open: every send swallows errors so the page is never broken by tracking.
 *
 * 2026-06-26 — launch-weekend Vert OS wiring per memory
 * reference_maia_botanicas_canonical_2026_06_22.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.fetch) return;

  var ENDPOINT = '/.netlify/functions/vert-event';
  var lang = (document.documentElement.getAttribute('lang') || 'es').slice(0, 2);
  var page = location.pathname || '/';

  function payload(type, opts) {
    opts = opts || {};
    return {
      type: type,
      channel: opts.channel || 'web_widget',
      customer: opts.customer || null,
      source_ref: opts.source_ref || null,
      page: page,
      lang: lang,
      metadata: opts.metadata || null,
      hp: '' // honeypot — always empty from real client
    };
  }

  function send(type, opts) {
    try {
      var body = JSON.stringify(payload(type, opts));
      // sendBeacon survives page unload — best for clicks that navigate away.
      if (opts && opts.useBeacon && navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(ENDPOINT, blob);
        return;
      }
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
        credentials: 'omit',
        mode: 'cors'
      }).catch(function () { /* swallow */ });
    } catch (_) { /* swallow */ }
  }

  /* ---------- page_view ---------- */
  function firePageView() {
    send('page_view', {
      channel: 'web_widget',
      metadata: { referrer: document.referrer || null }
    });
  }

  /* ---------- whatsapp_click ---------- */
  function wireWhatsAppClicks() {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href*="wa.me/"]') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      var origin = a.closest('.prod-card') ? 'product_card'
                 : a.closest('.hero')      ? 'hero'
                 : a.closest('.rx-block')  ? 'rx_block'
                 : a.closest('.site-footer') ? 'footer'
                 : 'other';
      send('whatsapp_click', {
        channel: 'whatsapp',
        useBeacon: true,
        metadata: { href: href.slice(0, 200), origin: origin }
      });
    }, true);
  }

  /* ---------- product_card_click ---------- */
  function wireProductCardClicks() {
    document.addEventListener('click', function (e) {
      var cta = e.target && e.target.closest ? e.target.closest('.prod-card .prod-card__cta') : null;
      if (!cta) return;
      var card = cta.closest('.prod-card');
      var title = card && card.querySelector('.prod-card__title');
      var titleText = title ? (title.textContent || '').trim().slice(0, 120) : null;
      var sku = null;
      var m = (cta.getAttribute('href') || '').match(/\(([A-Z]{2}-[A-Z]+-[0-9]+)\)/);
      if (m) sku = m[1];
      send('product_card_click', {
        channel: 'web_widget',
        useBeacon: true,
        source_ref: sku ? ('card-' + sku) : null,
        metadata: { sku: sku, title: titleText }
      });
    }, true);
  }

  /* ---------- category_browse ---------- */
  function wireCategoryBrowse() {
    var lastFired = null;
    document.addEventListener('click', function (e) {
      var tab = e.target && e.target.closest ? e.target.closest('.tab[data-tab]') : null;
      if (!tab) return;
      var cat = tab.getAttribute('data-tab');
      if (!cat || cat === lastFired) return;
      lastFired = cat;
      send('category_browse', {
        channel: 'web_widget',
        metadata: { category: cat }
      });
    }, true);

    // Also fire on cat-card clicks from the home page.
    document.addEventListener('click', function (e) {
      var cc = e.target && e.target.closest ? e.target.closest('.cat-card[href*="#"]') : null;
      if (!cc) return;
      var href = cc.getAttribute('href') || '';
      var cat = (href.split('#')[1] || '').trim();
      if (!cat) return;
      send('category_browse', {
        channel: 'web_widget',
        useBeacon: true,
        metadata: { category: cat, origin: 'cat_card' }
      });
    }, true);
  }

  /* ---------- form_submission ---------- */
  function wireFormSubmissions() {
    var forms = document.querySelectorAll('form[data-netlify="true"], form[name="contact"], form[name="sample-pack-request"]');
    forms.forEach(function (form) {
      form.addEventListener('submit', function () {
        // Pull customer hints from form fields if available.
        var name  = (form.querySelector('[name="name"]') || form.querySelector('[name="contact_name"]') || {}).value || null;
        var wa    = (form.querySelector('[name="whatsapp"]') || form.querySelector('[name="wa"]') || {}).value || null;
        var email = (form.querySelector('[name="email"]') || {}).value || null;
        var formName = form.getAttribute('name') || 'unknown';
        send('form_submission', {
          channel: 'web_widget',
          useBeacon: true,
          source_ref: 'botanicas-form-' + formName + '-' + Date.now(),
          customer: {
            phone: wa,
            email: email,
            name: name
          },
          metadata: { form_name: formName, origin: page }
        });
      }, true);
    });
  }

  function init() {
    firePageView();
    wireWhatsAppClicks();
    wireProductCardClicks();
    wireCategoryBrowse();
    wireFormSubmissions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
