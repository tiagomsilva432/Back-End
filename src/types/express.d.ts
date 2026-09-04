import type { JwtPayload } from "../dtos/auth/jwt-dto.js";

declare global {
    namespace Express {
        interface Request {
            auth?: JwtPayload;
        }
    }
}

export {};
