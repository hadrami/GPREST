// backend/src/routes/tickets.js
import QRCode from "qrcode";
import crypto from "crypto";
import puppeteer from "puppeteer";

function isAdmin(req) { return req.user?.role === "ADMIN"; }

// Signature HMAC pour sécuriser le QR (payload -> signature)
function signPayload(payloadBase64) {
  const key = process.env.QR_SECRET;
  return crypto.createHmac("sha256", key).update(payloadBase64).digest("hex");
}

export default async function routes(fastify) {
  const { prisma } = fastify;

  // --------- GENERATE
  fastify.post("/generate", { preHandler: [fastify.auth] }, async (req, reply) => {
    const {
      startDate, // "2025-09-01"
      endDate,   // "2025-09-07"
      meals = ["PETIT_DEJEUNER","DEJEUNER","DINER"],
      etablissementId,   // admin : ciblage optionnel ; non-admin : ignoré (on force le sien)
      replace = false,   // si true : supprime/recrée les tickets existants du batch
    } = req.body || {};

    if (!startDate || !endDate || !Array.isArray(meals) || meals.length === 0) {
      return reply.code(400).send({ message: "startDate, endDate et meals requis" });
    }

    const scopeEtabId = isAdmin(req) ? (etablissementId ?? null) : (req.user?.establishmentId ?? null);
    if (!scopeEtabId) return reply.code(400).send({ message: "Aucun établissement déterminé" });

    // Étudiants de l’établissement (ou global si admin veut tout ? ici : ciblé)
    const students = await prisma.student.findMany({
      where: { etablissementId: scopeEtabId },
      select: { id: true, matricule: true, name: true },
    });
    if (students.length === 0) return { ok: true, created: 0, info: "Aucun étudiant" };

    // Batch
    const batch = await prisma.ticketBatch.create({
      data: {
        weekStart: new Date(startDate),
        weekEnd: new Date(endDate),
        etablissementId: scopeEtabId,
        createdById: req.user.id,
      },
    });

    // Option : supprimer tickets existants recouvrant la période pour ce batch/étab/repas
    if (replace) {
      await prisma.ticket.deleteMany({
        where: {
          batchId: batch.id,
        },
      });
    }

    // Génération tickets : pour chaque jour * chaque repas * chaque étudiant
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }

    const toCreate = [];
    for (const day of days) {
      for (const meal of meals) {
        for (const s of students) {
          // payload minimal : {t:<ticketId>, d:<date>, m:<meal>}
          // Mais on signe AVANT d’avoir un id. On signe sur {studentId,date,meal,batchId}
          const payloadObj = {
            studentId: s.id,
            d: day.toISOString().slice(0,10),
            m: meal,
            batchId: batch.id,
          };
          const payloadStr = JSON.stringify(payloadObj);
          const payloadBase64 = Buffer.from(payloadStr).toString("base64url");
          const sig = signPayload(payloadBase64);

          toCreate.push({
            studentId: s.id,
            etablissementId: scopeEtabId,
            batchId: batch.id,
            date: day,
            meal,
            payloadBase64,
            sig,
          });
        }
      }
    }

    // Insertion en masse (chunk si trop gros)
    const chunk = 1000;
    for (let i = 0; i < toCreate.length; i += chunk) {
      await prisma.ticket.createMany({ data: toCreate.slice(i, i + chunk), skipDuplicates: true });
    }

    return { ok: true, batchId: batch.id, created: toCreate.length };
  });

  // --------- LIST BATCHES
  fastify.get("/batches", { preHandler: [fastify.auth] }, async (req) => {
    const where = isAdmin(req) ? {} : { etablissementId: req.user.establishmentId ?? "__none__" };
    const batches = await prisma.ticketBatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { etablissement: true, tickets: false },
    });
    return { items: batches };
  });

  // --------- PDF FOR BATCH
  fastify.get("/batches/:id/pdf", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { id } = req.params;
    const batch = await prisma.ticketBatch.findUnique({ where: { id } });
    if (!batch) return reply.code(404).send({ message: "Batch introuvable" });
    if (!isAdmin(req) && batch.etablissementId !== req.user.establishmentId) {
      return reply.code(403).send({ message: "Interdit" });
    }

    const tickets = await prisma.ticket.findMany({
      where: { batchId: id },
      include: { student: true },
      orderBy: [{ date: "asc" }, { meal: "asc" }, { student: { name: "asc" } }],
    });

    // HTML simple : 8 tickets par page (2 colonnes x 4 lignes)
    const chunks = [];
    const size = 16;
    for (let i = 0; i < tickets.length; i += size) chunks.push(tickets.slice(i, i + size));

    // Construire HTML avec QR DataURLs
    const blocks = [];
    for (const page of chunks) {
      const cards = [];
      for (const t of page) {
        const qrText = JSON.stringify({ p: t.payloadBase64, s: t.sig });
        const qrDataUrl = await QRCode.toDataURL(qrText, { margin: 0, scale: 4 });
        cards.push(`
          <div class="card">
            <img src="${qrDataUrl}" />
            <div class="meta">
              <div class="line"><b>${t.student.name}</b> — ${t.student.matricule}</div>
               <div class="line"><b>${t.student.etablissement.name}
              <div class="line">${new Date(t.date).toLocaleDateString()} — ${t.meal}</div>
              <div class="line">Ticket Id: ${t.batchId.slice(0,16)}
              …</div>
            </div>
          </div>`);
      }
      blocks.push(`<section class="page">${cards.join("")}</section>`);
    }

    const html = `
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 18mm; }
          body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif; }
          .page { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; page-break-after: always; }
          .card { border: 1px solid #ddd; padding: 8mm; border-radius: 6px; display: flex; gap: 8mm; align-items: center; }
          .card img { width: 100px; height: 100px; }
          .meta { font-size: 12px; }
          .line { margin-bottom: 4px; }
        </style>
      </head>
      <body>${blocks.join("")}</body></html>
    `;

    // Générer PDF avec Puppeteer
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();

    reply.header("content-disposition", `attachment; filename="tickets_${id}.pdf"`);
    reply.type("application/pdf");
    return reply.send(pdf);
  });

  // --------- VALIDATE (utilisé par le Scanner)
  fastify.post("/validate", { preHandler: [fastify.auth] }, async (req, reply) => {
    const { payloadBase64, sig } = req.body || {};
    if (!payloadBase64 || !sig) return reply.code(400).send({ reason: "missing_params" });

    const expected = signPayload(payloadBase64);
    if (expected !== sig) return reply.code(400).send({ reason: "signature_invalid" });

    let obj;
    try { obj = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8")); }
    catch { return reply.code(400).send({ reason: "payload_invalid" }); }

    // Trouver le ticket
    const ticket = await prisma.ticket.findFirst({
      where: {
        batchId: obj.batchId,
        studentId: obj.studentId,
        date: new Date(obj.d),
        meal: obj.m,
        payloadBase64,
        sig,
      },
      include: { student: true },
    });
    if (!ticket) return reply.code(404).send({ reason: "not_found" });

    // Obsolescence : ticket valable le jour J seulement
    const today = new Date().toISOString().slice(0,10);
    if (obj.d !== today) return reply.code(400).send({ reason: "obsolete" });

    if (ticket.usedAt) return reply.code(400).send({ reason: "already_used" });

    await prisma.ticket.update({ where: { id: ticket.id }, data: { usedAt: new Date() } });

    return { ok: true, student: { matricule: ticket.student.matricule, nom: ticket.student.name }, meal: obj.m };
  });
}
