"use client";

/* eslint-disable @next/next/no-img-element -- previews use local uploads and optional model render URLs. */

import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent } from "react";
import {
  type Inspiration,
  type PreferenceProfile,
} from "@/lib/phase-two-three";
import { categoryColors, categoryGlyphs, type Garment } from "@/lib/wardrobe";

function cx(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function InspirationLibrary({
  inspirations,
  onSave,
  onUse,
}: {
  inspirations: Inspiration[];
  onSave: (item: Inspiration) => void;
  onUse: (item: Inspiration) => void;
}) {
  const [occasion, setOccasion] = useState("全部");
  const [savedOnly, setSavedOnly] = useState(false);
  const filtered = inspirations.filter((item) =>
    (occasion === "全部" || item.occasion === occasion) && (!savedOnly || item.saved),
  );
  return (
    <div className="page inspiration-page">
      <section className="page-title-row">
        <div><p className="eyebrow">STYLE REFERENCES</p><h1>灵感穿搭库</h1><p>不照搬潮人的衣服，而是把搭配语言映射到你的真实衣柜。</p></div>
        <span className="beta-badge">CURATED · LEARNABLE</span>
      </section>
      <div className="inspiration-toolbar">
        <div className="filter-pills">
          {["全部", "通勤", "约会", "周末", "会议", "日常"].map((item) => (
            <button className={occasion === item ? "is-active" : ""} onClick={() => setOccasion(item)} key={item}>{item}</button>
          ))}
        </div>
        <button className={cx("favorite-filter", savedOnly && "is-active")} onClick={() => setSavedOnly((value) => !value)}>♡ 只看收藏</button>
      </div>
      <div className="inspiration-grid">
        {filtered.map((item) => (
          <article className="inspiration-card" key={item.id}>
            <div className="inspiration-visual">
              <div className="palette-bars">{item.palette.map((color) => <i style={{ background: color }} key={color} />)}</div>
              <div className="look-figures">
                {item.itemCategories.slice(0, 4).map((category, index) => (
                  <span style={{ "--look-color": item.palette[index % item.palette.length] } as CSSProperties} key={`${category}-${index}`}>{categoryGlyphs[category]}</span>
                ))}
              </div>
              <button className={cx("inspiration-save", item.saved && "is-active")} onClick={() => onSave(item)} aria-label={item.saved ? "取消收藏灵感" : "收藏灵感"}>{item.saved ? "♥" : "♡"}</button>
            </div>
            <div className="inspiration-copy">
              <p className="eyebrow">{item.occasion} · BY {item.creator}</p>
              <h2>{item.title}</h2>
              <p>{item.note}</p>
              <div className="tag-row">{item.styleTags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <div className="inspiration-actions"><small>已借鉴 {item.usedCount} 次</small><button className="primary-button" onClick={() => onUse(item)}>套用到我的衣柜 →</button></div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function WeightGroup({ title, items }: { title: string; items: Array<{ label: string; score: number }> }) {
  return (
    <section className="weight-group">
      <p className="eyebrow">{title}</p>
      {items.map((item) => (
        <div className="weight-row" key={item.label}><span>{item.label}</span><i><b style={{ width: `${item.score}%` }} /></i><strong>{item.score}</strong></div>
      ))}
    </section>
  );
}

export function PreferenceDashboard({
  profile,
  onUpdate,
}: {
  profile: PreferenceProfile | null;
  onUpdate: (fields: Partial<PreferenceProfile>) => Promise<void>;
}) {
  const [styles, setStyles] = useState(profile?.explicitStyles.join("、") ?? "");
  const [blocked, setBlocked] = useState(profile?.blockedColors.join("、") ?? "");
  const [fit, setFit] = useState(profile?.fitPreference ?? "标准");
  const [exploration, setExploration] = useState(profile?.exploration ?? 35);
  const [saving, setSaving] = useState(false);
  if (!profile) return <div className="loading-grid">正在归纳你的偏好信号…</div>;
  async function save() {
    setSaving(true);
    await onUpdate({
      explicitStyles: styles.split(/[、,，]/).map((item) => item.trim()).filter(Boolean),
      blockedColors: blocked.split(/[、,，]/).map((item) => item.trim()).filter(Boolean),
      fitPreference: fit,
      exploration,
    });
    setSaving(false);
  }
  return (
    <section className="preference-model">
      <header><div><p className="eyebrow">BEHAVIOUR + INTENT</p><h2>完整偏好模型</h2></div><span>{profile.totalSignals} 个有效信号</span></header>
      <div className="preference-weight-grid">
        <WeightGroup title="风格倾向" items={profile.styleWeights} />
        <WeightGroup title="颜色倾向" items={profile.colorWeights} />
        <WeightGroup title="场景倾向" items={profile.occasionWeights} />
      </div>
      <div className="preference-settings">
        <label><span>我主动偏好的风格</span><input value={styles} onChange={(event) => setStyles(event.target.value)} placeholder="简约、复古、松弛" /></label>
        <label><span>不想看到的颜色</span><input value={blocked} onChange={(event) => setBlocked(event.target.value)} placeholder="荧光绿、高饱和橙" /></label>
        <label><span>版型偏好</span><select value={fit} onChange={(event) => setFit(event.target.value)}><option>修身</option><option>标准</option><option>宽松</option><option>廓形</option></select></label>
        <label><span>风格探索度 · {exploration}%</span><input type="range" min="0" max="100" value={exploration} onChange={(event) => setExploration(Number(event.target.value))} /></label>
        <button className="primary-button" onClick={() => void save()} disabled={saving}>{saving ? "正在更新…" : "更新我的偏好"}</button>
      </div>
      <p className="model-footnote">模型把实际穿着、保存、喜欢、拒绝和你的主动设置分开计权；探索度越高，推荐越愿意尝试衣柜里的低频单品。</p>
    </section>
  );
}

type PhotoTryOnSession = {
  id: string;
  itemIds: string[];
  status: "processing" | "ready" | "failed";
  resultUrl: string | null;
  personUrl: string | null;
  provider: string;
  error: string | null;
  createdAt: string;
};

type PhotoTryOnCapabilities = {
  enabled: boolean;
  provider: string;
  maxItems: number;
  supportedCategories: string[];
};

export function PhotoTryOnStudio({ garments }: { garments: Garment[] }) {
  const [person, setPerson] = useState<File | null>(null);
  const [personPreview, setPersonPreview] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("全部");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PhotoTryOnSession | null>(null);
  const [history, setHistory] = useState<PhotoTryOnSession[]>([]);
  const [capabilities, setCapabilities] = useState<PhotoTryOnCapabilities>({
    enabled: false,
    provider: "FASHN Virtual Try-On v1.6",
    maxItems: 1,
    supportedCategories: ["上装", "下装", "连衣裙", "外套"],
  });

  useEffect(() => {
    fetch("/api/virtual-tryon")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.capabilities) setCapabilities(data.capabilities as PhotoTryOnCapabilities);
        if (data?.sessions) {
          const sessions = data.sessions as PhotoTryOnSession[];
          setHistory(sessions);
          setResult(sessions.find((session) => session.status === "ready") ?? null);
        }
      })
      .catch(() => undefined);
  }, []);

  const wearableGarments = useMemo(() => garments.filter((item) =>
    capabilities.supportedCategories.includes(item.category)), [capabilities.supportedCategories, garments]);
  const visibleGarments = useMemo(() => filter === "全部"
    ? wearableGarments
    : wearableGarments.filter((item) => item.category === filter), [filter, wearableGarments]);
  const selected = wearableGarments.find((item) => item.id === selectedId) ?? null;

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (personPreview) URL.revokeObjectURL(personPreview);
    setPerson(file);
    setPersonPreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
  }

  async function generate() {
    if (!person || !selectedId) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("person", person);
      form.set("itemId", selectedId);
      const response = await fetch("/api/virtual-tryon", { method: "POST", body: form });
      const data = await response.json() as { session?: PhotoTryOnSession; error?: string; code?: string };
      if (!response.ok || !data.session) throw new Error(data.error || "真人试穿生成失败");
      setResult(data.session);
      setHistory((current) => [data.session!, ...current.filter((item) => item.id !== data.session!.id)].slice(0, 8));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "真人试穿生成失败");
    } finally {
      setLoading(false);
    }
  }

  const currentPersonUrl = result?.personUrl ?? personPreview;
  const resultGarment = result?.itemIds[0]
    ? garments.find((item) => item.id === result.itemIds[0])
    : selected;

  return (
    <section className="photo-tryon-studio">
      <section className={cx("photo-tryon-status", capabilities.enabled && "is-live")}>
        <div><span>{capabilities.enabled ? "AI TRY-ON READY" : "MODEL NOT CONNECTED"}</span><h2>{capabilities.enabled ? "真人试穿模型已连接" : "界面已就绪，等待配置真人试穿额度"}</h2><p>{capabilities.enabled ? "上传的真人照和所选衣物会通过私有服务端链路发送给试穿模型，结果保存到你的个人空间。" : "当前不会用木偶或合成占位图冒充生成结果；配置模型密钥后即可直接使用。"}</p></div>
        <div className="photo-tryon-status__facts"><span><b>单件</b><small>当前支持</small></span><span><b>约 15–30 秒</b><small>预计生成</small></span><span><b>可删除</b><small>私有图片</small></span></div>
      </section>

      <div className="photo-tryon-flow">
        <section className="photo-tryon-step">
          <header><span>01</span><div><p className="eyebrow">YOUR PHOTO</p><h2>上传真人全身照</h2><p>正面站立、全身入镜、四肢无遮挡，越接近日常穿衣姿势越好。</p></div></header>
          <label className={cx("photo-tryon-upload", personPreview && "has-photo")}>
            {personPreview ? <img src={personPreview} alt="待试穿的真人全身照" /> : <><i>＋</i><strong>选择一张全身照</strong><small>支持 JPG、PNG、WebP · 单张不超过 8MB</small></>}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} />
          </label>
          <div className="photo-tryon-guide"><span>人物占画面 60%–90%</span><span>避免宽大外套遮挡轮廓</span><span>使用本人或已获授权照片</span></div>
        </section>

        <section className="photo-tryon-step photo-tryon-closet">
          <header><span>02</span><div><p className="eyebrow">PICK ONE PIECE</p><h2>从云衣柜选择</h2><p>当前先保证单件试穿质量，多件叠穿会在模型评测稳定后开放。</p></div></header>
          <div className="photo-tryon-filters">{["全部", "上装", "下装", "连衣裙", "外套"].map((item) => <button className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>
          <div className="photo-tryon-garments">{visibleGarments.map((item) => <button className={selectedId === item.id ? "is-active" : ""} disabled={!item.imageUrl} onClick={() => { setSelectedId(item.id); setResult(null); setError(null); }} key={item.id}>{item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <span style={{ background: categoryColors[item.category] }}>{categoryGlyphs[item.category]}</span>}<small><b>{item.category}</b>{item.name}</small>{!item.imageUrl && <em>缺少原图</em>}</button>)}</div>
          {!visibleGarments.length && <div className="photo-tryon-no-items">这个分类里还没有可试穿的衣物原图。</div>}
          <button className="primary-button full-width" disabled={!capabilities.enabled || !person || !selectedId || loading} onClick={() => void generate()}>{loading ? "正在生成真人试穿效果…" : capabilities.enabled ? "生成真人试穿效果图" : "真人试穿模型待配置"}</button>
          {loading && <div className="photo-tryon-loading"><i /><p><strong>正在保持面部、姿势和身体比例</strong><span>同时将衣物纹理与版型融合到真人照片中，请不要关闭页面。</span></p></div>}
          {error && <p className="body-error">{error}</p>}
        </section>
      </div>

      <section className="photo-tryon-result">
        <header><div><p className="eyebrow">BEFORE / AFTER</p><h2>真人试穿效果</h2><p>这是生成式视觉参考，不代表精确尺码、松量或真实布料物理效果。</p></div>{result?.status === "ready" && <span>由 {result.provider} 生成</span>}</header>
        <div className="photo-tryon-compare">
          <figure>{currentPersonUrl ? <img src={currentPersonUrl} alt="试穿前的真人照片" /> : <div><i>01</i><strong>先上传全身照</strong></div>}<figcaption>试穿前</figcaption></figure>
          <div className="photo-tryon-arrow">→</div>
          <figure className={result?.resultUrl ? "has-result" : ""}>{result?.resultUrl ? <img src={result.resultUrl} alt="AI生成的真人试穿效果" /> : <div><i>02</i><strong>{selected ? `准备试穿「${selected.name}」` : "再选择一件衣服"}</strong><small>生成前不会展示伪造的示意结果</small></div>}<figcaption>{resultGarment ? `试穿后 · ${resultGarment.name}` : "试穿后"}</figcaption></figure>
        </div>
      </section>

      {history.length > 0 && <section className="photo-tryon-history"><header><p className="eyebrow">TRY-ON HISTORY</p><h2>最近生成</h2></header><div>{history.filter((session) => session.status === "ready" && session.resultUrl).map((session) => {
        const garment = garments.find((item) => item.id === session.itemIds[0]);
        return <button className={result?.id === session.id ? "is-active" : ""} onClick={() => setResult(session)} key={session.id}><img src={session.resultUrl!} alt={garment ? `${garment.name}试穿记录` : "真人试穿记录"} /><span><b>{garment?.name ?? "历史试穿"}</b><small>{new Date(session.createdAt).toLocaleDateString("zh-CN")}</small></span></button>;
      })}</div></section>}

      <aside className="photo-tryon-roadmap"><span>后续技术探索</span><p>3D 纸样重建、布料模拟和可旋转数字人已移出当前产品主流程，待单独完成效果、速度和成本评测后再决定是否接入。</p></aside>
    </section>
  );
}
