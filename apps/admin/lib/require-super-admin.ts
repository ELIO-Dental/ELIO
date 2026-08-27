import { auth } from "@/lib/auth";

export class UnauthorizedError extends Error {
  status = 401;
}

/** Route-handler guard — layout.tsx only protects page renders, not API
 * routes under app/api, so every mutating route here re-checks explicitly. */
export async function requireSuperAdmin(): Promise<string> {
  const session = await auth();
  const role = (session as any)?.role as string | undefined;
  const userId = (session as any)?.userId as string | undefined;
  if (!session || role !== "SUPER_ADMIN" || !userId) {
    throw new UnauthorizedError("Not a Super Admin");
  }
  return userId;
}
