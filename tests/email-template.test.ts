import { describe, expect, it } from "@jest/globals";
import { escapeHtml, LOGO_CID, logoAttachment, renderEmail } from "../src/services/email-template.js";

const conteudo = {
    companyName: "Silva & <Filhos>",
    preheader: "Ative a sua conta.",
    title: "Boas-vindas ao ERP da Silva & <Filhos>",
    paragraphs: ["Foi criada uma conta para si.", "Defina a sua password."],
    button: { label: "Ativar a minha conta", url: "http://localhost:5173/ativar-conta?token=abc&x=1" },
    note: "O link é válido durante 7 dias.",
    footnote: "Se não estava à espera, ignore este email.",
};

describe("renderEmail", () => {
    it("escapa o que vem dos dados antes de o pôr no HTML", () => {
        const { html } = renderEmail(conteudo);

        expect(html).toContain("Silva &amp; &lt;Filhos&gt;");
        expect(html).not.toContain("<Filhos>");
        expect(html).toContain('href="http://localhost:5173/ativar-conta?token=abc&amp;x=1"');
    });

    it("mostra o logótipo pelo Content-ID do anexo inline", () => {
        const { html } = renderEmail(conteudo);
        const anexo = logoAttachment();

        expect(html).toContain(`src="cid:${LOGO_CID}"`);
        expect(anexo.cid).toBe(LOGO_CID);
        expect(anexo.contentType).toBe("image/png");
        // Um PNG começa sempre pelos mesmos 8 bytes.
        expect(anexo.content.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    });

    it("tem o botão, o link de recurso, a nota e o preheader", () => {
        const { html } = renderEmail(conteudo);

        expect(html).toContain(">Ativar a minha conta</a>");
        expect(html.match(/ativar-conta\?token=abc&amp;x=1/g)).toHaveLength(3);
        expect(html).toContain("O link é válido durante 7 dias.");
        expect(html).toContain("Ative a sua conta.");
    });

    it("gera a versão em texto, sem HTML, com o link inteiro", () => {
        const { text } = renderEmail(conteudo);

        expect(text).not.toMatch(/<\/?(p|a|div|table|td|tr|h1|br|img)\b/i);
        expect(text).toContain("Silva & <Filhos>");
        expect(text).toContain("http://localhost:5173/ativar-conta?token=abc&x=1");
        expect(text).toContain("O link é válido durante 7 dias.");
    });

    it("sem nota, não deixa a caixa de destaque vazia", () => {
        const { note: _nota, ...semNota } = conteudo;
        const { html, text } = renderEmail(semNota);

        expect(html).not.toContain("#ecfdf5");
        expect(text).not.toContain("undefined");
    });
});

describe("escapeHtml", () => {
    it("escapa os cinco caracteres especiais", () => {
        expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    });
});
