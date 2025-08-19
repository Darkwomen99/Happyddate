// js/cookies.js — HappyDate Cookie Consent (v2)
// Funkcje: kategorie zgód, wersjonowanie, DNT, zdarzenia, odpalanie skryptów po zgodzie,
// API: window.cookieConsent.{get,set,has,open,runWhenConsented,reset}

(() => {
  const CONSENT_VERSION = "2.0.0"; // podbij przy zmianie polityki/zakresu
  const STORAGE_KEY = "happydate_cookie_consent_v2";
  const DEFAULT_EXP_DAYS = 180; // 6 miesięcy

  // Kategorie — "niezbędne" zawsze true (nie można wyłączyć)
  const DEFAULT_CATEGORIES = {
    necessary: true,
    preferences: false,
    analytics: false,
    marketing: false,
  };

  // Elementy (obsługujemy zarówno nowy, jak i stary układ)
  const els = {
    banner: document.querySelector("#cookie-consent-banner") || document.getElementById("cookieConsent"),
    btnAcceptAll: document.querySelector("#cookie-accept-all") || document.getElementById("acceptCookies"),
    btnRejectAll: document.querySelector("#cookie-reject-all"),
    btnManage: document.querySelector("#cookie-manage"),
    modal: document.querySelector("#cookie-modal"),
    btnSave: document.querySelector("#cookie-save-preferences"),
    // checkboxy w modalu: input[type=checkbox][data-cc-category]
    checks: () => Array.from(document.querySelectorAll("input[type=checkbox][data-cc-category]")),
  };

  // Utils
  const now = () => new Date();
  const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  };

  const read = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data;
    } catch {
      return null;
    }
  };

  const isExpired = (consent) => {
    if (!consent?.expiresAt) return true;
    return new Date(consent.expiresAt) < now();
  };

  const write = (categories, options = {}) => {
    const givenAt = now().toISOString();
    const expiresAt = addDays(givenAt, options.days || DEFAULT_EXP_DAYS).toISOString();
    const payload = {
      version: CONSENT_VERSION,
      givenAt,
      expiresAt,
      categories: { ...DEFAULT_CATEGORIES, ...categories, necessary: true },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    dispatchChange(payload);
    enableDeferredScripts(payload); // aktywujemy ewentualne skrypty po zgodzie
    return payload;
  };

  const get = () => {
    const c = read();
    if (!c || c.version !== CONSENT_VERSION || isExpired(c)) return null;
    return c;
  };

  const set = (categories) => write(categories);

  const has = (category) => {
    const c = get();
    return !!c?.categories?.[category];
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    showBanner(true);
  };

  // DNT — jeśli włączone i brak zapisu, predefiniuj wszystko poza "necessary" na false
  const isDNT = () => {
    const dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
    return dnt === "1" || dnt === 1;
  };

  // Zdarzenia dla innych modułów
  const dispatchChange = (consent) => {
    document.dispatchEvent(new CustomEvent("happydate:consentChanged", { detail: consent }));
  };

  // Deferred scripts: <script type="text/plain" data-consent="analytics" data-src="...">
  const enableDeferredScripts = (consent) => {
    const all = Array.from(document.querySelectorAll('script[type="text/plain"][data-consent]'));
    if (!all.length) return;
    const allowed = (cat) => consent?.categories?.[cat];

    all.forEach((node) => {
      const cat = node.getAttribute("data-consent");
      if (!allowed(cat)) return;

      const src = node.getAttribute("data-src");
      const inline = node.textContent?.trim();
      const s = document.createElement("script");
      // skopiuj niektóre atrybuty wspierane
      const attrs = ["async", "defer", "crossorigin", "referrerpolicy", "nonce", "integrity"];
      attrs.forEach((a) => {
        if (node.hasAttribute(a)) s.setAttribute(a, node.getAttribute(a));
      });

      if (src) {
        s.src = src;
      } else if (inline) {
        s.text = inline;
      }
      // unikamy wielokrotnego wstrzyknięcia
      node.type = "text/loaded";
      node.parentNode.insertBefore(s, node.nextSibling);
    });
  };

  // UI helpers
  const hide = (el) => el && el.classList.add("hidden");
  const show = (el, force) => {
    if (!el) return;
    if (force) el.classList.remove("hidden");
    else el.classList.remove("hidden");
  };

  const showBanner = (force = false) => {
    if (!els.banner) return;
    show(els.banner, force);
  };

  const hideBanner = () => hide(els.banner);

  const openModal = () => {
    if (!els.modal) return;
    show(els.modal, true);
    // Ustaw stany checkboxów wg zapisanej (lub domyślnej) zgody
    const current = get() || { categories: DEFAULT_CATEGORIES };
    els.checks().forEach((ch) => {
      const cat = ch.getAttribute("data-cc-category");
      if (cat === "necessary") {
        ch.checked = true;
        ch.disabled = true;
      } else {
        ch.checked = !!current.categories[cat];
      }
    });
    // Focus do modalu
    const focusable = els.modal.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    focusable?.focus?.();
  };

  const closeModal = () => hide(els.modal);

  // Obsługa guzików
  const wireUI = () => {
    if (els.btnAcceptAll) {
      els.btnAcceptAll.addEventListener("click", () => {
        write({ preferences: true, analytics: true, marketing: true });
        hideBanner();
        closeModal();
      });
    }

    if (els.btnRejectAll) {
      els.btnRejectAll.addEventListener("click", () => {
        write({ preferences: false, analytics: false, marketing: false });
        hideBanner();
        closeModal();
      });
    }

    if (els.btnManage) {
      els.btnManage.addEventListener("click", () => {
        openModal();
      });
    }

    if (els.btnSave) {
      els.btnSave.addEventListener("click", () => {
        const selected = els.checks().reduce((acc, ch) => {
          const cat = ch.getAttribute("data-cc-category");
          acc[cat] = !!ch.checked || cat === "necessary";
          return acc;
        }, {});
        write(selected);
        hideBanner();
        closeModal();
      });
    }

    // Zamknięcie modalu klawiszem Esc
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });

    // Klik poza modalem (jeśli tło ma data-cc-backdrop)
    if (els.modal) {
      els.modal.addEventListener("click", (e) => {
        if (e.target?.hasAttribute?.("data-cc-backdrop")) closeModal();
      });
    }
  };

  // Publiczne API
  const api = {
    get,
    set,
    has,
    reset,
    open: openModal,
    runWhenConsented(category, cb) {
      // Wywołaj od razu jeśli już jest zgoda
      if (has(category)) {
        try { cb(); } catch (e) { console.error(e); }
        return;
      }
      // Albo poczekaj na zmianę
      const handler = (e) => {
        if (e?.detail?.categories?.[category]) {
          try { cb(); } catch (err) { console.error(err); }
          document.removeEventListener("happydate:consentChanged", handler);
        }
      };
      document.addEventListener("happydate:consentChanged", handler);
    },
  };

  // Inicjalizacja
  document.addEventListener("DOMContentLoaded", () => {
    wireUI();

    const current = get();
    if (current) {
      // Aktywuj ewentualne odłożone skrypty od razu
      enableDeferredScripts(current);
      hideBanner();
      return;
    }

    // Jeśli DNT i brak zgody — ustaw minimalną zgodę i pokaż tylko przycisk "Zarządzaj" (opcjonalnie)
    if (isDNT()) {
      write({ preferences: false, analytics: false, marketing: false });
      hideBanner(); // nie pokazujemy pełnego banera gdy DNT (możesz zmienić na showBanner())
      return;
    }

    // Brak zgody — pokaż baner
    showBanner(true);
  });

  // Eksport
  window.cookieConsent = api;
})();
