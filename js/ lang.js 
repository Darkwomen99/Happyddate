// js/lang.js — HappyDate i18n (v2, bez przeładowań, z Supabase opcjonalnie)
(() => {
  const SUPPORTED = ["pl", "en", "uk", "ru"];
  const FALLBACK = ["pl", "en", "uk", "ru"]; // kolejność fallbacków
  const STORAGE_KEY = "lang";                // klucz w localStorage
  const VERSION = (window.ENV?.APP_VERSION || "1.0.0"); // do bustowania cache plików json

  // --- Walidacja dostępności bibliotek ---
  if (!window.i18next || !window.i18nextHttpBackend || !window.i18nextBrowserLanguageDetector) {
    console.error("[i18n] Brak i18next lub pluginów. Upewnij się, że załadowałeś biblioteki.");
    return;
  }

  // --- Utils ---
  const qs = new URLSearchParams(location.search);
  const byQuery = qs.get("lang");
  const isSupported = (lng) => SUPPORTED.includes(String(lng || "").toLowerCase());
  const clamp = (lng) => (isSupported(lng) ? lng : "pl");

  const setHtmlLang = (lng) => {
    const html = document.documentElement;
    html.setAttribute("lang", lng);
    html.setAttribute("dir", "ltr"); // nasze języki są LTR; zmień jeśli dodasz RTL
  };

  const dispatchLangChanged = (lng) => {
    document.dispatchEvent(new CustomEvent("happydate:langChanged", { detail: { lang: lng } }));
  };

  // Tłumaczenie pojedynczego elementu:
  // - data-i18n="key.path"
  // - data-i18n-html (wtedy innerHTML; bezpieczniej używać textContent!)
  // - data-i18n-attr="placeholder,title,aria-label" (atrybuty dostają ten sam klucz)
  // - lub precyzyjnie: data-i18n-placeholder="key.other", data-i18n-title="..."
  const translateElement = (el) => {
    if (!(el instanceof Element)) return;
    const key = el.getAttribute("data-i18n");
    if (!key) return;

    // Tekst/HTML
    const asHtml = el.hasAttribute("data-i18n-html");
    const value = i18next.t(key);
    if (asHtml) el.innerHTML = value;
    else el.textContent = value;

    // Atrybuty
    const attrList = (el.getAttribute("data-i18n-attr") || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    // Dla każdego atrybutu: użyj dedykowanego klucza z data-i18n-<attr> lub podstawowego 'key'
    attrList.forEach(attr => {
      const dataKey = el.getAttribute(`data-i18n-${attr}`);
      const attrValue = i18next.t(dataKey || key);
      el.setAttribute(attr, attrValue);
    });

    // Dodatkowe skróty dla najczęstszych atrybutów
    ["title", "placeholder", "aria-label"].forEach(attr => {
      const dataKey = el.getAttribute(`data-i18n-${attr}`);
      if (dataKey) el.setAttribute(attr, i18next.t(dataKey));
    });
  };

  const translateAll = () => {
    document.querySelectorAll("[data-i18n]").forEach(translateElement);
  };

  // Obserwator dla dynamicznego DOM
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

  // Przełącznik języka dla .lang-btn[data-lang]
  const wireLangButtons = () => {
    const buttons = document.querySelectorAll(".lang-btn[data-lang]");
    const setActive = (lng) => {
      buttons.forEach(btn => {
        const isActive = btn.getAttribute("data-lang") === lng;
        btn.toggleAttribute("aria-current", isActive);
        btn.dataset.state = isActive ? "active" : "inactive";
      });
    };

    buttons.forEach(btn => {
      btn.addEventListener("click", async () => {
        const lng = clamp(btn.getAttribute("data-lang"));
        await changeLanguage(lng, { persist: true, syncSupabase: true });
        setActive(lng);
      });
    });

    setActive(i18next.language);
  };

  // Zmiana języka (opcjonalnie zapis w localStorage i Supabase)
  async function changeLanguage(lng, { persist = true, syncSupabase = false } = {}) {
    const next = clamp(lng);
    await i18next.changeLanguage(next);
    setHtmlLang(next);
    translateAll();
    persist && localStorage.setItem(STORAGE_KEY, next);
    dispatchLangChanged(next);

    if (syncSupabase && window.supabase?.auth) {
      try {
        const { data: { session } } = await window.supabase.auth.getSession();
        if (session?.user) {
          // zapis w user_metadata, bez potrzeby migracji schematu
          await window.supabase.auth.updateUser({ data: { lang: next } });
        }
      } catch (e) {
        console.warn("[i18n] Nie udało się zapisać preferencji języka w Supabase:", e?.message || e);
      }
    }
  }

  // Inicjalizacja i18next
  i18next
    .use(i18nextHttpBackend)
    .use(i18nextBrowserLanguageDetector)
    .init({
      supportedLngs: SUPPORTED,
      nonExplicitSupportedLngs: true,
      fallbackLng: FALLBACK,
      load: "languageOnly",
      returnNull: false,
      // Detekcja: query (?lang=), localStorage('lang'), navigator
      detection: {
        order: ["querystring", "localStorage", "navigator"],
        lookupQuerystring: "lang",
        lookupLocalStorage: STORAGE_KEY,
        caches: [], // sami zapisujemy w localStorage
      },
      backend: {
        loadPath: `/assets/lang/{{lng}}.json?v=${encodeURIComponent(VERSION)}`,
        requestOptions: { credentials: "same-origin" },
      },
      interpolation: {
        escapeValue: false, // używamy bezpośrednio; dbaj o bezpieczeństwo gdy wstawiasz HTML
      },
      initImmediate: true,
    }, async (err) => {
      if (err) console.error("[i18n] Init error:", err);

      // Ustal język startowy: query > localStorage > navigator
      const initial =
        (byQuery && clamp(byQuery)) ||
        clamp(localStorage.getItem(STORAGE_KEY)) ||
        clamp((navigator.languages || [navigator.language || "pl"])[0]?.slice(0, 2));

      await changeLanguage(initial, { persist: false });

      // Supabase: jeśli zalogowany i ma meta.lang — nadpisz
      if (window.supabase?.auth) {
        try {
          const { data: { session } } = await window.supabase.auth.getSession();
          const userLng = session?.user?.user_metadata?.lang;
          if (isSupported(userLng) && userLng !== i18next.language) {
            await changeLanguage(userLng, { persist: true });
          }
        } catch (e) {
          // cicho ignoruj
        }
      }

      // Start obserwatora i podpięcie przycisków
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-i18n"],
      });
      translateAll();
      setHtmlLang(i18next.language);
      wireLangButtons();
    });

  // Upublicznione API
  window.i18n = {
    t: (k, opts) => i18next.t(k, opts),
    getLang: () => i18next.language,
    setLang: (lng, opts) => changeLanguage(lng, { persist: true, syncSupabase: true, ...(opts || {}) }),
    onChange: (cb) => document.addEventListener("happydate:langChanged", (e) => cb?.(e.detail.lang)),
  };
})();
