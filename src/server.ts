import "dotenv/config";
import { app } from "./app.js";

const BASE_URL = process.env.BASE_URL ? process.env.BASE_URL : 'http://localhost' ;
const PORT = Number(process.env.PORT) ? process.env.PORT : 3000;

app.listen(PORT, () => {
    console.log(`🔥Server a correr em: ${BASE_URL}:${PORT}🔥`);
});