import { z } from "zod";
import { UserRole, UserStatus } from "../../types/enums.js";
import { companyIdSchema } from "../common/fields-dto.js";
import { employeeProfileResponseSchema } from "./employee-profile-dto.js";

export const listUsersQuerySchema = z.object({
    companyId: companyIdSchema.optional(),
    role: z.string().trim().toLowerCase().pipe(z.enum(UserRole)).optional()
        .meta({ example: UserRole.Employee, description: "Filtra por role." }),
    status: z.string().trim().toLowerCase().pipe(z.enum(UserStatus)).optional()
        .meta({ example: UserStatus.Active, description: "Filtra por estado da conta." }),
}).meta({ id: "ListUsersQuery", description: "Filtros do diretório de utilizadores" });

/** `invited` não está aqui: uma conta só volta a convidada sendo criada de novo. */
const settableStatuses = [UserStatus.Active, UserStatus.Suspended, UserStatus.Terminated] as const;

export const patchUserStatusSchema = z.object({
    status: z.string().trim().toLowerCase().pipe(z.enum(settableStatuses)).meta({
        example: UserStatus.Suspended,
        description: "`active` reativa uma conta suspensa. `terminated` é definitivo.",
    }),
}).meta({ id: "PatchUserStatusRequest", description: "Suspender, reativar ou terminar uma conta" });

/** Campo a campo: o passwordHash e o signupToken nunca entram aqui. */
export const userResponseSchema = z.object({
    id: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    companyId: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    email: z.string().meta({ example: "user@exemplo.pt" }),
    role: z.enum(UserRole).meta({ example: UserRole.Employee }),
    status: z.enum(UserStatus).meta({ example: UserStatus.Active }),
    createdAt: z.iso.datetime().meta({ example: "2026-01-15T10:30:00.000Z" }),
    profile: employeeProfileResponseSchema.nullable(),
}).meta({
    id: "User",
    description: "Um utilizador. Nunca inclui passwordHash, signupToken nem signupTokenExpiresAt.",
});

export const userListResponseSchema = z.array(userResponseSchema)
    .meta({ id: "UserList", description: "Utilizadores da empresa, por email" });

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type PatchUserStatusRequest = z.infer<typeof patchUserStatusSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;
