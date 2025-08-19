// errorMessages.js — HappyDate: przyjazne komunikaty błędów (Supabase-only)

/**
 * Normalizacja błędu do wspólnego formatu
 * @param {any} err
 * @returns {{type:'auth'|'db'|'storage'|'network'|'rate_limit'|'validation'|'unknown',
 *   code?: string|number, status?: number, message?: string, raw?: any}}
 */
export function normalizeError(err) {
  if (!err) return { type: "unknown", message: "", raw: err };

  // Supabase / PostgREST najczęściej zwraca { message, status, code }
  if (typeof err === "object" && (err.message || err.status || err.code)) {
    const msg = String(err.message || "");
    const status = Number(err.status || (err.response && err.response.status));
    const code = err.code ? String(err.code) : undefined;
    const lower = msg.toLowerCase();

    // Klasyfikacja
    if (
      lower.includes("invalid login") ||
      (lower.includes("user") && lower.includes("registered")) ||
      lower.includes("password") ||
      lower.includes("token") ||
      lower.includes("oauth")
    ) {
      return { type: "auth", code, status, message: msg, raw: err };
    }
    if (lower.includes("bucket") || lower.includes("file") || (lower.includes("resource") && lower.includes("exists"))) {
      return { type: "storage", code, status, message: msg, raw: err };
    }
    if (lower.includes("row level security") || lower.includes("permission") || lower.includes("policy")) {
      return { type: "db", code, status, message: msg, raw: err };
    }
    if (status === 429 || lower.includes("rate limit")) {
      return { type: "rate_limit", code, status, message: msg, raw: err };
    }
    if (status >= 400 && status < 500) {
      return { type: "validation", code, status, message: msg, raw: err };
    }
    if (status >= 500) {
      return { type: "unknown", code, status, message: msg, raw: err };
    }
    return { type: "unknown", code, status, message: msg, raw: err };
  }

  // Fetch/Network
  if (err instanceof TypeError && /fetch|network/i.test(String(err.message))) {
    return { type: "network", message: err.message, raw: err };
  }

  // String
  if (typeof err === "string") {
    const lower = err.toLowerCase();
    if (lower.includes("network")) return { type: "network", message: err, raw: err };
    if (lower.includes("rate limit")) return { type: "rate_limit", message: err, raw: err };
    return { type: "unknown", message: err, raw: err };
  }

  return { type: "unknown", message: String(err), raw: err };
}

/**
 * Przyjazny komunikat PL (z i18next jeżeli dostępny)
 * @param {any} error
 * @returns {string}
 */
