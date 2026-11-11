import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations usam a conexão direta do dono do schema (ADR-011). O runtime usa DATABASE_URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env["DATABASE_URL_MIGRATOR"] ?? "postgresql://placeholder@localhost/placeholder",
  },
});
