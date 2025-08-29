// backend/index.js (ESM)
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import { PrismaClient } from "@prisma/client";

// 1) Load env from backend/.env (index.js is already in backend/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, ".env") });

// 2) Start Fastify
const app = Fastify({ logger: true });

// 3) Hard-fail if envs are missing
for (const k of ["DATABASE_URL", "JWT_SECRET"]) {
  if (!process.env[k]) {
    app.log.error(`${k} missing in backend/.env`);
    process.exit(1);
  }
}

// 4) Prisma + plugins
const prisma = new PrismaClient();
app.decorate("prisma", prisma);

await app.register(fastifyCors, { origin: true, credentials: true });
await app.register(fastifyJwt, { secret: process.env.JWT_SECRET });

import authPlugin from "./src/plugins/auth.js";
import authRoutes from "./src/routes/auth.js";

await app.register(authPlugin);

// Primary mount
await app.register(authRoutes, { prefix: "/api/auth" });
// Alias for clients calling /auth/...
await app.register(authRoutes, { prefix: "/auth" });
// 8) Print all routes for sanity
app.ready(() => console.log(app.printRoutes()));

const port = Number(process.env.PORT || 3000);
await app.listen({ port, host: "0.0.0.0" });
