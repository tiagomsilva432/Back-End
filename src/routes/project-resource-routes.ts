import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
    createProjectResource,
    listProjectResources,
    patchProjectResource,
    removeProjectResource,
    removeResourceFile,
    uploadResourceFile,
} from "../controllers/project-resource-controller.js";
import { fileResponseSchema } from "../dtos/file/file-dto.js";
import {
    createProjectResourceSchema,
    patchProjectResourceSchema,
    projectResourceListResponseSchema,
    projectResourceResponseSchema,
} from "../dtos/project/project-resource-dto.js";
import { errorResponses, fileBody, jsonBody, jsonResponse, pathId } from "../docs/response.js";
import { acceptFile } from "../middleware/acceptFile.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { FILE_KINDS } from "../services/files/file-kinds.js";
import { FileKind } from "../types/enums.js";

const router = Router();

// Bare requireRole() everywhere: who is on the project comes from its
// allocations and managerId, so the controller decides.
router.get(
    "/projects/:id/resources",
    requireAuth,
    requireRole(),
    listProjectResources
);

router.post(
    "/projects/:id/resources",
    requireAuth,
    requireRole(),
    validateBody(createProjectResourceSchema),
    createProjectResource
);

router.patch(
    "/projects/:id/resources/:resourceId",
    requireAuth,
    requireRole(),
    validateBody(patchProjectResourceSchema),
    patchProjectResource
);

router.delete(
    "/projects/:id/resources/:resourceId",
    requireAuth,
    requireRole(),
    removeProjectResource
);

router.put(
    "/projects/:id/resources/:resourceId/file",
    requireAuth,
    requireRole(),
    acceptFile(FILE_KINDS[FileKind.ProjectResourceFile]),
    uploadResourceFile
);

router.delete(
    "/projects/:id/resources/:resourceId/file",
    requireAuth,
    requireRole(),
    removeResourceFile
);

const idParam = pathId("Id do projeto");
const resourceIdParam = pathId("Id do recurso", "resourceId");

const members =
    "Quem está no projeto: quem lá tem uma alocação que ainda não terminou, o gestor (`managerId`), " +
    "um `company_admin` da empresa ou um `system_admin`. Os outros da empresa recebem 403. ";

const editors =
    "Um admin ou o gestor do projeto altera qualquer recurso; os outros membros só os que adicionaram. ";

export const projectResourcePaths: ZodOpenApiPathsObject = {
    "/projects/{id}/resources": {
        get: {
            tags: ["Recursos"],
            summary: "Listar os recursos de um projeto",
            description:
                `${members}Do mais antigo para o mais recente, cada um com o seu ficheiro (ou \`file: null\`).`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            responses: {
                "200": jsonResponse(200, "Recursos do projeto", projectResourceListResponseSchema),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa, ou não está no projeto"),
                "404": jsonResponse(404, "Projeto não encontrado"),
                ...errorResponses(500),
            },
        },
        post: {
            tags: ["Recursos"],
            summary: "Adicionar um recurso",
            description:
                `${members}Só o título é obrigatório: o link e a nota são opcionais, e o ficheiro envia-se ` +
                "depois, em `PUT /projects/{id}/resources/{resourceId}/file`.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam],
            requestBody: jsonBody(createProjectResourceSchema),
            responses: {
                "201": jsonResponse(201, "Recurso adicionado", projectResourceResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Conta não está ativa, ou não está no projeto"),
                "404": jsonResponse(404, "Projeto não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/projects/{id}/resources/{resourceId}": {
        patch: {
            tags: ["Recursos"],
            summary: "Alterar um recurso",
            description:
                `${members}${editors}Um PATCH junta: um campo omitido fica como está, e um \`null\` ` +
                "limpa o link ou a nota. O ficheiro tem rota própria.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam, resourceIdParam],
            requestBody: jsonBody(patchProjectResourceSchema),
            responses: {
                "200": jsonResponse(200, "Recurso atualizado", projectResourceResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Não está no projeto, ou o recurso não é seu"),
                "404": jsonResponse(404, "Projeto ou recurso não encontrado"),
                ...errorResponses(500),
            },
        },
        delete: {
            tags: ["Recursos"],
            summary: "Apagar um recurso",
            description: `${members}${editors}Apaga também o ficheiro.`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam, resourceIdParam],
            responses: {
                "200": jsonResponse(200, "Recurso apagado"),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Não está no projeto, ou o recurso não é seu"),
                "404": jsonResponse(404, "Projeto ou recurso não encontrado"),
                ...errorResponses(500),
            },
        },
    },
    "/projects/{id}/resources/{resourceId}/file": {
        put: {
            tags: ["Recursos"],
            summary: "Enviar o ficheiro de um recurso",
            description:
                `${editors}JPEG, PNG, WebP ou PDF até 10 MB, em \`multipart/form-data\` no campo \`file\`. ` +
                "Um por recurso: substitui o anterior. O tipo vê-se pelos bytes, não pela extensão. Uma imagem " +
                "fica no máximo com 2560 px e perde os metadados; um PDF fica como veio.",
            security: [{ bearerAuth: [] }],
            parameters: [idParam, resourceIdParam],
            requestBody: fileBody("O ficheiro: JPEG, PNG, WebP ou PDF, até 10 MB"),
            responses: {
                "201": jsonResponse(201, "Ficheiro anexado", fileResponseSchema),
                ...errorResponses(400),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Não está no projeto, ou o recurso não é seu"),
                "404": jsonResponse(404, "Projeto ou recurso não encontrado"),
                "413": jsonResponse(413, "O ficheiro tem mais de 10 MB"),
                ...errorResponses(500),
            },
        },
        delete: {
            tags: ["Recursos"],
            summary: "Apagar o ficheiro de um recurso",
            description: `${editors}O recurso fica, só sem ficheiro. Sem ficheiro, é 404.`,
            security: [{ bearerAuth: [] }],
            parameters: [idParam, resourceIdParam],
            responses: {
                "200": jsonResponse(200, "Ficheiro apagado"),
                "401": jsonResponse(401, "Token em falta ou inválido"),
                "403": jsonResponse(403, "Não está no projeto, ou o recurso não é seu"),
                "404": jsonResponse(404, "Projeto ou recurso não encontrado, ou sem ficheiro"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
