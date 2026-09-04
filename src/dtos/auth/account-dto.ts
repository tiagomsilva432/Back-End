import { z } from "zod";
import { UserRole } from "../../types/enums.js";

//Schema REQUEST createAccount
export const createAccountSchema = z.object({
    companyId: z.number().min(1).meta({ example: 1 }),
    role: z.string().trim().toLowerCase().pipe(z.enum(UserRole)).optional().meta({ example: UserRole.Employee }),
    email: z.string().trim().toLowerCase().pipe(z.email()).meta({ example: "user@exemplo.pt" }),
}).meta({ id: "CreateAccountRequest", description: "Dados para criar uma conta" });

export const activateAccountSchema = z.object({
    signupToken: z.string().min(1).meta({example: "197231u9phuodhu1d..."}),
    password: z.string()
    .min(8, { message: "Passord tem de ter pelo menos 8 caracteres!" })
    .regex(/[a-z]/, { message: "Password tem de ter pelo menos uma letra minúscula!" })
    .regex(/[A-Z]/, { message: "Password tem de ter pelo menos uma letra maiúscula!" })
    .regex(/[0-9]/, { message: "Password tem de conter pelo menos um número!" })
    .regex(/[@$!%*?&#]/, { message: "Password tem de ter pelo menos um caracter especial!" })
}).meta({ id: "ActivateAccountRequest", description: "Dados para ativar uma conta"});


export type CreateAccountRequest = z.infer<typeof createAccountSchema>;
export type ActivateAccountRequest = z.infer<typeof activateAccountSchema>;