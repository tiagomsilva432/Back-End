import "reflect-metadata";
import "dotenv/config";
import { app } from "./app.js";
import { AppDataSource } from "./data-source.js";

const BASE_URL = process.env.BASE_URL ?? "http://localhost";
const PORT = Number(process.env.PORT) || 3000;

try {
    await AppDataSource.initialize();
    console.log("✅ Base de dados ligada");
} catch (err) {
    console.error("❌ Falha ao ligar à base de dados:", err);
    process.exit(1);
}

app.listen(PORT, () => {
    console.log(`🔥Server a correr em: ${BASE_URL}:${PORT}🔥`);
});
