/**
 * Dinheiro em cêntimos. As contas fazem-se aqui, e só se arredonda ao formatar:
 * um rateio por dias dá frações de cêntimo, e arredondar cada parcela somava erro.
 */

/** "2150.5" ou "2150.50" passa a 215050. Os NUMERIC chegam do Postgres sempre como string. */
export function toCents(amount: string): number {
    const [inteiro = "0", decimais = ""] = amount.split(".");
    return Number(inteiro) * 100 + Number(decimais.padEnd(2, "0").slice(0, 2));
}

/** O contrário: 215050 passa a "2150.50", como a API devolve todos os montantes. */
export function formatCents(cents: number): string {
    const rounded = Math.round(cents);
    const sign = rounded < 0 ? "-" : "";
    const abs = Math.abs(rounded);

    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export const sumCents = (values: Iterable<number>): number => {
    let total = 0;
    for (const value of values) {
        total += value;
    }
    return total;
};
