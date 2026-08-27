import { redirect } from "next/navigation";

// Root of this module's zone — redirect to the real pipeline board. Must be
// a RELATIVE path without the "/flow" basePath prefix — Next.js auto-adds it
// for a Server Component redirect, so "/flow/pipeline" here would become
// "/flow/flow/pipeline" and 404 (confirmed live).
export default function FlowRootPage() {
  redirect("/pipeline");
}
