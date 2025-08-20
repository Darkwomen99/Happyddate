// js/i18n-init.js — легкий bootstrap i18n для Vercel (без repoBase)
(() => {
  // ─────────────────────────────────────────────────────────────────────
  // КОНФІГ
  const UI_LANGS   = ["pl", "ua", "en", "ru", "de"];        // кнопки/локаль сайту
  const FALLBACK   = ["pl", "en", "ua", "ru", "de"];        // ланцюжок фолбеків
  const STORAGE_KEY = "lang";

  const ENV = window.ENV || {};
  const BASE_PATH = String(ENV.BASE_PATH || "");            // напр. "" або "/app"
  const VERSION   = String(ENV.APP_VERSION || "1.0.0");
  const LANG_PATH = String(ENV.LANG_PATH || "/src/i18n/{{lng}}.json");

  // Вбудовані бібліотеки (якщо підключені у <script>):
  const hasI18n      = !!window.i18next;
  const hasBackend   = !!window.i18nextHttpBackend;
  const hasDetector  = !!window.i18nextBrowserLanguageDetector;

  // ─────────────────────────────────────────────────────────────────────
  // ДОПОМІЖНІ
  const qs = new URLSearchParams(location.search);
  const queryLang = qs.get("lang");

  // Нормалізація коду мови під твої JSON-файли (ua.json)
  const mapToFileLang = (lng) => {
    const x = String(lng || "").toLowerCase();
    if (x === "uk") return "ua"; // браузерний 'uk' → файл 'ua.json'
    return x;
  };

  // Перевіряємо підтримку в UI (просто для кнопок/атрибутів)
  const isSupportedUI = (lng) => UI_LANGS.includes(mapToFileLang(lng));
  const clampUI = (lng) => (isSupportedUI(lng) ? mapToFileLang(lng) : "pl");

  // Початкова мова:
  const getInitialLang = () => {
    if (queryLang) return clampUI(queryLang);
    try {
      const ls = localStorage.getItem(STORAGE_KEY);
      if (ls) return clampUI(ls);
    } catch {}
    const nav = (navigator.languages?.[0] || navigator.language || "pl").slice(0,2);
    return clampUI(nav);
  };

  const setHtmlLang = (lng) => {
    const normalized = clampUI(lng);
    const html = document.documentElement;
    html.setAttribute("lang", normalized);
    html.setAttribute("dir", "ltr"); // поточні мови — LTR
  };

  const dispatchChanged = (lng) => {
    document.dispatchEvent(new CustomEvent("happydate:langChanged", { detail: { lang: clampUI(lng) } }));
  };

  // Переклад одного елемента за data-атрибутами
  function translateElement(el) {
    if (!(el instanceof Element) || !hasI18n) return;
    const key = el.getAttribute("data-i18n");
    if (!key) return;

    const asHtml = el.hasAttribute("data-i18n-html");
    const value = window.i18next.t(key);
    if (asHtml) el.innerHTML = value;
    else el.textContent = value;

    const attrList = (el.getAttribute("data-i18n-attr") || "")
      .split(",").map(s => s.trim()).filter(Boolean);

    attrList.forEach(attr => {
      const k = el.getAttribute(`data-i18n-${attr}`) || key;
      el.setAttribute(attr, window.i18next.t(k));
    });

    ["title", "placeholder", "aria-label"].forEach(attr => {
      const k = el.getAttribute(`data-i18n-${attr}`);
      if (k) el.setAttribute(attr, window.i18next.t(k));
    });
  }

  function translateAll() {
    if (!hasI18n) return;
    document.querySelectorAll("[data-i18n]").forEach(translateElement);
  }

  // Спостерігач за динамічним DOM
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "data-i18n" && m.target) {
        translateElement(m.target);
      } else if (m.type === "childList") {
        m.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            if (node.hasAttribute?.("data-i18n")) translateElement(node);
            node.querySelectorAll?.("[data-i18n]")?.forEach(translateElement);
          }
        });
      }
    }
  });

  // Підключення кнопок перемикання .lang-btn[data-lang]
  function wireLangButtons(getCurrent) {
    const buttons = document.querySelectorAll(".lang-btn[data-lang]");
    const setActive = (lng) => {
      const norm = clampUI(lng);
      buttons.forEach(btn => {
        const btnLng = clampUI(btn.getAttribute("data-lang"));
        const isActive = btnLng === norm;
        btn.toggleAttribute("aria-current", isActive);
        btn.dataset.state = isActive ? "active" : "inactive";
      });
    };
    setActive(getCurrent());

    buttons.forEach(btn => {
      btn.addEventListener("click", async () => {
        const target = clampUI(btn.getAttribute("data-lang"));
        await setLang(target);
        setActive(target);
      });
    });
  }

  // Уніфікований метод зміни мови:
  async function setLang(lng) {
    const next = clampUI(lng);

    // 1) Якщо є твій фасад мов
    if (window.i18n?.setLang) {
      await window.i18n.setLang(next, { persist: true });
      setHtmlLang(window.i18n.getLang ? window.i18n.getLang() : next);
      return;
    }

    // 2) Стандартний шлях із i18next
    if (!hasI18n) return;
    await window.i18next.changeLanguage(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    setHtmlLang(next);
    translateAll();
    dispatchChanged(next);
  }

  // ─────────────────────────────────────────────────────────────────────
  // СТАРТ
  document.addEventListener("DOMContentLoaded", async () => {
    const initial = getInitialLang();

    // Якщо i18next уже ініціалізований — не ініціалізуємо повторно.
    if (hasI18n && window.i18next.isInitialized) {
      await setLang(window.i18next.language || initial);
      translateAll();
      observer.observe(document.documentElement, {
        subtree: true, childList: true, attributes: true, attributeFilter: ["data-i18n"]
      });
      wireLangButtons(() => window.i18next.language);
      return;
    }

    // Якщо i18next відсутній — м'який фолбек
    if (!hasI18n) {
      console.error("[i18n-init] i18next не підключено. Додай i18next (+ i18nextHttpBackend) у <script>.");
      setHtmlLang(initial);
      try { localStorage.setItem(STORAGE_KEY, initial); } catch {}
      wireLangButtons(() => initial);
      return;
    }

    // Нормальна ініціалізація i18next
    try {
      const chain = window.i18next;
      if (hasBackend) chain.use(window.i18nextHttpBackend);
      if (hasDetector) chain.use(window.i18nextBrowserLanguageDetector);

      await chain.init({
        // Підтримуємо і 'uk' (детекція), і 'ua' (файл)
        supportedLngs: ["pl", "en", "ru", "de", "ua", "uk"],
        nonExplicitSupportedLngs: true,
        fallbackLng: FALLBACK,
        load: "languageOnly",
        returnNull: false,
        detection: hasDetector ? {
          order: ["querystring", "localStorage", "navigator"],
          lookupQuerystring: "lang",
          lookupLocalStorage: STORAGE_KEY,
          caches: [], // керуємо самі
        } : undefined,
        backend: hasBackend ? {
          // Мапимо 'uk' → 'ua' у шляхах завантаження
          loadPath: (lngs) => {
            const lng = Array.isArray(lngs) ? lngs[0] : lngs;
            const fileLng = mapToFileLang(lng);
            const raw = (BASE_PATH + LANG_PATH).replace(/\/{2,}/g, "/");
            return raw.replace("{{lng}}", encodeURIComponent(fileLng)) + `?v=${encodeURIComponent(VERSION)}`;
          },
          requestOptions: { credentials: "same-origin" },
        } : undefined,
        initImmediate: true,
        lng: initial
      });

      // Застосувати переклади
      setHtmlLang(window.i18next.language);
      translateAll();
      observer.observe(document.documentElement, {
        subtree: true, childList: true, attributes: true, attributeFilter: ["data-i18n"]
      });
      wireLangButtons(() => window.i18next.language);

      // Синхронізація з Supabase user_metadata.lang (необов'язково)
      if (window.supabase?.auth) {
        try {
          const { data: { session } } = await window.supabase.auth.getSession();
          const userLng = session?.user?.user_metadata?.lang;
          if (userLng && clampUI(userLng) !== clampUI(window.i18next.language)) {
            await setLang(userLng);
          }
        } catch {}
      }

    } catch (err) {
      console.error("[i18n-init] Помилка ініціалізації:", err);
      setHtmlLang(initial);
      try { localStorage.setItem(STORAGE_KEY, initial); } catch {}
      wireLangButtons(() => initial);
    }
  });
})();
