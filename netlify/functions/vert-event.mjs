/**
 * netlify/functions/vert-event.mjs — Maia Botánicas
 *
 * Public POST beacon for browser-side Vert OS events on the Botánicas site.
 * Mirrors the maia-management track-conversion.mjs pattern: fails open,
 * rate-limited, honeypot-protected, never blocks the customer experience.
 *
 *   POST /.netlify/functions/vert-event
 *   body: {
 *     type: 'page_view'|'product_card_click'|'category_browse'|'whatsapp_click'|'form_submission'|'inquiry',
 *     channel?: 'web_widget'|'whatsapp'|'email'|'other',
 *     customer?: { phone?: string, email?: string, name?: string },
 *     source_ref?: string,
 *     metadata?: object,
 *     hp?: string  // honeypot — must be empty
 *   }
 *
 * 2026-06-26 — initial landing, P0 launch-weekend wiring.
 */

import { recordEventSafe, BRANDS, CHANNELS, EVENTS } from './lib/vert/event-bus.mjs';

/* ---------- in-memory rate limit (best-effort, per-container) ---------- */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30; // 30 events per minute per IP
const rateMap = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, reset: now + RATE_WINDOW_MS };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + RATE_WINDOW_MS;
  }
  entry.count += 1;
  rateMap.set(ip, entry);
  // Trim — keep map small.
  if (rateMap.size > 5000) {
    for (const [k, v] of rateMap) {
      if (v.reset < now) rateMap.delete(k);
    }
  }
  return entry.count <= RATE_MAX;
}

const ALLOWED_TYPES = new Set(Object.values(EVENTS));
const ALLOWED_CHANNELS = new Set(Object.values(CHANNELS));

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://maia-botanicas.com',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function noContent() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://maia-botanicas.com',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    },
  });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return noContent();
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }

  const ip =
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  if (!rateLimit(ip)) {
    // Fail open from the client's POV — still return 204 so the page never sees a failure.
    return noContent();
  }

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return json(400, { ok: false, error: 'bad_json' });
  }

  // Honeypot — silently swallow if filled.
  if (body && typeof body.hp === 'string' && body.hp.trim().length > 0) {
    return noContent();
  }

  const type = String(body?.type || '').trim();
  if (!type || !ALLOWED_TYPES.has(type)) {
    return json(400, { ok: false, error: 'invalid_type' });
  }

  const channel = ALLOWED_CHANNELS.has(body?.channel) ? body.channel : CHANNELS.WEB_WIDGET;

  const customer = body?.customer && typeof body.customer === 'object' ? {
    phone: typeof body.customer.phone === 'string' ? body.customer.phone.slice(0, 32) : null,
    email: typeof body.customer.email === 'string' ? body.customer.email.toLowerCase().slice(0, 200) : null,
    name: typeof body.customer.name === 'string' ? body.customer.name.slice(0, 120) : null,
  } : null;

  const source_ref = typeof body?.source_ref === 'string' ? body.source_ref.slice(0, 200) : null;

  // Filter metadata to a tight allowlist of primitive values to avoid abuse.
  let metadata = null;
  if (body?.metadata && typeof body.metadata === 'object') {
    metadata = {};
    let n = 0;
    for (const [k, v] of Object.entries(body.metadata)) {
      if (n >= 20) break;
      if (typeof k !== 'string' || k.length > 60) continue;
      if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
        metadata[k] = typeof v === 'string' ? v.slice(0, 400) : v;
        n += 1;
      }
    }
    // Always include path + lang from request side for context.
    metadata._page = typeof body?.page === 'string' ? body.page.slice(0, 200) : null;
    metadata._lang = typeof body?.lang === 'string' ? body.lang.slice(0, 8) : null;
  }

  // Fire-and-forget. We do not await to keep the beacon fast; we issue the call
  // synchronously here because Netlify will tear down the lambda otherwise.
  await recordEventSafe({
    brand: BRANDS.MAIA_BOTANICAS,
    type,
    channel,
    customer,
    source_ref,
    metadata,
  });

  return noContent();
}

export const config = {
  path: '/.netlify/functions/vert-event',
};
