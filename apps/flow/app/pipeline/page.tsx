import { redirect } from "next/navigation";

/** Legacy ElioFlow had no kanban — home was the stats/table dashboard. */
export default function PipelineRedirectPage() {
  redirect("/dashboard");
}
