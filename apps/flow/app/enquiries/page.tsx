import { redirect } from "next/navigation";

/** Classic ElioFlow had no Enquiries tab — capture stays via APIs/consult flow. */
export default function EnquiriesRedirectPage() {
  redirect("/dashboard");
}
