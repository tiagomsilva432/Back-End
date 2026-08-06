import { z } from "zod";
import { UserRole } from "../../types/enums.js";

export const jwtClaimsSchema = z.object({
    sub: z.string().meta({ example: "1" }),
    companyId: z.number().meta({ example: 1 }),
    role: z.enum(UserRole).meta({ example: UserRole.Employee }),
}).meta({ id: "JwtClaims", description: "Claims assinadas no token de acesso" });

export const jwtPayloadSchema = jwtClaimsSchema.extend({
    iat: z.number(),
    exp: z.number(),
}).meta({ id: "JwtPayload", description: "Payload completo do token de acesso" });

export type JwtClaims = z.infer<typeof jwtClaimsSchema>;
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;
