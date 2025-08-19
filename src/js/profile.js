// profile-dashboard.js — HappyDate (Supabase, bez Firebase)
(() => {
  // ───────────────────────────────── helpers
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  async function ensureSupabase() {
    if (window.supabase) return window.supabase;
    if (!window.ENV?.SUPABASE_URL || !window.ENV?.SUPABASE_ANON_KEY) {
      console.error("[profile] Brak ENV.SUPABASE_URL/ENV.SUPABASE_ANON_KEY.");
      return null;
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    window.supabase = createClient(window.ENV.SUPABASE_URL, window.ENV.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return window.supabase;
  }

  const toast = (msg, color = "bg-green-600") => {
    let t = $("#toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      document.body.appendChild(t);
    }
    t.className = `fixed top-8 right-8 z-50 px-5 py-3 rounded-xl text-white font-semibold shadow-xl transition-all duration-300 opacity-100 ${color}`;
    t.textContent = msg;
    setTimeout(() => t.classList.add("opacity-0"), 2000);
  };

  const calcLevel = (points) => (points >= 100 ? "Ekspert" : points >= 40 ? "Znawca" : "Nowicjusz");

  const isoFromDate = (dateStr, time = "09:00") => {
    const [y, m, d] = (dateStr || "").split("-").map(Number);
    const [hh, mm]  = (time || "09:00").split(":").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, hh || 0, mm || 0, 0).toISOString();
  };

  async function signOut() {
    try {
      if (window.auth?.signOut) await window.auth.signOut();
      else if (window.supabase?.auth) await window.supabase.auth.signOut();
      toast("Wylogowano pomyślnie ✅");
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      console.error(e);
      toast("Nie udało się wylogować.", "bg-red-600");
    }
  }

  // Język (flaga w dropdown, bez reload jeśli jest i18n)
  function initLangDropdown() {
    const langBtn = $("#langDropdownBtn");
    const langDropdown = $("#langDropdown");
    const langFlag = $("#langFlag");
    const langMap = { pl: "🇵🇱", uk: "🇺🇦", en: "🇬🇧", ru: "🇷🇺", de: "🇩🇪" };

    function currentLang() {
      return (window.i18n?.getLang?.()) || localStorage.getItem("lang") || (navigator.language || "pl").slice(0,2);
    }
    function updateFlag() {
      const lang = currentLang();
      if (langFlag) langFlag.textContent = langMap[lang] || "🌐";
    }
    updateFlag();

    langBtn?.addEventListener("click", (e) => {
      langDropdown?.classList.toggle("hidden");
      e.stopPropagation();
    });
    document.addEventListener("click", () => langDropdown && !langDropdown.classList.contains("hidden") && langDropdown.classList.add("hidden"));

    langDropdown?.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", async function() {
        const lang = this.getAttribute("data-lang");
        if (window.i18n?.setLang) {
          await window.i18n.setLang(lang, { persist: true });
          updateFlag();
        } else {
          localStorage.setItem("lang", lang);
          updateFlag();
          location.reload();
        }
      });
    });

    // Reakcja na zmianę języka (jeśli i18n publikuje event)
    window.i18n?.onChange?.(() => updateFlag());
  }

  // ───────────────────────────────── główna logika strony
  document.addEventListener("DOMContentLoaded", async () => {
    initLangDropdown();

    const supabase = await ensureSupabase();
    if (!supabase) return;

    // DOM
    const form         = $("#profile-form");
    const photoInput   = $("#photoFile");
    const userPhoto    = $("#user-photo");
    const userPoints   = $("#userPoints");
    const userLevel    = $("#user-level");
    const eventList    = $("#event-list");
    const eventEmpty   = $("#event-empty");
    const logoutBtn    = $("#logout-btn");
    const addEventBtn  = $("#add-event-btn");
    const eventModal   = $("#eventModal");
    const eventForm    = $("#eventForm");
    const referralBtn  = $("#referral-btn");
    const historyList  = $("#history-list");

    // Auth guard
    let userId = null;
    if (window.auth?.requireAuth) {
      const u = await window.auth.requireAuth({ redirectTo: "/login.html" });
      if (!u) return;
      userId = u.id;
    } else {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { location.href = "/login.html"; return; }
      userId = session.user.id;
    }

    // Bind logout
    logoutBtn?.addEventListener("click", signOut);

    // Profil — load
    let loadedPoints = 0;
    async function loadProfile() {
      const { data, error } = await supabase
        .from("profiles")
        .select("name,surname,phone,birthdate,gender,preferences,points,photo_url")
        .eq("id", userId)
        .single();

      if (error && error.code !== "PGRST116") { // PGRST116: no rows
        console.error(error);
      }
      const p = data || {};

      if (form) {
        form.name.value        = p.name || "";
        form.surname.value     = p.surname || "";
        form.email.value       = (await supabase.auth.getUser()).data.user?.email || "";
        form.phone.value       = p.phone || "";
        form.birthdate.value   = p.birthdate || "";
        form.gender.value      = p.gender || "";
        form.preferences.value = p.preferences || "";
      }
      if (userPhoto) userPhoto.src = p.photo_url || userPhoto.src;
      loadedPoints = Number(p.points || 0);
      if (userPoints) userPoints.textContent = `${loadedPoints} pkt`;
      if (userLevel)  userLevel.textContent  = calcLevel(loadedPoints);
    }

    // Profil — save
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        // punkty za kompletność (nie obniżamy istniejących)
        const filled = ["name","surname","phone","birthdate","gender","preferences"]
          .filter(id => form[id]?.value?.trim()).length;
        const completion = filled >= 5 ? 20 : 0;
        const nextPoints = Math.max(loadedPoints, completion);

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

        // upload avatara (opcjonalnie)
        if (photoInput?.files?.[0]) {
          const file = photoInput.files[0];
          const path = `avatars/${userId}/${Date.now()}-${file.name}`;
          const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { cacheControl: "3600", upsert: false });
          if (upErr) throw upErr;
          const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
          patch.photo_url = publicUrl;
          if (userPhoto) userPhoto.src = publicUrl;
        }

        const { error } = await supabase.from("profiles").upsert(patch);
        if (error) throw error;

        loadedPoints = patch.points || loadedPoints;
        if (userPoints) userPoints.textContent = `${loadedPoints} pkt`;
        if (userLevel)  userLevel.textContent  = calcLevel(loadedPoints);
        toast("Profil zaktualizowany! 🎉");
      } catch (err) {
        console.error(err);
        toast("Nie udało się zapisać profilu.", "bg-red-600");
      }
    });

    // Klik w awatar → wybór pliku + podgląd
    userPhoto?.addEventListener("click", () => photoInput?.click());
    photoInput?.addEventListener("change", () => {
      if (photoInput.files?.[0]) {
        const reader = new FileReader();
        reader.onload = (e) => (userPhoto.src = e.target.result);
        reader.readAsDataURL(photoInput.files[0]);
      }
    });

    // Events — load list
    async function loadUserEvents() {
      const { data, error } = await supabase
        .from("events")
        .select("id,title,for_who,comment,start_at,created_at")
        .eq("user_id", userId)
        .order("start_at", { ascending: true });

      if (error) {
        console.error(error);
        eventList && (eventList.innerHTML = "");
        eventEmpty && eventEmpty.classList.remove("hidden");
        return;
      }

      eventList.innerHTML = "";
      if (!data || data.length === 0) {
        eventEmpty?.classList.remove("hidden");
        return;
      }
      eventEmpty?.classList.add("hidden");

      data.forEach((ev) => {
        const el = document.createElement("div");
        el.className = "border-l-4 pl-4 py-2 mb-3 rounded bg-gradient-to-r from-pink-50 to-blue-50 shadow flex justify-between items-center";
        const dateStr = new Date(ev.start_at).toISOString().slice(0,10);
        el.innerHTML = `
          <div>
            <div class="font-bold text-pink-700">${ev.title || "Wydarzenie"} <span class="text-xs text-gray-500">(${dateStr})</span></div>
            <div class="text-sm text-gray-700">Dla: ${ev.for_who || "—"}</div>
            <div class="text-xs text-gray-500">Komentarz: ${ev.comment || ""}</div>
          </div>
          <button aria-label="Usuń" class="text-red-500 hover:text-red-700 ml-2 text-xl event-delete-btn" data-id="${ev.id}">🗑</button>
        `;
        eventList.appendChild(el);
      });

      // delete bindings
      $$(".event-delete-btn").forEach((btn) => {
        btn.onclick = async function() {
          const id = this.getAttribute("data-id");
          if (!id) return;
          if (!confirm("Usunąć to wydarzenie?")) return;
          const { error } = await supabase.from("events").delete().eq("id", id);
          if (error) {
            console.error(error);
            toast("Nie udało się usunąć.", "bg-red-600");
            return;
          }
          toast("Wydarzenie usunięte", "bg-red-600");
          loadUserEvents();
          loadUserHistory();
        };
      });
    }

    // Events — add via modal
    addEventBtn?.addEventListener("click", () => {
      eventForm?.reset();
      if (typeof eventModal?.showModal === "function") eventModal.showModal();
      else eventModal?.classList.remove("hidden");
    });

    eventForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title   = eventForm.eventTitle?.value?.trim();
      const dateStr = eventForm.eventDate?.value;
      const forWho  = eventForm.eventForWho?.value?.trim();
      const comment = eventForm.eventComment?.value?.trim();

      if (!title || !dateStr) return;

      try {
        const start_at = isoFromDate(dateStr);
        const { error } = await supabase.from("events").insert({ user_id: userId, title, for_who: forWho, comment, start_at });
        if (error) throw error;
        if (typeof eventModal?.close === "function") eventModal.close();
        else eventModal?.classList.add("hidden");
        toast("Wydarzenie zapisane!");
        loadUserEvents();
        loadUserHistory();
      } catch (err) {
        console.error(err);
        toast("Nie udało się zapisać wydarzenia.", "bg-red-600");
      }
    });

    // Historia — ostatnie 5
    async function loadUserHistory() {
      const { data, error } = await supabase
        .from("events")
        .select("title,for_who,start_at,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        console.error(error);
        if (historyList) historyList.innerHTML = "<li>Błąd ładowania.</li>";
        return;
      }
      historyList.innerHTML = "";
      if (!data || data.length === 0) {
        historyList.innerHTML = "<li>Brak aktywności.</li>";
        return;
      }
      data.forEach((ev) => {
        const d = new Date(ev.start_at).toISOString().slice(0,10);
        const li = document.createElement("li");
        li.textContent = `${ev.title || "Wydarzenie"} (${d}) – ${ev.for_who || ""}`;
        historyList.appendChild(li);
      });
    }

    // Referral link
    referralBtn?.addEventListener("click", () => {
      const link = `${location.origin}/register.html?ref=${userId}`;
      navigator.clipboard.writeText(link).then(() => {
        toast("Twój link polecający został skopiowany! ✨");
      });
    });

    // Realtime update (events)
    const channel = supabase
      .channel("events-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `user_id=eq.${userId}` }, () => {
        loadUserEvents();
        loadUserHistory();
      })
      .subscribe();

    window.addEventListener("beforeunload", () => {
      try { supabase.removeChannel(channel); } catch {}
    });

    // Init loads
    await loadProfile();
    await loadUserEvents();
    await loadUserHistory();
  });
})();
