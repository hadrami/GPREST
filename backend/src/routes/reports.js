// src/routes/reports.js
export default async function reportsRoutes(fastify) {
    const secured = fastify.auth ? { preHandler: [fastify.auth] } : {};
  
    fastify.get("/_ping", async () => ({ ok: true, scope: "reports" }));
  
    // summary report (stub)
    fastify.get("/summary", secured, async (req, reply) => {
      return reply.send({ ok: true, data: [], note: "Stub summary" });
    });
  
    // daily report (stub)
    fastify.get("/daily", secured, async (req, reply) => {
      return reply.send({ ok: true, data: [], note: "Stub daily" });
    });
  
    // monthly report (stub)
    fastify.get("/monthly", secured, async (req, reply) => {
      return reply.send({ ok: true, data: [], note: "Stub monthly" });
    });
  }
  