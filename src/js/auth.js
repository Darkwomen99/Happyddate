// js/auth.js — HappyDate Auth (Supabase v2, production-ready)
(() => {
  const EVENTS = {
    AUTH_CHANGED: "happydate:authChanged",
    AUTH_ERROR: "happydate:authError",
  };

  // --- Pomocnicze: inicjalizacja Supabase, nawet gdy nie masz supabaseClient.js ---
  async function ensureSupabase() {
    if (window.supabase) return window.supabase;

    if (!window.ENV?.SUPABASE_URL || !window.ENV?.SUPABASE_ANON_KEY) {
      console.error("[auth] Brak ENV.SUPABASE_URL/ENV.SUPABASE_ANON_KEY. Upewnij się, że masz env.js.");
      return null;
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    window.supabase = createClient(
      window.ENV.SUPABASE_URL,
      window.ENV.SUPABASE_ANON_KEY,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
    );
    return window.supabase;
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const fire = (name, detail) =>
    document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));

  const getLang = () => (window.i18n?.getLang?.() || localStorage.getItem("lang") || "pl");

  // Prosty feedback UI
  function setFeedback(container, msg, type = "info") {
    if (!container) return;
    container.textContent = msg || "";
    container.dataset.type = type; // możesz wystylować [data-type="error"]
    container.hidden = !msg;
  }

  // Pokaż/ukryj elementy w zależności od stanu zalogowania
  function toggleAuthVisibility(session) {
    const signedIn = !!session?.user;
    $$("[data-auth-visible='signed-in']").forEach(el => (el.hidden = !signedIn));
    $$("[data-auth-visible='signed-out']").forEach(el => (el.hidden = signedIn));
  }

  // Wypełnianie danych użytkownika w UI: [data-auth-bind="email"|"name"|"avatar"]
  function bindUserUI(session) {
    const user = session?.user;
    const email = user?.email || "";
    const name = user?.user_metadata?.full_name || user?.user_metadata?.name || "";
    const avatar =
      user?.user_metadata?.avatar_url ||
      user?.user_metadata?.picture ||
      "";

    $$("[data-auth-bind]").forEach((el) => {
      const key = el.getAttribute("data-auth-bind");
      if (key === "email") el.textContent = email;
      if (key === "name") el.textContent = name || email.split("@")[0] || "";
      if (key === "avatar") {
        if (el.tagName === "IMG") {
          if (avatar) el.setAttribute("src", avatar);
          el.setAttribute("alt", name || email || "avatar");
        } else {
          el.style.backgroundImage = avatar ? `url(${avatar})` : "";
        }
      }
    });
  }

  // Ochrona trasy: <body data-auth-guard="required" data-auth-redirect="/login.html">
  async function routeGuard(supabase) {
    const body = document.body;
    const guard = body?.getAttribute("data-auth-guard");
    if (guard !== "required") return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      const next = location.pathname + location.search + location.hash;
      const redirectTo = body.getAttribute("data-auth-redirect") || "/login.html";
      try { sessionStorage.setItem("happydate_post_login_redirect", next); } catch {}
      location.href = redirectTo;
    }
  }

  // Po zalogowaniu wracamy tam, gdzie użytkownik chciał wejść
  function postLoginRedirect() {
    try {
      const next = sessionStorage.getItem("happydate_post_login_redirect");
      if (next) {
        sessionStorage.removeItem("happydate_post_login_redirect");
        location.href = next;
      }
    } catch {}
  }

  // --- Formularze i guziki (data-API) ---
  function wireForms(supabase) {
    // Logowanie: <form data-auth="sign-in"> z polami [name="email"], [name="password"]
    $$('form[data-auth="sign-in"]').forEach((form) => {
      const fb = form.querySelector("[data-auth-feedback]");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        setFeedback(fb, "Logowanie…", "info");

        const email = form.querySelector('[name="email"]')?.value?.trim();
        const password = form.querySelector('[name="password"]')?.value;

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setFeedback(fb, `Błąd logowania: ${error.message}`, "error");
          fire(EVENTS.AUTH_ERROR, { error });
          return;
        }
        setFeedback(fb, "");
        postLoginRedirect();
        // odśwież lub przejdź dalej
        const next = form.getAttribute("data-auth-next");
        if (next) location.href = next; else location.reload();
      });
    });

    // Rejestracja: <form data-auth="sign-up"> + [name="email"], [name="password"]
    $$('form[data-auth="sign-up"]').forEach((form) => {
      const fb = form.querySelector("[data-auth-feedback]");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        setFeedback(fb, "Zakładanie konta…", "info");

        const email = form.querySelector('[name="email"]')?.value?.trim();
        const password = form.querySelector('[name="password"]')?.value;
        const lang = getLang();

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: location.origin + "/auth/callback.html",
            data: { lang }
          }
        });

        if (error) {
          setFeedback(fb, `Nie udało się utworzyć konta: ${error.message}`, "error");
          fire(EVENTS.AUTH_ERROR, { error });
          return;
        }

        // W Supabase zwykle wymagane jest potwierdzenie maila:
        setFeedback(fb, "Konto utworzone. Sprawdź skrzynkę e-mail i potwierdź rejestrację.", "info");

        // Jeśli projekt ma wyłączone potwierdzenia e-mail — możesz przekierować:
        const next = form.getAttribute("data-auth-next");
        if (data?.user && next) location.href = next;
      });
    });

    // Reset hasła: <form data-auth="reset"> + [name="email"]
    $$('form[data-auth="reset"]').forEach((form) => {
      const fb = form.querySelector("[data-auth-feedback]");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        setFeedback(fb, "Wysyłanie linku resetującego…", "info");

        const email = form.querySelector('[name="email"]')?.value?.trim();
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + "/auth/reset.html"
        });

        if (error) {
          setFeedback(fb, `Nie udało się wysłać wiadomości: ${error.message}`, "error");
          fire(EVENTS.AUTH_ERROR, { error });
          return;
        }
        setFeedback(fb, "Sprawdź e-mail. Wysłaliśmy link do zmiany hasła.", "success");
      });
    });

    // Ustaw nowe hasło na stronie resetu: <form data-auth="update-password"> + [name="password"]
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

    // OAuth: <button data-auth-provider="google"> lub "apple"
    $$("[data-auth-provider]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const provider = btn.getAttribute("data-auth-provider");
        const lang = getLang();
        const callback = btn.getAttribute("data-auth-callback") || "/auth/callback.html";

        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: location.origin + callback,
            queryParams: { ui_locales: lang }
          }
        });

        if (error) {
          fire(EVENTS.AUTH_ERROR, { error });
          alert("Nie udało się rozpocząć logowania: " + error.message);
        }
      });
    });

    // Wylogowanie: <button data-auth="sign-out">
    $$('[data-auth="sign-out"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        await supabase.auth.signOut();
        const next = btn.getAttribute("data-auth-next");
        if (next) location.href = next; else location.reload();
      });
    });
  }

  // --- Publiczne API (window.auth) ---
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
      // natychmiastowe wywołanie z bieżącą sesją + subskrypcja
      ensureSupabase().then(async (supabase) => {
        const { data: { session } } = await supabase.auth.getSession();
        try { cb(session); } catch {}
        supabase.auth.onAuthStateChange((_e, s) => {
          try { cb(s); } catch {}
        });
      });
    },
    async requireAuth(opts = {}) {
      const supabase = await ensureSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        const next = location.pathname + location.search + location.hash;
        try { sessionStorage.setItem("happydate_post_login_redirect", next); } catch {}
        location.href = opts.redirectTo || "/login.html";
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
        options: { emailRedirectTo: location.origin + "/auth/callback.html", data: { lang: getLang(), ...userMeta } }
      });
    },
    async signOut() {
      const supabase = await ensureSupabase();
      return supabase.auth.signOut();
    },
    async sendReset(email) {
      const supabase = await ensureSupabase();
      return supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/auth/reset.html" });
    },
    // Przykładowe uaktualnienie profilu (wymaga polityki INSERT/UPDATE w public.profiles)
    async upsertProfile(partial) {
      const supabase = await ensureSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Brak użytkownika");
      // W SQL dodaj: policy INSERT/UPDATE only own row.
      return supabase.from("profiles").upsert({ id: user.id, ...partial });
    }
  };
  window.auth = api;

  // --- Bootstrapping na załadowanie dokumentu ---
  document.addEventListener("DOMContentLoaded", async () => {
    const supabase = await ensureSupabase();
    if (!supabase) return;

    // Route guard (opcjonalny; aktywny jeśli <body data-auth-guard="required">)
    await routeGuard(supabase);

    // UI wiązania
    wireForms(supabase);

    // Aktualny stan + nasłuch zmian
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
