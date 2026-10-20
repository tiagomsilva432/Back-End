const lisboa = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" });

/** YYYY-MM-DD no fuso de Lisboa, não em UTC: entre as 00:00 e a 01:00 de verão o dia é outro. */
export const isoDate = (date: Date = new Date()): string => lisboa.format(date);
