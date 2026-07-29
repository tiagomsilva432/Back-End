import { z } from "zod";

//Schema REQUEST Login
export const loginSchema = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()).meta({ example: "user@exemplo.pt" }),
    password: z.string().min(8).meta({ example: "password123" })
}).meta({ id: "LoginRequest", description: "Credenciais de autenticação" });

export type loginRequest = z.infer<typeof loginSchema>;