import { getAllStorageKeys, getOrphanFiles } from "../../repositories/file-repo.js";
import { FILE_KINDS } from "./file-kinds.js";
import { removeFile } from "./files.js";
import { storage } from "./storage.js";

/** Um ficheiro sem linha mais novo do que isto pode ser um upload a meio: fica. */
const STRAY_MIN_AGE_MS = 60 * 60 * 1000;

export interface SweepResult {
    /** Linhas cujo dono já não existe, apagadas com o ficheiro. */
    orphanRows: number;
    /** Ficheiros no disco sem linha nenhuma, apagados. */
    strayFiles: number;
}

/**
 * Arruma o que o código não apanha: um dono apagado por um CASCADE da base de
 * dados (uma empresa, um projeto com despesas), ou um upload que morreu entre
 * o disco e a linha. Corre no cron dos backups, antes do backup.
 */
export async function sweepFiles(now: number = Date.now()): Promise<SweepResult> {
    let orphanRows = 0;

    for (const spec of Object.values(FILE_KINDS)) {
        for (const file of await getOrphanFiles(spec.kind, spec.ownerTable)) {
            await removeFile(file);
            orphanRows++;
        }
    }

    const known = await getAllStorageKeys();
    let strayFiles = 0;

    for (const { key, modifiedAt } of await storage.list()) {
        if (!known.has(key) && now - modifiedAt.getTime() > STRAY_MIN_AGE_MS) {
            await storage.remove(key);
            strayFiles++;
        }
    }

    return { orphanRows, strayFiles };
}
