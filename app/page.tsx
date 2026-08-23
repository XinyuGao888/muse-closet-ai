import { WardrobeApp } from "./wardrobe-app";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) {
    return (
      <main className="public-home">
        <nav className="public-nav">
          <div className="mobile-brand"><span className="brand-mark">M</span>Muse Closet</div>
          <a className="secondary-button" href={chatGPTSignInPath("/")}>登录</a>
        </nav>
        <section className="public-hero">
          <div>
            <p className="eyebrow">PRIVATE AI WARDROBE</p>
            <h1>衣柜属于你，<br />数据也只属于你。</h1>
            <p>拍照整理已有衣物，结合天气、场合和真实反馈生成更懂你的搭配。登录后，每个人拥有独立衣柜和私有图片空间。</p>
            <div className="public-actions">
              <a className="primary-button" href={chatGPTSignInPath("/")}>使用 ChatGPT 登录</a>
              <a className="text-link" href="#privacy">查看隐私边界</a>
            </div>
            <small>当前使用 ChatGPT 身份完成登录，不保存密码。</small>
          </div>
          <div className="public-visual" aria-label="Muse Closet 产品能力概览">
            <span className="public-orbit public-orbit--one">天气 × 场合</span>
            <span className="public-orbit public-orbit--two">私有云衣柜</span>
            <span className="public-orbit public-orbit--three">反馈学习</span>
            <div><strong>M</strong><small>越穿，越懂你</small></div>
          </div>
        </section>
        <section className="public-trust" id="privacy">
          <article><span>01</span><h2>个人数据隔离</h2><p>衣物、搭配、日记和偏好均按登录用户隔离，不能通过修改链接读取他人记录。</p></article>
          <article><span>02</span><h2>图片私有访问</h2><p>衣物和全身照片不提供公开地址，只通过已登录用户的鉴权接口读取。</p></article>
          <article><span>03</span><h2>可控的 AI 处理</h2><p>外部模型默认关闭；只有主动同意后，所选图片才会发送到已配置的 AI 服务。</p></article>
          <article><span>04</span><h2>一键删除数据</h2><p>账户页可删除全部数据库记录和图片对象，不保留可恢复副本。</p></article>
        </section>
      </main>
    );
  }
  return <WardrobeApp user={{ displayName: user.displayName, email: user.email, signOutPath: chatGPTSignOutPath("/") }} />;
}
