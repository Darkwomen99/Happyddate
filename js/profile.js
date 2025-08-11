// --- Ініціалізація Firebase ---
const firebaseConfig = {
  // !!! ВСТАВ СВОЮ КОНФІГУРАЦІЮ !!!
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// --- DOM ---
const form = document.getElementById("profile-form");
const photoInput = document.getElementById("photoFile");
const userPhoto = document.getElementById("user-photo");
const userPoints = document.getElementById("userPoints");
const userLevel = document.getElementById("user-level");
const eventList = document.getElementById("event-list");
const eventEmpty = document.getElementById("event-empty");
const logoutBtn = document.getElementById("logout-btn");
const addEventBtn = document.getElementById("add-event-btn");
const eventModal = document.getElementById("eventModal");
const eventForm = document.getElementById("eventForm");
const referralBtn = document.getElementById("referral-btn");
const historyList = document.getElementById("history-list");

document.addEventListener("DOMContentLoaded", () => {
  const langBtn = document.getElementById('langDropdownBtn');
  const langDropdown = document.getElementById('langDropdown');
  const langFlag = document.getElementById('langFlag');
  const langMap = { pl: "🇵🇱", ua: "🇺🇦", en: "🇬🇧", ru: "🇷🇺", de: "🇩🇪" };

  // Відобразити обрану мову
  function updateLangFlag() {
    const lang = localStorage.getItem("lang") || (navigator.language?.slice(0,2) ?? "pl");
    langFlag.textContent = langMap[lang] || "🌐";
  }
  updateLangFlag();

  // Відкриття/закриття dropdown
  langBtn?.addEventListener('click', e => {
    langDropdown.classList.toggle('hidden');
    e.stopPropagation();
  });
  document.addEventListener('click', e => {
    if (!langDropdown.classList.contains('hidden')) {
      langDropdown.classList.add('hidden');
    }
  });

  // Вибір мови
  langDropdown?.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', function() {
      const lang = this.getAttribute('data-lang');
      localStorage.setItem('lang', lang);
      updateLangFlag();
      location.reload(); // Якщо у тебе є i18next, тут підключай динамічний переклад!
    });
  });
});


// --- Toast повідомлення ---
function showToast(msg, color = "bg-green-600") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `fixed top-8 right-8 z-50 px-5 py-3 rounded-xl text-white font-semibold shadow-xl transition-all duration-300 opacity-100 ${color}`;
  setTimeout(() => {
    t.classList.add("opacity-0");
  }, 2000);
}

// --- Функції для балів і рівня ---
function calcLevel(points) {
  if (points >= 100) return "Ekspert";
  if (points >= 40) return "Znawca";
  return "Nowicjusz";
}

// --- Авторизація ---
auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  // --- Профіль ---
  const doc = await db.collection("users").doc(user.uid).get();
  const data = doc.exists ? doc.data() : {};

  form.name.value = data.name || "";
  form.surname.value = data.surname || "";
  form.email.value = user.email;
  form.phone.value = data.phone || "";
  form.birthdate.value = data.birthdate || "";
  form.gender.value = data.gender || "";
  form.preferences.value = data.preferences || "";
  userPhoto.src = data.photoURL || userPhoto.src;
  userPoints.textContent = (data.points || 0) + " pkt";
  userLevel.textContent = calcLevel(data.points || 0);

  loadUserEvents(user.uid);
  loadUserHistory(user.uid);

  logoutBtn.onclick = () => auth.signOut().then(() => location.reload());
});

// --- Збереження профілю ---
form.addEventListener("submit", async e => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return;
  let bonusPoints = 0;
  // Розумний підрахунок балів за повноту профілю:
  const filledFields = ["name", "surname", "phone", "birthdate", "gender", "preferences"].filter(id => form[id].value).length;
  if (filledFields >= 5) bonusPoints = 20;
  const update = {
    name: form.name.value.trim(),
    surname: form.surname.value.trim(),
    phone: form.phone.value.trim(),
    birthdate: form.birthdate.value,
    gender: form.gender.value,
    preferences: form.preferences.value.trim(),
    points: bonusPoints
  };

  // Фото
  if (photoInput.files[0]) {
    const ref = storage.ref("avatars/" + user.uid);
    await ref.put(photoInput.files[0]);
    update.photoURL = await ref.getDownloadURL();
    userPhoto.src = update.photoURL;
  }

  await db.collection("users").doc(user.uid).set(update, { merge: true });
  showToast("Профіль оновлено! 🎉");
});

