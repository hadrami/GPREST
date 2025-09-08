// backend/src/routes/establishments.js (ESM)
export default async function establishmentsRoutes(fastify) {
  const { prisma } = fastify;

  // List (with optional search + pagination)
  fastify.get("/", { preHandler: [fastify.auth] }, async (req) => {
    const { search = "", page = 1, pageSize = 50 } = req.query || {};
    const skip = (Number(page) - 1) * Number(pageSize);
    const take = Number(pageSize);

    const where = search
      ? { name: { contains: String(search), mode: "insensitive" } }
      : {};

    const [items, total] = await Promise.all([
      prisma.establishment.findMany({
        where, orderBy: { name: "asc" }, skip, take,
        select: { id: true, name: true }
      }),
      prisma.establishment.count({ where })
    ]);

    return { items, total, page: Number(page), pageSize: Number(pageSize) };
  });

  // Get by ID
  fastify.get("/:id", { preHandler: [fastify.auth] }, async (req, reply) => {
    const est = await prisma.establishment.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true }
    });
    if (!est) return reply.code(404).send({ message: "Not found" });
    return est;
  });

  // Get by name (exact, case-insensitive)
  fastify.get("/by-name", { preHandler: [fastify.auth] }, async (req, reply) => {
    const name = (req.query?.name || "").trim();
    if (!name) return reply.code(400).send({ message: "name is required" });

    const est = await prisma.establishment.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true, name: true }
    });
    if (!est) return reply.code(404).send({ message: "Not found" });
    return est;
  });
}
