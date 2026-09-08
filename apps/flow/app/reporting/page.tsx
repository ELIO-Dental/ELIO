import { redirect } from "next/navigation";

/** Reporting lived on the classic home charts — use Dashboard. */
export default function ReportingRedirectPage() {
  redirect("/dashboard");
}
