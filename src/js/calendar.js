// /js/calendar.js — HappyDate Calendar (Supabase v2, production-ready, ESM)
import { Calendar } from "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.js";

// Якщо у тебе є модульний клієнт:
// import { supabase as supabaseClient } from './supabaseClient.js';
// Але щоб скрипт був автономний, використаємо м’які fallback-и:
const supabase = window.supabase /* || supabaseClient */;

// ───────────────────────────────── helpers
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const hasAuthModule = typeof window.auth?.requireAuth === "function";

// Безпечний гард авторизації з fallback-логікою
async function ensureUser() {
  if (!supabase) {
    console.error("[calendar] Supabase client is missing (window.supabase).");
    return null;
  }

  // 1) Якщо є window.auth.requireAuth (з твого auth.js)
  if (hasAuthModule) {
    try {
      const user = await window.auth.requireAuth({ redirectTo: "/login.html" });
      return user;
    } catch {
      return null;
    }
  }

  // 2) Інакше — напряму через Supabase
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    try {
      sessionStorage.setItem("happydate_post_login_redirect", location.pathname + location.search + location.hash);
    } catch {}
    location.href = "/login.html";
    return null;
  }
  return session.user;
}

// Реакція на зміну сесії у фоні (інша вкладка)
function attachAuthGuard() {
  if (!supabase?.auth?.onAuthStateChange) return;
  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session?.user) location.href = "/login.html";
  });
}

// Конвертуємо локальну дату/час у ISO (з урахуванням локальної TZ)
function localDateTimeToISO(dateStr /* YYYY-MM-DD */, timeStr /* HH:mm */ = "09:00") {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const dt = new Date(y, (m - 1), d, hh || 0, mm || 0, 0, 0);
  return dt.toISOString();
}

function colorByType(type) {
  switch ((type || "").toLowerCase()) {
    case "birthday":    return "#3b82f6"; // blue
    case "anniversary": return "#ec4899"; // pink
    case "name_day":    return "#10b981"; // green
    case "holiday":
    case "event":
    default:            return "#8b5cf6"; // violet (default)
  }
}

function humanDate(iso) {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch { return iso; }
}

function esc(s = "") {
  return String(s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

// ───────────────────────────────── CRUD (Supabase)
async function fetchEventsForRange(userId, startStr, endStr) {
  const { data, error } = await supabase
    .from("events")
    .select("id,title,type,person,start_at")
    .eq("user_id", userId)
    .gte("start_at", startStr)
    .lt("start_at", endStr) // endStr у FullCalendar — ексклюзивна межа
    .order("start_at", { ascending: true });

  if (error) {
    console.error("[events] fetch error:", error);
    return [];
  }
  return (data || []).map(row => ({
    id: row.id,
    title: `${row.person ? row.person + " " : ""}${row.title || ""}`.trim() || "Wydarzenie",
    start: row.start_at,
    color: colorByType(row.type),
    extendedProps: {
      type: row.type || "",
      person: row.person || "",
    }
  }));
}

async function fetchNextEvents(userId, limit = 5) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("events")
    .select("id,title,type,person,start_at")
    .eq("user_id", userId)
    .gte("start_at", nowIso)
    .order("start_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[events] next error:", error);
    return [];
  }
  return (data || []).map(row => ({
    id: row.id,
    title: `${row.person ? row.person + " " : ""}${row.title || ""}`.trim() || "Wydarzenie",
    start: row.start_at,
    color: colorByType(row.type),
    extendedProps: { type: row.type || "", person: row.person || "" }
  }));
}

async function insertEvent(userId, { title, type, person, date, time }) {
  const start_at = localDateTimeToISO(date, time);
  return supabase.from("events").insert({ user_id: userId, title, type, person, start_at });
}

async function updateEvent(eventId, { title, type, person, date, time }) {
  const patch = { title, type, person };
  if (date) patch.start_at = localDateTimeToISO(date, time);
  return supabase.from("events").update(patch).eq("id", eventId);
}

async function deleteEvent(eventId) {
  return supabase.from("events").delete().eq("id", eventId);
}

// ───────────────────────────────── UI helpers
function openModal() {
  const m = $("#eventModal");
  if (!m) return;
  m.classList.remove("hidden");
  // фокус на перше поле
  $("#eventTitle")?.focus();
}

function closeModal(reset = true) {
  const modal = $("#eventModal");
  if (!modal) return;
  modal.classList.add("hidden");
  if (reset) $("#eventForm")?.reset();
  modal.removeAttribute("data-editing-id");
}

function fillFormFromEventObj(e) {
  const modal = $("#eventModal");
  modal?.setAttribute("data-editing-id", e.id);

  $("#eventTitle").value  = e.title.replace(/\s*🎁$/, "").trim();
  $("#eventType").value   = e.extendedProps?.type || "";
  $("#eventPerson").value = e.extendedProps?.person || "";

  const dateIso = e.startStr || e.start?.toISOString();
  $("#eventDate").value   = humanDate(dateIso);
  const time = (e.start?.toTimeString?.() || "").slice(0,5); // HH:mm
  if ($("#eventTime")) $("#eventTime").value = time || "09:00";
}

