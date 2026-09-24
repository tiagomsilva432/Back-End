import type { JwtPayload } from "../dtos/auth/jwt-dto.js";
import type { User } from "../entities/User.js";

declare global {
    namespace Express {
        interface Request {
            auth?: JwtPayload;
            /** Set by requireRole: the row read from the database, not the claims. */
            currentUser?: User;
            /** Set by validateQuery: req.query itself is read-only in Express 5. */
            validQuery?: unknown;
        }
    }
}
