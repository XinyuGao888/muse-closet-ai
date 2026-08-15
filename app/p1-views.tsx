"use client";

/* eslint-disable @next/next/no-img-element -- all previews are user uploads or same-origin private assets. */

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from "react";
import type { DiaryEntry, DiaryInsights, GarmentRelation, ReminderPreferences, SavedOutfitCard, ShoppingAssessment, CanvasPlacement } from "@/lib/p1";
import type { OutfitPlan, TryOnHistorySession, WeatherDay } from "@/lib/p0";
import { categoryColors, categoryGlyphs, type Garment, type GarmentCategory, type Outfit } from "@/lib/wardrobe";

function GarmentTile({ garment, compact = false }: { garment: Garment; compact?: boolean }) {
  return garment.imageUrl
    ? <img className={compact ? "p1-garment-img is-compact" : "p1-garment-img"} src={garment.imageUrl} alt={garment.name} />
    : <span className={compact ? "p1-garment-fallback is-compact" : "p1-garment-fallback"} style={{ background: categoryColors[garment.category] }}><b>{categoryGlyphs[garment.category]}</b><small>{garment.color}</small></span>;
}

async function loadImage(source: string) {
  const blob = await fetch(source).then((response) => response.blob());
  return createImageBitmap(blob);
}

async function renderOutfitCard(layout: CanvasPlacement[], garments: Garment[], name: string, occasion: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1100;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.fillStyle = "#f5f1e8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#17231f";
  context.font = "700 38px Georgia, serif";
  context.fillText(name || "My Outfit", 54, 70);
  context.font = "500 18px system-ui";
  context.fillStyle = "#66736e";
  context.fillText(`${occasion}  ·  CREATED WITH MUSE`, 56, 102);
  context.strokeStyle = "#d9d2c5";
  context.beginPath(); context.moveTo(54, 126); context.lineTo(846, 126); context.stroke();
  for (const placement of [...layout].sort((a, b) => a.z - b.z)) {
    const garment = garments.find((item) => item.id === placement.garmentId);
    if (!garment) continue;
    const x = placement.x / 100 * canvas.width;
    const y = 138 + placement.y / 100 * 820;
    const width = 220 * placement.scale;
    const height = 260 * placement.scale;
    context.save();
    context.translate(x, y);
    context.rotate(placement.rotation * Math.PI / 180);
    if (garment.imageUrl) {
      try {
        const image = await loadImage(garment.imageUrl);
        context.drawImage(image, -width / 2, -height / 2, width, height);
        image.close();
      } catch {
        context.fillStyle = categoryColors[garment.category];
        context.fillRect(-width / 2, -height / 2, width, height);
      }
    } else {
      context.fillStyle = categoryColors[garment.category];
      context.beginPath(); context.roundRect(-width / 2, -height / 2, width, height, 28); context.fill();
      context.textAlign = "center";
      context.fillStyle = "#2e4039";
      context.font = `700 ${Math.max(28, 48 * placement.scale)}px Georgia, serif`;
      context.fillText(categoryGlyphs[garment.category], 0, 2);
      context.font = `500 ${Math.max(13, 16 * placement.scale)}px system-ui`;
      context.fillText(garment.name.slice(0, 12), 0, height / 2 - 24);
    }
    context.restore();
  }
  context.fillStyle = "#42554d";
  context.font = "500 18px system-ui";
  context.textAlign = "left";
  context.fillText(`${layout.length} PIECES · YOUR REAL CLOSET`, 54, 1050);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("preview failed")), "image/jpeg", 0.9));
}

