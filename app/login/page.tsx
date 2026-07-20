import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/app/login/LoginForm";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");
  return (
    <LoginForm
      providers={{
        phone: Boolean(
          process.env.TENCENTCLOUD_SECRET_ID &&
            process.env.TENCENTCLOUD_SECRET_KEY &&
            process.env.TENCENT_SMS_SDK_APP_ID &&
            process.env.TENCENT_SMS_SIGN_NAME &&
            process.env.TENCENT_SMS_TEMPLATE_ID
        ),
        github: Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET),
        wechat: Boolean(process.env.AUTH_WECHAT_ID && process.env.AUTH_WECHAT_SECRET),
        qq: Boolean(process.env.AUTH_QQ_ID && process.env.AUTH_QQ_SECRET),
      }}
    />
  );
}
