// backend/src/routes/mealplans.self.js
export default async function mealPlansSelfRoutes(fastify) {
  const { prisma } = fastify;

  // ---- only authenticated STUDENT/STAFF
  const guard = async (req, reply) => {
    const r = String(req.user?.role || "").toUpperCase();
    if (r !== "STUDENT" && r !== "STAFF") {
      return reply.code(403).send({ message: "Forbidden" });
    }
  };

  // ---- helpers
  const MEAL_KEYS = ["petitDej", "dej", "diner"];
  const MEAL_ENUM = { petitDej: "PETIT_DEJEUNER", dej: "DEJEUNER", diner: "DINER" };

  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const parseYMD = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    if (!m) return null;
    return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  };
  const addDays = (d, n) => {
    const t = new Date(d);
    t.setUTCDate(t.getUTCDate() + n);
    return t;
  };
  const lastDayOfMonth = (y, m0) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

  function computeWindowsForMonth(y, m0) {
    const firstStart = new Date(Date.UTC(y, m0, 1));
    const firstEnd = new Date(Date.UTC(y, m0, 14));
    const secondStart = new Date(Date.UTC(y, m0, 15));
    const secondEnd = new Date(Date.UTC(y, m0, lastDayOfMonth(y, m0)));
    return [
      { start: firstStart, end: firstEnd },
      { start: secondStart, end: secondEnd },
    ];
  }
  function pickWindow(now = new Date()) {
    const n = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    for (let i = 0; i < 4; i++) {
      const y = n.getUTCFullYear();
      const m0 = n.getUTCMonth() + i;
      const wins = computeWindowsForMonth(y, m0);
      for (const w of wins) {
        const lockDate = addDays(w.start, -5);
        if (n >= w.start && n <= w.end) return { ...w, locked: n >= lockDate };
        if (n < lockDate) return { ...w, locked: false };
      }
    }
    const nx = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1));
    return { start: nx, end: new Date(Date.UTC(nx.getUTCFullYear(), nx.getUTCMonth(), 14)), locked: false };
  }
  function daysBetween(start, end) {
    const out = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) out.push(ymd(d));
    return out;
  }

  // ---- get matricule from token (username is the matricule)
  function getMatricule(req) {
    return String(req.user?.username || req.user?.matricule || "").trim();
  }
  function getType(req) {
    const r = String(req.user?.role || "").toUpperCase();
    return r === "STAFF" ? "STAFF" : "STUDENT";
  }

  // ---------- GET /api/mealplans/self ----------
  fastify.get("/self", { preHandler: [fastify.auth, guard] }, async (req, reply) => {
    const matricule = getMatricule(req);
    if (!matricule) return reply.code(404).send({ message: "Matricule manquant sur l’utilisateur." });

    const w = pickWindow(new Date());
    const choiceMap = {};
    for (const d of daysBetween(w.start, w.end)) {
      choiceMap[d] = { petitDej: false, dej: false, diner: false };
    }

    // No separate person fetch — filter via relation: person.matricule = username
    const items = await prisma.mealPlan.findMany({
      where: {
        date: { gte: w.start, lte: w.end },
        person: { matricule }, // relation filter — you already use the same idea elsewhere
      },
      select: { date: true, meal: true, planned: true },
    });

    for (const it of items) {
      if (!it.planned) continue;
      const day = ymd(new Date(it.date));
      if (it.meal === "PETIT_DEJEUNER") choiceMap[day].petitDej = true;
      else if (it.meal === "DEJEUNER") choiceMap[day].dej = true;
      else if (it.meal === "DINER") choiceMap[day].diner = true;
    }

    const anySelected = items.some((x) => x.planned === true);
    const status = getType(req) === "STAFF" && anySelected ? "PENDING_PAYMENT" : null;

    return { start: ymd(w.start), end: ymd(w.end), locked: w.locked, choices: choiceMap, status };
  });

  // ---------- POST /api/mealplans/self ----------
  fastify.post("/self", { preHandler: [fastify.auth, guard] }, async (req, reply) => {
    const matricule = getMatricule(req);
    if (!matricule) return reply.code(404).send({ message: "Matricule manquant sur l’utilisateur." });

    const { start, end, choices } = req.body || {};
    const startDate = parseYMD(start);
    const endDate = parseYMD(end);
    if (!startDate || !endDate || endDate < startDate) {
      return reply.code(400).send({ message: "Fenêtre invalide." });
    }

    const lockDate = addDays(startDate, -5);
    if (new Date() >= lockDate) {
      return reply.code(403).send({ message: "Période verrouillée (moins de 5 jours avant le début)." });
    }

    const wins = computeWindowsForMonth(startDate.getUTCFullYear(), startDate.getUTCMonth());
    const okWindow = wins.some((w) => w.start.getTime() === startDate.getTime() && w.end.getTime() === endDate.getTime());
    if (!okWindow) return reply.code(400).send({ message: "Fenêtre non autorisée." });

    // Build target set
    const selected = [];
    for (const day of daysBetween(startDate, endDate)) {
      const daySel = choices?.[day] || {};
      for (const k of MEAL_KEYS) if (daySel[k]) selected.push({ day, meal: MEAL_ENUM[k] });
    }

    // Atomic replace of this window for this matricule
    await prisma.$transaction(async (tx) => {
      // 1) delete existing rows for this user in the window
      await tx.mealPlan.deleteMany({
        where: {
          date: { gte: startDate, lte: endDate },
          person: { matricule },
        },
      });

      // 2) recreate rows
      for (const s of selected) {
        await tx.mealPlan.create({
          data: {
            date: new Date(`${s.day}T00:00:00Z`),
            meal: s.meal,
            planned: true,
            // Connect by matricule (must be unique in Person)
            person: { connect: { matricule } },
          },
        });
      }
    });

    const status = getType(req) === "STAFF" && selected.length > 0 ? "PENDING_PAYMENT" : null;
    return { ok: true, created: selected.length, updated: 0, deleted: 0, status };
  });
}
