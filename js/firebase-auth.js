// js/firebase-auth.js
firebase.initializeApp({
  apiKey: "AIzaSyCJmddWXQKRGw1nnQ6Evje4qMqHcddSulY",
  authDomain: "happydate-4e42f.firebaseapp.com",
  projectId: "happydate-4e42f",
  storageBucket: "happydate-4e42f.appspot.com",
  messagingSenderId: "169631163082",
  appId: "1:169631163082:web:b4295c7840898da42aca33"
});

firebase.auth().onAuthStateChanged(user => {
  const isLoggedIn = !!user;
  const desktop = ['login-link', 'register-link', 'dashboard-link', 'logout-btn'];
  const mobile = ['login-link-mobile', 'register-link-mobile', 'dashboard-link-mobile', 'logout-btn-mobile'];

  desktop.forEach(id => document.getElementById(id)?.classList.toggle('hidden', isLoggedIn !== (id.includes('dashboard') || id.includes('logout'))));
  mobile.forEach(id => document.getElementById(id)?.classList.toggle('hidden', isLoggedIn !== (id.includes('dashboard') || id.includes('logout'))));
});

['logout-btn', 'logout-btn-mobile'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', async () => {
    await firebase.auth().signOut();
    location.reload();
  });
});
