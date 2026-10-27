import sharp from "sharp";
import { invalidData } from "../../dtos/common/errors-dto.js";
import type { FileKindSpec } from "./file-kinds.js";
import type { FileType } from "./file-types.js";

// Um servidor pequeno (2 vCPU, 4 GB): uma imagem de cada vez, e sem a cache do
// libvips, que guardava em memória imagens que nunca mais se pedem.
sharp.concurrency(1);
sharp.cache(false);

/** 50 MP é mais do que a câmara de qualquer telemóvel. Acima disto é uma bomba de descompressão. */
const MAX_INPUT_PIXELS = 50_000_000;
const AVATAR_SIZE = 512;
/** Um recibo fotografado lê-se bem a 2560 px no lado maior. */
const PHOTO_MAX_EDGE = 2560;

export interface ProcessedImage {
    bytes: Buffer;
    type: FileType;
}

/**
 * Lê a imagem de novo e grava-a outra vez: endireitada pela orientação EXIF, e
 * sem metadados nenhuns, que é o que o sharp faz por omissão. Uma fotografia
 * de telemóvel traz lá o GPS de onde foi tirada.
 *
 * Gravar de novo também desfaz um ficheiro que é imagem e outra coisa ao mesmo
 * tempo: o que sai é só a imagem.
 */
export async function processImage(bytes: Buffer, type: FileType, mode: FileKindSpec["image"]): Promise<ProcessedImage> {
    const image = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).autoOrient();

    try {
        if (mode === "avatar") {
            const avatar = await image
                .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
                .webp({ quality: 82 })
                .toBuffer();

            return { bytes: avatar, type: "webp" };
        }

        const photo = image.resize(PHOTO_MAX_EDGE, PHOTO_MAX_EDGE, { fit: "inside", withoutEnlargement: true });

        switch (type) {
            case "jpeg":
                return { bytes: await photo.jpeg({ quality: 85, mozjpeg: true }).toBuffer(), type };
            case "png":
                return { bytes: await photo.png().toBuffer(), type };
            case "webp":
                return { bytes: await photo.webp({ quality: 85 }).toBuffer(), type };
            default:
                throw new Error(`Não é uma imagem: ${type}`);
        }
    } catch (error) {
        // Os bytes começavam como uma imagem, mas não se leem: cortada, ou grande de mais.
        console.error("Imagem recusada pelo sharp", error);
        throw invalidData([{ field: "file", message: "Não foi possível ler esta imagem" }]);
    }
}
