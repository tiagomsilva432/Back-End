import { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { downloadFile } from "../controllers/file-controller.js";
import { errorResponses, jsonResponse, pathId } from "../docs/response.js";

const router = Router();

// Sem requireAuth: o link assinado é a autorização, para servir num <img src>.
router.get(
    "/files/:id",
    downloadFile
);

export const filePaths: ZodOpenApiPathsObject = {
    "/files/{id}": {
        get: {
            tags: ["Ficheiros"],
            summary: "Abrir um ficheiro",
            description:
                "Não se chama à mão: usa-se o `url` que vem no recurso (a despesa, a ausência, o perfil), que já traz " +
                "o `exp` e a `sig`. Sem token, para servir num `<img src>` ou num `<a href>`. O link só é dado a quem " +
                "pode ver o recurso, e expira; depois disso pede-se o recurso outra vez para ter um novo. " +
                "Abre no browser (`inline`); com `&download=1` descarrega, com um nome como " +
                "`recibo_2026-10-27_a1b2c3d4.pdf`.",
            parameters: [
                pathId("Id do ficheiro"),
                { name: "exp", in: "query", required: true, schema: { type: "string" }, description: "Quando expira, em segundos desde 1970." },
                { name: "sig", in: "query", required: true, schema: { type: "string" }, description: "A assinatura do link." },
                { name: "download", in: "query", required: false, schema: { type: "string", enum: ["1"] }, description: "Descarregar em vez de abrir." },
            ],
            responses: {
                "200": {
                    description: "O ficheiro: JPEG, PNG, WebP ou PDF",
                    content: {
                        "image/jpeg": { schema: { type: "string", format: "binary" } },
                        "image/png": { schema: { type: "string", format: "binary" } },
                        "image/webp": { schema: { type: "string", format: "binary" } },
                        "application/pdf": { schema: { type: "string", format: "binary" } },
                    },
                },
                "403": jsonResponse(403, "Link inválido ou expirado"),
                "404": jsonResponse(404, "Ficheiro não encontrado"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;
