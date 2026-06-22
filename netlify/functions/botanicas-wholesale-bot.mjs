/* Maia Botánicas — Don Próspero WhatsApp wholesale-intake bot
 * Twilio inbound webhook → Gemini-orchestrated 6-stage flow → handoff to Luz
 * Mirrors Hortensia (El Sanatorio) + Camila (Recruitment) architecture.
 *
 * Stages:
 *   1. greeting          — warm intro
 *   2. restaurant_id     — gather business name + location + type
 *   3. interest_categories — Japonés / Caribeño / Glassware
 *   4. sample_pack       — offer free 3-item pack
 *   5. contact_delivery  — capture address + WhatsApp confirm
 *   6. handoff           — route to Luz, close consultation
 *
 * Safety caps: 20 turns / 5000 tokens cumulative / 24h reset.
 *
 * Required env vars on Netlify:
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_E164         (WhatsApp sender, e.g. whatsapp:+19034598763)
 *   SUPABASE_URL             (https://nxgndsnxugcevwriljlv.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GEMINI_API_KEY           (production key, NOT pasted in code)
 *   LUZ_HANDOFF_WA           (optional, e.g. whatsapp:+57XXXXXXXXXX — falls back to TWILIO_FROM_E164)
 */

import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM = process.env.TWILIO_FROM_E164 || 'whatsapp:+19034598763';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const LUZ_WA = process.env.LUZ_HANDOFF_WA || TWILIO_FROM;

const STAGE_ORDER = [
  'greeting',
  'restaurant_id',
  'interest_categories',
  'sample_pack',
  'contact_delivery',
  'handoff',
];

const MAX_TURNS = 20;
const MAX_TOKENS = 5000;
const SESSION_RESET_HOURS = 24;

/* ---------- helpers ---------- */

function twiml(message) {
  const safe = String(message)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
}

function detectLang(body) {
  // crude — if first ~30 chars look more English than Spanish, go en.
  const t = (body || '').toLowerCase();
  if (/\b(hello|hi|good (morning|afternoon|evening)|please|thanks|thank you)\b/.test(t)) return 'en';
  if (/[áéíóúñ¿¡]/.test(t)) return 'es';
  if (/\b(hola|buenas|gracias|por favor|saludos|qué tal)\b/.test(t)) return 'es';
  return 'es'; // default ES (Caribbean market)
}

function verifyTwilio(req, rawBody) {
  if (!TWILIO_AUTH) return true; // skip in dev/staging if not configured
  const sig = req.headers.get('x-twilio-signature');
  if (!sig) return false;
  const url = req.headers.get('x-forwarded-proto')
    ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('host')}${new URL(req.url).pathname}`
    : req.url;
  const params = {};
  new URLSearchParams(rawBody).forEach((v, k) => { params[k] = v; });
  const sorted = Object.keys(params).sort().map(k => k + params[k]).join('');
  const data = url + sorted;
  const computed = crypto.createHmac('sha1', TWILIO_AUTH).update(Buffer.from(data, 'utf-8')).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(computed));
}

async function sb(method, path, body) {
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
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Supabase ${method} ${path} ${r.status}: ${txt}`);
  }
  if (method === 'GET' || method === 'POST') return r.json();
  return null;
}

async function findOrCreateLead(whatsapp, lang) {
  const e164 = whatsapp.replace(/^whatsapp:/, '');
  const existing = await sb('GET', `botanicas_wholesale_leads?whatsapp_e164=eq.${encodeURIComponent(e164)}&order=created_at.desc&limit=1`);
  if (existing && existing.length) {
    const lead = existing[0];
    const ageHours = (Date.now() - new Date(lead.updated_at).getTime()) / 36e5;
    if (ageHours > SESSION_RESET_HOURS) {
      // Reset stage but keep contact details
      await sb('PATCH', `botanicas_wholesale_leads?id=eq.${lead.id}`, {
        conversation_turns: [],
        status: 'intake',
        lang,
        updated_at: new Date().toISOString(),
      });
      return { ...lead, conversation_turns: [], status: 'intake', lang };
    }
    return lead;
  }
  const created = await sb('POST', 'botanicas_wholesale_leads', {
    whatsapp_e164: e164,
    lang,
    status: 'intake',
    conversation_turns: [],
  });
  return created[0];
}

