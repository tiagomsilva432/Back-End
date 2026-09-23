import { z } from "zod";
import { UserRole } from "../../types/enums.js";

export const jwtClaimsSchema = z.object({
    sub: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    companyId: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    role: z.enum(UserRole).meta({ example: UserRole.Employee }),
}).meta({ id: "JwtClaims", description: "Claims assinadas no token de acesso" });

export const jwtPayloadSchema = jwtClaimsSchema.extend({
    iat: z.number(),
    exp: z.number(),
}).meta({ id: "JwtPayload", description: "Payload completo do token de acesso" });

export type JwtClaims = z.infer<typeof jwtClaimsSchema>;
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;
