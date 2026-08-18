import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/app/login/LoginForm";
import {
  phoneLoginEnabled,
  resolveGitHubCredentials,
} from "@/lib/authProviderConfig";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");
  return (
    <LoginForm
      providers={{
        phone: phoneLoginEnabled(),
        github: Boolean(resolveGitHubCredentials()),
        wechat: Boolean(
          process.env.AUTH_WECHAT_ID && process.env.AUTH_WECHAT_SECRET,
        ),
        qq: Boolean(process.env.AUTH_QQ_ID && process.env.AUTH_QQ_SECRET),
      }}
    />
  );
}
