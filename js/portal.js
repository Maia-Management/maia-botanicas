/* Maia Botánicas — Buyer portal client
 * Magic-link auth via Supabase OTP. After link return, fetches orders +
 * sample tracker from public endpoints. v1 = lightweight, dispatch happens via WhatsApp.
 */
(function () {
  'use strict';

  // Config — replace at deploy time or read from window.MB_CONFIG
  var SUPABASE_URL = (window.MB_CONFIG && window.MB_CONFIG.supabaseUrl) || 'https://nxgndsnxugcevwriljlv.supabase.co';
  var SUPABASE_ANON = (window.MB_CONFIG && window.MB_CONFIG.supabaseAnon) || '';

  function $(sel) { return document.querySelector(sel); }
  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }
  function setText(el, t) { if (el) el.textContent = t; }

  function getStoredSession() {
    try { return JSON.parse(sessionStorage.getItem('mb_portal_session') || 'null'); } catch (e) { return null; }
  }
  function storeSession(s) {
    try { sessionStorage.setItem('mb_portal_session', JSON.stringify(s)); } catch (e) {}
  }
  function clearSession() {
    try { sessionStorage.removeItem('mb_portal_session'); } catch (e) {}
  }

  /* Magic-link request — uses Supabase Auth REST endpoint */
  async function requestMagicLink(email) {
    if (!SUPABASE_ANON) {
      throw new Error('Portal no configurado todavía. Habla con Don Próspero por WhatsApp.');
    }
    var resp = await fetch(SUPABASE_URL + '/auth/v1/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
      body: JSON.stringify({
        email: email,
        options: { emailRedirectTo: location.origin + '/portal.html' }
      })
    });
    if (!resp.ok) {
      var text = await resp.text();
      throw new Error('No se pudo enviar el enlace: ' + text);
    }
    return true;
  }

  /* After magic-link redirect Supabase puts access_token in the URL hash */
  function captureSessionFromHash() {
    if (!location.hash || location.hash.indexOf('access_token=') < 0) return null;
    var params = new URLSearchParams(location.hash.slice(1));
    var s = {
      access_token: params.get('access_token'),
      refresh_token: params.get('refresh_token'),
      expires_at: Date.now() + (parseInt(params.get('expires_in') || '3600', 10) * 1000),
      token_type: params.get('token_type') || 'bearer'
    };
    if (!s.access_token) return null;
    storeSession(s);
    // Clean URL
    history.replaceState(null, '', location.pathname);
    return s;
  }

  async function fetchUser(session) {
    var r = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: 'Bearer ' + session.access_token
      }
    });
    if (!r.ok) return null;
    return r.json();
  }

  async function fetchOrders(session, leadId) {
    var url = SUPABASE_URL + '/rest/v1/botanicas_orders?lead_id=eq.' + leadId
      + '&select=id,order_status,items,total_cop,created_at,tracking_url&order=created_at.desc&limit=10';
    var r = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: 'Bearer ' + session.access_token
      }
    });
    if (!r.ok) return [];
    return r.json();
  }

  function renderOrders(orders) {
    var box = $('#orders-list');
    if (!orders.length) {
      box.innerHTML = '<p class="text-mute">Aún no tienes pedidos registrados. Cuando hagas el primero con Don Próspero, aparecerá aquí.</p>';
      return;
    }
    box.innerHTML = orders.map(function (o) {
      var d = new Date(o.created_at).toLocaleDateString('es-CO');
      var total = (o.total_cop || 0).toLocaleString('es-CO');
      var track = o.tracking_url ? '<a href="' + o.tracking_url + '" rel="noopener">Rastrear →</a>' : '';
      return ''
        + '<article class="rx-block" style="margin:0 0 var(--space-4);">'
        + '<div style="display:flex; justify-content:space-between; gap:var(--space-3); flex-wrap:wrap;">'
        + '<span class="stamp">' + d + '</span>'
        + '<span class="badge badge--inhouse">' + o.order_status + '</span>'
        + '</div>'
        + '<p style="margin:var(--space-3) 0 0;"><strong>$' + total + ' COP</strong></p>'
        + (track ? '<p style="margin:0;">' + track + '</p>' : '')
        + '</article>';
    }).join('');
  }

  function renderSampleTracker(lead) {
    var box = $('#sample-tracker');
    if (!lead) { box.innerHTML = '<p class="text-mute">Sin cuenta de comprador activa.</p>'; return; }
    if (lead.sample_pack_requested) {
      box.innerHTML = '<p>Sample pack <strong>' + (lead.status || 'solicitado') + '</strong>. Luz lo coordina por WhatsApp.</p>';
    } else {
      box.innerHTML = '<p>Aún no has pedido sample pack. <a href="/mayoreo.html">Solicítalo gratis</a> — pagas solo el envío.</p>';
    }
  }

  async function fetchLeadByEmail(session, email) {
    var url = SUPABASE_URL + '/rest/v1/botanicas_wholesale_leads?email=eq.' + encodeURIComponent(email)
      + '&select=id,restaurant_name,contact_name,status,sample_pack_requested,location_city&order=created_at.desc&limit=1';
    var r = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: 'Bearer ' + session.access_token
      }
    });
    if (!r.ok) return null;
    var rows = await r.json();
    return rows && rows[0] ? rows[0] : null;
  }

  async function bootDashboard(session) {
    hide($('#state-login'));
    show($('#state-dashboard'));
    var u = await fetchUser(session);
    if (!u) { handleLogout(); return; }
    var lead = await fetchLeadByEmail(session, u.email || '');
    setText($('#buyer-name'), (lead && lead.restaurant_name) || u.email);
    setText($('#buyer-meta'), [lead && lead.contact_name, lead && lead.location_city].filter(Boolean).join(' · ') || u.email);
    if (lead) {
      var orders = await fetchOrders(session, lead.id);
      renderOrders(orders);
      renderSampleTracker(lead);
    } else {
      $('#orders-list').innerHTML = '<p class="text-mute">No vemos tu cuenta de comprador. Habla con Don Próspero para vincularla.</p>';
      renderSampleTracker(null);
    }
  }

  function handleLogout() {
    clearSession();
    show($('#state-login'));
    hide($('#state-dashboard'));
  }

  document.addEventListener('DOMContentLoaded', function () {
    var hashSession = captureSessionFromHash();
    var session = hashSession || getStoredSession();
    if (session && session.access_token && session.expires_at > Date.now()) {
      bootDashboard(session).catch(function () { handleLogout(); });
    }

    var form = $('#form-magic');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = $('#email').value.trim();
        var help = $('#magic-help');
        if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
          help.textContent = 'Correo no válido.';
          return;
        }
        help.textContent = 'Enviando enlace…';
        requestMagicLink(email).then(function () {
          help.textContent = 'Listo. Revisa tu bandeja (y spam). El enlace expira en 30 minutos.';
          form.querySelector('button').disabled = true;
        }).catch(function (err) {
          help.textContent = err.message || 'No se pudo enviar. Habla con Don Próspero.';
        });
      });
    }

    var logout = $('#btn-logout');
    if (logout) logout.addEventListener('click', handleLogout);
  });
})();
