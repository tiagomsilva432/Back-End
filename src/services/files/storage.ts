import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { uploadsDir } from "../../env-vars.js";

/**
 * Onde moram os bytes. Hoje é o disco (um volume do Docker em produção); para
 * passar a um S3 ou R2 basta outra implementação desta interface.
 */
export interface FileStorage {
    /** Grava inteiro ou não grava: nunca fica meio ficheiro com o nome certo. */
    put(key: string, bytes: Buffer): Promise<void>;
    /** O caminho absoluto, para o res.sendFile. */
    path(key: string): string;
    /** Apagar um que já não existe não é erro. */
    remove(key: string): Promise<void>;
    /** Tudo o que lá está, para o files:sweep. */
    list(): Promise<Array<{ key: string; modifiedAt: Date }>>;
}

/** Uma chave nunca sai da pasta de uploads, nem que viesse com "..". */
function resolveKey(key: string): string {
    const root = uploadsDir();
    const full = path.resolve(root, key);

    if (!full.startsWith(root + path.sep)) {
        throw new Error(`Chave de ficheiro fora da pasta de uploads: ${key}`);
    }

    return full;
}

const diskStorage: FileStorage = {
    async put(key, bytes) {
        const full = resolveKey(key);
        const temp = `${full}.${randomUUID()}.tmp`;

        await mkdir(path.dirname(full), { recursive: true });
        await writeFile(temp, bytes);
        // Um rename na mesma pasta é atómico.
        await rename(temp, full);
    },

    path: resolveKey,

    async remove(key) {
        await rm(resolveKey(key), { force: true });
    },

    async list() {
        const root = uploadsDir();
        const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch((error: unknown) => {
            // Ainda ninguém enviou nada: a pasta nem existe.
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return [];
            }
            throw error;
        });

        return await Promise.all(
            entries
                .filter((entry) => entry.isFile())
                .map(async (entry) => {
                    const full = path.join(entry.parentPath, entry.name);
                    // As chaves usam sempre "/", também no Windows.
                    const key = path.relative(root, full).split(path.sep).join("/");

                    return { key, modifiedAt: (await stat(full)).mtime };
                }),
        );
    },
};

/** Objeto e não exports soltos: é o que permite o jest.spyOn nos testes. */
export const storage: FileStorage = diskStorage;

/** {companyId}/{kind}/{id}.{ext}: a categoria está na pasta, e o nome é só o id. */
export const storageKeyOf = (file: { companyId: string; kind: string; id: string }, extension: string): string =>
    `${file.companyId}/${file.kind}/${file.id}.${extension}`;
