// /js/supabaseClient.js — HappyDate (Supabase singleton, Vercel-ready)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Pobranie zmiennych środowiskowych:
 * 1) window.ENV.{SUPABASE_URL,SUPABASE_ANON_KEY} (np. z public/env.js)
 * 2) /api/env (fallback; zwraca JSON)
 * 3) window.env (legacy)
 */
let envPromise = null;
async function getEnv() {
  if (window.ENV?.SUPABASE_URL && window.ENV?.SUPABASE_ANON_KEY) return window.ENV;
  if (window.env?.SUPABASE_URL && window.env?.SUPABASE_ANON_KEY) return window.env;

  if (!envPromise) {
    envPromise = (async () => {
      try {
        const res = await fetch("/api/env", { credentials: "same-origin" });
        if (res.ok) {
          const json = await res.json();
          // Zachowaj jako window.ENV dla innych modułów
          window.ENV = Object.assign({}, window.ENV, json);
          return window.ENV;
        }
      } catch (_) { /* cicho ignoruj */ }
      return window.ENV || window.env || {};
    })();
  }
  return envPromise;
}

/** Walidacja obecności wartości ENV */
function assertEnv(val, name) {
  if (!val) console.error(`[Supabase] Brak ${name}. Skonfiguruj ENV na Vercel lub public/env.js.`);
  return val;
}

/**
 * Inicjalizacja singletona supabase:
 * - jeśli window.supabase już istnieje — używamy
 * - inaczej tworzymy nowy klient
 */
async function initClient() {
  if (window.supabase) return window.supabase;

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = await getEnv();
  const url = assertEnv(SUPABASE_URL, "SUPABASE_URL");
  const key = assertEnv(SUPABASE_ANON_KEY, "SUPABASE_ANON_KEY");

  const client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  window.supabase = client;
  return client;
}

// Używamy Top-Level Await, bo to moduł ESM:
export const supabase = await initClient();

/**
 * Zwraca bieżącą sesję
 * @returns {Promise<import('@supabase/supabase-js').Session|null>}
 */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

/**
 * Zwraca bieżącego użytkownika lub null
 * @returns {Promise<import('@supabase/supabase-js').User|null>}
 */
export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

/**
 * Subskrypcja zmian uwierzytelnienia z natychmiastowym wywołaniem.
 * @param {(session: import('@supabase/supabase-js').Session|null) => void} cb
 */
export function onAuth(cb) {
  getSession().then((s) => {
    try { cb(s); } catch {}
  });
  supabase.auth.onAuthStateChange((_e, session) => {
    try { cb(session); } catch {}
  });
}

/**
 * Wymaga zalogowania: gdy brak użytkownika — redirect i zapis "dokąd wrócić"
 * @param {string} redirect Path do strony logowania (domyślnie /login.html)
 * @returns {Promise<import('@supabase/supabase-js').User|null>}
 */
export async function requireAuth(redirect = "/login.html") {
  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;
  if (!user) {
    try {
      const next = location.pathname + location.search + location.hash;
      sessionStorage.setItem("happydate_post_login_redirect", next);
    } catch {}
    location.href = redirect;
    return null;
  }
  return user;
}

/** Wygodne skróty — opcjonalne */
export function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}
export function signUp(email, password, meta = {}) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: location.origin + "/auth/callback.html",
      data: Object.assign({ lang: (window.i18n?.getLang?.() || "pl") }, meta),
    },
  });
}
export function signOut() {
  return supabase.auth.signOut();
}

/**
 * Opcjonalnie: helper do profilu (wymaga RLS polityk dla upsert)
 * @param {Partial<{name:string,surname:string,phone:string,birthdate:string,gender:string,preferences:string,photo_url:string,points:number}>} patch
 */
export async function upsertMyProfile(patch) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Brak użytkownika");
  return supabase.from("profiles").upsert({ id: user.id, ...patch });
}

