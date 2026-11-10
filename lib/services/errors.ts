import type { ZodError } from "zod";

export class ServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function validationError(err: ZodError): ServiceError {
  return new ServiceError(
    400,
    "invalid_input",
    "Input tidak valid.",
    err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  );
}
