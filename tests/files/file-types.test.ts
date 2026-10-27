import { describe, expect, it } from "@jest/globals";
import sharp from "sharp";
import { detectFileType } from "../../src/services/files/file-types.js";
import { pdf, png } from "../helpers/files.js";

const imagem = (formato: "jpeg" | "webp") =>
    sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } })[formato]().toBuffer();

describe("detectFileType", () => {
    it("reconhece os quatro tipos pelos bytes", async () => {
        expect(detectFileType(await imagem("jpeg"))).toBe("jpeg");
        expect(detectFileType(await png())).toBe("png");
        expect(detectFileType(await imagem("webp"))).toBe("webp");
        expect(detectFileType(pdf())).toBe("pdf");
    });

    it.each([
        ["HTML com nome de PDF", Buffer.from("<html><script>alert(1)</script></html>")],
        ["um SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
        ["texto", Buffer.from("isto não é um recibo")],
        ["vazio", Buffer.alloc(0)],
        ["só metade da assinatura do PNG", Buffer.from([0x89, 0x50, 0x4e])],
        ["um RIFF que não é WebP", Buffer.from("RIFF\0\0\0\0WAVEfmt ")],
    ])("não reconhece %s", (_titulo, bytes) => {
        expect(detectFileType(bytes)).toBeNull();
    });
});