export function getFriendlyErrorMessage(error) {
  const n = normalizeError(error);

  const t = (key, fallback) => {
    try {
      if (window.i18next) {
        const val = window.i18next.t(key);
        if (val && val !== key) return val;
      }
    } catch {}
    return fallback;
  };

  // Offline
  if (n.type === "network" || (typeof navigator !== "undefined" && navigator.onLine === false)) {
    return t("errors.network.offline", "Brak połączenia z internetem. Spróbuj ponownie.");
  }

  // Rate limit
  if (n.type === "rate_limit" || n.status === 429) {
    return t("errors.rate_limit", "Za dużo prób. Spróbuj ponownie za chwilę.");
  }

  const msg = (n.message || "").toLowerCase();

  // Auth
  if (n.type === "auth") {
    if (msg.includes("invalid login credentials")) {
      return t("errors.auth.invalid_credentials", "Nieprawidłowe dane logowania.");
    }
    if (msg.includes("email not confirmed") || msg.includes("confirmation required")) {
      return t("errors.auth.email_not_confirmed", "Potwierdź adres e-mail, aby się zalogować.");
    }
    if (msg.includes("already registered") || msg.includes("exists")) {
      return t("errors.auth.email_in_use", "Ten adres e-mail jest już zajęty.");
    }
    if (msg.includes("password should be at least") || msg.includes("weak password")) {
      return t("errors.auth.weak_password", "Hasło musi zawierać co najmniej 6 znaków.");
    }
    if (msg.includes("token") && msg.includes("expired")) {
      return t("errors.auth.token_expired", "Link wygasł. Poproś o nowy.");
    }
    if (msg.includes("refresh token") && msg.includes("not found")) {
      return t("errors.auth.session_expired", "Sesja wygasła. Zaloguj się ponownie.");
    }
    if (msg.includes("pkce") || msg.includes("code verifier")) {
      return t("errors.auth.oauth_flow", "Błąd logowania. Odśwież stronę i spróbuj ponownie.");
    }
    if (msg.includes("oauth")) {
      return t("errors.auth.oauth", "Logowanie przez dostawcę nie powiodło się. Spróbuj ponownie.");
    }
  }

  // DB
  if (n.type === "db") {
    if (n.code === "23505" || msg.includes("duplicate key") || msg.includes("already exists")) {
      return t("errors.db.duplicate", "Rekord już istnieje.");
    }
    if (n.code === "23503" || msg.includes("foreign key")) {
      return t("errors.db.foreign_key", "Nie można zapisać: brakuje powiązanego rekordu.");
    }
    if (n.code === "23514" || msg.includes("check constraint")) {
      return t("errors.db.check_violation", "Wartość nie spełnia wymagań.");
    }
    if (msg.includes("row level security") || msg.includes("permission") || n.status === 401 || n.status === 403) {
      return t("errors.db.permission", "Brak uprawnień do tego zasobu.");
    }
    if (n.status === 404 || msg.includes("not found")) {
      return t("errors.db.not_found", "Nie znaleziono danych.");
    }
  }

  // Storage
  if (n.type === "storage") {
    if (msg.includes("already exists") || msg.includes("resource already exists")) {
      return t("errors.storage.exists", "Taki plik już istnieje. Zmień nazwę lub włącz nadpisywanie (upsert).");
    }
    if (msg.includes("not found") || msg.includes("no such file")) {
      return t("errors.storage.not_found", "Nie znaleziono pliku.");
    }
    if (msg.includes("too large") || msg.includes("payload too large")) {
      return t("errors.storage.too_large", "Plik jest zbyt duży.");
    }
    if (msg.includes("bucket")) {
      return t("errors.storage.bucket", "Problem z zasobnikiem plików. Sprawdź konfigurację.");
    }
  }

  // Walidacja / 4xx
  if (n.type === "validation" || (n.status && n.status >= 400 && n.status < 500)) {
    return t("errors.validation", "Nieprawidłowe dane. Sprawdź pola formularza i spróbuj ponownie.");
  }

  // Domyślny fallback
  return t("errors.unknown", "Wystąpił nieznany błąd. Spróbuj ponownie.");
}

/**
 * Podpowiedź co zrobić dalej (opcjonalnie)
 * @param {any} error
 * @returns {string|null}
 */
export function getHelpfulSuggestion(error) {
  const n = normalizeError(error);
  const msg = (n.message || "").toLowerCase();

  if (n.type === "auth" && msg.includes("email not confirmed")) {
    return "Sprawdź skrzynkę i potwierdź rejestrację.";
  }
  if (n.type === "rate_limit") {
    return "Odczekaj chwilę i spróbuj ponownie.";
  }
  if (n.type === "storage" && (msg.includes("exists") || msg.includes("already"))) {
    return "Zmień nazwę pliku lub włącz upsert przy uploadzie.";
  }
  if (n.type === "db" && (n.code === "23505" || msg.includes("duplicate"))) {
    return "Zmień wartości tak, aby nie duplikować istniejącego rekordu.";
  }
  if (n.type === "network") {
    return "Sprawdź połączenie internetowe.";
  }
  return null;
}

/**
 * Helper do UI
 */
export function showFriendlyError(container, error) {
  if (!container) return;
  const msg = getFriendlyErrorMessage(error);
  const hint = getHelpfulSuggestion(error);
  container.textContent = hint ? `${msg} ${hint}` : msg;
  container.dataset.type = "error";
  container.hidden = !msg;
}