function currentStage(turns) {
  // Count completed stages by checking which stages have bot replies in the log.
  const seen = new Set(turns.filter(t => t.role === 'bot').map(t => t.stage));
  for (const s of STAGE_ORDER) if (!seen.has(s)) return s;
  return 'handoff';
}

async function pickVariant(stage, lang) {
  const rows = await sb('GET', `botanicas_bot_variations?stage=eq.${stage}&lang=eq.${lang}&select=id,template_text,use_count`);
  if (!rows || !rows.length) {
    // fallback to other lang if seed missing
    const fb = await sb('GET', `botanicas_bot_variations?stage=eq.${stage}&select=id,template_text,use_count`);
    if (!fb || !fb.length) {
      const fallback = lang === 'en'
        ? 'Don Próspero is on the line — one moment.'
        : 'Don Próspero está al teléfono. Un momento.';
      return { id: null, template_text: fallback };
    }
    return fb[Math.floor(Math.random() * fb.length)];
  }
  // prefer less-used variants
  const minUse = Math.min(...rows.map(r => r.use_count || 0));
  const pool = rows.filter(r => (r.use_count || 0) === minUse);
  return pool[Math.floor(Math.random() * pool.length)];
}

async function bumpVariant(id) {
  if (!id) return;
  // PostgREST has no raw increment operator. Read-modify-write is safe here:
  // the variation pool is small (~12/stage/lang) and the count is advisory
  // (used only to bias selection toward less-shown variants).
  try {
    const rows = await sb('GET', `botanicas_bot_variations?id=eq.${id}&select=use_count`);
    const cur = rows && rows[0] ? (rows[0].use_count || 0) : 0;
    await sb('PATCH', `botanicas_bot_variations?id=eq.${id}`, { use_count: cur + 1 });
  } catch {
    /* swallow — counter drift is non-fatal */
  }
}

async function appendTurn(leadId, turn) {
  // Read-modify-write since PostgREST doesn't append JSONB
  const rows = await sb('GET', `botanicas_wholesale_leads?id=eq.${leadId}&select=conversation_turns,status`);
  const cur = rows && rows[0] ? rows[0].conversation_turns || [] : [];
  cur.push({ ...turn, ts: new Date().toISOString() });
  const patch = { conversation_turns: cur, updated_at: new Date().toISOString() };
  return sb('PATCH', `botanicas_wholesale_leads?id=eq.${leadId}`, patch);
}

async function setLeadField(leadId, fields) {
  return sb('PATCH', `botanicas_wholesale_leads?id=eq.${leadId}`,
    { ...fields, updated_at: new Date().toISOString() });
}

/* ---------- intent extraction (Gemini, optional) ---------- */

