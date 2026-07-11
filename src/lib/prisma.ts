import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const url =
    process.env.TURSO_DATABASE_URL?.trim() ||
    `file:${process.cwd()}/dev.db`;
  const authToken = url.startsWith("file:")
    ? undefined
    : process.env.TURSO_AUTH_TOKEN?.trim() || undefined;
  const config = authToken ? { url, authToken } : { url };
  const adapter = new PrismaLibSql(config);
  return new PrismaClient({ adapter } as never);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
