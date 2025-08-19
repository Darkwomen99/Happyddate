// /src/js/supabaseClient.js — HappyDate (Supabase singleton, Vercel-ready)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Джерела ENV у порядку пріоритету:
 * 1) window.ENV.{SUPABASE_URL,SUPABASE_ANON_KEY} (напр. з /public/env.js)
 * 2) /api/env (Vercel Function; повертає JSON)
 * 3) window.env (legacy)
 */
let envPromise = null;
async function getEnv() {
  if (window.ENV?.SUPABASE_URL && window.ENV?.SUPABASE_ANON_KEY) return window.ENV;
  if (window.env?.SUPABASE_URL && window.env?.SUPABASE_ANON_KEY) return window.env;

  if (!envPromise) {
    envPromise = (async () => {
      try {
        const res = await fetch("/api/env", { credentials: "same-origin", cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          window.ENV = Object.assign({}, window.ENV, json);
          return window.ENV;
        }
      } catch (_) {
        // тихо ідемо далі до window.ENV/window.env
      }
      return window.ENV || window.env || {};
    })();
  }
  return envPromise;
}

/** Кидає помилку, якщо значення порожнє */
function must(val, name) {
  if (!val) {
    const msg = `[Supabase] Missing ${name}. Configure Vercel ENV or /public/env.js.`;
    console.error(msg);
    // Підказка девелоперу
    if (typeof window !== "undefined" && location.hostname === "localhost") {
      alert(msg);
    }
    throw new Error(msg);
  }
  return val;
}

/** Ініціалізація singleton-клієнта */
async function initClient() {
  if (window.supabase) return window.supabase;

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = await getEnv();
  const url = must(SUPABASE_URL, "SUPABASE_URL");
  const key = must(SUPABASE_ANON_KEY, "SUPABASE_ANON_KEY");

  const client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: { headers: { "x-happydate-client": "web" } },
  });

  window.supabase = client;
  return client;
}

// Top-Level Await (ESM only)
export const supabase = await initClient();

/** Зручні шорткати */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

/**
 * Auth зміни + відписка
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

/** Зберегти/взяти сторінку-повернення після логіну */
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
 * Вимога логіну: коли немає користувача — редірект і запам’ятовуємо куди повернутися
 * @param {string} redirect шлях до сторінки логіну (дефолт: /pages/login.html)
 */
export async function requireAuth(redirect = "/pages/login.html") {
  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;
  if (!user) {
    try {
      const next = location.pathname + location.search + location.hash;
      rememberNext(next);
    } catch {}
    location.href = redirect;
    return null;
  }
  return user;
}

/** Email/password */
export function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

/** Реєстрація (redirect на dashboard або сторінку-посередник) */
export function signUp(email, password, meta = {}) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      // Якщо немає /pages/auth-callback.html — змініть на /pages/dashboard.html
      emailRedirectTo: location.origin + "/pages/dashboard.html",
      data: Object.assign({ lang: (window.i18n?.getLang?.() || "pl") }, meta),
    },
  });
}

export function signOut() {
  return supabase.auth.signOut();
}

/**
 * Helper для профілю (вимагає RLS політик на upsert)
 * @param {Partial<{name:string,surname:string,phone:string,birthdate:string,gender:string,preferences:string,photo_url:string,points:number}>} patch
 */
export async function upsertMyProfile(patch) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Brak użytkownika");
  return supabase.from("profiles").upsert({ id: user.id, ...patch });
}
