/** HTTP-ish errors for Pay API routes — kept free of Next.js imports for unit tests. */

export class UnauthorizedError extends Error {
  status = 401;
}

export class ForbiddenError extends Error {
  status = 403;
}

/** Licence check failed — maps to 403 via ForbiddenError catch sites. */
export class UnlicensedError extends ForbiddenError {}
