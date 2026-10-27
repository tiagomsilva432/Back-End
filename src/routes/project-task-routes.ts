import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
    createTaskComment,
    listTaskComments,
    patchTaskComment,
    removeTaskComment,
} from "../controllers/project-task-comment-controller.js";
import {
    createProjectTask,
    getProjectBoard,
    getProjectTask,
    listProjectTaskLabels,
    moveTask,
    patchProjectTask,
    removeProjectTask,
    removeTaskAttachment,
    uploadTaskAttachment,
} from "../controllers/project-task-controller.js";
import { fileResponseSchema } from "../dtos/file/file-dto.js";
import {
    projectTaskCommentBodySchema,
    projectTaskCommentListResponseSchema,
    projectTaskCommentResponseSchema,
} from "../dtos/project/project-task-comment-dto.js";
import {
    createProjectTaskSchema,
    moveProjectTaskResponseSchema,
    moveProjectTaskSchema,
    patchProjectTaskSchema,
    projectBoardQuerySchema,
    projectBoardResponseSchema,
    projectTaskLabelsResponseSchema,
    projectTaskResponseSchema,
} from "../dtos/project/project-task-dto.js";
import { errorResponses, fileBody, jsonBody, jsonResponse, pathId } from "../docs/response.js";
import { acceptFile } from "../middleware/acceptFile.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { FILE_KINDS } from "../services/files/file-kinds.js";
import { FileKind } from "../types/enums.js";

const router = Router();

// Bare requireRole() everywhere: who is on the project comes from its
// allocations and managerId, so the controller decides.
router.get(
    "/projects/:id/tasks",
    requireAuth,
    requireRole(),
    validateQuery(projectBoardQuerySchema),
    getProjectBoard
);

// Before /:taskId, so "labels" is never taken for an id.
router.get(
    "/projects/:id/tasks/labels",
    requireAuth,
    requireRole(),
    listProjectTaskLabels
);

router.post(
    "/projects/:id/tasks",
    requireAuth,
    requireRole(),
    validateBody(createProjectTaskSchema),
    createProjectTask
);

router.get(
    "/projects/:id/tasks/:taskId",
    requireAuth,
    requireRole(),
    getProjectTask
);

router.patch(
    "/projects/:id/tasks/:taskId",
    requireAuth,
    requireRole(),
    validateBody(patchProjectTaskSchema),
    patchProjectTask
);

router.post(
    "/projects/:id/tasks/:taskId/move",
    requireAuth,
    requireRole(),
    validateBody(moveProjectTaskSchema),
    moveTask
);

router.delete(
    "/projects/:id/tasks/:taskId",
    requireAuth,
    requireRole(),
    removeProjectTask
);

router.post(
    "/projects/:id/tasks/:taskId/attachments",
    requireAuth,
    requireRole(),
    acceptFile(FILE_KINDS[FileKind.TaskAttachment]),
    uploadTaskAttachment
);

router.delete(
    "/projects/:id/tasks/:taskId/attachments/:fileId",
    requireAuth,
    requireRole(),
    removeTaskAttachment
);

router.get(
    "/projects/:id/tasks/:taskId/comments",
    requireAuth,
    requireRole(),
    listTaskComments
);

router.post(
    "/projects/:id/tasks/:taskId/comments",
    requireAuth,
    requireRole(),
    validateBody(projectTaskCommentBodySchema),
    createTaskComment
);

router.patch(
    "/projects/:id/tasks/:taskId/comments/:commentId",
    requireAuth,
    requireRole(),
    validateBody(projectTaskCommentBodySchema),
    patchTaskComment
);

router.delete(
    "/projects/:id/tasks/:taskId/comments/:commentId",
    requireAuth,
    requireRole(),
    removeTaskComment
);

const idParam = pathId("Id do projeto");
const taskIdParam = pathId("Id da tarefa", "taskId");
const commentIdParam = pathId("Id do comentário", "commentId");

const members =
    "Quem está no projeto: quem lá tem uma alocação que ainda não terminou, o gestor (`managerId`), " +
    "um `company_admin` da empresa ou um `system_admin`. Os outros da empresa recebem 403. ";

const live = (what: string) => `Vai em direto pelo stream das notificações, como \`event: ${what}\`.`;

const memberErrors = {
    "401": jsonResponse(401, "Token em falta ou inválido"),
    "403": jsonResponse(403, "Conta não está ativa, ou não está no projeto"),
};

