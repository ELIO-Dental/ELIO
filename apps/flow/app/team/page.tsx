import { redirect } from "next/navigation";

/** Team/users live on ELIO Portal (one shell login). */
export default function TeamRedirectPage() {
  redirect("/dashboard");
}
