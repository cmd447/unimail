const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const DISPOSABLE = new Set([
  "mailinator.com", "tempmail.com", "temp-mail.org", "guerrillamail.com",
  "10minutemail.com", "yopmail.com", "throwawaymail.com", "fakeinbox.com",
  "sharklasers.com", "getnada.com", "maildrop.cc", "trashmail.com",
  "dispostable.com", "mailnesia.com", "tempail.com", "mintemail.com",
]);

export type EmailVerdict = "ok" | "invalid" | "disposable";

export function checkEmail(email: string): EmailVerdict {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return "invalid";
  if (DISPOSABLE.has(e.split("@")[1])) return "disposable";
  return "ok";
}
