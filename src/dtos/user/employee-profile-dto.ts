import { z } from "zod";

/** Corpo do PUT. Substitui: o que for omitido fica a null. */
export const upsertEmployeeProfileSchema = z.object({
    firstName: z.string().trim().min(1).max(100).meta({ example: "Carla" }),
    lastName: z.string().trim().min(1).max(100).meta({ example: "Mendes" }),
    // A coluna é NOT NULL. No convite é opcional e assume-se hoje.
    hireDate: z.iso.date().meta({ example: "2026-01-15" }),
    phone: z.string().trim().min(1).max(30).optional().meta({ example: "+351912345678" }),
    address: z.string().trim().min(1).optional().meta({ example: "Rua das Flores 12, Lisboa" }),
    birthDate: z.iso.date().optional().meta({ example: "1995-04-02" }),
    jobTitle: z.string().trim().min(1).max(100).optional().meta({ example: "Backend Developer" }),
})
    .refine((p) => !p.birthDate || p.birthDate < p.hireDate, {
        message: "A data de nascimento tem de ser anterior à data de admissão",
        path: ["birthDate"],
    })
    .meta({ id: "UpsertEmployeeProfileRequest", description: "Dados pessoais de um colaborador" });

/** As datas saem como 'YYYY-MM-DD'. */
export const employeeProfileResponseSchema = z.object({
    userId: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    firstName: z.string().meta({ example: "Carla" }),
    lastName: z.string().meta({ example: "Mendes" }),
    phone: z.string().nullable().meta({ example: "+351912345678" }),
    address: z.string().nullable().meta({ example: "Rua das Flores 12, Lisboa" }),
    birthDate: z.string().nullable().meta({ example: "1995-04-02" }),
    hireDate: z.string().meta({ example: "2026-01-15" }),
    jobTitle: z.string().nullable().meta({ example: "Backend Developer" }),
    avatarUrl: z.url().nullable().meta({
        description:
            "O link do avatar enviado em `PUT /users/{id}/avatar`, ou null. Expira como o de qualquer ficheiro: " +
            "pede-se o perfil outra vez em vez de o guardar.",
    }),
}).meta({ id: "EmployeeProfile", description: "O perfil de um colaborador" });

export type UpsertEmployeeProfileRequest = z.infer<typeof upsertEmployeeProfileSchema>;
export type EmployeeProfileResponse = z.infer<typeof employeeProfileResponseSchema>;
