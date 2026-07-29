import { Router, Request, Response, NextFunction } from "express";
import { ZodOpenApiPathsObject } from "zod-openapi";
import { HttpResponse } from "../dtos/common/responses.dto.js";
import { jsonResponse, errorResponses } from "../docs/response.js";

const router = Router();

router.get("/health", (_req: Request, res: Response, next: NextFunction) => {
    try {
        return new HttpResponse(200, "Ligação com a API OK").send(res);
    } catch (error) {
        next(error);
    }
});

//Documentação OpenAPI desta rota
export const healthPaths: ZodOpenApiPathsObject = {
    "/health": {
        get: {
            tags: ["Sistema"],
            summary: "Verificar o estado da API",
            responses: {
                "200": jsonResponse(200, "Ligação com a API OK"),
                ...errorResponses(500),
            },
        },
    },
};

export default router;