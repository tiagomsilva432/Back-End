import { z } from "zod";
import { UserRole } from "../../types/enums.js";

export const loginSchema = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()).meta({ example: "user@exemplo.pt" }),
    password: z.string().min(1).meta({ example: "password123" }),
    companyId: z.uuid().optional().meta({
        example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
        description:
            "Opcional. Só é preciso quando o mesmo email existe em mais do que uma empresa " +
            "e a password serve em mais do que uma conta — nesse caso o login responde 409.",
    }),
}).meta({ id: "LoginRequest", description: "Credenciais de autenticação" });

export type LoginRequest = z.infer<typeof loginSchema>;

export const loginResponseSchema = z.object({
    token: z.string().meta({ example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }),
    user: z.object({
        id: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
        email: z.string().meta({ example: "user@exemplo.pt" }),
        role: z.enum(UserRole).meta({ example: UserRole.Employee }),
    }),
}).meta({ id: "LoginResponse", description: "Token de acesso e dados do utilizador" });

export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** O corpo do 409: as empresas onde esta password abre uma conta. */
export const loginCompanyChoiceSchema = z.object({
    companyId: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    companyName: z.string().meta({ example: "ACME Software" }),
}).meta({ id: "LoginCompanyChoice", description: "Uma das empresas onde a conta existe" });

export const loginConflictResponseSchema = z.array(loginCompanyChoiceSchema).meta({
    id: "LoginConflict",
    description: "As empresas entre as quais é preciso escolher, por nome",
});

export type LoginCompanyChoice = z.infer<typeof loginCompanyChoiceSchema>;