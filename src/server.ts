import "reflect-metadata";
import "dotenv/config";
import { app } from "./app.js";
import { AppDataSource } from "./data-source.js";
import { BASE_URL, PORT } from "./env-vars.js";
import { realtime } from "./services/realtime.js";

try {
    await AppDataSource.initialize();
    console.log("✅ Base de dados ligada");
} catch (err) {
    console.error("❌ Falha ao ligar à base de dados:", err);
    process.exit(1);
}

const server = app.listen(PORT, () => {
    console.log(`🔥Server a correr em: ${BASE_URL}:${PORT}`);
});

let shuttingDown = false;
const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} recebido, a encerrar...`);

    // Os streams abertos nunca acabam sozinhos: avisa-se e fecha-se antes.
    realtime.closeAll("server_shutdown");
    server.close();
    try {
        await AppDataSource.destroy();
    } catch (err) {
        console.error("Erro ao fechar a base de dados:", err);
    }
    process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
