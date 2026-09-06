import type { Metadata } from "next";
import { CreateProjectClient } from "./create-project-client";

export const metadata: Metadata = {
  title: "Create Project",
};

export default function CreateProjectPage() {
  return <CreateProjectClient />;
}
