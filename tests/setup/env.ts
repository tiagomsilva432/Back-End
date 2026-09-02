import "reflect-metadata";

process.env.NODE_ENV = "test";
process.env.BASE_URL = "http://localhost";
process.env.PORT = "3000";
process.env.SIGNUP_TOKEN_EXPIRATION_DAYS = "7";
process.env.JWT_SECRET = "segredo-de-teste-sem-valor-nenhum";
process.env.JWT_EXPIRES_IN = "1d";
process.env.BCRYPT_ROUNDS = "4";
