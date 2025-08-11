import "https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js";
import "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth-compat.js";

const firebaseConfig = {
  apiKey: "AIzaSyCJmddWXQKRGw1nnQ6Evje4qMqHcddSulY",
  authDomain: "happydate-4e42f.firebaseapp.com",
  projectId: "happydate-4e42f",
  storageBucket: "happydate-4e42f.appspot.com",
  messagingSenderId: "169631163082",
  appId: "1:169631163082:web:b4295c7840898da42aca33"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

export { auth };
