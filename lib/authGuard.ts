import { auth } from "@/auth";

export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id || null;
}

export async function requireUserId(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) throw new Error("UNAUTHENTICATED");
  return userId;
}
