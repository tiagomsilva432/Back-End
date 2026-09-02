import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { execSync } from "node:child_process";

export default async function globalSetup(_globalConfig, projectConfig) {
    const container = await new PostgreSqlContainer("postgres:18-alpine")
        .withDatabase("erp_test")
        .withUsername("postgres")
        .withPassword("postgres")
        .withCommand([
            "postgres",
            "-c", "fsync=off",
            "-c", "synchronous_commit=off",
            "-c", "full_page_writes=off",
        ])
        .start();

    const dbEnv = {
        DB_HOST: container.getHost(),
        DB_PORT: String(container.getMappedPort(5432)),
        DB_USER: container.getUsername(),
        DB_PASSWORD: container.getPassword(),
        DB_NAME: container.getDatabase(),
        DB_LOGGING: "false",
    };

    try {
        execSync("npm run db:migrate", {
            cwd: projectConfig.rootDir,
            env: { ...process.env, ...dbEnv },
            stdio: "pipe",
        });
    } catch (error) {
        console.error("\nAs migrações falharam contra a base de dados de teste.\n");
        console.error(error.stdout?.toString() ?? "");
        console.error(error.stderr?.toString() ?? "");
        await container.stop();
        throw error;
    }

    globalThis.__PG_CONTAINER__ = container;
    Object.assign(process.env, dbEnv);
}