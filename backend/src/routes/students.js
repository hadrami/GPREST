// src/routes/students.js
import xlsx from "xlsx";

/**
 * Students routes
 * Prefix expected in index.js: app.register(studentsRoutes, { prefix: "/students" })
 *
 * Endpoints:
 *  GET    /              -> list (pagination + search)
 *  GET    /:id           -> get one
 *  POST   /              -> create one
 *  PUT    /:id           -> update one
 *  DELETE /:id           -> delete one
 *  POST   /import        -> import from Excel (.xlsx/.csv) [multipart field: "file"]
 */
export default async function studentsRoutes(fastify) {
  const { prisma } = fastify;

  // Helpers
  const toInt = (v, def) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
  };

  // GET /?page=&limit=&search=&establishmentId=
  fastify.get("/", { preHandler: [fastify.auth] }, async (req) => {
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
    const skip = (page - 1) * limit;

    const where = {};
    const search = (req.query.search || "").trim();
    if (search) {
      where.OR = [
        { matricule: { contains: search, mode: "insensitive" } },
        { nom: { contains: search, mode: "insensitive" } },
        { prenom: { contains: search, mode: "insensitive" } },
      ];
    }
    if (req.query.establishmentId) {
      where.etablissementId = req.query.establishmentId;
    }

    const [items, total] = await Promise.all([
      prisma.student.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { etablissement: true },
      }),
      prisma.student.count({ where }),
    ]);

    return { page, limit, total, items };
  });

  // GET /:id
  fastify.get("/:id", { preHandler: [fastify.auth] }, async (req, reply) => {
    const s = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: { etablissement: true },
    });
    if (!s) return reply.code(404).send({ message: "Student not found" });
    return s;
  });

  // POST /  { matricule, nom, prenom, establishmentId? , establishmentName? , active? }
  fastify.post("/", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { matricule, nom, prenom, establishmentId, establishmentName, active = true } = req.body || {};
    if (!matricule || !nom || !prenom || (!establishmentId && !establishmentName)) {
      return reply.code(400).send({ message: "Missing required fields" });
    }

    let etabId = establishmentId;
    if (!etabId) {
      const name = String(establishmentName).trim();
      const etab = await prisma.establishment.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      etabId = etab.id;
    }

    const student = await prisma.student.create({
      data: { matricule: String(matricule).trim(), nom, prenom, etablissementId: etabId, active: !!active },
    });
    return reply.code(201).send(student);
  });

  // PUT /:id
  fastify.put("/:id", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { matricule, nom, prenom, establishmentId, establishmentName, active } = req.body || {};
    const data = {};
    if (matricule) data.matricule = String(matricule).trim();
    if (nom) data.nom = nom;
    if (prenom) data.prenom = prenom;
    if (typeof active === "boolean") data.active = active;

    if (establishmentId) {
      data.etablissementId = establishmentId;
    } else if (establishmentName) {
      const name = String(establishmentName).trim();
      const etab = await prisma.establishment.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      data.etablissementId = etab.id;
    }

    try {
      const updated = await prisma.student.update({
        where: { id: req.params.id },
        data,
      });
      return updated;
    } catch {
      return reply.code(404).send({ message: "Student not found" });
    }
  });

  // DELETE /:id
  fastify.delete("/:id", { preHandler: [fastify.auth] }, async (req, reply) => {
    try {
      await prisma.student.delete({ where: { id: req.params.id } });
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ message: "Student not found" });
    }
  });

  // POST /import  (multipart: file = .xlsx/.csv)
  fastify.post("/import", { preHandler: [fastify.auth] }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ message: "No file uploaded (field name should be 'file')." });

    const buf = await file.toBuffer();
    let rows = [];
    try {
      const wb = xlsx.read(buf, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = xlsx.utils.sheet_to_json(ws, { defval: "" });
    } catch {
      return reply.code(400).send({ message: "Unsupported file or malformed spreadsheet." });
    }

    // Normalize keys to lowercase for flexible column names
    const norm = (row) =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [String(k).trim().toLowerCase(), v]));

    const etabCache = new Map(); // name -> id
    let created = 0;
    let updated = 0;
    let etabCreated = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const r = norm(rows[i]);

      const matricule = String(r.matricule || r["matricule "] || r["nni"] || "").trim();
      const nom = String(r.nom || r["nom "] || "").trim();
      const prenom = String(r.prenom || r["prénom"] || r["prenom "] || "").trim();
      const etabName = String(r.etablissement || r["établissement"] || r["etablissement "] || "").trim();

      if (!matricule || !nom || !prenom || !etabName) {
        errors.push({ row: i + 2, reason: "Missing required columns (matricule, nom, prenom, etablissement)" });
        continue;
      }

      let etabId;
      if (etabCache.has(etabName)) {
        etabId = etabCache.get(etabName);
      } else {
        const before = await prisma.establishment.findUnique({ where: { name: etabName } });
        if (before) {
          etabId = before.id;
        } else {
          const e = await prisma.establishment.create({ data: { name: etabName } });
          etabCreated++;
          etabId = e.id;
        }
        etabCache.set(etabName, etabId);
      }

      const existing = await prisma.student.findUnique({ where: { matricule } });
      if (existing) {
        await prisma.student.update({
          where: { id: existing.id },
          data: { nom, prenom, etablissementId: etabId, active: true },
        });
        updated++;
      } else {
        await prisma.student.create({
          data: { matricule, nom, prenom, etablissementId: etabId, active: true },
        });
        created++;
      }
    }

    return {
      ok: true,
      rows: rows.length,
      created,
      updated,
      establishmentsCreated: etabCreated,
      errors, // array of {row, reason}
    };
  });
}
