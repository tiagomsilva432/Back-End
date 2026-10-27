import nodemailer, { type Transporter } from "nodemailer";
import {
    mailAllowCompanyFrom,
    mailFrom,
    passwordResetExpDate,
    signupTokenExpDate,
    smtpHost,
    smtpPassword,
    smtpPort,
    smtpUser,
} from "../env-vars.js";
import type { Company } from "../entities/Company.js";
import { logoAttachment, renderEmail, type EmailContent } from "./email-template.js";

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

/** Cada email vai em HTML (com o logótipo embutido) e em texto simples, para quem não mostra HTML. */
async function send(company: Sender, to: string, subject: string, content: Omit<EmailContent, "companyName">): Promise<void> {
    const { from, replyTo } = buildEnvelope(company);
    const transport = getTransporter();
    const { html, text } = renderEmail({ ...content, companyName: company.name });

    if (!transport) {
        console.log(`[mailer] SMTP por configurar. Email para ${to} não enviado:
${text}`);
        return;
    }

    await transport.sendMail({ from, replyTo, to, subject, text, html, attachments: [logoAttachment()] });
    console.log(`[mailer] Email "${subject}" enviado para ${to}`);
}

const dias = (ms: number): string => {
    const n = Math.round(ms / 86_400_000);
    return n === 1 ? "1 dia" : `${n} dias`;
};
const horas = (ms: number): string => {
    const n = Math.round(ms / 3_600_000);
    return n === 1 ? "1 hora" : `${n} horas`;
};

async function sendActivationEmail(company: Sender, to: string, activationUrl: string): Promise<void> {
    await send(company, to, `Ative a sua conta no ERP da ${company.name}`, {
        preheader: `Foi criada uma conta para si no ERP da ${company.name}. Defina a sua password para começar.`,
        title: `Boas-vindas ao ERP da ${company.name}`,
        paragraphs: [
            `Foi criada uma conta para si no ERP da ${company.name}, onde vai encontrar os seus projetos, ausências, avaliações e avisos da equipa.`,
            "Para começar, ative a conta e defina a sua password.",
        ],
        button: { label: "Ativar a minha conta", url: activationUrl },
        note: `Por segurança, este link é válido durante ${dias(signupTokenExpDate())} e só pode ser usado uma vez.`,
        footnote: `Recebeu este email porque foi criada uma conta com este endereço no ERP da ${company.name}. Se não estava à espera dele, pode ignorá-lo.`,
    });
}

async function sendPasswordResetEmail(company: Sender, to: string, resetUrl: string): Promise<void> {
    await send(company, to, `Redefinição da sua password · ERP Os Silvas (${company.name})`, {
        preheader: "Recebemos um pedido para redefinir a password da sua conta.",
        title: "Redefinir a sua password",
        paragraphs: [
            `Recebemos um pedido para redefinir a password da sua conta no ERP da ${company.name}.`,
            "Carregue no botão para escolher uma password nova.",
        ],
        button: { label: "Definir nova password", url: resetUrl },
        note: `Por segurança, este link é válido durante ${horas(passwordResetExpDate())} e só pode ser usado uma vez.`,
        footnote: "Se não foi você que fez este pedido, ignore este email: a sua password atual continua válida.",
    });
}

/** Objeto e não exports soltos: é o que permite o jest.spyOn nos testes. */
export const mailer = {
    sendActivationEmail,
    sendPasswordResetEmail,
};