function readForm() {
  const title  = $("#eventTitle")?.value?.trim();
  const type   = $("#eventType")?.value?.trim();
  const person = $("#eventPerson")?.value?.trim();
  const date   = $("#eventDate")?.value;
  const time   = $("#eventTime")?.value || "09:00";
  return { title, type, person, date, time };
}

function setFeedback(msg, type = "info") {
  const box = $("#calendarFeedback");
  if (!box) return;
  box.textContent = msg || "";
  box.dataset.type = type;
  box.hidden = !msg;
  if (!box.hasAttribute("role")) box.setAttribute("role", "status");
  if (!box.hasAttribute("aria-live")) box.setAttribute("aria-live", "polite");
}

function updateEventList(events) {
  const box = $("#event-list");
  if (!box) return;
  if (!events.length) {
    box.innerHTML = `<div class="text-gray-500 text-center">Brak nadchodzących wydarzeń 🎈</div>`;
    return;
  }
  const html = events
    .slice()
    .sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 5)
    .map(e => {
      const who = (e.extendedProps?.person || "").trim() || e.title;
      return `
        <div class="bg-white/80 dark:bg-gray-800/60 rounded-xl px-4 py-3 shadow flex flex-col gap-1">
          <span class="font-semibold">${esc(who)} 🎁</span>
          <span class="text-xs text-gray-600">${esc(humanDate(e.start))}</span>
        </div>
      `;
    }).join("");
  box.innerHTML = html;
}

// Дебаунс для рефетчу (уникаємо «штормів»)
let refetchTimer;
function scheduleRefetch(calendar, user) {
  clearTimeout(refetchTimer);
  refetchTimer = setTimeout(async () => {
    await calendar.refetchEvents();
    const upcoming = await fetchNextEvents(user.id, 5);
    updateEventList(upcoming);
  }, 250);
}

// ───────────────────────────────── main
export async function initEventsPage() {
  if (!supabase) {
    console.error("[calendar] Supabase client is missing (window.supabase).");
    return;
  }

  attachAuthGuard();

  const user = await ensureUser();
  if (!user) return;

  const calendarEl = $("#calendar");
  if (!calendarEl) return;

  const calendar = new Calendar(calendarEl, {
    initialView: "dayGridMonth",
    selectable: true,
    dayMaxEvents: true,
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,listMonth"
    },
    // Ліміт подій на видимий діапазон (ефективність)
    events: async (fetchInfo, successCb, failureCb) => {
      try {
        const rows = await fetchEventsForRange(user.id, fetchInfo.startStr, fetchInfo.endStr);
        successCb(rows);
      } catch (e) {
        console.error(e);
        failureCb(e);
      }
    },
    dateClick(info) {
      $("#eventDate").value = info.dateStr;
      if ($("#eventTime") && !$("#eventTime").value) $("#eventTime").value = "09:00";
      openModal();
    },
    eventClick(info) {
      fillFormFromEventObj(info.event);
      openModal();
    }
  });

  calendar.render();

  // Первинне завантаження «найближчих 5»
  fetchNextEvents(user.id, 5).then(updateEventList).catch(() => {});

  // Realtime: відслідковуємо лише свої події
  const channel = supabase
    .channel("events-user-feed")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "events", filter: `user_id=eq.${user.id}` },
      () => scheduleRefetch(calendar, user)
    )
    .subscribe();

  // ── Модальне вікно / форма
  const modal = $("#eventModal");
  const form  = $("#eventForm");

  $("#closeModal")?.addEventListener("click", () => closeModal(true));
  modal?.addEventListener("click", (e) => { if (e.target === modal) closeModal(true); });

  // Закриття по Esc
  document.addEventListener("keydown", (e) => {
    if (!modal || modal.classList.contains("hidden")) return;
    if (e.key === "Escape") closeModal(true);
  });

  // Створити/оновити
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setFeedback("");

    const payload = readForm();
    // Можеш послабити умови, якщо потрібно
    if (!payload.title || !payload.date) {
      setFeedback("Wpisz tytuł i datę.", "error");
      return;
    }

    const editingId = modal.getAttribute("data-editing-id");
    try {
      if (editingId) {
        const { error } = await updateEvent(editingId, payload);
        if (error) throw error;
      } else {
        const { error } = await insertEvent(user.id, payload);
        if (error) throw error;
      }
      closeModal(true);
      scheduleRefetch(calendar, user);
    } catch (err) {
      console.error(err);
      setFeedback(err?.message || "Nie udało się zapisać wydarzenia.", "error");
    }
  });

  // Видалити
  $("#deleteEvent")?.addEventListener("click", async () => {
    const editingId = modal.getAttribute("data-editing-id");
    if (!editingId) return;
    if (!confirm("Usunąć to wydarzenie?")) return;

    try {
      const { error } = await deleteEvent(editingId);
      if (error) throw error;
      closeModal(true);
      scheduleRefetch(calendar, user);
    } catch (err) {
      console.error(err);
      setFeedback(err?.message || "Nie udało się usunąć.", "error");
    }
  });

  // Очищення підписки при виході
  window.addEventListener("beforeunload", () => {
    try { supabase.removeChannel(channel); } catch {}
  });
}

// Автозапуск
document.addEventListener("DOMContentLoaded", initEventsPage);
