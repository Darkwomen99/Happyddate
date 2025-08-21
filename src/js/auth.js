// /src/js/auth.js — HappyDate Auth (Supabase v2, production‑ready)
(() => {
  const EVENTS = {
    AUTH_CHANGED: "happydate:authChanged",
    AUTH_ERROR: "happydate:authError",
  };

  // ===== Helpers (DOM / i18n / UI) =====
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const fire = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  const getLang = () => (window.i18n?.getLang?.() || localStorage.getItem("lang") || "pl");

  function setFeedback(container, msg, type = "info") {
    if (!container) return;
    container.textContent = msg || "";
    container.dataset.type = type; // стилізуй [data-type="error"] у CSS
    container.hidden = !msg;
  }

  function toggleAuthVisibility(session) {
    const signedIn = !!session?.user;
    $$("[data-auth-visible='signed-in']").forEach(el => (el.hidden = !signedIn));
    $$("[data-auth-visible='signed-out']").forEach(el => (el.hidden = signedIn));
  }

  function bindUserUI(session) {
    const user   = session?.user;
    const email  = user?.email || "";
    const name   = user?.user_metadata?.full_name || user?.user_metadata?.name || email.split("@")[0] || "";
    const avatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "";

    $$("[data-auth-bind]").forEach((el) => {
      const key = el.getAttribute("data-auth-bind");
      if (key === "email") el.textContent = email;
      if (key === "name")  el.textContent = name;
      if (key === "avatar") {
        if (el.tagName === "IMG") {
          el.setAttribute("src", avatar || "/assets/img/default-avatar.png");
          el.setAttribute("alt", name || email || "avatar");
        } else {
          el.style.backgroundImage = avatar ? `url(${avatar})` : "";
        }
      }
    });

    // Хедер‑навігація (якщо є такі елементи)
    const loginLink    = document.getElementById("login-link");
    const registerLink = document.getElementById("register-link");
    const avatarLink   = document.getElementById("user-avatar-link");
    const avatarImg    = document.getElementById("user-avatar");

    if (user) {
      loginLink   ?.classList.add("hidden");
      registerLink?.classList.add("hidden");
      if (avatarLink) {
        avatarImg && (avatarImg.src = avatar || "/assets/img/default-avatar.png");
        avatarLink.classList.remove("hidden");
      }
    } else {
      loginLink   ?.classList.remove("hidden");
      registerLink?.classList.remove("hidden");
      avatarLink  ?.classList.add("hidden");
    }
  }

  // ===== Supabase bootstrap =====
  async function fetchEnvFromApi() {
    try {
      const res = await fetch("/api/env", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      if (res.ok) return await res.json();
    } catch {}
    return null;
  }

  async function ensureSupabase() {
    if (window.supabase) return window.supabase;

    // 1) спробуй спільний клієнт проєкту
    try {
      const mod = await import("/src/js/supabaseClient.js");
      if (mod?.supabase) {
        window.supabase = mod.supabase;
        return window.supabase;
      }
      // якщо модуль експортує createClient + ENV
      if (mod?.createClient && mod?.ENV?.SUPABASE_URL && mod?.ENV?.SUPABASE_ANON_KEY) {
        const { createClient } = mod;
        window.supabase = createClient(mod.ENV.SUPABASE_URL, mod.ENV.SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        return window.supabase;
      }
    } catch (e) {
      console.warn("[auth] /src/js/supabaseClient.js недоступний або помилка:", e);
    }

    // 2) window.ENV або /api/env
    const env = window.ENV || await fetchEnvFromApi();
    if (!env?.SUPABASE_URL || !env?.SUPABASE_ANON_KEY) {
      console.error("[auth] Brak ENV.SUPABASE_URL/ENV.SUPABASE_ANON_KEY. Upewnij się, że masz env.js lub /api/env.");
      return null;
    }

    // 3) створюємо локальний клієнт
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    window.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return window.supabase;
  }

  // ===== Route guard =====
  async function routeGuard(supabase) {
    const body = document.body;
    const guard = body?.getAttribute("data-auth-guard");
    if (guard !== "required") return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      const next = location.pathname + location.search + location.hash;
      const redirectTo = body.getAttribute("data-auth-redirect") || "/pages/login.html";
      try { sessionStorage.setItem("happydate_post_login_redirect", next); } catch {}
      location.href = redirectTo;
    }
  }

  function postLoginRedirect() {
    try {
      const next = sessionStorage.getItem("happydate_post_login_redirect");
      if (next) {
        sessionStorage.removeItem("happydate_post_login_redirect");
        location.href = next;
      }
    } catch {}
  }

  // ===== Підключення форм/кнопок даними‑атрибутами =====
  function wireForms(supabase) {
    // sign-in (email+password)
    $$('form[data-auth="sign-in"]').forEach((form) => {
      const fb = form.querySelector("[data-auth-feedback]");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        setFeedback(fb, "Logowanie…", "info");

        const email    = form.querySelector('[name="email"]')?.value?.trim();
        const password = form.querySelector('[name="password"]')?.value;

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setFeedback(fb, `Błąd logowania: ${error.message}`, "error");
          fire(EVENTS.AUTH_ERROR, { error });
          return;
        }
        setFeedback(fb, "");
        postLoginRedirect();
        const next = form.getAttribute("data-auth-next");
        if (next) location.href = next; else location.reload();
      });
    });

    // sign-up
    $$('form[data-auth="sign-up"]').forEach((form) => {
      const fb = form.querySelector("[data-auth-feedback]");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        setFeedback(fb, "Zakładanie konta…", "info");

        const email    = form.querySelector('[name="email"]')?.value?.trim();
        const password = form.querySelector('[name="password"]')?.value;
        const lang     = getLang();

        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            // після підтвердження пошти користувача поверне сюди
            emailRedirectTo: location.origin + "/pages/profile.html",
            data: { lang }
          }
        });

        if (error) {
          setFeedback(fb, `Nie udało się utworzyć konta: ${error.message}`, "error");
          fire(EVENTS.AUTH_ERROR, { error });
          return;
        }

        setFeedback(fb, "Konto utworzone. Sprawdź e-mail i potwierdź rejestrację.", "info");

        const next = form.getAttribute("data-auth-next");
        if (data?.user && next) location.href = next;
      });
    });

    // reset (send email)
    $$('form[data-auth="reset"]').forEach((form) => {
      const fb = form.querySelector("[data-auth-feedback]");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        setFeedback(fb, "Wysyłanie linku resetującego…", "info");

        const email = form.querySelector('[name="email"]')?.value?.trim();
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + "/pages/reset-password.html"
        });

        if (error) {
          setFeedback(fb, `Nie udało się wysłać wiadomości: ${error.message}`, "error");
          fire(EVENTS.AUTH_ERROR, { error });
          return;
        }
        setFeedback(fb, "Sprawdź e-mail. Wysłaliśmy link do zmiany hasła.", "success");
      });
    });

    // update password (after reset link)
    $$('form[data-auth="update-password"]').forEach((form) => {
      const fb = form.querySelector("[data-auth-feedback]");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        setFeedback(fb, "Aktualizowanie hasła…", "info");
        const password = form.querySelector('[name="password"]')?.value;

        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          setFeedback(fb, `Błąd: ${error.message}`, "error");
          fire(EVENTS.AUTH_ERROR, { error });
          return;
        }
        setFeedback(fb, "Hasło zaktualizowane. Możesz się zalogować.", "success");
        const next = form.getAttribute("data-auth-next");
        if (next) location.href = next;
      });
    });

    // OAuth: <button data-auth-provider="google">, <button data-auth-provider="apple">
    $$("[data-auth-provider]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const provider = btn.getAttribute("data-auth-provider");
        const lang     = getLang();
        // куди повернути користувача після успіху
        const after    = btn.getAttribute("data-auth-callback") || "/pages/profile.html";

        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: location.origin + after,
            // локаль для екранів Google, якщо підтримується
            queryParams: { ui_locales: lang }
          }
        });

        if (error) {
          fire(EVENTS.AUTH_ERROR, { error });
          // без alert — не блокуємо UX; відобрази свій toast, якщо потрібно
          console.error("[auth] OAuth start error:", error);
        }
      });
    });

    // sign-out
    $$('[data-auth="sign-out"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        await supabase.auth.signOut();
        const next = btn.getAttribute("data-auth-next");
        if (next) location.href = next; else location.reload();
      });
    });
  }

  // ===== Public API =====
  const api = {
    async getSession() {
      const supabase = await ensureSupabase();
      return supabase?.auth.getSession();
    },
    async getUser() {
      const supabase = await ensureSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      return user || null;
    },
    onAuth(cb) {
      ensureSupabase().then(async (supabase) => {
        const { data: { session } } = await supabase.auth.getSession();
        try { cb(session); } catch {}
        supabase.auth.onAuthStateChange((_e, s) => { try { cb(s); } catch {} });
      });
    },
    async requireAuth(opts = {}) {
      const supabase = await ensureSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        const next = location.pathname + location.search + location.hash;
        try { sessionStorage.setItem("happydate_post_login_redirect", next); } catch {}
        location.href = opts.redirectTo || "/pages/login.html";
        return null;
      }
      return session.user;
    },
    async signIn(email, password) {
      const supabase = await ensureSupabase();
      return supabase.auth.signInWithPassword({ email, password });
    },
    async signUp(email, password, userMeta = {}) {
      const supabase = await ensureSupabase();
      return supabase.auth.signUp({
        email, password,
        options: {
          emailRedirectTo: location.origin + "/pages/profile.html",
          data: { lang: getLang(), ...userMeta }
        }
      });
    },
    async signOut() {
      const supabase = await ensureSupabase();
      return supabase.auth.signOut();
    },
    async sendReset(email) {
      const supabase = await ensureSupabase();
      return supabase.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + "/pages/reset-password.html"
      });
    },
    async upsertProfile(partial) {
      const supabase = await ensureSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Brak użytkownika");
      return supabase.from("profiles").upsert({ id: user.id, ...partial });
    }
  };
  window.auth = api;

  // ===== Bootstrapping =====
  document.addEventListener("DOMContentLoaded", async () => {
    const supabase = await ensureSupabase();
    if (!supabase) return;

    await routeGuard(supabase);
    wireForms(supabase);

    supabase.auth.getSession().then(({ data }) => {
      toggleAuthVisibility(data.session);
      bindUserUI(data.session);
      fire(EVENTS.AUTH_CHANGED, { session: data.session });
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      toggleAuthVisibility(session);
      bindUserUI(session);
      fire(EVENTS.AUTH_CHANGED, { session });
    });
  });
})();
