import { z } from "zod";
import { HttpError } from "../dtos/common/errors-dto.js";

const uuid = z.uuid();

export function uuidParam(value: unknown, notFoundMessage: string): string {
    const parsed = uuid.safeParse(value);

    if (!parsed.success) {
        throw new HttpError(404, notFoundMessage);
    }

    return parsed.data;
}
