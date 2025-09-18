// backend/index.js  (ESM)
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, ".env") });

const fastify = Fastify({ logger: true });

// CORS + JWT
await fastify.register(fastifyCors, {
  origin: ["https://gpcou.com", "https://www.gpcou.com"],
  credentials: true,
});
await fastify.register(fastifyJwt, { secret: process.env.JWT_SECRET });

// Multipart (if needed globally) + Prisma
await fastify.register(fastifyMultipart, {
  attachFieldsToBody: false,
  limits: { fileSize: 20 * 1024 * 1024, files: 5 },
});
const prisma = new PrismaClient();
fastify.decorate("prisma", prisma);

// Auth decorators (auth, adminOnly, etc.)
import authPlugin from "./src/plugins/auth.js";
await fastify.register(authPlugin);

// Safer JSON parser
fastify.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (req, body, done) => {
    try {
      done(null, JSON.parse(body));
    } catch (e) {
      e.statusCode = 400;
      done(e);
    }
  }
);

// ------------------- Routes -------------------

// Public auth
import authRoutes from "./src/routes/auth.js";
await fastify.register(authRoutes, { prefix: "/api/auth" });

// /scan — authenticated (ADMIN or SCAN_AGENT). MANAGER must NOT access.
await fastify.register(async function (instance) {
  instance.addHook("preHandler", instance.auth);
  instance.addHook("preHandler", async (req, reply) => {
    const role = String(req.user?.role || "").toUpperCase();
    if (role !== "ADMIN" && role !== "SCAN_AGENT") {
      return reply.code(403).send({ message: "Forbidden" });
    }
  });
  const scanRoutes = (await import("./src/routes/scan.js")).default;
  await instance.register(scanRoutes, { prefix: "/api/scan" });
});

// Feature routes — ADMIN (full) or MANAGER (scoped)
await fastify.register(async function (instance) {
  instance.addHook("preHandler", instance.auth);

  // Role allowlist: ADMIN or MANAGER
  instance.addHook("preHandler", async (req, reply) => {
    const role = String(req.user?.role || "").toUpperCase();
    if (role !== "ADMIN" && role !== "MANAGER") {
      return reply.code(403).send({ message: "Forbidden" });
    }
    // If MANAGER → hard-scope to their establishmentId (cannot be overridden by client)
    if (role === "MANAGER") {
      const eid =
        req.user?.establishmentId ??
        req.user?.etablissementId ??
        req.user?.establishment?.id;
      if (!eid) {
        return reply
          .code(403)
          .send({ message: "Manager missing establishmentId" });
      }
      if (req.method === "GET") {
        req.query = { ...(req.query || {}), establishmentId: String(eid) };
      } else {
        req.body = { ...(req.body || {}), establishmentId: String(eid) };
      }
    }
  });

  const students = (await import("./src/routes/students.js")).default;
  await instance.register(students, { prefix: "/api/students" });

  const mealplans = (await import("./src/routes/mealplans.js")).default;
  await instance.register(mealplans, { prefix: "/api/mealplans" });

  const plans = (await import("./src/routes/plans.js")).default;
  await instance.register(plans, { prefix: "/api/plans" });

  const establishments = (await import("./src/routes/establishments.js"))
    .default;
  await instance.register(establishments, { prefix: "/api/establishments" });

  const reports = (await import("./src/routes/reports.js")).default;
  await instance.register(reports, { prefix: "/api/reports" });
});

// Health
fastify.get("/api/health", async () => ({ ok: true }));

// Start
const port = Number(process.env.PORT || 3000);
fastify
  .listen({ port, host: "0.0.0.0" })
  .then(() => fastify.log.info(`API on :${port}`))
  .catch((err) => {
    fastify.log.error(err);
    process.exit(1);
  });
