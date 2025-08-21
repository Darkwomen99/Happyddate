// /api/gift-ideas.js — Edge (Vercel)
// Ulepszona wersja: timeout, lepsze CORS, walidacja, konfigurowalny model, bezpieczna normalizacja JSON

export const config = { runtime: 'edge' };

// ───────────────────────── helpers: CORS / JSON ─────────────────────────
function corsHeaders(req) {
  const origin = req.headers.get('origin') || '';
  const allowList = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const allowed =
    allowList.length === 0        // dev: jeśli lista pusta — echo origin lub * (dla lokalnych testów)
      ? origin || '*'
      : allowList.includes(origin)
      ? origin
      : allowList[0] || '*';      // fallback: pierwszy dozwolony

  return {
    'Access-Control-Allow-Origin': allowed,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400', // 24h dla preflight
  };
}

const baseSecHeaders = {
  'X-Content-Type-Options': 'nosniff',
};

const json = (data, { status = 200, headers = {} } = {}, req) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...baseSecHeaders,
      ...corsHeaders(req),
      ...headers,
    },
  });

// ───────────────────────── helpers: walidacja ─────────────────────────
const isStr = v => typeof v === 'string';
const nonEmpty = v => isStr(v) && v.trim().length > 0;
const toInt = v => Number.isFinite(+v) ? parseInt(v, 10) : NaN;

function validatePayload(body) {
  const errors = [];

  const person = (body?.person ?? '').toString().trim();
  const occasion = (body?.occasion ?? '').toString().trim();
  const preferences = (body?.preferences ?? '').toString().trim();
  const age = toInt(body?.age);
  const budget = toInt(body?.budget);

  if (!nonEmpty(person) || person.length > 64) errors.push('person');
  if (!nonEmpty(occasion) || occasion.length > 64) errors.push('occasion');
  if (!Number.isInteger(age) || age < 0 || age > 120) errors.push('age');
  if (!Number.isInteger(budget) || budget < 0 || budget > 100000) errors.push('budget');

  const prefs = preferences.slice(0, 200); // opcjonalne

  return {
    ok: errors.length === 0,
    errors,
    value: { person, occasion, age, budget, preferences: prefs },
  };
}

// ───────────────────────── OpenAI call ─────────────────────────
async function generateWithOpenAI(payload, signal) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null; // brak klucza — przejdziemy na mock

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const temperature = Number.isFinite(+process.env.OPENAI_TEMPERATURE)
    ? +process.env.OPENAI_TEMPERATURE
    : 0.8;

  const system = [
    'Jesteś asystentem HappyDate w Polsce.',
    'Twoim zadaniem jest zaproponować 3 trafione pomysły na prezent po polsku.',
    'Każdy pomysł musi mieć: "title" (krótki), "desc" (emocjonalny, konkretny), "price" (PLN, całkowita, ≤ budżet).',
    'Uwzględnij osobę (np. mama), okazję, wiek, budżet i preferencje.',
    'Zwróć WYŁĄCZNIE JSON: {"ideas":[{"title":"","desc":"","price":0}, ...]}.',
  ].join(' ');

  const body = {
    model,
    temperature,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(payload) },
    ],
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    // 4xx/5xx — nie podnosimy 500 do klienta, po prostu wrócimy mockiem
    const text = await res.text().catch(() => '');
    console.warn(`[OpenAI] HTTP ${res.status}: ${text.slice(0, 200)}`);
    return null;
  }

  // API chat completions
  const data = await res.json().catch(() => null);
  const raw = data?.choices?.[0]?.message?.content || '{}';

  // Bezpieczne odklejenie "```json ... ```" i podobnych obwolut
  const cleaned = String(raw).replace(/```(?:json)?/g, '').replace(/```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null; // parsowanie się nie powiodło — fallback do mocka
  }

  const ideas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];
  if (!ideas.length) return null;

  // Normalizacja + bezpieczeństwo budżetu
  const b = payload.budget;
  const norm = ideas.slice(0, 3).map(i => {
    const priceRaw = Number.isFinite(+i?.price) ? Math.max(0, Math.round(+i.price)) : undefined;
    const price = Number.isFinite(priceRaw) ? Math.min(priceRaw, b) : undefined;
    return {
      title: (i?.title || '').toString().slice(0, 80),
      desc: (i?.desc || '').toString().slice(0, 400),
      price,
    };
  }).filter(i => i.title && i.desc);

  return norm;
}

// ───────────────────────── Mock (fallback) ─────────────────────────
function mockIdeas({ person, occasion, age, budget, preferences }) {
  const p = preferences ? ` (preferencje: ${preferences})` : '';
  const pick = (n) => Math.min(budget, n) || (Number.isFinite(budget) ? budget : undefined);

  return [
    { title: 'Personalizowany album', desc: `Album dla ${person}${p}`, price: pick(120) },
    { title: 'Voucher SPA', desc: `Relaks na ${occasion}, dopasowany do budżetu ~${budget} zł`, price: pick(200) },
    { title: 'Kolacja-niespodzianka', desc: `Kameralna kolacja dostosowana do wieku ${age} i gustu obdarowywanej osoby`, price: pick(180) },
  ];
}

// ───────────────────────── Handler ─────────────────────────
export default async function handler(req) {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...corsHeaders(req), ...baseSecHeaders } });
  }

  if (req.method !== 'POST') {
    return json(
      { error: 'Method not allowed' },
      { status: 405, headers: { Allow: 'POST, OPTIONS' } },
      req
    );
  }

  // Content-Type check
  const ct = req.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('application/json')) {
    return json({ error: 'Unsupported Media Type, use application/json' }, { status: 415 }, req);
  }

  // Body parsing
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 }, req);
  }

  // Validate
  const { ok, errors, value } = validatePayload(body);
  if (!ok) {
    return json({ error: 'Invalid fields', fields: errors }, { status: 400 }, req);
  }

  // OpenAI with timeout
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12000); // 12s
  let ideas = null;

  try {
    ideas = await generateWithOpenAI(value, controller.signal);
  } catch (e) {
    console.warn('[OpenAI] exception:', e?.message || e);
  } finally {
    clearTimeout(t);
  }

  // Fallback
  const safeIdeas = Array.isArray(ideas) && ideas.length ? ideas : mockIdeas(value);

  return json(
    { ideas: safeIdeas, meta: { fallback: !ideas, model: process.env.OPENAI_MODEL || 'gpt-4o-mini' } },
    { status: 200, headers: ideas ? {} : { 'X-Fallback': 'true' } },
    req
  );
}
