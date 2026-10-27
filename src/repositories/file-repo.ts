import { In } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { StoredFile } from "../entities/StoredFile.js";
import type { FileKind } from "../types/enums.js";

export const fileRepo = AppDataSource.getRepository(StoredFile);

/**
 * Um id novo, antes da linha existir: é ele que dá o nome ao ficheiro no disco,
 * e o disco grava-se primeiro. Pedido à base de dados, como o default da coluna,
 * para continuar a ordenar pelo tempo.
 */
export async function newFileId(): Promise<string> {
    const [row] = await fileRepo.query("SELECT uuidv7() AS id") as Array<{ id: string }>;

    return row!.id;
}

export async function getFileById(id: string): Promise<StoredFile | null> {
    return await fileRepo.findOneBy({
        id
    });
}

/** Os ficheiros de vários donos de um tipo, numa query. Do mais antigo para o mais recente. */
export async function getFilesByOwnerIds(kind: FileKind, ownerIds: string[]): Promise<StoredFile[]> {
    if (ownerIds.length === 0) {
        return [];
    }

    return await fileRepo.find({
        where: { kind, ownerId: In(ownerIds) },
        order: { id: "ASC" }
    });
}

export async function getFilesOfOwner(kind: FileKind, ownerId: string): Promise<StoredFile[]> {
    return await getFilesByOwnerIds(kind, [ownerId]);
}

/**
 * Os ficheiros iguais (pelo hash) noutros donos da mesma empresa. Os da
 * própria lista de donos também contam: duas despesas da mesma página podem
 * ter o mesmo recibo.
 */
export async function getFilesWithSameHash(
    companyId: string,
    kind: FileKind,
    hashes: string[],
): Promise<Pick<StoredFile, "ownerId" | "sha256">[]> {
    if (hashes.length === 0) {
        return [];
    }

    return await fileRepo.find({
        select: { ownerId: true, sha256: true },
        where: { companyId, kind, sha256: In([...new Set(hashes)]) }
    });
}

/** O mesmo ficheiro já anexado a este dono, para o 409. */
export async function getOwnerFileByHash(kind: FileKind, ownerId: string, sha256: string): Promise<StoredFile | null> {
    return await fileRepo.findOneBy({
        kind,
        ownerId,
        sha256
    });
}

export async function createFile(file: StoredFile) {
    return await fileRepo.save(file);
}

export async function deleteFile(id: string) {
    return await fileRepo.delete({
        id
    });
}

/**
 * Os ficheiros cujo dono já não existe: apagado por um CASCADE da base de
 * dados, que não passa pelo código. Para o files:sweep. A tabela vem do
 * FILE_KINDS, nunca de um pedido.
 */
export async function getOrphanFiles(kind: FileKind, ownerTable: string): Promise<StoredFile[]> {
    return await fileRepo
        .createQueryBuilder("f")
        .where("f.kind = :kind", { kind })
        .andWhere(`NOT EXISTS (SELECT 1 FROM "${ownerTable}" o WHERE o.id = f.owner_id)`)
        .getMany();
}

/** Todas as chaves que têm linha, para o files:sweep saber o que no disco sobra. */
export async function getAllStorageKeys(): Promise<Set<string>> {
    const rows = await fileRepo.find({ select: { storageKey: true } });

    return new Set(rows.map((row) => row.storageKey));
}
