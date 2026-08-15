"use client";

/* eslint-disable @next/next/no-img-element -- previews use local uploads and optional model render URLs. */

import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent } from "react";
import {
  defaultMeasurements,
  type BodyMeasurements,
  type BodyModel,
  type Inspiration,
  type PreferenceProfile,
  type StyleTwinLook,
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

function MiniGarment({ garment }: { garment: Garment }) {
  return (
    <span className="body-garment-chip" style={{ "--chip-color": categoryColors[garment.category] } as CSSProperties}>
      {categoryGlyphs[garment.category]}<small>{garment.name}</small>
    </span>
  );
}

function BodyAvatar({
  model,
  rotation,
  garments,
  renderResult,
}: {
  model: BodyModel;
  rotation: number;
  garments: Garment[];
  renderResult: boolean;
}) {
  const measure = model.measurements;
  const torsoScale = Math.max(0.82, Math.min(1.22, measure.chest / 90));
  const waistScale = Math.max(0.74, Math.min(1.18, measure.waist / 74));
  const hipScale = Math.max(0.82, Math.min(1.23, measure.hips / 94));
  const heightScale = Math.max(0.86, Math.min(1.13, measure.height / 170));
  const style = {
    "--body-rotation": `${rotation}deg`,
    "--torso-scale": torsoScale,
    "--waist-scale": waistScale,
    "--hip-scale": hipScale,
    "--height-scale": heightScale,
    "--skin-tone": ({ "自然暖调": "#d8b9a3", "自然冷调": "#d4b4aa", "白皙": "#ead1c2", "小麦": "#b98968", "深色": "#77513f" } as Record<string, string>)[measure.skinTone] ?? "#d8b9a3",
    "--hair-tone": ({ "黑色": "#211e1c", "深棕": "#3d302a", "浅棕": "#765744", "灰色": "#73706c", "彩色": "#5b465c" } as Record<string, string>)[measure.hairColor] ?? "#3d302a",
  } as CSSProperties;
  const top = garments.find((item) => item.category === "上装");
  const outer = garments.find((item) => item.category === "外套");
  const bottom = garments.find((item) => item.category === "下装");
  const dress = garments.find((item) => item.category === "连衣裙");
  const shoes = garments.find((item) => item.category === "鞋履");
  const accessory = garments.find((item) => item.category === "配饰");
  const garmentStyle = (garment: Garment | undefined) => ({
    backgroundColor: garment ? categoryColors[garment.category] : undefined,
    backgroundImage: garment?.imageUrl ? `url("${garment.imageUrl}")` : undefined,
  });
  return (
    <div className="body-stage">
      {model.renderUrl && (garments.length === 0 || renderResult) ? <img className="body-render" src={model.renderUrl} alt="3D 人体渲染" /> : (
        <div className={cx("body-avatar", model.sourceType === "photos" && "is-photo-guided")} style={style} aria-label="可旋转参数化 3D 人体">
          <i className={cx("body-hair", `hair-${measure.hairStyle}`)} /><i className="body-head" /><i className="body-face" /><i className="body-neck" /><i className="body-torso" /><i className="body-waist" /><i className="body-hips" />
          <i className="body-arm body-arm--left" /><i className="body-arm body-arm--right" />
          <i className="body-leg body-leg--left" /><i className="body-leg body-leg--right" />
          {(top || dress) && <i className={cx("avatar-garment", dress ? "avatar-garment--dress" : "avatar-garment--top")} style={garmentStyle(dress ?? top)} />}
          {bottom && !dress && <i className="avatar-garment avatar-garment--bottom" style={garmentStyle(bottom)} />}
          {outer && <i className="avatar-garment avatar-garment--outer" style={garmentStyle(outer)} />}
          {shoes && <><i className="avatar-garment avatar-garment--shoe avatar-garment--shoe-left" style={garmentStyle(shoes)} /><i className="avatar-garment avatar-garment--shoe avatar-garment--shoe-right" style={garmentStyle(shoes)} /></>}
          {accessory && <i className="avatar-garment avatar-garment--accessory" style={garmentStyle(accessory)} />}
        </div>
      )}
      {model.frontPhotoUrl && <img className="body-source-inset" src={model.frontPhotoUrl} alt="建模参考正面照" />}
      <div className="body-floor" />
      <span className="body-mode">{model.modelMode === "sam3d" ? "SAM 3D BODY" : model.modelMode === "mhr" ? "MHR MODEL" : "PARAMETRIC PREVIEW"}</span>
      <span className="body-confidence">人体置信度 {Math.round(model.profileConfidence * 100)}%</span>
    </div>
  );
}

export function BodyStudio({ garments }: { garments: Garment[] }) {
  const [source, setSource] = useState<"measurements" | "photos">("measurements");
  const [measurements, setMeasurements] = useState(defaultMeasurements);
  const [model, setModel] = useState<BodyModel | null>(null);
  const [models, setModels] = useState<BodyModel[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [rotation, setRotation] = useState(0);
  const [front, setFront] = useState<File | null>(null);
  const [side, setSide] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [sidePreview, setSidePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [simulationMode, setSimulationMode] = useState<string | null>(null);
  const [buildStage, setBuildStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [styleLooks, setStyleLooks] = useState<StyleTwinLook[]>([]);
  const [styleOccasion, setStyleOccasion] = useState("全部");
  const [styleLoading, setStyleLoading] = useState(false);
  const [activeStyleId, setActiveStyleId] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/body-model").then((response) => response.ok ? response.json() : null).then((data) => {
      if (data?.model) { setModel(data.model); setMeasurements(data.model.measurements); }
      if (data?.models) setModels(data.models);
    }).catch(() => undefined);
    fetch("/api/style-twin").then((response) => response.ok ? response.json() : null).then((data) => data?.looks && setStyleLooks(data.looks)).catch(() => undefined);
  }, []);
  const selectedGarments = useMemo(() => selected.map((id) => garments.find((item) => item.id === id)).filter((item): item is Garment => Boolean(item)), [garments, selected]);

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
  }
  async function build() {
    setLoading(true);
    setError(null);
    setBuildStage(source === "photos" ? "正在安全上传并识别人体轮廓…" : "正在根据参数生成虚拟人体…");
    const stageTimer = window.setTimeout(() => setBuildStage(source === "photos" ? "正在估计身体比例并重建网格…" : "正在校准肩腰臀和腿长比例…"), 650);
    try {
      const response = source === "photos"
        ? await (() => { const form = new FormData(); if (front) form.set("front", front); if (side) form.set("side", side); form.set("measurements", JSON.stringify(measurements)); form.set("name", "我的双照人体"); return fetch("/api/body-model", { method: "POST", body: form }); })()
        : await fetch("/api/body-model", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "build", name: "我的参数人体", measurements }) });
      const data = await response.json() as { model?: BodyModel; error?: string };
      if (!response.ok || !data.model) throw new Error(data.error || "建模失败");
      setModel(data.model);
      setMeasurements(data.model.measurements);
      setModels((current) => [data.model!, ...current.filter((item) => item.id !== data.model!.id)].slice(0, 6));
      setBuildStage("人体模型已完成，可以开始 3D 搭配");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "建模失败，请稍后重试");
      setBuildStage(null);
    } finally { window.clearTimeout(stageTimer); setLoading(false); }
  }
  async function simulate() {
    if (!model || selected.length === 0) return;
    setLoading(true);
    try {
      const response = await fetch("/api/body-model", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "simulate", bodyModelId: model.id, itemIds: selected, styleSessionId: activeStyleId }) });
      const data = await response.json() as { mode?: string; renderUrl?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "模拟失败");
      setSimulationMode(data.mode ?? "parametric");
      if (data.renderUrl) setModel({ ...model, renderUrl: data.renderUrl, modelMode: "mhr" });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "3D 模拟失败");
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
        <div className="body-section-heading"><span>01</span><div><p className="eyebrow">BUILD YOUR BODY TWIN</p><h2>建立专属人体</h2></div></div>
        <div className="mode-switch"><button className={source === "photos" ? "is-active" : ""} onClick={() => setSource("photos")}>AI 照片建模</button><button className={source === "measurements" ? "is-active" : ""} onClick={() => setSource("measurements")}>参数生成</button></div>
        {source === "measurements" ? (
          <><div className="measurement-grid">
            <label><span>性别表达</span><select value={measurements.gender} onChange={(event) => updateMeasurement("gender", event.target.value)}><option>中性</option><option>女性</option><option>男性</option></select></label>
            <label><span>体型特征</span><select value={measurements.bodyShape} onChange={(event) => updateMeasurement("bodyShape", event.target.value)}><option>自然匀称</option><option>梨形</option><option>苹果形</option><option>倒三角</option><option>直筒形</option></select></label>
            {(["height", "weight", "chest", "waist", "hips", "shoulder", "inseam"] as const).map((key) => <label key={key}><span>{{ height: "身高 cm", weight: "体重 kg", chest: "胸围 cm", waist: "腰围 cm", hips: "臀围 cm", shoulder: "肩宽 cm", inseam: "内长 cm" }[key]}</span><input type="number" value={measurements[key]} onChange={(event) => updateMeasurement(key, event.target.value)} /></label>)}
          </div><div className="appearance-grid">
            <label><span>肤色</span><select value={measurements.skinTone} onChange={(event) => updateMeasurement("skinTone", event.target.value)}><option>自然暖调</option><option>自然冷调</option><option>白皙</option><option>小麦</option><option>深色</option></select></label>
            <label><span>发型</span><select value={measurements.hairStyle} onChange={(event) => updateMeasurement("hairStyle", event.target.value)}><option>短发</option><option>中长发</option><option>长发</option><option>卷发</option><option>光头</option></select></label>
            <label><span>发色</span><select value={measurements.hairColor} onChange={(event) => updateMeasurement("hairColor", event.target.value)}><option>深棕</option><option>黑色</option><option>浅棕</option><option>灰色</option><option>彩色</option></select></label>
            <label><span>肩型</span><select value={measurements.shoulderSlope} onChange={(event) => updateMeasurement("shoulderSlope", event.target.value)}><option>自然</option><option>平肩</option><option>溜肩</option></select></label>
            <label><span>站姿</span><select value={measurements.posture} onChange={(event) => updateMeasurement("posture", event.target.value)}><option>自然站立</option><option>挺拔</option><option>轻松</option></select></label>
          </div></>
        ) : (
          <><div className="photo-guidance"><b>拍摄指引</b><span>纯色背景 · 全身入镜 · 无宽大外套 · 自然站立</span></div><div className="body-photo-grid">
            <label>{frontPreview ? <img src={frontPreview} alt="正面照" /> : <><strong>正面全身照</strong><small>自然站立，完整露出四肢</small></>}<input type="file" accept="image/*" onChange={(event) => photo(event, "front")} /></label>
            <label>{sidePreview ? <img src={sidePreview} alt="侧面照" /> : <><strong>侧面全身照</strong><small>推荐上传，能改善厚度和姿态</small></>}<input type="file" accept="image/*" onChange={(event) => photo(event, "side")} /></label>
          </div><label className="photo-height"><span>已知身高（用于比例校准）</span><input type="number" value={measurements.height} onChange={(event) => updateMeasurement("height", event.target.value)} /><b>cm</b></label></>
        )}
        <button className="primary-button full-width" disabled={loading || (source === "photos" && !front)} onClick={() => void build()}>{loading ? "正在建立人体…" : model ? "重新建立人体" : "生成我的 3D 人体"}</button>
        {buildStage && <div className={cx("model-build-stage", loading && "is-loading")}><i /><span>{buildStage}</span></div>}
        {error && <p className="body-error">{error}</p>}
        <p className="fine-print">已接服务时生成 SAM 3D Body/MHR 网格；未接服务时提供照片引导或参数化预览，并明确标注模式。</p>
      </div>
      <div className="body-preview">
        <div className="body-preview-top"><div><p className="eyebrow">LIVE 3D PREVIEW</p><h2>{model?.name ?? "你的虚拟人体"}</h2></div>{model && <span>{model.sourceType === "photos" ? "照片重建" : "参数生成"}</span>}</div>
        {model ? <BodyAvatar model={model} rotation={rotation} garments={selectedGarments} renderResult={simulationMode === "mhr"} /> : <div className="body-empty"><span>◎</span><h3>你的人体模型会出现在这里</h3><p>上传全身照，或输入身体参数快速生成。</p></div>}
        <div className="rotation-presets"><button onClick={() => setRotation(-45)}>左 45°</button><button className={rotation === 0 ? "is-active" : ""} onClick={() => setRotation(0)}>正面</button><button onClick={() => setRotation(45)}>右 45°</button></div>
        <label className="rotation-control"><span>自由旋转</span><input type="range" min="-70" max="70" value={rotation} onChange={(event) => setRotation(Number(event.target.value))} /></label>
        {models.length > 1 && <div className="body-model-history"><span>历史人体</span>{models.map((item) => <button className={item.id === model?.id ? "is-active" : ""} onClick={() => { setModel(item); setMeasurements(item.measurements); setSimulationMode(null); }} key={item.id}>{item.sourceType === "photos" ? "◉" : "◇"} {item.name}</button>)}</div>}
        {model?.frontPhotoUrl && <button className="privacy-button" onClick={() => void removePhotos()}>删除已存参考照片，保留人体参数</button>}
      </div>
      <div className="body-wardrobe">
        <div className="body-section-heading"><span>02</span><div><p className="eyebrow">3D GARMENT LAYERS</p><h2>把衣柜套到人体上</h2><p>支持上装、下装、连衣裙、外套、鞋履和配饰分层。</p></div></div>
        <div className="body-selected">{selectedGarments.length ? selectedGarments.map((item) => <MiniGarment garment={item} key={item.id} />) : <span>尚未选择衣物</span>}</div>
        <div className="body-garment-grid">{garments.filter((item) => ["上装", "下装", "连衣裙", "外套", "鞋履", "配饰"].includes(item.category)).map((item) => <button className={selected.includes(item.id) ? "is-active" : ""} onClick={() => { toggleGarment(item); setActiveStyleId(null); }} key={item.id}>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span style={{ background: categoryColors[item.category] }}>{categoryGlyphs[item.category]}</span>}<small><b>{item.category}</b>{item.name}</small></button>)}</div>
        <button className="primary-button full-width" disabled={!model || !selected.length || loading} onClick={() => void simulate()}>{loading ? "正在计算布料与身体…" : "运行 3D 服装模拟"}</button>
        {simulationMode && <p className="simulation-status">✓ 已生成{simulationMode === "mhr" ? " MHR 真实服装模拟" : "参数化 3D 分层预览"}</p>}
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
