// backend/src/routes/students.js
import xlsx from "xlsx";

const TYPE_MAP = new Map([
  ["etudiant", "STUDENT"], ["étudiant", "STUDENT"], ["student", "STUDENT"],
  ["staff", "STAFF"], ["prof", "STAFF"], ["enseignant", "STAFF"],
  ["employe", "STAFF"], ["employé", "STAFF"], ["employee", "STAFF"],
]);

function normalizeType(val) {
  const t = String(val || "").trim().toLowerCase();
  return TYPE_MAP.get(t) || "STUDENT";
}

export default async function studentsRoutes(fastify) {
  const { prisma } = fastify;

  // ------- LIST (search + filters + pagination)
  fastify.get("/", { preHandler: [fastify.auth] }, async (req) => {
    const {
      search = "",
      establishmentId,
      type, // STUDENT | STAFF
      page = 1,
      pageSize = 20,
      order = "desc", // createdAt desc by default
    } = req.query || {};

    const skip = (Number(page) - 1) * Number(pageSize);
    const take = Number(pageSize);

    const where = {
      ...(establishmentId ? { establishmentId } : {}),
      ...(type ? { type } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { matricule: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.person.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: order === "asc" ? "asc" : "desc" },
        select: {
          id: true,
          matricule: true,
          name: true,
          email: true,
          type: true,
          createdAt: true,
          establishment: { select: { id: true, name: true } },
        },
      }),
      prisma.person.count({ where }),
    ]);

    return {
      items,
      total,
      page: Number(page),
      pageSize: Number(pageSize),
    };
  });

  // ------- GET ONE
  fastify.get("/:id", { preHandler: [fastify.auth] }, async (req, reply) => {
    const person = await prisma.person.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        matricule: true,
        name: true,
        email: true,
        type: true,
        createdAt: true,
        establishment: { select: { id: true, name: true } },
      },
    });
    if (!person) return reply.code(404).send({ message: "Not found" });
    return person;
  });

  // ------- CREATE
  fastify.post("/", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { matricule, name, establishmentId, email, type } = req.body || {};
    if (!matricule || !name || !establishmentId) {
      return reply.code(400).send({ message: "matricule, name, establishmentId requis" });
    }

    const existing = await prisma.person.findUnique({ where: { matricule } });
    if (existing) return reply.code(409).send({ message: "Matricule déjà existant" });

    const created = await prisma.person.create({
      data: {
        matricule: String(matricule).trim(),
        name: String(name).trim(),
        email: email ? String(email).trim() : null,
        establishmentId: establishmentId,
        type: normalizeType(type),
      },
      select: { id: true, matricule: true, name: true },
    });

    return { ok: true, person: created };
  });

  // ------- UPDATE
  fastify.put("/:id", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { id } = req.params;
    const { name, email, establishmentId, type } = req.body || {};

    const person = await prisma.person.findUnique({ where: { id } });
    if (!person) return reply.code(404).send({ message: "Not found" });

    const updated = await prisma.person.update({
      where: { id },
      data: {
        ...(name ? { name: String(name).trim() } : {}),
        ...(email !== undefined ? { email: email ? String(email).trim() : null } : {}),
        ...(establishmentId ? { establishmentId } : {}),
        ...(type ? { type: normalizeType(type) } : {}),
      },
      select: { id: true, matricule: true, name: true, email: true, type: true },
    });

    return { ok: true, person: updated };
  });

  // ------- DELETE
  fastify.delete("/:id", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { id } = req.params;
    try {
      await prisma.person.delete({ where: { id } });
      return { ok: true };
    } catch {
      return reply.code(404).send({ message: "Not found" });
    }
  });

  // ------- IMPORT XLSX/CSV (uses global @fastify/multipart — DO NOT register here)
  fastify.post("/import", { preHandler: [fastify.auth] }, async (req, reply) => {
    const file = await req.file(); // requires multipart globally in index.js
    if (!file) return reply.code(400).send({ message: "file is required" });

    const buf = await file.toBuffer();
    const wb = xlsx.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { defval: "", raw: false });
    if (!rows.length) return reply.code(400).send({ message: "Empty sheet" });

    const headers = Object.keys(rows[0]);
    // French-friendly header detection
    const colMatricule = headers.find(h => h.toLowerCase().includes("matricule")) || headers.find(h => h.toLowerCase().startsWith("mat"));
    const colName      = headers.find(h => h.toLowerCase().startsWith("nom")) || "nom";
    const colEtab      = headers.find(h => h.toLowerCase().includes("etabl")) || headers.find(h => h.toLowerCase().includes("institut")) || headers.find(h => h.toLowerCase().includes("ecole"));
    const colEmail     = headers.find(h => h.toLowerCase().includes("mail")) || headers.find(h => h.toLowerCase().includes("email"));
    const colType      = headers.find(h => h.toLowerCase() === "type");

    if (!colMatricule && !colEmail) return reply.code(400).send({ message: "Colonne 'matricule' (ou 'email') requise." });
    if (!colEtab) return reply.code(400).send({ message: "Colonne 'etablissement' requise." });

    // cache establishments by name (case-insensitive)
    const cacheEst = new Map();
    async function estIdByName(name) {
      const key = (name || "").trim();
      if (!key) return null;
      const k = key.toLowerCase();
      if (cacheEst.has(k)) return cacheEst.get(k);
      const est = await prisma.establishment.findFirst({
        where: { name: { equals: key, mode: "insensitive" } },
        select: { id: true }
      });
      const id = est?.id || null;
      cacheEst.set(k, id);
      return id;
    }

    let created = 0;
    let updated = 0;
    const problems = [];

    for (const r of rows) {
      const matricule = (r[colMatricule] || "").toString().trim();
      const email = (r[colEmail] || "").toString().trim() || null;
      const name = (r[colName] || "").toString().trim() || email || matricule;
      const etabName = (r[colEtab] || "").toString().trim();
      const type = normalizeType(r[colType]);
      const estId = await estIdByName(etabName);

      if (!matricule && !email) { problems.push({ row: r, reason: "missing matricule/email" }); continue; }
      if (!estId) { problems.push({ row: r, reason: `etablissement inconnu: ${etabName}` }); continue; }

      // Prefer upsert by matricule when present (unique)
      if (matricule) {
        const existing = await prisma.person.findUnique({ where: { matricule } });
        if (existing) {
          await prisma.person.update({
            where: { matricule },
            data: { name, email, establishmentId: estId, type },
          });
          updated++;
        } else {
          await prisma.person.create({
            data: { matricule, name, email, establishmentId: estId, type },
          });
          created++;
        }
      } else {
        // Fallback to email (less ideal, but allows creation for staff with no matricule)
        const existingByEmail = await prisma.person.findUnique({ where: { email } });
        if (existingByEmail) {
          await prisma.person.update({
            where: { email },
            data: { name, establishmentId: estId, type },
          });
          updated++;
        } else {
          await prisma.person.create({
            data: { matricule: `NO-MAT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, email, establishmentId: estId, type },
          });
          created++;
        }
      }
    }

    return { ok: true, created, updated, problems };
  });
}
