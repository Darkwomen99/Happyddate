// errorMessages.js — zapewnia przyjazne komunikaty Firebase
export function getFriendlyErrorMessage(errorCode) {
  switch (errorCode) {
    case 'auth/email-already-in-use':
      return 'Ten adres email jest już zajęty.';
    case 'auth/invalid-email':
      return 'Nieprawidłowy adres email.';
    case 'auth/weak-password':
      return 'Hasło musi zawierać co najmniej 6 znaków.';
    case 'auth/user-not-found':
      return 'Nie znaleziono użytkownika o tym adresie email.';
    case 'auth/wrong-password':
      return 'Nieprawidłowe hasło.';
    default:
      return 'Wystąpił nieznany błąd. Spróbuj ponownie.';
  }
}
