const lisboa = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" });

/** YYYY-MM-DD no fuso de Lisboa, não em UTC: entre as 00:00 e a 01:00 de verão o dia é outro. */
export const isoDate = (date: Date = new Date()): string => lisboa.format(date);

/** O dia de hoje em Lisboa, n meses atrás. Um 31 que não existe nesse mês passa para o dia 1 seguinte. */
export const monthsAgo = (months: number, from: string = isoDate()): string => {
    const [year, month, day] = from.split("-").map(Number) as [number, number, number];
    return new Date(Date.UTC(year, month - 1 - months, day)).toISOString().slice(0, 10);
};
