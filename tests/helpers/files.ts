import { readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import request from "supertest";
import { app } from "../../src/app.js";
import { uploadsDir } from "../../src/env-vars.js";

/** Uma imagem pequena e válida. Cores diferentes dão bytes (e hashes) diferentes. */
export const png = (cor = "#2e86de", lado = 8): Promise<Buffer> =>
    sharp({ create: { width: lado, height: lado, channels: 3, background: cor } }).png().toBuffer();

/**
 * Uma fotografia de telemóvel a fingir: deitada (orientação 6, rodar 90º) e com
 * EXIF, que o upload tem de tirar.
 */
export const fotografia = (largura = 300, altura = 200): Promise<Buffer> =>
    sharp({ create: { width: largura, height: altura, channels: 3, background: "#e67e22" } })
        .withExif({ IFD0: { Copyright: "Ana Teste", Make: "Telemovel" } })
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer();

/** Um PDF mínimo: a API só olha para o começo. Textos diferentes dão hashes diferentes. */
export const pdf = (texto = "recibo"): Buffer =>
    Buffer.from(`%PDF-1.4\n% ${texto}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);

/** Os ficheiros que estão no disco agora, como chaves ({companyId}/{kind}/{id}.{ext}). */
export async function noDisco(): Promise<string[]> {
    const entries = await readdir(uploadsDir(), { recursive: true, withFileTypes: true }).catch(() => []);

    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(uploadsDir(), path.join(entry.parentPath, entry.name)).split(path.sep).join("/"));
}

/** Um upload multipart, no campo `file`, como o browser o manda. */
export const enviarFicheiro = (
    caminho: string,
    header: string,
    bytes: Buffer,
    nome = "ficheiro.pdf",
    metodo: "post" | "put" = "post",
) => request(app)[metodo](caminho).set("Authorization", header).attach("file", bytes, nome);

/** O caminho e a query de um url assinado, para o pedir ao app do supertest. */
export const caminhoDe = (url: string): string => {
    const { pathname, search } = new URL(url);

    return `${pathname}${search}`;
};

/** Abre um url assinado, sem token, e devolve os bytes em res.body. */
export const descarregar = (url: string) =>
    request(app)
        .get(caminhoDe(url))
        .buffer(true)
        .parse((res, callback) => {
            const partes: Buffer[] = [];
            res.on("data", (parte: Buffer) => partes.push(parte));
            res.on("end", () => callback(null, Buffer.concat(partes)));
        });
