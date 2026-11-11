import "dotenv/config";
import { defineConfig } from "prisma/config";

// A PoC não usa migrations: o setup é feito por setup.sql na conexão direta.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env["DATABASE_URL_UNPOOLED"] ?? "postgresql://placeholder@localhost/placeholder",
  },
});
