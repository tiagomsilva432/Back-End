import { z } from "zod";

//Schema REQUEST createCompany
export const createCompanySchema = z.object({
    name: z.string().trim().min(1).max(150).meta({ example: "Os Silvas, Lda." }),
    taxId: z.string().trim().min(1).max(50).optional().meta({ example: "500123456" }),
    email: z.string().trim().toLowerCase().pipe(z.email().max(255)).optional()
        .meta({ example: "geral@ossilvas.pt" }),
    country: z.string().trim().toUpperCase().pipe(z.string().length(2)).default("PT")
        .meta({ example: "PT" }),
}).meta({ id: "CreateCompanyRequest", description: "Dados para criar uma empresa" });

//Como uma empresa é devolvida, na criação e na leitura
export const companyResponseSchema = z.object({
    id: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    name: z.string().meta({ example: "Os Silvas, Lda." }),
    taxId: z.string().nullable().meta({ example: "500123456" }),
    email: z.string().nullable().meta({ example: "geral@ossilvas.pt" }),
    country: z.string().meta({ example: "PT" }),
}).meta({ id: "Company", description: "Uma empresa" });

export const companyListResponseSchema = z.array(companyResponseSchema)
    .meta({ id: "CompanyList", description: "Empresas, por nome" });

export type CreateCompanyRequest = z.infer<typeof createCompanySchema>;
export type CompanyResponse = z.infer<typeof companyResponseSchema>;
