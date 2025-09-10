// backend/index.js (ESM)
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import { PrismaClient } from "@prisma/client";

// 1) Load env from backend/.env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, ".env") });

// 2) Server
const app = Fastify({ logger: true });

// 3) Fail fast if missing secrets
for (const k of ["DATABASE_URL", "JWT_SECRET"]) {
  if (!process.env[k]) {
    app.log.error(`${k} missing in backend/.env`);
    process.exit(1);
  }
}

// 4) Prisma
const prisma = new PrismaClient();
app.decorate("prisma", prisma);

// 5) Plugins
await app.register(fastifyCors, { origin: true, credentials: true });
await app.register(fastifyJwt, { secret: process.env.JWT_SECRET });
await app.register(fastifyMultipart, {
  attachFieldsToBody: false, // we will manually read fields + files
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB, adjust as needed
    files: 5,
  },
});
// 6) Auth decorator
import authPlugin from "./src/plugins/auth.js";
await app.register(authPlugin);

// Robust JSON parser
app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  try { done(null, JSON.parse(body)); } catch (e) { e.statusCode = 400; done(e); }
});

// 7) Routes
import authRoutes from "./src/routes/auth.js";                 // garde ton auth existant
await app.register(authRoutes, { prefix: "/api/auth" });

import establishmentsRoutes from "./src/routes/establishments.js";
await app.register(establishmentsRoutes, { prefix: "/api/establishments" });

import plansRoutes from "./src/routes/plans.js";
await app.register(plansRoutes, { prefix: "/api/plans" });

import scanRoutes from "./src/routes/scan.js";
await app.register(scanRoutes, { prefix: "/api/scan" });

import reportsRoutes from "./src/routes/reports.js";
await app.register(reportsRoutes, { prefix: "/api/reports" });

// (Optionnel) si tu gardes d’anciens endpoints:
try {
  const studentsRoutes = await import("./src/routes/students.js");
  await app.register(studentsRoutes.default || studentsRoutes, { prefix: "/api/students" });
} catch { /* ignore if absent */ }

// 8) Ready + Listen
app.ready(() => console.log(app.printRoutes()));
const port = Number(process.env.PORT || 3000);
await app.listen({ host: "0.0.0.0", port });
