// backend/src/routes/mealplans.js
export default async function mealPlansRoutes(fastify) {
  const { prisma } = fastify;

  /**
   * Parse YYYY-MM-DD -> Date at 00:00:00Z. Returns undefined if invalid/empty.
   */
  function parseYMD(ymd) {
    if (!ymd || typeof ymd !== "string") return undefined;
    const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return undefined;
    // Use UTC to avoid TZ shifts
    return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  }

  /**
   * Normalize meal string to enum if needed.
   * Accepts "", "PETIT_DEJEUNER" | "DEJEUNER" | "DINER" (any case).
   */
  function normalizeMeal(meal) {
    if (!meal) return "";
    const m = String(meal).toUpperCase();
    if (m === "PETIT_DEJEUNER" || m === "DEJEUNER" || m === "DINER") return m;
    return ""; // ignore unknown values
  }

  /**
   * Normalize person type to "STUDENT" | "STAFF" | "".
   */
  function normalizeType(type) {
    if (!type) return "";
    const t = String(type).toUpperCase();
    if (t === "STUDENT" || t === "STAFF") return t;
    return "";
  }

  /**
   * GET /api/mealplans
   * Query:
   *  - search: string (matches person.name/matricule/email, case-insensitive)
   *  - meal: "PETIT_DEJEUNER" | "DEJEUNER" | "DINER"
   *  - from: "YYYY-MM-DD" (inclusive)
   *  - to:   "YYYY-MM-DD" (exclusive, at 00:00:00Z of that day)
   *  - establishmentId: string (filters by person.establishmentId)
   *  - type: "STUDENT" | "STAFF" (filters by person.type)
   *  - page, pageSize: pagination (defaults 1, 20)
   *  - order: "asc" | "desc" (by date, default "desc")
   */
  fastify.get("/", { preHandler: [fastify.auth] }, async (req, reply) => {
    try {
      const {
        search = "",
        meal = "",
        from,
        to,
        establishmentId = "",
        type = "",
        page = 1,
        pageSize = 20,
        order = "desc",
      } = req.query || {};

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSizeNum = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 20)); // safety caps

      const mealNorm = normalizeMeal(meal);
      const typeNorm = normalizeType(type);
      const fromDate = parseYMD(from);
      const toDate = parseYMD(to);

      if (from && !fromDate) {
        return reply.code(400).send({ message: 'Paramètre "from" invalide. Format attendu: YYYY-MM-DD.' });
      }
      if (to && !toDate) {
        return reply.code(400).send({ message: 'Paramètre "to" invalide. Format attendu: YYYY-MM-DD.' });
      }
      if (fromDate && toDate && toDate <= fromDate) {
        return reply.code(400).send({ message: '"to" doit être strictement supérieur à "from".' });
      }

      const dateFilter =
        fromDate || toDate
          ? {
              gte: fromDate || undefined, // inclusive
              lt: toDate || undefined,     // exclusive
            }
          : undefined;

      // Build "where" with nested person filters (type, establishmentId, search)
      const personFilter =
        (search && search.trim()) || typeNorm || establishmentId
          ? {
              ...(typeNorm ? { type: typeNorm } : {}),
              ...(establishmentId ? { establishmentId } : {}),
              ...(search && search.trim()
                ? {
                    OR: [
                      { name: { contains: search.trim(), mode: "insensitive" } },
                      { matricule: { contains: search.trim(), mode: "insensitive" } },
                      { email: { contains: search.trim(), mode: "insensitive" } },
                    ],
                  }
                : {}),
            }
          : undefined;

      const where = {
        ...(mealNorm ? { meal: mealNorm } : {}),
        ...(dateFilter ? { date: dateFilter } : {}),
        ...(personFilter ? { person: personFilter } : {}),
      };

      const orderBy = { date: String(order).toLowerCase() === "asc" ? "asc" : "desc" };

      const [items, total] = await Promise.all([
        prisma.mealPlan.findMany({
          where,
          include: {
            person: {
              include: {
                establishment: true,
              },
            },
          },
          orderBy,
          skip: (pageNum - 1) * pageSizeNum,
          take: pageSizeNum,
        }),
        prisma.mealPlan.count({ where }),
      ]);

      return {
        items,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
      };
    } catch (e) {
      req.log.error(e);
      return reply.code(500).send({ message: "Impossible de récupérer les choix de repas." });
    }
  });

  /**
   * DELETE /api/mealplans/:id
   * Supprime un seul enregistrement (gardé pour compatibilité – le front n’affiche plus l’icône).
   */
  fastify.delete("/:id", { preHandler: [fastify.auth] }, async (req, reply) => {
    try {
      await prisma.mealPlan.delete({ where: { id: req.params.id } });
      return { ok: true };
    } catch (e) {
      req.log.error(e);
      return reply.code(500).send({ message: "Impossible de supprimer cet enregistrement." });
    }
  });

  /**
   * DELETE /api/mealplans/delete
   * Supprime TOUTES les lignes (garde-le derrière un rôle admin si nécessaire).
   */
  fastify.delete("/delete", { preHandler: [fastify.auth] }, async (req, reply) => {
    try {
      const result = await prisma.mealPlan.deleteMany({});
      return reply.send({ ok: true, deleted: result.count });
    } catch (e) {
      req.log.error(e);
      return reply.code(500).send({ message: "Impossible d'effacer les repas." });
    }
  });
}
