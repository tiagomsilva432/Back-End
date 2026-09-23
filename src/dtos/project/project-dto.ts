import { z } from "zod";
import { ProjectStatus } from "../../types/enums.js";

const budgetSchema = z.union([z.string().trim(), z.number()])
    .transform((value) => String(value))
    .pipe(
        z.string()
            .regex(/^\d{1,12}(\.\d{1,2})?$/, {
                message: "Orçamento inválido: usa no máximo 12 dígitos e 2 casas decimais",
            })
            .overwrite((value) => {
                const [inteiro, decimais = ""] = value.split(".");
                return `${inteiro}.${decimais.padEnd(2, "0")}`;
            }),
    );

const companyIdSchema = z.uuid().meta({
    example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
    description:
        "Só o system_admin o indica. Um company_admin usa sempre a sua própria empresa; um valor diferente é recusado com 403.",
});

//Schema REQUEST createProject
export const createProjectSchema = z.object({
    companyId: companyIdSchema.optional(),
    name: z.string().trim().min(1).max(150).meta({ example: "Portal do Cliente" }),
    managerId: z.uuid().optional().meta({
        example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
        description: "Tem de ser um utilizador da mesma empresa.",
    }),
    clientName: z.string().trim().min(1).max(150).optional().meta({ example: "Câmara de Lisboa" }),
    status: z.string().trim().toLowerCase().pipe(z.enum(ProjectStatus)).optional()
        .meta({ example: ProjectStatus.Planned, description: "Por omissão, `planned`." }),
    startDate: z.iso.date().optional().meta({ example: "2026-01-15" }),
    endDate: z.iso.date().optional().meta({ example: "2026-06-30" }),
    budget: budgetSchema.optional().meta({ example: "125000.00" }),
})
    .refine((p) => !p.startDate || !p.endDate || p.endDate >= p.startDate, {
        message: "A data de fim não pode ser anterior à data de início",
        path: ["endDate"],
    })
    .meta({ id: "CreateProjectRequest", description: "Dados para criar um projeto" });

//Schema QUERY listProjects
export const listProjectsQuerySchema = z.object({
    companyId: companyIdSchema.optional(),
    status: z.string().trim().toLowerCase().pipe(z.enum(ProjectStatus)).optional()
        .meta({ example: ProjectStatus.Active, description: "Filtra por estado." }),
}).meta({ id: "ListProjectsQuery", description: "Filtros da listagem de projetos" });

//Como um projeto é devolvido, na criação e na leitura
export const projectResponseSchema = z.object({
    id: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    companyId: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    managerId: z.uuid().nullable(),
    name: z.string().meta({ example: "Portal do Cliente" }),
    clientName: z.string().nullable().meta({ example: "Câmara de Lisboa" }),
    status: z.enum(ProjectStatus).meta({ example: ProjectStatus.Planned }),
    startDate: z.string().nullable().meta({ example: "2026-01-15" }),
    endDate: z.string().nullable().meta({ example: "2026-06-30" }),
    budget: z.string().nullable().meta({ example: "125000.00" }),
}).meta({ id: "Project", description: "Um projeto" });

export const projectListResponseSchema = z.array(projectResponseSchema)
    .meta({ id: "ProjectList", description: "Projetos da empresa, por nome" });

export type CreateProjectRequest = z.infer<typeof createProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type ProjectResponse = z.infer<typeof projectResponseSchema>;
