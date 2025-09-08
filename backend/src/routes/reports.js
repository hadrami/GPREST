// backend/src/routes/reports.js
export default async function routes(fastify) {
  const { prisma } = fastify;
  const isAdmin = (req) => req.user?.role === "ADMIN";
  const scope = (req) =>
    isAdmin(req) ? {} : (req.user?.establishmentId ? { etablissementId: req.user.establishmentId } : { id: "__none__" });

  // GET /api/reports/by-day?date=YYYY-MM-DD&meal=DEJEUNER&status=used|unused
  fastify.get("/by-day", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { date, meal, status = "used" } = req.query || {};
    if (!date) return reply.code(400).send({ message: "date requise (YYYY-MM-DD)" });

    const whereBase = { ...scope(req), date: new Date(date) };
    if (meal) whereBase.meal = meal;

    if (status === "used") {
      const tickets = await prisma.ticket.findMany({
        where: { ...whereBase, usedAt: { not: null } },
        include: { student: true },
      });
      const items = tickets.map(t => t.student); // un ticket / étudiant / jour / repas => déjà unique
      return { items, totals: { used: tickets.length } };
    } else {
      // Unused = tickets non consommés pour ce jour/repas
      const tickets = await prisma.ticket.findMany({
        where: { ...whereBase, usedAt: null },
        include: { student: true },
      });
      const items = tickets.map(t => t.student);
      return { items, totals: { unused: tickets.length } };
    }
  });

  // GET /api/reports/by-week?weekStart=YYYY-MM-DD&meal=optional
  fastify.get("/by-week", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { weekStart, meal } = req.query || {};
    if (!weekStart) return reply.code(400).send({ message: "weekStart requis (YYYY-MM-DD)" });
    const start = new Date(weekStart);
    const end = new Date(start); end.setDate(end.getDate() + 6); // 7 jours

    const where = {
      ...scope(req),
      date: { gte: start, lte: end },
      usedAt: { not: null },
      ...(meal ? { meal } : {}),
    };

    const used = await prisma.ticket.findMany({
      where, select: { studentId: true, date: true }
    });

    // uniques par étudiant
    const uniq = new Set(used.map(u => u.studentId));
    // histogramme par jour
    const byDay = {};
    for (const u of used) {
      const d = u.date.toISOString().slice(0,10);
      byDay[d] = (byDay[d] || 0) + 1;
    }

    // liste des étudiants (uniques)
    const students = await prisma.student.findMany({
      where: { id: { in: [...uniq] } },
      include: { etablissement: true },
      orderBy: { name: "asc" },
    });

    return { items: students, totals: { unique: students.length, byDay } };
  });

  // GET /api/reports/by-month?year=2025&month=09&meal=optional
  fastify.get("/by-month", { preHandler: [fastify.auth] }, async (req, reply) => {
    const year = Number(req.query?.year);
    const month = Number(req.query?.month); // 01..12
    const { meal } = req.query || {};
    if (!year || !month) return reply.code(400).send({ message: "year et month requis" });

    const start = new Date(`${year}-${String(month).padStart(2,"0")}-01T00:00:00Z`);
    const end = new Date(start); end.setMonth(end.getMonth() + 1); end.setDate(end.getDate() - 1);

    const where = {
      ...scope(req),
      date: { gte: start, lte: end },
      usedAt: { not: null },
      ...(meal ? { meal } : {}),
    };

    const used = await prisma.ticket.findMany({ where, select: { studentId: true, date: true } });
    const uniq = new Set(used.map(u => u.studentId));

    // byWeek: ISO week number
    const weekKey = (d) => {
      const dt = new Date(d);
      const dayNum = (dt.getUTCDay() + 6) % 7;
      dt.setUTCDate(dt.getUTCDate() - dayNum + 3);
      const firstThursday = new Date(Date.UTC(dt.getUTCFullYear(),0,4));
      const week = 1 + Math.round(((dt - firstThursday) / 86400000 - 3) / 7);
      return `${dt.getUTCFullYear()}-W${String(week).padStart(2,"0")}`;
    };
    const byWeek = {};
    for (const u of used) {
      const wk = weekKey(u.date);
      byWeek[wk] = (byWeek[wk] || 0) + 1;
    }

    const students = await prisma.student.findMany({
      where: { id: { in: [...uniq] } },
      include: { etablissement: true },
      orderBy: { name: "asc" },
    });

    return { items: students, totals: { unique: students.length, byWeek } };
  });
}
