// backend/src/routes/reports.js
export default async function reportsRoutes(fastify) {
  const { prisma } = fastify;

  // GET /api/reports/by-day?date=YYYY-MM-DD&meal=&establishmentId=&type=&status=
  fastify.get("/by-day", { preHandler: [fastify.auth] }, async (req) => {
    const { date, meal, establishmentId, type, status } = req.query || {};
    const d = date ? new Date(`${date}T00:00:00Z`) : new Date(new Date().toDateString());

    const wherePlan = {
      date: d,
      ...(meal ? { meal } : {}),
      ...(establishmentId ? { person: { establishmentId } } : {}),
      ...(type ? { person: { type } } : {}),
    };
    const whereCons = {
      date: d,
      ...(meal ? { meal } : {}),
      ...(establishmentId ? { person: { establishmentId } } : {}),
      ...(type ? { person: { type } } : {}),
    };

    const [planned, eaten] = await Promise.all([
      prisma.mealPlan.count({ where: wherePlan }),
      prisma.mealConsumption.count({ where: whereCons }),
    ]);
    const noShow = Math.max(0, planned - eaten);

    if (status === "used") {
      const items = await prisma.mealConsumption.findMany({
        where: whereCons, include: { person: { select: { name: true, matricule: true } } }
      });
      return { planned, eaten, noShow, used: items.map(i => i.person) };
    }
    if (status === "unused") {
      const plannedPeople = await prisma.mealPlan.findMany({ where: wherePlan, select: { personId: true } });
      const consumedPeople = await prisma.mealConsumption.findMany({ where: whereCons, select: { personId: true } });
      const usedSet = new Set(consumedPeople.map(x => x.personId));
      const unusedIds = plannedPeople.map(x => x.personId).filter(id => !usedSet.has(id));
      const persons = await prisma.person.findMany({
        where: { id: { in: unusedIds } },
        select: { name: true, matricule: true }
      });
      return { planned, eaten, noShow, unused: persons };
    }

    return { planned, eaten, noShow };
  });

  // GET /api/reports/by-week?weekStart=YYYY-MM-DD&meal=&establishmentId=&type=
  fastify.get("/by-week", { preHandler: [fastify.auth] }, async (req) => {
    const { weekStart, meal, establishmentId, type } = req.query || {};
    if (!weekStart) return { message: "weekStart requis" };
    const start = new Date(`${weekStart}T00:00:00Z`);
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);

    const wherePlan = {
      date: { gte: start, lt: end },
      ...(meal ? { meal } : {}),
      ...(establishmentId ? { person: { establishmentId } } : {}),
      ...(type ? { person: { type } } : {}),
    };
    const whereCons = { ...wherePlan };

    const [planned, eaten] = await Promise.all([
      prisma.mealPlan.count({ where: wherePlan }),
      prisma.mealConsumption.count({ where: whereCons }),
    ]);
    const noShow = Math.max(0, planned - eaten);

    return { planned, eaten, noShow };
  });

  // GET /api/reports/by-month?year=2025&month=9&meal=&establishmentId=&type=
  fastify.get("/by-month", { preHandler: [fastify.auth] }, async (req) => {
    const { year, month, meal, establishmentId, type } = req.query || {};
    const y = Number(year), m = Number(month);
    if (!y || !m) return { message: "year & month requis" };

    const start = new Date(Date.UTC(y, m - 1, 1));
    const end   = new Date(Date.UTC(y, m, 1));

    const wherePlan = {
      date: { gte: start, lt: end },
      ...(meal ? { meal } : {}),
      ...(establishmentId ? { person: { establishmentId } } : {}),
      ...(type ? { person: { type } } : {}),
    };
    const whereCons = { ...wherePlan };

    const [planned, eaten] = await Promise.all([
      prisma.mealPlan.count({ where: wherePlan }),
      prisma.mealConsumption.count({ where: whereCons }),
    ]);
    const noShow = Math.max(0, planned - eaten);

    return { planned, eaten, noShow };
  });
}
