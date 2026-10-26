import type { Request, Response, NextFunction } from "express";
import type { z } from "zod";
import { fieldErrorsOf, invalidData } from "../dtos/common/errors-dto.js";

export function validateQuery(schema: z.ZodType) {
    return (req: Request, _res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            return next(invalidData(fieldErrorsOf(result.error.issues)));
        }
        req.validQuery = result.data;
        next();
    };
}
