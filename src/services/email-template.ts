import { LOGO_EMAIL_PNG_BASE64 } from "./email-logo.js";

/** O Content-ID com que o logótipo vai anexado; o HTML refere-o com cid:. */
export const LOGO_CID = "logo@erp-os-silvas";

/** Anexo inline do logótipo, pronto para o sendMail do nodemailer. */
export const logoAttachment = () => ({
    filename: "logo.png",
    content: Buffer.from(LOGO_EMAIL_PNG_BASE64, "base64"),
    contentType: "image/png",
    cid: LOGO_CID,
});

export interface EmailContent {
    /** Nome da empresa que envia: aparece no cabeçalho e no rodapé. */
    companyName: string;
    /** Texto que os clientes de email mostram na lista, ao lado do assunto. */
    preheader: string;
    title: string;
    /** Parágrafos antes do botão. */
    paragraphs: string[];
    button: { label: string; url: string };
    /** Uma linha de destaque por baixo do botão (ex.: validade do link). */
    note?: string;
    /** Porque é que a pessoa recebeu isto / o que fazer se não foi ela. */
    footnote: string;
}

const COR = {
    fundo: "#f1f5f9",
    cabecalho: "#070b14",
    cartao: "#ffffff",
    texto: "#0f172a",
    suave: "#475569",
    muito: "#94a3b8",
    linha: "#e2e8f0",
    botao: "#059669",
    destaque: "#ecfdf5",
    destaqueTexto: "#065f46",
};

const FONTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Tudo o que vem de dados (nome da empresa, URLs) passa por aqui antes de entrar no HTML. */
export const escapeHtml = (texto: string): string =>
    texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

/**
 * O email em HTML e em texto simples (para os clientes que não mostram HTML, e para a consola
 * quando o SMTP não está configurado). O HTML é feito com tabelas e estilos inline: é o que
 * funciona no Outlook e no Gmail, que ignoram <style>, flexbox e grid.
 */
export function renderEmail(content: EmailContent): { html: string; text: string } {
    const empresa = escapeHtml(content.companyName);
    const url = escapeHtml(content.button.url);
    const ano = new Date().getFullYear();

    const paragrafos = content.paragraphs
        .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${COR.suave};">${escapeHtml(p)}</p>`)
        .join("");

    const nota = content.note
        ? `<tr><td style="padding:0 40px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="background:${COR.destaque};border-radius:8px;padding:12px 16px;font-size:13px;line-height:20px;color:${COR.destaqueTexto};">${escapeHtml(content.note)}</td></tr>
            </table>
          </td></tr>`
        : "";

    const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(content.title)}</title>
</head>
<body style="margin:0;padding:0;background:${COR.fundo};font-family:${FONTE};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COR.fundo};">${escapeHtml(content.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COR.fundo};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

      <tr><td style="background:${COR.cabecalho};border-radius:12px 12px 0 0;padding:24px 40px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="vertical-align:middle;padding-right:14px;"><img src="cid:${LOGO_CID}" width="44" height="44" alt="Grupo Os Silvas" style="display:block;border:0;border-radius:22px;"></td>
          <td style="vertical-align:middle;">
            <div style="font-size:16px;font-weight:700;color:#ffffff;">ERP Os Silvas</div>
            <div style="font-size:12px;color:${COR.muito};padding-top:2px;">${empresa}</div>
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="background:${COR.botao};height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>

      <tr><td style="background:${COR.cartao};padding:40px 40px 8px;">
        <h1 style="margin:0 0 20px;font-size:24px;line-height:32px;font-weight:700;color:${COR.texto};">${escapeHtml(content.title)}</h1>
        ${paragrafos}
      </td></tr>

      <tr><td align="left" style="background:${COR.cartao};padding:8px 40px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" bgcolor="${COR.botao}" style="border-radius:8px;">
            <a href="${url}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(content.button.label)}</a>
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="background:${COR.cartao};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${nota}</table>
      </td></tr>

      <tr><td style="background:${COR.cartao};padding:16px 40px 36px;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 6px;font-size:12px;line-height:18px;color:${COR.muito};">Se o botão não funcionar, copie este endereço para o browser:</p>
        <p style="margin:0;font-size:12px;line-height:18px;word-break:break-all;"><a href="${url}" target="_blank" style="color:${COR.botao};text-decoration:underline;">${url}</a></p>
      </td></tr>

      <tr><td style="padding:24px 40px 0;text-align:center;">
        <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:${COR.muito};">${escapeHtml(content.footnote)}</p>
        <p style="margin:0;font-size:12px;line-height:18px;color:${COR.muito};">© ${ano} Grupo Os Silvas · ERP da empresa ${empresa}</p>
        <p style="margin:8px 0 0;font-size:11px;line-height:16px;color:${COR.muito};">Este é um email automático enviado pelo ERP Os Silvas.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

    const text = [
        `ERP Os Silvas · ${content.companyName}`,
        "",
        content.title,
        "",
        ...content.paragraphs.flatMap((p) => [p, ""]),
        `${content.button.label}:`,
        content.button.url,
        "",
        ...(content.note ? [content.note, ""] : []),
        content.footnote,
        "",
        `© ${ano} Grupo Os Silvas`,
    ].join("\n");

    return { html, text };
}
