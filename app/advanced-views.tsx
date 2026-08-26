"use client";

/* eslint-disable @next/next/no-img-element -- previews use local uploads and optional model render URLs. */

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import {
  defaultMeasurements,
  type BodyMeasurements,
  type BodyModel,
  type Inspiration,
  type PreferenceProfile,
  type StyleTwinLook,
} from "@/lib/phase-two-three";
import { categoryColors, categoryGlyphs, type Garment } from "@/lib/wardrobe";

const BodyThreeViewer = lazy(() => import("./body-three-viewer").then((module) => ({ default: module.BodyThreeViewer })));

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

function MiniGarment({ garment }: { garment: Garment }) {
  return (
    <span className="body-garment-chip" style={{ "--chip-color": categoryColors[garment.category] } as CSSProperties}>
      {categoryGlyphs[garment.category]}<small>{garment.name}</small>
    </span>
  );
}

type TryOnState = {
  sessionId: string;
  bodyModelId: string | null;
  mode: string;
  itemIds: string[];
  status: "queued" | "processing" | "ready" | "failed";
  progress: number;
  meshUrl: string | null;
  renderUrl: string | null;
  error: string | null;
};

const tryOnStage = (progress: number) => progress < 20
  ? "正在读取人体轮廓和衣物版型"
  : progress < 52
    ? "正在生成可分离的 3D 衣物"
    : progress < 82
      ? "正在计算贴合、碰撞与布料垂坠"
      : "正在烘焙纹理并准备网页预览";

