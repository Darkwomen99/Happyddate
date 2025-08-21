// /src/js/supabaseClient.js — HappyDate
// Supabase singleton (Vercel-ready, static hosting friendly)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Skąd bierzemy ENV (priorytet):
 * 1) window.ENV.{SUPABASE_URL, SUPABASE_ANON_KEY} — np. z /public/env.js
 * 2) /api/env (Vercel Edge/Serverless) — zwraca JSON z NEXT_PUBLIC_* (bezpieczne publicznie)
 * 3) window.env — legacy
 */
let envPromise = null;

async function fetchEnvFromApi(retries = 2) {
  const url = "/api/env";
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
      if (res.ok) return await res.json();
    } catch (_) { /* retry */ }
    await new Promise(r => setTimeout(r, 250 * (i + 1)));
  }
  return null;
}

async function getEnv() {
  // 1) window.ENV
  if (window.ENV?.SUPABASE_URL && window.ENV?.SUPABASE_ANON_KEY) return window.ENV;

  // 2) window.env (legacy)
  if (window.env?.SUPABASE_URL && window.env?.SUPABASE_ANON_KEY) return window.env;

  // 3) /api/env (z cache'em w envPromise)
  if (!envPromise) {
    envPromise = (async () => {
      const json = await fetchEnvFromApi();
      if (json && (json.SUPABASE_URL || json.NEXT_PUBLIC_SUPABASE_URL)) {
        // Normalizujemy klucze
        const SUPABASE_URL =
          json.SUPABASE_URL || json.NEXT_PUBLIC_SUPABASE_URL || json.url || null;
        const SUPABASE_ANON_KEY =
          json.SUPABASE_ANON_KEY || json.NEXT_PUBLIC_SUPABASE_ANON_KEY || json.anon || null;
        window.ENV = Object.assign({}, window.ENV, { SUPABASE_URL, SUPABASE_ANON_KEY });
      }
      return window.ENV || window.env || {};
    })();
  }
  return envPromise;
}

/** Кидає помилку, якщо значення порожнє (локально ще й alert) */
function must(val, name) {
  if (!val) {
    const msg = `[Supabase] Missing ${name}. Configure Vercel ENV (NEXT_PUBLIC_*) or /public/env.js.`;
    console.error(msg);
    if (typeof window !== "undefined" && location.hostname === "localhost") {
      try { alert(msg); } catch {}
    }
    throw new Error(msg);
  }
  return val;
}

/** Ініціалізація singleton‑клієнта */
async function initClient() {
  if (window.supabase) return window.supabase;

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = await getEnv();
  const url = must(SUPABASE_URL, "SUPABASE_URL");
  const key = must(SUPABASE_ANON_KEY, "SUPABASE_ANON_KEY");

  const client = createClient(url, key, {
    auth: {
      // Persistuje sesję w localStorage; auto-refresh tokenów; rozpoznaje tokeny z URL (email, OAuth)
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: { "x-happydate-client": "web" },
    },
  });

  window.supabase = client;
  return client;
}

// Singleton export (top‑level await)
export const supabase = await initClient();

/* ───────────────────────────── helpers / удобства ───────────────────────────── */

/** Aktualna sesja (lub null) */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

/** Aktualny użytkownik (lub null) */
export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

/**
 * Subskrypcja zmian auth (onAuthStateChange) + natychmiastowe wywołanie z bieżącą sesją
 * @param {(session: import('@supabase/supabase-js').Session|null) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onAuth(cb) {
  getSession().then((s) => { try { cb(s); } catch {} });
  const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
    try { cb(session); } catch {}
  });
  return () => sub.subscription?.unsubscribe?.();
}

/** Zapamiętać/odczytać URL do powrotu po logowaniu */
const REDIR_KEY = "happydate_post_login_redirect";
export function rememberNext(url) {
  try { sessionStorage.setItem(REDIR_KEY, url); } catch {}
}
export function consumeNext() {
  try {
    const v = sessionStorage.getItem(REDIR_KEY);
    if (v) sessionStorage.removeItem(REDIR_KEY);
    return v || null;
  } catch { return null; }
}

/**
 * Вимога логіну: якщо користувача немає — запам’ятовуємо current URL і ведемо на /pages/login.html
 * @param {string} loginPath ścieżka do logowania (domyślnie: /pages/login.html)
 * @returns {Promise<import('@supabase/supabase-js').User|null>}
 */
export async function requireAuth(loginPath = "/pages/login.html") {
  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;
  if (!user) {
    try {
      const next = location.pathname + location.search + location.hash;
      rememberNext(next);
    } catch {}
    location.href = loginPath;
    return null;
  }
  return user;
}

/* ───────────────────────────── auth shortcuts ───────────────────────────── */

/** Email + hasło (login) */
export function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

/** Rejestracja email+hasło (jeśli kiedyś wrócisz do tej ścieżki) */
export function signUp(email, password, meta = {}) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      // Jeśli nie masz osobnej strony callback — zostaw na dashboard albo survey
      emailRedirectTo: location.origin + "/pages/dashboard.html",
      data: Object.assign({ lang: (window.i18n?.getLang?.() || "pl") }, meta),
    },
  });
}

/** Wylogowanie */
export function signOut() {
  return supabase.auth.signOut();
}

/* ───────────────────────────── domain helpers ───────────────────────────── */

/**
 * Upsert profilu użytkownika (wymaga RLS polityk jak w naszej migracji)
 * @param {Partial<{name:string,surname:string,phone:string,birthdate:string,gender:string,preferences:string,photo_url:string,points:number}>} patch
 */
export async function upsertMyProfile(patch) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Brak użytkownika");
  return supabase.from("profiles").upsert({ id: user.id, ...patch });
}

/* Opcjonalnie — helper do Google OAuth (czytelny import w stronach):
export function signInWithGoogle(redirect = "/pages/dashboard.html") {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.origin + redirect },
  });
}
*/
