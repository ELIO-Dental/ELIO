import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Users/Team live on ELIO Portal. Absolute URL required — relative
 * redirect("/settings/team") would become /plans/settings/team under basePath.
 */
export default async function UsersPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  redirect(`${proto}://${host}/settings/team`);
}
