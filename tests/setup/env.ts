/**
 * Ambiente de teste — corre ANTES de qualquer módulo da aplicação ser carregado.
 *
 * REGRA DE OURO DESTE FICHEIRO: zero imports de código da aplicação.
 * Em ESM os `import` estáticos são içados para cima do corpo do ficheiro, por
 * isso um `import { app } from "../../src/app.js"` aqui correria ANTES das
 * atribuições abaixo — e a app apanharia as variáveis erradas.
 */

// O reflect-metadata tem de ser carregado antes de qualquer decorator do
// TypeORM correr. Em produção isto vive no src/server.ts; nos testes, aqui.
import "reflect-metadata";

// Um ambiente fixo e previsível: "a simulação do ambiente perfeito".
// O dotenv (que o src/data-source.ts carrega mais tarde) NÃO sobrepõe
// variáveis já definidas, por isso estes valores ganham ao teu .env real.
process.env.NODE_ENV = "test";
process.env.BASE_URL = "http://localhost";
process.env.PORT = "3000";

// Esta falta no .env.example e no compose.yaml. Sem ela,
// signupTokenExpDate() devolve NaN -> new Date(NaN) -> "Invalid Date"
// no campo signupTokenExpiresAt do User. Fixamo-la aqui.
process.env.SIGNUP_TOKEN_EXPIRATION_DAYS = "7";

// O objeto DataSource continua a ser CONSTRUÍDO quando o módulo é importado
// (só nunca chega a ligar-se a nada). Damos-lhe valores plausíveis em vez de
// deixar tudo undefined.
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "5432";
process.env.DB_USER = "test";
process.env.DB_PASSWORD = "test";
process.env.DB_NAME = "test";
process.env.DB_LOGGING = "false";
