import { WardrobeApp } from "./wardrobe-app";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "./chatgpt-auth";
import { PublicLanding } from "./public-landing";
import { SupabaseHome } from "./supabase-auth";
import { runtimeAuth } from "./runtime-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const auth = await runtimeAuth();
  if (auth.provider === "supabase") {
    const config = auth.config;
    if (!config) {
      return (
        <main className="auth-loading auth-loading--error">
          <span className="brand-mark">M</span>
          <h1>登录服务尚未完成配置</h1>
          <p>站点管理员需要在 Cloudflare 中设置 Supabase 项目地址和发布密钥。</p>
        </main>
      );
    }
    return <SupabaseHome config={config} />;
  }
  const user = await getChatGPTUser();
  if (!user) {
    return (
      <PublicLanding
        navAction={<a className="secondary-button" href={chatGPTSignInPath("/")}>登录</a>}
        primaryAction={<a className="primary-button" href={chatGPTSignInPath("/")}>使用 ChatGPT 登录</a>}
        loginNote="当前使用 ChatGPT 身份完成登录，不保存密码。"
      />
    );
  }
  return <WardrobeApp user={{ displayName: user.displayName, email: user.email, signOutPath: chatGPTSignOutPath("/") }} />;
}
