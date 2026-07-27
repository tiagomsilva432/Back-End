import type { ValueTransformer } from "typeorm";

/**
 * The pg driver returns BIGINT as a string to avoid precision loss. Ids in this
 * schema are BIGSERIAL, so they stay well below Number.MAX_SAFE_INTEGER
 * (2^53) and are safe to surface as numbers.
 */
export const bigintTransformer: ValueTransformer = {
    to: (value: number | null | undefined) => value,
    from: (value: string | null): number | null =>
        value === null ? null : Number(value),
};
