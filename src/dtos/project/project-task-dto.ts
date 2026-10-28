import { z } from "zod";
import { TaskPriority, TaskStatus } from "../../types/enums.js";
import { fileListResponseSchema } from "../file/file-dto.js";

const idSchema = z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" });

const titleSchema = z.string().trim().min(1).max(150).meta({ example: "Corrigir o login com Google" });

const descriptionSchema = z.string().trim().min(1).max(5000)
    .meta({ example: "O redirect volta para /login em vez de /dashboard." });

export const taskStatusSchema = z.string().trim().toLowerCase().pipe(z.enum(TaskStatus)).meta({
    example: TaskStatus.InProgress,
    description: "`todo`, `in_progress`, `review` ou `done`.",
});

const taskPrioritySchema = z.string().trim().toLowerCase().pipe(z.enum(TaskPriority)).meta({
    example: TaskPriority.High,
    description: "`low`, `medium`, `high` ou `critical`.",
});

// Uma tarefa nova não salta a revisão: só começa em todo ou in_progress.
const newTaskStatusSchema = z.string().trim().toLowerCase()
    .pipe(z.enum([TaskStatus.Todo, TaskStatus.InProgress], { error: "Uma tarefa nova começa em todo ou in_progress" }))
    .meta({ example: TaskStatus.Todo, description: "`todo` ou `in_progress`. Por omissão, `todo`." });

const labelSchema = z.string().trim().toLowerCase().min(1).max(30);

/** Em minúsculas, sem espaços nas pontas e sem repetidas: "Bug" e "bug " são a mesma. */
const labelsSchema = z.array(labelSchema).max(10)
    .transform((labels) => [...new Set(labels)])
    .meta({ example: ["bug", "frontend"], description: "Até 10, com 1 a 30 caracteres cada. Ficam em minúsculas." });

const assigneeIdSchema = idSchema.meta({ description: "Tem de estar no projeto: alocado, o gestor, ou um company_admin." });

const dueDateSchema = z.iso.date().meta({ example: "2026-11-15" });

export const createProjectTaskSchema = z.object({
    title: titleSchema,
    description: descriptionSchema.optional(),
    status: newTaskStatusSchema.optional(),
    assigneeId: assigneeIdSchema.optional(),
    dueDate: dueDateSchema.optional(),
    priority: taskPrioritySchema.optional().meta({ description: "Por omissão, `medium`." }),
    labels: labelsSchema.optional(),
}).meta({ id: "CreateProjectTaskRequest", description: "Criar uma tarefa no quadro" });

/**
 * Corpo do PATCH: o conteúdo do cartão. Junta: o que for omitido fica como
 * está, e um null limpa a descrição, o responsável ou a data. As etiquetas
 * substituem as que lá estão. A coluna e a posição mudam-se no move.
 */
export const patchProjectTaskSchema = z.object({
    title: titleSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    assigneeId: assigneeIdSchema.nullable().optional(),
    dueDate: dueDateSchema.nullable().optional(),
    priority: taskPrioritySchema.optional(),
    labels: labelsSchema.optional(),
})
    .refine((patch) => Object.keys(patch).length > 0, { message: "Nada para alterar" })
    .meta({ id: "PatchProjectTaskRequest", description: "Alterar o conteúdo de uma tarefa" });

export const moveProjectTaskSchema = z.object({
    status: taskStatusSchema,
    position: z.int().min(0).meta({
        example: 0,
        description: "O lugar na coluna de destino depois de mover, a contar de 0 (o topo). Acima do fim, fica no fim.",
    }),
}).meta({ id: "MoveProjectTaskRequest", description: "Arrastar uma tarefa para uma coluna e um lugar" });

export const projectBoardQuerySchema = z.object({
    assigneeId: idSchema.optional().meta({ description: "Só as tarefas desta pessoa." }),
    label: labelSchema.optional().meta({ example: "bug", description: "Só as que têm esta etiqueta." }),
    priority: taskPrioritySchema.optional(),
}).meta({ id: "ProjectBoardQuery", description: "Filtros do quadro" });

export const projectTaskResponseSchema = z.object({
    id: idSchema,
    projectId: idSchema,
    title: z.string().meta({ example: "Corrigir o login com Google" }),
    description: z.string().nullable(),
    status: z.enum(TaskStatus).meta({ example: TaskStatus.InProgress }),
    position: z.int().meta({ example: 0, description: "A ordem dentro da coluna. Pode ter buracos." }),
    assigneeId: idSchema.nullable().meta({ description: "O nome e o avatar vêm de `GET /users`." }),
    dueDate: z.string().nullable().meta({ example: "2026-11-15" }),
    priority: z.enum(TaskPriority).meta({ example: TaskPriority.High }),
    labels: z.array(z.string()).meta({ example: ["bug", "frontend"] }),
    createdBy: idSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable().meta({ description: "Quando foi aprovada. null fora de `done`." }),
    commentCount: z.int().meta({ example: 2 }),
    attachments: fileListResponseSchema.meta({ description: "Até 5." }),
}).meta({ id: "ProjectTask", description: "Um cartão do quadro de um projeto" });

const columnSchema = z.array(projectTaskResponseSchema);

export const projectBoardResponseSchema = z.object({
    todo: columnSchema,
    in_progress: columnSchema,
    review: columnSchema,
    done: columnSchema,
}).meta({ id: "ProjectBoard", description: "As quatro colunas, cada uma pela sua ordem" });

/** A ordem nova das colunas em que um move mexeu: uma, ou duas se mudou de coluna. */
export const taskOrderSchema = z.partialRecord(z.enum(TaskStatus), z.array(idSchema)).meta({
    example: { review: ["0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42"] },
    description: "Os ids de cada coluna afetada, de cima para baixo.",
});

export const moveProjectTaskResponseSchema = z.object({
    task: projectTaskResponseSchema,
    order: taskOrderSchema,
}).meta({ id: "MoveProjectTaskResult", description: "A tarefa movida, e a ordem nova das colunas afetadas" });

export const projectTaskLabelsResponseSchema = z.array(z.string())
    .meta({ id: "ProjectTaskLabels", description: "As etiquetas em uso no projeto, por ordem alfabética" });

export type CreateProjectTaskRequest = z.infer<typeof createProjectTaskSchema>;
export type PatchProjectTaskRequest = z.infer<typeof patchProjectTaskSchema>;
export type MoveProjectTaskRequest = z.infer<typeof moveProjectTaskSchema>;
export type ProjectBoardQuery = z.infer<typeof projectBoardQuerySchema>;
export type ProjectTaskResponse = z.infer<typeof projectTaskResponseSchema>;
export type ProjectBoardResponse = z.infer<typeof projectBoardResponseSchema>;
