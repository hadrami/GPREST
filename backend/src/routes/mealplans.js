// backend/src/routes/mealplans.js
export default async function mealPlansRoutes(fastify) {
  const { prisma } = fastify;

  function startOfWeekISO(iso) {
    const d = new Date(`${iso}T00:00:00Z`);
    const day = d.getUTCDay(); // 0..6 (Sun..Sat)
    const diff = (day + 6) % 7; // Monday=0
    d.setUTCDate(d.getUTCDate() - diff);
    return d;
  }
  function startOfMonthISO(iso) {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(1);
    return d;
  }
  function endOfRange(from, mode) {
    const d = new Date(from);
    if (mode === "week") d.setUTCDate(d.getUTCDate() + 7);
    else if (mode === "month") d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCDate(d.getUTCDate() + 1); // day
    return d;
  }

  // GET list
  fastify.get("/", { preHandler: [fastify.auth] }, async (req) => {
    const {
      search = "",
      meal = "",
      mode = "all", // all | day | week | month
      date,         // base date for range when mode != all
      page = 1,
      pageSize = 20,
      order = "desc",
    } = req.query || {};

    const skip = (Number(page) - 1) * Number(pageSize);
    const take = Number(pageSize);

    // Date range
    let dateFilter = {};
    if (mode !== "all" && date) {
      let from;
      if (mode === "week") from = startOfWeekISO(date);
      else if (mode === "month") from = startOfMonthISO(date);
      else from = new Date(`${date}T00:00:00Z`); // day
      const to = endOfRange(from, mode === "day" ? "day" : mode);
      dateFilter = { gte: from, lt: to };
    }

    const where = {
      ...(meal ? { meal } : {}),
      ...(dateFilter.gte ? { date: dateFilter } : {}),
      ...(search
        ? {
            person: {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { matricule: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.mealPlan.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: order === "asc" ? "asc" : "desc" },
        select: {
          id: true,
          date: true,
          meal: true,
          planned: true,
          createdAt: true,
          person: {
            select: {
              id: true,
              matricule: true,
              name: true,
              email: true,
              establishment: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.mealPlan.count({ where }),
    ]);

    return { items, total, page: Number(page), pageSize: Number(pageSize) };
  });

  // DELETE
  fastify.delete("/:id", { preHandler: [fastify.auth] }, async (req) => {
    await prisma.mealPlan.delete({ where: { id: req.params.id } });
    return { ok: true };
  });
  fastify.delete("/delete", {
    // optionally add auth/role guard here
    // preHandler: [fastify.verifyAdmin], 
  }, async (req, reply) => {
    try {
      const result = await prisma.mealPlan.deleteMany({});
      return reply.send({ ok: true, deleted: result.count });
    } catch (e) {
      fastify.log.error(e);
      return reply.status(500).send({ message: "Impossible d'effacer les repas." });
    }
  });
}
