// backend/src/routes/mealplans.self.js
export default async function mealPlansSelfRoutes(fastify) {
  const { prisma } = fastify;

  // --- helpers ---
  const MEAL_KEYS = ["petitDej", "dej", "diner"];
  const MEAL_ENUM = {
    petitDej: "PETIT_DEJEUNER",
    dej: "DEJEUNER",
    diner: "DINER",
  };

  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

  // Two half-month windows: 1..14 and 15..end
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

  // Pick the best window to show: current (if today <= end) else the next one whose lock hasn't passed
  function pickWindow(now = new Date()) {
    const n = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    // consider this month + two months ahead to be safe
    for (let i = 0; i < 4; i++) {
      const y = n.getUTCFullYear();
      const m0 = n.getUTCMonth() + i;
      const wins = computeWindowsForMonth(y, m0);
      for (const w of wins) {
        const lockDate = addDays(w.start, -5);
        // show current window if we're still within it (even if locked)
        if (n >= w.start && n <= w.end) return { ...w, locked: n >= lockDate };
        // else show the first upcoming window whose lock hasn't passed
        if (n < lockDate) return { ...w, locked: false };
      }
    }
    // fallback: next month first half
    const nx = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1));
    return { start: nx, end: new Date(Date.UTC(nx.getUTCFullYear(), nx.getUTCMonth(), 14)), locked: false };
  }

  function daysBetween(start, end) {
    const out = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) out.push(ymd(d));
    return out;
  }

  // Resolve current person from token (by matricule + type)
  async function getCurrentPerson(req) {
    const role = String(req.user?.role || "").toUpperCase();
    const type = role === "STAFF" ? "STAFF" : "STUDENT";
    const matricule =
      String(
        req.user?.matricule ||
          req.user?.studentId || // just in case
          ""
      ).trim();
    if (!matricule) return null;

    const person = await prisma.person.findFirst({
      where: { matricule, type },
      select: { id: true, type: true, matricule: true },
    });
    return person;
  }

  // ---------- GET /api/mealplans/self ----------
  fastify.get("/self", async (req, reply) => {
    const person = await getCurrentPerson(req);
    console.log("get /self for person:", person);
    if (!person) return reply.code(404).send({ message: "Personne introuvable pour cet utilisateur." });

    const w = pickWindow(new Date());
    const startYMD = ymd(w.start);
    const endYMD = ymd(w.end);

    // fetch existing rows for this window
    const items = await prisma.mealPlan.findMany({
      where: {
        personId: person.id,
        date: { gte: w.start, lte: w.end },
      },
      select: { date: true, meal: true, planned: true },
    });

    // build choices map: 'YYYY-MM-DD' -> { petitDej, dej, diner }
    const choiceMap = {};
    for (const day of daysBetween(w.start, w.end)) {
      choiceMap[day] = { petitDej: false, dej: false, diner: false };
    }
    for (const it of items) {
      if (!it.planned) continue;
      const day = ymd(new Date(it.date));
      if (!choiceMap[day]) continue;
      if (it.meal === "PETIT_DEJEUNER") choiceMap[day].petitDej = true;
      else if (it.meal === "DEJEUNER") choiceMap[day].dej = true;
      else if (it.meal === "DINER") choiceMap[day].diner = true;
    }

    // Simple status rule: STAFF with at least 1 selection → PENDING_PAYMENT (until an admin flow sets PAID)
    const anySelected = items.some((x) => x.planned === true);
    const status =
      String(req.user?.role || "").toUpperCase() === "STAFF" && anySelected
        ? "PENDING_PAYMENT"
        : null;

    return { start: startYMD, end: endYMD, locked: w.locked, choices: choiceMap, status };
  });

  // ---------- POST /api/mealplans/self ----------
  fastify.post("/self", async (req, reply) => {
    const person = await getCurrentPerson(req);
    console.log("post /self for person:", person, "body:", req.body);
    if (!person) return reply.code(404).send({ message: "Personne introuvable pour cet utilisateur." });

    const { start, end, choices } = req.body || {};
    const startDate = parseYMD(start);
    const endDate = parseYMD(end);
    if (!startDate || !endDate || endDate < startDate) {
      return reply.code(400).send({ message: "Fenêtre invalide." });
    }

    // Server-side lock (5 days before start)
    const lockDate = addDays(startDate, -5);
    const now = new Date();
    if (now >= lockDate) {
      return reply.code(403).send({ message: "Période verrouillée (moins de 5 jours avant le début)." });
    }

    // Only allow windows 1..14 or 15..end for the given month
    const wins = computeWindowsForMonth(startDate.getUTCFullYear(), startDate.getUTCMonth());
    const matchesWindow =
      wins.some((w) => w.start.getTime() === startDate.getTime() && w.end.getTime() === endDate.getTime());
    if (!matchesWindow) {
      return reply.code(400).send({ message: "Fenêtre non autorisée." });
    }

    // Build selected set from booleans
    const selected = new Set(); // "YYYY-MM-DD|ENUM"
    const allDays = daysBetween(startDate, endDate);
    for (const day of allDays) {
      const daySel = choices?.[day] || {};
      for (const k of MEAL_KEYS) {
        if (daySel[k]) selected.add(`${day}|${MEAL_ENUM[k]}`);
      }
    }

    // Read existing selections in window
    const existing = await prisma.mealPlan.findMany({
      where: { personId: person.id, date: { gte: startDate, lte: endDate } },
      select: { id: true, date: true, meal: true, planned: true },
    });

    console.log("Existing meal plans in window:", existing);

    const existingMap = new Map(existing.map((e) => [`${ymd(new Date(e.date))}|${e.meal}`, e]));
    let created = 0, updated = 0, deleted = 0;

    // 1) Upsert selected
    for (const key of selected) {
      const found = existingMap.get(key);
      if (!found) {
        const [day, meal] = key.split("|");
        await prisma.mealPlan.create({
          data: {
            personId: person.id,
            date: new Date(`${day}T00:00:00Z`),
            meal,
            planned: true,
          },
        });
        created++;
      } else if (!found.planned) {
        await prisma.mealPlan.update({ where: { id: found.id }, data: { planned: true } });
        updated++;
      }
    }

    // 2) Remove unselected rows
    for (const [key, row] of existingMap.entries()) {
      if (!selected.has(key)) {
        await prisma.mealPlan.delete({ where: { id: row.id } });
        deleted++;
      }
    }

    // Status for STAFF
    const status =
      String(req.user?.role || "").toUpperCase() === "STAFF" && selected.size > 0
        ? "PENDING_PAYMENT"
        : null;

    return { ok: true, created, updated, deleted, status };
  });
}
