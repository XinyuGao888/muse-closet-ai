"use client";

/* eslint-disable @next/next/no-img-element, react/prop-types -- previews use local Blob URLs; TypeScript defines component props. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  categoryColors,
  categoryGlyphs,
  rankOutfits,
  seedGarments,
  availabilityLabels,
  type Garment,
  type GarmentAvailabilityStatus,
  type GarmentCategory,
  type Outfit,
} from "@/lib/wardrobe";
import { BodyStudio, InspirationLibrary, PreferenceDashboard } from "./advanced-views";
import { BatchIntakeCenter, CalendarPlanner, WardrobeAnalyticsDashboard } from "./p0-views";
import { GarmentRelationSheet, OutfitCanvasStudio, OutfitDiary, ShoppingAdvisor, WeatherReminderCenter } from "./p1-views";
import {
  type Inspiration,
  type IntakeMode,
  type PreferenceProfile,
} from "@/lib/phase-two-three";
import type {
  IntakeJob,
  OutfitPlan,
  StyleInterpretation,
  WardrobeAnalytics,
  WeatherDay,
} from "@/lib/p0";
import type {
  CanvasPlacement,
  DiaryEntry,
  DiaryInsights,
  GarmentRelation,
  ReminderPreferences,
  SavedOutfitCard,
  ShoppingAssessment,
} from "@/lib/p1";

type View = "today" | "calendar" | "wardrobe" | "canvas" | "studio" | "inspiration" | "shopping" | "intake" | "tryon" | "diary" | "insights";
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
  brand: string;
  productCode: string;
  productUrl: string;
  rawText: string;
};

const navItems: { id: View; label: string; icon: string }[] = [
  { id: "today", label: "今日灵感", icon: "✦" },
  { id: "calendar", label: "穿搭日历", icon: "▣" },
  { id: "wardrobe", label: "云衣柜", icon: "▦" },
  { id: "canvas", label: "自由搭配", icon: "✣" },
  { id: "studio", label: "搭配实验室", icon: "◇" },
  { id: "inspiration", label: "灵感穿搭库", icon: "⌘" },
  { id: "shopping", label: "买不买助手", icon: "?" },
  { id: "intake", label: "建档任务", icon: "⇧" },
  { id: "tryon", label: "3D 数字分身", icon: "◉" },
  { id: "diary", label: "真人穿搭日记", icon: "▤" },
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
  brand: "",
  productCode: "",
  productUrl: "",
  rawText: "",
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

async function sendMuseNotification(title: string, body: string, tag: string) {
  if (!("serviceWorker" in navigator) || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type: "MUSE_NOTIFY", title, body, tag });
}

const subscribeStaticDate = () => () => undefined;
const clientDateLabel = () => new Intl.DateTimeFormat("zh-CN", {
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(new Date());
const serverDateLabel = () => "今日";

export function WardrobeApp({ user }: { user: { displayName: string; email: string; signOutPath?: string; onSignOut?: () => void | Promise<void> } }) {
  const [view, setView] = useState<View>("today");
  const todayLabel = useSyncExternalStore(subscribeStaticDate, clientDateLabel, serverDateLabel);
  const [garments, setGarments] = useState<Garment[]>(fallbackGarments);
  const [outfits, setOutfits] = useState<Outfit[]>(() =>
    rankOutfits(fallbackGarments, "通勤", 14),
  );
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  const [preference, setPreference] = useState<PreferenceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("全部");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [statusFilter, setStatusFilter] = useState("全部状态");
  const [occasion, setOccasion] = useState("通勤");
  const [temperature, setTemperature] = useState(14);
  const [mustWearId, setMustWearId] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("photo");
  const [uploadStage, setUploadStage] = useState<"pick" | "analyzing" | "confirm">("pick");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [backgroundRemoved, setBackgroundRemoved] = useState(false);
  const [productLink, setProductLink] = useState("");
  const [barcodeValue, setBarcodeValue] = useState("");
  const [remoteImageUrl, setRemoteImageUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<UploadDraft>(defaultDraft);
  const [toast, setToast] = useState("");
  const [editingOutfit, setEditingOutfit] = useState<Outfit | null>(null);
  const [editedItems, setEditedItems] = useState<string[]>([]);
  const [plans, setPlans] = useState<OutfitPlan[]>([]);
  const [forecast, setForecast] = useState<WeatherDay[]>([]);
  const [planningWeek, setPlanningWeek] = useState(false);

  const [naturalQuery, setNaturalQuery] = useState("明天去见客户，伦敦会下雨，希望正式但不要像销售。");
  const [styleInterpretation, setStyleInterpretation] = useState<StyleInterpretation | null>(null);
  const [styleQueryLoading, setStyleQueryLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [intakeJobs, setIntakeJobs] = useState<IntakeJob[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [analytics, setAnalytics] = useState<WardrobeAnalytics | null>(null);
  const [outfitCards, setOutfitCards] = useState<SavedOutfitCard[]>([]);
  const [canvasSaving, setCanvasSaving] = useState(false);
  const [garmentRelation, setGarmentRelation] = useState<GarmentRelation | null>(null);
  const [relationLoading, setRelationLoading] = useState(false);
  const [shoppingAssessments, setShoppingAssessments] = useState<ShoppingAssessment[]>([]);
  const [shoppingBusy, setShoppingBusy] = useState(false);
  const [reminderPreferences, setReminderPreferences] = useState<ReminderPreferences | null>(null);
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [diaryInsights, setDiaryInsights] = useState<DiaryInsights | null>(null);
  const [diaryBusy, setDiaryBusy] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const relationRequestRef = useRef(0);

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

  const fetchPreference = useCallback(async () => {
    try {
      const response = await fetch("/api/preferences");
      if (!response.ok) return;
      const data = (await response.json()) as { profile: PreferenceProfile };
      setPreference(data.profile);
    } catch { /* preference stays optional in offline previews */ }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await fetch("/api/analytics");
      if (response.ok) setAnalytics(((await response.json()) as { analytics: WardrobeAnalytics }).analytics);
    } catch { /* analytics stays optional in offline previews */ }
  }, []);

  useEffect(() => {
    fetch("/api/inspirations")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data?.inspirations && setInspirations(data.inspirations))
      .catch(() => undefined);
    fetch("/api/preferences")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data?.profile && setPreference(data.profile))
      .catch(() => undefined);
    fetch("/api/calendar")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data?.plans) setPlans(data.plans); if (data?.forecast) setForecast(data.forecast); })
      .catch(() => undefined);
    fetch("/api/intake-jobs")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data?.jobs && setIntakeJobs(data.jobs))
      .catch(() => undefined);
    fetch("/api/analytics")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data?.analytics && setAnalytics(data.analytics))
      .catch(() => undefined);
    fetch("/api/outfit-canvas")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data?.cards && setOutfitCards(data.cards))
      .catch(() => undefined);
    fetch("/api/shopping-advisor")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data?.assessments && setShoppingAssessments(data.assessments))
      .catch(() => undefined);
    fetch("/api/reminders")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data?.preferences && setReminderPreferences(data.preferences))
      .catch(() => undefined);
    fetch("/api/diary")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data?.entries) setDiaryEntries(data.entries); if (data?.insights) setDiaryInsights(data.insights); })
      .catch(() => undefined);
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/muse-sw.js");
  }, []);

  const autoLocated = useRef(false);
  useEffect(() => {
    if (autoLocated.current || !("geolocation" in navigator)) return;
    autoLocated.current = true;
    navigator.geolocation.getCurrentPosition(async (position) => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      try {
        const [weatherResponse, reminderResponse, wardrobeResponse] = await Promise.all([
          fetch(`/api/weather?latitude=${latitude}&longitude=${longitude}&location=${encodeURIComponent("当前位置")}&days=10`),
          fetch("/api/reminders"),
          fetch("/api/wardrobe"),
        ]);
        if (!weatherResponse.ok) return;
        const weather = await weatherResponse.json() as { forecast: WeatherDay[] };
        setForecast(weather.forecast);
        const reminderData = reminderResponse.ok ? await reminderResponse.json() as { preferences?: ReminderPreferences } : {};
        const nextPreferences = { ...(reminderData.preferences ?? {}), locationLabel: "当前位置", latitude, longitude } as ReminderPreferences;
        setReminderPreferences(nextPreferences);
        void fetch("/api/reminders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ locationLabel: "当前位置", latitude, longitude }) });
        const today = weather.forecast[0];
        if ((reminderData.preferences?.morningRerank ?? true) && today && wardrobeResponse.ok) {
          const wardrobe = await wardrobeResponse.json() as { garments: Garment[] };
          const actualTemperature = Math.round((today.temperatureMin + today.temperatureMax) / 2);
          setTemperature(actualTemperature);
          void fetchRecommendations(wardrobe.garments, "通勤", actualTemperature, "");
        }
      } catch { /* keep the London forecast fallback when location is unavailable */ }
    }, () => undefined, { enableHighAccuracy: false, maximumAge: 3_600_000, timeout: 8_000 });
  }, [fetchRecommendations]);

  const filteredGarments = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return garments.filter((item) => {
      const matchesSearch =
        !keyword ||
        [item.name, item.color, item.material, item.brand, item.productCode, ...item.styleTags]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      return (
        matchesSearch &&
        (category === "全部" || item.category === category) &&
        (!onlyFavorites || item.favorite) &&
        (statusFilter === "全部状态" || item.availabilityStatus === statusFilter)
      );
    });
  }, [category, garments, onlyFavorites, search, statusFilter]);

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
              availabilityStatus: action === "worn" ? "worn" : item.availabilityStatus,
              lastWornAt: action === "worn" ? new Date().toISOString().slice(0, 10) : item.lastWornAt,
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
    void fetchPreference();
    void fetchAnalytics();
  }

  async function updateGarmentStatus(id: string, status: GarmentAvailabilityStatus, storageLocation?: string | null) {
    setGarments((current) => current.map((item) => item.id === id ? { ...item, availabilityStatus: status, storageLocation: storageLocation ?? item.storageLocation } : item));
    try {
      const response = await fetch("/api/wardrobe", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action: "status", status, storageLocation }),
      });
      if (response.ok) setGarments(((await response.json()) as { garments: Garment[] }).garments);
    } catch { /* optimistic state keeps status controls responsive */ }
    showToast(`衣物已设为「${availabilityLabels[status]}」${["available", "stored"].includes(status) ? "" : "，推荐会自动避开"}`);
    void fetchAnalytics();
  }

  async function runNaturalStyleQuery() {
    if (!naturalQuery.trim()) return;
    setStyleQueryLoading(true);
    try {
      const response = await fetch("/api/style-query", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: naturalQuery.trim() }),
      });
      const data = await response.json() as { outfits?: Outfit[]; interpretation?: StyleInterpretation; error?: string };
      if (!response.ok || !data.outfits) throw new Error(data.error || "理解失败");
      setOutfits(data.outfits);
      setStyleInterpretation(data.interpretation ?? null);
      showToast("已理解天气、场合和风格要求，生成 3 套解释型搭配");
    } catch {
      showToast("暂时无法理解这段描述，请稍后重试");
    } finally { setStyleQueryLoading(false); }
  }

  function startVoiceInput() {
    type RecognitionInstance = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
    type RecognitionConstructor = new () => RecognitionInstance;
    const browser = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) { showToast("当前浏览器不支持语音输入，可以直接输入文字"); return; }
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => setNaturalQuery(event.results[0]?.[0]?.transcript ?? naturalQuery);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); showToast("没有听清，请再试一次"); };
    setListening(true);
    recognition.start();
  }

  async function planWeek() {
    setPlanningWeek(true);
    try {
      const response = await fetch("/api/calendar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "plan_week", location: "伦敦" }) });
      const data = await response.json() as { plans?: OutfitPlan[]; forecast?: WeatherDay[]; error?: string };
      if (!response.ok || !data.plans) throw new Error(data.error || "安排失败");
      setPlans(data.plans);
      if (data.forecast) setForecast(data.forecast);
      showToast("已根据每天不同天气安排下周一到周五");
    } catch { showToast("当前衣柜单品不足或天气暂不可用"); }
    finally { setPlanningWeek(false); }
  }

  async function scheduleOutfit(date: string, outfit: Outfit, weather?: WeatherDay) {
    const response = await fetch("/api/calendar", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "schedule", date, outfit, weather: weather ? { label: weather.label, temperature: Math.round((weather.temperatureMin + weather.temperatureMax) / 2), code: weather.weatherCode, location: weather.location } : undefined }),
    });
    if (response.ok) {
      setPlans(((await response.json()) as { plans: OutfitPlan[] }).plans);
      showToast(`已把「${outfit.name}」安排到 ${date}`);
    }
  }

  async function markPlanWorn(plan: OutfitPlan) {
    if (plan.status === "worn") return;
    const response = await fetch("/api/calendar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "wear", planId: plan.id }) });
    if (response.ok) {
      const data = (await response.json()) as { plans: OutfitPlan[]; recordedIds?: string[] };
      setPlans(data.plans);
      const recorded = new Set(data.recordedIds ?? plan.itemIds);
      setGarments((current) => current.map((item) => plan.itemIds.includes(item.id) ? { ...item, wearCount: item.wearCount + (recorded.has(item.id) ? 1 : 0), availabilityStatus: "worn", lastWornAt: plan.planDate } : item));
      showToast("已记录实际穿着，并同步到偏好与衣物状态");
      void fetchAnalytics();
    }
  }

  async function deletePlan(plan: OutfitPlan) {
    const response = await fetch(`/api/calendar?id=${encodeURIComponent(plan.id)}`, { method: "DELETE" });
    if (response.ok) setPlans(((await response.json()) as { plans: OutfitPlan[] }).plans);
  }

  async function saveOutfitCard(name: string, nextOccasion: string, layout: CanvasPlacement[], preview: Blob) {
    setCanvasSaving(true);
    try {
      const form = new FormData();
      form.set("name", name); form.set("occasion", nextOccasion); form.set("layout", JSON.stringify(layout));
      form.set("preview", new File([preview], "outfit-card.jpg", { type: "image/jpeg" }));
      const response = await fetch("/api/outfit-canvas", { method: "POST", body: form });
      const data = await response.json() as { cards?: SavedOutfitCard[]; error?: string };
      if (!response.ok || !data.cards) throw new Error(data.error || "save failed");
      setOutfitCards(data.cards);
      showToast("完整 Outfit Card 已保存，并进入单品关系网络");
    } catch { showToast("搭配卡保存失败，请稍后重试"); }
    finally { setCanvasSaving(false); }
  }

  async function deleteOutfitCard(card: SavedOutfitCard) {
    const response = await fetch(`/api/outfit-canvas?id=${encodeURIComponent(card.id)}`, { method: "DELETE" });
    if (response.ok) setOutfitCards(((await response.json()) as { cards: SavedOutfitCard[] }).cards);
  }

  async function openGarmentRelation(item: Garment) {
    const requestId = ++relationRequestRef.current;
    setRelationLoading(true);
    setGarmentRelation(null);
    try {
      const response = await fetch(`/api/garment-relations?id=${encodeURIComponent(item.id)}`);
      const data = await response.json() as { relation?: GarmentRelation };
      if (requestId === relationRequestRef.current && response.ok && data.relation) setGarmentRelation(data.relation);
    } finally { if (requestId === relationRequestRef.current) setRelationLoading(false); }
  }

  function useRelationLook(outfit: Outfit) {
    setOutfits((current) => [outfit, ...current.filter((item) => item.id !== outfit.id)].slice(0, 3));
    setGarmentRelation(null);
    setView("studio");
    showToast("新搭法已放入搭配实验室，可以继续编辑");
  }

  async function analyzeShopping(file: File, fields: { name: string; category: GarmentCategory; color: string; styleTags: string[]; brand: string; price: string }) {
    setShoppingBusy(true);
    try {
      const form = new FormData();
      form.set("image", file);
      Object.entries(fields).forEach(([key, value]) => form.set(key, Array.isArray(value) ? JSON.stringify(value) : value));
      const response = await fetch("/api/shopping-advisor", { method: "POST", body: form });
      const data = await response.json() as { assessments?: ShoppingAssessment[]; assessment?: ShoppingAssessment; error?: string };
      if (!response.ok || !data.assessments) throw new Error(data.error || "analysis failed");
      setShoppingAssessments(data.assessments);
      showToast(`购买建议：${data.assessment?.decision ?? data.assessments[0]?.decision}`);
    } catch { showToast("购物分析失败，请检查图片后重试"); }
    finally { setShoppingBusy(false); }
  }

  async function locateWeather() {
    if (!("geolocation" in navigator)) { showToast("当前浏览器不支持自动定位"); return; }
    navigator.geolocation.getCurrentPosition(async (position) => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const response = await fetch(`/api/weather?latitude=${latitude}&longitude=${longitude}&location=${encodeURIComponent("当前位置")}&days=10`);
      if (!response.ok) return;
      const data = await response.json() as { forecast: WeatherDay[] };
      setForecast(data.forecast);
      const today = data.forecast[0];
      if (today && (reminderPreferences?.morningRerank ?? true)) {
        const actualTemperature = Math.round((today.temperatureMin + today.temperatureMax) / 2);
        setTemperature(actualTemperature);
        void fetchRecommendations(garments, "通勤", actualTemperature, "");
      }
      await updateReminderPreferences({ locationLabel: "当前位置", latitude, longitude });
      showToast("已按当前位置获取天气并重排今日搭配");
    }, () => showToast("定位未授权，仍可使用默认城市天气"), { enableHighAccuracy: false, maximumAge: 3_600_000, timeout: 8_000 });
  }

  async function updateReminderPreferences(patch: Partial<ReminderPreferences>) {
    setReminderPreferences((current) => current ? { ...current, ...patch } : current);
    const response = await fetch("/api/reminders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    if (response.ok) setReminderPreferences(((await response.json()) as { preferences: ReminderPreferences }).preferences);
  }

  async function requestNotificationPermission() {
    if (!("Notification" in window)) { showToast("当前浏览器不支持系统通知"); return; }
    const permission = await Notification.requestPermission();
    await updateReminderPreferences({ notificationPermission: permission });
    if (permission === "granted") {
      await sendMuseNotification("Muse 提醒已开启", "前一晚搭配和天气变化提醒会显示在这里。", "muse-enabled");
      showToast("浏览器提醒已开启");
    } else showToast("通知未开启，页面内天气提醒仍然可用");
  }

  async function saveDiary(form: FormData) {
    setDiaryBusy(true);
    try {
      const response = await fetch("/api/diary", { method: "POST", body: form });
      const data = await response.json() as { entries?: DiaryEntry[]; insights?: DiaryInsights; error?: string };
      if (!response.ok || !data.entries) throw new Error(data.error || "diary failed");
      setDiaryEntries(data.entries);
      setDiaryInsights(data.insights ?? null);
      const [wardrobeResponse, calendarResponse] = await Promise.all([fetch("/api/wardrobe"), fetch("/api/calendar")]);
      if (wardrobeResponse.ok) setGarments(((await wardrobeResponse.json()) as { garments: Garment[] }).garments);
      if (calendarResponse.ok) {
        const calendar = await calendarResponse.json() as { plans: OutfitPlan[]; forecast: WeatherDay[] };
        setPlans(calendar.plans); setForecast(calendar.forecast);
      }
      void fetchPreference(); void fetchAnalytics();
      showToast("真人效果已关联计划，并写入下一轮偏好排序");
    } catch { showToast("日记保存失败，请保留照片后重试"); }
    finally { setDiaryBusy(false); }
  }

  async function batchUpload(files: File[]) {
    setBatchBusy(true);
    let jobId = "";
    try {
      for (const file of files) {
        const processed = await dominantColorAndCutout(file);
        const analysisForm = new FormData();
        analysisForm.set("image", processed.file);
        const analysisResponse = await fetch("/api/analyze", { method: "POST", body: analysisForm });
        const analysis = analysisResponse.ok ? await analysisResponse.json() as Partial<UploadDraft> : {};
        const batchForm = new FormData();
        batchForm.set("original", file);
        batchForm.set("cutout", processed.file);
        if (jobId) batchForm.set("jobId", jobId);
        batchForm.set("draft", JSON.stringify({ ...defaultDraft, ...analysis, color: processed.color, name: analysis.name ? `${processed.color}${analysis.name}` : `${processed.color}待确认衣物` }));
        const response = await fetch("/api/intake-jobs", { method: "POST", body: batchForm });
        const data = await response.json() as { jobId?: string; jobs?: IntakeJob[] };
        if (!response.ok) throw new Error("batch failed");
        jobId = data.jobId ?? jobId;
        if (data.jobs) setIntakeJobs(data.jobs);
      }
      showToast(`${files.length} 张照片已进入审核队列`);
    } catch { showToast("部分照片识别失败，可在任务中单独重试"); }
    finally { setBatchBusy(false); }
  }

  async function updateIntakeItem(id: string, fields: { selectedCover?: string; draft?: Partial<IntakeJob["items"][number]["draft"]> }) {
    const response = await fetch("/api/intake-jobs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...fields }) });
    if (response.ok) setIntakeJobs(((await response.json()) as { jobs: IntakeJob[] }).jobs);
  }

  async function approveIntake(ids: string[]) {
    setBatchBusy(true);
    try {
      const response = await fetch("/api/intake-jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve", ids }) });
      if (!response.ok) throw new Error("approve failed");
      setIntakeJobs(((await response.json()) as { jobs: IntakeJob[] }).jobs);
      const wardrobe = await fetch("/api/wardrobe").then((result) => result.json()) as { garments: Garment[] };
      setGarments(wardrobe.garments);
      showToast(`${ids.length} 件衣物已批量收入云衣柜`);
      void fetchAnalytics();
    } catch { showToast("确认失败，请保留任务后重试"); }
    finally { setBatchBusy(false); }
  }

  async function regenerateIntake(id: string) {
    const response = await fetch("/api/intake-jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "regenerate", id }) });
    if (response.ok) { setIntakeJobs(((await response.json()) as { jobs: IntakeJob[] }).jobs); showToast("已重新识别，无需再次上传"); }
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

  async function analyzeIntake(file?: File, manualBarcode = "") {
    setUploadStage("analyzing");
    if (file) setUploadPreview(URL.createObjectURL(file));
    let barcode = manualBarcode;
    if (!barcode && file && intakeMode === "barcode") {
      try {
        type Detector = new (options: { formats: string[] }) => { detect: (source: ImageBitmap) => Promise<Array<{ rawValue: string }>> };
        const BarcodeDetector = (window as unknown as { BarcodeDetector?: Detector }).BarcodeDetector;
        if (BarcodeDetector) {
          const bitmap = await createImageBitmap(file);
          const detected = await new BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "qr_code"] }).detect(bitmap);
          barcode = detected[0]?.rawValue ?? "";
          if (barcode) setBarcodeValue(barcode);
        }
      } catch { /* the server adapter or manual code can still resolve it */ }
    }
    try {
      const form = new FormData();
      form.set("mode", intakeMode);
      if (file) form.set("image", file);
      if (barcode) form.set("barcode", barcode);
      const response = await fetch("/api/intake", { method: "POST", body: form });
      const result = (await response.json()) as Partial<UploadDraft> & { remoteImageUrl?: string | null; error?: string };
      if (!response.ok) throw new Error(result.error || "识别失败");
      setUploadFile(null);
      setRemoteImageUrl(result.remoteImageUrl ?? null);
      if (result.remoteImageUrl) setUploadPreview(result.remoteImageUrl);
      setBackgroundRemoved(false);
      setDraft({ ...defaultDraft, ...result, name: result.name ?? "待确认衣物" });
      setUploadStage("confirm");
    } catch {
      setDraft({
        ...defaultDraft,
        name: intakeMode === "barcode" ? "条码建档衣物" : "吊牌 OCR 建档衣物",
        sourceType: intakeMode === "barcode" ? "barcode" : "ocr",
        productCode: barcode,
      });
      setUploadStage("confirm");
    }
  }

  async function importProductLink() {
    if (!productLink.trim()) return;
    setUploadStage("analyzing");
    setUploadPreview(null);
    try {
      const response = await fetch("/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "link", url: productLink.trim() }),
      });
      const result = (await response.json()) as Partial<UploadDraft> & { remoteImageUrl?: string | null; error?: string };
      if (!response.ok) throw new Error(result.error || "链接解析失败");
      setUploadFile(null);
      setRemoteImageUrl(result.remoteImageUrl ?? null);
      setUploadPreview(result.remoteImageUrl ?? null);
      setDraft({ ...defaultDraft, ...result, name: result.name ?? "商品链接导入单品" });
      setUploadStage("confirm");
    } catch {
      setDraft({ ...defaultDraft, name: "商品链接导入单品", productUrl: productLink, sourceType: "product_link" });
      setUploadStage("confirm");
    }
  }

  function handleUploadChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (intakeMode === "photo") void analyzeUpload(file);
    else void analyzeIntake(file);
  }

  async function saveGarment() {
    if (!draft.name.trim()) return;
    const form = new FormData();
    if (uploadFile) form.set("image", uploadFile);
    if (remoteImageUrl) form.set("remoteImageUrl", remoteImageUrl);
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
    setRemoteImageUrl(null);
    setProductLink("");
    setBarcodeValue("");
    setIntakeMode("photo");
    setDraft(defaultDraft);
    showToast(draft.brand ? `${draft.brand} 单品已完成来源建档` : "新衣物已收进云衣柜");
    void fetchAnalytics();
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
    void fetchPreference();
    void fetchAnalytics();
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

  async function toggleInspiration(item: Inspiration) {
    setInspirations((current) => current.map((entry) => entry.id === item.id ? { ...entry, saved: !entry.saved } : entry));
    try {
      const response = await fetch("/api/inspirations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, action: "save", value: !item.saved }),
      });
      if (response.ok) setInspirations(((await response.json()) as { inspirations: Inspiration[] }).inspirations);
    } catch { /* optimistic state is enough offline */ }
  }

  async function applyInspiration(item: Inspiration) {
    try {
      const response = await fetch("/api/inspirations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, action: "use" }),
      });
      const data = (await response.json()) as { outfit?: Outfit; error?: string };
      if (!response.ok || !data.outfit) throw new Error(data.error || "套用失败");
      setOutfits((current) => [data.outfit!, ...current].slice(0, 3));
      setInspirations((current) => current.map((entry) => entry.id === item.id ? { ...entry, usedCount: entry.usedCount + 1 } : entry));
      setView("studio");
      showToast("已把灵感语言映射成你的真实衣柜搭配");
    } catch {
      showToast("当前衣柜单品不足，先补充对应品类再试");
    }
  }

  async function updatePreference(fields: Partial<PreferenceProfile>) {
    const response = await fetch("/api/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (response.ok) setPreference(((await response.json()) as { profile: PreferenceProfile }).profile);
    showToast("偏好模型已更新，下一轮排序会采用新权重");
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
          <span className={`availability-badge status-${item.availabilityStatus ?? "available"}`}>{availabilityLabels[item.availabilityStatus ?? "available"]}</span>
        </div>
        <div className="wardrobe-card__body">
          <div>
            <p>{item.category} · {item.color}</p>
            <h3>{item.name}</h3>
            {(item.brand || item.productCode) && <p className="source-line">{item.brand || "未标品牌"}{item.productCode ? ` · ${item.productCode}` : ""}</p>}
          </div>
          <div className="tag-row">
            {item.styleTags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <div className="wear-row">
            <span>已穿 {item.wearCount} 次</span>
            <div><button onClick={() => void openGarmentRelation(item)}>关系网络</button><button onClick={() => void updateGarment(item.id, "worn")}>+ 今天穿了</button></div>
          </div>
          <div className="status-control">
            <select aria-label={`${item.name}的可用状态`} value={item.availabilityStatus ?? "available"} onChange={(event) => void updateGarmentStatus(item.id, event.target.value as GarmentAvailabilityStatus, item.storageLocation)}>
              {(Object.entries(availabilityLabels) as Array<[GarmentAvailabilityStatus, string]>).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
            <input aria-label={`${item.name}的存放位置`} defaultValue={item.storageLocation ?? ""} placeholder="位置：主衣柜、换季箱…" onBlur={(event) => void updateGarmentStatus(item.id, item.availabilityStatus ?? "available", event.target.value)} />
          </div>
        </div>
      </article>
    );
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayWeather = forecast.find((day) => day.date === todayKey);
  const upcomingPlans = [...plans].filter((plan) => plan.planDate >= todayKey).sort((a, b) => a.planDate.localeCompare(b.planDate)).slice(0, 5);
  const displayTemperature = todayWeather ? Math.round((todayWeather.temperatureMin + todayWeather.temperatureMax) / 2) : temperature;
  const reminderAlerts = useMemo(() => {
    if (!reminderPreferences?.weatherAlerts) return [];
    const alerts: string[] = [];
    const today = forecast[0];
    const tomorrow = forecast[1];
    const tomorrowPlan = plans.find((plan) => plan.planDate === tomorrow?.date);
    if (tomorrow && /雨|雷/.test(tomorrow.label)) alerts.push("明天有雨：优先替换防滑鞋，并准备轻量外套");
    if (today && tomorrow && tomorrow.temperatureMax <= today.temperatureMax - 5) alerts.push(`明天降温 ${today.temperatureMax - tomorrow.temperatureMax}°C：建议增加外套层`);
    if (tomorrowPlan && tomorrow && /雨|雷/.test(tomorrow.label)) {
      const hasCoat = tomorrowPlan.itemIds.some((id) => garments.find((item) => item.id === id)?.category === "外套");
      if (!hasCoat) alerts.push(`「${tomorrowPlan.name}」尚无外套，Muse 建议替换后再出门`);
    }
    return alerts;
  }, [forecast, garments, plans, reminderPreferences?.weatherAlerts]);

  useEffect(() => {
    if (!reminderPreferences?.eveningEnabled || reminderPreferences.notificationPermission !== "granted" || !forecast[1]) return;
    const [hours, minutes] = reminderPreferences.eveningTime.split(":").map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    const tomorrow = forecast[1];
    const plan = plans.find((item) => item.planDate === tomorrow.date);
    const notify = () => {
      const key = `muse-evening-${tomorrow.date}`;
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "sent");
      void sendMuseNotification("明日穿搭已准备好", `${tomorrow.label} ${tomorrow.temperatureMin}—${tomorrow.temperatureMax}°C · ${plan?.name || "打开 Muse 生成三套方案"}`, key);
    };
    const delay = target.getTime() - now.getTime();
    if (delay <= 0) { notify(); return; }
    const timer = window.setTimeout(notify, delay);
    return () => window.clearTimeout(timer);
  }, [forecast, plans, reminderPreferences?.eveningEnabled, reminderPreferences?.eveningTime, reminderPreferences?.notificationPermission]);

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
          <p><strong>偏好学习中</strong><small>{preference?.totalSignals ?? 0} 个信号已生效</small></p>
        </div>
        <div className="profile-chip">
          <span className="avatar">{(user.displayName || user.email).slice(0, 1).toUpperCase()}</span>
          <p><strong>{user.displayName}</strong><small>{garments.length} 件单品 · 私有空间</small></p>
          <a href="/account" aria-label="账户与隐私设置">···</a>
        </div>
        <div className="profile-links"><a href="/account">账户与隐私</a>{user.onSignOut ? <button onClick={() => void user.onSignOut?.()}>退出</button> : <a href={user.signOutPath ?? "/"}>退出</a>}</div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">M</span>Muse Closet</div>
          <div className="topbar-spacer" />
          <button className="topbar-icon" aria-label="开启穿搭提醒" onClick={() => void requestNotificationPermission()}>◌{reminderAlerts.length > 0 && <span />}</button>
          <button className="primary-button" onClick={() => setUploadOpen(true)}>
            <span>＋</span> 智能建档
          </button>
        </header>

        {view === "today" && (
          <div className="page page--today">
            <section className="hero-row">
              <div>
                <p className="eyebrow">{todayLabel}</p>
                <h1>早上好，今天穿什么？</h1>
                <p className="hero-subtitle">从你的真实衣柜出发，给出能直接穿走的答案。</p>
              </div>
              <div className="weather-card">
                <div className="weather-icon">◒</div>
                <div><strong>{displayTemperature}°</strong><span>{todayWeather?.location ?? "伦敦"} · {todayWeather?.label ?? "多云"}</span></div>
                <p>{todayWeather?.temperatureMin ?? displayTemperature - 3}°—{todayWeather?.temperatureMax ?? displayTemperature + 3}°<br /><b>{displayTemperature < 17 ? "建议加一件外套" : "适合轻盈层次"}</b></p>
              </div>
            </section>

            <section className="style-command style-command--home">
              <div><span>✦</span><p><strong>直接告诉 Muse 你要去哪、天气怎样、想呈现什么感觉</strong><small>支持中文自然语言和浏览器语音输入，Muse 会解释每套为什么适合。</small></p></div>
              <div className="style-command__input"><textarea value={naturalQuery} onChange={(event) => setNaturalQuery(event.target.value)} rows={2} /><button className={listening ? "is-listening" : ""} onClick={startVoiceInput} aria-label="语音输入">{listening ? "正在听…" : "◉ 说话"}</button><button className="primary-button" disabled={styleQueryLoading} onClick={() => void runNaturalStyleQuery()}>{styleQueryLoading ? "正在理解…" : "生成 3 套"}</button></div>
              {styleInterpretation && <div className="interpretation-chips"><span>{styleInterpretation.dateLabel}</span><span>{styleInterpretation.location} · {styleInterpretation.weatherLabel}</span><span>{styleInterpretation.occasion}</span><span>{styleInterpretation.formality}</span>{styleInterpretation.moodTags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
            </section>

            <WeatherReminderCenter preferences={reminderPreferences} forecast={forecast} plans={plans} alerts={reminderAlerts} onLocate={() => void locateWeather()} onPermission={() => void requestNotificationPermission()} onUpdate={(patch) => void updateReminderPreferences(patch)} />

            <section className="week-at-glance">
              <div className="section-heading"><div><p className="eyebrow">WEEK AHEAD</p><h2>接下来怎么穿</h2></div><button className="text-button" onClick={() => setView("calendar")}>打开穿搭日历 →</button></div>
              <div className="week-plan-row">{upcomingPlans.length ? upcomingPlans.map((plan) => <button onClick={() => setView("calendar")} key={plan.id}><span>{new Date(`${plan.planDate}T12:00:00`).toLocaleDateString("zh-CN", { weekday: "short", day: "numeric" })}</span><strong>{plan.name}</strong><small>{plan.weatherLabel} · {Math.round(plan.temperature)}°C · {plan.status === "worn" ? "已穿" : "待出门"}</small></button>) : <button className="week-empty" disabled={planningWeek} onClick={() => void planWeek()}><span>✦</span><strong>{planningWeek ? "正在读取每天的天气…" : "一键安排下周一到周五"}</strong><small>自动避开正在清洗、借出和维修的单品</small></button>}</div>
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

        {view === "calendar" && (
          <div className="page page--calendar"><CalendarPlanner garments={garments} outfits={outfits} plans={plans} forecast={forecast} planning={planningWeek} onPlanWeek={() => void planWeek()} onSchedule={(date, outfit, weather) => void scheduleOutfit(date, outfit, weather)} onWear={(plan) => void markPlanWorn(plan)} onDelete={(plan) => void deletePlan(plan)} /></div>
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
              <select className="status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>全部状态</option>{(Object.entries(availabilityLabels) as Array<[GarmentAvailabilityStatus, string]>).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
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

        {view === "canvas" && (
          <div className="page page--canvas"><OutfitCanvasStudio garments={garments} cards={outfitCards} saving={canvasSaving} onSave={(name, nextOccasion, layout, preview) => void saveOutfitCard(name, nextOccasion, layout, preview)} onDelete={(card) => void deleteOutfitCard(card)} /></div>
        )}

        {view === "studio" && (
          <div className="page">
            <section className="page-title-row">
              <div><p className="eyebrow">OUTFIT STUDIO</p><h1>搭配实验室</h1><p>先说场合和天气，也可以指定一件今天想穿的衣服。</p></div>
            </section>
            <section className="style-command style-command--studio"><div><span>✦</span><p><strong>用一句话描述今天</strong><small>例如：明天见客户，伦敦下雨，希望正式但不要像销售。</small></p></div><div className="style-command__input"><input value={naturalQuery} onChange={(event) => setNaturalQuery(event.target.value)} /><button className={listening ? "is-listening" : ""} onClick={startVoiceInput}>{listening ? "正在听…" : "◉ 语音"}</button><button className="primary-button" disabled={styleQueryLoading} onClick={() => void runNaturalStyleQuery()}>{styleQueryLoading ? "正在拆解需求…" : "让 Muse 理解"}</button></div>{styleInterpretation && <p className="style-summary">已理解：{styleInterpretation.summary}</p>}</section>
            <section className="studio-controls">
              <label><span>场合</span><select value={occasion} onChange={(event) => setOccasion(event.target.value)}>{occasions.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>温度</span><div className="range-control"><input type="range" min="-2" max="32" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} /><b>{temperature}°C</b></div></label>
              <label><span>必须穿</span><select value={mustWearId} onChange={(event) => setMustWearId(event.target.value)}><option value="">由 Muse 决定</option>{garments.filter((item) => ["available", "stored"].includes(item.availabilityStatus ?? "available")).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
              <button className="primary-button primary-button--large" onClick={() => void fetchRecommendations(garments, occasion, temperature, mustWearId)}>重新生成 3 套</button>
            </section>
            <div className="outfit-grid outfit-grid--studio">
              {outfits.map((outfit, index) => <OutfitCard outfit={outfit} featured={index === 0} key={outfit.id} />)}
            </div>
            <aside className="learning-note"><span>✦</span><p><strong>推荐为什么会变聪明？</strong>你主动替换、保存和实际穿着的信号，会直接改变下一轮排序；“实际穿着”的权重最高。</p></aside>
          </div>
        )}

        {view === "inspiration" && (
          <InspirationLibrary
            inspirations={inspirations}
            onSave={(item) => void toggleInspiration(item)}
            onUse={(item) => void applyInspiration(item)}
          />
        )}

        {view === "shopping" && (
          <div className="page page--shopping"><ShoppingAdvisor assessments={shoppingAssessments} busy={shoppingBusy} onAnalyze={(file, fields) => void analyzeShopping(file, fields)} /></div>
        )}

        {view === "intake" && (
          <div className="page"><BatchIntakeCenter jobs={intakeJobs} busy={batchBusy} onFiles={(files) => void batchUpload(files)} onApprove={(ids) => void approveIntake(ids)} onRegenerate={(id) => void regenerateIntake(id)} onUpdate={(id, fields) => void updateIntakeItem(id, fields)} /></div>
        )}

        {view === "tryon" && (
          <div className="page">
            <section className="page-title-row">
              <div><p className="eyebrow">3D BODY TWIN</p><h1>3D 数字分身</h1><p>只用身高、体重和三围，生成更自然的人体比例并完成立体搭配。</p></div>
              <span className="beta-badge">SMOOTH BODY · AI STYLE TWIN</span>
            </section>
            <BodyStudio garments={garments} />
          </div>
        )}

        {view === "diary" && (
          <div className="page page--diary"><OutfitDiary entries={diaryEntries} insights={diaryInsights} plans={plans} busy={diaryBusy} onSubmit={(form) => void saveDiary(form)} /></div>
        )}

        {view === "insights" && (
          <div className="page">
            <section className="page-title-row"><div><p className="eyebrow">WARDROBE SIGNALS</p><h1>衣橱洞察</h1><p>用穿着记录理解你的真实风格，而不是你以为的风格。</p></div></section>
            <WardrobeAnalyticsDashboard analytics={analytics} />
            <PreferenceDashboard key={preference ? `${preference.totalSignals}-${preference.exploration}-${preference.explicitStyles.join("-")}` : "loading"} profile={preference} onUpdate={updatePreference} />
          </div>
        )}
      </main>

      <nav className="mobile-nav" aria-label="移动端导航">
        {navItems.filter((item) => ["today", "calendar", "wardrobe", "canvas", "diary"].includes(item.id)).map((item) => <button className={view === item.id ? "is-active" : ""} onClick={() => setView(item.id)} key={item.id}><span>{item.icon}</span>{item.label.replace("真人穿搭", "").replace("自由", "")}</button>)}
      </nav>

      <GarmentRelationSheet relation={garmentRelation} loading={relationLoading} onClose={() => { relationRequestRef.current += 1; setGarmentRelation(null); setRelationLoading(false); }} onUseLook={useRelationLook} />

      {uploadOpen && (
        <Modal title={uploadStage === "confirm" ? "确认衣物信息" : "智能衣物建档"} eyebrow="MULTI-SOURCE INTAKE" onClose={() => setUploadOpen(false)} wide={uploadStage === "confirm"}>
          {uploadStage === "pick" && (
            <div className="upload-picker">
              <div className="intake-tabs">
                {([
                  ["photo", "衣物照片", "自动去背景"],
                  ["label", "吊牌 OCR", "读取品牌材质"],
                  ["barcode", "条码建档", "识别商品编码"],
                  ["link", "商品链接", "导入高清信息"],
                ] as Array<[IntakeMode, string, string]>).map(([mode, label, hint]) => <button className={intakeMode === mode ? "is-active" : ""} onClick={() => setIntakeMode(mode)} key={mode}><strong>{label}</strong><small>{hint}</small></button>)}
              </div>
              {intakeMode === "photo" && <button className="upload-dropzone" onClick={() => uploadInputRef.current?.click()}><span>＋</span><strong>上传衣物照片</strong><small>推荐单件平铺、背景简洁的照片</small></button>}
              {intakeMode === "label" && <button className="upload-dropzone upload-dropzone--label" onClick={() => uploadInputRef.current?.click()}><span>▤</span><strong>拍摄洗标或吊牌</strong><small>尽量让品牌、货号、材质和尺码文字清晰可见</small></button>}
              {intakeMode === "barcode" && <div className="barcode-intake"><button className="upload-dropzone upload-dropzone--barcode" onClick={() => uploadInputRef.current?.click()}><span>▥</span><strong>拍摄条码或二维码</strong><small>支持浏览器原生扫码，失败时可手动输入</small></button><div><input value={barcodeValue} onChange={(event) => setBarcodeValue(event.target.value)} placeholder="手动输入 EAN / UPC / 商品货号" /><button className="secondary-button" disabled={!barcodeValue.trim()} onClick={() => void analyzeIntake(undefined, barcodeValue.trim())}>查询并建档</button></div></div>}
              {intakeMode === "link" && <div className="link-intake"><span>↗</span><h3>粘贴官网、淘宝、京东或得物商品链接</h3><p>优先提取商品标题、品牌、货号和高清主图；所有信息仍由你确认。</p><div><input type="url" value={productLink} onChange={(event) => setProductLink(event.target.value)} placeholder="https://…" /><button className="primary-button" disabled={!productLink.trim()} onClick={() => void importProductLink()}>解析商品</button></div></div>}
              <input ref={uploadInputRef} type="file" accept="image/*" onChange={handleUploadChange} hidden />
              <div className="upload-tips"><span>01 多源识别</span><span>02 来源与货号留档</span><span>03 由你最终确认</span></div>
            </div>
          )}
          {uploadStage === "analyzing" && <div className="analyzing-state">{uploadPreview && <img src={uploadPreview} alt="待识别建档来源" />}<div className="scan-line" /><span className="sparkle">✦</span><h3>{intakeMode === "link" ? "正在读取商品信息" : intakeMode === "photo" ? "正在理解这件衣服" : "正在识别标签与编码"}</h3><p>{intakeMode === "photo" ? "清理背景 · 提取颜色 · 生成属性标签" : "品牌 · 货号 · 材质 · 商品来源"}</p></div>}
          {uploadStage === "confirm" && (
            <div className="confirm-layout">
              <div className="confirm-preview">
                {uploadPreview ? <img src={uploadPreview} alt="建档来源预览" /> : <div className="source-placeholder"><span>{intakeMode === "barcode" ? "▥" : intakeMode === "link" ? "↗" : "▤"}</span><strong>{draft.brand || "来源信息已读取"}</strong><small>{draft.productCode || "当前没有可用商品图片"}</small></div>}
                <span>{backgroundRemoved ? "✓ 背景已自动清理" : draft.sourceType === "product_link" ? "✓ 商品链接来源已记录" : draft.sourceType === "barcode" ? "✓ 条码与货号已记录" : draft.sourceType === "ocr" ? "✓ OCR 原始信息已记录" : "请确认识别结果"}</span>
              </div>
              <div className="confirm-form">
                <div className="ai-status"><span>✦</span><p><strong>多源建档已完成初步匹配</strong><small>置信度 {Math.round(draft.confidence * 100)}% · 来源 {draft.sourceType}，请确认后入柜</small></p></div>
                <label><span>衣物名称</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                <div className="form-grid"><label><span>品牌</span><input value={draft.brand} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} placeholder="待确认" /></label><label><span>商品货号 / 条码</span><input value={draft.productCode} onChange={(event) => setDraft({ ...draft, productCode: event.target.value })} placeholder="可留空" /></label><label><span>品类</span><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as GarmentCategory })}>{categoryOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>主色</span><input value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label><label><span>材质</span><input value={draft.material} onChange={(event) => setDraft({ ...draft, material: event.target.value })} /></label><label><span>季节</span><select value={draft.season} onChange={(event) => setDraft({ ...draft, season: event.target.value })}><option>四季</option><option>春夏</option><option>春秋</option><option>秋冬</option></select></label></div>
                <label><span>商品来源链接</span><input value={draft.productUrl} onChange={(event) => setDraft({ ...draft, productUrl: event.target.value })} placeholder="可留空" /></label>
                <label><span>风格标签（用、分隔）</span><input value={draft.styleTags.join("、")} onChange={(event) => setDraft({ ...draft, styleTags: event.target.value.split(/[、,，]/).filter(Boolean) })} /></label>
                <div className="modal-actions"><button className="secondary-button" onClick={() => setUploadStage("pick")}>返回修改来源</button><button className="primary-button" onClick={() => void saveGarment()}>确认并收入衣柜</button></div>
              </div>
            </div>
          )}
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
