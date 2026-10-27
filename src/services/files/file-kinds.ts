import { FileKind } from "../../types/enums.js";
import type { FileType } from "./file-types.js";

const MB = 1024 * 1024;

/**
 * As regras de um tipo de ficheiro. Um tipo novo é uma entrada aqui, um valor
 * no FileKind, e as rotas no recurso dono com o fileHandlers(): nada de
 * migrações, a tabela files serve todos.
 */
export interface FileKindSpec {
    kind: FileKind;
    /** O começo do nome de um download: recibo_2026-10-27_a1b2c3d4.pdf. */
    label: string;
    /** O que se aceita receber, antes de uma imagem ser reprocessada. */
    maxBytes: number;
    types: readonly FileType[];
    /** 1 substitui o que lá está; mais do que 1 é uma lista, e cheia dá 409. */
    maxPerOwner: number;
    /** A tabela do dono, para o files:sweep saber que ficheiros ficaram sem ele. */
    ownerTable: string;
    /** Como se reprocessa uma imagem: um avatar quadrado, ou a fotografia de um papel. */
    image: "avatar" | "photo";
    /** Avisa quando o mesmo ficheiro já está noutro dono da mesma empresa. */
    flagDuplicates: boolean;
}

const PAPERS: readonly FileType[] = ["jpeg", "png", "webp", "pdf"];

export const FILE_KINDS: Record<FileKind, FileKindSpec> = {
    [FileKind.Avatar]: {
        kind: FileKind.Avatar,
        label: "avatar",
        maxBytes: 5 * MB,
        types: ["jpeg", "png", "webp"],
        maxPerOwner: 1,
        ownerTable: "users",
        image: "avatar",
        flagDuplicates: false,
    },
    [FileKind.ExpenseReceipt]: {
        kind: FileKind.ExpenseReceipt,
        label: "recibo",
        maxBytes: 10 * MB,
        types: PAPERS,
        maxPerOwner: 5,
        ownerTable: "expenses",
        image: "photo",
        // O mesmo recibo em duas despesas é pago duas vezes. Avisa-se, não se
        // impede: uma fatura pode ser dividida a sério.
        flagDuplicates: true,
    },
    [FileKind.AbsenceDocument]: {
        kind: FileKind.AbsenceDocument,
        label: "justificacao",
        maxBytes: 10 * MB,
        types: PAPERS,
        maxPerOwner: 5,
        ownerTable: "absence_requests",
        image: "photo",
        flagDuplicates: false,
    },
};