export function OutfitCanvasStudio({ garments, cards, saving, onSave, onDelete }: {
  garments: Garment[];
  cards: SavedOutfitCard[];
  saving: boolean;
  onSave: (name: string, occasion: string, layout: CanvasPlacement[], preview: Blob) => void;
  onDelete: (card: SavedOutfitCard) => void;
}) {
  const [layout, setLayout] = useState<CanvasPlacement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("周五松弛通勤");
  const [occasion, setOccasion] = useState("通勤");
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const selected = layout.find((item) => item.garmentId === selectedId);
  const eligible = garments.filter((item) => ["available", "stored"].includes(item.availabilityStatus ?? "available"));

  function add(garmentId: string, x = 50, y = 48) {
    setLayout((current) => current.some((item) => item.garmentId === garmentId)
      ? current
      : [...current, { garmentId, x, y, scale: 1, rotation: 0, z: current.length + 1 }]);
    setSelectedId(garmentId);
  }
  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const id = event.dataTransfer.getData("application/muse-garment");
    const rect = stage.current?.getBoundingClientRect();
    if (!id || !rect) return;
    add(id, ((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100);
  }
  function pointerDown(event: PointerEvent<HTMLButtonElement>, item: CanvasPlacement) {
    const rect = stage.current?.getBoundingClientRect();
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: item.garmentId, offsetX: event.clientX - (rect.left + item.x / 100 * rect.width), offsetY: event.clientY - (rect.top + item.y / 100 * rect.height) };
    setSelectedId(item.garmentId);
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    const rect = stage.current?.getBoundingClientRect();
    if (!active || !rect) return;
    const x = Math.max(3, Math.min(97, ((event.clientX - active.offsetX - rect.left) / rect.width) * 100));
    const y = Math.max(4, Math.min(96, ((event.clientY - active.offsetY - rect.top) / rect.height) * 100));
    setLayout((current) => current.map((item) => item.garmentId === active.id ? { ...item, x, y } : item));
  }
  function update(fields: Partial<CanvasPlacement>) {
    if (!selectedId) return;
    setLayout((current) => current.map((item) => item.garmentId === selectedId ? { ...item, ...fields } : item));
  }
  async function save() {
    if (!layout.length) return;
    const preview = await renderOutfitCard(layout, garments, name, occasion);
    onSave(name, occasion, layout, preview);
  }
  return <section className="canvas-studio">
    <header className="p1-page-hero"><div><p className="eyebrow">CREATIVE OUTFIT BOARD</p><h1>自由搭配画布</h1><p>把真实衣柜当成创作素材。拖入、移动、缩放、旋转和叠放，最后保存成完整 Outfit Card。</p></div><div><input value={name} onChange={(event) => setName(event.target.value)} aria-label="搭配卡名称" /><select value={occasion} onChange={(event) => setOccasion(event.target.value)} aria-label="搭配场合">{["通勤", "约会", "周末", "会议", "旅行", "自由搭配"].map((item) => <option key={item}>{item}</option>)}</select><button className="primary-button" disabled={!layout.length || saving} onClick={() => void save()}>{saving ? "正在生成 Outfit Card…" : "保存完整 Outfit Card"}</button></div></header>
    <div className="canvas-workspace">
      <aside className="canvas-wardrobe"><div><h3>可用衣物</h3><span>{eligible.length} 件可穿</span></div>{eligible.map((garment) => <button draggable onDragStart={(event) => event.dataTransfer.setData("application/muse-garment", garment.id)} onClick={() => add(garment.id)} key={garment.id}><GarmentTile garment={garment} compact /><span><strong>{garment.name}</strong><small>{garment.category} · {garment.color}</small></span><b>＋</b></button>)}</aside>
      <div className="outfit-board-shell">
        <div className="outfit-board" ref={stage} onDragOver={(event) => event.preventDefault()} onDrop={drop} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          <div className="board-title"><span>MUSE OUTFIT CARD</span><strong>{name || "UNTITLED LOOK"}</strong><small>{occasion} · {new Date().toLocaleDateString("zh-CN")}</small></div>
          {!layout.length && <div className="board-empty"><span>✦</span><strong>把一件衣服拖到这里</strong><small>手机端可直接点击左侧单品添加</small></div>}
          {layout.map((item) => {
            const garment = garments.find((entry) => entry.id === item.garmentId);
            if (!garment) return null;
            return <button
              aria-label={`移动 ${garment.name}`}
              className={`canvas-piece${selectedId === item.garmentId ? " is-selected" : ""}`}
              key={item.garmentId}
              onPointerDown={(event) => pointerDown(event, item)}
              onKeyDown={(event) => {
                const delta = event.shiftKey ? 5 : 1;
                let fields: Partial<CanvasPlacement> | null = null;
                if (event.key === "ArrowLeft") fields = { x: Math.max(3, item.x - delta) };
                else if (event.key === "ArrowRight") fields = { x: Math.min(97, item.x + delta) };
                else if (event.key === "ArrowUp") fields = { y: Math.max(4, item.y - delta) };
                else if (event.key === "ArrowDown") fields = { y: Math.min(96, item.y + delta) };
                else return;
                setSelectedId(item.garmentId);
                setLayout((current) => current.map((entry) => entry.garmentId === item.garmentId ? { ...entry, ...fields } : entry));
                event.preventDefault();
              }}
              style={{ left: `${item.x}%`, top: `${item.y}%`, zIndex: item.z, transform: `translate(-50%, -50%) rotate(${item.rotation}deg) scale(${item.scale})` }}
            ><GarmentTile garment={garment} /><i>{garment.name}</i></button>;
          })}
          <div className="board-footer"><span>YOUR REAL CLOSET</span><b>{layout.length} PIECES</b></div>
        </div>
        <div className="canvas-controls">
          {selected ? <><span>当前单品</span><strong>{garments.find((item) => item.id === selectedId)?.name}</strong><label>缩放<input type="range" min="0.3" max="2.2" step="0.05" value={selected.scale} onChange={(event) => update({ scale: Number(event.target.value) })} /></label><label>旋转<input type="range" min="-180" max="180" step="3" value={selected.rotation} onChange={(event) => update({ rotation: Number(event.target.value) })} /></label><button onClick={() => update({ z: Math.max(1, selected.z - 1) })}>下移一层</button><button onClick={() => update({ z: Math.max(...layout.map((item) => item.z)) + 1 })}>置于顶层</button><button className="danger-link" onClick={() => { setLayout((current) => current.filter((item) => item.garmentId !== selectedId)); setSelectedId(null); }}>移出画布</button></> : <p>选择画布中的单品后可调整大小、角度和层级。</p>}
        </div>
      </div>
    </div>
    <div className="saved-card-section"><div className="section-heading"><div><p className="eyebrow">SAVED CREATIONS</p><h2>我的 Outfit Cards</h2></div><span>{cards.length} 张</span></div><div className="saved-card-grid">{cards.map((card) => <article key={card.id}>{card.previewUrl ? <img src={card.previewUrl} alt={card.name} /> : <div className="saved-card-fallback">{card.layout.map((item) => <i key={item.garmentId} style={{ left: `${item.x}%`, top: `${item.y}%`, zIndex: item.z }} />)}</div>}<div><span><strong>{card.name}</strong><small>{card.occasion} · {card.itemIds.length} 件</small></span><button onClick={() => onDelete(card)}>删除</button></div></article>)}{!cards.length && <p className="empty-copy">第一张保存的搭配卡会出现在这里，也会进入单品关系网络。</p>}</div></div>
  </section>;
}

