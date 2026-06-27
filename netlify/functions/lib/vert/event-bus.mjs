/**
 * netlify/functions/lib/vert/event-bus.mjs — Maia Botánicas
 *
 * Minimal Vert OS event-bus shim for Botánicas. Mirrors the recordEventSafe
 * contract from maia-management/netlify/functions/lib/vert/event-bus.mjs
 * but writes directly to Supabase REST (no @supabase/supabase-js dependency
 * needed in this repo).
 *
 * Brand slug pinned to 'masters_botanicas' to match the DB CHECK constraint
 * in 20260605090001_vert_phase4_customer_core.sql §3
 * (vert_customer_brand_interaction.brand). The slug pre-dates the
 * 2026-06-22 PM canonical collapse (Maia Botánicas as the umbrella B2B
 * brand); rather than risk a DB migration during launch weekend we honour
 * the existing CHECK constraint with the legacy 'masters_botanicas' label.
 *
 * SAFE-BY-DEFAULT: every call is wrapped to never throw. If env vars are
 * missing we degrade to a no-op {ok:false, error:'db_unavailable'} so the
 * customer-facing surface never breaks on a tracking failure.
 *
 * Author: Cowork loopback agent, 2026-06-26
 */

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** Canonical brand slug — matches DB CHECK constraint. */
export const BRANDS = Object.freeze({
  MAIA_BOTANICAS: 'masters_botanicas', // legacy DB label; canonical brand is Maia Botánicas
});

/** Canonical channel slugs — matches DB CHECK constraint. */
export const CHANNELS = Object.freeze({
  WHATSAPP: 'whatsapp',
  WEB_WIDGET: 'web_widget',
  EMAIL: 'email',
  OTHER: 'other',
});

/** Canonical event types used on Botánicas. */
export const EVENTS = Object.freeze({
  PAGE_VIEW: 'page_view',
  PRODUCT_CARD_CLICK: 'product_card_click',
  CATEGORY_BROWSE: 'category_browse',
  WHATSAPP_CLICK: 'whatsapp_click',
  FORM_SUBMITTED: 'form_submission',
  INQUIRY: 'inquiry',
  CHAT_STARTED: 'chat_start',
  LEAD: 'lead',
});

/* ---------- helpers ---------- */

/** Normalise to E.164 (best-effort). */
export function normalizePhone(raw) {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[^\d+]/g, '');
  if (!s) return null;
  if (s.startsWith('+')) return s;
  // Colombian default
  if (s.length === 10 && s.startsWith('3')) return '+57' + s;
  if (s.length === 12 && s.startsWith('57')) return '+' + s;
  return '+' + s;
}

async function sb(method, path, body) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { ok: false, status: 0, body: null, error: 'db_unavailable' };
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: method === 'POST' ? 'return=representation' : 'return=minimal',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = text; }
    return { ok: r.ok, status: r.status, body: parsed, error: r.ok ? null : `supabase_${r.status}` };
  } catch (err) {
    return { ok: false, status: 0, body: null, error: err?.message || String(err) };
  }
}

/**
 * Best-effort customer upsert. Returns customer_id (uuid) or null.
 * Identifier priority: phone > email > whatsapp_id.
 */
async function ensureCustomer({ phone, email, name }) {
  const e164 = normalizePhone(phone);
  if (!e164 && !email) return null;

  // Try lookup via vert_customer_find_by_identifier RPC.
  // Fall back to direct table read on the identifier table if the RPC isn't present.
  let found = null;
  if (e164) {
    const lookup = await sb(
      'GET',
      `vert_customer_identifier?identifier_type=eq.phone&identifier_value=eq.${encodeURIComponent(e164)}&select=customer_id&limit=1`,
    );
    if (lookup.ok && Array.isArray(lookup.body) && lookup.body.length) {
      found = lookup.body[0].customer_id;
    }
  }
  if (!found && email) {
    const lookup = await sb(
      'GET',
      `vert_customer_identifier?identifier_type=eq.email&identifier_value=eq.${encodeURIComponent(email.toLowerCase())}&select=customer_id&limit=1`,
    );
    if (lookup.ok && Array.isArray(lookup.body) && lookup.body.length) {
      found = lookup.body[0].customer_id;
    }
  }
  if (found) return found;

  // Insert new customer.
  const create = await sb('POST', 'vert_customers', {
    name: name || null,
    language_pref: 'es',
    first_seen_brand: BRANDS.MAIA_BOTANICAS,
  });
  if (!create.ok || !Array.isArray(create.body) || !create.body.length) return null;
  const newId = create.body[0].id;

  // Link identifier(s).
  if (e164) {
    await sb('POST', 'vert_customer_identifier', {
      customer_id: newId,
      identifier_type: 'phone',
      identifier_value: e164,
      verified: false,
    });
  }
  if (email) {
    await sb('POST', 'vert_customer_identifier', {
      customer_id: newId,
      identifier_type: 'email',
      identifier_value: email.toLowerCase(),
      verified: false,
    });
  }
  return newId;
}

