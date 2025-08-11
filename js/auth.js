// js/auth.js
firebase.auth().onAuthStateChanged(user => {
  const authEls = {
    login: document.getElementById('login-link'),
    register: document.getElementById('register-link'),
    dashboard: document.getElementById('dashboard-link'),
    logout: document.getElementById('logout-btn'),
    loginM: document.getElementById('login-link-mobile'),
    registerM: document.getElementById('register-link-mobile'),
    dashboardM: document.getElementById('dashboard-link-mobile'),
    logoutM: document.getElementById('logout-btn-mobile')
  };

  if (user) {
    ['login', 'register', 'loginM', 'registerM'].forEach(id => authEls[id]?.classList.add('hidden'));
    ['dashboard', 'logout', 'dashboardM', 'logoutM'].forEach(id => authEls[id]?.classList.remove('hidden'));
  }
});

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await firebase.auth().signOut();
  location.reload();
});
document.getElementById('logout-btn-mobile')?.addEventListener('click', async () => {
  await firebase.auth().signOut();
  location.reload();
});
