import { z } from "zod";
import { UserRole } from "../../types/enums.js";

//Schema RESPONSE /auth/me
export const meResponseSchema = z.object({
    id: z.number().meta({ example: 1 }),
    companyId: z.number().meta({ example: 1 }),
    email: z.string().meta({ example: "user@exemplo.pt" }),
    role: z.enum(UserRole).meta({ example: UserRole.Employee }),
}).meta({ id: "MeResponse", description: "Dados do utilizador autenticado" });

export type MeResponse = z.infer<typeof meResponseSchema>;
