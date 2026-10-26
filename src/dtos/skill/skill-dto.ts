import { z } from "zod";
import { SkillCategory } from "../../types/enums.js";

const nameSchema = z.string().trim().min(1).max(100).meta({ example: "Kotlin" });

const categorySchema = z.string().trim().toLowerCase().pipe(z.enum(SkillCategory))
    .meta({ example: SkillCategory.Language });

const companyIdSchema = z.uuid().meta({
    example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
    description:
        "Só o system_admin o indica. Os restantes usam sempre a sua própria empresa; um valor diferente é recusado com 403.",
});

// Kept as a string: NUMERIC(4,1) through a JS number would drift.
const yearsExperienceSchema = z.union([z.string().trim(), z.number()])
    .transform((value) => String(value))
    .pipe(
        z.string()
            .regex(/^\d{1,3}(\.\d)?$/, {
                message: "Anos de experiência inválidos: usa no máximo 3 dígitos e 1 casa decimal",
            })
            .overwrite((value) => (value.includes(".") ? value : `${value}.0`)),
    );

//Schema REQUEST createSkill
export const createSkillSchema = z.object({
    name: nameSchema,
    category: categorySchema.default(SkillCategory.Other)
        .meta({ description: "Por omissão, `other`." }),
}).meta({ id: "CreateSkillRequest", description: "Acrescentar uma competência ao catálogo" });

/** Corpo do PATCH. Junta: o que for omitido fica como está. Nenhum campo se limpa. */
export const patchSkillSchema = z.object({
    name: nameSchema.optional(),
    category: categorySchema.optional(),
})
    .refine((patch) => Object.keys(patch).length > 0, { message: "Nada para alterar" })
    .meta({ id: "PatchSkillRequest", description: "Alterar uma competência do catálogo" });

//Schema QUERY listSkills
export const listSkillsQuerySchema = z.object({
    category: categorySchema.optional().meta({ description: "Filtra por categoria." }),
}).meta({ id: "ListSkillsQuery", description: "Filtros do catálogo de competências" });

//Schema QUERY listSkillUsers
export const listSkillUsersQuerySchema = z.object({
    companyId: companyIdSchema.optional(),
}).meta({ id: "ListSkillUsersQuery", description: "De que empresa são as pessoas" });

/**
 * Corpo do PUT. Substitui: um campo omitido fica a null. A competência vem do
 * caminho, por isso o corpo pode ir vazio.
 */
export const upsertEmployeeSkillSchema = z.object({
    proficiency: z.int().min(1).max(5).optional()
        .meta({ example: 4, description: "De 1 a 5." }),
    yearsExperience: yearsExperienceSchema.optional()
        .meta({ example: "3.5", description: "No máximo 3 dígitos e 1 casa decimal." }),
}).meta({ id: "UpsertEmployeeSkillRequest", description: "Atribuir ou alterar uma competência de uma pessoa" });

//Como uma competência do catálogo é devolvida
export const skillResponseSchema = z.object({
    id: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    name: z.string().meta({ example: "TypeScript" }),
    category: z.enum(SkillCategory).meta({ example: SkillCategory.Language }),
}).meta({ id: "Skill", description: "Uma competência do catálogo" });

export const skillListResponseSchema = z.array(skillResponseSchema)
    .meta({ id: "SkillList", description: "O catálogo, por nome" });

//Como uma competência de uma pessoa é devolvida
export const employeeSkillResponseSchema = z.object({
    userId: z.uuid(),
    skillId: z.uuid(),
    name: z.string().meta({ example: "TypeScript" }),
    category: z.enum(SkillCategory).meta({ example: SkillCategory.Language }),
    proficiency: z.int().nullable().meta({ example: 4 }),
    yearsExperience: z.string().nullable().meta({ example: "3.5" }),
}).meta({ id: "EmployeeSkill", description: "Uma competência de uma pessoa" });

export const employeeSkillListResponseSchema = z.array(employeeSkillResponseSchema)
    .meta({ id: "EmployeeSkillList", description: "Competências de uma pessoa, por nome" });

export const skillHolderResponseSchema = z.object({
    userId: z.uuid(),
    proficiency: z.int().nullable().meta({ example: 4 }),
    yearsExperience: z.string().nullable().meta({ example: "3.5" }),
}).meta({ id: "SkillHolder", description: "Uma pessoa que tem esta competência" });

export const skillHolderListResponseSchema = z.array(skillHolderResponseSchema)
    .meta({ id: "SkillHolderList", description: "Quem tem a competência, da mais proficiente para a menos" });

export type CreateSkillRequest = z.infer<typeof createSkillSchema>;
export type PatchSkillRequest = z.infer<typeof patchSkillSchema>;
export type ListSkillsQuery = z.infer<typeof listSkillsQuerySchema>;
export type ListSkillUsersQuery = z.infer<typeof listSkillUsersQuerySchema>;
export type UpsertEmployeeSkillRequest = z.infer<typeof upsertEmployeeSkillSchema>;
export type SkillResponse = z.infer<typeof skillResponseSchema>;
export type EmployeeSkillResponse = z.infer<typeof employeeSkillResponseSchema>;
export type SkillHolderResponse = z.infer<typeof skillHolderResponseSchema>;
