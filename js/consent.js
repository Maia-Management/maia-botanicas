/* Cookie Consent - Google Consent Mode v2
 * No analytics network request is made until consent is accepted.
 */
(function () {
  var GA_ID = "G-XMC58M7185";
  var loaded = false;

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  if (typeof window.gtag !== "function") {
    window.gtag = gtag;
  }

  gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    wait_for_update: 500
  });

  function grantAnalytics() {
    gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
  }

  window.MB_enableAnalytics = function () {
    if (loaded) return;
    loaded = true;
    grantAnalytics();

    var script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA_ID);
    script.onload = function () {
      gtag("js", new Date());
      gtag("config", GA_ID, { anonymize_ip: true });
    };
    document.head.appendChild(script);
  };

  try {
    if (localStorage.getItem("mb_consent") === "accepted") {
      window.MB_enableAnalytics();
    }
  } catch (e) {
    // Keep denied defaults when storage is unavailable.
  }
})();
