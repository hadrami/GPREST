// backend/src/routes/scan.js
import { inferMealFromClock } from "../utils/meals.js";

export default async function scanRoutes(fastify) {
  const { prisma } = fastify;

  // POST /api/scan  { matricule, meal?, date?, consume?: boolean }
  fastify.post("/", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { matricule, meal, date, consume } = req.body || {};
    if (!matricule) return reply.code(400).send({ message: "matricule requis" });

    const person = await prisma.person.findUnique({
      where: { matricule },
      select: { id: true, name: true, matricule: true, establishmentId: true, type: true }
    });
    if (!person) return reply.code(404).send({ status: "not_found", message: "Personne inconnue" });

    const d = date ? new Date(`${date}T00:00:00Z`) : new Date(new Date().toDateString());
    const m = meal || inferMealFromClock();

    const plan = await prisma.mealPlan.findUnique({
      where: { uniq_plan: { personId: person.id, date: d, meal: m } },
      select: { id: true }
    });
    if (!plan) return { status: "not_planned", person };

    const existing = await prisma.mealConsumption.findUnique({
      where: { uniq_consumption: { personId: person.id, date: d, meal: m } },
      select: { id: true, consumedAt: true }
    });
    if (existing) return { status: "already_consumed", person };

    if (consume) {
      await prisma.mealConsumption.create({
        data: {
          personId: person.id,
          date: d,
          meal: m,
          consumedAt: new Date(),
          scannerUserId: req.user?.id || null,
          establishmentId: person.establishmentId,
        }
      });
      return { status: "allowed", consumed: true, person };
    }

    return { status: "allowed", consumed: false, person };
  });
}
