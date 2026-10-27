import { z } from "zod";

const idSchema = z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" });

const bodySchema = z.string().trim().min(1).max(2000)
    .meta({ example: "O servidor de testes já tem a versão de ontem.", description: "Texto simples, até 2000 caracteres." });

//Schema REQUEST createProjectMessage
export const createProjectMessageSchema = z.object({
    body: bodySchema,
}).meta({ id: "CreateProjectMessageRequest", description: "Escrever no chat de um projeto" });

//Schema REQUEST patchProjectMessage
export const patchProjectMessageSchema = z.object({
    body: bodySchema,
}).meta({ id: "PatchProjectMessageRequest", description: "Corrigir uma mensagem" });

//Schema QUERY listProjectMessages
export const listProjectMessagesQuerySchema = z.object({
    before: z.uuid().optional().meta({
        example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
        description: "O `nextBefore` da página anterior. Sem ele, começa nas mais recentes.",
    }),
    limit: z.coerce.number().int().min(1).max(100).default(30)
        .meta({ example: 30, description: "Entre 1 e 100. Por omissão, 30." }),
}).meta({ id: "ListProjectMessagesQuery", description: "Página do chat de um projeto" });

//Como uma mensagem é devolvida, na REST e no stream
export const projectMessageResponseSchema = z.object({
    id: idSchema,
    projectId: idSchema,
    authorId: idSchema.meta({ description: "Quem escreveu. O nome e o avatar vêm de `GET /users`." }),
    body: z.string().meta({ example: "O servidor de testes já tem a versão de ontem." }),
    createdAt: z.iso.datetime().meta({ example: "2026-10-27T09:30:00.000Z" }),
    editedAt: z.iso.datetime().nullable().meta({ example: null, description: "null enquanto não foi alterada." }),
}).meta({ id: "ProjectMessage", description: "Uma mensagem do chat de um projeto" });

export const projectMessagePageResponseSchema = z.object({
    items: z.array(projectMessageResponseSchema),
    nextBefore: z.uuid().nullable().meta({
        example: null,
        description: "Passa-se como `before` para a página seguinte (mais antiga). null quando não há mais.",
    }),
    lastReadMessageId: z.uuid().nullable().meta({
        example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
        description:
            "Até onde esta pessoa já tinha lido. As mensagens de outros com um id maior são as novas: é aqui " +
            "que se desenha o separador \"mensagens novas\". null se nunca leu.",
    }),
}).meta({ id: "ProjectMessagePage", description: "Mensagens, da mais recente para a mais antiga" });

export const readProjectMessagesResponseSchema = z.object({
    lastReadMessageId: z.uuid().nullable().meta({ description: "A mais recente, agora lida. null se o chat está vazio." }),
}).meta({ id: "ReadProjectMessagesResult", description: "Até onde ficou lido" });

export const unreadProjectMessagesResponseSchema = z.object({
    total: z.int().meta({ example: 4 }),
    projects: z.array(z.object({
        projectId: idSchema,
        unread: z.int().meta({ example: 3 }),
    })).meta({ description: "Só os projetos com alguma por ler." }),
}).meta({ id: "UnreadProjectMessages", description: "Mensagens por ler, em cada projeto da pessoa" });

export type ListProjectMessagesQuery = z.infer<typeof listProjectMessagesQuerySchema>;
export type CreateProjectMessageRequest = z.infer<typeof createProjectMessageSchema>;
export type PatchProjectMessageRequest = z.infer<typeof patchProjectMessageSchema>;
export type ProjectMessageResponse = z.infer<typeof projectMessageResponseSchema>;
export type ProjectMessagePageResponse = z.infer<typeof projectMessagePageResponseSchema>;
export type UnreadProjectMessagesResponse = z.infer<typeof unreadProjectMessagesResponseSchema>;
