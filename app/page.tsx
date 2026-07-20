import { redirect } from "next/navigation";
import { auth } from "@/auth";
import HomeClient from "@/components/HomeClient";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return (
    <HomeClient
      currentUser={{
        name: session.user.name || session.user.email || "用户",
        image: session.user.image,
      }}
    />
  );
}
