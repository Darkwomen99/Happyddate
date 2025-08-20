// main.js — globalny skrypt HappyDate (Supabase, bez Firebase)
(() => {
  // ─────────────────────────────────────────
  // USTAWIENIA
  const THEME_KEY = "happy_theme";
  const LANG_KEY  = "lang";          // ujednolicone (migrujemy ze starego 'happy_lang')
  const OLD_LANG_KEY = "happy_lang"; // migration only

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
    note.textContent = message;
    document.body.appendChild(note);
    setTimeout(() => note.remove(), 2500);
  }

  // ─────────────────────────────────────────
  // TEMA: dark/light
  const themeToggle = $("#theme-toggle");
  const themeIcon   = $("#theme-icon");

  function applyTheme(theme) {
    const root = document.documentElement;
    const isDark = theme === "dark";
    root.classList.toggle("dark", isDark);
    if (themeIcon) themeIcon.textContent = isDark ? "☀️" : "🌙";
  }

  // Zastosuj zapisaną/systemową tematykę jak najwcześniej (anty-FOUC)
  (function earlyThemeBoot() {
    try {
      const saved   = localStorage.getItem(THEME_KEY);
      const prefers = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      applyTheme(saved || (prefers ? "dark" : "light"));
    } catch {
      applyTheme("light");
    }
  })();

  function initTheme() {
    // toggle
    themeToggle?.addEventListener("click", () => {
      const isDark = !document.documentElement.classList.contains("dark");
      const next = isDark ? "dark" : "light";
      try { localStorage.setItem(THEME_KEY, next); } catch {}
      applyTheme(next);
    });

    // synchronizacja między kartami
    window.addEventListener("storage", (e) => {
      if (e.key === THEME_KEY && e.newValue) applyTheme(e.newValue);
    });
  }

  // ─────────────────────────────────────────
  // JĘZYK: integracja z i18n (bez reload); migracja happy_lang → lang
  function migrateOldLangKey() {
    try {
      const old = localStorage.getItem(OLD_LANG_KEY);
      if (old && !localStorage.getItem(LANG_KEY)) {
        localStorage.setItem(LANG_KEY, old);
      }
      localStorage.removeItem(OLD_LANG_KEY);
    } catch {}
  }

  function setHtmlLang(lng) {
    document.documentElement.setAttribute("lang", lng || "pl");
    document.documentElement.setAttribute("dir", "ltr"); // wszystkie nasze języki LTR
  }

  async function setLanguage(lng) {
    if (!lng) return;
    // Jeśli masz mój i18n bootstrap (window.i18n), zrobimy to bez przeładowania:
    if (window.i18n?.setLang) {
      await window.i18n.setLang(lng, { persist: true });
      setHtmlLang(window.i18n.getLang());
      return;
    }
    // Fallback: zapis + reload
    try { localStorage.setItem(LANG_KEY, lng); } catch {}
    location.reload();
  }

  function initLanguage() {
    migrateOldLangKey();

    // Ustaw <html lang> na starcie
    const current = (window.i18n?.getLang?.()) || localStorageSafe(LANG_KEY) || (navigator.language || "pl").slice(0,2);
    setHtmlLang(current);

    // Click na przyciskach języka
    $$(".lang-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const lng = btn.dataset.lang;
        if (!lng) return;
        await setLanguage(lng);
      });
    });

    // Aktywny stan przy i18n
    if (window.i18n?.onChange) {
      window.i18n.onChange((lng) => {
        setHtmlLang(lng);
        $$(".lang-btn[data-lang]").forEach(b => {
          const active = b.dataset.lang === lng;
          b.toggleAttribute("aria-current", active);
          b.dataset.state = active ? "active" : "inactive";
        });
      });
    }

    // synchronizacja między kartami
    window.addEventListener("storage", (e) => {
      if (e.key === LANG_KEY && e.newValue) {
        setHtmlLang(e.newValue);
        // jeżeli nie używamy window.i18n, to można tu warunkowo location.reload()
      }
    });
  }

  function localStorageSafe(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  // ─────────────────────────────────────────
  // AUTH (Supabase): aktualizacja linków w nawigacji, logout, logo redirect
  let currentUser = null;

  const els = {
    // Desktop
    login:     $("#login-link"),
    register:  $("#register-link"),
    dashboard: $("#dashboard-link"),
    logout:    $("#logout-btn"),
    // Mobile
    loginM:     $("#login-link-mobile"),
    registerM:  $("#register-link-mobile"),
    dashboardM: $("#dashboard-link-mobile"),
    logoutM:    $("#logout-btn-mobile"),
    logo:       $("#logo-link"),
  };

  function show(el, vis) { el && el.classList.toggle("hidden", !vis); }

  function updateNav(session) {
    const signedIn = !!session?.user;
    currentUser = signedIn ? session.user : null;

    // Desktop
    show(els.login,     !signedIn);
    show(els.register,  !signedIn);
    show(els.dashboard,  signedIn);
    show(els.logout,     signedIn);
    // Mobile
    show(els.loginM,     !signedIn);
    show(els.registerM,  !signedIn);
    show(els.dashboardM,  signedIn);
    show(els.logoutM,     signedIn);
  }

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

  function initAuthBindings() {
    els.logout?.addEventListener("click", handleLogout);
    els.logoutM?.addEventListener("click", handleLogout);

    // Klik logo — przejście wg stanu auth
    els.logo?.addEventListener("click", (e) => {
      e.preventDefault();
      const target = currentUser ? "/pages/dashboard.html" : "/index.html";
      window.location.href = target;
    });

    // Subskrypcja stanu sesji:
    if (window.auth?.onAuth) {
      window.auth.onAuth((session) => updateNav(session));
      return;
    }
    if (window.supabase?.auth) {
      window.supabase.auth.getSession().then(({ data }) => updateNav(data.session));
      window.supabase.auth.onAuthStateChange((_e, session) => updateNav(session));
      return;
    }
    // Brak Supabase — ukryj elementy zależne od auth
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
