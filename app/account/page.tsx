import { chatGPTSignOutPath, requireChatGPTUser } from "../chatgpt-auth";
import { AccountClient } from "./account-client";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
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
