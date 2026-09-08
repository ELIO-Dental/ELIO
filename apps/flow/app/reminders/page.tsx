import { redirect } from "next/navigation";

/** Classic ElioFlow had no Reminders tab — touchpoints lived on the home table. */
export default function RemindersRedirectPage() {
  redirect("/dashboard");
}
