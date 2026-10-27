import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { Notification } from "../../src/entities/Notification.js";
import { AbsenceStatus, AbsenceType, FileKind, UserRole } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarAusencia, criarUtilizador } from "../helpers/factories.js";
import { enviarFicheiro, fotografia, noDisco, pdf } from "../helpers/files.js";
import { eventsSentToUsers } from "../helpers/realtime-spy.js";
import { repo } from "../setup/db.js";

const ativo = (companyId: string, role = UserRole.Employee) =>
    criarUtilizador({ companyId, role, password: "Password1!", mustChangePassword: false });

const ler = (caminho: string, header: string) => request(app).get(caminho).set("Authorization", header);

const juntar = (ausenciaId: string, header: string, bytes: Buffer, nome = "atestado.pdf") =>
    enviarFicheiro(`/absences/${ausenciaId}/documents`, header, bytes, nome);

/** As notificações de uma pessoa, só tipo e dados. */
const recebidas = async (userId: string) =>
    (await repo(Notification).find({ where: { recipientId: userId }, order: { id: "ASC" } }))
        .map(({ type, data }) => ({ type, data }));

/** Um company_admin (quem decide), a Ana com uma baixa pendente, e um colega. */
const cenario = async (status = AbsenceStatus.Pending) => {
    const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
    const ana = await ativo(admin.companyId);
    const rui = await ativo(admin.companyId);
    const ausencia = await criarAusencia(ana, { type: AbsenceType.Leave, status });

    return { admin, header, ana, rui, ausencia };
};

describe("POST /absences/:id/documents", () => {
    it("a pessoa junta um documento a um pedido pendente, e quem decide é avisado", async () => {
        const { admin, ana, ausencia } = await cenario();

        const res = await juntar(ausencia.id, authorization(ana), pdf());

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: 201, message: "Documento anexado" });
        expect(res.body.data).toMatchObject({ kind: FileKind.AbsenceDocument, name: "atestado.pdf", uploadedBy: ana.id });
        expect(await noDisco()).toEqual([`${ana.companyId}/absence_document/${res.body.data.id}.pdf`]);

        expect(await recebidas(admin.id)).toEqual([{
            type: "absence.document_added",
            data: {
                absenceId: ausencia.id,
                userId: ana.id,
                type: AbsenceType.Leave,
                startDate: ausencia.startDate,
                endDate: ausencia.endDate,
            },
        }]);
        expect(eventsSentToUsers("notification").map(([ids]) => ids)).toEqual([[admin.id]]);
        expect(await recebidas(ana.id)).toEqual([]);
    });

    it("a pessoa e o admin veem os documentos no pedido e nas listas", async () => {
        const { header, ana, ausencia } = await cenario();
        const { body } = await juntar(ausencia.id, authorization(ana), await fotografia(), "atestado.jpg");

        const daPessoa = await ler(`/absences/${ausencia.id}`, authorization(ana));
        const doAdmin = await ler(`/absences/${ausencia.id}`, header);
        const minhas = await ler("/absences/mine", authorization(ana));
        const paraDecidir = await ler("/absences", header);

        expect(daPessoa.body.data.documents).toEqual([body.data]);
        expect(doAdmin.body.data.documents).toEqual([body.data]);
        expect(minhas.body.data[0].documents).toEqual([body.data]);
        expect(paraDecidir.body.data.find((a: { id: string }) => a.id === ausencia.id).documents).toEqual([body.data]);
    });

    it("um admin a juntar não avisa ninguém, nem a pessoa num pedido já aprovado", async () => {
        const pendente = await cenario();
        const aprovado = await cenario(AbsenceStatus.Approved);

        const peloAdmin = await juntar(pendente.ausencia.id, pendente.header, pdf("admin"));
        const jaAprovado = await juntar(aprovado.ausencia.id, authorization(aprovado.ana), pdf("aprovado"));

        expect(peloAdmin.status).toBe(201);
        expect(jaAprovado.status).toBe(201);
        expect(await repo(Notification).count()).toBe(0);
    });

    it("um colega recebe 404, como se o pedido não existisse, e nada fica gravado", async () => {
        const { rui, ausencia } = await cenario();

        const res = await juntar(ausencia.id, authorization(rui), pdf());

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Pedido não encontrado");
        expect(await noDisco()).toEqual([]);
    });

    it.each([AbsenceStatus.Cancelled, AbsenceStatus.Rejected])("num pedido %s é 409", async (status) => {
        const { ana, ausencia } = await cenario(status);

        const res = await juntar(ausencia.id, authorization(ana), pdf());

        expect(res.status).toBe(409);
        expect(res.body.message).toBe(`Este pedido já não está ativo: está ${status}`);
    });

    it("o mesmo documento duas vezes é 409", async () => {
        const { ana, ausencia } = await cenario();

        await juntar(ausencia.id, authorization(ana), pdf());
        const outraVez = await juntar(ausencia.id, authorization(ana), pdf(), "copia.pdf");

        expect(outraVez.status).toBe(409);
    });
});

describe("DELETE /absences/:id/documents/:fileId", () => {
    it("a pessoa tira o seu, e sai do disco", async () => {
        const { ana, ausencia } = await cenario();
        const { body } = await juntar(ausencia.id, authorization(ana), pdf());

        const res = await request(app)
            .delete(`/absences/${ausencia.id}/documents/${body.data.id}`)
            .set("Authorization", authorization(ana));

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Documento apagado");
        expect(await noDisco()).toEqual([]);
        expect((await ler(`/absences/${ausencia.id}`, authorization(ana))).body.data.documents).toEqual([]);
    });

    it("um colega recebe 404, e o documento fica", async () => {
        const { ana, rui, ausencia } = await cenario();
        const { body } = await juntar(ausencia.id, authorization(ana), pdf());

        const res = await request(app)
            .delete(`/absences/${ausencia.id}/documents/${body.data.id}`)
            .set("Authorization", authorization(rui));

        expect(res.status).toBe(404);
        expect(await noDisco()).toHaveLength(1);
    });
});
