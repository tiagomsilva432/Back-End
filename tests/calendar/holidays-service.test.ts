import { describe, expect, it } from "@jest/globals";
import {
    countWorkingDays,
    easterSunday,
    holidaysBetween,
    isNationalHoliday,
    nationalHolidays,
} from "../../src/services/holidays.js";

describe("easterSunday", () => {
    it("acerta nos anos conhecidos", () => {
        expect(easterSunday(2024)).toBe("2024-03-31");
        expect(easterSunday(2025)).toBe("2025-04-20");
        expect(easterSunday(2026)).toBe("2026-04-05");
        expect(easterSunday(2027)).toBe("2027-03-28");
    });
});

describe("nationalHolidays", () => {
    it("Portugal tem treze, por ordem, com os móveis calculados a partir da Páscoa", () => {
        const feriados = nationalHolidays("PT", 2026);

        expect(feriados).toHaveLength(13);
        expect(feriados).toContainEqual({ date: "2026-04-03", name: "Sexta-feira Santa" });
        expect(feriados).toContainEqual({ date: "2026-04-05", name: "Páscoa" });
        expect(feriados).toContainEqual({ date: "2026-06-04", name: "Corpo de Deus" });
        expect(feriados).toContainEqual({ date: "2026-12-25", name: "Natal" });
        expect(feriados.map((f) => f.date)).toEqual([...feriados.map((f) => f.date)].sort());
    });

    it("ignora maiúsculas no país, e outro país não tem nenhum", () => {
        expect(nationalHolidays("pt", 2026)).toHaveLength(13);
        expect(nationalHolidays("ES", 2026)).toEqual([]);
    });

    it("isNationalHoliday olha para o ano da própria data", () => {
        expect(isNationalHoliday("PT", "2026-06-10")).toBe(true);
        expect(isNationalHoliday("PT", "2026-06-13")).toBe(false);
        expect(isNationalHoliday("ES", "2026-12-25")).toBe(false);
    });
});

describe("holidaysBetween", () => {
    it("junta os nacionais de cada ano e os da empresa, só dentro do intervalo", () => {
        const empresa = [
            { id: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42", date: "2026-12-24", name: "Véspera de Natal" },
            { id: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a43", date: "2027-02-09", name: "Carnaval" },
        ];

        expect(holidaysBetween("PT", empresa, "2026-12-20", "2027-01-10")).toEqual([
            { date: "2026-12-24", name: "Véspera de Natal", kind: "company", id: empresa[0]!.id },
            { date: "2026-12-25", name: "Natal", kind: "national", id: null },
            { date: "2027-01-01", name: "Ano Novo", kind: "national", id: null },
        ]);
    });
});

describe("countWorkingDays", () => {
    it("tira os fins de semana e os feriados, com as duas pontas incluídas", () => {
        // De segunda 21 a quinta 31: nove dias de semana, menos o Natal.
        expect(countWorkingDays("2026-12-21", "2026-12-31", new Set(["2026-12-25"]))).toBe(8);
        expect(countWorkingDays("2026-12-21", "2026-12-21", new Set())).toBe(1);
        expect(countWorkingDays("2026-12-26", "2026-12-27", new Set())).toBe(0);
    });
});