export function GarmentRelationSheet({ relation, loading, onClose, onUseLook }: { relation: GarmentRelation | null; loading: boolean; onClose: () => void; onUseLook: (outfit: Outfit) => void }) {
  if (!relation && !loading) return null;
  return <div className="relation-overlay"><button className="relation-backdrop" aria-label="关闭单品关系网络" onClick={onClose} /><aside className="relation-sheet" role="dialog" aria-modal="true" aria-label="单品关系网络">
    <button className="sheet-close" onClick={onClose}>×</button>
    {loading || !relation ? <div className="relation-loading">正在计算单品关系与新搭法…</div> : <>
      <header><GarmentTile garment={relation.garment} /><div><p className="eyebrow">GARMENT RELATIONSHIP</p><h2>{relation.garment.name}</h2><p>{relation.garment.category} · {relation.garment.color} · 已穿 {relation.garment.wearCount} 次</p><span>最近穿着：{relation.lastWornAt || "尚无记录"}</span></div></header>
      <section><h3>最适合一起穿</h3><div className="relation-network"><div className="relation-center">{categoryGlyphs[relation.garment.category]}<small>当前单品</small></div>{relation.companions.slice(0, 5).map(({ garment, count, score }, index) => <div className={`relation-node node-${index + 1}`} key={garment.id}><GarmentTile garment={garment} compact /><span>{garment.name}<small>{count ? `共同出现 ${count} 次` : `关系分 ${score}`}</small></span></div>)}</div></section>
      <section className="relation-meta"><div><h3>出现在哪些搭配</h3>{relation.outfits.slice(0, 6).map((outfit) => <p key={outfit.id}><strong>{outfit.name}</strong><span>{outfit.occasion} · {outfit.itemIds.length} 件</span></p>)}{!relation.outfits.length && <p>还没有保存搭配，自由画布是建立关系的最快方式。</p>}</div><div><h3>常用场合</h3><div className="occasion-cloud">{relation.occasions.map((item) => <span key={item.label}>{item.label}<b>{item.count}</b></span>)}</div></div></section>
      <section><h3>AI 推荐的三个新搭法</h3><div className="relation-looks">{relation.suggestedLooks.map((outfit) => <article key={outfit.id}><div>{outfit.itemIds.map((id) => relation.garment.id === id ? <GarmentTile garment={relation.garment} compact key={id} /> : relation.companions.find((item) => item.garment.id === id) ? <GarmentTile garment={relation.companions.find((item) => item.garment.id === id)!.garment} compact key={id} /> : null)}</div><strong>{outfit.name}</strong><p>{outfit.reason}</p><button onClick={() => onUseLook(outfit)}>拿去继续编辑</button></article>)}</div></section>
    </>}
  </aside></div>;
}

