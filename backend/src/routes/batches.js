// src/routes/batches.js
export default async function batchesRoutes(fastify) {
    const secured = fastify.auth ? { preHandler: [fastify.auth] } : {};
  
    // health/ping for this scope
    fastify.get("/_ping", async () => ({ ok: true, scope: "batches" }));
  
    // generate a weekly batch of tickets (stub)
    fastify.post("/generate", secured, async (req, reply) => {
      return reply.code(501).send({ ok: false, message: "Not implemented yet" });
    });
  
    // export all tickets of a batch as PDF (stub)
    fastify.get("/:id/export/pdf", secured, async (req, reply) => {
      return reply.code(501).send({ ok: false, message: "Not implemented yet" });
    });
  }
  