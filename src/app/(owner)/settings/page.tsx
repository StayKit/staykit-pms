import { redirect } from "next/navigation";

/** Settings has no landing view of its own — send the user to the first section. */
export default function SettingsPage() {
  redirect("/settings/property");
}
