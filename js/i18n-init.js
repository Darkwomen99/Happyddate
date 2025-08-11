// js/i18n-init.js
i18next
  .use(i18nextHttpBackend)
  .init({
    lng: localStorage.getItem("lang") || navigator.language.slice(0, 2),
    fallbackLng: "pl",
    backend: {
      loadPath: "/assets/lang/{{lng}}.json"
    }
  }, (err, t) => {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (t(key)) el.innerHTML = t(key);
    });
  });

document.querySelectorAll(".lang-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const lang = btn.getAttribute("data-lang");
    localStorage.setItem("lang", lang);
    location.reload();
  });
});
