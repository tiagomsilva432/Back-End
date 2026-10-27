import "reflect-metadata";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.BASE_URL = "http://localhost";
process.env.PORT = "3000";
process.env.FE_URL = "http://localhost:5173";
process.env.SIGNUP_TOKEN_EXPIRATION_DAYS = "7";
process.env.JWT_SECRET = "segredo-de-teste-sem-valor-nenhum";
process.env.JWT_EXPIRES_IN = "1d";
process.env.BCRYPT_ROUNDS = "4";
// Os uploads dos testes: o rollback desfaz as linhas, não o disco (ver tests/setup/db.ts).
process.env.UPLOADS_DIR = path.join(tmpdir(), `erp-test-uploads-${process.pid}`);
