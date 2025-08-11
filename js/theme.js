const toggle = document.getElementById('theme-toggle');
const html = document.documentElement;

toggle?.addEventListener('click', () => {
  html.classList.toggle('dark');
  const icon = document.getElementById('theme-icon');
  icon.textContent = html.classList.contains('dark') ? '☀️' : '🌙';
});
