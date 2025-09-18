import argon2 from "argon2";
import bcrypt from "bcryptjs";
export async function hashPassword(p) { return argon2.hash(p); }
export async function verifyPassword(hash, plain) {
  if (!hash) return false;
  const isBcrypt = hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$");
  return isBcrypt ? bcrypt.compare(plain, hash) : argon2.verify(hash, plain);
}
export function isBcryptHash(hash) {
  return typeof hash === "string" && (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$"));
}