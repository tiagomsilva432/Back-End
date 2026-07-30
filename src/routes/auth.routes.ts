import { Router, Request, Response, NextFunction } from "express";
import { ZodOpenApiPathsObject } from "zod-openapi";
import { HttpResponse } from "../dtos/common/responses.dto.js";
import { jsonResponse, errorResponses } from "../docs/response.js";
import { AppDataSource } from "../data-source.js";
import { User } from "../entities/User.js";
import { HttpError } from "../dtos/common/errors.dto.js";
import { validateBody } from "../middleware/validateBody.js";
import { createAccountSchema } from "../dtos/auth/account.dto.js";
import { createAccount } from "../controllers/auth.controller.js";

const router = Router();

router.post(
    "/auth/account/create",
    validateBody(createAccountSchema),
    createAccount
);

export default router;