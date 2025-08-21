(() => {
  // ─────────────────────────────────────────
  // USTAWIENIA
  const THEME_KEY = "happy_theme";
  const LANG_KEY  = "lang";
  const OLD_LANG_KEY = "happy_lang";

  // ─────────────────────────────────────────
  // HELPERS
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function showNotification(message, isError = false) {
    const note = document.createElement("div");
    note.className = [
      "fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded shadow text-white",
      isError ? "bg-red-500" : "bg-green-500"
    ].join(" ");
    note.setAttribute("role", "status");
    note.setAttribute("aria-live", "polite");
    note.textContent = message;
    document.body.appendChild(note);
    setTimeout(() => note.remove(), 2500);
  }

  const localStorageSafe = (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const setLocalStorageSafe = (key, val) => {
    try { localStorage.setItem(key, val); } catch {}
  };

  // ─────────────────────────────────────────
  // THEME: dark/light
  function applyTheme(theme) {
    const root = document.documentElement;
    const isDark = theme === "dark";
    root.classList.toggle("dark", isDark);

    const themeIconNow = $("#theme-icon");
    if (themeIconNow) themeIconNow.textContent = isDark ? "☀️" : "🌙";
  }

  function getSystemTheme() {
    return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  }

  function getSavedTheme() {
    return localStorageSafe(THEME_KEY);
  }

  function getEffectiveTheme() {
    return getSavedTheme() || getSystemTheme();
  }

  (function earlyThemeBoot() {
    applyTheme(getEffectiveTheme());
  })();

  function initTheme() {
    const themeToggle = $("#theme-toggle");

    themeToggle?.addEventListener("click", () => {
      const isDark = !document.documentElement.classList.contains("dark");
      const next = isDark ? "dark" : "light";
      setLocalStorageSafe(THEME_KEY, next);
      applyTheme(next);
    });

    if (!getSavedTheme() && window.matchMedia) {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = (e) => applyTheme(e.matches ? "dark" : "light");
      if (typeof mql.addEventListener === "function") mql.addEventListener("change", onChange);
      else if (typeof mql.addListener === "function") mql.addListener(onChange);
    }

    window.addEventListener("storage", (e) => {
      if (e.key === THEME_KEY && e.newValue) applyTheme(e.newValue);
    });

    applyTheme(getEffectiveTheme());
  }

  // ─────────────────────────────────────────
  // LANGUAGE
  function migrateOldLangKey() {
    try {
      const old = localStorage.getItem(OLD_LANG_KEY);
      if (old && !localStorage.getItem(LANG_KEY)) {
        localStorage.setItem(LANG_KEY, old);
      }
      localStorage.removeItem(OLD_LANG_KEY);
    } catch {}
  }

  function normalizeLang(lng) {
    return (lng || "pl").slice(0, 2).toLowerCase();
  }

  function setHtmlLang(lng) {
    const norm = normalizeLang(lng);
    document.documentElement.setAttribute("lang", norm);
    document.documentElement.setAttribute("dir", "ltr");
  }

  async function setLanguage(lng) {
    if (!lng) return;
    const target = normalizeLang(lng);

    if (window.i18n?.setLang) {
      await window.i18n.setLang(target, { persist: true });
      setHtmlLang(window.i18n.getLang());
      updateLangButtons(window.i18n.getLang());
      return;
    }

    setLocalStorageSafe(LANG_KEY, target);
    setHtmlLang(target);
    location.reload();
  }

  function updateLangButtons(active) {
    $$(".lang-btn[data-lang]").forEach(b => {
      const isActive = normalizeLang(b.dataset.lang) === normalizeLang(active);
      b.toggleAttribute("aria-current", isActive);
      b.dataset.state = isActive ? "active" : "inactive";
    });
  }

  function initLanguage() {
    migrateOldLangKey();

    const current =
      (window.i18n?.getLang?.()) ||
      localStorageSafe(LANG_KEY) ||
      normalizeLang(navigator.language);

    setHtmlLang(current);
    updateLangButtons(current);

    $$(".lang-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const lng = btn.dataset.lang;
        if (!lng) return;
        await setLanguage(lng);
      });
    });

    if (window.i18n?.onChange) {
      window.i18n.onChange((lng) => {
        setHtmlLang(lng);
        updateLangButtons(lng);
      });
    }

    window.addEventListener("storage", (e) => {
      if (e.key === LANG_KEY && e.newValue) {
        setHtmlLang(e.newValue);
        updateLangButtons(e.newValue);
      }
    });
  }

  // ─────────────────────────────────────────
  // AUTH (Supabase)
  function initAuthBindings() {
    const els = {
      login:     $("#login-link"),
      register:  $("#register-link"),
      dashboard: $("#dashboard-link"),
      logout:    $("#logout-btn"),
      loginM:     $("#login-link-mobile"),
      registerM:  $("#register-link-mobile"),
      dashboardM: $("#dashboard-link-mobile"),
      logoutM:    $("#logout-btn-mobile"),
      logo:       $("#logo-link"),
    };

    const show = (el, vis) => el && el.classList.toggle("hidden", !vis);

    const updateNav = (session) => {
      const signedIn = !!session?.user;

      show(els.login,     !signedIn);
      show(els.register,  !signedIn);
      show(els.dashboard,  signedIn);
      show(els.logout,     signedIn);
      show(els.loginM,     !signedIn);
      show(els.registerM,  !signedIn);
      show(els.dashboardM,  signedIn);
      show(els.logoutM,     signedIn);
    };

    async function handleLogout() {
      try {
        if (window.auth?.signOut) {
          await window.auth.signOut();
        } else if (window.supabase?.auth) {
          await window.supabase.auth.signOut();
        }
        showNotification("Wylogowano pomyślnie ✅");
        setTimeout(() => location.reload(), 900);
      } catch (e) {
        showNotification("Nie udało się wylogować.", true);
        console.error(e);
      }
    }

    els.logout?.addEventListener("click", handleLogout);
    els.logoutM?.addEventListener("click", handleLogout);

    els.logo?.addEventListener("click", (e) => {
      e.preventDefault();
      const target = (window.auth?._session?.user || window.supabase?._initialSession?.user)
        ? "/pages/dashboard.html"
        : "/index.html";
      window.location.href = target;
    });

    if (window.auth?.onAuth) {
      window.auth.onAuth((session) => updateNav(session));
      return;
    }

    if (window.supabase?.auth) {
      window.supabase.auth.getSession().then(({ data }) => updateNav(data.session));
      window.supabase.auth.onAuthStateChange((_e, session) => updateNav(session));
      return;
    }

    updateNav(null);
  }

  // ─────────────────────────────────────────
  // START
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initLanguage();
    initAuthBindings();
  });
})();
