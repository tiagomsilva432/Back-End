import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { HttpError } from "../dtos/common/errors-dto.js";

export function validateBody(schema: z.ZodType) {
    return (req: Request, _res: Response, next: NextFunction) => {
        try {
            const result = schema.safeParse(req.body)
            if (!result.success) {
            const errors = result.error.issues.map(e => ({
                field:   e.path.join('.'),
                message: e.message,
            }));
            return next(new HttpError(400, `Dados inválidos`, "BAD_REQUEST", errors));
            }
            req.body = result.data;
            next();
        } catch (error) {
            next(error);
        }
    }
};