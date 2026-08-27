import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Start building",
  robots: { index: false, follow: false },
};

/** The editor arrives in a later phase; route the CTA into the auth funnel. */
export default function StartPage() {
  redirect("/register");
}