async function quickShoppingTryOn(person: File, productUrl: string, category: GarmentCategory) {
  const canvas = document.createElement("canvas");
  const personImage = await createImageBitmap(person);
  const productImage = await loadImage(productUrl);
  canvas.width = Math.min(1100, personImage.width);
  canvas.height = Math.round(canvas.width * personImage.height / personImage.width);
  const context = canvas.getContext("2d")!;
  context.drawImage(personImage, 0, 0, canvas.width, canvas.height);
  const width = canvas.width * (category === "外套" ? 0.56 : category === "连衣裙" ? 0.5 : 0.44);
  const height = width * (category === "连衣裙" ? 1.55 : category === "下装" ? 1.25 : 1.05);
  const top = category === "下装" || category === "鞋履" ? canvas.height * 0.48 : canvas.height * 0.2;
  context.globalAlpha = 0.9;
  context.drawImage(productImage, (canvas.width - width) / 2, top, width, height);
  personImage.close(); productImage.close();
  return canvas.toDataURL("image/jpeg", 0.9);
}

export function ShoppingAdvisor({ assessments, busy, onAnalyze }: { assessments: ShoppingAssessment[]; busy: boolean; onAnalyze: (file: File, fields: { name: string; category: GarmentCategory; color: string; styleTags: string[]; brand: string; price: string }) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fields, setFields] = useState({ name: "", category: "上装" as GarmentCategory, color: "", styleTags: "简约、通勤", brand: "", price: "" });
  const [person, setPerson] = useState<File | null>(null);
  const [tryOn, setTryOn] = useState<string | null>(null);
  const current = assessments[0];
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    if (!next) return;
    setFile(next); setPreview(URL.createObjectURL(next)); setTryOn(null);
  }
  return <section className="shopping-advisor">
    <header className="p1-page-hero"><div><p className="eyebrow">BEFORE YOU BUY</p><h1>“买不买”购物助手</h1><p>先和你的真实衣柜、偏好与身体档案做一次交叉检查，再决定买、不买，还是降价再买。</p></div></header>
    <div className="shopping-workspace">
      <div className="shopping-upload"><label className={preview ? "has-image" : ""}>{preview ? <img src={preview} alt="候选商品" /> : <><span>＋</span><strong>上传商场实拍或电商截图</strong><small>商品图、试衣间照片、详情页截图均可</small></>}<input type="file" accept="image/*" onChange={choose} /></label><div className="shopping-fields"><input placeholder="商品名称（可选）" value={fields.name} onChange={(event) => setFields({ ...fields, name: event.target.value })} /><div><select value={fields.category} onChange={(event) => setFields({ ...fields, category: event.target.value as GarmentCategory })}>{["上装", "下装", "连衣裙", "外套", "鞋履", "配饰"].map((item) => <option key={item}>{item}</option>)}</select><input placeholder="颜色" value={fields.color} onChange={(event) => setFields({ ...fields, color: event.target.value })} /></div><div><input placeholder="品牌" value={fields.brand} onChange={(event) => setFields({ ...fields, brand: event.target.value })} /><input type="number" min="0" placeholder="价格" value={fields.price} onChange={(event) => setFields({ ...fields, price: event.target.value })} /></div><input placeholder="风格标签，用、分隔" value={fields.styleTags} onChange={(event) => setFields({ ...fields, styleTags: event.target.value })} /><button className="primary-button" disabled={!file || busy} onClick={() => file && onAnalyze(file, { ...fields, styleTags: fields.styleTags.split(/[、,，]/).filter(Boolean) })}>{busy ? "正在与整个衣柜比较…" : "开始购买前分析"}</button></div></div>
      <div className="shopping-result">{current ? <><div className={`buy-verdict decision-${current.decision}`}><span>建议</span><strong>{current.decision}</strong><b>{current.score}</b><small>综合购买价值</small></div><div className="shopping-score-grid"><article><span>可组成搭配</span><strong>{current.outfitPotential}<small> 套</small></strong></article><article><span>偏好匹配</span><strong>{current.preferenceFit}<small>%</small></strong></article><article><span>身材适配</span><strong>{current.bodyFit}<small>%</small></strong></article><article><span>推荐尺码</span><strong>{current.recommendedSize}</strong></article></div><ul>{current.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p className="size-note">{current.sizeReason}</p><div className="shopping-alternatives"><h3>衣柜中的替代品</h3>{current.alternatives.length ? current.alternatives.map((item) => <div key={item.id}><GarmentTile garment={item} compact /><span><strong>{item.name}</strong><small>已穿 {item.wearCount} 次 · {item.color}</small></span></div>) : <p>没有明显替代品，这件衣服能补充新的组合方向。</p>}</div></> : <div className="shopping-empty-result"><span>?</span><h2>这件衣服值得进入你的衣柜吗？</h2><p>上传后会同时检查重复度、搭配数量、偏好、身体档案和已有替代品。</p></div>}</div>
    </div>
    {current?.imageUrl && <section className="shopping-tryon"><div><p className="eyebrow">PRE-PURCHASE TRY-ON</p><h2>购买前快速试穿</h2><p>{current.tryOnNote}</p><label>{person ? person.name : "上传一张全身照"}<input type="file" accept="image/*" onChange={(event) => { const next = event.target.files?.[0]; if (next) { setPerson(next); setTryOn(null); } }} /></label><button className="primary-button" disabled={!person} onClick={() => person && void quickShoppingTryOn(person, current.imageUrl!, current.candidate.category).then(setTryOn)}>生成二维效果</button></div><div>{tryOn ? <img src={tryOn} alt="购买前试穿效果" /> : <span>试穿效果会显示在这里</span>}</div></section>}
    {assessments.length > 1 && <section className="shopping-history"><div className="section-heading"><div><p className="eyebrow">DECISION HISTORY</p><h2>最近购物判断</h2></div></div><div>{assessments.slice(1, 7).map((item) => <article key={item.id}>{item.imageUrl && <img src={item.imageUrl} alt={item.candidate.name} />}<span><b>{item.decision}</b><strong>{item.candidate.name}</strong><small>{item.outfitPotential} 套潜力 · {item.score} 分</small></span></article>)}</div></section>}
  </section>;
}

