/* Cookie Consent — Google Consent Mode v2
 * Runs BEFORE GA4 loads to set default denied state.
 * Applies any stored user preference from localStorage immediately.
 * Inline page banners (MB_consentAccept / MB_consentReject) call
 * gtag('consent','update',...) on user choice.
 *
 * localStorage key : 'mb_consent'  ('accepted' | 'rejected')
 * GA4 Measurement ID: G-XMC58M7185
 */
(function () {
  // Initialise dataLayer and global gtag function if not yet defined
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  if (typeof window.gtag !== 'function') { window.gtag = gtag; }

  // ── Default: deny everything until user makes a choice ──────────────
  gtag('consent', 'default', {
    analytics_storage:  'denied',
    ad_storage:         'denied',
    ad_user_data:       'denied',
    ad_personalization: 'denied',
    wait_for_update:    500
  });

  // ── Apply any previously stored consent choice immediately ──────────
  try {
    var stored = localStorage.getItem('mb_consent');
    if (stored === 'accepted') {
      // User previously accepted analytics; ads remain denied per policy
      gtag('consent', 'update', {
        analytics_storage: 'granted',
        ad_storage:        'denied',
        ad_user_data:      'denied',
        ad_personalization:'denied'
      });
    }
    // 'rejected' or absent → keep defaults (all denied); no banner action needed
    // The inline page banner will show if no choice has been stored yet
  } catch (e) {
    // localStorage unavailable (private browsing, strict settings) — keep defaults
  }
})();
