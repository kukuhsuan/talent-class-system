import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const url =
    process.env.TURSO_DATABASE_URL ??
    `file:${process.cwd()}/dev.db`;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const config = authToken ? { url, authToken } : { url };
  const adapter = new PrismaLibSql(config);
  return new PrismaClient({ adapter } as never);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
