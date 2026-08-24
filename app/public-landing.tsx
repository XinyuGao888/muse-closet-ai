import type { ReactNode } from "react";

export function PublicLanding({
  navAction,
  primaryAction,
  loginNote,
}: {
  navAction: ReactNode;
  primaryAction: ReactNode;
  loginNote: ReactNode;
}) {
  return (
    <main className="public-home">
      <nav className="public-nav">
        <div className="mobile-brand"><span className="brand-mark">M</span>Muse Closet</div>
        {navAction}
      </nav>
      <section className="public-hero">
        <div>
          <p className="eyebrow">PRIVATE AI WARDROBE</p>
          <h1>衣柜属于你，<br />数据也只属于你。</h1>
          <p>拍照整理已有衣物，结合天气、场合和真实反馈生成更懂你的搭配。登录后，每个人拥有独立衣柜和私有图片空间。</p>
          <div className="public-actions">
            {primaryAction}
            <a className="text-link" href="#privacy">查看隐私边界</a>
          </div>
          <small>{loginNote}</small>
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
        <article><span>04</span><h2>一键删除数据</h2><p>账户页可删除全部数据库记录、图片对象和产品登录身份，不保留可恢复副本。</p></article>
      </section>
    </main>
  );
}
