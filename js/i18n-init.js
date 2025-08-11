// js/i18n-init.js

// Обчислюємо базовий префікс для GitHub Pages (напр. "/Prezent")
const repoBase = (() => {
  const parts = location.pathname.split('/').filter(Boolean);
  // Якщо сайт типу username.github.io/REPO/, то перший сегмент — назва репозиторію
  return parts.length > 0 ? `/${parts[0]}` : '';
})();

// Підтримувані мови
const SUPPORTED = ['pl', 'uk', 'en'];

// Визначаємо поточну мову
let lang = (localStorage.getItem('lang') || (navigator.language || 'pl')).slice(0, 2);
if (!SUPPORTED.includes(lang)) lang = 'pl';

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (i18next.exists(key)) {
      el.innerHTML = i18next.t(key);
    }
  });
}

i18next
  .use(i18nextHttpBackend)
  .init({
    lng: lang,
    fallbackLng: 'pl',
    backend: {
      // КЛЮЧОВЕ: без початкового "/" + з урахуванням бази репо
      loadPath: `${repoBase}/assets/lang/{{lng}}.json`
    }
  })
  .then(applyTranslations)
  .catch(console.error);

// Перемикачі мов
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const newLang = btn.getAttribute('data-lang');
    if (!newLang || !SUPPORTED.includes(newLang)) return;
    i18next.changeLanguage(newLang).then(() => {
      localStorage.setItem('lang', newLang);
      applyTranslations(); // без reload
    });
  });
});