/**
 * Canonical write — mirrors the maia-management recordEvent surface.
 * Returns { ok: bool, error?: string, interaction_id?: number }.
 * Never throws.
 */
export async function recordEvent({
  brand = BRANDS.MAIA_BOTANICAS,
  type,
  channel = CHANNELS.WEB_WIDGET,
  customer = null,
  amount_cop = 0,
  source_ref = null,
  metadata = null,
} = {}) {
  try {
    if (!type) return { ok: false, error: 'type_required' };
    if (brand !== BRANDS.MAIA_BOTANICAS) brand = BRANDS.MAIA_BOTANICAS;
    if (!SUPABASE_URL || !SUPABASE_KEY) return { ok: false, error: 'db_unavailable' };

    // Idempotency check via source_ref (best-effort).
    if (source_ref) {
      const dup = await sb(
        'GET',
        `vert_customer_brand_interaction?brand=eq.${brand}&source_ref=eq.${encodeURIComponent(source_ref)}&select=id&limit=1`,
      );
      if (dup.ok && Array.isArray(dup.body) && dup.body.length) {
        return { ok: true, deduped: true, interaction_id: dup.body[0].id };
      }
    }

    let customer_id = null;
    if (customer && (customer.phone || customer.email)) {
      customer_id = await ensureCustomer(customer);
    }
    // Anonymous events (page_view, product_card_click, category_browse,
    // whatsapp_click — most of the public-beacon traffic) have no phone/email
    // and therefore no customer_id. The 2026-06-26 vcbi_nullable_customer_id
    // migration relaxed the NOT NULL constraint so these can land. Insert
    // customer_id=null and persist the brand-level signal.

    const ins = await sb('POST', 'vert_customer_brand_interaction', {
      customer_id,                                // may be null for anon events
      brand,
      channel,
      interaction_type: type,
      ltv_delta_cop: Number.isFinite(amount_cop) ? amount_cop : 0,
      payload: metadata || null,
      source_ref,
      agent_handled: null,
      staff_handled: null,
    });
    if (!ins.ok || !Array.isArray(ins.body) || !ins.body.length) {
      // Surface the real failure reason in Netlify function logs. Previously
      // every failure was swallowed silently and the public endpoint returned
      // 204, so a misconfigured env or schema mismatch was invisible — the
      // "204 black hole" today's E2E test caught.
      console.warn(
        '[botanicas event-bus] insert failed:',
        ins.error || `status_${ins.status}`,
        'brand=' + brand,
        'type=' + type,
        'body=' + (typeof ins.body === 'string' ? ins.body.slice(0, 240) : JSON.stringify(ins.body || {}).slice(0, 240)),
      );
      return { ok: false, error: ins.error || 'insert_failed', status: ins.status };
    }
    return { ok: true, interaction_id: ins.body[0].id, anonymous: customer_id === null };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Fire-and-forget wrapper. Use this from customer-facing surfaces — it
 * never throws and never blocks. Returns the underlying result for logging.
 */
export async function recordEventSafe(args) {
  try {
    const result = await recordEvent(args);
    if (!result?.ok && result?.error && result.error !== 'db_unavailable') {
      // db_unavailable still warrants a warn but the message is shorter — it
      // means Netlify env vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) are
      // not set on this project, not a runtime fault.
      console.warn(
        '[botanicas event-bus] recordEvent failed:',
        result.error,
        'type=' + (args?.type || '?'),
        'brand=' + (args?.brand || BRANDS.MAIA_BOTANICAS),
      );
    } else if (!result?.ok && result?.error === 'db_unavailable') {
      console.warn(
        '[botanicas event-bus] SUPABASE env missing — events not persisted (type=' +
          (args?.type || '?') + ')',
      );
    }
    return result;
  } catch (err) {
    console.warn('[botanicas event-bus] recordEventSafe caught:', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

export default {
  recordEvent,
  recordEventSafe,
  normalizePhone,
  BRANDS,
  CHANNELS,
  EVENTS,
};
