// backend/index.js  (ESM)
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import { PrismaClient } from "@prisma/client"; // if you use Prisma here

// If you need uploads, uncomment the next two lines
// import fastifyMultipart from "@fastify/multipart";
// import { PrismaClient } from "@prisma/client"; // if you use Prisma here

// --- env ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, ".env") });

// --- server ---
const fastify = Fastify({ logger: true });

// --- core plugins ---
await fastify.register(fastifyCors, { origin: true, credentials: true });
await fastify.register(fastifyJwt, { secret: process.env.JWT_SECRET });

// Optional: multipart & prisma if you need them globally
 await fastify.register(fastifyMultipart, {
   attachFieldsToBody: false,
   limits: { fileSize: 20 * 1024 * 1024, files: 5 },
 });
 const prisma = new PrismaClient();
 fastify.decorate("prisma", prisma);

// --- auth decorators (adds fastify.auth & fastify.adminOnly) ---
import authPlugin from "./src/plugins/auth.js"; // your plugin exporting auth/adminOnly
await fastify.register(authPlugin); // verifies JWT & checks role === 'admin' for adminOnly
// (See your plugin for details.) :contentReference[oaicite:2]{index=2}

// Safer JSON parser
fastify.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  try { done(null, JSON.parse(body)); } catch (e) { e.statusCode = 400; done(e); }
});

// ------------------- ROUTES -------------------

// Auth (public)
import authRoutes from "./src/routes/auth.js";
await fastify.register(authRoutes, { prefix: "/api/auth" });

// SCAN — any authenticated role (scan_agent or admin)
await fastify.register(async function (instance) {
  instance.addHook("preHandler", instance.auth);
  const scanRoutes = (await import("./src/routes/scan.js")).default || (await import("./src/routes/scan.js"));
  await instance.register(scanRoutes, { prefix: "/api/scan" });
});

// ADMIN-ONLY — everything else (role === 'admin')
await fastify.register(async function (instance) {
  instance.addHook("preHandler", instance.auth);
  instance.addHook("preHandler", instance.adminOnly);

  const students = (await import("./src/routes/students.js")).default || (await import("./src/routes/students.js"));
  await instance.register(students, { prefix: "/api/students" });

  const mealplans = (await import("./src/routes/mealplans.js")).default || (await import("./src/routes/mealplans.js"));
  await instance.register(mealplans, { prefix: "/api/mealplans" });

  const plans = (await import("./src/routes/plans.js")).default || (await import("./src/routes/plans.js"));
  await instance.register(plans, { prefix: "/api/plans" });

  const establishments = (await import("./src/routes/establishments.js")).default || (await import("./src/routes/establishments.js"));
  await instance.register(establishments, { prefix: "/api/establishments" });


  const reports = (await import("./src/routes/reports.js")).default || (await import("./src/routes/reports.js"));
  await instance.register(reports, { prefix: "/api/reports" });

  // add more admin areas here as needed...
});

// Health & root
fastify.get("/", async () => ({ ok: true, service: "GPRest API" }));
fastify.get("/api/health", async () => ({ status: "ok", ts: Date.now() }));

// Start
const port = Number(process.env.PORT || 3000);
await fastify.listen({ host: "0.0.0.0", port });

// Optional: print routes on ready (handy in dev)
fastify.ready(() => {
  console.log(fastify.printRoutes());
});
