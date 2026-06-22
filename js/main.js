/* Maia Botánicas v1 — main.js — 2026-06-22
 * Lightweight: nav toggle, product tabs, smooth-scroll, consent
 */
(function () {
  'use strict';
  document.documentElement.classList.add('js-ready');

  function lang() {
    var l = (document.documentElement.getAttribute('lang') || 'es').toLowerCase();
    return l.indexOf('en') === 0 ? 'en' : 'es';
  }

  /* Mobile nav toggle */
  function initNav() {
    var btn = document.querySelector('.nav__toggle');
    var nav = document.getElementById('nav-primary');
    if (!btn || !nav) return;
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') nav.classList.remove('is-open');
    });
  }

  /* Product tabs */
  function initTabs() {
    var tabs = document.querySelectorAll('.tab[data-tab]');
    var panels = document.querySelectorAll('.tab-panel[data-anchor]');
    if (!tabs.length || !panels.length) return;

    function activate(id) {
      tabs.forEach(function (t) {
        var active = t.dataset.tab === id;
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      panels.forEach(function (p) {
        p.classList.toggle('is-active', p.dataset.anchor === id);
      });
    }

    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        var id = t.dataset.tab;
        activate(id);
        if (history.replaceState) history.replaceState(null, '', '#' + id);
      });
      t.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        var arr = Array.prototype.slice.call(tabs);
        var idx = arr.indexOf(document.activeElement);
        if (idx < 0) return;
        var next = e.key === 'ArrowRight' ? (idx + 1) % arr.length : (idx - 1 + arr.length) % arr.length;
        arr[next].focus();
        arr[next].click();
      });
    });

    var hash = (location.hash || '').replace('#', '');
    if (hash && document.getElementById('panel-' + hash)) activate(hash);
  }

  /* Smooth-scroll anchor links */
  function initSmoothScroll() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href^="#"]');
      if (!link) return;
      var hash = link.getAttribute('href');
      if (hash.length < 2) return;
      var target = document.querySelector(hash);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (history.replaceState) history.replaceState(null, '', hash);
      }
    });
  }

  /* Form-status toast after Netlify redirect */
  function initFormStatus() {
    var params = new URLSearchParams(location.search);
    var status = params.get('status');
    if (!status) return;
    var msg = document.createElement('div');
    msg.setAttribute('role', 'status');
    msg.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#2E5C3F;color:#FFFAF1;padding:14px 22px;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.2);z-index:200;font-weight:600;max-width:90vw;text-align:center;';
    msg.textContent = lang() === 'es'
      ? '¡Recibido! Don Próspero te escribe en menos de 24 horas hábiles.'
      : 'Got it! Don Próspero will message you within 24 business hours.';
    document.body.appendChild(msg);
    setTimeout(function () { msg.style.opacity = '0'; msg.style.transition = 'opacity 0.4s ease'; }, 5200);
    setTimeout(function () { msg.remove(); }, 5800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initNav(); initTabs(); initSmoothScroll(); initFormStatus();
    });
  } else {
    initNav(); initTabs(); initSmoothScroll(); initFormStatus();
  }
})();
