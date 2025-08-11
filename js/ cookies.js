// js/cookies.js
document.addEventListener("DOMContentLoaded", () => {
  const cookieConsent = document.getElementById('cookieConsent');
  const acceptBtn = document.getElementById('acceptCookies');

  if (!localStorage.getItem('happydate_cookie_consent')) {
    cookieConsent.classList.remove('hidden');
  }

  acceptBtn.addEventListener('click', () => {
    localStorage.setItem('happydate_cookie_consent', 'true');
    cookieConsent.classList.add('hidden');
  });
});
