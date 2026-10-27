import { describe, expect, it } from "@jest/globals";
import type { HttpError } from "../../src/dtos/common/errors-dto.js";
import { checkTaskMove } from "../../src/services/task-workflow.js";
import { TaskStatus, UserRole } from "../../src/types/enums.js";

const EMPRESA = "0193a5f1-0000-7000-8000-000000000001";
const OUTRA = "0193a5f1-0000-7000-8000-000000000002";

const pessoa = (id: string, role = UserRole.Employee, companyId = EMPRESA) => ({ id, role, companyId });

const ana = pessoa("0193a5f1-0000-7000-8000-00000000000a");
const rui = pessoa("0193a5f1-0000-7000-8000-00000000000b");
const gestora = pessoa("0193a5f1-0000-7000-8000-00000000000c");
const admin = pessoa("0193a5f1-0000-7000-8000-00000000000d", UserRole.CompanyAdmin);
const adminDeFora = pessoa("0193a5f1-0000-7000-8000-00000000000e", UserRole.CompanyAdmin, OUTRA);
const sysadmin = pessoa("0193a5f1-0000-7000-8000-00000000000f", UserRole.SystemAdmin, OUTRA);

const projeto = { id: "0193a5f1-0000-7000-8000-000000000100", companyId: EMPRESA, managerId: gestora.id };

const { Todo, InProgress, Review, Done } = TaskStatus;

/** O status do erro, ou "ok" se a mudança passa. */
function resultado(actor: typeof ana, de: TaskStatus, para: TaskStatus, assigneeId: string | null = ana.id) {
    try {
        checkTaskMove(actor, projeto, { status: de, assigneeId }, para);
        return "ok";
    } catch (error) {
        return (error as HttpError).status;
    }
}

describe("checkTaskMove", () => {
    it.each([
        ["o responsável avança a sua", ana, Todo, InProgress, ana.id, "ok"],
        ["o responsável manda a sua para revisão", ana, InProgress, Review, ana.id, "ok"],
        ["o responsável tira a sua da revisão", ana, Review, InProgress, ana.id, "ok"],
        ["o responsável muda a sua de lugar", ana, Todo, Todo, ana.id, "ok"],
        ["outro membro não mexe na de outra pessoa", rui, Todo, InProgress, ana.id, 403],
        ["outro membro não a muda de lugar", rui, Review, Review, ana.id, 403],
        ["uma sem responsável move-a qualquer um", rui, Todo, InProgress, null, "ok"],
        ["a gestora move a de qualquer um", gestora, Todo, Review, ana.id, "ok"],
        ["um company_admin da empresa também", admin, InProgress, Todo, ana.id, "ok"],
        ["um company_admin de outra empresa não", adminDeFora, InProgress, Todo, ana.id, 403],
        ["um system_admin move qualquer uma", sysadmin, Todo, InProgress, ana.id, "ok"],
    ])("%s", (_nome, actor, de, para, assigneeId, esperado) => {
        expect(resultado(actor, de, para, assigneeId)).toBe(esperado);
    });

    it.each([
        ["a gestora aprova o que está em revisão", gestora, Review, Done, "ok"],
        ["um admin também aprova", admin, Review, Done, "ok"],
        ["o responsável não aprova a sua", ana, Review, Done, 403],
        ["de todo não se salta para done, nem a gestora", gestora, Todo, Done, 400],
        ["de in_progress também não", gestora, InProgress, Done, 400],
        ["nem o responsável, que leva o 400 antes do 403", ana, InProgress, Done, 400],
        ["a gestora reabre uma concluída", gestora, Done, InProgress, "ok"],
        ["o responsável não reabre", ana, Done, Todo, 403],
        ["só quem gere muda o lugar dentro de done", ana, Done, Done, 403],
        ["e quem gere, muda", admin, Done, Done, "ok"],
    ])("%s", (_nome, actor, de, para, esperado) => {
        expect(resultado(actor, de, para)).toBe(esperado);
    });

    it("uma sem responsável não chega a done pela mão de qualquer um", () => {
        expect(resultado(rui, Review, Done, null)).toBe(403);
    });

    it("as mensagens dizem o porquê", () => {
        expect(() => checkTaskMove(rui, projeto, { status: Todo, assigneeId: ana.id }, InProgress))
            .toThrow("Só o responsável pela tarefa, o gestor ou um admin a move");
        expect(() => checkTaskMove(ana, projeto, { status: Review, assigneeId: ana.id }, Done))
            .toThrow("Só o gestor do projeto ou um admin aprova tarefas");

        let erro: unknown;
        try {
            checkTaskMove(gestora, projeto, { status: Todo, assigneeId: ana.id }, Done);
        } catch (error) {
            erro = error;
        }
        expect((erro as HttpError).details).toEqual([
            { field: "status", message: "Uma tarefa só passa a concluída depois da revisão" },
        ]);
    });
});
