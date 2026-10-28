import { z } from "zod";
import { UserRole, UserStatus } from "../../types/enums.js";
import { employeeProfileResponseSchema } from "../user/employee-profile-dto.js";

/** Shared with the bootstrap CLI so both enforce the same rules. */
export const passwordSchema = z.string()
    .min(8, { message: "A palavra-passe tem de ter pelo menos 8 caracteres" })
    .regex(/[a-z]/, { message: "A palavra-passe tem de ter pelo menos uma letra minúscula" })
    .regex(/[A-Z]/, { message: "A palavra-passe tem de ter pelo menos uma letra maiúscula" })
    .regex(/[0-9]/, { message: "A palavra-passe tem de ter pelo menos um número" })
    .regex(/[@$!%*?&#]/, { message: "A palavra-passe tem de ter pelo menos um carácter especial" });

/** O nome da pessoa, logo no convite. O resto do perfil vem depois. */
export const inviteProfileSchema = z.object({
    firstName: z.string().trim().min(1).max(100).meta({ example: "Carla" }),
    lastName: z.string().trim().min(1).max(100).meta({ example: "Mendes" }),
    hireDate: z.iso.date().optional().meta({
        example: "2026-01-15",
        description: "Por omissão, a data de hoje.",
    }),
    jobTitle: z.string().trim().min(1).max(100).optional().meta({ example: "Backend Developer" }),
}).meta({ id: "InviteProfile", description: "Nome da pessoa convidada" });

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
    profile: inviteProfileSchema.optional(),
}).meta({ id: "CreateAccountRequest", description: "Dados para criar uma conta" });

export const activateAccountSchema = z.object({
    signupToken: z.string().min(1).meta({example: "197231u9phuodhu1d..."}),
    password: passwordSchema,
}).meta({ id: "ActivateAccountRequest", description: "Dados para ativar uma conta"});


export const createAccountResponseSchema = z.object({
    id: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    companyId: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    email: z.string().meta({ example: "user@exemplo.pt" }),
    role: z.enum(UserRole).meta({ example: UserRole.Employee }),
    status: z.enum(UserStatus).meta({ example: UserStatus.Invited }),
    // Só vem quando o convite trouxe nome.
    profile: employeeProfileResponseSchema.optional(),
}).meta({
    id: "CreateAccountResponse",
    description: "Conta criada no estado invited. O link de ativação segue por email.",
});

export type InviteProfile = z.infer<typeof inviteProfileSchema>;
export type CreateAccountRequest = z.infer<typeof createAccountSchema>;
export type ActivateAccountRequest = z.infer<typeof activateAccountSchema>;
export type CreateAccountResponse = z.infer<typeof createAccountResponseSchema>;
