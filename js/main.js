/* =====================================================
   MAIA BOTÁNICAS — main.js
   Spanish-primary bilingual B2B site
   ===================================================== */

/* ===== JS-READY FLAG (enables CSS scroll animations) ===== */
document.documentElement.classList.add('js-ready');

/* ===== ANIMATION FALLBACK — make everything visible after 3 s ===== */
setTimeout(function() {
  document.querySelectorAll('.reveal, .rv, .fade-in').forEach(function(el) {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
}, 3000);

/* ===== LANGUAGE (route-driven) =====
   The site is split into separately-indexable routes: ES at /, EN at /en/.
   The HTML <html lang="..."> attribute is authoritative — no JS swapping.
   We keep setLang as a helper so the contact form handler and any legacy
   callers still work, but it no longer flips the body class or writes to
   localStorage (which used to override the route on subsequent page loads). */
function currentLang() {
  return (document.documentElement.getAttribute('lang') || 'es').toLowerCase().indexOf('en') === 0 ? 'en' : 'es';
}

function setLang(l) {
  // Kept for the contact-form code path that still calls this; no DOM swap.
  syncLocalizedFormControls(l === 'en' ? 'en' : 'es');
  var nav = document.getElementById('navCenter');
  if (nav) nav.classList.remove('open');
}

function syncLocalizedFormControls(l) {
  document.querySelectorAll('form [data-lang]').forEach(function(el) {
    if (!/^(INPUT|TEXTAREA|SELECT|BUTTON|OPTION)$/.test(el.tagName)) return;
    el.disabled = el.getAttribute('data-lang') !== l;
  });
}

/* Mark the body so any legacy CSS that keys off body.en still applies on /en/ pages. */
(function() {
  if (currentLang() === 'en') document.body && document.body.classList.add('en');
})();

document.addEventListener('DOMContentLoaded', function() {
  if (currentLang() === 'en') document.body.classList.add('en');
  syncLocalizedFormControls(currentLang());
});

/* ===== MOBILE MENU ===== */
function toggleMenu() {
  var nav = document.getElementById('navCenter');
  if (nav) nav.classList.toggle('open');
}

/* Close mobile menu when a nav link is clicked */
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.nav-links a').forEach(function(a) {
    a.addEventListener('click', function() {
      var nav = document.getElementById('navCenter');
      if (nav) nav.classList.remove('open');
    });
  });
});

/* ===== SCROLLED NAV ===== */
window.addEventListener('scroll', function() {
  var navbar = document.getElementById('navbar');
  if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

/* ===== SCROLL REVEAL ===== */
(function() {
  if (typeof IntersectionObserver === 'undefined') return;
  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

  // Animation is CSS-driven (.js-ready .reveal); just observe for the .visible class
  document.querySelectorAll('.reveal').forEach(function(el) {
    obs.observe(el);
  });
})();

/* ===== TOAST ===== */
function showToast(msg) {
  var t = document.getElementById('toast');
  var m = document.getElementById('toastMsg');
  if (!t || !m) return;
  m.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 3800);
}

/* ===== CONTACT FORM ===== */
(function() {
  var form = document.getElementById('contactForm');
  if (!form) return;

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var isES = currentLang() === 'es';
    syncLocalizedFormControls(isES ? 'es' : 'en');
    var btn = form.querySelector('.form-submit[data-lang="' + (isES ? 'es' : 'en') + '"]') || form.querySelector('.form-submit');
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    var data = new FormData(form);
    fetch(form.getAttribute('action') || '/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data).toString()
    })
    .then(function(res) {
      if (res.ok) {
        showToast(isES
          ? 'Mensaje enviado — te contactaremos pronto.'
          : 'Message sent — we\'ll be in touch shortly.');
        form.reset();
        if (typeof gtag === 'function') {
          gtag('event', 'form_submit', { event_category: 'lead', event_label: 'maia-botanicas-contact' });
        }
      } else {
        showToast(isES
          ? 'Algo salió mal. Por favor escríbenos por WhatsApp.'
          : 'Something went wrong. Please contact us via WhatsApp.');
      }
    })
    .catch(function() {
      var isES = currentLang() === 'es';
      showToast(isES
        ? 'Algo salió mal. Por favor escríbenos por WhatsApp.'
        : 'Something went wrong. Please contact us via WhatsApp.');
    })
    .finally(function() {
      if (btn) {
        btn.disabled = false;
        var isES = currentLang() === 'es';
        btn.textContent = isES ? 'Enviar Solicitud' : 'Send Enquiry';
      }
    });
  });
})();

/* ===== GA4 EVENT TRACKING ===== */
document.addEventListener('click', function(e) {
  if (typeof gtag !== 'function') return;

  var wa = e.target.closest('a[href*="wa.me"], a[href*="whatsapp"]');
  if (wa) { gtag('event', 'whatsapp_click', { event_category: 'contact', event_label: wa.href }); }

  var tel = e.target.closest('a[href^="tel:"]');
  if (tel) { gtag('event', 'phone_click', { event_category: 'contact', event_label: tel.href }); }

  var mail = e.target.closest('a[href^="mailto:"]');
  if (mail) { gtag('event', 'email_click', { event_category: 'contact', event_label: mail.href }); }
});

/* ===== SMOOTH SCROLL for anchor links ===== */
document.addEventListener('click', function(e) {
  var link = e.target.closest('a[href^="#"]');
  if (!link) return;
  var target = document.querySelector(link.getAttribute('href'));
  if (target) {
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
