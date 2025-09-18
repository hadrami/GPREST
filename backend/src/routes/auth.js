// backend/src/routes/auth.js
import { verifyPassword, hashPassword, isBcryptHash } from "../utils/passwords.js";
export default async function routes(fastify) {
  const { prisma } = fastify;

  // LOGIN with username OR email
  fastify.post("/login", async (req, reply) => {
    const { username, email, password } = req.body || {};
    if (!password || (!username && !email)) {
      return reply.code(400).send({ message: "username (ou email) et password requis" });
    }

    let user = null;

    if (username) {
      // If it looks like an email, try email first
      if (username.includes("@")) {
        user = await prisma.user.findUnique({ where: { email: username } });
      }
      // then try username
      if (!user) {
        user = await prisma.user.findUnique({ where: { username } });
      }
    } else if (email) {
      user = await prisma.user.findUnique({ where: { email } });
    }

    if (!user) return reply.code(401).send({ message: "Identifiants invalides" });

    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) return reply.code(401).send({ message: "Identifiants invalides" });

    const payload = {
      id: user.id,
      role: user.role,
      establishmentId: user.establishmentId,
      mustChangePassword: user.mustChangePassword,
      username: user.username,
    };
    const token = fastify.jwt.sign(payload, { expiresIn: "8h" });

    return {
      token,
      user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role },
      requiresPasswordChange: user.mustChangePassword
    };
  });

  // ME
  fastify.get("/me", { preHandler: [fastify.auth] }, async (req) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword
    };
  });

  // CHANGE PASSWORD
fastify.post("/change-password", { preHandler: [fastify.auth] }, async (req, reply) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return reply.code(400).send({ message: "currentPassword et newPassword requis" });
  }
  if (newPassword.length < 8) {
    return reply.code(400).send({ message: "Le nouveau mot de passe doit contenir au moins 8 caractères" });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return reply.code(404).send({ message: "User not found" });

  // verify the CURRENT password the user typed
  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) return reply.code(400).send({ message: "Mot de passe actuel incorrect" });

  // hash + persist the NEW password, and clear the force-change flag
  const hash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash, mustChangePassword: false, passwordChangedAt: new Date() },
  });

  // return a fresh token with mustChangePassword=false
  const token = fastify.jwt.sign({
    id: user.id,
    role: user.role,
    establishmentId: user.establishmentId,
    mustChangePassword: false,
    username: user.username,
  }, { expiresIn: "8h" });

  return { ok: true, token };
});

}
