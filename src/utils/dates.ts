const lisboa = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" });

/** YYYY-MM-DD no fuso de Lisboa, não em UTC: entre as 00:00 e a 01:00 de verão o dia é outro. */
export const isoDate = (date: Date = new Date()): string => lisboa.format(date);

/** O dia de hoje em Lisboa, n meses atrás. Um 31 que não existe nesse mês passa para o dia 1 seguinte. */
export const monthsAgo = (months: number, from: string = isoDate()): string => {
    const [year, month, day] = from.split("-").map(Number) as [number, number, number];
    return new Date(Date.UTC(year, month - 1 - months, day)).toISOString().slice(0, 10);
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toUtc = (date: string): number => {
    const [year, month, day] = date.split("-").map(Number) as [number, number, number];
    return Date.UTC(year, month - 1, day);
};

/** Um YYYY-MM-DD n dias depois (ou antes, com n negativo). Em UTC, por isso a mudança de hora não conta. */
export const addDays = (date: string, days: number): string =>
    new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);

/** Quantos dias vão de um YYYY-MM-DD ao outro: 0 no mesmo dia. */
export const daysBetween = (from: string, to: string): number => Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

/** 0 é domingo e 6 é sábado, como no getUTCDay. */
export const weekday = (date: string): number => new Date(toUtc(date)).getUTCDay();
