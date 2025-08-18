// js/i18n-init.js — lekki bootstrap i18n dla Vercel (bez GitHub Pages repoBase)

(() => {
  const SUPPORTED = ["pl", "uk", "en", "ru"];             // wspierane języki
  const FALLBACK = ["pl", "en", "uk", "ru"];              // łańcuch fallbacków
  const STORAGE_KEY = "lang";
  const BASE_PATH = (window.ENV?.BASE_PATH || "");        // np. "" lub "/app"
  const VERSION   = (window.ENV?.APP_VERSION || "1.0.0"); // do bustowania cache plików json

  const hasI18n = !!window.i18next;
  const hasBackend = !!window.i18nextHttpBackend;
  const hasDetector = !!window.i18nextBrowserLanguageDetector;

  const qs = new URLSearchParams(location.search);
  const byQuery = qs.get("lang");

  const isSupported = (lng) => SUPPORTED.includes(String(lng || "").toLowerCase());
  const clamp = (lng) => (isSupported(lng) ? lng : "pl");

  const getInitialLang = () => {
    if (byQuery) return clamp(byQuery);
    const ls = localStorage.getItem(STORAGE_KEY);
    if (ls) return clamp(ls);
    const nav = (navigator.languages?.[0] || navigator.language || "pl").slice(0, 2);
    return clamp(nav);
  };

  const setHtmlLang = (lng) => {
    const html = document.documentElement;
    html.setAttribute("lang", lng);
    html.setAttribute("dir", "ltr"); // wszystkie obecne języki są LTR
  };

  const dispatchChanged = (lng) => {
    document.dispatchEvent(new CustomEvent("happydate:langChanged", { detail: { lang: lng } }));
  };

  // ——— tłumaczenie elementu: data-i18n, data-i18n-attr, skróty (title/placeholder/aria-label)
  function translateElement(el) {
    if (!(el instanceof Element)) return;
    const key = el.getAttribute("data-i18n");
    if (!key || !hasI18n) return;

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

  // dynamiczny DOM
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

  // ——— przełączniki .lang-btn[data-lang]
  function wireLangButtons(getCurrent) {
    const buttons = document.querySelectorAll(".lang-btn[data-lang]");
    const setActive = (lng) => {
      buttons.forEach(btn => {
        const isActive = btn.getAttribute("data-lang") === lng;
        btn.toggleAttribute("aria-current", isActive);
        btn.dataset.state = isActive ? "active" : "inactive";
      });
    };
    setActive(getCurrent());

    buttons.forEach(btn => {
      btn.addEventListener("click", async () => {
        const target = clamp(btn.getAttribute("data-lang"));
        await setLang(target);
        setActive(target);
      });
    });
  }

  // ——— zmiana języka: preferujemy window.i18n.setLang (z mojego lang.js),
  // w przeciwnym razie używamy i18next.changeLanguage
  async function setLang(lng) {
    const next = clamp(lng);
    if (window.i18n?.setLang) {
      await window.i18n.setLang(next, { persist: true }); // to też wywoła tłumaczenia
      // window.i18n już wyśle event — na wszelki wypadek ujednolicamy stan:
      setHtmlLang(next);
      return;
    }
    if (!hasI18n) return;
    await window.i18next.changeLanguage(next);
    localStorage.setItem(STORAGE_KEY, next);
    setHtmlLang(next);
    translateAll();
    dispatchChanged(next);
  }

  // ——— start
  document.addEventListener("DOMContentLoaded", async () => {
    const initial = getInitialLang();

    // 1) Jeśli i18next już zainicjalizowany (np. przez js/lang.js) — nie inicjuj drugi raz:
    if (hasI18n && window.i18next.isInitialized) {
      // tylko zastosuj tłumaczenia + guziki
      await setLang(window.i18next.language || initial);
      translateAll();
      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-i18n"] });
      wireLangButtons(() => window.i18next.language);
      return;
    }

    // 2) Jeśli brak i18next — nie ma czego robić
    if (!hasI18n) {
      console.error("[i18n-init] Brak i18next. Dołącz i18next (oraz i18nextHttpBackend) w <script>.");
      return;
    }

    // 3) Inicjalizacja i18next (lekka) — tylko jeśli nie zainicjalizowano wcześniej
    try {
      const chain = window.i18next;
      if (hasBackend) chain.use(window.i18nextHttpBackend);
      if (hasDetector) chain.use(window.i18nextBrowserLanguageDetector);

      await chain.init({
        supportedLngs: SUPPORTED,
        nonExplicitSupportedLngs: true,
        fallbackLng: FALLBACK,
        load: "languageOnly",
        returnNull: false,
        detection: hasDetector ? {
          order: ["querystring", "localStorage", "navigator"],
          lookupQuerystring: "lang",
          lookupLocalStorage: STORAGE_KEY,
          caches: [], // sami zapisujemy
        } : undefined,
        backend: hasBackend ? {
          loadPath: `${BASE_PATH}/assets/lang/{{lng}}.json?v=${encodeURIComponent(VERSION)}`,
          requestOptions: { credentials: "same-origin" },
        } : undefined,
        initImmediate: true,
        lng: initial, // startowy język
      });

      // zastosuj tłumaczenia i włącz obserwatora + guziki
      setHtmlLang(window.i18next.language);
      translateAll();
      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-i18n"] });
      wireLangButtons(() => window.i18next.language);

      // synchronizacja z Supabase meta.lang (jeśli masz supabase i użytkownik jest zalogowany)
      if (window.supabase?.auth) {
        try {
          const { data: { session } } = await window.supabase.auth.getSession();
          const userLng = session?.user?.user_metadata?.lang;
          if (isSupported(userLng) && userLng !== window.i18next.language) {
            await setLang(userLng);
          }
        } catch { /* cicho ignoruj */ }
      }

    } catch (err) {
      console.error("[i18n-init] Init error:", err);
    }
  });
})();