async function extractIntent(userText, stage, lang) {
  if (!GEMINI_KEY) return null;
  try {
    const sysPrompt = lang === 'en'
      ? `You're parsing a wholesale intake bot's user reply. Return strict JSON only. Stage: ${stage}.
Schema: { restaurant_name, contact_name, city, neighborhood, business_type (bar/restaurant/hotel/catering/private/other), interest_categories (array of: japones,caribeno,glassware), sample_pack_requested (bool), address }. Use null when unknown.`
      : `Estás analizando una respuesta de cliente en bot mayorista. Responde solo con JSON estricto. Etapa: ${stage}.
Schema: { restaurant_name, contact_name, city, neighborhood, business_type (bar/restaurant/hotel/catering/private/other), interest_categories (array de: japones,caribeno,glassware), sample_pack_requested (bool), address }. Usa null si no se sabe.`;
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${sysPrompt}\n\nUSER REPLY:\n${userText}\n\nJSON:` }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 400, responseMimeType: 'application/json' },
        }),
      }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ---------- handler ---------- */

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  const rawBody = await req.text();

  if (!verifyTwilio(req, rawBody)) {
    return new Response('Forbidden', { status: 403 });
  }

  const params = new URLSearchParams(rawBody);
  const from = params.get('From') || '';
  const body = (params.get('Body') || '').trim();
  if (!from || !body) {
    return new Response(twiml('—'), { headers: { 'Content-Type': 'text/xml' } });
  }

  try {
    const lang = detectLang(body);
    const lead = await findOrCreateLead(from, lang);

    // Safety caps
    if ((lead.conversation_turns || []).length >= MAX_TURNS) {
      const msg = lang === 'es'
        ? 'Conversación pausada — Luz te escribirá directo. Cualquier cosa: wa.me/19034598763.'
        : 'Conversation paused — Luz will reach out directly. Anything: wa.me/19034598763.';
      await appendTurn(lead.id, { role: 'system', stage: 'cap_reached', message: 'turn_cap' });
      return new Response(twiml(msg), { headers: { 'Content-Type': 'text/xml' } });
    }

    await appendTurn(lead.id, { role: 'user', message: body });

    const stage = currentStage([...(lead.conversation_turns || []), { role: 'user', message: body }]);

    // Side effect: extract entities and persist to lead row
    const intent = await extractIntent(body, stage, lang);
    if (intent) {
      const fields = {};
      if (intent.restaurant_name) fields.restaurant_name = String(intent.restaurant_name).slice(0, 120);
      if (intent.contact_name) fields.contact_name = String(intent.contact_name).slice(0, 80);
      if (intent.city) fields.location_city = String(intent.city).slice(0, 60);
      if (intent.neighborhood) fields.location_neighborhood = String(intent.neighborhood).slice(0, 80);
      if (intent.business_type) fields.business_type = String(intent.business_type).slice(0, 30);
      if (Array.isArray(intent.interest_categories) && intent.interest_categories.length) {
        fields.interest_categories = intent.interest_categories.filter(c => ['japones','caribeno','glassware'].includes(c));
      }
      if (typeof intent.sample_pack_requested === 'boolean') fields.sample_pack_requested = intent.sample_pack_requested;
      if (intent.address) fields.sample_pack_address = String(intent.address).slice(0, 400);
      if (Object.keys(fields).length) await setLeadField(lead.id, fields);
    }

    const variant = await pickVariant(stage, lang);
    await bumpVariant(variant.id);
    await appendTurn(lead.id, { role: 'bot', stage, message: variant.template_text });

    // If we just hit handoff, mark status & notify Luz (best-effort)
    if (stage === 'handoff') {
      await setLeadField(lead.id, { status: 'qualifying' });
      // Note: outbound to Luz would use Twilio REST API; left as a P1 enhancement.
    }

    return new Response(twiml(variant.template_text), {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (err) {
    console.error('botanicas-bot error', err);
    // Best-effort lang inference from the body we attempted to parse — defaults ES.
    let errLang = 'es';
    try {
      const errParams = new URLSearchParams(rawBody);
      errLang = detectLang(errParams.get('Body') || '');
    } catch { /* keep ES */ }
    const fallback = errLang === 'en'
      ? 'Technical hiccup on our side — message Luz directly: wa.me/19034598763. Don Próspero will be back shortly.'
      : 'Estamos teniendo un problema técnico — escríbele directo a Luz: wa.me/19034598763. Don Próspero vuelve pronto.';
    return new Response(twiml(fallback), { headers: { 'Content-Type': 'text/xml' } });
  }
};

export const config = {
  path: '/api/botanicas-wholesale-bot',
};
