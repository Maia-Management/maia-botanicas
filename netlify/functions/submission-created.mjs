/**
 * netlify/functions/submission-created.mjs — Maia Botánicas
 *
 * Netlify auto-invokes a function literally named `submission-created` on
 * EVERY native form submission to this site (forms with data-netlify="true").
 * No dashboard webhook configuration is required.
 *
 * Before this file existed, the /mayoreo.html sample-pack-request form
 * landed submissions in Netlify Forms storage and nothing fired — no email
 * to Andrew, no email to Luz, no WhatsApp ping. Today's E2E sweep (Bug 4
 * of 2026-06-26) flagged exactly this.
 *
 * This handler:
 *   1. Parses the Netlify submission event JSON ({ payload: { form_name, data, ... } }).
 *   2. Builds a plain-text email summary appropriate to the form.
 *   3. Sends it via Resend to TEAM_EMAIL (comma-separated list supported).
 *   4. Always returns 200 so the submission itself is never marked failed —
 *      a thrown error would still log, but Netlify treats throws as retries.
 *
 * ENV (required for the notification to actually fire):
 *   RESEND_API_KEY    Resend API token (re_...). Copy from maia-management
 *                     project's RESEND_API_KEY value (same Resend account).
 *   TEAM_EMAIL        Comma-separated list of recipients.
 *                     Default: andrew@maia-management.com,luz@maia-management.com
 *   EMAIL_FROM        From address. Default: "Maia Botánicas <maia@maia-management.com>"
 *
 * If RESEND_API_KEY is unset, the handler still returns 200 but logs a clear
 * warning so the misconfiguration is obvious in Netlify function logs.
 */

const DEFAULT_TEAM_EMAIL = 'andrew@maia-management.com,luz@maia-management.com';
const DEFAULT_FROM = 'Maia Botánicas <maia@maia-management.com>';

/**
 * Pull the submission fields out of the Netlify submission-created event.
 * Netlify ships JSON of the form { payload: { form_name, data: {...}, ... } }.
 * We also accept a raw POST so the function can be exercised directly.
 */
