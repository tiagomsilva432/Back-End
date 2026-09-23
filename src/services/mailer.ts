import nodemailer, { type Transporter } from "nodemailer";
import {
    mailAllowCompanyFrom,
    mailFrom,
    smtpHost,
    smtpPassword,
    smtpPort,
    smtpUser,
} from "../env-vars.js";
import type { Company } from "../entities/Company.js";

let transporter: Transporter | null = null;

/**
 * Sem SMTP_HOST não há transporte: a mensagem vai para a consola. É o que
 * sustenta os testes e o desenvolvimento sem credenciais.
 */
function getTransporter(): Transporter | null {
    const host = smtpHost();
    if (!host) {
        return null;
    }
    if (!transporter) {
        const user = smtpUser();
        const pass = smtpPassword();
        const port = smtpPort();
        transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: user && pass ? { user, pass } : undefined,
        });
    }
    return transporter;
}

type Sender = Pick<Company, "name" | "email">;

/**
 * O From tem de ser um endereço autorizado pelo servidor de SMTP; o da empresa
 * só entra lá quando MAIL_ALLOW_COMPANY_FROM o garante. Fora disso a empresa
 * continua visível no nome e no Reply-To.
 */
export function buildEnvelope(company: Sender) {
    const companyAddress = company.email ?? undefined;
    const address = mailAllowCompanyFrom() && companyAddress ? companyAddress : mailFrom();

    return {
        from: { name: company.name, address },
        replyTo: companyAddress,
    };
}

async function send(company: Sender, to: string, subject: string, text: string): Promise<void> {
    const { from, replyTo } = buildEnvelope(company);
    const transport = getTransporter();

    if (!transport) {
        console.log(`[mailer] SMTP por configurar. Email para ${to} não enviado:\n${text}`);
        return;
    }

    await transport.sendMail({ from, replyTo, to, subject, text });
    console.log(`[mailer] Email "${subject}" enviado para ${to}`);
}

async function sendActivationEmail(company: Sender, to: string, activationUrl: string): Promise<void> {
    await send(
        company,
        to,
        `ERP "Os Silvas" - Ativação de conta na empresa ${company.name}`,
        [
            `Foi criada uma conta para ti no sistema da empresa ${company.name}.`,
            "",
            "Define a tua password aqui:",
            activationUrl,
            "",
            "Se não estavas à espera deste email, ignora-o.",
        ].join("\n"),
    );
}

/** Objeto e não exports soltos: é o que permite o jest.spyOn nos testes. */
export const mailer = {
    sendActivationEmail,
};
