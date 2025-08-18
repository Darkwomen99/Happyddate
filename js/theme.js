// theme-toggle.js — HappyDate (dark/light, a11y, sync, no-Flicker)
(() => {
  const KEY = "happy_theme"; // 'dark' | 'light'
  const html = document.documentElement;
  const btn  = document.getElementById("theme-toggle");
  const icon = document.getElementById("theme-icon");
  const mql  = window.matchMedia("(prefers-color-scheme: dark)");

  const t = (key, fallback) => {
    try {
      if (window.i18next) {
        const val = window.i18next.t(key);
        if (val && val !== key) return val;
      }
    } catch {}
    return fallback;
  };

  function getSaved() {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" ? v : null;
  }

  function computeTheme() {
    const saved = getSaved();
    if (saved) return saved;
    return mql.matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    const isDark = theme === "dark";
    html.classList.toggle("dark", isDark);

    if (icon) icon.textContent = isDark ? "☀️" : "🌙";
    if (btn) {
      const label = isDark ? t("ui.theme.light", "Jasny motyw") : t("ui.theme.dark", "Ciemny motyw");
      btn.setAttribute("aria-pressed", String(isDark));
      btn.setAttribute("aria-label", label);
      btn.title = label;
      btn.dataset.state = isDark ? "dark" : "light";
    }
  }

  function setTheme(theme) {
    const next = theme === "dark" ? "dark" : "light";
    localStorage.setItem(KEY, next);
    applyTheme(next);
  }

  // Ініціалізація — застосовуємо тему до отрисовки
  applyTheme(computeTheme());

  // Клік
  btn?.addEventListener("click", () => {
    const next = html.classList.contains("dark") ? "light" : "dark";
    setTheme(next);
  });

  // Клавіатура (Enter/Space)
  btn?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      btn.click();
    }
  });

  // Синхронізація між вкладками
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) applyTheme(computeTheme());
  });

  // Якщо користувач не задав явний вибір — слідуємо за системною темою
  mql.addEventListener?.("change", () => {
    if (!getSaved()) applyTheme(computeTheme());
  });

  // Невеличке API
  window.theme = {
    get: () => (html.classList.contains("dark") ? "dark" : "light"),
    set: (t) => setTheme(t),
    clear: () => { localStorage.removeItem(KEY); applyTheme(computeTheme()); }, // повернутись до системної
  };
})();
