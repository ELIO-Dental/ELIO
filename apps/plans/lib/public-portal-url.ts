/**
 * Public portal origin for patient-facing links (invite, T&C, signup).
 * One-shell rule: links must open on the shell host (`app.elioportal.co.uk`)
 * so `/plans/...` is rewritten into the Plans zone — not the raw Plans Vercel host.
 */
export function getPublicPortalOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_PORTAL_URL?.trim() ||
    process.env.PORTAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return raw.replace(/\/$/, "");
}

/** Absolute patient URL under the shell (`/plans/signup/...` → full portal URL). */
export function absolutePortalUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
  const origin = getPublicPortalOrigin();
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return origin ? `${origin}${path}` : path;
}
