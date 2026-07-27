import "dotenv/config";
import { app } from "./app.js";

const BASE_URL = process.env.BASE_URL;
const PORT = Number(process.env.PORT);

app.listen(PORT, () => {
    console.log(`🔥Server a correr em: ${BASE_URL}:${PORT}🔥`);
});