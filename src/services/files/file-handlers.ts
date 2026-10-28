import type { Request, Response } from "express";
import { HttpError } from "../../dtos/common/errors-dto.js";
import { HttpResponse } from "../../dtos/common/responses-dto.js";
import type { StoredFile } from "../../entities/StoredFile.js";
import type { User } from "../../entities/User.js";
import { getCurrentActor } from "../../middleware/requireRole.js";
import { getFileById, getFilesOfOwner } from "../../repositories/file-repo.js";
import { uuidParam } from "../../utils/params.js";
import type { FileKindSpec } from "./file-kinds.js";
import { fileResponseOf, removeFile, saveUpload } from "./files.js";

/** O dono de um ficheiro, já carregado e verificado pelas regras do recurso. */
export interface FileOwner<O> {
    companyId: string;
    ownerId: string;
    owner: O;
}

interface FileHandlerOptions<O> {
    /**
     * Carrega o dono a partir do pedido (o :id da rota) e aplica-lhe as regras
     * do recurso: lança o mesmo 404 ou 403 que as outras rotas dele. Serve
     * para enviar e para apagar.
     */
    requireOwner: (actor: User, req: Request) => Promise<FileOwner<O>>;
    /** Depois de gravado, com await antes de responder: notificações e afins. */
    afterUpload?: (actor: User, owner: O, file: StoredFile) => Promise<void>;
    /** O mesmo, depois de apagar. */
    afterRemove?: (actor: User, owner: O) => Promise<void>;
    messages: { uploaded: string; removed: string; notFound: string };
}

/**
 * As rotas de ficheiros de um recurso, que só tem de dizer quem é o dono:
 *
 *     const receipts = fileHandlers(FILE_KINDS[FileKind.ExpenseReceipt], { requireOwner, messages });
 *     router.post("/expenses/:id/receipts", requireAuth, requireRole(), acceptFile(spec), receipts.upload);
 *     router.delete("/expenses/:id/receipts/:fileId", requireAuth, requireRole(), receipts.remove);
 *
 * Num kind de um só (o avatar) a rota de apagar não leva :fileId: apaga o que houver.
 */
export function fileHandlers<O>(spec: FileKindSpec, options: FileHandlerOptions<O>) {
    const upload = async (req: Request, res: Response) => {
        const actor: User = getCurrentActor(req);
        const { companyId, ownerId, owner } = await options.requireOwner(actor, req);

        const saved = await saveUpload(spec, { companyId, ownerId, uploadedBy: actor.id }, req.file!);

        await options.afterUpload?.(actor, owner, saved);

        return new HttpResponse(201, options.messages.uploaded, undefined, await fileResponseOf(saved)).send(res);
    };

    const remove = async (req: Request, res: Response) => {
        const actor: User = getCurrentActor(req);
        const { ownerId, owner } = await options.requireOwner(actor, req);

        const files = req.params.fileId === undefined
            ? await getFilesOfOwner(spec.kind, ownerId)
            : [await getFileById(uuidParam(req.params.fileId, options.messages.notFound))]
                .filter((file): file is StoredFile => file?.kind === spec.kind && file.ownerId === ownerId);

        // O ficheiro de outro dono é o mesmo 404 de um que não existe.
        if (files.length === 0) {
            throw new HttpError(404, options.messages.notFound);
        }

        for (const file of files) {
            await removeFile(file);
        }

        await options.afterRemove?.(actor, owner);

        return new HttpResponse(200, options.messages.removed).send(res);
    };

    return { upload, remove };
}
