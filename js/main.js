// main.js — globalny skrypt HappyDate

// 🌗 Przełącznik trybu jasny/ciemny z zapisem do localStorage
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

// Zastosuj zapisany motyw przy ładowaniu
const savedTheme = localStorage.getItem('happy_theme');
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark');
  if (themeIcon) themeIcon.textContent = '☀️';
} else {
  document.documentElement.classList.remove('dark');
  if (themeIcon) themeIcon.textContent = '🌙';
}

// Reakcja na kliknięcie
themeToggle?.addEventListener('click', () => {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('happy_theme', isDark ? 'dark' : 'light');
  if (themeIcon) themeIcon.textContent = isDark ? '☀️' : '🌙';
});


// 🌍 Wybór języka i zapis do localStorage
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const lang = btn.dataset.lang;
    localStorage.setItem('happy_lang', lang);
    location.reload();
  });
});

// 🌍 Zastosowanie zapisanej wersji językowej
const savedLang = localStorage.getItem('happy_lang');
if (savedLang) {
  document.documentElement.setAttribute('lang', savedLang);
}

// 🔐 Firebase — status użytkownika
firebase.auth().onAuthStateChanged(user => {
  if (user) {
    // Desktop
    document.getElementById('login-link')?.classList.add('hidden');
    document.getElementById('register-link')?.classList.add('hidden');
    document.getElementById('dashboard-link')?.classList.remove('hidden');
    document.getElementById('logout-btn')?.classList.remove('hidden');

    // Mobile
    document.getElementById('login-link-mobile')?.classList.add('hidden');
    document.getElementById('register-link-mobile')?.classList.add('hidden');
    document.getElementById('dashboard-link-mobile')?.classList.remove('hidden');
    document.getElementById('logout-btn-mobile')?.classList.remove('hidden');
  }
});

// 👋 Wylogowanie
async function handleLogout() {
  await firebase.auth().signOut();
  showNotification("Wylogowano pomyślnie ✅");
  setTimeout(() => location.reload(), 1200);
}

document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
document.getElementById('logout-btn-mobile')?.addEventListener('click', handleLogout);

// 🔔 Powiadomienie (toast)
function showNotification(message, isError = false) {
  const note = document.createElement('div');
  note.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 ' +
    (isError ? 'bg-red-500' : 'bg-green-500') +
    ' text-white px-4 py-2 rounded shadow z-50';
  note.textContent = message;
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 2500);
}

// 🎁 Logo click — redirect based on auth state
document.getElementById('logo-link')?.addEventListener('click', () => {
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      window.location.href = 'dashboard.html';
    } else {
      window.location.href = 'index.html';
    }
  });
});
