import { describe, expect, it } from "@jest/globals";
import sharp from "sharp";
import { HttpError } from "../../src/dtos/common/errors-dto.js";
import { processImage } from "../../src/services/files/image-processing.js";
import { fotografia, png } from "../helpers/files.js";

describe("processImage", () => {
    it("um avatar fica um quadrado de 512 em WebP, sem metadados", async () => {
        const { bytes, type } = await processImage(await fotografia(), "jpeg", "avatar");
        const meta = await sharp(bytes).metadata();

        expect(type).toBe("webp");
        expect(meta).toMatchObject({ format: "webp", width: 512, height: 512 });
        expect(meta.exif).toBeUndefined();
    });

    it("uma fotografia é endireitada pelo EXIF, e perde-o", async () => {
        const original = await fotografia(300, 200);
        expect((await sharp(original).metadata()).exif).toBeDefined();

        const { bytes, type } = await processImage(original, "jpeg", "photo");
        const meta = await sharp(bytes).metadata();

        // Deitada (orientação 6): 300x200 passa a 200x300.
        expect(type).toBe("jpeg");
        expect(meta).toMatchObject({ format: "jpeg", width: 200, height: 300 });
        expect(meta.exif).toBeUndefined();
        expect(meta.orientation).toBeUndefined();
    });

    it("uma fotografia grande desce para 2560 no lado maior, e uma pequena não cresce", async () => {
        const grande = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#fff" } })
            .png()
            .toBuffer();

        expect(await sharp((await processImage(grande, "png", "photo")).bytes).metadata())
            .toMatchObject({ format: "png", width: 2560, height: 1920 });
        expect(await sharp((await processImage(await png(), "png", "photo")).bytes).metadata())
            .toMatchObject({ width: 8, height: 8 });
    });

    it("uns bytes que começam como imagem mas não se leem são 400", async () => {
        const cortada = (await png()).subarray(0, 30);

        await expect(processImage(cortada, "png", "photo")).rejects.toMatchObject({
            status: 400,
            details: [{ field: "file", message: "Não foi possível ler esta imagem" }],
        });
        await expect(processImage(cortada, "png", "photo")).rejects.toBeInstanceOf(HttpError);
    });
});
