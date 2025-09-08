import { verifyPassword, hashPassword } from "../utils/passwords.js";

export default async function routes(fastify) {
  const { prisma } = fastify;

  // LOGIN
  fastify.post("/login", async (req, reply) => {
    const { email, password } = req.body || {};
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return reply.code(401).send({ message: "Invalid credentials" });

    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) return reply.code(401).send({ message: "Invalid credentials" });

    const payload = {
      id: user.id,
      role: user.role,
      establishmentId: user.establishmentId,
      mustChangePassword: user.mustChangePassword
    };
    const token = fastify.jwt.sign(payload, { expiresIn: "8h" });
    console.log("Toekn **************:", token)

    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      requiresPasswordChange: user.mustChangePassword
    };
  });

  // ME
  fastify.get("/me", { preHandler: [fastify.auth] }, async (req) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    return {
      id: user.id, name: user.name, email: user.email, role: user.role,
      mustChangePassword: user.mustChangePassword
    };
  });

  // CHANGE PASSWORD (autorisé même si mustChangePassword)
  fastify.post("/change-password", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { currentPassword, newPassword } = req.body || {};
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return reply.code(404).send({ message: "User not found" });

    const ok = await verifyPassword(user.passwordHash, currentPassword);
    if (!ok) return reply.code(400).send({ message: "Current password incorrect" });

    const hash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash, mustChangePassword: false, passwordChangedAt: new Date() }
    });

    // nouveau token sans le flag mustChangePassword
    const token = fastify.jwt.sign({
      id: user.id, role: user.role, establishmentId: user.establishmentId, mustChangePassword: false
    }, { expiresIn: "8h" });

    return { ok: true, token };
  });
}
