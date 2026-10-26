import { z } from "zod";
import { isoDate } from "../../utils/dates.js";

/** Peças repetidas entre DTOs. Cada uma gera exatamente o mesmo OpenAPI que as cópias que substituiu. */

/** O companyId de quem pode escolher a empresa: só o system_admin. */
export const companyIdSchema = z.uuid().meta({
    example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
    description:
        "Só o system_admin o indica. Um company_admin usa sempre a sua própria empresa; um valor diferente é recusado com 403.",
});

/** Um booleano na query string, onde só chegam strings: "true" liga, o resto não. */
export const flag = (description: string) =>
    z.enum(["true", "false"]).optional().transform((v) => v === "true")
        .meta({ example: "true", description });

const currentYear = () => Number(isoDate().slice(0, 4));

export const yearSchema = z.coerce.number().int().min(2000).max(2100).default(currentYear)
    .meta({ example: 2026, description: "Por omissão, o ano corrente." });

/**
 * Um NUMERIC em string: por um number do JavaScript perdiam-se cêntimos. Aceita
 * "12.5" ou 12.5, e devolve sempre com as casas todas: "12.50".
 */
export const decimalString = (integerDigits: number, decimals: number, message: string) =>
    z.union([z.string().trim(), z.number()])
        .transform((value) => String(value))
        .pipe(
            z.string()
                .regex(new RegExp(`^\\d{1,${integerDigits}}(\\.\\d${decimals > 1 ? `{1,${decimals}}` : ""})?$`), {
                    message,
                })
                .overwrite((value) => {
                    const [inteiro, decimais = ""] = value.split(".");
                    return `${inteiro}.${decimais.padEnd(decimals, "0")}`;
                }),
        );
