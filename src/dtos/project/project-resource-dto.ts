import { z } from "zod";
import { fileResponseSchema } from "../file/file-dto.js";

const titleSchema = z.string().trim().min(1).max(150).meta({ example: "Servidor de testes" });

// Só http e https: um javascript: num href corria no browser de quem clicasse.
const urlSchema = z.string().trim().max(2048)
    .pipe(z.url({ protocol: /^https?$/, error: "Link inválido: use um endereço que comece por http:// ou https://" }))
    .meta({ example: "https://teste.exemplo.pt", description: "Só `http` ou `https`." });

const noteSchema = z.string().trim().min(1).max(2000).meta({ example: "Login: pedir ao gestor do projeto" });

/**
 * Corpo do POST. O link, a nota e o ficheiro são todos opcionais: o ficheiro
 * vai depois, em PUT .../file, por isso um recurso só com título tem de passar.
 */
export const createProjectResourceSchema = z.object({
    title: titleSchema,
    url: urlSchema.optional(),
    note: noteSchema.optional(),
}).meta({ id: "CreateProjectResourceRequest", description: "Adicionar um recurso a um projeto" });

/** Corpo do PATCH. Junta: o que for omitido fica como está, e um null limpa o link ou a nota. */
export const patchProjectResourceSchema = z.object({
    title: titleSchema.optional(),
    url: urlSchema.nullable().optional(),
    note: noteSchema.nullable().optional(),
})
    .refine((patch) => Object.keys(patch).length > 0, { message: "Nada para alterar" })
    .meta({ id: "PatchProjectResourceRequest", description: "Alterar um recurso" });

//Como um recurso é devolvido
export const projectResourceResponseSchema = z.object({
    id: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    projectId: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    title: z.string().meta({ example: "Servidor de testes" }),
    url: z.string().nullable().meta({ example: "https://teste.exemplo.pt" }),
    note: z.string().nullable().meta({ example: "Login: pedir ao gestor do projeto" }),
    file: fileResponseSchema.nullable().meta({ description: "O ficheiro do recurso, ou null. Um só por recurso." }),
    createdBy: z.uuid().meta({ description: "Quem o adicionou. Um `employee` só altera os seus." }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
}).meta({ id: "ProjectResource", description: "Um link, uma nota ou um ficheiro útil de um projeto" });

export const projectResourceListResponseSchema = z.array(projectResourceResponseSchema)
    .meta({ id: "ProjectResourceList", description: "Os recursos de um projeto, do mais antigo para o mais recente" });

export type CreateProjectResourceRequest = z.infer<typeof createProjectResourceSchema>;
export type PatchProjectResourceRequest = z.infer<typeof patchProjectResourceSchema>;
export type ProjectResourceResponse = z.infer<typeof projectResourceResponseSchema>;
