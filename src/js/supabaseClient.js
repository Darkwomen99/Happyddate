// /src/js/supabaseClient.js — HappyDate
// Supabase singleton (Vercel-ready, static hosting friendly)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Джерела ENV (пріоритет):
 * 1) window.ENV.{SUPABASE_URL, SUPABASE_ANON_KEY} — напр. із /public/env.js
 * 2) window.env.{SUPABASE_URL, SUPABASE_ANON_KEY} — legacy
 * 3) window.SUPABASE_URL / window.SUPABASE_ANON_KEY — глобальні (деякі сторінки так роблять)
 * 4) /api/env (Vercel Edge/Serverless) — повертає JSON з NEXT_PUBLIC_* (публічні)
 */
let envPromise = null;

async function fetchEnvFromApi(retries = 2) {
  const url = "/api/env";
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Accept": "application/json" },
      });
      if (res.ok) return await res.json();
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  return null;
}

async function getEnv() {
  // 1) window.ENV
  if (globalThis.window?.ENV?.SUPABASE_URL && globalThis.window?.ENV?.SUPABASE_ANON_KEY) {
    return globalThis.window.ENV;
  }
  // 2) window.env (legacy)
  if (globalThis.window?.env?.SUPABASE_URL && globalThis.window?.env?.SUPABASE_ANON_KEY) {
    return globalThis.window.env;
  }
  // 3) Глобальні змінні (деякі сторінки так задають)
  if (globalThis.window?.SUPABASE_URL && globalThis.window?.SUPABASE_ANON_KEY) {
    return {
      SUPABASE_URL: globalThis.window.SUPABASE_URL,
      SUPABASE_ANON_KEY: globalThis.window.SUPABASE_ANON_KEY,
    };
  }
  // 4) /api/env (кешуємо в envPromise)
  if (!envPromise) {
    envPromise = (async () => {
      const json = await fetchEnvFromApi();
      if (json && (json.SUPABASE_URL || json.NEXT_PUBLIC_SUPABASE_URL)) {
        // Нормалізація ключів
        const SUPABASE_URL =
          json.SUPABASE_URL || json.NEXT_PUBLIC_SUPABASE_URL || json.url || null;
        const SUPABASE_ANON_KEY =
          json.SUPABASE_ANON_KEY || json.NEXT_PUBLIC_SUPABASE_ANON_KEY || json.anon || null;
        globalThis.window = globalThis.window || {};
        globalThis.window.ENV = Object.assign({}, globalThis.window.ENV, {
          SUPABASE_URL,
          SUPABASE_ANON_KEY,
        });
      }
      return globalThis.window?.ENV || globalThis.window?.env || {};
    })();
  }
  return envPromise;
}

/** Кидає помилку, якщо значення порожнє (локально ще й alert) */
function must(val, name) {
  if (!val) {
    const msg = `[Supabase] Missing ${name}. Налаштуй ENV у Vercel (NEXT_PUBLIC_*) або /public/env.js.`;
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
  // Якщо вже є КЛІЄНТ (а не UMD-неймспейс), використовуємо його
  const maybe = globalThis.window?.supabase;
  const isClient = !!(maybe && typeof maybe === 'object' && maybe.auth && typeof maybe.auth.getSession === 'function');
  if (isClient) return maybe;

  // 1) Витягуємо ENV
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = await getEnv();
  const url = must(SUPABASE_URL, "SUPABASE_URL");
  const key = must(SUPABASE_ANON_KEY, "SUPABASE_ANON_KEY");

  // 2) Визначаємо, чим створювати клієнт:
  //    - якщо на сторінці вже підключено UMD, то там є window.supabase.createClient
  //    - інакше — беремо ESM createClient з імпорту
  const create = (globalThis.window?.supabase && typeof globalThis.window.supabase.createClient === 'function')
    ? globalThis.window.supabase.createClient
    : createClient;

  const client = create(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { headers: { "x-happydate-client": "web" } },
  });

  // Зберігаємо саме клієнт у window
  try { globalThis.window.supabase = client; } catch {}

  return client;
}



// Singleton export (top‑level await доступний в ES-модулях)
export const supabase = await initClient();

/* ───────────────────────────── helpers ───────────────────────────── */

/** Поточна сесія (або null) */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

/** Поточний користувач (або null) */
export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

/**
 * Підписка на зміни auth (onAuthStateChange) + миттєвий виклик з поточною сесією
 * @param {(session: import('@supabase/supabase-js').Session|null) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onAuth(cb) {
  getSession().then((s) => { try { cb(s); } catch {} });
  const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
    try { cb(session); } catch {}
  });
  return () => sub?.subscription?.unsubscribe?.();
}

/** Запам’ятати/прочитати URL для повернення після логіну */
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
 * Вимога логіну: якщо користувача немає — зберігаємо current URL і ведемо на /pages/login.html
 * @param {string} loginPath шлях до логіну (за замовч.: /pages/login.html)
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

/** Вхід email+пароль */
export function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

/** Реєстрація email+пароль */
export function signUp(email, password, meta = {}) {
  // Якщо не маєш окремого callback — лишаємо редірект на дашборд (працює і для email‑link)
  const redirect = (typeof location !== "undefined" ? location.origin : "") + "/pages/dashboard.html";
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirect,
      data: Object.assign({ lang: (globalThis.window?.i18n?.getLang?.() || "pl") }, meta),
    },
  });
}

/** Вхід через OAuth (Google тощо) */
export function signInWithOAuth(provider = "google", redirect = "/pages/dashboard.html") {
  const redirectTo = (typeof location !== "undefined" ? location.origin : "") + redirect;
  return supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });
}

/** Вихід */
export function signOut() {
  return supabase.auth.signOut();
}

/* ───────────────────────────── domain helpers ───────────────────────────── */

/**
 * Upsert профілю користувача (вимагає RLS політик, як у міграції)
 * @param {Partial<{name:string,surname:string,phone:string,birthdate:string,gender:string,preferences:string,photo_url:string,points:number,email:string}>} patch
 */
export async function upsertMyProfile(patch) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Brak użytkownika / Користувач не авторизований");
  // Гарантуємо id та email (якщо є)
  const row = Object.assign({ id: user.id }, patch);
  if (!row.email && user.email) row.email = user.email;
  return supabase.from("profiles").upsert(row, { onConflict: "id" });
}

/**
 * Простий helper: чи користувач залогінений (без редіректу)
 * @returns {Promise<boolean>}
 */
export async function isLoggedIn() {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session?.user;
}
