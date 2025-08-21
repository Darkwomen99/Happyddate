// profile.js — HappyDate (Supabase v2, optymalizowany, production-ready)
(() => {
  // ───────────────────────────────── Helpers
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const toast = (msg, color = "bg-green-600") => {
    const el = document.createElement("div");
    el.className = `fixed top-8 right-8 z-50 px-5 py-3 rounded-xl text-white font-semibold shadow-xl transition-all duration-300 ${color}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  };

  const calcLevel = (points) =>
    points >= 100 ? "Ekspert" : points >= 40 ? "Znawca" : points >= 20 ? "Entuzjasta" : "Nowicjusz";

  const normalizeDate = (str) => {
    const d = String(str || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const today = new Date();
    return today.toISOString().split("T")[0];
  };

  async function ensureSupabase() {
    if (window.supabase) return window.supabase;
    if (!window.ENV?.SUPABASE_URL || !window.ENV?.SUPABASE_ANON_KEY) return null;
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    window.supabase = createClient(window.ENV.SUPABASE_URL, window.ENV.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    return window.supabase;
  }

  function initLangDropdown() {
    const btn = $("#langDropdownBtn"), dd = $("#langDropdown"), flag = $("#langFlag");
    const langMap = { pl: "🇵🇱", uk: "🇺🇦", ua: "🇺🇦", en: "🇬🇧", ru: "🇷🇺", de: "🇩🇪" };
    const getLang = () => window.i18n?.getLang?.() || localStorage.getItem("lang") || navigator.language.slice(0,2);
    const setFlag = () => flag && (flag.textContent = langMap[getLang()] || "🌐");

    setFlag();
    btn?.addEventListener("click", e => { dd?.classList.toggle("hidden"); e.stopPropagation(); });
    document.addEventListener("click", () => dd?.classList.add("hidden"));
    dd?.querySelectorAll("button").forEach(b => {
      b.addEventListener("click", async () => {
        const lng = b.dataset.lang;
        if (window.i18n?.setLang) await window.i18n.setLang(lng, { persist: true });
        else localStorage.setItem("lang", lng);
        setFlag();
        if (!window.i18n) location.reload();
      });
    });
    window.i18n?.onChange?.(setFlag);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    initLangDropdown();
    const supabase = await ensureSupabase();
    if (!supabase) return;

    const form = $("#profile-form"), photoInput = $("#photoFile"), userPhoto = $("#user-photo");
    const userPoints = $("#userPoints"), userLevel = $("#user-level");
    const eventList = $("#event-list"), eventEmpty = $("#event-empty"), eventForm = $("#eventForm");
    const logoutBtn = $("#logout-btn"), addEventBtn = $("#add-event-btn"), eventModal = $("#eventModal");
    const referralBtn = $("#referral-btn"), historyList = $("#history-list");

    let userId = null, loadedPoints = 0;
    const session = await (window.auth?.requireAuth ? window.auth.requireAuth({ redirectTo: "/pages/login.html" }) : supabase.auth.getSession().then(r => r.data.session));
    if (!session?.user) return location.href = "/pages/login.html";
    userId = session.user.id;

    logoutBtn?.addEventListener("click", async () => {
      await (window.auth?.signOut?.() || supabase.auth.signOut());
      toast("Wylogowano ✅");
      setTimeout(() => location.href = "/pages/login.html", 800);
    });

    async function loadProfile() {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) return console.error(error);

      const p = data || {}, { data: userData } = await supabase.auth.getUser();
      if (form) {
        form.name.value = p.name || "";
        form.surname.value = p.surname || "";
        form.email.value = userData?.user?.email || "";
        form.phone.value = p.phone || "";
        form.birthdate.value = p.birthdate || "";
        form.gender.value = p.gender || "";
        form.preferences.value = p.preferences || "";
      }
      if (userPhoto && p.photo_url) userPhoto.src = p.photo_url;
      loadedPoints = Number(p.points || 0);
      userPoints.textContent = `${loadedPoints} pkt`;
      userLevel.textContent = calcLevel(loadedPoints);
    }

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const filled = ["name","surname","phone","birthdate","gender","preferences"].filter(id => form[id]?.value?.trim()).length;
        const completionBonus = filled >= 5 ? 20 : 0;
        const nextPoints = Math.max(loadedPoints, completionBonus);
        const patch = {
          id: userId,
          name: form.name.value.trim(),
          surname: form.surname.value.trim(),
          phone: form.phone.value.trim(),
          birthdate: form.birthdate.value || null,
          gender: form.gender.value || null,
          preferences: form.preferences.value.trim(),
          points: nextPoints
        };

        if (photoInput?.files?.[0]) {
          const file = photoInput.files[0];
          if (!file.type.startsWith("image/")) throw new Error("Plik musi być obrazem");
          const path = `avatars/${userId}/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: false });
          if (uploadError) throw uploadError;
          const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
          patch.photo_url = publicUrl;
          userPhoto.src = publicUrl;
        }

        const { error } = await supabase.from("profiles").upsert(patch);
        if (error) throw error;
        loadedPoints = patch.points;
        userPoints.textContent = `${loadedPoints} pkt`;
        userLevel.textContent = calcLevel(loadedPoints);
        toast("Profil zaktualizowany! 🎉");
      } catch (err) {
        console.error(err);
        toast("Błąd zapisu profilu.", "bg-red-600");
      }
    });

    userPhoto?.addEventListener("click", () => photoInput?.click());
    photoInput?.addEventListener("change", () => {
      if (!photoInput.files?.[0]) return;
      const file = photoInput.files[0];
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => (userPhoto.src = e.target.result);
      reader.readAsDataURL(file);
    });

    async function loadUserEvents() {
      const { data, error } = await supabase.from("events").select("*").eq("uid", userId).order("date");
      if (error) return toast("Błąd ładowania wydarzeń", "bg-red-600");

      eventList.innerHTML = "";
      if (!data?.length) return eventEmpty.classList.remove("hidden");
      eventEmpty.classList.add("hidden");

      data.forEach(ev => {
        const el = document.createElement("div");
        el.className = "border-l-4 pl-4 py-2 mb-3 rounded bg-gradient-to-r from-pink-50 to-blue-50 shadow flex justify-between items-center";
        el.innerHTML = `
          <div>
            <div class="font-bold text-pink-700">${ev.title} <span class="text-xs text-gray-500">(${ev.date})</span></div>
            <div class="text-sm text-gray-700">Dla: ${ev.person || "—"}</div>
            <div class="text-xs text-gray-500">${ev.comment ? "Komentarz: " + ev.comment : ""}</div>
          </div>
          <button class="text-red-500 hover:text-red-700 ml-2 text-xl event-delete-btn" data-id="${ev.id}">🗑</button>`;
        eventList.appendChild(el);
      });

      $$(".event-delete-btn").forEach(btn => {
        btn.onclick = async () => {
          const id = btn.dataset.id;
          if (!id || !confirm("Usunąć wydarzenie?")) return;
          const { error } = await supabase.from("events").delete().eq("id", id).eq("uid", userId);
          if (error) return toast("Błąd usuwania", "bg-red-600");
          toast("Usunięto wydarzenie", "bg-red-600");
          loadUserEvents(); loadUserHistory();
        };
      });
    }

    eventForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = eventForm.eventTitle?.value.trim();
      const date = normalizeDate(eventForm.eventDate?.value);
      const person = eventForm.eventForWho?.value.trim();
      const comment = eventForm.eventComment?.value.trim();
      if (!title || !date) return;

      const { error } = await supabase.from("events").insert({ uid: userId, title, person, comment, date, type: "custom" });
      if (error) return toast("Błąd zapisu wydarzenia", "bg-red-600");

      if (typeof eventModal?.close === "function") eventModal.close();
      else eventModal?.classList.add("hidden");
      toast("Wydarzenie zapisane!");
      loadUserEvents();
      loadUserHistory();
    });

    async function loadUserHistory() {
      const { data, error } = await supabase.from("events").select("*").eq("uid", userId).order("created_at", { ascending: false }).limit(5);
      historyList.innerHTML = "";
      if (error || !data?.length) return historyList.innerHTML = "<li>Brak aktywności.</li>";
      data.forEach(ev => {
        const li = document.createElement("li");
        li.textContent = `${ev.title || "Wydarzenie"} (${ev.date || "—"}) – ${ev.person || ""}`;
        historyList.appendChild(li);
      });
    }

    referralBtn?.addEventListener("click", () => {
      const link = `${location.origin}/?ref=${userId}`;
      navigator.clipboard.writeText(link)
        .then(() => toast("Link polecający skopiowany! ✨"))
        .catch(() => toast("Błąd kopiowania.", "bg-red-600"));
    });

    const channel = supabase.channel("events-realtime").on(
      "postgres_changes",
      { event: "*", schema: "public", table: "events", filter: `uid=eq.${userId}` },
      () => { loadUserEvents(); loadUserHistory(); }
    ).subscribe();

    window.addEventListener("beforeunload", () => {
      try { supabase.removeChannel(channel); } catch {}
    });

    await loadProfile();
    await loadUserEvents();
    await loadUserHistory();
  });
})();
