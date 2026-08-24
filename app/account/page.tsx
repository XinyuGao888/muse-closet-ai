import { chatGPTSignOutPath, requireChatGPTUser } from "../chatgpt-auth";
import { AccountClient } from "./account-client";
import Link from "next/link";
import { SupabaseAccount } from "../supabase-auth";
import { runtimeAuth } from "../runtime-auth";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const auth = await runtimeAuth();
  if (auth.provider === "supabase") {
    const config = auth.config;
    if (!config) return <main className="auth-loading auth-loading--error"><p>Supabase 登录服务尚未完成配置。</p></main>;
    return <SupabaseAccount config={config} />;
  }
  await requireChatGPTUser("/account");
  return (
    <main className="account-page">
      <nav className="account-nav">
        <Link className="mobile-brand" href="/"><span className="brand-mark">M</span>Muse Closet</Link>
        <div><Link href="/">返回衣柜</Link><a href={chatGPTSignOutPath("/")}>退出登录</a></div>
      </nav>
      <header className="account-header"><p className="eyebrow">CONTROL YOUR DATA</p><h1>账户与隐私</h1><p>查看用量、控制AI图片处理，并随时删除你的全部数据。</p></header>
      <AccountClient signOutPath={chatGPTSignOutPath("/")} />
    </main>
  );
}
