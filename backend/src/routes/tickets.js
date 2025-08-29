// src/routes/tickets.js
export default async function ticketsRoutes(fastify) {
    const secured = fastify.auth ? { preHandler: [fastify.auth] } : {};
  
    fastify.get("/_ping", async () => ({ ok: true, scope: "tickets" }));
  
    // validate a scanned ticket (stub)
    fastify.post("/validate", secured, async (req, reply) => {
      return reply.code(501).send({ ok: false, message: "Not implemented yet" });
    });
  
    // single ticket PDF (stub)
    fastify.get("/:code/pdf", secured, async (req, reply) => {
      return reply.code(501).send({ ok: false, message: "Not implemented yet" });
    });
  }
  