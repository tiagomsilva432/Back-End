import { Router, Request, Response, NextFunction } from "express";
import { ZodOpenApiPathsObject } from "zod-openapi";
import { HttpResponse } from "../dtos/common/responses.dto.js";
import { jsonResponse, errorResponses } from "../docs/response.js";
import { AppDataSource } from "../data-source.js";
import { User } from "../entities/User.js";
import { HttpError } from "../dtos/common/errors.dto.js";

const router = Router();
const userRepository = AppDataSource.getRepository(User);

router.get("/health", (_req: Request, res: Response, next: NextFunction) => {
    try {
        return new HttpResponse(200, "Ligação com a API OK").send(res);
    } catch (error) {
        next(error);
    }
});

router.get("/health/db", async(_req: Request, res: Response, next: NextFunction) => {
    try {
        if(!AppDataSource.isInitialized){
            return next(new HttpError(503, "Data Source não inicializada"));
        }
        await userRepository.findOneBy({id:1});
        return new HttpResponse(200, "Ligação com a Base de Dados OK").send(res);
    } catch (error) {
        return next(new HttpError(503, "Falha na ligação à base de dados", undefined, error));
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
    "/health/db":{
        get: {
            tags: ["Sistema"],
            summary: "Verificar Ligação à Base de Dados",
            responses: {
                "200": jsonResponse(200, "Ligação com a Base de Dados OK"),
                ...errorResponses(500, 503)
            }
        }
    }
};

export default router;