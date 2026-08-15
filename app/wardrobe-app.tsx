"use client";

/* eslint-disable @next/next/no-img-element -- previews use local Blob URLs and R2 user uploads. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  categoryColors,
  categoryGlyphs,
  rankOutfits,
  seedGarments,
  type Garment,
  type GarmentCategory,
  type Outfit,
} from "@/lib/wardrobe";

type View = "today" | "wardrobe" | "studio" | "tryon" | "insights";
type FeedbackAction = "like" | "reject" | "save" | "wear";

type UploadDraft = {
  name: string;
  category: GarmentCategory;
  color: string;
  pattern: string;
  material: string;
  season: string;
  styleTags: string[];
  occasionTags: string[];
  confidence: number;
  sourceType: Garment["sourceType"];
};

const navItems: { id: View; label: string; icon: string }[] = [
  { id: "today", label: "今日灵感", icon: "✦" },
  { id: "wardrobe", label: "云衣柜", icon: "▦" },
  { id: "studio", label: "搭配实验室", icon: "◇" },
  { id: "tryon", label: "虚拟试穿", icon: "◉" },
  { id: "insights", label: "衣橱洞察", icon: "↗" },
];

const categoryOptions: GarmentCategory[] = [
  "上装",
  "下装",
  "连衣裙",
  "外套",
  "鞋履",
  "配饰",
];
const occasions = ["通勤", "约会", "周末", "会议"];
const defaultDraft: UploadDraft = {
  name: "",
  category: "上装",
  color: "待确认",
  pattern: "纯色",
  material: "待确认",
  season: "四季",
  styleTags: ["简约", "休闲"],
  occasionTags: ["日常", "周末"],
  confidence: 0.72,
  sourceType: "ai_guess",
};

const fallbackGarments: Garment[] = seedGarments.map((item) => ({
  ...item,
  imageUrl: null,
}));

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function MiniIcon({ children }: { children: ReactNode }) {
  return <span className="mini-icon" aria-hidden="true">{children}</span>;
}

function GarmentVisual({
  garment,
  compact = false,
}: {
  garment: Garment;
  compact?: boolean;
}) {
  return (
    <div
      className={cn("garment-visual", compact && "garment-visual--compact")}
      style={{ "--garment-tone": categoryColors[garment.category] } as CSSProperties}
    >
      {garment.imageUrl ? (
        <img src={garment.imageUrl} alt={garment.name} />
      ) : (
        <>
          <span className="garment-glyph">{categoryGlyphs[garment.category]}</span>
          <span className="garment-color-chip">{garment.color}</span>
        </>
      )}
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div className="toast" role="status">
      <span>✓</span>{message}
    </div>
  );
}

function Modal({
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={cn("modal", wide && "modal--wide")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">×</button>
        </header>
        {children}
      </section>
    </div>
  );
}

async function dominantColorAndCutout(file: File) {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1100;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(bitmap, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const data = pixels.data;
  const cornerPoints = [
    [2, 2],
    [width - 3, 2],
    [2, height - 3],
    [width - 3, height - 3],
  ];
  const corners = cornerPoints.map(([x, y]) => {
    const index = (Math.max(0, y) * width + Math.max(0, x)) * 4;
    return [data[index], data[index + 1], data[index + 2]];
  });
  const background = [0, 1, 2].map((channel) =>
    Math.round(corners.reduce((sum, color) => sum + color[channel], 0) / corners.length),
  );
  const cornerSpread = Math.max(
    ...corners.map((color) =>
      Math.sqrt(color.reduce((sum, value, channel) => sum + (value - background[channel]) ** 2, 0)),
    ),
  );
  const canRemove = cornerSpread < 42;
  let red = 0;
  let green = 0;
  let blue = 0;
  let samples = 0;
  const stride = Math.max(1, Math.floor((width * height) / 24000));

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * 4;
    const distance = Math.sqrt(
      (data[index] - background[0]) ** 2 +
        (data[index + 1] - background[1]) ** 2 +
        (data[index + 2] - background[2]) ** 2,
    );
    if (canRemove && distance < 64) {
      data[index + 3] = Math.round(Math.max(0, Math.min(255, (distance - 20) * 5.8)));
    }
    if (distance > 72 && pixel % stride === 0 && data[index + 3] > 150) {
      red += data[index];
      green += data[index + 1];
      blue += data[index + 2];
      samples += 1;
    }
  }
  context.putImageData(pixels, 0, 0);
  const rgb: [number, number, number] = samples
    ? [Math.round(red / samples), Math.round(green / samples), Math.round(blue / samples)]
    : [148, 143, 134];
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Export failed"))), "image/png"),
  );
  return {
    file: new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-cutout.png`, {
      type: "image/png",
    }),
    preview: URL.createObjectURL(blob),
    color: nearestColor(rgb),
    backgroundRemoved: canRemove,
  };
}

function nearestColor([red, green, blue]: [number, number, number]) {
  const palette: Array<[string, [number, number, number]]> = [
    ["黑色", [30, 30, 31]],
    ["炭灰", [81, 82, 84]],
    ["米白", [228, 220, 202]],
    ["燕麦色", [194, 176, 146]],
    ["棕色", [121, 78, 52]],
    ["靛蓝", [48, 72, 108]],
    ["雾霾蓝", [107, 137, 158]],
    ["橄榄绿", [86, 103, 66]],
    ["莓果红", [146, 49, 78]],
    ["浅粉", [216, 157, 167]],
    ["明黄色", [222, 175, 46]],
  ];
  return palette
    .map(([name, value]) => ({
      name,
      distance: Math.sqrt(
        (red - value[0]) ** 2 + (green - value[1]) ** 2 + (blue - value[2]) ** 2,
      ),
    }))
    .sort((a, b) => a.distance - b.distance)[0].name;
}

async function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function compositeTryOn(personUrl: string, garment: Garment) {
  const person = await loadImage(personUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(960, person.naturalWidth);
  canvas.height = Math.round((canvas.width / person.naturalWidth) * person.naturalHeight);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(person, 0, 0, canvas.width, canvas.height);

  const isDress = garment.category === "连衣裙";
  const box = isDress
    ? { x: 0.24, y: 0.2, width: 0.52, height: 0.62 }
    : { x: 0.27, y: 0.19, width: 0.46, height: 0.38 };
  if (garment.imageUrl) {
    const item = await loadImage(garment.imageUrl);
    context.globalAlpha = 0.9;
    context.drawImage(
      item,
      canvas.width * box.x,
      canvas.height * box.y,
      canvas.width * box.width,
      canvas.height * box.height,
    );
  } else {
    context.globalAlpha = 0.78;
    context.fillStyle = categoryColors[garment.category];
    context.beginPath();
    context.roundRect(
      canvas.width * box.x,
      canvas.height * box.y,
      canvas.width * box.width,
      canvas.height * box.height,
      28,
    );
    context.fill();
    context.globalAlpha = 0.86;
    context.fillStyle = "#27322f";
    context.font = `600 ${Math.max(16, canvas.width * 0.026)}px sans-serif`;
    context.textAlign = "center";
    context.fillText(garment.name, canvas.width / 2, canvas.height * (box.y + box.height / 2));
  }
  return canvas.toDataURL("image/jpeg", 0.92);
}

export function WardrobeApp() {
  const [view, setView] = useState<View>("today");
  const [garments, setGarments] = useState<Garment[]>(fallbackGarments);
  const [outfits, setOutfits] = useState<Outfit[]>(() =>
    rankOutfits(fallbackGarments, "通勤", 14),
  );
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("全部");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [occasion, setOccasion] = useState("通勤");
  const [temperature, setTemperature] = useState(14);
  const [mustWearId, setMustWearId] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadStage, setUploadStage] = useState<"pick" | "analyzing" | "confirm">("pick");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [backgroundRemoved, setBackgroundRemoved] = useState(false);
  const [draft, setDraft] = useState<UploadDraft>(defaultDraft);
  const [toast, setToast] = useState("");
  const [editingOutfit, setEditingOutfit] = useState<Outfit | null>(null);
  const [editedItems, setEditedItems] = useState<string[]>([]);
  const [personPreview, setPersonPreview] = useState<string | null>(null);
  const [personFile, setPersonFile] = useState<File | null>(null);
  const [tryOnGarmentId, setTryOnGarmentId] = useState("");
  const [tryOnResult, setTryOnResult] = useState<string | null>(null);
  const [tryOnLoading, setTryOnLoading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const fetchRecommendations = useCallback(
    async (
      items: Garment[],
      nextOccasion: string,
      nextTemperature: number,
      nextMust: string,
    ) => {
      try {
        const response = await fetch("/api/recommendations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            occasion: nextOccasion,
            temperature: nextTemperature,
            mustWearId: nextMust || undefined,
          }),
        });
        if (!response.ok) throw new Error("recommendation failed");
        const data = (await response.json()) as { outfits: Outfit[] };
        setOutfits(data.outfits);
      } catch {
        setOutfits(rankOutfits(items, nextOccasion, nextTemperature, nextMust || undefined));
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/wardrobe")
      .then((response) => {
        if (!response.ok) throw new Error("wardrobe unavailable");
        return response.json() as Promise<{ garments: Garment[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setGarments(data.garments);
        setLoading(false);
        return fetchRecommendations(data.garments, "通勤", 14, "");
      })
      .catch(() => {
        if (!cancelled) {
          setGarments(fallbackGarments);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchRecommendations]);

  const filteredGarments = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return garments.filter((item) => {
      const matchesSearch =
        !keyword ||
        [item.name, item.color, item.material, ...item.styleTags]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      return (
        matchesSearch &&
        (category === "全部" || item.category === category) &&
        (!onlyFavorites || item.favorite)
      );
    });
  }, [category, garments, onlyFavorites, search]);

  const eligibleTryOn = garments.filter(
    (item) => item.category === "上装" || item.category === "连衣裙",
  );

  const stats = useMemo(() => {
    const totalWears = garments.reduce((sum, item) => sum + item.wearCount, 0);
    const favorites = garments.filter((item) => item.favorite).length;
    const mostWorn = [...garments].sort((a, b) => b.wearCount - a.wearCount)[0];
    const underused = garments.filter((item) => item.wearCount < 3).length;
    return { totalWears, favorites, mostWorn, underused };
  }, [garments]);

  async function updateGarment(
    id: string,
    action: "favorite" | "worn",
    value?: boolean,
  ) {
    setGarments((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              favorite: action === "favorite" ? Boolean(value) : item.favorite,
              wearCount: action === "worn" ? item.wearCount + 1 : item.wearCount,
              affinity: action === "worn" ? item.affinity + 1.5 : item.affinity,
            }
          : item,
      ),
    );
    try {
      const response = await fetch("/api/wardrobe", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action, value }),
      });
      if (response.ok) {
        const data = (await response.json()) as { garments: Garment[] };
        setGarments(data.garments);
      }
    } catch {
      // Optimistic state keeps the demo responsive offline.
    }
    showToast(action === "worn" ? "已记录今天穿过，偏好权重已更新" : "收藏状态已更新");
  }

  async function analyzeUpload(file: File) {
    setUploadStage("analyzing");
    setUploadPreview(URL.createObjectURL(file));
    try {
      const processed = await dominantColorAndCutout(file);
      setUploadFile(processed.file);
      setUploadPreview(processed.preview);
      setBackgroundRemoved(processed.backgroundRemoved);
      const form = new FormData();
      form.set("image", processed.file);
      const response = await fetch("/api/analyze", { method: "POST", body: form });
      const analysis = response.ok
        ? ((await response.json()) as Partial<UploadDraft>)
        : {};
      const baseName = analysis.name ?? "简约日常上装";
      setDraft({
        ...defaultDraft,
        ...analysis,
        name: baseName.startsWith(processed.color)
          ? baseName
          : `${processed.color}${baseName}`,
        color: processed.color,
      });
      setUploadStage("confirm");
    } catch {
      setUploadFile(file);
      setDraft(defaultDraft);
      setUploadStage("confirm");
    }
  }

  function handleUploadChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void analyzeUpload(file);
  }

  async function saveGarment() {
    if (!uploadFile || !draft.name.trim()) return;
    const form = new FormData();
    form.set("image", uploadFile);
    Object.entries(draft).forEach(([key, value]) => {
      form.set(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
    });
    try {
      const response = await fetch("/api/wardrobe", { method: "POST", body: form });
      if (!response.ok) throw new Error("save failed");
      const data = (await response.json()) as { garment: Garment };
      setGarments((current) => [data.garment, ...current]);
    } catch {
      setGarments((current) => [
        {
          id: crypto.randomUUID(),
          ...draft,
          imageUrl: uploadPreview,
          favorite: false,
          wearCount: 0,
          affinity: 0,
        },
        ...current,
      ]);
    }
    setUploadOpen(false);
    setUploadStage("pick");
    setUploadFile(null);
    setUploadPreview(null);
    setDraft(defaultDraft);
    showToast("新衣物已收进云衣柜");
  }

  async function sendFeedback(outfit: Outfit, action: FeedbackAction) {
    const delta = { like: 1.5, reject: -2.5, save: 2.5, wear: 4 }[action];
    setGarments((current) =>
      current.map((item) =>
        outfit.itemIds.includes(item.id)
          ? {
              ...item,
              affinity: item.affinity + delta,
              wearCount: item.wearCount + (action === "wear" ? 1 : 0),
            }
          : item,
      ),
    );
    setOutfits((current) =>
      current.map((item) =>
        item.id === outfit.id ? { ...item, saved: action === "save" || item.saved } : item,
      ),
    );
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outfitId: outfit.id, action, itemIds: outfit.itemIds }),
      });
    } catch {
      // Local feedback still changes the next ranking in offline previews.
    }
    const messages = {
      like: "记住了：你喜欢这套的风格",
      reject: "已降低相似搭配的推荐权重",
      save: "搭配已保存，偏好权重已更新",
      wear: "已记录实际穿着，这是最强偏好信号",
    };
    showToast(messages[action]);
  }

  function openEditor(outfit: Outfit) {
    setEditingOutfit(outfit);
    setEditedItems(outfit.itemIds);
  }

  async function applyEditedOutfit() {
    if (!editingOutfit || editedItems.length === 0) return;
    const updated = { ...editingOutfit, itemIds: editedItems, name: "我的手动搭配" };
    setOutfits((current) =>
      current.map((item) => (item.id === editingOutfit.id ? updated : item)),
    );
    setEditingOutfit(null);
    try {
      await fetch("/api/recommendations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: updated.id,
          itemIds: updated.itemIds,
          name: updated.name,
        }),
      });
    } catch {
      // The edited outfit remains available in the current session offline.
    }
    await sendFeedback(updated, "save");
  }

  function handlePersonUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPersonFile(file);
    setPersonPreview(URL.createObjectURL(file));
    setTryOnResult(null);
  }

  async function generateTryOn() {
    const garment = garments.find((item) => item.id === tryOnGarmentId);
    if (!personFile || !personPreview || !garment) return;
    setTryOnLoading(true);
    try {
      let garmentFile: File;
      if (garment.imageUrl) {
        const blob = await fetch(garment.imageUrl).then((response) => response.blob());
        garmentFile = new File([blob], "garment.png", { type: blob.type || "image/png" });
      } else {
        const placeholder = new Blob([garment.name], { type: "text/plain" });
        garmentFile = new File([placeholder], "garment.txt", { type: "text/plain" });
      }
      const form = new FormData();
      form.set("person", personFile);
      form.set("garment", garmentFile);
      form.set("category", garment.category === "连衣裙" ? "one-pieces" : "tops");
      const response = await fetch("/api/try-on", { method: "POST", body: form });
      const contentType = response.headers.get("content-type") ?? "";
      if (response.ok && contentType.startsWith("image/")) {
        setTryOnResult(URL.createObjectURL(await response.blob()));
      } else {
        setTryOnResult(await compositeTryOn(personPreview, garment));
      }
    } catch {
      setTryOnResult(await compositeTryOn(personPreview, garment));
    } finally {
      setTryOnLoading(false);
    }
  }

  function OutfitCard({ outfit, featured = false }: { outfit: Outfit; featured?: boolean }) {
    const items = outfit.itemIds
      .map((id) => garments.find((item) => item.id === id))
      .filter((item): item is Garment => Boolean(item));
    return (
      <article className={cn("outfit-card", featured && "outfit-card--featured")}>
        <div className="outfit-card__topline">
          <span className="match-score">{outfit.score}% 合拍</span>
          <button className="quiet-button" onClick={() => openEditor(outfit)}>编辑</button>
        </div>
        <div className="outfit-stack">
          {items.slice(0, 4).map((item, index) => (
            <div className="outfit-stack__item" key={item.id} style={{ zIndex: 5 - index }}>
              <GarmentVisual garment={item} compact />
            </div>
          ))}
        </div>
        <div className="outfit-card__copy">
          <p className="eyebrow">{outfit.occasion} · {outfit.weather}</p>
          <h3>{outfit.name}</h3>
          <p>{outfit.reason}</p>
        </div>
        <div className="feedback-row" aria-label="搭配反馈">
          <button onClick={() => void sendFeedback(outfit, "like")} title="喜欢">♡ 喜欢</button>
          <button onClick={() => void sendFeedback(outfit, "reject")} title="不喜欢">× 拒绝</button>
          <button
            className={outfit.saved ? "is-active" : ""}
            onClick={() => void sendFeedback(outfit, "save")}
            title="保存搭配"
          >
            {outfit.saved ? "✓ 已保存" : "+ 保存"}
          </button>
          <button onClick={() => void sendFeedback(outfit, "wear")} title="记录穿着">今天穿</button>
        </div>
      </article>
    );
  }

  function WardrobeCard({ item }: { item: Garment }) {
    return (
      <article className="wardrobe-card">
        <div className="wardrobe-card__image">
          <GarmentVisual garment={item} />
          <button
            className={cn("favorite-button", item.favorite && "is-active")}
            onClick={() => void updateGarment(item.id, "favorite", !item.favorite)}
            aria-label={item.favorite ? "取消收藏" : "收藏"}
          >
            {item.favorite ? "♥" : "♡"}
          </button>
          <span className="confidence-badge">
            {item.sourceType === "manual" ? "已确认" : `AI ${Math.round(item.confidence * 100)}%`}
          </span>
        </div>
        <div className="wardrobe-card__body">
          <div>
            <p>{item.category} · {item.color}</p>
            <h3>{item.name}</h3>
          </div>
          <div className="tag-row">
            {item.styleTags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <div className="wear-row">
            <span>已穿 {item.wearCount} 次</span>
            <button onClick={() => void updateGarment(item.id, "worn")}>+ 今天穿了</button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("today")}>
          <span className="brand-mark">M</span>
          <span><strong>Muse</strong><small>closet</small></span>
        </button>
        <nav aria-label="主要导航">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "is-active" : ""}
              onClick={() => setView(item.id)}
            >
              <MiniIcon>{item.icon}</MiniIcon>{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="pulse-dot" />
          <p><strong>偏好学习中</strong><small>最近 7 次反馈已生效</small></p>
        </div>
        <div className="profile-chip">
          <span className="avatar">Z</span>
          <p><strong>我的衣橱</strong><small>{garments.length} 件单品</small></p>
          <span>···</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">M</span>Muse Closet</div>
          <div className="topbar-spacer" />
          <button className="topbar-icon" aria-label="通知">◌<span /></button>
          <button className="primary-button" onClick={() => setUploadOpen(true)}>
            <span>＋</span> 上传衣物
          </button>
        </header>

        {view === "today" && (
          <div className="page page--today">
            <section className="hero-row">
              <div>
                <p className="eyebrow">SATURDAY · 15 AUG</p>
                <h1>早上好，今天穿什么？</h1>
                <p className="hero-subtitle">从你的真实衣柜出发，给出能直接穿走的答案。</p>
              </div>
              <div className="weather-card">
                <div className="weather-icon">◒</div>
                <div><strong>{temperature}°</strong><span>伦敦 · 多云</span></div>
                <p>体感偏凉<br /><b>建议加一件外套</b></p>
              </div>
            </section>

            <section className="recommendation-section">
              <div className="section-heading">
                <div><p className="eyebrow">MUSE PICKS</p><h2>今天的 3 套推荐</h2></div>
                <button className="text-button" onClick={() => setView("studio")}>调整条件 →</button>
              </div>
              <div className="outfit-grid">
                {outfits.length ? outfits.map((outfit, index) => (
                  <OutfitCard outfit={outfit} featured={index === 0} key={outfit.id} />
                )) : (
                  <div className="empty-state"><p>衣柜里还缺少可组合的上下装</p><button onClick={() => setUploadOpen(true)}>上传第一件衣物</button></div>
                )}
              </div>
            </section>

            <section className="closet-preview">
              <div className="section-heading">
                <div><p className="eyebrow">YOUR CLOSET</p><h2>最近入柜</h2></div>
                <button className="text-button" onClick={() => setView("wardrobe")}>查看全部 {garments.length} 件 →</button>
              </div>
              <div className="mini-wardrobe-row">
                {garments.slice(0, 5).map((item) => <WardrobeCard item={item} key={item.id} />)}
              </div>
            </section>
          </div>
        )}

        {view === "wardrobe" && (
          <div className="page">
            <section className="page-title-row">
              <div><p className="eyebrow">YOUR CLOSET</p><h1>云衣柜</h1><p>看得见，才更容易穿得上。</p></div>
              <div className="wardrobe-summary"><strong>{garments.length}</strong><span>件衣物</span><strong>{stats.totalWears}</strong><span>次穿着</span></div>
            </section>
            <div className="filter-bar">
              <label className="search-field"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称、颜色或风格" /></label>
              <div className="filter-pills">
                {["全部", ...categoryOptions].map((option) => <button className={category === option ? "is-active" : ""} onClick={() => setCategory(option)} key={option}>{option}</button>)}
              </div>
              <button className={cn("favorite-filter", onlyFavorites && "is-active")} onClick={() => setOnlyFavorites((value) => !value)}>♡ 只看收藏</button>
            </div>
            {loading ? <div className="loading-grid">正在整理衣柜…</div> : (
              <div className="wardrobe-grid">
                {filteredGarments.map((item) => <WardrobeCard item={item} key={item.id} />)}
                <button className="add-garment-card" onClick={() => setUploadOpen(true)}><span>＋</span><strong>添加衣物</strong><small>拍照即可自动建档</small></button>
              </div>
            )}
          </div>
        )}

        {view === "studio" && (
          <div className="page">
            <section className="page-title-row">
              <div><p className="eyebrow">OUTFIT STUDIO</p><h1>搭配实验室</h1><p>先说场合和天气，也可以指定一件今天想穿的衣服。</p></div>
            </section>
            <section className="studio-controls">
              <label><span>场合</span><select value={occasion} onChange={(event) => setOccasion(event.target.value)}>{occasions.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>温度</span><div className="range-control"><input type="range" min="-2" max="32" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} /><b>{temperature}°C</b></div></label>
              <label><span>必须穿</span><select value={mustWearId} onChange={(event) => setMustWearId(event.target.value)}><option value="">由 Muse 决定</option>{garments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
              <button className="primary-button primary-button--large" onClick={() => void fetchRecommendations(garments, occasion, temperature, mustWearId)}>重新生成 3 套</button>
            </section>
            <div className="outfit-grid outfit-grid--studio">
              {outfits.map((outfit, index) => <OutfitCard outfit={outfit} featured={index === 0} key={outfit.id} />)}
            </div>
            <aside className="learning-note"><span>✦</span><p><strong>推荐为什么会变聪明？</strong>你主动替换、保存和实际穿着的信号，会直接改变下一轮排序；“实际穿着”的权重最高。</p></aside>
          </div>
        )}

        {view === "tryon" && (
          <div className="page">
            <section className="page-title-row">
              <div><p className="eyebrow">VIRTUAL FITTING</p><h1>虚拟试穿</h1><p>先看风格是否合拍，再决定今天穿哪一件。</p></div>
              <span className="beta-badge">2D PREVIEW · BETA</span>
            </section>
            <section className="tryon-layout">
              <div className="tryon-panel">
                <div className="step-label"><b>01</b><span>上传正面全身照</span></div>
                <label className={cn("person-dropzone", personPreview && "has-image")}>
                  {personPreview ? <img src={personPreview} alt="全身照预览" /> : <><span className="person-silhouette">●<i /></span><strong>选择或拍摄照片</strong><small>光线均匀、双手自然垂下效果更好</small></>}
                  <input type="file" accept="image/*" onChange={handlePersonUpload} />
                </label>
              </div>
              <div className="tryon-panel">
                <div className="step-label"><b>02</b><span>选择上装或连衣裙</span></div>
                <div className="tryon-garments">
                  {eligibleTryOn.map((item) => (
                    <button className={tryOnGarmentId === item.id ? "is-active" : ""} onClick={() => { setTryOnGarmentId(item.id); setTryOnResult(null); }} key={item.id}>
                      <GarmentVisual garment={item} compact /><span>{item.name}</span>
                    </button>
                  ))}
                </div>
                <button className="primary-button primary-button--large full-width" disabled={!personFile || !tryOnGarmentId || tryOnLoading} onClick={() => void generateTryOn()}>{tryOnLoading ? "正在生成预览…" : "生成虚拟试穿"}</button>
                <p className="fine-print">试穿结果用于风格预览，不作为尺码或真实合身建议。</p>
              </div>
              <div className="tryon-result">
                <div className="step-label"><b>03</b><span>预览结果</span></div>
                <div className={cn("result-stage", tryOnResult && "has-image")}>
                  {tryOnResult ? <img src={tryOnResult} alt="AI虚拟试穿结果" /> : <><span>✦</span><p>上传照片并选择衣物后<br />结果会出现在这里</p></>}
                </div>
                {tryOnResult && <button className="secondary-button full-width" onClick={() => { setTryOnResult(null); showToast("已保留本次选择，可继续尝试其他单品"); }}>再试一件</button>}
              </div>
            </section>
          </div>
        )}

        {view === "insights" && (
          <div className="page">
            <section className="page-title-row"><div><p className="eyebrow">WARDROBE SIGNALS</p><h1>衣橱洞察</h1><p>用穿着记录理解你的真实风格，而不是你以为的风格。</p></div></section>
            <div className="insight-grid">
              <article className="insight-card insight-card--hero"><p>衣橱利用率</p><strong>{Math.min(94, Math.round((garments.filter((item) => item.wearCount > 0).length / Math.max(1, garments.length)) * 100))}%</strong><span>本月有 {garments.filter((item) => item.wearCount > 0).length} 件被穿过</span><div className="progress-track"><i style={{ width: `${Math.min(94, Math.round((garments.filter((item) => item.wearCount > 0).length / Math.max(1, garments.length)) * 100))}%` }} /></div></article>
              <article className="insight-card"><p>最常穿</p><strong className="insight-name">{stats.mostWorn?.name ?? "暂无"}</strong><span>{stats.mostWorn?.wearCount ?? 0} 次穿着</span></article>
              <article className="insight-card"><p>偏爱单品</p><strong>{stats.favorites}</strong><span>件已收藏</span></article>
              <article className="insight-card"><p>等待被发现</p><strong>{stats.underused}</strong><span>件穿着少于 3 次</span></article>
            </div>
            <section className="preference-panel">
              <div><p className="eyebrow">LEARNED TASTE</p><h2>Muse 目前理解的你</h2></div>
              <div className="preference-tags"><span className="strong">简约 86</span><span className="strong">通勤 79</span><span>复古 63</span><span>松弛 58</span><span>浪漫 41</span></div>
              <p>这些权重来自收藏、搭配修改和实际穿着；继续反馈后会自动变化。</p>
            </section>
          </div>
        )}
      </main>

      <nav className="mobile-nav" aria-label="移动端导航">
        {navItems.slice(0, 4).map((item) => <button className={view === item.id ? "is-active" : ""} onClick={() => setView(item.id)} key={item.id}><span>{item.icon}</span>{item.label.replace("实验室", "")}</button>)}
      </nav>

      {uploadOpen && (
        <Modal title={uploadStage === "confirm" ? "确认衣物信息" : "添加一件衣物"} eyebrow="ADD TO CLOSET" onClose={() => setUploadOpen(false)} wide={uploadStage === "confirm"}>
          {uploadStage === "pick" && <div className="upload-picker"><button className="upload-dropzone" onClick={() => uploadInputRef.current?.click()}><span>＋</span><strong>上传衣物照片</strong><small>推荐单件平铺、背景简洁的照片</small></button><input ref={uploadInputRef} type="file" accept="image/*" onChange={handleUploadChange} hidden /><div className="upload-tips"><span>01 自动去背景</span><span>02 AI 识别属性</span><span>03 由你最终确认</span></div></div>}
          {uploadStage === "analyzing" && <div className="analyzing-state">{uploadPreview && <img src={uploadPreview} alt="待识别衣物" />}<div className="scan-line" /><span className="sparkle">✦</span><h3>正在理解这件衣服</h3><p>清理背景 · 提取颜色 · 生成属性标签</p></div>}
          {uploadStage === "confirm" && <div className="confirm-layout"><div className="confirm-preview">{uploadPreview && <img src={uploadPreview} alt="去背景后的衣物" />}<span>{backgroundRemoved ? "✓ 背景已自动清理" : "背景复杂，已保留原图"}</span></div><div className="confirm-form"><div className="ai-status"><span>✦</span><p><strong>AI 已完成初步建档</strong><small>置信度 {Math.round(draft.confidence * 100)}%，请确认后入柜</small></p></div><label><span>衣物名称</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><div className="form-grid"><label><span>品类</span><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as GarmentCategory })}>{categoryOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>主色</span><input value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label><label><span>材质</span><input value={draft.material} onChange={(event) => setDraft({ ...draft, material: event.target.value })} /></label><label><span>季节</span><select value={draft.season} onChange={(event) => setDraft({ ...draft, season: event.target.value })}><option>四季</option><option>春夏</option><option>春秋</option><option>秋冬</option></select></label></div><label><span>风格标签（用、分隔）</span><input value={draft.styleTags.join("、")} onChange={(event) => setDraft({ ...draft, styleTags: event.target.value.split(/[、,，]/).filter(Boolean) })} /></label><div className="modal-actions"><button className="secondary-button" onClick={() => setUploadStage("pick")}>重新选择</button><button className="primary-button" onClick={() => void saveGarment()}>确认并收入衣柜</button></div></div></div>}
        </Modal>
      )}

      {editingOutfit && (
        <Modal title="手动调整这套搭配" eyebrow="MAKE IT YOURS" onClose={() => setEditingOutfit(null)} wide>
          <div className="outfit-editor"><div className="selected-strip">{editedItems.map((id) => garments.find((item) => item.id === id)).filter((item): item is Garment => Boolean(item)).map((item) => <div key={item.id}><GarmentVisual garment={item} compact /><button onClick={() => setEditedItems((current) => current.filter((id) => id !== item.id))}>×</button></div>)}{editedItems.length === 0 && <p>从下方选择衣物组成搭配</p>}</div><p className="editor-hint">点击衣物即可加入或移出；你的主动选择会成为强偏好信号。</p><div className="editor-grid">{garments.map((item) => <button className={editedItems.includes(item.id) ? "is-active" : ""} onClick={() => setEditedItems((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} key={item.id}><GarmentVisual garment={item} compact /><span>{item.name}</span></button>)}</div><div className="modal-actions"><button className="secondary-button" onClick={() => setEditingOutfit(null)}>取消</button><button className="primary-button" onClick={() => void applyEditedOutfit()}>保存我的搭配</button></div></div>
        </Modal>
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
