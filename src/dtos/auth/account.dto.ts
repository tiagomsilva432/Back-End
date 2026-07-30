import { z } from "zod";
import { USER_ROLES } from "../../types/enums.js";

//Schema REQUEST createAccount
export const createAccountSchema = z.object({
    company_id: z.number().min(1).meta({ example: 1 }),
    role: z.string().trim().toLowerCase().pipe(z.enum(USER_ROLES)).optional().meta({ example: "employee" }),
    email: z.string().trim().toLowerCase().pipe(z.email()).meta({ example: "user@exemplo.pt" }),
}).meta({ id: "CreateAccountRequest", description: "Dados para criar uma conta" });

//Schema REQUEST updateAccount
//export const updateAccountSchema = z.object({});
export type CreateAccountRequest = z.infer<typeof createAccountSchema>;
//export type updateAccountRequest = z.infer<typeof updateAccountSchema>;