import argon2 from "argon2";
export async function hashPassword(p) { return argon2.hash(p); }
export async function verifyPassword(hash, plain) { return argon2.verify(hash, plain); }
