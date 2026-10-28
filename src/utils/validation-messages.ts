import { z } from "zod";

/**
 * As mensagens por omissão do Zod, em português de Portugal e sem termos
 * técnicos. Só se usam quando o esquema não traz uma mensagem própria.
 */
const FORMATS: Record<string, string> = {
    email: "E-mail inválido",
    uuid: "Identificador inválido",
    date: "Data inválida (use AAAA-MM-DD)",
    datetime: "Data e hora inválidas",
    url: "Link inválido",
    regex: "Formato inválido",
};

z.config({
    customError: (issue) => {
        switch (issue.code) {
            case "invalid_type":
                if (issue.input === undefined || issue.input === null) {
                    return "Campo obrigatório";
                }
                return issue.expected === "int" ? "Tem de ser um número inteiro" : "Valor inválido";
            case "too_small":
                if (issue.origin === "string") {
                    return Number(issue.minimum) <= 1
                        ? "Campo obrigatório"
                        : `Tem de ter pelo menos ${issue.minimum} caracteres`;
                }
                if (issue.origin === "array") return `Escolha pelo menos ${issue.minimum}`;
                return `Tem de ser pelo menos ${issue.minimum}`;
            case "too_big":
                if (issue.origin === "string") return `Pode ter no máximo ${issue.maximum} caracteres`;
                if (issue.origin === "array") return `No máximo ${issue.maximum}`;
                return `Pode ser no máximo ${issue.maximum}`;
            case "invalid_format":
                return FORMATS[issue.format] ?? "Formato inválido";
            case "invalid_value":
                return "Opção inválida";
            default:
                return "Valor inválido";
        }
    },
});
