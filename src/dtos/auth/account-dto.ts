import { z } from "zod";
import { UserRole, UserStatus } from "../../types/enums.js";
import { signupTokenExpDate } from "../../env-vars.js";

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


//Schema RESPONSE createAccount
export const createAccountResponseSchema = z.object({
    id: z.number().meta({ example: 1 }),
    companyId: z.number().meta({ example: 1 }),
    email: z.string().meta({ example: "user@exemplo.pt" }),
    role: z.enum(UserRole).meta({ example: UserRole.Employee }),
    status: z.enum(UserStatus).meta({ example: UserStatus.Invited }),
    signupToken: z.string().nullable().meta({ example: "0e5f2a1c-..." }),
    signupTokenExpiresAt: z.iso.datetime().nullable(),
}).meta({
    id: "CreateAccountResponse",
    description: "Conta criada. O signupToken é o que segue no link de ativação.",
});

export type CreateAccountRequest = z.infer<typeof createAccountSchema>;
export type ActivateAccountRequest = z.infer<typeof activateAccountSchema>;