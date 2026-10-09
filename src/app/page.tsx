import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";

export default async function Home() {
  const viewer = await requireViewer();
  if (viewer.support || viewer.profile.role === "funcionario") redirect("/inicio");
  redirect("/admin");
}