async function extractSubmission(req) {
  const bodyText = typeof req.body === 'string' ? req.body : await req.text();
  if (!bodyText) return { formName: null, data: {}, meta: {} };

  try {
    const parsed = JSON.parse(bodyText);
    const payload = parsed.payload || parsed;
    const data = payload.data || payload || {};
    const formName =
      payload.form_name ||
      data.form_name ||
      data['form-name'] ||
      parsed.form_name ||
      null;
    const meta = {
      site_url: payload.site_url || null,
      created_at: payload.created_at || null,
      id: payload.id || null,
      number: payload.number || null,
      country: payload.country || null,
      user_agent: payload.user_agent || null,
    };
    return { formName, data, meta };
  } catch (_err) {
    // Fall back to urlencoded body parse.
    const params = new URLSearchParams(bodyText);
    const data = Object.fromEntries(params);
    const formName = data.form_name || data['form-name'] || null;
    return { formName, data, meta: {} };
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Format the mayoreo sample-pack-request submission into a readable email. */
function formatMayoreoEmail(data, meta) {
  const lines = [
    'Nueva solicitud de sample pack mayorista — Maia Botánicas',
    '',
    `Restaurante / Bar:  ${data.restaurant_name || '—'}`,
    `Contacto:           ${data.contact_name   || '—'}`,
    `WhatsApp:           ${data.whatsapp       || '—'}`,
    `Ciudad:             ${data.city           || '—'}`,
    `Tipo de negocio:    ${data.business_type  || '—'}`,
    `Idioma:             ${data.lang           || 'es'}`,
    `Origen:             ${data.origin         || 'mayoreo'}`,
    '',
    `Categorías de interés:`,
    Array.isArray(data['interest[]'])
      ? '  - ' + data['interest[]'].join(', ')
      : '  - ' + (data['interest[]'] || data.interest || '—'),
    '',
    'Notas:',
    `  ${data.notes ? String(data.notes).replace(/\n/g, '\n  ') : '—'}`,
    '',
    '---',
    `Submission ID: ${meta.id || '—'}`,
    `Submission #:  ${meta.number || '—'}`,
    `Submitted at:  ${meta.created_at || new Date().toISOString()}`,
    `Country:       ${meta.country || '—'}`,
    '',
    'Acción siguiente: contactar por WhatsApp en <24 h hábiles para confirmar dirección de envío y armar el sample pack.',
  ];
  const text = lines.join('\n');

  const interestList = Array.isArray(data['interest[]'])
    ? data['interest[]'].join(', ')
    : (data['interest[]'] || data.interest || '—');

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;max-width:640px;margin:0 auto;padding:24px;">
<h2 style="color:#2e5340;margin:0 0 8px 0;">Nueva solicitud de sample pack — Maia Botánicas</h2>
<p style="color:#666;margin:0 0 24px 0;">Llegó por <a href="https://maia-botanicas.com/mayoreo.html">/mayoreo.html</a>.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;">
<tr><td style="padding:6px 0;color:#666;width:170px;">Restaurante / Bar</td><td style="padding:6px 0;"><strong>${escapeHtml(data.restaurant_name)}</strong></td></tr>
<tr><td style="padding:6px 0;color:#666;">Contacto</td><td style="padding:6px 0;">${escapeHtml(data.contact_name)}</td></tr>
<tr><td style="padding:6px 0;color:#666;">WhatsApp</td><td style="padding:6px 0;"><a href="https://wa.me/${escapeHtml((data.whatsapp || '').replace(/[^\d]/g,''))}">${escapeHtml(data.whatsapp)}</a></td></tr>
<tr><td style="padding:6px 0;color:#666;">Ciudad</td><td style="padding:6px 0;">${escapeHtml(data.city)}</td></tr>
<tr><td style="padding:6px 0;color:#666;">Tipo de negocio</td><td style="padding:6px 0;">${escapeHtml(data.business_type)}</td></tr>
<tr><td style="padding:6px 0;color:#666;">Categorías</td><td style="padding:6px 0;">${escapeHtml(interestList)}</td></tr>
<tr><td style="padding:6px 0;color:#666;vertical-align:top;">Notas</td><td style="padding:6px 0;white-space:pre-wrap;">${escapeHtml(data.notes) || '—'}</td></tr>
</table>
<hr style="margin:24px 0;border:none;border-top:1px solid #e0e0e0;">
<p style="color:#999;font-size:12px;">Submission ${escapeHtml(String(meta.id || '—'))} · #${escapeHtml(String(meta.number || '—'))} · ${escapeHtml(meta.created_at || new Date().toISOString())} · ${escapeHtml(meta.country || '—')}</p>
<p style="color:#2e5340;font-size:13px;font-weight:600;">Acción siguiente: contactar por WhatsApp en &lt;24 h hábiles.</p>
</body></html>`;

  return { text, html };
}

/** Format a generic / contact / unknown form into a readable email. */
function formatGenericEmail(formName, data, meta) {
  const ignoreKeys = new Set(['bot-field', 'form-name', 'form_name']);
  const rows = Object.entries(data)
    .filter(([k]) => !ignoreKeys.has(k))
    .map(([k, v]) => `${k.padEnd(20)} ${Array.isArray(v) ? v.join(', ') : String(v ?? '')}`);
  const text = [
    `Nuevo envío de formulario: ${formName || '(sin nombre)'}`,
    '',
    ...rows,
    '',
    '---',
    `Submission ID: ${meta.id || '—'}`,
    `Submission #:  ${meta.number || '—'}`,
    `Submitted at:  ${meta.created_at || new Date().toISOString()}`,
  ].join('\n');
  return { text, html: `<pre style="font-family:ui-monospace,monospace;font-size:13px;">${escapeHtml(text)}</pre>` };
}

async function sendResendEmail({ to, from, subject, text, html, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[submission-created] RESEND_API_KEY not set on this Netlify project — notification email NOT sent. Copy the value from maia-management RESEND_API_KEY (same Resend account).');
    return { ok: false, skipped: 'no_api_key' };
  }
  const payload = {
    from,
    to: Array.isArray(to) ? to : String(to).split(',').map((s) => s.trim()).filter(Boolean),
    subject,
    text,
    html,
  };
  if (replyTo) payload.reply_to = replyTo;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = await r.text();
    if (!r.ok) {
      console.error(
        `[submission-created] Resend send failed: status=${r.status} body=${body.slice(0, 400)}`,
      );
      return { ok: false, status: r.status, body };
    }
    let parsed = null;
    try { parsed = JSON.parse(body); } catch (_) {}
    console.log(`[submission-created] Resend email sent: id=${parsed?.id || '?'} to=${Array.isArray(payload.to) ? payload.to.join(',') : payload.to}`);
    return { ok: true, id: parsed?.id || null };
  } catch (err) {
    console.error('[submission-created] Resend send threw:', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

export default async function handler(req) {
  const method = req?.httpMethod || req?.method || 'POST';
  if (method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let submission;
  try {
    submission = await extractSubmission(req);
  } catch (err) {
    console.error('[submission-created] failed to parse body:', err?.message || err);
    return new Response('OK', { status: 200 });
  }

  const { formName, data, meta } = submission;
  const to = process.env.TEAM_EMAIL || DEFAULT_TEAM_EMAIL;
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;
  const replyTo =
    typeof data.email === 'string' && data.email.includes('@') ? data.email : undefined;

  let subject;
  let body;

  // Form names were split per locale in commit b4df265 (Netlify Forms otherwise
  // collapses ES+EN submissions into one record). Match all variants here.
  const isSamplePack =
    formName === 'sample-pack-request' ||
    formName === 'sample-pack-request-es' ||
    formName === 'sample-pack-request-en';
  const isContact =
    formName === 'contact' ||
    formName === 'contact-es' ||
    formName === 'contact-en' ||
    formName === 'maia-botanicas-contact';

  if (isSamplePack) {
    body = formatMayoreoEmail(data, meta);
    const who = data.restaurant_name
      ? `${data.restaurant_name} (${data.city || '—'})`
      : data.contact_name || 'desconocido';
    subject = `[Maia Botánicas · Mayoreo] Sample pack — ${who}`;
  } else if (isContact) {
    body = formatGenericEmail(formName, data, meta);
    const who = data.name || data.nombre || data.email || 'sin nombre';
    subject = `[Maia Botánicas · Contacto] ${who}`;
  } else {
    body = formatGenericEmail(formName, data, meta);
    subject = `[Maia Botánicas] Formulario: ${formName || 'sin nombre'}`;
  }

  await sendResendEmail({
    to,
    from,
    subject,
    text: body.text,
    html: body.html,
    replyTo,
  });

  return new Response('OK', { status: 200 });
}

export const config = {
  // `submission-created` is a Netlify-reserved function name — invoked
  // automatically on every native form submission. No explicit path needed.
};
