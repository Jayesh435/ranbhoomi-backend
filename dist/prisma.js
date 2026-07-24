"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DIRECT_URL or DATABASE_URL is required");
}
const pool = new pg_1.Pool({
    connectionString,
});
const prisma = new client_1.PrismaClient({
    adapter: new adapter_pg_1.PrismaPg(pool),
});
exports.default = prisma;
