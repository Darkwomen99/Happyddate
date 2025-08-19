// js/chatbot.js — HappyDate Chat (streaming, threads, auth-aware, production-ready)
(() => {
  const API_URL = "/api/chat"; // Zmień, jeśli używasz innego endpointu
  const MAX_HISTORY = 15;      // Ile ostatnich wiadomości wysyłać do backendu
  const RATE_LIMIT_MS = 1200;  // Minimalny odstęp między wysłaniami
  const STORAGE_THREAD_KEY = "happydate_chat_thread_id";

  let abortController = null;
  let lastSentAt = 0;
  let isInitialized = false;

  // —————— helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const escapeHTML = (s = "") => s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  function getThreadId() {
    let id = localStorage.getItem(STORAGE_THREAD_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_THREAD_KEY, id);
    }
    return id;
  }

  async function getUserId() {
    try {
      if (!window.supabase?.auth) return null;
      const { data: { session } } = await window.supabase.auth.getSession();
      return session?.user?.id || null;
    } catch {
      return null;
    }
  }

  function ensureElements() {
    const win = $("#chatbot-window");
    const content = $("#chat-content");
    const input = $("#chat-input");
    const sendBtn = $("#chat-send") || $("#send-btn"); // fallback stary ID
    const stopBtn = $("#chat-stop");
    const openBtn = $("#chat-open"); // opcjonalny
    const headerToggle = $("#chat-toggle"); // opcjonalny
    return { win, content, input, sendBtn, stopBtn, openBtn, headerToggle };
  }

  function appendMessage(role, text, options = {}) {
    const { content } = ensureElements();
    if (!content) return null;

    const wrapper = document.createElement("div");
    wrapper.className = "mt-2";

    const isUser = role === "user";
    const label = isUser ? "Ty" : "HappyBot";
    const baseCls = isUser
      ? "text-right text-blue-700"
      : "text-gray-800";

    wrapper.innerHTML = `
      <p class="${baseCls}">
        <strong>${escapeHTML(label)}:</strong> <span class="chat-msg">${escapeHTML(text)}</span>
      </p>
    `;
    content.appendChild(wrapper);
    content.scrollTop = content.scrollHeight;

    return wrapper.querySelector(".chat-msg");
  }

  function showTyping() {
    const { content } = ensureElements();
    if (!content) return null;
    const node = document.createElement("p");
    node.className = "mt-2 text-gray-500 italic";
    node.id = "chat-typing";
    node.textContent = "Piszę odpowiedź…";
    content.appendChild(node);
    content.scrollTop = content.scrollHeight;
    return node;
  }

  function hideTyping() {
    $("#chat-typing")?.remove();
  }

  function setSendingState(sending) {
    const { input, sendBtn, stopBtn } = ensureElements();
    if (sending) {
      sendBtn?.setAttribute("disabled", "true");
      input?.setAttribute("disabled", "true");
      stopBtn?.classList.remove("hidden");
    } else {
      sendBtn?.removeAttribute("disabled");
      input?.removeAttribute("disabled");
      stopBtn?.classList.add("hidden");
      input?.focus();
    }
  }

  function rateLimited() {
    const now = Date.now();
    if (now - lastSentAt < RATE_LIMIT_MS) return true;
    lastSentAt = now;
    return false;
  }

  function getHistoryFromDOM() {
    // Zbieramy ostatnie wiadomości z DOM (prosty fallback)
    const nodes = Array.from(document.querySelectorAll("#chat-content .mt-2 p"));
    const msgs = nodes.map(p => {
      const isUser = p.className.includes("text-right");
      const t = p.querySelector(".chat-msg")?.textContent || p.textContent || "";
      return { role: isUser ? "user" : "assistant", content: t.replace(/^Ty:\s*|^HappyBot:\s*/i, "").trim() };
    });
    return msgs.slice(-MAX_HISTORY);
  }

  async function persistMessageLocal(role, content) {
    // Opcjonalnie zapis do Supabase, jeśli chcesz mieć historię w DB po stronie klienta.
    // Rekomendacja: przechowywać po stronie backendu w /api/chat.
    try {
      const userId = await getUserId();
      if (!userId || !window.supabase) return;

      await window.supabase.from("chat_messages").insert({
        user_id: userId,
        thread_id: getThreadId(),
        role,
        content
      });
    } catch (e) {
      // cicho ignorujemy, historia to "nice-to-have"
    }
  }

  // —————— core: streaming z backendu
  async function streamAssistantAnswer(userMessage) {
    const { content } = ensureElements();
    if (!content) return;

    const userId = await getUserId();
    const threadId = getThreadId();

    const history = getHistoryFromDOM();
    history.push({ role: "user", content: userMessage });

    abortController = new AbortController();

    let assistSpan = appendMessage("assistant", ""); // miejsce do strumieniowego wpisywania
    if (!assistSpan) return;

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          userId,         // może być null, jeśli niezalogowany
          messages: history, // ostatnie N wiadomości + bieżąca
          // dodatkowe pola config możesz dopisać po swojej stronie backendu
        }),
        signal: abortController.signal
      });

      if (!res.ok || !res.body) {
        assistSpan.textContent = "Przepraszam, nie udało się pobrać odpowiedzi.";
        return;
      }

      // Czytamy body strumieniowo (chunkami)
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done, value;
      let buffer = "";

      while ({ done, value } = await reader.read(), !done) {
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        assistSpan.textContent = buffer; // prosto: dokładamy tekst
        content.scrollTop = content.scrollHeight;
      }

      // Zakończenie — ostatni flush (na wypadek)
      assistSpan.textContent = buffer;

      // Opcjonalna lokalna persystencja
      persistMessageLocal("assistant", buffer);
    } catch (err) {
      if (err?.name === "AbortError") {
        assistSpan.textContent += " [przerwano]";
      } else {
        assistSpan.textContent = "Wystąpił błąd podczas generowania odpowiedzi.";
        console.error(err);
      }
    } finally {
      abortController = null;
      setSendingState(false);
      hideTyping();
    }
  }

  // —————— API publiczne (global)
  async function sendMessage() {
    const { input, content } = ensureElements();
    if (!input || !content) return;

    const message = (input.value || "").trim();
    if (!message) return;

    if (rateLimited()) {
      // informacja dyskretna (bez alertu)
      const note = document.createElement("div");
      note.className = "text-xs text-gray-500 mt-1";
      note.textContent = "Poczekaj chwilkę…";
      content.appendChild(note);
      setTimeout(() => note.remove(), 1200);
      return;
    }

    // Dodaj wiadomość użytkownika do okna
    appendMessage("user", message);
    input.value = "";
    input.focus();

    // Opcjonalna lokalna persystencja
    persistMessageLocal("user", message);

    // Blokujemy UI i pokazujemy "piszę"
    setSendingState(true);
    showTyping();

    await streamAssistantAnswer(message);
  }

  function stopMessage() {
    if (abortController) {
      abortController.abort();
    }
  }

  function toggleChat() {
    const { win } = ensureElements();
    win?.classList.toggle("hidden");
    if (!win?.classList.contains("hidden")) {
      $("#chat-input")?.focus();
    }
    if (!isInitialized) initOnce();
  }

  function initOnce() {
    if (isInitialized) return;
    isInitialized = true;

    const { sendBtn, stopBtn, input, openBtn, headerToggle } = ensureElements();

    // Enter to send
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    sendBtn?.addEventListener("click", sendMessage);
    stopBtn?.addEventListener("click", stopMessage);
    openBtn?.addEventListener("click", toggleChat);
    headerToggle?.addEventListener("click", toggleChat);

    // Szybkie podpowiedzi (opcjonalnie)
    document.querySelectorAll("[data-chat-suggest]").forEach(btn => {
      btn.addEventListener("click", () => {
        const txt = btn.getAttribute("data-chat-suggest") || "";
        if (!txt) return;
        $("#chat-input").value = txt;
        $("#chat-input").focus();
      });
    });
  }

  // —————— kompatybilność z Twoimi starymi funkcjami globalnymi
  window.toggleChat = toggleChat;
  window.sendMessage = sendMessage;

  // —————— eksport nowego API (opcjonalnie)
  window.HappyChat = {
    toggle: toggleChat,
    send: sendMessage,
    stop: stopMessage,
    newThread() {
      localStorage.removeItem(STORAGE_THREAD_KEY);
      getThreadId(); // wygeneruj nowy
      $("#chat-content")?.insertAdjacentHTML("beforeend",
        `<p class="mt-2 text-gray-500 italic">Rozpoczęto nową rozmowę.</p>`
      );
    }
  };

  // Autoinicjalizacja, jeśli okno chat już widoczne
  document.addEventListener("DOMContentLoaded", () => {
    const { win } = ensureElements();
    if (win && !win.classList.contains("hidden")) initOnce();
  });
})();
