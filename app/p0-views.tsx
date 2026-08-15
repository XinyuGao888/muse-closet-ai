"use client";

/* eslint-disable @next/next/no-img-element -- user-owned previews are served from private application routes. */

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { IntakeJob, IntakeQueueItem, OutfitPlan, TryOnHistorySession, WardrobeAnalytics, WeatherDay } from "@/lib/p0";
import { categoryColors, categoryGlyphs, type Garment, type Outfit } from "@/lib/wardrobe";

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateKey(date: Date) {
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, "0")}`;
}

function garmentThumb(garment: Garment) {
  return garment.imageUrl
    ? <img src={garment.imageUrl} alt="" />
    : <span style={{ background: categoryColors[garment.category] }}>{categoryGlyphs[garment.category]}</span>;
}

export function CalendarPlanner({
  garments, outfits, plans, forecast, planning, onPlanWeek, onSchedule, onWear, onDelete,
}: {
  garments: Garment[];
  outfits: Outfit[];
  plans: OutfitPlan[];
  forecast: WeatherDay[];
  planning: boolean;
  onPlanWeek: () => void;
  onSchedule: (date: string, outfit: Outfit, weather?: WeatherDay) => void;
  onWear: (plan: OutfitPlan) => void;
  onDelete: (plan: OutfitPlan) => void;
}) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<Outfit | null>(null);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month, year]);
  const planByDate = new Map(plans.map((plan) => [plan.planDate, plan]));
  const weatherByDate = new Map(forecast.map((day) => [day.date, day]));

  function drop(event: DragEvent, date: string) {
    event.preventDefault();
    try {
      const outfit = JSON.parse(event.dataTransfer.getData("application/muse-outfit")) as Outfit;
      onSchedule(date, outfit, weatherByDate.get(date));
    } catch { /* ignores unrelated drag payloads */ }
  }
  function assign(date: string) {
    if (!selected) return;
    onSchedule(date, selected, weatherByDate.get(date));
    setSelected(null);
  }
  return (
    <div className="calendar-workspace">
      <section className="calendar-main">
        <header className="calendar-toolbar">
          <div><p className="eyebrow">DAILY OUTFIT SYSTEM</p><h1>穿搭日历</h1><p>把喜欢的搭配拖到日期，或让 Muse 一次安排下周五天。</p></div>
          <div className="calendar-toolbar__actions">
            <button className="calendar-nav" onClick={() => setCursor(new Date(year, month - 1, 1))}>←</button>
            <strong>{year} 年 {month + 1} 月</strong>
            <button className="calendar-nav" onClick={() => setCursor(new Date(year, month + 1, 1))}>→</button>
            <button className="primary-button" disabled={planning} onClick={onPlanWeek}>{planning ? "正在安排天气与搭配…" : "✦ 帮我安排下周一到周五"}</button>
          </div>
        </header>
        {selected && <div className="calendar-mobile-hint">已选择「{selected.name}」，点击一个日期完成安排。<button onClick={() => setSelected(null)}>取消</button></div>}
        <div className="calendar-weekdays">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>周{day}</span>)}</div>
        <div className="calendar-grid">
          {cells.map((date) => {
            const key = dateKey(date);
            const plan = planByDate.get(key);
            const weather = weatherByDate.get(key);
            const items = plan?.itemIds.map((id) => garments.find((item) => item.id === id)).filter((item): item is Garment => Boolean(item)) ?? [];
            const outside = date.getMonth() !== month;
            const today = key === dateKey(new Date());
            return (
              <div
                aria-label={`${key}${plan ? `，已安排${plan.name}` : "，未安排搭配"}`}
                className={`calendar-day${outside ? " is-outside" : ""}${today ? " is-today" : ""}${plan ? " has-plan" : ""}`}
                key={key}
                role="button"
                tabIndex={0}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => drop(event, key)}
                onClick={() => assign(key)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    assign(key);
                  }
                }}
              >
                <div className="calendar-day__meta"><b>{date.getDate()}</b>{weather && <span>{weather.label} {weather.temperatureMax}°</span>}</div>
                {plan ? <div className="calendar-look">
                  <div className="calendar-look__thumbs">{items.slice(0, 4).map((item) => <i key={item.id}>{garmentThumb(item)}</i>)}</div>
                  <strong>{plan.name}</strong><small>{plan.occasion} · {Math.round(plan.temperature)}°C</small>
                  <div className="calendar-look__actions">
                    <button className={plan.status === "worn" ? "is-done" : ""} onClick={(event) => { event.stopPropagation(); onWear(plan); }}>{plan.status === "worn" ? "✓ 已穿" : "今天穿"}</button>
                    <button onClick={(event) => { event.stopPropagation(); onDelete(plan); }}>×</button>
                  </div>
                </div> : <span className="calendar-drop-hint">拖入搭配</span>}
              </div>
            );
          })}
        </div>
      </section>
      <aside className="calendar-outfits">
        <div><p className="eyebrow">DRAG TO PLAN</p><h2>待安排搭配</h2><p>电脑端可拖动；手机端点击搭配后再点击日期。</p></div>
        {outfits.map((outfit) => {
          const items = outfit.itemIds.map((id) => garments.find((item) => item.id === id)).filter((item): item is Garment => Boolean(item));
          return <button className={selected?.id === outfit.id ? "is-selected" : ""} draggable onDragStart={(event) => event.dataTransfer.setData("application/muse-outfit", JSON.stringify(outfit))} onClick={() => setSelected(outfit)} key={outfit.id}>
            <span className="calendar-outfit-thumbs">{items.slice(0, 4).map((item) => <i key={item.id}>{garmentThumb(item)}</i>)}</span>
            <span><strong>{outfit.name}</strong><small>{outfit.occasion} · {outfit.score}% 合拍</small></span><b>⠿</b>
          </button>;
        })}
      </aside>
    </div>
  );
}

export function BatchIntakeCenter({ jobs, busy, onFiles, onApprove, onRegenerate, onUpdate }: {
  jobs: IntakeJob[];
  busy: boolean;
  onFiles: (files: File[]) => void;
  onApprove: (ids: string[]) => void;
  onRegenerate: (id: string) => void;
  onUpdate: (id: string, fields: { selectedCover?: string; draft?: Partial<IntakeQueueItem["draft"]> }) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const current = jobs[0];
  const pending = current?.items.filter((item) => item.status !== "completed") ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])].slice(0, 20);
    if (files.length) onFiles(files);
    event.target.value = "";
  }
  const effectiveSelection = selected.filter((id) => pending.some((item) => item.id === id));
  return <section className="batch-center">
    <div className="batch-hero">
      <div><p className="eyebrow">BATCH INTAKE QUEUE</p><h2>批量建档与任务审核</h2><p>一次选择最多 20 张；系统保留原图和抠图，支持单件复核与批量确认。</p></div>
      <button className="primary-button" disabled={busy} onClick={() => input.current?.click()}>{busy ? "正在识别与拆分…" : "＋ 选择多张照片"}</button>
      <input ref={input} hidden multiple type="file" accept="image/*" onChange={chooseFiles} />
    </div>
    {!current ? <button className="batch-empty" onClick={() => input.current?.click()}><span>＋</span><strong>开始第一次批量建档</strong><small>支持一次上传十几张照片；配置多衣物分割服务后，一张照片也能拆成多个候选单品。</small></button> : <>
      <div className="batch-summary"><span><b>{current.totalItems}</b> 个候选</span><span><b>{current.items.filter((item) => item.status === "pending").length}</b> 待确认</span><span><b>{current.completedItems}</b> 已入柜</span><div><button onClick={() => setSelected(pending.map((item) => item.id))}>全选待确认</button><button className="primary-button" disabled={!effectiveSelection.length || busy} onClick={() => onApprove(effectiveSelection)}>批量确认 {effectiveSelection.length || ""}</button></div></div>
      <div className="batch-grid">{current.items.map((item) => {
        const preview = item.selectedCover === "original" ? item.originalUrl : item.selectedCover === "product" ? item.productImageUrl : item.cutoutUrl ?? item.originalUrl;
        return <article className={`batch-item status-${item.status}`} key={item.id}>
          <div className="batch-item__preview">{preview ? <img src={preview} alt={item.draft.name} /> : <span>▦</span>}<label><input type="checkbox" checked={selected.includes(item.id)} disabled={item.status === "completed"} onChange={(event) => setSelected((currentIds) => event.target.checked ? [...new Set([...currentIds, item.id])] : currentIds.filter((id) => id !== item.id))} /><i /><span className="sr-only">选择 {item.draft.name}</span></label><em>{({ processing: "处理中", pending: "等待确认", failed: "识别失败", completed: "已完成" } as const)[item.status]}</em></div>
          <div className="batch-item__body">
            <input className="batch-name" defaultValue={item.draft.name} disabled={item.status === "completed"} onBlur={(event) => { if (event.target.value !== item.draft.name) onUpdate(item.id, { draft: { name: event.target.value } }); }} />
            <div className="batch-fields"><select value={item.draft.category} disabled={item.status === "completed"} onChange={(event) => onUpdate(item.id, { draft: { category: event.target.value as Garment["category"] } })}>{["上装", "下装", "连衣裙", "外套", "鞋履", "配饰"].map((value) => <option key={value}>{value}</option>)}</select><span>{item.draft.color}</span><span>AI {Math.round(item.draft.confidence * 100)}%</span></div>
            <div className="cover-choice"><small>封面</small>{item.originalUrl && <button className={item.selectedCover === "original" ? "is-active" : ""} onClick={() => onUpdate(item.id, { selectedCover: "original" })}>原图</button>}{item.cutoutUrl && <button className={item.selectedCover === "cutout" ? "is-active" : ""} onClick={() => onUpdate(item.id, { selectedCover: "cutout" })}>抠图</button>}{item.productImageUrl && <button className={item.selectedCover === "product" ? "is-active" : ""} onClick={() => onUpdate(item.id, { selectedCover: "product" })}>商品图</button>}</div>
            {item.status !== "completed" && <div className="batch-actions"><button onClick={() => onRegenerate(item.id)}>↻ 重新识别</button><button className="primary-button" onClick={() => onApprove([item.id])}>确认入柜</button></div>}
          </div>
        </article>;
      })}</div>
    </>}
  </section>;
}

export function TryOnHistory({ sessions, garments, onFavorite, onRetry }: {
  sessions: TryOnHistorySession[];
  garments: Garment[];
  onFavorite: (session: TryOnHistorySession) => void;
  onRetry: (session: TryOnHistorySession) => void;
}) {
  const ready = sessions.filter((session) => session.status === "ready" && session.resultUrl);
  const [leftId, setLeftId] = useState(ready[0]?.id ?? "");
  const [rightId, setRightId] = useState(ready[1]?.id ?? ready[0]?.id ?? "");
  const [split, setSplit] = useState(50);
  const left = ready.find((session) => session.id === leftId) ?? ready[0];
  const right = ready.find((session) => session.id === rightId) ?? ready[1] ?? ready[0];
  return <section className="tryon-history">
    <div className="section-heading"><div><p className="eyebrow">TRY-ON ARCHIVE</p><h2>最近试穿与结果对比</h2></div><span>{sessions.length} 次生成</span></div>
    {ready.length > 0 && <div className="compare-studio">
      <div className="compare-controls"><label>结果 A<select value={left?.id} onChange={(event) => setLeftId(event.target.value)}>{ready.map((session, index) => <option value={session.id} key={session.id}>试穿 {ready.length - index} · {new Date(session.createdAt).toLocaleDateString("zh-CN")}</option>)}</select></label><label>结果 B<select value={right?.id} onChange={(event) => setRightId(event.target.value)}>{ready.map((session, index) => <option value={session.id} key={session.id}>试穿 {ready.length - index} · {new Date(session.createdAt).toLocaleDateString("zh-CN")}</option>)}</select></label>{ready.length > 1 && <button onClick={() => { setLeftId(ready[1].id); setRightId(ready[0].id); }}>与上一次相比</button>}</div>
      <div className="compare-stage">{left?.resultUrl && <img src={left.resultUrl} alt="试穿结果 A" />}{right?.resultUrl && <img className="compare-top" style={{ clipPath: `inset(0 0 0 ${split}%)` }} src={right.resultUrl} alt="试穿结果 B" />}<i style={{ left: `${split}%` }}><span>↔</span></i></div>
      <label className="compare-slider"><span>A</span><input type="range" min="0" max="100" value={split} onChange={(event) => setSplit(Number(event.target.value))} /><span>B</span></label>
    </div>}
    <div className="history-strip">{sessions.map((session) => {
      const names = session.itemIds.map((id) => garments.find((item) => item.id === id)?.name).filter(Boolean);
      return <article key={session.id}>
        <div className="history-image">{session.resultUrl ? <img src={session.resultUrl} alt="历史试穿" /> : <span>{session.status === "failed" ? "!" : `${session.progress}%`}</span>}{session.status === "processing" && <i style={{ width: `${session.progress}%` }} />}</div>
        <div><small>{session.status === "ready" ? "生成完成" : session.status === "failed" ? "生成失败" : `正在生成 ${session.progress}%`}</small><strong>{names.join("＋") || "组合试穿"}</strong><p>{session.errorMessage || new Date(session.createdAt).toLocaleString("zh-CN")}</p></div>
        <div className="history-actions"><button className={session.favorite ? "is-active" : ""} onClick={() => onFavorite(session)}>{session.favorite ? "♥ 最终造型" : "♡ 收藏"}</button><button onClick={() => onRetry(session)}>↻ {session.status === "failed" ? "重试" : "重新生成"}</button>{session.resultUrl && <button onClick={() => { setLeftId(session.id); setRightId(ready.find((item) => item.id !== session.id)?.id ?? session.id); }}>对比</button>}</div>
      </article>;
    })}</div>
  </section>;
}

function BarList({ title, items, total }: { title: string; items: Array<{ label: string; value: number; color?: string }>; total: number }) {
  return <article className="analytics-panel"><h3>{title}</h3><div className="analytics-bars">{items.slice(0, 7).map((item) => <div key={item.label}><span><i style={{ background: item.color || "#6f8178" }} />{item.label}</span><b>{item.value}</b><em><i style={{ width: `${Math.round((item.value / Math.max(1, total)) * 100)}%`, background: item.color || "#6f8178" }} /></em></div>)}</div></article>;
}

export function WardrobeAnalyticsDashboard({ analytics }: { analytics: WardrobeAnalytics | null }) {
  const [inactiveDays, setInactiveDays] = useState<30 | 60 | 90>(90);
  if (!analytics) return <div className="loading-grid">正在计算衣柜使用率和组合关系…</div>;
  const inactive = inactiveDays === 30 ? analytics.inactive.days30 : inactiveDays === 60 ? analytics.inactive.days60 : analytics.inactive.days90;
  return <div className="analytics-dashboard">
    <div className="analytics-kpis"><article><span>衣柜利用率</span><strong>{analytics.utilization}%</strong><small>{analytics.totalItems} 件衣物 · {analytics.totalWears} 次穿着</small></article><article><span>目前可穿</span><strong>{analytics.availableCount}</strong><small>{analytics.unavailableCount} 件正在清洗、借出或维修</small></article><article><span>高频英雄单品</span><strong>{analytics.mostWorn[0]?.wearCount ?? 0}×</strong><small>{analytics.mostWorn[0]?.name ?? "暂无记录"}</small></article><article><span>低组合单品</span><strong>{analytics.isolatedItems.length}</strong><small>需要重新搭配或评估去留</small></article></div>
    <div className="analytics-distributions"><BarList title="颜色分布" items={analytics.colors} total={analytics.totalItems} /><BarList title="品类结构" items={analytics.categories} total={analytics.totalItems} /><BarList title="季节覆盖" items={analytics.seasons} total={analytics.totalItems} /></div>
    <div className="analytics-lists">
      <article className="analytics-panel"><header><h3>长期未穿</h3><div>{([30, 60, 90] as const).map((days) => <button className={inactiveDays === days ? "is-active" : ""} onClick={() => setInactiveDays(days)} key={days}>{days} 天</button>)}</div></header><div className="ranked-garments">{inactive.slice(0, 5).map((item) => <div key={item.id}>{garmentThumb(item)}<span><strong>{item.name}</strong><small>已穿 {item.wearCount} 次 · {item.lastWornAt ? `最后穿于 ${item.lastWornAt}` : "尚无穿着日期"}</small></span></div>)}{!inactive.length && <p>这个时间范围内没有闲置衣物。</p>}</div></article>
      <article className="analytics-panel"><h3>搭配参与度</h3><div className="participation-list">{analytics.outfitParticipation.slice(0, 6).map(({ garment, count }, index) => <div key={garment.id}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{garment.name}</strong><small>进入 {count} 套已生成或保存的搭配</small></span><em>{count}</em></div>)}</div></article>
      <article className="analytics-panel analytics-gaps"><h3>衣柜缺口建议</h3>{analytics.missingBasics.map((item) => <div key={item.title}><span style={{ background: categoryColors[item.category] }}>{categoryGlyphs[item.category]}</span><p><strong>{item.title}</strong><small>{item.reason}</small></p></div>)}</article>
    </div>
  </div>;
}
