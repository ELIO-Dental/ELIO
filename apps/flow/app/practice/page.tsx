import { redirect } from "next/navigation";

/** Practice/clinic admin lives on ELIO Portal for multi-practice tenancy. */
export default function PracticeRedirectPage() {
  redirect("/dashboard");
}