//Documentação OpenAPI destas rotas
export const projectTaskPaths: ZodOpenApiPathsObject = {
    "/projects/{id}/tasks": {
        get: {
            tags: ["Tarefas"],
            summary: "O quadro de um projeto",
            description:
                `${members}As quatro colunas (\`todo\`, \`in_progress\`, \`review\`, \`done\`), cada uma de ` +
                "cima para baixo, com os anexos e o número de comentários de cada cartão. Os filtros juntam-se.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            requestParams: { query: projectBoardQuerySchema },
            responses: {
                "200": jsonResponse(200, "Quadro do projeto", projectBoardResponseSchema),
                ...errorResponses(400),
                ...memberErrors,
                "404": jsonResponse(404, "Projeto não encontrado"),
                ...errorResponses(500),
            },
        },
        post: {
            tags: ["Tarefas"],
            summary: "Criar uma tarefa",
            description:
                `${members}Fica no fundo da coluna. Só começa em \`todo\` ou \`in_progress\`: a \`done\` só ` +
                "se chega pela revisão. O responsável, se indicado, tem de estar no projeto, e recebe a " +
                `notificação \`task.assigned\` (se não for quem criou). ${live("project_task")}`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            requestBody: jsonBody(createProjectTaskSchema),
            responses: {
                "201": jsonResponse(201, "Tarefa criada", projectTaskResponseSchema),
                ...errorResponses(400),
                ...memberErrors,
                "404": jsonResponse(404, "Projeto não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/projects/{id}/tasks/labels": {
        get: {
            tags: ["Tarefas"],
            summary: "As etiquetas em uso",
            description: `${members}Sem repetidas e por ordem alfabética: para o autocomplete.`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            responses: {
                "200": jsonResponse(200, "Etiquetas", projectTaskLabelsResponseSchema),
                ...memberErrors,
                "404": jsonResponse(404, "Projeto não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/projects/{id}/tasks/{taskId}": {
        get: {
            tags: ["Tarefas"],
            summary: "Ver uma tarefa",
            description: `${members}A de outro projeto é 404.`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam, taskIdParam],
            responses: {
                "200": jsonResponse(200, "Tarefa", projectTaskResponseSchema),
                ...memberErrors,
                "404": jsonResponse(404, "Projeto ou tarefa não encontrado"),
                ...errorResponses(500),
            },
        },
        patch: {
            tags: ["Tarefas"],
            summary: "Alterar o conteúdo de uma tarefa",
            description:
                `${members}Qualquer pessoa do projeto altera o título, a descrição, o responsável, a data, a ` +
                "prioridade e as etiquetas. Junta: um campo omitido fica como está, e um `null` limpa. As " +
                "etiquetas substituem as que lá estão. A coluna e o lugar mudam-se no `move`. Um responsável " +
                `novo recebe \`task.assigned\`. ${live("project_task")}`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam, taskIdParam],
            requestBody: jsonBody(patchProjectTaskSchema),
            responses: {
                "200": jsonResponse(200, "Tarefa atualizada", projectTaskResponseSchema),
                ...errorResponses(400),
                ...memberErrors,
                "404": jsonResponse(404, "Projeto ou tarefa não encontrado"),
                ...errorResponses(500),
            },
        },
        delete: {
            tags: ["Tarefas"],
            summary: "Apagar uma tarefa",
            description:
                `${members}Só quem a criou, o gestor do projeto ou um admin. Apaga também os anexos e os ` +
                `comentários. ${live("project_task")}`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam, taskIdParam],
            responses: {
                "200": jsonResponse(200, "Tarefa apagada"),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Não está no projeto, ou sem permissões para a apagar"),
                "404": jsonResponse(404, "Projeto ou tarefa não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/projects/{id}/tasks/{taskId}/move": {
        post: {
            tags: ["Tarefas"],
            summary: "Arrastar uma tarefa",
            description:
                "Põe a tarefa na coluna `status`, no lugar `position` (0 é o topo; acima do fim fica no fim), " +
                "e devolve a ordem nova das colunas afetadas. Quem pode:\n\n" +
                "- entre `todo`, `in_progress` e `review` (ou mudar de lugar dentro delas): o responsável, o " +
                "gestor do projeto ou um admin. Uma tarefa sem responsável move-a qualquer pessoa do projeto;\n" +
                "- para `done`: só a partir de `review` (senão, 400), e só o gestor ou um admin (é a aprovação);\n" +
                "- para fora de `done`, ou dentro de `done`: só o gestor ou um admin.\n\n" +
                "Entrar em `review` avisa o gestor (`task.review_requested`); sair de `review` avisa o " +
                `responsável (\`task.reviewed\`, com \`approved\`). ${live("project_task")}`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam, taskIdParam],
            requestBody: jsonBody(moveProjectTaskSchema),
            responses: {
                "200": jsonResponse(200, "Tarefa movida", moveProjectTaskResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Não está no projeto, ou não pode mover esta tarefa para aqui"),
                "404": jsonResponse(404, "Projeto ou tarefa não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/projects/{id}/tasks/{taskId}/attachments": {
        post: {
            tags: ["Tarefas"],
            summary: "Anexar um ficheiro a uma tarefa",
            description:
                `${members}JPEG, PNG, WebP ou PDF até 10 MB, em \`multipart/form-data\` no campo \`file\`; ` +
                "até 5 por tarefa. O tipo vê-se pelos bytes, não pela extensão. O mesmo ficheiro duas vezes " +
                `na mesma tarefa é 409. ${live("project_task")} (\`updated\`, com o cartão novo).`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam, taskIdParam],
            requestBody: fileBody("O anexo: JPEG, PNG, WebP ou PDF, até 10 MB"),
            responses: {
                "201": jsonResponse(201, "Anexo adicionado", fileResponseSchema),
                ...errorResponses(400),
                ...memberErrors,
                "404": jsonResponse(404, "Projeto ou tarefa não encontrado"),
                "409": jsonResponse(409, "Já tem 5 anexos, ou este já está anexado"),
                "413": jsonResponse(413, "O ficheiro tem mais de 10 MB"),
                ...errorResponses(500),
            },
        },
    },
    "/projects/{id}/tasks/{taskId}/attachments/{fileId}": {
        delete: {
            tags: ["Tarefas"],
            summary: "Tirar um anexo",
            description: `${members}O anexo de outra tarefa é 404. ${live("project_task")}`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam, taskIdParam, pathId("Id do anexo", "fileId")],
            responses: {
                "200": jsonResponse(200, "Anexo apagado"),
                ...memberErrors,
                "404": jsonResponse(404, "Projeto, tarefa ou anexo não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/projects/{id}/tasks/{taskId}/comments": {
        get: {
            tags: ["Tarefas"],
            summary: "Os comentários de uma tarefa",
            description: `${members}Todos, do mais antigo para o mais recente.`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam, taskIdParam],
            responses: {
                "200": jsonResponse(200, "Comentários", projectTaskCommentListResponseSchema),
                ...memberErrors,
                "404": jsonResponse(404, "Projeto ou tarefa não encontrado"),
                ...errorResponses(500),
            },
        },
        post: {
            tags: ["Tarefas"],
            summary: "Comentar uma tarefa",
            description:
                `${members}O responsável e quem criou a tarefa recebem \`task.commented\` (menos quem ` +
                `comentou). ${live("project_task_comment")}`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam, taskIdParam],
            requestBody: jsonBody(projectTaskCommentBodySchema),
            responses: {
                "201": jsonResponse(201, "Comentário adicionado", projectTaskCommentResponseSchema),
                ...errorResponses(400),
                ...memberErrors,
                "404": jsonResponse(404, "Projeto ou tarefa não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/projects/{id}/tasks/{taskId}/comments/{commentId}": {
        patch: {
            tags: ["Tarefas"],
            summary: "Corrigir um comentário",
            description: `${members}Só quem o escreveu, nem um admin. Fica com o \`editedAt\`. ${live("project_task_comment")}`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam, taskIdParam, commentIdParam],
            requestBody: jsonBody(projectTaskCommentBodySchema),
            responses: {
                "200": jsonResponse(200, "Comentário atualizado", projectTaskCommentResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Não está no projeto, ou o comentário não é seu"),
                "404": jsonResponse(404, "Projeto, tarefa ou comentário não encontrado"),
                ...errorResponses(500),
            },
        },
        delete: {
            tags: ["Tarefas"],
            summary: "Apagar um comentário",
            description:
                `${members}Quem o escreveu, o gestor do projeto ou um admin. Apaga de vez. ${live("project_task_comment")}`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam, taskIdParam, commentIdParam],
            responses: {
                "200": jsonResponse(200, "Comentário apagado"),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Não está no projeto, ou sem permissões para o apagar"),
                "404": jsonResponse(404, "Projeto, tarefa ou comentário não encontrado"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
