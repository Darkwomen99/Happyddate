// /js/calendar.js — HappyDate Calendar (Supabase v2, production-ready)
import * as FullCalendar from "https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js";

// Якщо у тебе є модульний клієнт:
//   import { supabase as supabaseClient, requireAuth as requireAuthMod } from './supabaseClient.js';
// Але щоб скрипт був автономний, використаємо м’які fallback-и:
const supabase = window.supabase /*|| supabaseClient*/;
const hasAuthModule = typeof window.auth?.requireAuth === "function";
// const requireAuthMod може бути імпортований згори, якщо використовуєш модуль

// ───────────────────────────────── helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

// Безпечний гард авторизації з fallback-логікою
async function ensureUser() {
  // 1) Якщо в тебе вже є window.auth.requireAuth (з мого auth.js)
  if (hasAuthModule) return await window.auth.requireAuth({ redirectTo: "/login.html" });

  // 2) Інакше, напряму через Supabase
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

// Конвертуємо локальну дату (та, опційно, час) у ISO (з урахуванням локальної зони)
function localDateTimeToISO(dateStr /* YYYY-MM-DD */, timeStr /* HH:mm */ = "09:00") {
  // Створюємо Date в локальній TZ та отримуємо ISO:
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const dt = new Date(y, (m - 1), d, hh || 0, mm || 0, 0, 0);
  return dt.toISOString();
}

function colorByType(type) {
  switch ((type || "").toLowerCase()) {
    case "birthday":      return "#3b82f6"; // niebieski
    case "anniversary":   return "#ec4899"; // różowy
    case "name_day":      return "#10b981"; // zielony
    case "holiday":
    case "event":
    default:              return "#8b5cf6"; // fiolet jako domyślny
  }
}

function humanDate(iso) {
  try {
    const d = new Date(iso);
    // YYYY-MM-DD
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch { return iso; }
}

// ───────────────────────────────── CRUD
async function fetchEventsForRange(userId, startStr, endStr) {
  // Новий рекомендований формат: start_at (timestamptz), user_id (uuid), дод. поля: title, type, person
  const { data, error } = await supabase
    .from("events")
    .select("id,title,type,person,start_at")
    .eq("user_id", userId)
    .gte("start_at", startStr) // обмежуємо діапазоном календаря
    .lte("start_at", endStr)
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

// ───────────────────────────────── UI wiring
function openModal() { $("#eventModal")?.classList.remove("hidden"); }
function closeModal(reset = true) {
  const modal = $("#eventModal");
  if (!modal) return;
  modal.classList.add("hidden");
  if (reset) $("#eventForm")?.reset();
  // Забираємо режим редагування
  modal.removeAttribute("data-editing-id");
}

function fillFormFromEventObj(e) {
  // e = FullCalendar EventApi
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
}

function updateEventList(events) {
  const box = $("#event-list");
  if (!box) return;
  if (!events.length) {
    box.innerHTML = `<div class="text-gray-500 text-center">Brak nadchodzących wydarzeń 🎈</div>`;
    return;
  }
  box.innerHTML = events
    .slice()
    .sort((a, b) => String(a.start).localeCompare(String(b.start)))
    .slice(0, 5)
    .map(e => `
      <div class="bg-white/80 dark:bg-gray-800/60 rounded-xl px-4 py-3 shadow flex flex-col gap-1">
        <span class="font-semibold">${(e.extendedProps?.person || "").trim() || e.title} 🎁</span>
        <span class="text-xs text-gray-600">${humanDate(e.start)}</span>
      </div>
    `).join("");
}

// ───────────────────────────────── main
export async function initEventsPage() {
  if (!supabase) {
    console.error("[calendar] Supabase client is missing (window.supabase).");
    return;
  }
  const user = await ensureUser();
  if (!user) return;

  const calendarEl = $("#calendar");
  if (!calendarEl) return;

  const calendar = new FullCalendar.Calendar(calendarEl, {
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
        updateEventList(rows);
      } catch (e) {
        console.error(e);
        failureCb(e);
      }
    },
    dateClick(info) {
      // Підставляємо дату в форму та відкриваємо модальне вікно
      $("#eventDate").value = info.dateStr;
      if ($("#eventTime") && !$("#eventTime").value) $("#eventTime").value = "09:00";
      openModal();
      $("#eventTitle")?.focus();
    },
    eventClick(info) {
      // Редагування існуючої події
      fillFormFromEventObj(info.event);
      openModal();
    }
  });

  calendar.render();

  // Realtime: слідкуємо лише за своїми подіями
  const channel = supabase
    .channel("events-user-feed")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "events", filter: `user_id=eq.${user.id}` },
      () => calendar.refetchEvents()
    )
    .subscribe();

  // ── Модальне вікно / форма
  const modal = $("#eventModal");
  const form  = $("#eventForm");

  $("#closeModal")?.addEventListener("click", () => closeModal(true));
  modal?.addEventListener("click", (e) => { if (e.target === modal) closeModal(true); });

  // Створити/оновити
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setFeedback("");

    const payload = readForm();
    if (!payload.title || !payload.type || !payload.person || !payload.date) {
      setFeedback("Uzupełnij wszystkie pola.", "error");
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
      calendar.refetchEvents();
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
      calendar.refetchEvents();
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

document.addEventListener("DOMContentLoaded", initEventsPage);
