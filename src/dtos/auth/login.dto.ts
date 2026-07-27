import { z } from "zod";

//Schema REQUEST Login
export const loginSchema = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(8)
});

export type loginRequest = z.infer<typeof loginSchema>;