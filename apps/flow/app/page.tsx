import { redirect } from "next/navigation";

// Root of this module's zone — redirect to the real pipeline board.
export default function FlowRootPage() {
  redirect("/flow/pipeline");
}
