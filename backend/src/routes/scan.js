// keep your existing header:
import { inferMealFromClock } from "../utils/meals.js";

export default async function scanRoutes(fastify) {
  const { prisma } = fastify;

  // POST /api/scan  { matricule, meal?, date?, consume?: boolean }
  fastify.post("/", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { matricule, meal, date, consume } = req.body || {};
    if (!matricule) return reply.code(400).send({ message: "matricule requis" });

    // 1) Person
    const person = await prisma.person.findUnique({
      where: { matricule: String(matricule).trim() },
      select: { id: true, name: true, matricule: true, establishmentId: true, type: true }
    });
    if (!person) return reply.code(404).send({ status: "not_found", message: "Personne inconnue" });

    // 2) Normalize date & meal
    const iso = date ? String(date).slice(0,10) : new Date().toISOString().slice(0,10);
    const d = new Date(`${iso}T00:00:00Z`);
    const m = meal || inferMealFromClock(); // expects PETIT_DEJEUNER | DEJEUNER | DINER

    // 3) Ensure a planned ticket exists
    const plan = await prisma.mealPlan.findUnique({
      where: { uniq_plan: { personId: person.id, date: d, meal: m } },
      select: { id: true }
    });
    if (!plan) return { status: "not_planned", person };

    // 4) Prevent double consumption
    const existing = await prisma.mealConsumption.findUnique({
      where: { uniq_consumption: { personId: person.id, date: d, meal: m } },
      select: { id: true, consumedAt: true }
    });
    if (existing) {
      return {
        status: "already_consumed",
        person,
        date: iso,
        meal: m,
        consumedAt: existing.consumedAt
      };
    }

    // 5) Optionally record consumption (idempotent thanks to uniq_consumption)
    if (consume) {
      const created = await prisma.mealConsumption.create({
        data: { personId: person.id, date: d, meal: m, consumedAt: new Date() },
        select: { id: true, consumedAt: true }
      });
      return { status: "consumed", person, date: iso, meal: m, consumedAt: created.consumedAt };
    }

    // 6) Only verify (no write)
    return { status: "ok", person, date: iso, meal: m };
  });
}
