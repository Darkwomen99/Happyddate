// /api/gift-ideas.js
export const config = { runtime: 'edge' };

// ----- Helpers -----
const json = (data, { status = 200, headers = {} } = {}, req) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(req),
      ...headers,
    },
  });

function corsHeaders(req) {
  const origin = req.headers.get('origin') || '';
  const allowList = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const allowed =
    allowList.length === 0 // dev: дозволяємо все, якщо список порожній
      ? origin || '*'
      : allowList.includes(origin)
      ? origin
      : allowList[0]; // fallback на перший дозволений домен

  return {
    'Access-Control-Allow-Origin': allowed || '*',
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

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
  // preferences — не обовʼязково, але якщо передано, обріжемо до 200 символів
  const prefs = preferences.slice(0, 200);

  return {
    ok: errors.length === 0,
    errors,
    value: { person, occasion, age, budget, preferences: prefs },
  };
}

// ----- OpenAI call (Chat Completions JSON) -----
async function generateWithOpenAI(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null; // нехай впаде на мок нижче

  const system = [
    'Jesteś asystentem HappyDate w Polsce.',
    'Twoim zadaniem jest zaproponować 3 trafione pomysły na prezent po polsku.',
    'Każdy pomysł musi mieć: "title" (krótki), "desc" (emocjonalny, z sensem i wskazówką użycia),',
    '"price" (liczba całkowita, przybliżony koszt w PLN, nie większy niż budżet).',
    'Uwzględnij: osobę (np. mama), okazję, wiek, budżet i preferencje.',
    'Zwróć WYŁĄCZNIE JSON w formacie: {"ideas":[{"title":"","desc":"","price":0}, ...]}.',
  ].join(' ');

  const user = JSON.stringify(payload);

  const body = {
    model: 'gpt-4o-mini',
    temperature: 0.8,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content || '{}';

  // Захист від «неконсистентного» виводу
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // спроба план Б: інколи модель повертає markdown — приберемо trimmings
    const cleaned = raw.replace(/^```json|```$/g, '').trim();
    parsed = JSON.parse(cleaned);
  }

  const ideas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];
  // Мінімальна нормалізація
  return ideas
    .slice(0, 3)
    .map(i => ({
      title: (i.title || '').toString().slice(0, 80),
      desc: (i.desc || '').toString().slice(0, 280),
      price: Number.isFinite(+i.price) ? Math.max(0, Math.round(+i.price)) : undefined,
    }))
    .filter(i => i.title && i.desc);
}

// ----- Mock (fallback) -----
function mockIdeas({ person, occasion, age, budget, preferences }) {
  const p = preferences ? ` (preferencje: ${preferences})` : '';
  return [
    { title: 'Personalizowany album', desc: `Album dla ${person}${p}`, price: Math.min(budget, 120) || undefined },
    { title: 'Voucher SPA', desc: `Relaks na ${occasion}, dopasowany do budżetu ~${budget} zł`, price: Math.min(budget, 200) || undefined },
    { title: 'Kolacja-niespodzianka', desc: `Kameralna kolacja dostosowana do wieku ${age} i gustu obdarowywanej osoby`, price: Math.min(budget, 180) || undefined },
  ];
}

// ----- Handler -----
export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST, OPTIONS' } }, req);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 }, req);
  }

  const { ok, errors, value } = validatePayload(body);
  if (!ok) {
    return json({ error: 'Invalid fields', fields: errors }, { status: 400 }, req);
  }

  try {
    const ideas = (await generateWithOpenAI(value)) || mockIdeas(value);
    // захист: якщо OpenAI поверне порожньо — дамо мок
    const safeIdeas = ideas?.length ? ideas : mockIdeas(value);
    return json({ ideas: safeIdeas }, {}, req);
  } catch (e) {
    // у випадку збою — повертаємо стабільний мок
    return json(
      { ideas: mockIdeas(value), note: 'fallback' },
      { status: 200, headers: { 'X-Fallback': 'true' } },
      req
    );
  }
}
