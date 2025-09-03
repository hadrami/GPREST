// backend/index.js (ESM)
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import { PrismaClient } from "@prisma/client";

// 1) Load env from backend/.env (index.js sits in /backend)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, ".env") });

// 2) Create server
const app = Fastify({ logger: true });

// 3) Validate required env
for (const k of ["DATABASE_URL", "JWT_SECRET"]) {
  if (!process.env[k]) {
    app.log.error(`${k} missing in backend/.env`);
    process.exit(1);
  }
}

// 4) Prisma + plugins
const prisma = new PrismaClient();
app.decorate("prisma", prisma);

// CORS open in dev; credentials enabled
await app.register(fastifyCors, { origin: true, credentials: true });

// JWT
await app.register(fastifyJwt, { secret: process.env.JWT_SECRET });

// 5) Auth plugin (adds fastify.auth)
import authPlugin from "./src/plugins/auth.js";
await app.register(authPlugin);

// 6) Routes
import authRoutes from "./src/routes/auth.js";

// Main mount (/api/auth/*)
await app.register(authRoutes, { prefix: "/api/auth" });
// Optional alias (/auth/*) if something calls it directly
await app.register(authRoutes, { prefix: "/auth" });

// Health
app.get("/health", async () => ({ ok: true }));

import studentsRoutes from "./src/routes/students.js";
await app.register(studentsRoutes, { prefix: "/api/students" });


// 7) Print routes (handy while wiring mobile)
app.ready(() => {
  console.log(app.printRoutes());
});

// 8) Listen on all interfaces for phone access
const port = Number(process.env.PORT || 3000);
await app.listen({ host: "0.0.0.0", port });
