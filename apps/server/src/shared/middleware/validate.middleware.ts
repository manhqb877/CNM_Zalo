import { type Request, type Response, type NextFunction } from 'express';
import { type ZodTypeAny, ZodError } from 'zod';
import { BadRequestError } from '../errors';

export function validateBody<TSchema extends ZodTypeAny>(schema: TSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error instanceof ZodError
        ? result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
        : 'Validation failed';
      return next(new BadRequestError(message));
    }
    req.body = result.data;
    next();
  };
}
