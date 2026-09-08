import { headers } from "next/headers";
import { redirect } from "next/navigation";

/** Team/users live on ELIO Portal — absolute URL bypasses /flow basePath. */
export default async function TeamRedirectPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  redirect(`${proto}://${host}/settings/team`);
}
