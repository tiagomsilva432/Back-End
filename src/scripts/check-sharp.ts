import sharp from "sharp";
import { processImage } from "../services/files/image-processing.js";

/**
 * Prova que o sharp funciona nesta máquina: os binários do libvips são nativos,
 * e é aqui que um build para a plataforma errada rebenta. Corre no CI, dentro
 * da imagem de produção, e no servidor depois de um deploy:
 *
 *     docker compose --env-file .env.prod -f compose.prod.yaml exec api node dist/scripts/check-sharp.js
 *
 * Passa pelo mesmo processImage dos uploads, com uma fotografia de telemóvel
 * a fingir: grande, deitada pelo EXIF, e com metadados que têm de sair.
 */
try {
    const photo = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#c0392b" } })
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer();

    const avatar = await sharp((await processImage(photo, "jpeg", "avatar")).bytes).metadata();
    const receipt = await sharp((await processImage(photo, "jpeg", "photo")).bytes).metadata();

    const ok = avatar.format === "webp" && avatar.width === 512 && avatar.height === 512
        && receipt.format === "jpeg" && receipt.width === 1707 && receipt.height === 2560
        && receipt.orientation === undefined && receipt.exif === undefined;

    if (!ok) {
        throw new Error(`Resultado inesperado: ${JSON.stringify({ avatar, receipt })}`);
    }

    console.log(`sharp ${sharp.versions.sharp} (libvips ${sharp.versions.vips}) em ${process.platform}-${process.arch}: OK`);
} catch (error) {
    console.error("O sharp não funciona nesta máquina:", error);
    process.exitCode = 1;
}
