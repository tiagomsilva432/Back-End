import type { Request, Response } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { getFileById } from "../repositories/file-repo.js";
import { downloadName } from "../services/files/files.js";
import { checkSignature, secondsLeft } from "../services/files/signed-urls.js";
import { storage } from "../services/files/storage.js";
import { uuidParam } from "../utils/params.js";

const NOT_FOUND = "Ficheiro não encontrado";

/** filename="..." só em ASCII; o filename* leva o nome inteiro, para os browsers que o leem. */
const contentDisposition = (type: "inline" | "attachment", name: string): string =>
    `${type}; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;

/**
 * Sem token: a assinatura no link é a autorização (ver signed-urls.ts). Uma
 * assinatura errada ou expirada é 403, e um ficheiro que já não existe 404.
 */
export const downloadFile = async (req: Request, res: Response) => {
    const id = uuidParam(req.params.id, NOT_FOUND);
    const { exp, sig, download } = req.query;

    const check = checkSignature(id, exp, sig);

    if (check !== "valid") {
        throw new HttpError(403, check === "expired" ? "Este link expirou. Atualize a página para abrir o ficheiro" : "Link inválido");
    }

    const file = await getFileById(id);

    if (!file) {
        throw new HttpError(404, NOT_FOUND);
    }

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", contentDisposition(download === "1" ? "attachment" : "inline", downloadName(file)));
    // O tipo veio dos bytes: o browser não tem de adivinhar, nem de correr nada.
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Só nas imagens: o leitor de PDF do browser é um plugin, e um default-src
    // 'none' pode bloqueá-lo. O JavaScript de um PDF corre no leitor, não na API.
    if (file.mimeType.startsWith("image/")) {
        res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    }
    // Um ficheiro nunca muda (substituir é um id novo), mas o link expira.
    res.setHeader("Cache-Control", `private, max-age=${secondsLeft(exp as string)}`);

    await new Promise<void>((resolve, reject) => {
        res.sendFile(storage.path(file.storageKey), { dotfiles: "deny", cacheControl: false }, (error) => {
            if (!error) {
                return resolve();
            }

            // A linha existe mas o disco não tem o ficheiro.
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                console.error(`O ficheiro ${file.id} não está no disco: ${file.storageKey}`);
                return reject(new HttpError(404, NOT_FOUND));
            }

            reject(error);
        });
    });
}
