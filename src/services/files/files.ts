import { createHash } from "node:crypto";
import { HttpError, invalidData } from "../../dtos/common/errors-dto.js";
import type { FileResponse } from "../../dtos/file/file-dto.js";
import type { StoredFile } from "../../entities/StoredFile.js";
import {
    createFile,
    deleteFile,
    fileRepo,
    getFilesByOwnerIds,
    getFilesOfOwner,
    getFilesWithSameHash,
    getOwnerFileByHash,
    newFileId,
} from "../../repositories/file-repo.js";
import type { FileKind } from "../../types/enums.js";
import { FILE_KINDS, type FileKindSpec } from "./file-kinds.js";
import { describeTypes, detectFileType, FILE_TYPES, isImageType } from "./file-types.js";
import { processImage } from "./image-processing.js";
import { signedFileUrl } from "./signed-urls.js";
import { storage, storageKeyOf } from "./storage.js";

/** O que o multer deixa em req.file, só com o que usamos. */
export interface IncomingFile {
    buffer: Buffer;
    originalname: string;
}

interface UploadTarget {
    companyId: string;
    ownerId: string;
    uploadedBy: string;
}

const NAME_MAX = 255;

/** O nome como chegou, sem caracteres de controlo e com tamanho que caiba na coluna. */
function cleanName(name: string, fallback: string): string {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: é mesmo para os tirar.
    const clean = name.replace(/[\u0000-\u001f\u007f]/g, "").trim();

    return (clean || fallback).slice(0, NAME_MAX);
}

/**
 * Guarda um ficheiro de um dono. Pela ordem: o tipo pelos bytes, o hash, as
 * regras do kind (repetido, cheio), a imagem reprocessada, o disco, e só no
 * fim a linha. Se a linha falhar, o ficheiro sai do disco.
 *
 * Num kind de um só (o avatar), o novo substitui o antigo depois de gravado:
 * se algo falhar pelo caminho, fica o antigo.
 */
export async function saveUpload(spec: FileKindSpec, target: UploadTarget, file: IncomingFile): Promise<StoredFile> {
    const detected = detectFileType(file.buffer);

    if (!detected || !spec.types.includes(detected)) {
        throw invalidData([{ field: "file", message: `Tipo de ficheiro não aceite: usa ${describeTypes(spec.types)}` }]);
    }

    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const existing = await getFilesOfOwner(spec.kind, target.ownerId);
    const replaces = spec.maxPerOwner === 1;

    if (!replaces) {
        if (await getOwnerFileByHash(spec.kind, target.ownerId, sha256)) {
            throw new HttpError(409, "Este ficheiro já está anexado");
        }

        if (existing.length >= spec.maxPerOwner) {
            throw new HttpError(409, `Já tem ${spec.maxPerOwner} ficheiros: apaga um antes de enviar outro`);
        }
    }

    const { bytes, type } = isImageType(detected)
        ? await processImage(file.buffer, detected, spec.image)
        : { bytes: file.buffer, type: detected };
    const info = FILE_TYPES[type];

    const id = await newFileId();
    const storageKey = storageKeyOf({ companyId: target.companyId, kind: spec.kind, id }, info.extension);

    await storage.put(storageKey, bytes);

    let saved: StoredFile;

    try {
        saved = await createFile(fileRepo.create({
            id,
            companyId: target.companyId,
            kind: spec.kind,
            ownerId: target.ownerId,
            originalName: cleanName(file.originalname, `${spec.label}.${info.extension}`),
            mimeType: info.mimeType,
            sizeBytes: bytes.length,
            sha256,
            storageKey,
            uploadedBy: target.uploadedBy,
        }));
    } catch (error) {
        await storage.remove(storageKey);
        throw error;
    }

    if (replaces) {
        for (const old of existing) {
            await removeFile(old);
        }
    }

    return saved;
}

/** A linha primeiro: um ficheiro esquecido no disco não faz mal, uma linha sem ficheiro faz. */
export async function removeFile(file: StoredFile): Promise<void> {
    await deleteFile(file.id);

    try {
        await storage.remove(file.storageKey);
    } catch (error) {
        // A linha já não está: o files:sweep acaba o trabalho.
        console.error(`Falha ao apagar ${file.storageKey} do disco`, error);
    }
}

/** Quando o dono é apagado pelo código. Os CASCADE da base de dados ficam para o files:sweep. */
export async function removeFilesOf(kind: FileKind, ownerId: string): Promise<void> {
    for (const file of await getFilesOfOwner(kind, ownerId)) {
        await removeFile(file);
    }
}

/** O nome de um download: recibo_2026-10-27_a1b2c3d4.pdf. Só com o que nunca muda. */
export function downloadName(file: Pick<StoredFile, "id" | "kind" | "mimeType" | "createdAt">): string {
    const extension = Object.values(FILE_TYPES).find((info) => info.mimeType === file.mimeType)?.extension ?? "bin";
    const date = file.createdAt.toISOString().slice(0, 10);

    return `${FILE_KINDS[file.kind].label}_${date}_${file.id.slice(-8)}.${extension}`;
}

export const toFileResponse = (file: StoredFile, duplicateOwnerIds: string[] = []): FileResponse => ({
    id: file.id,
    kind: file.kind,
    name: file.originalName,
    mimeType: file.mimeType,
    size: file.sizeBytes,
    url: signedFileUrl(file.id),
    uploadedBy: file.uploadedBy,
    createdAt: file.createdAt.toISOString(),
    duplicateOwnerIds,
});

/**
 * Os ficheiros de cada dono, já como a API os devolve, em duas queries no
 * máximo: os ficheiros, e (nos kinds que avisam) os iguais noutros donos.
 * Um dono sem ficheiros fica com uma lista vazia.
 */
export async function filesFor(kind: FileKind, ownerIds: string[]): Promise<Map<string, FileResponse[]>> {
    const files = await getFilesByOwnerIds(kind, [...new Set(ownerIds)]);
    const duplicates = FILE_KINDS[kind].flagDuplicates ? await duplicatesOf(kind, files) : new Map<string, string[]>();
    const byOwner = new Map<string, FileResponse[]>(ownerIds.map((ownerId) => [ownerId, []]));

    for (const file of files) {
        byOwner.get(file.ownerId)?.push(toFileResponse(file, duplicates.get(file.id) ?? []));
    }

    return byOwner;
}

export async function fileResponseOf(file: StoredFile): Promise<FileResponse> {
    const duplicates = FILE_KINDS[file.kind].flagDuplicates
        ? await duplicatesOf(file.kind, [file])
        : new Map<string, string[]>();

    return toFileResponse(file, duplicates.get(file.id) ?? []);
}

/** Para cada ficheiro, os outros donos da mesma empresa com o mesmo hash. */
async function duplicatesOf(kind: FileKind, files: StoredFile[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    const byCompany = new Map<string, StoredFile[]>();

    for (const file of files) {
        byCompany.set(file.companyId, [...(byCompany.get(file.companyId) ?? []), file]);
    }

    for (const [companyId, companyFiles] of byCompany) {
        const same = await getFilesWithSameHash(companyId, kind, companyFiles.map((file) => file.sha256));

        for (const file of companyFiles) {
            const others = same
                .filter((other) => other.sha256 === file.sha256 && other.ownerId !== file.ownerId)
                .map((other) => other.ownerId);

            result.set(file.id, [...new Set(others)]);
        }
    }

    return result;
}
