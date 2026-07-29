import { z } from "zod";

//Schema REQUEST createAccount
export const createAccountSchema = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()).meta({ example: "user@exemplo.pt" }),
    password: z.string().min(8).meta({ example: "password123" })
}).meta({ id: "CreateAccountRequest", description: "Dados para criar uma conta" });

//Schema REQUEST updateAccount
//export const updateAccountSchema = z.object({});
export type createAccountRequest = z.infer<typeof createAccountSchema>;
//export type updateAccountRequest = z.infer<typeof updateAccountSchema>;