// --- Зміна аватара ---
userPhoto.addEventListener('click', () => photoInput.click());
photoInput.addEventListener('change', () => {
  if (photoInput.files[0]) {
    const reader = new FileReader();
    reader.onload = e => userPhoto.src = e.target.result;
    reader.readAsDataURL(photoInput.files[0]);
  }
});

// --- Завантажити події ---
async function loadUserEvents(uid) {
  const snap = await db.collection("users").doc(uid).collection("events").orderBy("date").get();
  eventList.innerHTML = "";
  if (snap.empty) {
    eventEmpty.classList.remove("hidden");
    return;
  }
  eventEmpty.classList.add("hidden");
  snap.forEach(doc => {
    const ev = doc.data();
    const el = document.createElement("div");
    el.className = "border-l-4 pl-4 py-2 mb-3 rounded bg-gradient-to-r from-pink-50 to-blue-50 shadow flex justify-between items-center";
    el.innerHTML = `
      <div>
        <div class="font-bold text-pink-700">${ev.title} <span class="text-xs text-gray-500">(${ev.date})</span></div>
        <div class="text-sm text-gray-700">Для: ${ev.forWho || "—"}</div>
        <div class="text-xs text-gray-500">Коментар: ${ev.comment || ""}</div>
      </div>
      <button aria-label="Видалити" class="text-red-500 hover:text-red-700 ml-2 text-xl event-delete-btn" data-id="${doc.id}">🗑</button>
    `;
    eventList.appendChild(el);
  });

  // Видалення події
  document.querySelectorAll('.event-delete-btn').forEach(btn => {
    btn.onclick = async function() {
      const user = auth.currentUser;
      if (!user) return;
      if (confirm('Видалити цю подію?')) {
        await db.collection("users").doc(user.uid).collection("events").doc(this.dataset.id).delete();
        showToast("Подію видалено", "bg-red-600");
        loadUserEvents(user.uid);
      }
    };
  });
}

// --- Додати подію через модалку ---
if (addEventBtn) {
  addEventBtn.addEventListener('click', () => {
    eventForm.reset();
    eventModal.showModal();
  });
}
eventForm?.addEventListener('submit', async e => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return;
  await db.collection("users").doc(user.uid).collection("events").add({
    title: eventForm.eventTitle.value,
    date: eventForm.eventDate.value,
    forWho: eventForm.eventForWho.value,
    comment: eventForm.eventComment.value,
    createdAt: new Date()
  });
  eventModal.close();
  showToast("Wydarzenie zapisane!");
  loadUserEvents(user.uid);
  loadUserHistory(user.uid);
});

// --- Блок "Запроси друга" ---
referralBtn?.addEventListener("click", () => {
  const user = auth.currentUser;
  if (!user) return;
  const link = `${location.origin}/register.html?ref=${user.uid}`;
  navigator.clipboard.writeText(link);
  showToast("Twój link polecający został skopiowany! ✨");
});

// --- Історія активності (імітація, доповни реальними даними) ---
async function loadUserHistory(uid) {
  const snap = await db.collection("users").doc(uid).collection("events").orderBy("createdAt", "desc").limit(5).get();
  historyList.innerHTML = "";
  if (snap.empty) {
    historyList.innerHTML = "<li>Brak aktywności.</li>";
    return;
  }
  snap.forEach(doc => {
    const ev = doc.data();
    const li = document.createElement("li");
    li.textContent = `${ev.title} (${ev.date}) – ${ev.forWho || ""}`;
    historyList.appendChild(li);
  });
}

// --- AI-блок (заглушка/відкриття чату) ---
document.getElementById('ai-bot-btn')?.addEventListener('click', () => {
  showToast("AI-bot dostępny już wkrótce! 🤖", "bg-blue-600");
});

// --- Мультимовність (приклад реалізації) ---
const langBtn = document.getElementById('langDropdownBtn');
const langDropdown = document.getElementById('langDropdown');
const langFlag = document.getElementById('langFlag');
const langMap = { pl: "🇵🇱", ua: "🇺🇦", en: "🇬🇧", ru: "🇷🇺", de: "🇩🇪" };

function updateLangFlag() {
  const lang = localStorage.getItem("lang") || (navigator.language?.slice(0, 2) ?? "pl");
  langFlag.textContent = langMap[lang] || "🌐";
}
updateLangFlag();

langBtn?.addEventListener('click', e => {
  langDropdown.classList.toggle('hidden');
  e.stopPropagation();
});
document.addEventListener('click', e => {
  if (!langDropdown.classList.contains('hidden')) {
    langDropdown.classList.add('hidden');
  }
});
langDropdown?.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', function() {
    const lang = this.getAttribute('data-lang');
    localStorage.setItem('lang', lang);
    updateLangFlag();
    location.reload();
  });
});
