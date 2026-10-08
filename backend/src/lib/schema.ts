import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';

export function jsonSchema<T extends ZodTypeAny>(schema: T) {
  return zodToJsonSchema(schema, { $refStrategy: 'none' }) as Record<
    string,
    unknown
  >;
}
