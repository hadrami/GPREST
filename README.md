# GPRest

Local web app to manage meal tickets across multiple establishments (students, weekly ticket generation, one-time scan/validation, stats).

## Tech
- **Backend:** Fastify, Prisma (PostgreSQL), JWT, Argon2
- **Frontend:** React + Vite, Tailwind, Redux Toolkit, Axios

## Dev Setup

### Backend

cd backend 


cp .env.example .env   # put real values


npm i


npx prisma generate


npx prisma migrate deploy   # or: npx prisma db push (dev)



npm run dev



---### Frontend



cd frontend


npm i


npm run dev
