import { z } from "zod";
import { UserRole } from "../../types/enums.js";

//Schema REQUEST Login
export const loginSchema = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()).meta({ example: "user@exemplo.pt" }),
    password: z.string().min(1).meta({ example: "password123" })
}).meta({ id: "LoginRequest", description: "Credenciais de autenticação" });

export type LoginRequest = z.infer<typeof loginSchema>;

//Schema RESPONSE Login
export const loginResponseSchema = z.object({
    token: z.string().meta({ example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }),
    user: z.object({
        id: z.number().meta({ example: 1 }),
        email: z.string().meta({ example: "user@exemplo.pt" }),
        role: z.enum(UserRole).meta({ example: UserRole.Employee }),
    }),
}).meta({ id: "LoginResponse", description: "Token de acesso e dados do utilizador" });

export type LoginResponse = z.infer<typeof loginResponseSchema>;