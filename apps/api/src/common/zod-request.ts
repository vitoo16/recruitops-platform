import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export function parseRequest<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): z.output<TSchema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  throw new BadRequestException({
    code: 'INVALID_REQUEST',
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code,
      message: issue.message,
    })),
  });
}
