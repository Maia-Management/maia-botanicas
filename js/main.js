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

/* ===== LANGUAGE TOGGLE ===== */
function setLang(l) {
  document.body.classList.toggle('en', l === 'en');
  var btnES = document.getElementById('btnES');
  var btnEN = document.getElementById('btnEN');
  if (btnES) btnES.classList.toggle('active', l === 'es');
  if (btnEN) btnEN.classList.toggle('active', l === 'en');
  document.documentElement.lang = l === 'en' ? 'en' : 'es';
  try { localStorage.setItem('mb_lang', l); } catch(e) {}
  // Close mobile menu
  var nav = document.getElementById('navCenter');
  if (nav) nav.classList.remove('open');
}

/* Restore saved language on load */
(function() {
  try {
    var saved = localStorage.getItem('mb_lang');
    if (saved === 'en') setLang('en');
  } catch(e) {}
})();

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
    var btn = form.querySelector('.form-submit');
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    var data = new FormData(form);
    fetch('https://maia-management.com/.netlify/functions/contact-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data).toString()
    })
    .then(function(res) {
      var isES = !document.body.classList.contains('en');
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
      var isES = !document.body.classList.contains('en');
      showToast(isES
        ? 'Algo salió mal. Por favor escríbenos por WhatsApp.'
        : 'Something went wrong. Please contact us via WhatsApp.');
    })
    .finally(function() {
      if (btn) {
        btn.disabled = false;
        var isES = !document.body.classList.contains('en');
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
