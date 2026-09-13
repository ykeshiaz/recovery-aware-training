// Single shared PrismaClient instance. Creating one per request (or per
// import, without this guard) exhausts Postgres connections fast --
// this is the standard Prisma pattern for avoiding that.
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
