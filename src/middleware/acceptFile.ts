import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { HttpError, invalidData } from "../dtos/common/errors-dto.js";
import type { FileKindSpec } from "../services/files/file-kinds.js";

const MB = 1024 * 1024;

/**
 * Lê um multipart/form-data com um só ficheiro, no campo `file`, para
 * req.file.buffer. Em memória: são no máximo uns MB, e o ficheiro ainda vai
 * ser verificado e talvez reprocessado antes de chegar ao disco.
 *
 * Os erros do multer passam a ser os da API: 413 para grande de mais, 400 para
 * o resto. Vai depois do requireRole(), para quem não pode nem chegar a enviar.
 */
export function acceptFile(spec: FileKindSpec) {
    const upload = multer({
        storage: multer.memoryStorage(),
        // Os browsers mandam o nome em UTF-8 sem o dizer: em latin1 um "ç" vinha estragado.
        defParamCharset: "utf8",
        limits: { fileSize: spec.maxBytes, files: 1, fields: 5, parts: 10 },
    }).single("file");

    return (req: Request, res: Response, next: NextFunction) => {
        upload(req, res, (error: unknown) => {
            if (error instanceof multer.MulterError) {
                if (error.code === "LIMIT_FILE_SIZE") {
                    return next(new HttpError(413, `O ficheiro tem mais de ${spec.maxBytes / MB} MB`));
                }

                return next(invalidData([{ field: error.field ?? "file", message: "Envie um só ficheiro" }]));
            }

            // O resto vem do busboy: um multipart sem boundary, ou cortado a meio.
            if (error) {
                return next(invalidData([{ field: "file", message: "O ficheiro não chegou completo. Tente enviar outra vez" }]));
            }

            if (!req.file || req.file.size === 0) {
                return next(invalidData([{ field: "file", message: "Falta o ficheiro" }]));
            }

            next();
        });
    };
}
