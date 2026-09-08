import { z } from "zod";
import { UserRole } from "../../types/enums.js";

//Schema RESPONSE /auth/me
export const meResponseSchema = z.object({
    id: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    companyId: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    email: z.string().meta({ example: "user@exemplo.pt" }),
    role: z.enum(UserRole).meta({ example: UserRole.Employee }),
}).meta({ id: "MeResponse", description: "Dados do utilizador autenticado" });

export type MeResponse = z.infer<typeof meResponseSchema>;
