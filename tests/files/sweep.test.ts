import { describe, expect, it } from "@jest/globals";
import { Expense } from "../../src/entities/Expense.js";
import { StoredFile } from "../../src/entities/StoredFile.js";
import { storage } from "../../src/services/files/storage.js";
import { sweepFiles } from "../../src/services/files/sweep.js";
import { UserRole } from "../../src/types/enums.js";
import { createActor } from "../helpers/auth.js";
import { criarDespesa } from "../helpers/factories.js";
import { enviarFicheiro, noDisco, pdf } from "../helpers/files.js";
import { repo } from "../setup/db.js";

const DUAS_HORAS = 2 * 60 * 60 * 1000;

describe("sweepFiles", () => {
    it("apaga os recibos de uma despesa que desapareceu sem passar pela API", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        const despesa = await criarDespesa(admin.companyId, admin.id);
        const fica = await criarDespesa(admin.companyId, admin.id);
        await enviarFicheiro(`/expenses/${despesa.id}/receipts`, header, pdf("vai"));
        const { body } = await enviarFicheiro(`/expenses/${fica.id}/receipts`, header, pdf("fica"));

        // Como um CASCADE de um projeto apagado: a linha da despesa vai, a do ficheiro não.
        await repo(Expense).delete({ id: despesa.id });

        expect(await sweepFiles()).toEqual({ orphanRows: 1, strayFiles: 0 });
        expect(await repo(StoredFile).find()).toMatchObject([{ id: body.data.id }]);
        expect(await noDisco()).toEqual([`${admin.companyId}/expense_receipt/${body.data.id}.pdf`]);
    });

    it("apaga um ficheiro sem linha com mais de uma hora; um recente pode ser um upload a meio", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        const despesa = await criarDespesa(admin.companyId, admin.id);
        const { body } = await enviarFicheiro(`/expenses/${despesa.id}/receipts`, header, pdf());
        await storage.put("perdido/expense_receipt/sem-linha.pdf", pdf("perdido"));

        expect(await sweepFiles()).toEqual({ orphanRows: 0, strayFiles: 0 });
        expect(await noDisco()).toHaveLength(2);

        expect(await sweepFiles(Date.now() + DUAS_HORAS)).toEqual({ orphanRows: 0, strayFiles: 1 });
        expect(await noDisco()).toEqual([`${admin.companyId}/expense_receipt/${body.data.id}.pdf`]);
    });
});
