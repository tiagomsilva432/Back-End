import { z } from "zod";
import { UserRole, UserStatus } from "../../types/enums.js";

/** Shared with the bootstrap CLI so both enforce the same rules. */
export const passwordSchema = z.string()
    .min(8, { message: "Passord tem de ter pelo menos 8 caracteres!" })
    .regex(/[a-z]/, { message: "Password tem de ter pelo menos uma letra minúscula!" })
    .regex(/[A-Z]/, { message: "Password tem de ter pelo menos uma letra maiúscula!" })
    .regex(/[0-9]/, { message: "Password tem de conter pelo menos um número!" })
    .regex(/[@$!%*?&#]/, { message: "Password tem de ter pelo menos um caracter especial!" });

//Schema REQUEST createAccount
export const createAccountSchema = z.object({
    companyId: z.uuid().optional().meta({
        example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
        description:
            "Só o system_admin o indica. Um company_admin cria sempre na sua própria empresa; um valor diferente é recusado com 403.",
    }),
    role: z.string().trim().toLowerCase().pipe(z.enum(UserRole)).optional().meta({
        example: UserRole.Employee,
        description:
            "Por omissão, o role imediatamente abaixo de quem cria: system_admin -> company_admin, company_admin -> employee.",
    }),
    email: z.string().trim().toLowerCase().pipe(z.email()).meta({ example: "user@exemplo.pt" }),
}).meta({ id: "CreateAccountRequest", description: "Dados para criar uma conta" });

export const activateAccountSchema = z.object({
    signupToken: z.string().min(1).meta({example: "197231u9phuodhu1d..."}),
    password: passwordSchema,
}).meta({ id: "ActivateAccountRequest", description: "Dados para ativar uma conta"});


//Schema RESPONSE createAccount
export const createAccountResponseSchema = z.object({
    id: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    companyId: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    email: z.string().meta({ example: "user@exemplo.pt" }),
    role: z.enum(UserRole).meta({ example: UserRole.Employee }),
    status: z.enum(UserStatus).meta({ example: UserStatus.Invited }),
}).meta({
    id: "CreateAccountResponse",
    description: "Conta criada no estado invited. O link de ativação segue por email.",
});

export type CreateAccountRequest = z.infer<typeof createAccountSchema>;
export type ActivateAccountRequest = z.infer<typeof activateAccountSchema>;
export type CreateAccountResponse = z.infer<typeof createAccountResponseSchema>;
