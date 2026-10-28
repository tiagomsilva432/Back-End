import { z } from "zod";
import { passwordSchema } from "./account-dto.js";

/**
 * A currentPassword é z.string().min(1) e nunca passwordSchema: uma password
 * antiga pode anteceder a política atual, e validá-la daria 400 em vez de 401.
 */
export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1).meta({ example: "PasswordAntiga1!" }),
    newPassword: passwordSchema.meta({ example: "PasswordNova1!" }),
})
    .refine((p) => p.newPassword !== p.currentPassword, {
        message: "A palavra-passe nova tem de ser diferente da atual",
        path: ["newPassword"],
    })
    .meta({ id: "ChangePasswordRequest", description: "Trocar a própria password" });

export const requestPasswordResetSchema = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()).meta({ example: "user@exemplo.pt" }),
    companyId: z.uuid().optional().meta({
        example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
        description: "Opcional. Sem ele, cada conta com este email recebe o seu próprio link.",
    }),
}).meta({ id: "RequestPasswordResetRequest", description: "Pedir a redefinição da password" });

export const confirmPasswordResetSchema = z.object({
    token: z.string().min(1).meta({ example: "197231u9phuodhu1d..." }),
    password: passwordSchema,
}).meta({
    id: "ConfirmPasswordResetRequest",
    description: "Definir a password nova com o token recebido por email",
});

export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;
export type RequestPasswordResetRequest = z.infer<typeof requestPasswordResetSchema>;
export type ConfirmPasswordResetRequest = z.infer<typeof confirmPasswordResetSchema>;
