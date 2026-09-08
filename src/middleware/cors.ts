import cors, { CorsOptions } from "cors";
import { corsOrigins, envIsDev } from "../env-vars.js";

const allowlist = corsOrigins();

if (!allowlist.length && !envIsDev) {
    console.warn(
        "[cors] CORS_ORIGINS não está definido: pedidos cross-origin vão ser bloqueados pelo browser."
    );
}

const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (!allowlist.length) return callback(null, envIsDev);
        return callback(null, allowlist.includes(origin));
    },
    credentials: false,
};

export const corsMiddleware = cors(corsOptions);