export function WeatherReminderCenter({ preferences, forecast, plans, alerts, onLocate, onPermission, onUpdate }: { preferences: ReminderPreferences | null; forecast: WeatherDay[]; plans: OutfitPlan[]; alerts: string[]; onLocate: () => void; onPermission: () => void; onUpdate: (patch: Partial<ReminderPreferences>) => void }) {
  const tomorrow = forecast[1];
  const tomorrowPlan = plans.find((plan) => plan.planDate === tomorrow?.date);
  return <section className="reminder-center"><div className="reminder-main"><span className="reminder-icon">◉</span><div><p className="eyebrow">LIVE WEATHER & REMINDERS</p><h2>{preferences?.locationLabel || "自动天气与提醒"}</h2><p>{tomorrow ? `明天 ${tomorrow.label}，${tomorrow.temperatureMin}—${tomorrow.temperatureMax}°C${tomorrowPlan ? `；已安排「${tomorrowPlan.name}」` : "；还没有安排搭配"}。` : "允许定位后，Muse 会按实际天气重排。"}</p><div>{alerts.map((alert) => <span key={alert}>{alert}</span>)}</div></div><button onClick={onLocate}>⌖ 自动定位</button></div>{preferences && <div className="reminder-settings"><div className="reminder-option"><input aria-label="开启前一晚提醒" type="checkbox" checked={preferences.eveningEnabled} onChange={(event) => onUpdate({ eveningEnabled: event.target.checked })} /><span><strong>前一晚提醒</strong><small>浏览器开启时在 <input aria-label="前一晚提醒时间" type="time" value={preferences.eveningTime} onChange={(event) => onUpdate({ eveningTime: event.target.value })} /> 推送明日搭配</small></span></div><div className="reminder-option"><input aria-label="开启天气变化提醒" type="checkbox" checked={preferences.weatherAlerts} onChange={(event) => onUpdate({ weatherAlerts: event.target.checked })} /><span><strong>天气变化提醒</strong><small>降温、下雨时提醒替换外套或鞋子</small></span></div><div className="reminder-option"><input aria-label="开启早晨自动重排" type="checkbox" checked={preferences.morningRerank} onChange={(event) => onUpdate({ morningRerank: event.target.checked })} /><span><strong>早晨自动重排</strong><small>根据当天实际天气重新排序三套推荐</small></span></div><button onClick={onPermission}>{preferences.notificationPermission === "granted" ? "✓ 浏览器通知已开启" : "开启浏览器通知"}</button></div>}</section>;
}

