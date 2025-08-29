import crypto from "crypto";
export function signTicket({ code, meal, dateISO, matricule }, secret) {
  const base = `${code}|${meal}|${dateISO}|${matricule}`;
  return crypto.createHmac("sha256", secret).update(base).digest("hex");
}
