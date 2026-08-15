"use client";

/* eslint-disable @next/next/no-img-element -- previews use local uploads and optional model render URLs. */

import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent } from "react";
import {
  defaultMeasurements,
  type BodyMeasurements,
  type BodyModel,
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
}: {
  model: BodyModel;
  rotation: number;
  garments: Garment[];
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
  } as CSSProperties;
  const top = garments.find((item) => item.category === "上装" || item.category === "外套");
  const bottom = garments.find((item) => item.category === "下装");
  const dress = garments.find((item) => item.category === "连衣裙");
  return (
    <div className="body-stage">
      {model.renderUrl ? <img className="body-render" src={model.renderUrl} alt="3D 人体渲染" /> : (
        <div className="body-avatar" style={style} aria-label="可旋转参数化 3D 人体">
          <i className="body-head" /><i className="body-neck" /><i className="body-torso" /><i className="body-waist" /><i className="body-hips" />
          <i className="body-arm body-arm--left" /><i className="body-arm body-arm--right" />
          <i className="body-leg body-leg--left" /><i className="body-leg body-leg--right" />
          {(top || dress) && <i className={cx("avatar-garment", dress ? "avatar-garment--dress" : "avatar-garment--top")} style={{ background: categoryColors[(dress ?? top)!.category] }} />}
          {bottom && !dress && <i className="avatar-garment avatar-garment--bottom" style={{ background: categoryColors[bottom.category] }} />}
        </div>
      )}
      <div className="body-floor" />
      <span className="body-mode">{model.modelMode === "sam3d" ? "SAM 3D BODY" : model.modelMode === "mhr" ? "MHR MODEL" : "PARAMETRIC PREVIEW"}</span>
    </div>
  );
}

export function BodyStudio({ garments }: { garments: Garment[] }) {
  const [source, setSource] = useState<"measurements" | "photos">("measurements");
  const [measurements, setMeasurements] = useState(defaultMeasurements);
  const [model, setModel] = useState<BodyModel | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [rotation, setRotation] = useState(0);
  const [front, setFront] = useState<File | null>(null);
  const [side, setSide] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [sidePreview, setSidePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [simulationMode, setSimulationMode] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/body-model").then((response) => response.ok ? response.json() : null).then((data) => data?.model && setModel(data.model)).catch(() => undefined);
  }, []);
  const selectedGarments = useMemo(() => selected.map((id) => garments.find((item) => item.id === id)).filter((item): item is Garment => Boolean(item)), [garments, selected]);

  function updateMeasurement(key: keyof BodyMeasurements, value: string) {
    setMeasurements((current) => ({ ...current, [key]: key === "gender" ? value : Number(value) }));
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
    try {
      const response = source === "photos"
        ? await (() => { const form = new FormData(); if (front) form.set("front", front); if (side) form.set("side", side); form.set("measurements", JSON.stringify(measurements)); form.set("name", "我的双照人体"); return fetch("/api/body-model", { method: "POST", body: form }); })()
        : await fetch("/api/body-model", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "build", name: "我的参数人体", measurements }) });
      const data = await response.json() as { model?: BodyModel; error?: string };
      if (!response.ok || !data.model) throw new Error(data.error || "建模失败");
      setModel(data.model);
    } finally { setLoading(false); }
  }
  async function simulate() {
    if (!model || selected.length === 0) return;
    setLoading(true);
    try {
      const response = await fetch("/api/body-model", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "simulate", bodyModelId: model.id, itemIds: selected }) });
      const data = await response.json() as { mode?: string; renderUrl?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "模拟失败");
      setSimulationMode(data.mode ?? "parametric");
      if (data.renderUrl) setModel({ ...model, renderUrl: data.renderUrl, modelMode: "mhr" });
    } finally { setLoading(false); }
  }
  return (
    <section className="body-studio">
      <div className="body-controls">
        <div className="mode-switch"><button className={source === "measurements" ? "is-active" : ""} onClick={() => setSource("measurements")}>输入身体参数</button><button className={source === "photos" ? "is-active" : ""} onClick={() => setSource("photos")}>正面＋侧面照片</button></div>
        {source === "measurements" ? (
          <div className="measurement-grid">
            <label><span>性别表达</span><select value={measurements.gender} onChange={(event) => updateMeasurement("gender", event.target.value)}><option>中性</option><option>女性</option><option>男性</option></select></label>
            {(["height", "weight", "chest", "waist", "hips", "shoulder", "inseam"] as const).map((key) => <label key={key}><span>{{ height: "身高 cm", weight: "体重 kg", chest: "胸围 cm", waist: "腰围 cm", hips: "臀围 cm", shoulder: "肩宽 cm", inseam: "内长 cm" }[key]}</span><input type="number" value={measurements[key]} onChange={(event) => updateMeasurement(key, event.target.value)} /></label>)}
          </div>
        ) : (
          <div className="body-photo-grid">
            <label>{frontPreview ? <img src={frontPreview} alt="正面照" /> : <><strong>正面全身照</strong><small>自然站立，完整露出四肢</small></>}<input type="file" accept="image/*" onChange={(event) => photo(event, "front")} /></label>
            <label>{sidePreview ? <img src={sidePreview} alt="侧面照" /> : <><strong>侧面全身照</strong><small>可选，用于改善身体厚度</small></>}<input type="file" accept="image/*" onChange={(event) => photo(event, "side")} /></label>
          </div>
        )}
        <button className="primary-button full-width" disabled={loading || (source === "photos" && !front)} onClick={() => void build()}>{loading ? "正在建立人体…" : model ? "重新建立人体" : "生成我的 3D 人体"}</button>
        <p className="fine-print">照片只发送给已配置的建模服务；默认预览使用本地参数化人体，不保存原始人体照片。</p>
      </div>
      <div className="body-preview">
        {model ? <BodyAvatar model={model} rotation={rotation} garments={selectedGarments} /> : <div className="body-empty"><span>◎</span><h3>你的人体模型会出现在这里</h3><p>可以先用身体参数快速建立，也可接入 SAM 3D Body 做双照重建。</p></div>}
        <label className="rotation-control"><span>旋转人体</span><input type="range" min="-70" max="70" value={rotation} onChange={(event) => setRotation(Number(event.target.value))} /></label>
      </div>
      <div className="body-wardrobe">
        <div><p className="eyebrow">3D GARMENT LAYERS</p><h2>选择要模拟的衣物</h2><p>同品类自动替换；连衣裙与上下装互斥。</p></div>
        <div className="body-selected">{selectedGarments.length ? selectedGarments.map((item) => <MiniGarment garment={item} key={item.id} />) : <span>尚未选择衣物</span>}</div>
        <div className="body-garment-grid">{garments.filter((item) => ["上装", "下装", "连衣裙", "外套"].includes(item.category)).map((item) => <button className={selected.includes(item.id) ? "is-active" : ""} onClick={() => toggleGarment(item)} key={item.id}><span style={{ background: categoryColors[item.category] }}>{categoryGlyphs[item.category]}</span><small>{item.name}</small></button>)}</div>
        <button className="primary-button full-width" disabled={!model || !selected.length || loading} onClick={() => void simulate()}>{loading ? "正在计算布料与身体…" : "运行 3D 服装模拟"}</button>
        {simulationMode && <p className="simulation-status">✓ 已生成{simulationMode === "mhr" ? " MHR 真实服装模拟" : "参数化 3D 分层预览"}</p>}
      </div>
    </section>
  );
}
