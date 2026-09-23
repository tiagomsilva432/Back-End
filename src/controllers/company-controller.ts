import type { Request, Response } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type { CreateCompanyRequest, CreateCompanyResponse } from "../dtos/company/company-dto.js";
import { Company } from "../entities/Company.js";
import { createCompany as saveCompany, getCompanyByTaxId } from "../repositories/company-repo.js";

export const createCompany = async (req: Request, res: Response) => {
    const { name, taxId, email, country } = req.body as CreateCompanyRequest;

    if (taxId) {
        const existing: Company | null = await getCompanyByTaxId(taxId);

        if (existing) {
            throw new HttpError(409, "Já existe uma empresa com este NIF");
        }
    }

    const created: Company = await saveCompany(
        new Company(name, taxId ?? null, email ?? null, country),
    );

    const data: CreateCompanyResponse = {
        id: created.id,
        name: created.name,
        taxId: created.taxId,
        email: created.email,
        country: created.country,
    };

    return new HttpResponse(201, "Empresa criada", undefined, data).send(res);
}
