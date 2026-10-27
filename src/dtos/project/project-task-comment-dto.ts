import { z } from "zod";

const idSchema = z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" });

const bodySchema = z.string().trim().min(1).max(2000)
    .meta({ example: "Já está no servidor de testes.", description: "Texto simples, até 2000 caracteres." });

//Schema REQUEST createProjectTaskComment e patchProjectTaskComment
export const projectTaskCommentBodySchema = z.object({
    body: bodySchema,
}).meta({ id: "ProjectTaskCommentRequest", description: "O texto de um comentário" });

//Como um comentário é devolvido, na REST e no stream
export const projectTaskCommentResponseSchema = z.object({
    id: idSchema,
    taskId: idSchema,
    authorId: idSchema.meta({ description: "Quem escreveu. O nome e o avatar vêm de `GET /users`." }),
    body: z.string().meta({ example: "Já está no servidor de testes." }),
    createdAt: z.iso.datetime(),
    editedAt: z.iso.datetime().nullable().meta({ example: null, description: "null enquanto não foi alterado." }),
}).meta({ id: "ProjectTaskComment", description: "Um comentário numa tarefa" });

export const projectTaskCommentListResponseSchema = z.array(projectTaskCommentResponseSchema)
    .meta({ id: "ProjectTaskCommentList", description: "Os comentários de uma tarefa, do mais antigo para o mais recente" });

export type ProjectTaskCommentRequest = z.infer<typeof projectTaskCommentBodySchema>;
export type ProjectTaskCommentResponse = z.infer<typeof projectTaskCommentResponseSchema>;
