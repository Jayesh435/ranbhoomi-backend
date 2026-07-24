import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { PrismaPg } from "@prisma/adapter-pg";

import { Pool } from "pg";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL is required");
}

const pool = new Pool({
  connectionString,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

export default prisma;