export function OutfitDiary({ entries, insights, plans, sessions, garments, busy, onSubmit }: { entries: DiaryEntry[]; insights: DiaryInsights | null; plans: OutfitPlan[]; sessions: TryOnHistorySession[]; garments: Garment[]; busy: boolean; onSubmit: (form: FormData) => void }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [planId, setPlanId] = useState("");
  const [tryonId, setTryonId] = useState("");
  const [fit, setFit] = useState("合身");
  const [comfort, setComfort] = useState(4);
  const [compliments, setCompliments] = useState(0);
  const [caption, setCaption] = useState("");
  const [difference, setDifference] = useState("");
  const plan = plans.find((item) => item.id === planId);
  const fitTop = useMemo(() => insights ? [...insights.fitSignals].sort((a, b) => b.count - a.count)[0] : undefined, [insights]);
  function choose(event: ChangeEvent<HTMLInputElement>) { const next = event.target.files?.[0]; if (next) { setPhoto(next); setPreview(URL.createObjectURL(next)); } }
  function submit() {
    if (!photo) return;
    const form = new FormData();
    form.set("photo", photo); form.set("planId", planId); form.set("tryonSessionId", tryonId);
    form.set("itemIds", JSON.stringify(plan?.itemIds ?? [])); form.set("fitFeedback", fit);
    form.set("comfortRating", String(comfort)); form.set("compliments", String(compliments));
    form.set("caption", caption); form.set("differenceNotes", difference); onSubmit(form);
  }
  return <section className="diary-page"><header className="p1-page-hero"><div><p className="eyebrow">REAL-WORLD OUTFIT MEMORY</p><h1>真人穿搭日记</h1><p>把计划、虚拟试穿和镜子里的真实效果连起来，让 Muse 学习你真正会穿、舒服且获得好评的搭配。</p></div></header>
    <div className="diary-insights"><article><span>真人记录</span><strong>{insights?.totalEntries ?? 0}</strong><small>篇穿搭日记</small></article><article><span>偏好松紧度</span><strong>{fitTop?.label ?? "待学习"}</strong><small>{fitTop ? `${fitTop.count} 次真实信号` : "上传后开始学习"}</small></article><article><span>平均舒适度</span><strong>{insights?.averageComfort || "—"}</strong><small>/ 5</small></article><article><span>理论合适但未穿</span><strong>{insights?.plannedNeverWorn ?? 0}</strong><small>套过期计划</small></article><article><span>真人好评</span><strong>{insights?.totalCompliments ?? 0}</strong><small>{insights?.topComplimentLook || "等待反馈"}</small></article></div>
    <div className="diary-compose"><label className={preview ? "diary-photo has-image" : "diary-photo"}>{preview ? <img src={preview} alt="镜子自拍预览" /> : <><span>＋</span><strong>上传今天的镜子自拍</strong><small>正面或自然站姿，记录真实穿着效果</small></>}<input type="file" accept="image/*" onChange={choose} /></label><div className="diary-form"><label>关联计划<select value={planId} onChange={(event) => setPlanId(event.target.value)}><option value="">不关联计划</option>{plans.slice(0, 30).map((item) => <option value={item.id} key={item.id}>{item.planDate} · {item.name}</option>)}</select></label><label>关联虚拟试穿<select value={tryonId} onChange={(event) => setTryonId(event.target.value)}><option value="">没有对比</option>{sessions.filter((item) => item.status === "ready").map((item) => <option value={item.id} key={item.id}>{new Date(item.createdAt).toLocaleDateString("zh-CN")} · {item.itemIds.map((id) => garments.find((g) => g.id === id)?.name).filter(Boolean).join("＋") || "试穿结果"}</option>)}</select></label><div className="diary-fit"><span>实际松紧度</span>{["偏松", "合身", "偏紧"].map((item) => <button className={fit === item ? "is-active" : ""} onClick={() => setFit(item)} key={item}>{item}</button>)}</div><label>舒适度 <b>{comfort}/5</b><input type="range" min="1" max="5" value={comfort} onChange={(event) => setComfort(Number(event.target.value))} /></label><label>收到的好评次数<input type="number" min="0" max="99" value={compliments} onChange={(event) => setCompliments(Number(event.target.value))} /></label><textarea placeholder="今天穿着时发生了什么？" value={caption} onChange={(event) => setCaption(event.target.value)} /><textarea placeholder="和虚拟试穿或计划相比，哪里不同？" value={difference} onChange={(event) => setDifference(event.target.value)} /><button className="primary-button" disabled={!photo || busy} onClick={submit}>{busy ? "正在写入真实偏好…" : "保存真人穿搭日记"}</button></div></div>
    {insights && <div className="diary-learning"><span>✦</span><div><h3>Muse 正在学到</h3>{insights.learningSummary.map((item) => <p key={item}>{item}</p>)}</div></div>}
    <div className="diary-timeline">{entries.map((entry) => <article key={entry.id}>{entry.photoUrl ? <img src={entry.photoUrl} alt={entry.caption || "真人穿搭日记"} /> : <span>PHOTO</span>}<div><p className="eyebrow">{new Date(entry.createdAt).toLocaleDateString("zh-CN")}</p><h3>{entry.planName || entry.caption || "今日真实穿搭"}</h3><div><span>{entry.fitFeedback}</span><span>舒适 {entry.comfortRating}/5</span><span>好评 {entry.compliments}</span>{entry.tryonSessionId && <span>已对比试穿</span>}</div><p>{entry.caption || "没有额外文字记录。"}</p><blockquote>{entry.aiNotes}</blockquote>{entry.differenceNotes && <small>与预期差异：{entry.differenceNotes}</small>}</div></article>)}{!entries.length && <p className="empty-copy">第一篇日记会建立“计划—真人效果—偏好学习”的连接。</p>}</div>
  </section>;
}
