import type { CompanyHoliday } from "../entities/CompanyHoliday.js";
import { addDays, weekday } from "../utils/dates.js";

/**
 * Feriados e dias úteis. Tudo aqui é puro, sem base de dados: os feriados
 * nacionais calculam-se, e os da empresa chegam já lidos.
 */

export const HolidayKind = {
    National: "national",
    Company: "company",
} as const;
export type HolidayKind = (typeof HolidayKind)[keyof typeof HolidayKind];

export interface Holiday {
    date: string;
    name: string;
    kind: HolidayKind;
    /** Só os da empresa têm id: é com ele que se apagam. */
    id: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** O domingo de Páscoa (calendário gregoriano), pelo algoritmo de Meeus/Jones/Butcher. */
export function easterSunday(year: number): string {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;

    return `${year}-${pad(month)}-${pad(day)}`;
}

// Código do Trabalho, art. 234.º: os treze feriados obrigatórios. O Carnaval e
// o feriado municipal não estão aqui: cada empresa junta-os como seus.
const PT_FIXED: ReadonlyArray<[monthDay: string, name: string]> = [
    ["01-01", "Ano Novo"],
    ["04-25", "Dia da Liberdade"],
    ["05-01", "Dia do Trabalhador"],
    ["06-10", "Dia de Portugal"],
    ["08-15", "Assunção de Nossa Senhora"],
    ["10-05", "Implantação da República"],
    ["11-01", "Dia de Todos os Santos"],
    ["12-01", "Restauração da Independência"],
    ["12-08", "Imaculada Conceição"],
    ["12-25", "Natal"],
];

/** Os que mudam todos os anos, em dias a contar do domingo de Páscoa. */
const PT_EASTER: ReadonlyArray<[offset: number, name: string]> = [
    [-2, "Sexta-feira Santa"],
    [0, "Páscoa"],
    [60, "Corpo de Deus"],
];

/**
 * Os feriados nacionais de um país num ano, por ordem. Só Portugal é conhecido:
 * para outro país a lista vem vazia, e a empresa junta os seus à mão.
 */
export function nationalHolidays(country: string, year: number): Array<Pick<Holiday, "date" | "name">> {
    if (country.toUpperCase() !== "PT") {
        return [];
    }

    const easter = easterSunday(year);

    return [
        ...PT_FIXED.map(([monthDay, name]) => ({ date: `${year}-${monthDay}`, name })),
        ...PT_EASTER.map(([offset, name]) => ({ date: addDays(easter, offset), name })),
    ].sort((x, y) => x.date.localeCompare(y.date));
}

export const isNationalHoliday = (country: string, date: string): boolean =>
    nationalHolidays(country, Number(date.slice(0, 4))).some((holiday) => holiday.date === date);

/**
 * Todos os feriados de uma empresa entre duas datas (inclusivas): os nacionais
 * de cada ano do intervalo e os da empresa, por ordem de data.
 */
export function holidaysBetween(
    country: string,
    companyHolidays: ReadonlyArray<Pick<CompanyHoliday, "id" | "date" | "name">>,
    from: string,
    to: string,
): Holiday[] {
    const national: Holiday[] = [];

    for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
        for (const { date, name } of nationalHolidays(country, year)) {
            if (date >= from && date <= to) {
                national.push({ date, name, kind: HolidayKind.National, id: null });
            }
        }
    }

    const own: Holiday[] = companyHolidays
        .filter(({ date }) => date >= from && date <= to)
        .map(({ id, date, name }) => ({ date, name, kind: HolidayKind.Company, id }));

    return [...national, ...own].sort((x, y) => x.date.localeCompare(y.date));
}

/** Os dias de semana entre duas datas (inclusivas) que não são feriado. */
export function countWorkingDays(from: string, to: string, holidayDates: ReadonlySet<string>): number {
    let count = 0;

    for (let date = from; date <= to; date = addDays(date, 1)) {
        const day = weekday(date);

        if (day !== 0 && day !== 6 && !holidayDates.has(date)) {
            count++;
        }
    }

    return count;
}
