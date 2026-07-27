import "reflect-metadata";
import "dotenv/config";
import path from "node:path";
import { DataSource } from "typeorm";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";
import { entities } from "./entities/index.js";

// Resolves to src/migrations under tsx and dist/migrations once built.
const migrationsDir = path.join(import.meta.dirname, "migrations", "*.{ts,js}");

export const AppDataSource = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD ?? "postgres",
    database: process.env.DB_NAME ?? "erp",

    // Migrations are the only way the schema changes. Never turn this on.
    synchronize: false,
    logging: process.env.DB_LOGGING === "true",

    // Entities are imported explicitly: glob patterns resolve unreliably
    // under ESM once the project is built to dist/.
    entities,
    migrations: [migrationsDir],

    namingStrategy: new SnakeNamingStrategy(),
});
