// backend/src/routes/students.js
import * as XLSX from "xlsx";
import fs from "fs/promises";
import path from "path";

export default async function routes(fastify) {
  const { prisma } = fastify;

  // multipart (safe si déjà enregistré ailleurs)
  try {
    const multipart = await import("@fastify/multipart");
    await fastify.register(multipart.default, { limits: { fileSize: 20 * 1024 * 1024 } });
  } catch (_) {}

  const isAdmin = (req) => req.user?.role === "ADMIN";

  // Filtre d’étendue : un non-admin est restreint à son établissement
  const scopeFilter = (req) =>
    isAdmin(req)
      ? {}
      : (req.user?.establishmentId ? { etablissementId: req.user.establishmentId } : { id: "__none__" });

  // --- Normalisation stricte en FR (accepte accents/variantes)
  function normalizeRow(row) {
    const pick = (...keys) => {
      for (const k of keys) if (row[k] != null && row[k] !== "") return String(row[k]).trim();
      return "";
    };

    const matricule = pick("Matricule", "matricule", "Code");
    const nom = pick("Nom", "nom");
    const prenom = pick("Prénom", "Prenom", "prénom", "prenom");
    const nomComplet = pick("Nom complet", "Nom Complet", "Nomcomplet");
    const etab = pick("Établissement", "Etablissement", "etablissement", "établissement");
    const email = pick("Email", "email");

    const name = nomComplet || [prenom, nom].filter(Boolean).join(" ").trim() || nom;

    return { matricule, name, etab, email: email || null };
  }

  // Upsert étudiant à partir d’une ligne Excel
  async function upsertStudent(row, req) {
    const { matricule, name, etab, email } = normalizeRow(row);
    if (!matricule || !name) return { skipped: true, reason: "matricule/nom manquant" };

    // Déterminer etablissementId
    let etablissementId = null;
    if (isAdmin(req)) {
      if (etab) {
        const est = await prisma.establishment.upsert({
          where: { name: etab },
          update: {},
          create: { name: etab },
          select: { id: true },
        });
        etablissementId = est.id;
      }
    } else {
      etablissementId = req.user?.establishmentId ?? null;
    }

    const existing = await prisma.student.findUnique({ where: { matricule }, select: { id: true } });

    if (existing) {
      await prisma.student.update({
        where: { matricule },
        data: { name, email, etablissementId: etablissementId ?? undefined },
      });
      return { updated: 1 };
    } else {
      await prisma.student.create({
        data: { matricule, name, email, etablissementId },
      });
      return { created: 1 };
    }
  }

  async function importBuffer(buf, req) {
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

    let created = 0, updated = 0, skipped = 0;
    await prisma.$transaction(async () => {
      for (const r of rows) {
        const res = await upsertStudent(r, req);
        if (res?.created) created += res.created;
        else if (res?.updated) updated += res.updated;
        else skipped += 1;
      }
    });

    return { rows: rows.length, created, updated, skipped };
  }

  // -------- LIST
  fastify.get("/", { preHandler: [fastify.auth] }, async (req, reply) => {
    try {
      const { search = "", page = 1, pageSize = 20 } = req.query ?? {};
      const estIdFilter = req.query.etablissementId ?? req.query.establishmentId;

      const where = {
        ...scopeFilter(req),
        ...(estIdFilter ? { etablissementId: estIdFilter } : {}),
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

      const take = Math.max(1, Number(pageSize));
      const skip = (Math.max(1, Number(page)) - 1) * take;

      const [items, total] = await Promise.all([
        prisma.student.findMany({
          where,
          orderBy: [{ createdAt: "desc" }],
          include: { etablissement: true }, // ← IMPORTANT (selon ton schéma)
          skip,
          take,
        }),
        prisma.student.count({ where }),
      ]);

      return { items, total, page: Number(page), pageSize: take };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ message: "Erreur serveur lors du listing des étudiants." });
    }
  });

  // -------- CREATE
  fastify.post("/", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { matricule, name, email, etablissementId, establishmentId } = req.body ?? {};
    if (!matricule || !name) return reply.code(400).send({ message: "matricule et nom requis" });

    let estId = isAdmin(req) ? (etablissementId ?? establishmentId ?? null) : (req.user?.establishmentId ?? null);

    const created = await prisma.student.create({
      data: { matricule, name, email: email || null, etablissementId: estId },
    });
    return created;
  });

  // -------- UPDATE
  fastify.put("/:id", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { id } = req.params;
    const { name, email, etablissementId, establishmentId } = req.body ?? {};

    // Check scope pour non-admin
    if (!isAdmin(req)) {
      const s = await prisma.student.findUnique({ where: { id } });
      if (!s || s.etablissementId !== req.user.establishmentId) {
        return reply.code(403).send({ message: "Interdit" });
      }
    }

    const data = {
      name: name ?? undefined,
      email: email ?? undefined,
      etablissementId: isAdmin(req) ? (etablissementId ?? establishmentId ?? undefined) : undefined,
    };

    const updated = await prisma.student.update({ where: { id }, data });
    return updated;
  });

  // -------- DELETE
  fastify.delete("/:id", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { id } = req.params;

    if (!isAdmin(req)) {
      const s = await prisma.student.findUnique({ where: { id } });
      if (!s || s.etablissementId !== req.user.establishmentId) {
        return reply.code(403).send({ message: "Interdit" });
      }
    }

    await prisma.student.delete({ where: { id } });
    return { ok: true };
  });

  // -------- TEMPLATE XLSX (FR)
  fastify.get("/template", { preHandler: [fastify.auth] }, async (req, reply) => {
    const rows = [
      { Matricule: "S0001", Nom: "Diop", "Prénom": "Awa", Établissement: "Institut A", Email: "awa.diop@example.com" },
      { Matricule: "S0002", Nom: "Ba",   "Prénom": "Moussa", Établissement: "Institut B", Email: "moussa.ba@example.com" },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Étudiants");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    reply.header("content-disposition", 'attachment; filename="modele_etudiants.xlsx"');
    reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return reply.send(buf);
  });

  // -------- IMPORT : un seul fichier
  fastify.post("/import", { preHandler: [fastify.auth] }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ message: "file requis" });
    const buf = await file.toBuffer();
    const res = await importBuffer(buf, req);
    return { ok: true, ...res };
  });

  // -------- IMPORT depuis un dossier sur le serveur
  fastify.post("/import-from-folder", { preHandler: [fastify.auth] }, async (req, reply) => {
    const base = process.env.IMPORT_DIR;
    if (!base) return reply.code(400).send({ message: "Définissez IMPORT_DIR dans .env" });

    const files = (await fs.readdir(base)).filter((f) => f.toLowerCase().endsWith(".xlsx"));
    let total = 0, created = 0, updated = 0, skipped = 0;

    for (const name of files) {
      const buf = await fs.readFile(path.join(base, name));
      const r = await importBuffer(buf, req);
      total += r.rows; created += r.created; updated += r.updated; skipped += r.skipped;
    }

    return { ok: true, files: files.length, rows: total, created, updated, skipped };
  });
}
