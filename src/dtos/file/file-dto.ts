import { z } from "zod";
import { FileKind } from "../../types/enums.js";

//Como um ficheiro é devolvido, dentro do recurso a que pertence
export const fileResponseSchema = z.object({
    id: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    kind: z.enum(FileKind).meta({ example: FileKind.ExpenseReceipt }),
    name: z.string().meta({ example: "fatura_jetbrains.pdf", description: "O nome com que foi enviado." }),
    mimeType: z.string().meta({ example: "application/pdf" }),
    size: z.int().meta({ example: 48213, description: "Em bytes, como ficou guardado." }),
    url: z.url().meta({
        example: "https://erp.exemplo.pt/api/files/0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42?exp=1793664000&sig=k3Jd…",
        description:
            "Abre o ficheiro sem token: serve num `<img src>` ou num `<a href>`. Expira (entre 1 e 2 horas, " +
            "por omissão), por isso pede-se outra vez o recurso em vez de o guardar. Com `&download=1` descarrega.",
    }),
    uploadedBy: z.uuid().meta({ description: "Quem o enviou." }),
    createdAt: z.iso.datetime(),
    duplicateOwnerIds: z.array(z.uuid()).meta({
        description:
            "Os outros donos da mesma empresa com este mesmo ficheiro: num recibo, as outras despesas onde ele " +
            "já está. É um aviso, não um erro. Vazio nos tipos que não o verificam.",
    }),
}).meta({ id: "File", description: "Um ficheiro enviado" });

export const fileListResponseSchema = z.array(fileResponseSchema);

export type FileResponse = z.infer<typeof fileResponseSchema>;