export function BodyStudio({ garments }: { garments: Garment[] }) {
  const [source, setSource] = useState<"measurements" | "photos">("photos");
  const [measurements, setMeasurements] = useState(defaultMeasurements);
  const [model, setModel] = useState<BodyModel | null>(null);
  const [models, setModels] = useState<BodyModel[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [applied, setApplied] = useState<string[]>([]);
  const [rotation, setRotation] = useState(0);
  const [front, setFront] = useState<File | null>(null);
  const [side, setSide] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [sidePreview, setSidePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [simulationMode, setSimulationMode] = useState<string | null>(null);
  const [tryOn, setTryOn] = useState<TryOnState | null>(null);
  const [garmentFilter, setGarmentFilter] = useState("搭配");
  const [buildStage, setBuildStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [styleLooks, setStyleLooks] = useState<StyleTwinLook[]>([]);
  const [styleOccasion, setStyleOccasion] = useState("全部");
  const [styleLoading, setStyleLoading] = useState(false);
  const [activeStyleId, setActiveStyleId] = useState<string | null>(null);
  const pollGenerationRef = useRef(0);
  useEffect(() => {
    fetch("/api/body-model").then((response) => response.ok ? response.json() : null).then((data) => {
      if (data?.model) { setModel(data.model); setMeasurements(data.model.measurements); }
      if (data?.models) setModels(data.models);
      if (data?.tryon && data?.model && data.tryon.bodyModelId === data.model.id) {
        applyTryOn(data.tryon as TryOnState);
        if (["queued", "processing"].includes(data.tryon.status)) void pollTryOn(data.tryon as TryOnState);
      }
    }).catch(() => undefined);
    fetch("/api/style-twin").then((response) => response.ok ? response.json() : null).then((data) => data?.looks && setStyleLooks(data.looks)).catch(() => undefined);
    // Initial hydration intentionally runs once; polling updates the same local model.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const selectedGarments = useMemo(() => selected.map((id) => garments.find((item) => item.id === id)).filter((item): item is Garment => Boolean(item)), [garments, selected]);
  const appliedGarments = useMemo(() => applied.map((id) => garments.find((item) => item.id === id)).filter((item): item is Garment => Boolean(item)), [applied, garments]);
  const wearableGarments = useMemo(() => garments.filter((item) => ["上装", "下装", "连衣裙", "外套", "鞋履", "配饰"].includes(item.category)), [garments]);
  const visibleGarments = useMemo(() => garmentFilter === "搭配"
    ? wearableGarments
    : wearableGarments.filter((item) => item.category === garmentFilter), [garmentFilter, wearableGarments]);

  function updateMeasurement(key: keyof BodyMeasurements, value: string) {
    const numeric = ["height", "weight", "chest", "waist", "hips", "shoulder", "inseam"].includes(key);
    setMeasurements((current) => ({ ...current, [key]: numeric ? Number(value) : value }));
  }
  function photo(event: ChangeEvent<HTMLInputElement>, kind: "front" | "side") {
    const file = event.target.files?.[0];
    if (!file) return;
    if (kind === "front") { setFront(file); setFrontPreview(URL.createObjectURL(file)); }
    else { setSide(file); setSidePreview(URL.createObjectURL(file)); }
  }
  function toggleGarment(garment: Garment) {
    setSelected((current) => {
      if (current.includes(garment.id)) return current.filter((id) => id !== garment.id);
      const conflicting = garments.filter((item) => current.includes(item.id) && item.category === garment.category).map((item) => item.id);
      let next = current.filter((id) => !conflicting.includes(id));
      if (garment.category === "连衣裙") next = next.filter((id) => !garments.some((item) => item.id === id && (item.category === "上装" || item.category === "下装")));
      if ((garment.category === "上装" || garment.category === "下装") && current.some((id) => garments.find((item) => item.id === id)?.category === "连衣裙")) next = next.filter((id) => garments.find((item) => item.id === id)?.category !== "连衣裙");
      return [...next, garment.id].slice(-5);
    });
    setSimulationMode(null);
    setTryOn(null);
  }
  async function build() {
    setLoading(true);
    setError(null);
    setBuildStage(source === "photos" ? "正在安全上传并识别人体轮廓…" : "正在根据参数生成虚拟人体…");
    const stageTimer = window.setTimeout(() => setBuildStage(source === "photos" ? "正在估计身体比例并重建网格…" : "正在校准胸围、腰围和臀围比例…"), 650);
    try {
      const response = source === "photos"
        ? await (() => { const form = new FormData(); if (front) form.set("front", front); if (side) form.set("side", side); form.set("measurements", JSON.stringify(measurements)); form.set("name", "我的全身照人体"); return fetch("/api/body-model", { method: "POST", body: form }); })()
        : await fetch("/api/body-model", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "build", name: "我的参数人体", measurements }) });
      const data = await response.json() as { model?: BodyModel; error?: string };
      if (!response.ok || !data.model) throw new Error(data.error || "建模失败");
      setModel(data.model);
      setMeasurements(data.model.measurements);
      setModels((current) => [data.model!, ...current.filter((item) => item.id !== data.model!.id)].slice(0, 6));
      setApplied([]);
      setTryOn(null);
      setSimulationMode(null);
      setBuildStage("人体模型已完成，可以开始 3D 搭配");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "建模失败，请稍后重试");
      setBuildStage(null);
    } finally { window.clearTimeout(stageTimer); setLoading(false); }
  }
  function applyTryOn(next: TryOnState) {
    setTryOn(next);
    setApplied(next.itemIds);
    setSimulationMode(next.mode);
    setModel((current) => {
      if (!current) return current;
      const base = models.find((item) => item.id === current.id) ?? current;
      return {
        ...base,
        meshUrl: next.meshUrl ?? base.meshUrl,
        renderUrl: next.renderUrl ?? base.renderUrl,
      };
    });
  }
  async function pollTryOn(initial: TryOnState) {
    const generation = ++pollGenerationRef.current;
    let current = initial;
    for (let attempt = 0; attempt < 180 && generation === pollGenerationRef.current; attempt += 1) {
      if (!["queued", "processing"].includes(current.status)) break;
      await new Promise((resolve) => window.setTimeout(resolve, attempt < 5 ? 1600 : 5000));
      const response = await fetch(`/api/body-model?sessionId=${encodeURIComponent(current.sessionId)}`);
      const data = await response.json() as { tryon?: TryOnState; error?: string };
      if (!response.ok || !data.tryon) throw new Error(data.error || "无法读取 3D 生成进度");
      current = data.tryon;
      applyTryOn(current);
      if (current.status === "failed") throw new Error(current.error || "本次 3D 生成失败，请重试");
      if (current.status === "ready") return;
    }
  }
  async function simulate(itemIds = selected, styleSessionId = activeStyleId) {
    if (!model || itemIds.length === 0) return;
    setLoading(true);
    setError(null);
    setTryOn({ sessionId: "preparing", bodyModelId: model.id, mode: "chatgarment", itemIds, status: "processing", progress: 3, meshUrl: null, renderUrl: null, error: null });
    try {
      const response = await fetch("/api/body-model", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "simulate", bodyModelId: model.id, itemIds, styleSessionId }) });
      const data = await response.json() as { tryon?: TryOnState; error?: string };
      if (!response.ok || !data.tryon) throw new Error(data.error || "模拟失败");
      applyTryOn(data.tryon);
      if (["queued", "processing"].includes(data.tryon.status)) await pollTryOn(data.tryon);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "3D 模拟失败");
      setTryOn((current) => current ? { ...current, status: "failed" } : current);
    } finally { setLoading(false); }
  }
  async function recommendStyles() {
    if (!model) return;
    setStyleLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/style-twin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "recommend", bodyModelId: model.id, occasion: styleOccasion }),
      });
      const data = await response.json() as { looks?: StyleTwinLook[]; error?: string };
      if (!response.ok || !data.looks) throw new Error(data.error || "暂时无法生成潮人搭配");
      setStyleLooks((current) => [...data.looks!, ...current.filter((item) => !data.looks!.some((next) => next.id === item.id))].slice(0, 12));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "推荐失败");
    } finally { setStyleLoading(false); }
  }
  function applyStyleLook(look: StyleTwinLook) {
    setSelected(look.itemIds);
    setActiveStyleId(look.id);
    setSimulationMode(null);
    void simulate(look.itemIds, look.id);
  }
  async function styleFeedback(look: StyleTwinLook, action: "like" | "reject" | "save") {
    const response = await fetch("/api/style-twin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, id: look.id }),
    });
    const data = await response.json() as { looks?: StyleTwinLook[] };
    if (response.ok && data.looks) setStyleLooks(data.looks);
  }
  async function removePhotos() {
    if (!model) return;
    const response = await fetch("/api/body-model", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "removePhotos", bodyModelId: model.id }),
    });
    const data = await response.json() as { model?: BodyModel };
    if (response.ok && data.model) {
      setModel(data.model);
      setModels((current) => current.map((item) => item.id === data.model!.id ? data.model! : item));
    }
  }
  return (
    <section className="body-studio">
      <div className="body-controls">
        <div className="body-section-heading"><span>01</span><div><p className="eyebrow">BUILD YOUR BODY TWIN</p><h2>上传一张全身照</h2><p>正面自然站立即可；侧面照和三围都是可选增强项。</p></div></div>
        <div className="mode-switch"><button className={source === "photos" ? "is-active" : ""} onClick={() => setSource("photos")}>AI 照片建模</button><button className={source === "measurements" ? "is-active" : ""} onClick={() => setSource("measurements")}>不上传照片</button></div>
        {source === "measurements" ? (
          <><div className="measurement-intro"><b>只需 5 项</b><span>输入你最容易知道的数据，肩宽、腿长和身体类型由系统自动推算。</span></div><div className="measurement-grid measurement-grid--simple">
            {(["height", "weight", "chest", "waist", "hips"] as const).map((key) => <label key={key}><span>{{ height: "身高 cm", weight: "体重 kg", chest: "胸围 cm", waist: "腰围 cm", hips: "臀围 cm" }[key]}</span><input type="number" min={key === "height" ? 130 : key === "weight" ? 35 : 45} max={key === "height" ? 220 : key === "weight" ? 180 : 180} value={measurements[key]} onChange={(event) => updateMeasurement(key, event.target.value)} /></label>)}
          </div></>
        ) : (
          <><div className="photo-guidance"><b>一张照片就能开始</b><span>全身入镜 · 四肢无遮挡 · 不穿宽大外套 · 光线均匀</span></div><div className="body-photo-grid body-photo-grid--single">
            <label>{frontPreview ? <img src={frontPreview} alt="正面全身照预览" /> : <><span className="body-upload-mark">＋</span><strong>上传正面全身照</strong><small>支持 JPG、PNG、WebP，建议人物占画面 70% 以上</small></>}<input type="file" accept="image/*" onChange={(event) => photo(event, "front")} /></label>
          </div><details className="body-photo-optional"><summary>可选：补充侧面照，提高身体厚度估计</summary><label>{sidePreview ? <img src={sidePreview} alt="侧面照预览" /> : <><strong>上传侧面全身照</strong><small>自然站立，手臂不要遮挡腰线</small></>}<input type="file" accept="image/*" onChange={(event) => photo(event, "side")} /></label></details><label className="photo-height"><span>身高（用于真实比例校准）</span><input type="number" value={measurements.height} onChange={(event) => updateMeasurement("height", event.target.value)} /><b>cm</b></label></>
        )}
        <button className="primary-button full-width" disabled={loading || (source === "photos" && !front)} onClick={() => void build()}>{loading ? "正在建立人体…" : model ? "重新建立人体" : "生成我的虚拟人"}</button>
        {buildStage && <div className={cx("model-build-stage", loading && "is-loading")}><i /><span>{buildStage}</span></div>}
        {error && <p className="body-error">{error}</p>}
        <p className="fine-print">照片仅用于生成你的私有人体模型；可随时删除原图。GPU 服务可用时生成照片重建网格，否则展示清楚标注的互动预览模型。</p>
      </div>
      <div className="body-preview">
        <div className="body-preview-top"><div><p className="eyebrow">LIVE 3D PREVIEW</p><h2>{model?.name ?? "你的虚拟人体"}</h2></div>{model && <span>{model.sourceType === "photos" ? "照片重建" : "参数生成"}</span>}</div>
        {model ? <div className="body-stage">{simulationMode === "chatgarment" && tryOn?.renderUrl && !tryOn.meshUrl ? <img className="body-render-result" src={tryOn.renderUrl} alt="ChatGarment 试穿渲染结果" /> : <Suspense fallback={<div className="body-three-fallback"><strong>正在启动 3D 试衣间…</strong></div>}><BodyThreeViewer model={model} rotation={rotation} garments={appliedGarments} externalResult={simulationMode === "chatgarment" && Boolean(tryOn?.meshUrl)} /></Suspense>}{model.frontPhotoUrl && <img className="body-source-inset" src={model.frontPhotoUrl} alt="建模参考正面照" />}{tryOn && ["queued", "processing"].includes(tryOn.status) && <div className="tryon-generation"><div><span>{tryOnStage(tryOn.progress)}</span><b>{Math.round(tryOn.progress)}%</b></div><i><b style={{ width: `${Math.max(4, tryOn.progress)}%` }} /></i><small>可留在当前页面查看进度；照片与衣物原图通过私有链路发送到 GPU 服务。</small></div>}</div> : <div className="body-empty"><span>◎</span><h3>你的虚拟人会出现在这里</h3><p>上传一张全身照，或用身高、体重和三围生成。</p></div>}
        <div className="rotation-presets"><button onClick={() => setRotation(-45)}>左 45°</button><button className={rotation === 0 ? "is-active" : ""} onClick={() => setRotation(0)}>正面</button><button onClick={() => setRotation(45)}>右 45°</button></div>
        <label className="rotation-control"><span>自由旋转</span><input type="range" min="-70" max="70" value={rotation} onChange={(event) => setRotation(Number(event.target.value))} /></label>
        {models.length > 1 && <div className="body-model-history"><span>历史人体</span>{models.map((item) => <button className={item.id === model?.id ? "is-active" : ""} onClick={() => { setModel(item); setMeasurements(item.measurements); setApplied([]); setSimulationMode(null); }} key={item.id}>{item.sourceType === "photos" ? "◉" : "◇"} {item.name}</button>)}</div>}
        {model?.frontPhotoUrl && <button className="privacy-button" onClick={() => void removePhotos()}>删除已存参考照片，保留人体参数</button>}
      </div>
      <div className="body-wardrobe">
        <div className="body-section-heading"><span>02</span><div><p className="eyebrow">3D GARMENT LAYERS</p><h2>选择要试穿的衣服</h2><p>上装＋下装＋外套可叠穿；连衣裙会自动替换上下装。</p></div></div>
        <div className="body-selected">{selectedGarments.length ? selectedGarments.map((item) => <MiniGarment garment={item} key={item.id} />) : <span>尚未选择衣物</span>}</div>
        <div className="body-garment-filters">{["搭配", "上装", "下装", "连衣裙", "外套"].map((item) => <button className={garmentFilter === item ? "is-active" : ""} onClick={() => setGarmentFilter(item)} key={item}>{item}</button>)}</div>
        <div className="body-garment-grid">{visibleGarments.map((item) => <button className={selected.includes(item.id) ? "is-active" : ""} onClick={() => { toggleGarment(item); setActiveStyleId(null); }} key={item.id}>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span style={{ background: categoryColors[item.category] }}>{categoryGlyphs[item.category]}</span>}<small><b>{item.category}</b>{item.name}</small></button>)}</div>
        {selected.length > 0 && selected.join(",") !== applied.join(",") && <p className="body-selection-pending">已选 {selected.length} 件，确认后更新右侧 3D 人体。</p>}
        {selectedGarments.some((item) => !item.imageUrl) && <p className="body-selection-note">没有原图的单品会先按品类和颜色匹配基础版型；补充衣物照片后效果会更接近实物。</p>}
        <button className="primary-button full-width" disabled={!model || !selected.length || loading} onClick={() => void simulate()}>{loading ? "正在生成 3D 穿搭…" : "确认并生成 3D 穿搭"}</button>
        {simulationMode && tryOn?.status === "ready" && <p className={cx("simulation-status", simulationMode === "webgl" && "is-preview")}>{simulationMode === "chatgarment" ? "✓ 已生成 ChatGarment 服装网格与布料贴合结果" : "互动预览已更新 · 当前未调用 GPU 服装仿真"}</p>}
      </div>
      <div className="style-twin-lab">
        <header><div className="body-section-heading"><span>03</span><div><p className="eyebrow">AI STYLE TWIN</p><h2>学习潮人穿搭，再适配到你身上</h2><p>AI 提取配色、层次、比例和场景语言，只使用你真实衣柜中的单品重组。</p></div></div><div className="style-twin-actions"><select value={styleOccasion} onChange={(event) => setStyleOccasion(event.target.value)}><option>全部</option><option>通勤</option><option>约会</option><option>周末</option><option>会议</option><option>日常</option></select><button className="primary-button" disabled={!model || styleLoading} onClick={() => void recommendStyles()}>{styleLoading ? "正在理解风格 DNA…" : "生成 3 套 Style Twin"}</button></div></header>
        {!model ? <div className="style-twin-empty">先在上方建立人体，AI 才能同时考虑风格和身体比例。</div> : styleLooks.length ? <div className="style-twin-grid">{styleLooks.slice(0, 3).map((look, index) => {
          const items = look.itemIds.map((id) => garments.find((item) => item.id === id)).filter((item): item is Garment => Boolean(item));
          return <article className={cx("style-twin-card", activeStyleId === look.id && "is-active")} key={look.id}><div className="style-twin-card-top"><span>0{index + 1}</span><div><p>{look.occasion} · BY {look.creator}</p><h3>{look.inspirationTitle}</h3></div><b>{look.score}<small>%</small></b></div><div className="style-twin-items">{items.map((item) => <span style={{ "--look-item-color": categoryColors[item.category] } as CSSProperties} key={item.id}>{item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : categoryGlyphs[item.category]}<small>{item.name}</small></span>)}</div><div className="style-twin-dna"><strong>{look.formula}</strong><p>{look.bodyNote}</p><small>{look.colorNote}</small></div><div className="style-twin-card-actions"><button className={look.feedback === "like" ? "is-active" : ""} onClick={() => void styleFeedback(look, "like")}>喜欢</button><button className={look.feedback === "reject" ? "is-rejected" : ""} onClick={() => void styleFeedback(look, "reject")}>不适合</button><button className={look.saved ? "is-active" : ""} onClick={() => void styleFeedback(look, "save")}>{look.saved ? "已保存" : "保存"}</button><button className="try-style-button" onClick={() => applyStyleLook(look)}>在人体上试穿 →</button></div></article>;
        })}</div> : <div className="style-twin-empty">选择场合并生成 3 套方案，每一套都会解释风格来源和适配理由。</div>}
        <footer><span>学习信号</span><p>喜欢、拒绝、保存和最终试穿都会调整下一轮排序；实际穿着仍然拥有最高权重。</p></footer>
      </div>
    </section>
  );
}
