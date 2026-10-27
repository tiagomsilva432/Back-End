/**
 * Os tipos que a API aceita, reconhecidos pelos primeiros bytes. A extensão e o
 * Content-Type do cliente nunca contam: um .pdf que é HTML é recusado, e um
 * SVG (que pode levar JavaScript) nem sequer existe aqui.
 */

export type FileType = "jpeg" | "png" | "webp" | "pdf";

interface FileTypeInfo {
    mimeType: string;
    extension: string;
}

export const FILE_TYPES: Record<FileType, FileTypeInfo> = {
    jpeg: { mimeType: "image/jpeg", extension: "jpg" },
    png: { mimeType: "image/png", extension: "png" },
    webp: { mimeType: "image/webp", extension: "webp" },
    pdf: { mimeType: "application/pdf", extension: "pdf" },
};

export const isImageType = (type: FileType): boolean => type !== "pdf";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
    bytes.length >= offset + signature.length && signature.every((byte, i) => bytes[offset + i] === byte);

const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));

/** O tipo pelos bytes, ou null se não for nenhum dos que conhecemos. */
export function detectFileType(bytes: Uint8Array): FileType | null {
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
        return "jpeg";
    }
    if (startsWith(bytes, PNG_SIGNATURE)) {
        return "png";
    }
    // RIFF, 4 bytes de tamanho, WEBP.
    if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) {
        return "webp";
    }
    if (startsWith(bytes, ascii("%PDF-"))) {
        return "pdf";
    }
    return null;
}

/** Os tipos que um kind aceita, como o 400 os diz a quem enviou. */
export const describeTypes = (types: readonly FileType[]): string =>
    types.map((type) => FILE_TYPES[type].extension.toUpperCase()).join(", ");
