"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";

const SW_PATH = "/sw.js";

function useServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(SW_PATH).catch(() => {});
  }, []);
}
import {
  ACTIONS,
  DIRECTIONS,
  MAP_H,
  MAP_W,
  SIZE_LABELS,
  WorldEngine,
  formatArea,
  isSnapshot,
  type ActionKey,
  type Country,
  type CapitalPlacement,
  type CountryLabelPlacement,
  type CountryRanking,
  type Direction,
  type GameMode,
  type GameRegion,
  type MapStyle,
  type MicrostateRule,
  type PolicyDecisionId,
  type PlayerPolicyDecision,
  type StrategicCampaign,
  type StrategicDefensePosture,
  type StrategicOccupation,
  type StrategicRegion,
  type SizeKey,
  type TurnPlan,
  type TurnRecord,
} from "./game-engine";
import { APP_VERSION } from "./app-version";
import { createMapRenderer, type MapRenderer } from "./webgl-map-renderer";

const STORAGE_KEY = "losy-swiata-save-v1";
const MAP_STYLE_KEY = "losy-swiata-map-style";
const ANIMATION_KEY = "losy-swiata-animation";
const MAX_SAVE_FILE_BYTES = 32 * 1024 * 1024;
const MAX_DESKTOP_RENDER_WIDTH = 4096;
const MAX_MOBILE_RENDER_WIDTH = 2304;
const MIN_ZOOM = 1;
const MAX_ZOOM = 36;
const MIN_COUNTRY_FOCUS_ZOOM = 4;
const arrows: Record<string, string> = { N: "↑", NE: "↗", E: "→", SE: "↘", S: "↓", SW: "↙", W: "←", NW: "↖" };
const actionIcons: Record<ActionKey, string> = { war: "⚔", land: "◆", erosion: "≈" };
const regionLabels: Record<GameRegion, string> = {
  world: "Cały świat",
  europe: "Europa bez Rosji",
  asia_oceania: "Azja + Australia i Oceania",
  africa: "Afryka",
  north_america: "Ameryka Północna",
  central_america_caribbean: "Ameryka Środkowa i Karaiby",
  south_america: "Ameryka Południowa",
};
const regionOptions: Array<{ key: GameRegion; icon: string; detail: string }> = [
  { key: "world", icon: "◎", detail: "Wszystkie państwa na mapie" },
  { key: "europe", icon: "EU", detail: "Państwa Europy, bez Rosji" },
  { key: "asia_oceania", icon: "AO", detail: "Azja, Rosja, Australia i Oceania" },
  { key: "africa", icon: "AF", detail: "Wszystkie państwa Afryki" },
  { key: "north_america", icon: "NA", detail: "Kanada, USA, Meksyk i północ" },
  { key: "central_america_caribbean", icon: "CA", detail: "Ameryka Środkowa oraz Karaiby" },
  { key: "south_america", icon: "SA", detail: "Wszystkie państwa Ameryki Południowej" },
];
const regionViews: Record<GameRegion, { zoom: number; x: number; y: number }> = {
  world: { zoom: 1, x: .5, y: .5 },
  europe: { zoom: 3.5, x: .54, y: .24 },
  asia_oceania: { zoom: 1.7, x: .73, y: .43 },
  africa: { zoom: 2.25, x: .55, y: .54 },
  north_america: { zoom: 2, x: .22, y: .29 },
  central_america_caribbean: { zoom: 3.6, x: .32, y: .42 },
  south_america: { zoom: 2.45, x: .35, y: .62 },
};
type WheelKey = "country" | "action" | "direction" | "size";
type Wheels = Record<WheelKey, string>;
type TurnStage = "country" | "action" | "direction" | "size" | "apply";
type TurnDraft = {
  rngBefore?: number;
  countryId?: number;
  action?: ActionKey;
  direction?: Direction;
  size?: SizeKey;
  fraction?: number;
  targetId?: number | null;
};
type Point = { x: number; y: number };
type AnimationMode = "full" | "reduced" | "off";
type SidePanel = "history" | "ranking" | "chronicle";
type RankingSortKey = "rank" | "country" | "area" | "strength" | "change" | "defeats";
type CapitalDisplay = "labels" | "markers" | "off";
type BattleFx = { x: number; y: number; direction: Direction; phase: "aim" | "clash" | "front"; key: number };
type Gesture = {
  points: Map<number, Point>;
  last: Point | null;
  pinch: { distance: number; center: Point; zoom: number; pan: Point } | null;
  moved: boolean;
  hadMulti: boolean;
};
const stageOrder: TurnStage[] = ["country", "action", "direction", "size", "apply"];
const stageLabels: Record<TurnStage, string> = {
  country: "LOSUJ KRAJ",
  action: "LOSUJ AKCJĘ",
  direction: "LOSUJ KIERUNEK",
  size: "LOSUJ WIELKOŚĆ",
  apply: "WYKONAJ AKCJĘ",
};

function wait(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

function strategicDate(turn: number) {
  const completed = Math.max(0, turn - 1);
  return `${completed % 4 + 1}. kw. ${2021 + Math.floor(completed / 4)}`;
}

const componentLabels = { economy: "Gospodarka", population: "Ludność", technology: "Technologia", logistics: "Logistyka", military: "Wojsko", stability: "Instytucje" } as const;

function randomSeed() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] || 1;
}

function chroniclePrompt(seed: number, turn: number, region: string, mode: string, ranking: Array<CountryRanking & { name: string; flag: string }>, events: TurnRecord[]) {
  const leaders = ranking.slice(0, 12).map((entry) => `${entry.rank}. ${entry.flag} ${entry.name}: ${Math.round(entry.areaKm2)} km², zmiana ${entry.changePercent.toFixed(1)}%, podboje ${entry.defeats}`).join("\n");
  const timeline = [...events].reverse().map((record) => `Tura ${record.turn}: ${record.text}`).join("\n");
  return `Napisz po polsku kronikę alternatywnego świata w stylu rzeczowego, lecz barwnego kronikarza. Nie wymyślaj wydarzeń spoza danych. Nadaj tytuł, wyróżnij 2–4 epoki i zakończ bilansem świata. Długość około 700 słów.\n\nSeed: ${seed}\nTryb: ${mode}\nRegion: ${region}\nLiczba tur: ${turn}\n\nRanking końcowy:\n${leaders}\n\nZdarzenia (chronologicznie):\n${timeline || "Brak rozegranych tur."}`;
}

function localChronicle(seed: number, turn: number, ranking: Array<CountryRanking & { name: string; flag: string }>, events: TurnRecord[]) {
  if (!turn || !events.length) return "Kronika powstanie po rozegraniu pierwszych tur świata.";
  const leader = ranking[0], riser = [...ranking].sort((a, b) => b.changePercent - a.changePercent)[0];
  const fallen = ranking.filter((entry) => !entry.active).length;
  const wars = events.filter((record) => record.action === "war");
  const erosions = events.filter((record) => record.action === "erosion");
  const lands = events.filter((record) => record.action === "land");
  const turningPoints = [...events].filter((record) => record.eliminated || record.size === "all" || record.size === "large").reverse().slice(-8);
  return `KRONIKA ŚWIATA ${seed}\n\nPo ${turn} turach porządek świata uległ głębokiej przemianie. Spośród państw uczestniczących w rozgrywce ${fallen} zniknęło z mapy, a kronikarze zapisali ${wars.length} wojen, ${erosions.length} fal erozji i ${lands.length} okresów powstawania nowego lądu.\n\nNajwiększą potęgą został${leader.name.endsWith("a") ? "a" : ""} ${leader.flag} ${leader.name}, władając obszarem około ${Math.round(leader.areaKm2).toLocaleString("pl-PL")} km². Najbardziej niezwykły wzrost od początku odnotował${riser.name.endsWith("a") ? "a" : ""} ${riser.name}: ${riser.changePercent >= 0 ? "+" : ""}${riser.changePercent.toFixed(1)}%.\n\n${turningPoints.length ? `Punkty zwrotne epoki:\n${turningPoints.map((record) => `• Tura ${record.turn}: ${record.text}`).join("\n")}` : "Była to dotąd epoka zmian stopniowych, bez jednego rozstrzygającego przełomu."}\n\nTak kończy się obecny tom kroniki. Granice pozostają jednak nietrwałe, a następne losowanie może obalić nawet największe imperium.`;
}

function Wheel({ step, label, value, icon, rolling, current, onValueClick }: { step: string; label: string; value: string; icon: string; rolling: boolean; current: boolean; onValueClick?: () => void }) {
  return (
    <div className={`wheel-card ${rolling ? "is-rolling" : ""} ${current ? "is-current" : ""}`}>
      <span className="wheel-step">{step}</span>
      <div className="wheel-orbit" aria-hidden="true"><i>{icon}</i></div>
      <div className="wheel-copy"><small>{label}</small>{onValueClick ? <button className="wheel-value" title={`${value} — pokaż na mapie`} onClick={onValueClick}>{value}</button> : <strong title={value}>{value}</strong>}</div>
    </div>
  );
}

function History({ record }: { record: TurnRecord }) {
  const strategic = record.directionShort === "REG";
  return (
    <article className="history-item">
      <span className={`history-icon ${record.action}`}>{actionIcons[record.action]}</span>
      <div>
        <header><b>Tura {record.turn}</b><em>{strategic ? "KAMPANIA" : `${SIZE_LABELS[record.size]}${record.partial ? " · CZĘŚCIOWO" : ""}`}</em></header>
        <p>{record.text}</p>
        <small>{record.countryFlag} {record.countryName} · {record.directionShort} · {strategic ? record.changedKm2 > 0 ? formatArea(record.changedKm2) : "ruch strategiczny" : record.partial ? `wykonano ${Math.round((record.actualFraction ?? 0) * 100)}% zamiast ${Math.round(record.fraction * 100)}%` : `${Math.round(record.fraction * 100)}%`}</small>
      </div>
    </article>
  );
}

export default function Home() {
  useServiceWorker();
  const [engine, setEngine] = useState<WorldEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [gameMode, setGameMode] = useState<GameMode | null>(null);
  const [gameRegion, setGameRegion] = useState<GameRegion | null>(null);
  const [pendingMode, setPendingMode] = useState<GameMode | null>(null);
  const [pendingRegion, setPendingRegion] = useState<GameRegion | null>(null);
  const [playerCountryId, setPlayerCountryId] = useState<number | null>(null);
  const [strategicTargetId, setStrategicTargetId] = useState<number | null>(null);
  const [inspectedSectorId, setInspectedSectorId] = useState<number | null>(null);
  const [strategicRegions, setStrategicRegions] = useState<StrategicRegion[]>([]);
  const [strategicCampaigns, setStrategicCampaigns] = useState<StrategicCampaign[]>([]);
  const [strategicOccupations, setStrategicOccupations] = useState<StrategicOccupation[]>([]);
  const [stage, setStage] = useState<TurnStage>("country");
  const [draft, setDraft] = useState<TurnDraft>({});
  const [turn, setTurn] = useState(0);
  const [history, setHistory] = useState<TurnRecord[]>([]);
  const [last, setLast] = useState<TurnRecord | null>(null);
  const [phase, setPhase] = useState("Przygotowuję mapę świata…");
  const [activeWheel, setActiveWheel] = useState<WheelKey | null>(null);
  const [wheels, setWheels] = useState<Wheels>({ country: "—", action: "—", direction: "—", size: "—" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [hover, setHover] = useState<{ country: Country; x: number; y: number } | null>(null);
  const [rules, setRules] = useState(false);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [activeCountries, setActiveCountries] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [mapSize, setMapSize] = useState({ width: 1, height: 1 });
  const [rendererKind, setRendererKind] = useState<"GPU" | "2D" | null>(null);
  const [autoFocusing, setAutoFocusing] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<number | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>("colors");
  const [capitalDisplay, setCapitalDisplay] = useState<CapitalDisplay>("labels");
  const [mapLabels, setMapLabels] = useState<CountryLabelPlacement[]>([]);
  const [animationMode, setAnimationMode] = useState<AnimationMode>("full");
  const [battleFx, setBattleFx] = useState<BattleFx | null>(null);
  const [seedInput, setSeedInput] = useState("");
  const [microstateRule, setMicrostateRule] = useState<MicrostateRule>("all");
  const [sidePanel, setSidePanel] = useState<SidePanel>("history");
  const [rankingSort, setRankingSort] = useState<{ key: RankingSortKey; direction: "asc" | "desc" }>({ key: "rank", direction: "asc" });
  const [expandedRankingCountryId, setExpandedRankingCountryId] = useState<number | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoRemaining, setAutoRemaining] = useState<number | null | undefined>(undefined);
  const [pauseOnMajor, setPauseOnMajor] = useState(true);
  const [chronicleOpen, setChronicleOpen] = useState(false);
  const [chronicleText, setChronicleText] = useState("");
  const [chronicleLoading, setChronicleLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backdropRef = useRef<HTMLCanvasElement>(null);
  const outlineRef = useRef<HTMLCanvasElement>(null);
  const boundaryIdentityRef = useRef<HTMLCanvasElement | null>(null);
  const boundaryAdministrativeRef = useRef<HTMLCanvasElement | null>(null);
  const mapRendererRef = useRef<MapRenderer | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const autoRunRef = useRef(false);
  const speedRef = useRef(speed);
  const selectedRef = useRef<number | null>(null);
  const activeTurnRef = useRef<number | null>(null);
  const highlightRef = useRef<number[]>([]);
  const highlightTimer = useRef<number | null>(null);
  const focusTimer = useRef<number | null>(null);
  const zoomRef = useRef(1);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const labelKeyRef = useRef("");
  const labelViewKeyRef = useRef("");
  const backdropKeyRef = useRef("");
  const fallbackBorderZoomRef = useRef(-1);
  const gestureRef = useRef<Gesture>({ points: new Map(), last: null, pinch: null, moved: false, hadMulti: false });

  useEffect(() => { speedRef.current = speed; }, [speed]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedStyle = localStorage.getItem(MAP_STYLE_KEY);
        if (savedStyle === "colors" || savedStyle === "labels" || savedStyle === "flags" || savedStyle === "hybrid" || savedStyle === "relief") setMapStyle(savedStyle);
        const savedAnimation = localStorage.getItem(ANIMATION_KEY);
        if (savedAnimation === "full" || savedAnimation === "reduced" || savedAnimation === "off") setAnimationMode(savedAnimation);
        else if (matchMedia("(prefers-reduced-motion: reduce)").matches) setAnimationMode("reduced");
      } catch { /* preferences remain at their defaults */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkVersion = async () => {
      try {
        const response = await fetch(`/?version-check=${Date.now()}`, { cache: "no-store" });
        const html = await response.text();
        const remote = html.match(/<meta[^>]+name=["']losy-swiata-version["'][^>]+content=["']([^"']+)/i)?.[1]
          ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']losy-swiata-version["']/i)?.[1];
        if (!cancelled && remote && remote !== APP_VERSION) setUpdateAvailable(true);
      } catch { /* a failed update check must never interrupt the game */ }
    };
    const onVisibility = () => { if (document.visibilityState === "visible") void checkVersion(); };
    void checkVersion();
    const timer = window.setInterval(checkVersion, 300_000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const refresh = useCallback((instance: WorldEngine) => {
    setTurn(instance.turn);
    setHistory([...instance.history].reverse());
    setLast(instance.history.at(-1) ?? null);
    setActiveCountries(instance.getActiveCountryCount());
    setPlayerCountryId(instance.playerCountryId);
    setStrategicRegions(instance.getStrategicRegions());
    setStrategicCampaigns(instance.getStrategicCampaigns());
    setStrategicOccupations(instance.getStrategicOccupations());
    setDataVersion((value) => value + 1);
  }, []);

  const autosave = useCallback((instance: WorldEngine) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(instance.snapshot())); } catch { /* storage can be unavailable */ }
  }, []);

  const applyView = useCallback((nextZoom: number, nextPan: Point) => {
    const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    const rect = mapRef.current?.getBoundingClientRect();
    const limitY = rect ? rect.height * (clampedZoom - 1) / 2 : 0;
    const circumference = rect ? rect.width * clampedZoom : 0;
    const wrappedX = circumference
      ? ((nextPan.x + circumference / 2) % circumference + circumference) % circumference - circumference / 2
      : nextPan.x;
    const clampedPan = clampedZoom === 1 ? { x: 0, y: 0 } : {
      x: wrappedX,
      y: Math.min(limitY, Math.max(-limitY, nextPan.y)),
    };
    zoomRef.current = clampedZoom;
    panRef.current = clampedPan;
    setZoom(clampedZoom);
    setPan(clampedPan);
    setHover(null);
  }, []);

  const zoomBy = useCallback((delta: number) => {
    applyView(zoomRef.current + delta, panRef.current);
  }, [applyView]);

  const resetView = useCallback(() => applyView(1, { x: 0, y: 0 }), [applyView]);

  const focusCountry = useCallback((countryId: number) => {
    if (!engine || !mapRef.current) return;
    const stats = engine.getStats()[countryId];
    if (!stats?.cells) return;

    const frame = mapRef.current;
    const rect = frame.getBoundingClientRect();
    // Small countries need a radically tighter mobile view than continental
    // powers. The cell-based fit keeps context around large states while an
    // Albania-sized state reaches roughly 22-30x instead of stopping at 12x.
    const mobile = window.matchMedia("(pointer: coarse)").matches || rect.width <= 720;
    const targetZoom = Math.min(MAX_ZOOM, Math.max(MIN_COUNTRY_FOCUS_ZOOM, (mobile ? 480 : 380) / Math.sqrt(stats.cells)));
    const targetPan = {
      x: (0.5 - stats.cx / MAP_W) * rect.width * targetZoom,
      y: (0.5 - stats.cy / MAP_H) * rect.height * targetZoom,
    };

    if (focusTimer.current) window.clearTimeout(focusTimer.current);
    setAutoFocusing(true);
    applyView(targetZoom, targetPan);
    focusTimer.current = window.setTimeout(() => setAutoFocusing(false), 560);

    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      window.setTimeout(() => frame.scrollIntoView({ behavior: "smooth", block: "center" }), 40);
    }
  }, [applyView, engine]);

  const focusStrategicRegion = useCallback((regionId: number) => {
    if (!engine || !mapRef.current) return;
    const region = engine.getStrategicRegions()[regionId];
    const indices = engine.getStrategicRegionIndices(regionId);
    if (!region || !indices.length) return;
    let minX = MAP_W, maxX = 0, minY = MAP_H, maxY = 0;
    for (const index of indices) {
      const x = index % MAP_W, y = Math.floor(index / MAP_W);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const rect = mapRef.current.getBoundingClientRect();
    const spanX = Math.max(10, maxX - minX + 1), spanY = Math.max(10, maxY - minY + 1);
    const targetZoom = Math.min(MAX_ZOOM, Math.max(8, Math.min(MAP_W * .62 / spanX, MAP_H * .62 / spanY)));
    const targetPan = {
      x: (.5 - region.cx / MAP_W) * rect.width * targetZoom,
      y: (.5 - region.cy / MAP_H) * rect.height * targetZoom,
    };
    if (focusTimer.current) window.clearTimeout(focusTimer.current);
    setAutoFocusing(true);
    applyView(targetZoom, targetPan);
    focusTimer.current = window.setTimeout(() => setAutoFocusing(false), 560);
    if (rect.top < 0 || rect.bottom > window.innerHeight) window.setTimeout(() => mapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 40);
  }, [applyView, engine]);

  const selectStrategicTarget = useCallback((regionId: number | null) => {
    setStrategicTargetId(regionId);
    if (regionId === null) return;
    const region = engine?.getStrategicRegions()[regionId];
    setPhase(`Wybrany cel: ${region?.name ?? "sektor"}. Rozegraj kwartał, aby rozpocząć kampanię.`);
    focusStrategicRegion(regionId);
  }, [engine, focusStrategicRegion]);

  const focusRegion = useCallback((region: GameRegion) => {
    if (region === "world" || !mapRef.current) { resetView(); return; }
    const rect = mapRef.current.getBoundingClientRect();
    setMapSize((current) => current.width === rect.width && current.height === rect.height ? current : { width: rect.width, height: rect.height });
    const view = regionViews[region];
    applyView(view.zoom, {
      x: (.5 - view.x) * rect.width * view.zoom,
      y: (.5 - view.y) * rect.height * view.zoom,
    });
  }, [applyView, resetView]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const instance = await WorldEngine.create();
        const saved = localStorage.getItem(STORAGE_KEY);
        let restoredMode: GameMode | null = null;
        if (saved) {
          try {
            const parsed: unknown = JSON.parse(saved);
            if (isSnapshot(parsed)) {
              instance.load(parsed);
              if (parsed.mode || parsed.turn > 0) restoredMode = instance.gameMode;
            } else localStorage.removeItem(STORAGE_KEY);
          } catch { localStorage.removeItem(STORAGE_KEY); }
        }
        if (cancelled) return;
        setEngine(instance);
        setGameMode(restoredMode);
        setGameRegion(restoredMode ? instance.gameRegion : null);
        setMicrostateRule(instance.microstateRule);
        setPlayerCountryId(instance.playerCountryId);
        setSeedInput(String(instance.seed));
        refresh(instance);
        setPhase(instance.turn ? "Wczytano ostatnią rozgrywkę" : restoredMode ? "Świat czeka na pierwszy ruch" : "Wybierz tryb nowej rozgrywki");
        setReady(true);
      } catch (error) { setPhase(error instanceof Error ? error.message : "Nie udało się przygotować mapy."); }
    }, 30);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [refresh]);

  useEffect(() => {
    if (!ready || !gameRegion) return;
    const timer = window.setTimeout(() => {
      if (gameMode === "strategy" && playerCountryId !== null) focusCountry(playerCountryId);
      else focusRegion(gameRegion);
    }, 90);
    return () => window.clearTimeout(timer);
  }, [focusCountry, focusRegion, gameMode, gameRegion, playerCountryId, ready]);

  const paint = useCallback(() => {
    if (!engine || !canvasRef.current || !backdropRef.current || !outlineRef.current || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    setMapSize((current) => current.width === rect.width && current.height === rect.height ? current : { width: rect.width, height: rect.height });
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches || rect.width <= 720;
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const mobileLimit = deviceMemory !== undefined && deviceMemory <= 4 ? 1920 : MAX_MOBILE_RENDER_WIDTH;
    const renderLimit = coarsePointer ? mobileLimit : MAX_DESKTOP_RENDER_WIDTH;
    // Render the visible geographic viewport at device resolution. Zoom no
    // longer enlarges a fixed full-world bitmap.
    // Two physical pixels per CSS pixel are enough for a crisp viewport on
    // phones; rendering the third DPR layer only burns CPU and memory.
    const effectiveRatio = Math.min(pixelRatio, coarsePointer ? 2 : 1.5);
    const targetWidth = rect.width * effectiveRatio * (coarsePointer ? 1 : 1.08);
    const canvas = canvasRef.current;
    const backdrop = backdropRef.current;
    const outline = outlineRef.current;
    const width = Math.max(2, Math.round(Math.min(renderLimit, MAP_W, targetWidth)));
    const height = Math.max(2, Math.round(width / 2));
    try {
      if (!mapRendererRef.current) {
        mapRendererRef.current = createMapRenderer(canvas);
        setRendererKind(mapRendererRef.current.kind);
      }
      mapRendererRef.current.resize(rect.width, rect.height, effectiveRatio);
    } catch {
      setPhase("Ta przeglądarka nie obsługuje szybkiego renderera mapy WebGL2.");
      return;
    }
    // The 2D fallback cannot reconstruct contours in a shader. From province
    // scale onward it therefore renders the visible viewport directly, where
    // the engine applies the same categorical marching-squares reconstruction.
    const deepViewport = !mapRendererRef.current.screenSpaceBorders && zoomRef.current > 2.15;
    const backdropWidth = deepViewport
      ? width
      : Math.max(2, Math.round(Math.min(renderLimit, MAP_W, coarsePointer ? MAX_MOBILE_RENDER_WIDTH : MAX_DESKTOP_RENDER_WIDTH)));
    const backdropHeight = Math.max(2, Math.round(backdropWidth / 2));
    const renderHighlight = !mapRendererRef.current.screenSpaceBorders && strategicTargetId !== null
      ? engine.getStrategicRegionIndices(strategicTargetId)
      : strategicTargetId !== null ? [] : highlightRef.current;
    const highlightKey = renderHighlight.join(",");
    const fallbackBorderZoom = mapRendererRef.current.screenSpaceBorders ? -1 : Math.round(zoomRef.current * 20);
    fallbackBorderZoomRef.current = fallbackBorderZoom;
    const viewport = deepViewport ? { panX: panRef.current.x / Math.max(1, rect.width), panY: panRef.current.y / Math.max(1, rect.height) } : undefined;
    const viewportKey = viewport ? `${viewport.panX.toFixed(5)}:${viewport.panY.toFixed(5)}:${zoomRef.current.toFixed(3)}` : "world";
    const backdropKey = `${engine.getMapRevision()}:${mapStyle}:${selectedRef.current ?? -1}:${activeTurnRef.current ?? -1}:${highlightKey}:${backdropWidth}:${fallbackBorderZoom}:${viewportKey}`;
    if (backdropKey !== backdropKeyRef.current) {
      if (backdrop.width !== backdropWidth || backdrop.height !== backdropHeight) { backdrop.width = backdropWidth; backdrop.height = backdropHeight; }
      const borderZoom = mapRendererRef.current.screenSpaceBorders ? 1 : zoomRef.current;
      engine.render(backdrop, renderHighlight, selectedRef.current, borderZoom, mapStyle, false, viewport, mapRendererRef.current.screenSpaceBorders);
      if (outline.width !== backdropWidth || outline.height !== backdropHeight) { outline.width = backdropWidth; outline.height = backdropHeight; }
      engine.renderTurnOutline(outline, activeTurnRef.current, deepViewport ? zoomRef.current : 1, viewport);
      if (mapRendererRef.current.screenSpaceBorders) {
        boundaryIdentityRef.current ??= document.createElement("canvas");
        boundaryAdministrativeRef.current ??= document.createElement("canvas");
        engine.renderBoundaryIds(boundaryIdentityRef.current, boundaryAdministrativeRef.current, backdropWidth, backdropHeight);
      }
      mapRendererRef.current.upload(backdrop, outline, boundaryIdentityRef.current ?? undefined, boundaryAdministrativeRef.current ?? undefined, deepViewport);
      backdropKeyRef.current = backdropKey;
    }
    mapRendererRef.current.draw({ zoom: zoomRef.current, panX: panRef.current.x / Math.max(1, rect.width), panY: -panRef.current.y / Math.max(1, rect.height), selectedOwner: selectedRef.current === null ? 0 : selectedRef.current + 1, selectedRegion: strategicTargetId === null ? 0 : strategicTargetId + 1 });
    if (mapStyle === "labels" || mapStyle === "relief") {
      const labelViewKey = `${dataVersion}:${width}:${Math.round(rect.width)}:${zoomRef.current.toFixed(3)}`;
      if (labelViewKey !== labelViewKeyRef.current) {
        labelViewKeyRef.current = labelViewKey;
        const labels = engine.countryLabelPlacements(width, rect.width, zoomRef.current);
        const labelKey = labels.map((label) => `${label.owner}:${label.x.toFixed(2)}:${label.y.toFixed(2)}:${label.fontSize.toFixed(1)}`).join("|");
        if (labelKey !== labelKeyRef.current) { labelKeyRef.current = labelKey; setMapLabels(labels); }
      }
    } else if (mapLabels.length) {
      labelViewKeyRef.current = "";
      labelKeyRef.current = "";
      setMapLabels([]);
    }
  }, [dataVersion, engine, mapLabels.length, mapStyle, strategicTargetId]);

  useEffect(() => {
    if (!engine || !mapRef.current) return;
    const observer = new ResizeObserver(paint);
    observer.observe(mapRef.current);
    paint();
    return () => observer.disconnect();
  }, [engine, paint]);

  useEffect(() => { selectedRef.current = selectedId; paint(); }, [selectedId, dataVersion, paint]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapRendererRef.current && !mapRendererRef.current.screenSpaceBorders) {
      if (zoom > 12) { paint(); return; }
      const borderZoom = Math.round(zoom * 20);
      if (borderZoom !== fallbackBorderZoomRef.current) { paint(); return; }
    }
    mapRendererRef.current?.draw({ zoom, panX: pan.x / Math.max(1, mapSize.width), panY: -pan.y / Math.max(1, mapSize.height), selectedOwner: selectedRef.current === null ? 0 : selectedRef.current + 1, selectedRegion: strategicTargetId === null ? 0 : strategicTargetId + 1 });
  }, [mapSize.height, mapSize.width, paint, pan, strategicTargetId, zoom]);

  const spin = useCallback(async (field: WheelKey, pool: string[], final: string, duration: number) => {
    setActiveWheel(field);
    const start = performance.now(), actual = Math.max(170, duration / speed);
    while (performance.now() - start < actual) {
      setWheels((current) => ({ ...current, [field]: pool[Math.floor(Math.random() * pool.length) % pool.length] }));
      await wait(Math.max(32, 70 / speed));
    }
    setWheels((current) => ({ ...current, [field]: final }));
    await wait(Math.max(80, 145 / speed));
    setActiveWheel(null);
  }, [speed]);

  const runStage = useCallback(async () => {
    if (!engine || !ready || !gameMode || busyRef.current) return;
    busyRef.current = true; setBusy(true); setMenu(false);
    try {
      if (stage === "country") {
        setBattleFx(null);
        const result = engine.rollCountry();
        if (!result) { const winner = engine.getWinner(); setPhase(winner ? `Grę wygrał: ${winner.name}` : "Nie ma już kraju, który może wykonać ruch"); return; }
        const actor = engine.getCountry(result.countryId);
        if (!actor) return;
        setWheels({ country: "—", action: "—", direction: "—", size: "—" });
        selectedRef.current = actor.id; setSelectedId(actor.id);
        setPhase("Losuję kraj…");
        await spin("country", engine.countries.map((country) => `${country.flag} ${country.name}`), `${actor.flag} ${actor.name}`, 610);
        activeTurnRef.current = actor.id; setActiveTurnId(actor.id);
        paint();
        focusCountry(actor.id);
        setDraft({ rngBefore: result.rngBefore, countryId: actor.id });
        setStage("action");
        setPhase(`${actor.name} rozpoczyna turę. Kliknij „Losuj akcję”.`);
        return;
      }

      if (stage === "action") {
        if (draft.countryId === undefined) { activeTurnRef.current = null; setActiveTurnId(null); setStage("country"); paint(); return; }
        const result = engine.rollAction(draft.countryId);
        const action = ACTIONS.find((item) => item.key === result.action);
        const availableActions = gameMode === "war" ? ACTIONS.filter((item) => item.key === "war") : ACTIONS;
        setPhase("Losuję akcję…");
        await spin("action", availableActions.map((item) => `${item.icon} ${item.label}`), `${actionIcons[result.action]} ${action?.label ?? "Akcja"}`, 520);
        if (!result.possible) {
          setPhase(`${action?.label ?? "Ta akcja"} nie ma możliwego kierunku. Kliknij „Losuj akcję” ponownie.`);
          return;
        }
        setDraft((current) => ({ ...current, action: result.action, direction: undefined, size: undefined, fraction: undefined, targetId: undefined }));
        if (result.action !== "war") setBattleFx(null);
        setWheels((current) => ({ ...current, direction: "—", size: "—" }));
        setStage("direction");
        setPhase(`Wylosowano: ${action?.label}. Kliknij „Losuj kierunek”.`);
        return;
      }

      if (stage === "direction") {
        if (draft.countryId === undefined || !draft.action) { activeTurnRef.current = null; setActiveTurnId(null); setStage("country"); setDraft({}); paint(); return; }
        const result = engine.rollDirection(draft.countryId, draft.action);
        setPhase("Losuję kierunek…");
        await spin("direction", DIRECTIONS.map((item) => `${arrows[item.short]} ${item.short}`), `${arrows[result.direction.short]} ${result.direction.short}`, 490);
        if (!result.valid) {
          setBattleFx(null);
          setPhase("W tym kierunku nie ma prawidłowego celu. Kliknij „Losuj kierunek” ponownie.");
          return;
        }
        setDraft((current) => ({ ...current, direction: result.direction, targetId: result.targetId, size: undefined, fraction: undefined }));
        if (draft.action === "war" && result.impactIndex !== null && animationMode !== "off") {
          setBattleFx({ x: ((result.impactIndex % MAP_W) + 0.5) / MAP_W * 100, y: (Math.floor(result.impactIndex / MAP_W) + 0.5) / MAP_H * 100, direction: result.direction, phase: "aim", key: Date.now() });
        } else setBattleFx(null);
        setWheels((current) => ({ ...current, size: "—" }));
        setStage("size");
        setPhase(result.attempts.length > 1
          ? `Po ${result.attempts.length} losowaniach: kierunek ${result.direction.short}. Kliknij „Losuj wielkość”.`
          : `Kierunek ${result.direction.short} jest możliwy. Kliknij „Losuj wielkość”.`);
        return;
      }

      if (stage === "size") {
        if (!draft.action) { activeTurnRef.current = null; setActiveTurnId(null); setStage("country"); setDraft({}); paint(); return; }
        const result = engine.rollSize(draft.action);
        const sizes: SizeKey[] = draft.action === "war" ? ["all", "large", "big", "medium", "small", "tiny"] : ["large", "big", "medium", "small", "tiny"];
        setPhase("Losuję wielkość zmiany…");
        await spin("size", sizes.map((size) => SIZE_LABELS[size]), SIZE_LABELS[result.size], 560);
        setDraft((current) => ({ ...current, size: result.size, fraction: result.fraction }));
        setStage("apply");
        setPhase(`Wylosowano ${SIZE_LABELS[result.size]} (${Math.round(result.fraction * 100)}%). Kliknij „Wykonaj akcję”.`);
        return;
      }

      if (draft.rngBefore === undefined || draft.countryId === undefined || !draft.action || !draft.direction || !draft.size || draft.fraction === undefined) {
        activeTurnRef.current = null; setActiveTurnId(null); setDraft({}); setStage("country"); setPhase("Losowanie zostało zresetowane — zacznij od kraju."); paint(); return;
      }
      const plan: TurnPlan = {
        rngBefore: draft.rngBefore,
        countryId: draft.countryId,
        action: draft.action,
        direction: draft.direction,
        directionAttempts: [draft.direction],
        actionWasRerolled: false,
        size: draft.size,
        fraction: draft.fraction,
        targetId: draft.targetId ?? null,
      };
      setPhase("Zmieniam granice…");
      if (draft.action === "war" && battleFx && animationMode !== "off") {
        setBattleFx((current) => current ? { ...current, phase: "clash" } : current);
        await wait(animationMode === "full" ? 360 : 90);
      } else await wait(Math.max(70, 150 / speed));
      const result = engine.apply(plan);
      highlightRef.current = result.changedIndices;
      activeTurnRef.current = null;
      setActiveTurnId(null);
      refresh(engine); autosave(engine); paint(); setPhase(result.record.text);
      if (draft.action === "war" && battleFx && animationMode !== "off") setBattleFx((current) => current ? { ...current, phase: "front" } : current);
      setDraft({}); setStage("country");
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = window.setTimeout(() => { highlightRef.current = []; setBattleFx(null); paint(); }, animationMode === "full" ? 1700 : 850);
    } finally { busyRef.current = false; setBusy(false); }
  }, [animationMode, autosave, battleFx, draft, engine, focusCountry, gameMode, paint, ready, refresh, speed, spin, stage]);

  const stopAuto = useCallback(() => {
    autoRunRef.current = false;
    setPhase("Zatrzymuję automat po bieżącej turze…");
  }, []);

  const runStrategicRound = useCallback(async (targetRegionId: number | null = strategicTargetId) => {
    if (!engine || gameMode !== "strategy" || busyRef.current) return;
    busyRef.current = true; setBusy(true); setBattleFx(null);
    try {
      const incomingBefore = new Set(engine.getStrategicCampaigns().filter(({ defenderId }) => defenderId === engine.playerCountryId).map(({ id }) => id));
      const result = engine.advanceStrategicRound(targetRegionId);
      highlightRef.current = result.changedIndices;
      refresh(engine); autosave(engine); paint();
      setStrategicTargetId(null);
      const playerCampaign = engine.getStrategicCampaigns().find(({ attackerId }) => attackerId === engine.playerCountryId);
      const conflict = engine.getPlayerCampaignConflict();
      const newIncoming = engine.getStrategicCampaigns().filter(({ id, defenderId }) => defenderId === engine.playerCountryId && !incomingBefore.has(id));
      const latest = result.records.at(-1);
      const playerRecord = result.records.findLast(({ countryId }) => countryId === engine.playerCountryId);
      if (conflict) {
        const newOwner = engine.getCountry(conflict.currentDefenderId);
        setPhase(`Cel Twojej kampanii przejął${newOwner?.name.endsWith("a") ? "a" : ""} ${newOwner?.name}. Zdecyduj, czy kontynuować atak.`);
        notify("Cel kampanii zmienił właściciela — wymagana decyzja");
      } else if (newIncoming.length) {
        const attackers = newIncoming.map(({ attackerId }) => engine.getCountry(attackerId)?.name).filter(Boolean).join(", ");
        focusStrategicRegion(newIncoming[0].regionId);
        setPhase(`ALARM: ${engine.getCountry(engine.playerCountryId)?.name ?? "Twój kraj"} został zaatakowany przez: ${attackers}.`);
        notify(`⚠ Twój kraj został zaatakowany: ${attackers}`);
      } else if (playerRecord?.text.includes("załamuje się")) {
        setPhase(playerRecord.text);
        notify("Ofensywa zakończyła się porażką");
      } else setPhase(playerCampaign
        ? `Twoja kampania: ${Math.round(playerCampaign.progress)}% · ${engine.getStrategicRegions()[playerCampaign.regionId]?.name}`
        : playerRecord?.text ?? latest?.text ?? "Runda strategiczna zakończona — wybierz kolejny cel");
    } finally { busyRef.current = false; setBusy(false); }
  }, [autosave, engine, focusStrategicRegion, gameMode, notify, paint, refresh, strategicTargetId]);

  const resolveCampaignConflict = useCallback((continueCampaign: boolean) => {
    if (!engine || busy) return;
    const resolution = engine.resolvePlayerCampaignConflict(continueCampaign);
    if (!resolution) return;
    refresh(engine); autosave(engine); paint();
    const region = engine.getStrategicRegions()[resolution.regionId], defender = engine.getCountry(resolution.currentDefenderId);
    setPhase(resolution.continued
      ? `Kontynuujesz kampanię o „${region?.name}” przeciwko ${defender?.name}. Zachowano ${Math.round(resolution.retainedProgress)}% postępu.`
      : `Wycofano wojska z kampanii o „${region?.name}”. W następnym kwartale możesz wybrać nowy cel.`);
    notify(resolution.continued ? "Kampania skierowana przeciw nowemu właścicielowi" : "Kampania przerwana");
  }, [autosave, busy, engine, notify, paint, refresh]);

  const runAuto = useCallback(async (limit: number | null) => {
    if (!engine || !ready || !gameMode || busyRef.current || stage !== "country") return;
    autoRunRef.current = true;
    busyRef.current = true;
    setBusy(true);
    setAutoRunning(true);
    setAutoRemaining(limit);
    setDraft({});
    setBattleFx(null);
    setMenu(false);
    resetView();
    let remaining = limit;
    try {
      while (autoRunRef.current && (remaining === null || remaining > 0)) {
        if (gameMode === "strategy") {
          const incomingBefore = new Set(engine.getStrategicCampaigns().filter(({ defenderId }) => defenderId === engine.playerCountryId).map(({ id }) => id));
          const result = engine.advanceStrategicRound(null);
          highlightRef.current = result.changedIndices;
          refresh(engine); autosave(engine); paint();
          const conflict = engine.getPlayerCampaignConflict();
          const newIncoming = engine.getStrategicCampaigns().filter(({ id, defenderId }) => defenderId === engine.playerCountryId && !incomingBefore.has(id));
          const playerDefeat = result.records.find(({ countryId, text }) => countryId === engine.playerCountryId && text.includes("załamuje się"));
          if (conflict || newIncoming.length || playerDefeat) {
            autoRunRef.current = false;
            if (conflict) {
              setPhase("Automat zatrzymany: cel Twojej kampanii zmienił właściciela. Wybierz, czy kontynuować.");
              notify("Cel kampanii zmienił właściciela — automat zatrzymany");
            } else if (newIncoming.length) {
              const attackers = newIncoming.map(({ attackerId }) => engine.getCountry(attackerId)?.name).filter(Boolean).join(", ");
              focusStrategicRegion(newIncoming[0].regionId);
              setPhase(`ALARM: Twój kraj został zaatakowany przez: ${attackers}. Automat zatrzymany.`);
              notify(`⚠ Atak na Twój kraj — automat zatrzymany`);
            } else if (playerDefeat) {
              setPhase(`${playerDefeat.text} Automat zatrzymany.`);
              notify("Ofensywa zakończyła się porażką — automat zatrzymany");
            }
          } else setPhase(result.records.at(-1)?.text ?? "Świat strategiczny trwa");
          if (remaining !== null) { remaining -= 1; setAutoRemaining(remaining); }
          if (engine.getWinner()) { autoRunRef.current = false; break; }
          if (autoRunRef.current) await wait(speedRef.current >= 8 ? 15 : speedRef.current >= 4 ? 80 : 180);
          continue;
        }
        const plan = engine.planTurn();
        if (!plan) { const winner = engine.getWinner(); setPhase(winner ? `Grę wygrał: ${winner.name}` : "Nie ma już kraju, który może wykonać ruch"); break; }
        const actor = engine.getCountry(plan.countryId);
        const action = ACTIONS.find((item) => item.key === plan.action);
        setWheels({
          country: actor ? `${actor.flag} ${actor.name}` : "—",
          action: `${actionIcons[plan.action]} ${action?.label ?? "Akcja"}`,
          direction: `${arrows[plan.direction.short]} ${plan.direction.short}`,
          size: SIZE_LABELS[plan.size],
        });
        selectedRef.current = actor?.id ?? null;
        setSelectedId(actor?.id ?? null);
        activeTurnRef.current = actor?.id ?? null;
        setActiveTurnId(actor?.id ?? null);
        setPhase(actor ? `Automat: ${actor.name} wykonuje ruch…` : "Automat wykonuje ruch…");
        paint();
        const beforeDelay = speedRef.current >= 8 ? 35 : speedRef.current >= 4 ? 120 : speedRef.current === 2 ? 300 : 600;
        await wait(beforeDelay);

        const result = engine.apply(plan);
        highlightRef.current = result.changedIndices;
        activeTurnRef.current = null;
        setActiveTurnId(null);
        refresh(engine);
        autosave(engine);
        paint();
        setPhase(result.record.text);
        if (remaining !== null) {
          remaining -= 1;
          setAutoRemaining(remaining);
        }
        if (pauseOnMajor && (result.record.eliminated || result.record.size === "all")) {
          autoRunRef.current = false;
          notify("Automat zatrzymał się na dużym wydarzeniu");
        }
        if (autoRunRef.current) await wait(speedRef.current >= 8 ? 15 : speedRef.current >= 4 ? 80 : 180);
      }
    } finally {
      autoRunRef.current = false;
      busyRef.current = false;
      setBusy(false);
      setAutoRunning(false);
      setAutoRemaining(undefined);
      setDraft({});
      setStage("country");
      activeTurnRef.current = null;
      setActiveTurnId(null);
      paint();
    }
  }, [autosave, engine, focusStrategicRegion, gameMode, notify, paint, pauseOnMajor, ready, refresh, resetView, stage]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.matches("input,button,select,textarea,[contenteditable=true]")) return;
      if (event.code === "Home" && playerCountryId !== null) {
        event.preventDefault();
        focusCountry(playerCountryId);
        return;
      }
      if (event.code === "Space") { event.preventDefault(); void runStage(); }
    };
    addEventListener("keydown", keyboard); return () => removeEventListener("keydown", keyboard);
  }, [focusCountry, playerCountryId, runStage]);

  const undo = () => {
    if (!engine || busy || !engine.undo()) return;
    setDraft({}); setStage("country"); setBattleFx(null); activeTurnRef.current = null; setActiveTurnId(null); highlightRef.current = []; refresh(engine); autosave(engine); paint();
    setPhase(engine.history.at(-1)?.text ?? "Cofnięto do początku rozgrywki");
    setWheels({ country: "—", action: "—", direction: "—", size: "—" }); notify("Ostatnia tura została cofnięta");
  };

  const chooseGameMode = (mode: GameMode) => {
    if (!engine || !ready || busy) return;
    setPendingMode(mode);
    setPendingRegion(null);
  };

  const requestedSeed = () => {
    const rawSeed = seedInput.trim();
    const seed = rawSeed ? Number(rawSeed) : randomSeed();
    if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) { notify("Seed musi być liczbą całkowitą od 1 do 4 294 967 295"); return null; }
    return seed;
  };

  const startConfiguredGame = (mode: GameMode, region: GameRegion, seed: number, playerId: number | null) => {
    if (!engine) return;
    engine.reset(seed, mode, region, microstateRule);
    engine.setPlayerCountry(playerId);
    setGameMode(mode); setGameRegion(region); setPlayerCountryId(playerId);
    setRankingSort(mode === "strategy" ? { key: "strength", direction: "desc" } : { key: "rank", direction: "asc" });
    setExpandedRankingCountryId(null);
    setPendingMode(null); setPendingRegion(null); setStrategicTargetId(null);
    setSeedInput(String(seed)); setSpeed(4);
    autosave(engine); refresh(engine);
    setPhase(mode === "strategy" && playerId !== null
      ? `Tryb strategiczny · dowodzisz państwem ${engine.getCountry(playerId)?.name} · wybierz cel pierwszej kampanii`
      : `${mode === "war" ? "War only" : "Tryb pełny"} · ${regionLabels[region]} — świat czeka na pierwszy ruch`);
    paint();
  };

  const chooseGameRegion = (region: GameRegion) => {
    if (!engine || !ready || !pendingMode || busy) return;
    const seed = requestedSeed();
    if (seed === null) return;
    if (pendingMode === "strategy") { setSeedInput(String(seed)); setPendingRegion(region); return; }
    startConfiguredGame(pendingMode, region, seed, null);
  };

  const choosePlayerCountry = (countryId: number) => {
    if (!pendingRegion || pendingMode !== "strategy") return;
    const seed = requestedSeed();
    if (seed === null) return;
    startConfiguredGame("strategy", pendingRegion, seed, countryId);
  };

  const newGame = () => {
    if (!engine || busy || !confirm("Rozpocząć nową rozgrywkę? Obecny świat zostanie zastąpiony.")) return;
    setDraft({}); setStage("country"); setBattleFx(null); engine.reset(); selectedRef.current = null; setSelectedId(null); activeTurnRef.current = null; setActiveTurnId(null); highlightRef.current = [];
    refresh(engine); try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage can be unavailable */ } setWheels({ country: "—", action: "—", direction: "—", size: "—" });
    engine.setMicrostateRule("all");
    setGameMode(null); setGameRegion(null); setPendingMode(null); setPendingRegion(null); setPlayerCountryId(null); setStrategicTargetId(null); setMicrostateRule("all"); setSeedInput(""); setSidePanel("history"); setSpeed(4); setPhase("Wybierz tryb nowej rozgrywki"); setMenu(false); resetView(); paint();
  };

  const saveFile = () => {
    if (!engine) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(engine.snapshot())], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `losy-swiata-tura-${turn}.json`; link.click(); URL.revokeObjectURL(url);
    setMenu(false); notify("Zapis gry został pobrany");
  };

  const saveGameLog = () => {
    if (!engine) return;
    const sectors = engine.getStrategicRegions();
    const payload = {
      format: "losy-swiata-log-v1",
      exportedAt: new Date().toISOString(),
      seed: engine.seed,
      turn: engine.turn,
      mode: engine.gameMode,
      region: engine.gameRegion,
      player: engine.playerCountryId === null ? null : engine.getCountry(engine.playerCountryId),
      territoryChanges: engine.getStrategicTerritoryLog(),
      activeCampaigns: engine.getStrategicCampaigns().map((campaign) => ({
        ...campaign,
        attacker: engine.getCountry(campaign.attackerId)?.name,
        defender: engine.getCountry(campaign.defenderId)?.name,
        sector: sectors[campaign.regionId]?.name,
      })),
      currentSectors: sectors.map((sector) => ({
        id: sector.id,
        name: sector.name,
        provinces: sector.provinceNames,
        originalCountry: engine.getCountry(sector.originalOwnerId)?.name,
        currentOwner: engine.getCountry(sector.ownerId)?.name,
        areaKm2: Math.round(sector.areaKm2),
      })),
      recentHistory: engine.history,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `losy-swiata-log-seed-${engine.seed}-tura-${engine.turn}.json`; link.click(); URL.revokeObjectURL(url);
    setMenu(false); notify("Log gry został pobrany");
  };

  const savePng = () => {
    const canvas = canvasRef.current;
    if (canvas && engine) engine.render(canvas, highlightRef.current, selectedRef.current, zoomRef.current, mapStyle, true);
    canvas?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `mapa-swiata-tura-${turn}.png`; link.click(); URL.revokeObjectURL(url); notify("Mapa PNG została pobrana");
      paint();
    }, "image/png");
    setMenu(false);
  };

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || !engine) return;
    if (busyRef.current) { notify("Poczekaj na zakończenie trwającego losowania"); return; }
    if (file.size > MAX_SAVE_FILE_BYTES) { notify("Plik zapisu jest zbyt duży"); return; }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isSnapshot(parsed)) throw new Error("To nie jest zapis gry Losy Świata.");
      engine.load(parsed); setGameMode(engine.gameMode); setGameRegion(engine.gameRegion); setMicrostateRule(engine.microstateRule); setPlayerCountryId(engine.playerCountryId); setSeedInput(String(engine.seed)); setPendingMode(null); setPendingRegion(null); setDraft({}); setStage("country"); setBattleFx(null); selectedRef.current = null; setSelectedId(null); activeTurnRef.current = null; setActiveTurnId(null); highlightRef.current = [];
      refresh(engine); autosave(engine); setPhase(engine.history.at(-1)?.text ?? "Wczytano zapis gry"); paint(); notify("Rozgrywka została wczytana");
    } catch (error) { notify(error instanceof Error ? error.message : "Nie udało się wczytać pliku"); }
    setMenu(false);
  };

  const worldPointAtPointer = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!mapRef.current) return null;
    const rect = mapRef.current.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) / rect.width;
    const screenY = (event.clientY - rect.top) / rect.height;
    const worldX = .5 + (screenX - .5 - panRef.current.x / rect.width) / zoomRef.current;
    const worldY = .5 + (screenY - .5 - panRef.current.y / rect.height) / zoomRef.current;
    return { worldX, worldY };
  }, []);

  const countryAtPointer = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = worldPointAtPointer(event);
    return engine && point ? engine.getCountryAt(point.worldX, point.worldY) : null;
  }, [engine, worldPointAtPointer]);

  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    if (!gesture.points.size) { gesture.moved = false; gesture.hadMulti = false; }
    gesture.points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture.last = { x: event.clientX, y: event.clientY };
    if (gesture.points.size >= 2) {
      const [first, second] = [...gesture.points.values()];
      gesture.hadMulti = true;
      gesture.pinch = {
        distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
        center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
        zoom: zoomRef.current,
        pan: panRef.current,
      };
    }
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* unsupported on older browsers */ }
    setHover(null);
  };

  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    const previous = gesture.points.get(event.pointerId);
    if (previous) {
      event.preventDefault();
      const current = { x: event.clientX, y: event.clientY };
      gesture.points.set(event.pointerId, current);
      if (gesture.points.size === 1) {
        const dx = current.x - previous.x, dy = current.y - previous.y;
        if (Math.abs(dx) + Math.abs(dy) > 1) gesture.moved = true;
        if (zoomRef.current > 1) applyView(zoomRef.current, { x: panRef.current.x + dx, y: panRef.current.y + dy });
        gesture.last = current;
      } else if (gesture.pinch) {
        const [first, second] = [...gesture.points.values()];
        const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
        const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, gesture.pinch.zoom * distance / gesture.pinch.distance));
        const frame = mapRef.current?.getBoundingClientRect();
        const frameCenter = frame ? { x: frame.left + frame.width / 2, y: frame.top + frame.height / 2 } : { x: 0, y: 0 };
        const scale = nextZoom / gesture.pinch.zoom;
        applyView(nextZoom, {
          x: center.x - frameCenter.x - scale * (gesture.pinch.center.x - frameCenter.x - gesture.pinch.pan.x),
          y: center.y - frameCenter.y - scale * (gesture.pinch.center.y - frameCenter.y - gesture.pinch.pan.y),
        });
        gesture.moved = true;
      }
      return;
    }

    if (event.pointerType !== "mouse" || !engine || !canvasRef.current || !mapRef.current) return;
    const country = countryAtPointer(event);
    if (!country) { if (hover) setHover(null); return; }
    const frame = mapRef.current.getBoundingClientRect();
    if (hover?.country.id === country.id) return;
    setHover({
      country,
      x: Math.min(frame.width - 145, Math.max(10, event.clientX - frame.left + 12)),
      y: Math.min(frame.height - 42, Math.max(10, event.clientY - frame.top - 12)),
    });
  };

  const finishPointer = (event: ReactPointerEvent<HTMLCanvasElement>, allowTap: boolean) => {
    const gesture = gestureRef.current;
    const wasOnlyPointer = gesture.points.size === 1 && gesture.points.has(event.pointerId);
    const isTap = allowTap && wasOnlyPointer && !gesture.moved && !gesture.hadMulti;
    gesture.points.delete(event.pointerId);
    if (isTap) {
      const point = worldPointAtPointer(event);
      const region = gameMode === "strategy" && engine && point ? engine.getStrategicRegionAt(point.worldX, point.worldY) : null;
      let choseAttackTarget = false;
      if (region && engine && strategicTargets.some(({ id }) => id === region.id) && !playerCampaign) {
        selectStrategicTarget(region.id);
        choseAttackTarget = true;
      }
      // Selecting an attackable province consumes the tap. Previously the same
      // tap continued into country inspection, opened the defender's dossier
      // and moved the camera away from the player's front.
      if (!choseAttackTarget) {
        const country = countryAtPointer(event);
        if (country) { setSelectedId(country.id); focusCountry(country.id); }
      }
    }
    if (gesture.points.size === 1) {
      gesture.last = [...gesture.points.values()][0];
      gesture.pinch = null;
    } else if (!gesture.points.size) {
      gesture.last = null;
      gesture.pinch = null;
      gesture.moved = false;
      gesture.hadMulti = false;
    }
  };

  const wheelZoom = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const frame = event.currentTarget.getBoundingClientRect();
    const oldZoom = zoomRef.current;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * Math.exp(-event.deltaY * .0015)));
    const localX = event.clientX - frame.left - frame.width / 2;
    const localY = event.clientY - frame.top - frame.height / 2;
    const worldOffsetX = (localX - panRef.current.x) / oldZoom;
    const worldOffsetY = (localY - panRef.current.y) / oldZoom;
    applyView(nextZoom, {
      x: localX - worldOffsetX * nextZoom,
      y: localY - worldOffsetY * nextZoom,
    });
  };

  const selected = useMemo(() => {
    if (!engine || selectedId === null) return null;
    const country = engine.getCountry(selectedId);
    return country ? { country, area: engine.getCountryKm2(selectedId), share: engine.getCountryShare(selectedId), version: dataVersion } : null;
  }, [dataVersion, engine, selectedId]);
  const ranking = useMemo(() => {
    if (!engine) return [];
    const strengths = gameMode === "strategy" ? new Map(engine.getStrategicStrengths().map((entry) => [entry.countryId, entry])) : null;
    return engine.getRanking()
      .filter((entry) => engine.isCountryPlayable(entry.countryId))
      .map((entry, index) => {
        const country = engine.getCountry(entry.countryId);
        return { ...entry, rank: index + 1, name: country?.name ?? "Nieznane państwo", flag: country?.flag ?? "", strength: strengths?.get(entry.countryId) ?? null };
      });
  }, [dataVersion, engine, gameMode]);
  const sortedRanking = useMemo(() => [...ranking].sort((first, second) => {
    let comparison = 0;
    if (rankingSort.key === "country") comparison = first.name.localeCompare(second.name, "pl");
    else if (rankingSort.key === "rank") comparison = first.rank - second.rank;
    else if (rankingSort.key === "area") comparison = first.areaKm2 - second.areaKm2;
    else if (rankingSort.key === "strength") comparison = (first.strength?.power ?? 0) - (second.strength?.power ?? 0);
    else if (rankingSort.key === "change") comparison = first.changePercent - second.changePercent;
    else comparison = first.defeats - second.defeats;
    return (rankingSort.direction === "asc" ? comparison : -comparison) || first.rank - second.rank;
  }), [ranking, rankingSort]);
  const changeRankingSort = useCallback((key: RankingSortKey) => setRankingSort((current) => current.key === key
    ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
    : { key, direction: key === "rank" || key === "country" ? "asc" : "desc" }), []);
  const rankingArrow = (key: RankingSortKey) => rankingSort.key === key ? rankingSort.direction === "asc" ? "↑" : "↓" : "↕";
  const winner = useMemo(() => engine?.getWinner() ?? null, [dataVersion, engine]);
  const playerCountry = engine?.getCountry(playerCountryId) ?? null;
  const playerCampaign = strategicCampaigns.find(({ attackerId }) => attackerId === playerCountryId) ?? null;
  const playerCampaignConflict = useMemo(() => engine?.getPlayerCampaignConflict() ?? null, [dataVersion, engine]);
  const playerStrength = useMemo(() => engine && playerCountryId !== null && gameMode === "strategy" ? engine.getStrategicStrength(playerCountryId) : null, [dataVersion, engine, gameMode, playerCountryId]);
  const playerDefensePolicy = useMemo(() => engine?.getPlayerDefensePolicy() ?? null, [dataVersion, engine, playerCountryId, strategicCampaigns]);
  const incomingCampaigns = useMemo(() => playerCountryId === null ? [] : strategicCampaigns.filter(({ defenderId, regionId }) => defenderId === playerCountryId && strategicRegions[regionId]?.ownerId === playerCountryId), [playerCountryId, strategicCampaigns, strategicRegions]);
  const strategicTargets = useMemo(() => engine && playerCountryId !== null ? engine.getStrategicTargets(playerCountryId) : [], [dataVersion, engine, playerCountryId]);
  const playerDefenseState = useMemo(() => engine?.getPlayerDefenseState() ?? null, [dataVersion, engine, strategicCampaigns]);
  const selectedTargetDetails = useMemo(() => {
    if (!engine || playerCountryId === null || strategicTargetId === null) return null;
    const region = strategicRegions[strategicTargetId];
    if (!region) return null;
    const owner = engine.getCountry(region.ownerId);
    const originalOwner = engine.getCountry(region.originalOwnerId);
    return {
      region,
      owner,
      originalOwner,
      strength: engine.getStrategicStrength(region.ownerId),
      assessment: engine.getStrategicWarAssessment(playerCountryId, region.ownerId, region.id),
      resistance: engine.getStrategicRegionResistance(region.id),
      occupation: strategicOccupations.find(({ regionId, ownerId }) => regionId === region.id && ownerId === region.ownerId),
    };
  }, [engine, playerCountryId, strategicOccupations, strategicRegions, strategicTargetId]);
  const selectedDossier = useMemo(() => {
    if (!engine || gameMode !== "strategy" || !selected) return null;
    const countryId = selected.country.id;
    const regions = strategicRegions.filter(({ ownerId }) => ownerId === countryId).sort((a, b) => b.areaKm2 - a.areaKm2);
    const strength = engine.getStrategicStrength(countryId);
    const outgoing = strategicCampaigns.filter(({ attackerId }) => attackerId === countryId);
    const incoming = strategicCampaigns.filter(({ defenderId, regionId }) => defenderId === countryId && strategicRegions[regionId]?.ownerId === countryId);
    const attackableRegions = strategicTargets.filter(({ ownerId }) => ownerId === countryId);
    const occupations = strategicOccupations.filter(({ ownerId, progress }) => ownerId === countryId && progress < 100);
    const provinceCount = regions.reduce((sum, region) => sum + region.provinceCount, 0);
    const assessment = playerCountryId !== null && playerCountryId !== countryId ? engine.getStrategicWarAssessment(playerCountryId, countryId) : null;
    const capabilityChanges = engine.getCountryCapabilityChanges(countryId);
    const manpower = engine.getCountryManpower(countryId);
    const regimeType = engine.getCountryRegimeType(countryId);
    const informationEnvironment = engine.getCountryInformationEnvironment(countryId);
    const combatExperience = engine.getCountryCombatExperience(countryId);
    const demographics = engine.getCountryDemographics(countryId);
    const demographicType = engine.getCountryDemographicType(countryId);
    const populationAbsolute = engine.getCountryPopulationAbsolute(countryId);
    const refugeesHosted = engine.getCountryRefugeesHosted(countryId);
    const borderPolicy = engine.getCountryBorderPolicy(countryId);
    const assimilationProgress = playerOccupations.find(o => strategicRegions[o.regionId]?.ownerId === countryId)?.progress ?? 0;
    const playerPolicyState = playerCountryId === countryId ? engine.getPlayerPolicyState() : null;
    return { countryId, regions, provinceCount, strength, outgoing, incoming, occupations, attackableRegions, assessment, capabilityChanges, manpower, regimeType, informationEnvironment, combatExperience, demographics, demographicType, populationAbsolute, refugeesHosted, borderPolicy, assimilationProgress, playerPolicyState };
  }, [engine, gameMode, playerCountryId, selected, strategicCampaigns, strategicOccupations, strategicRegions, strategicTargets, dataVersion]);
  const playerOccupations = useMemo(() => playerCountryId === null ? [] : strategicOccupations.filter(({ ownerId, progress }) => ownerId === playerCountryId && progress < 100), [playerCountryId, strategicOccupations]);
  const changeDefensePosture = useCallback((posture: StrategicDefensePosture, focusRegionId: number | null = null) => {
    if (!engine || busy) return;
    const selectedFocus = posture === "sector" ? focusRegionId ?? incomingCampaigns[0]?.regionId ?? null : null;
    if (!engine.setPlayerDefensePosture(posture, selectedFocus)) return;
    refresh(engine); autosave(engine);
    const label = posture === "continue" ? "Kontynuujesz własne operacje" : posture === "general" ? "Siły przerzucone do obrony całego kraju" : `Priorytet obrony: ${strategicRegions[selectedFocus ?? -1]?.name ?? "wybrany sektor"}`;
    setPhase(label);
    notify(label);
  }, [autosave, busy, engine, incomingCampaigns, notify, refresh, strategicRegions]);
  const activateDefenseMobilization = useCallback(() => {
    if (!engine || busy || !engine.activatePlayerMobilization()) return;
    refresh(engine); autosave(engine);
    setPhase("Ogłoszono mobilizację: +25% obrony przez dwa kwartały, +12 wyczerpania.");
    notify("Mobilizacja rozpoczęta");
  }, [autosave, busy, engine, notify, refresh]);
  const eligiblePlayerCountries = useMemo(() => {
    if (!engine || !pendingRegion) return [];
    return engine.countries.filter((country) => (pendingRegion === "world" || country.region === pendingRegion)
      && (microstateRule === "all" || engine.getCountryInitialKm2(country.id) >= 10_000))
      .sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }, [engine, microstateRule, pendingRegion]);
  const buildChronicle = useCallback(() => {
    if (!engine || !gameMode || !gameRegion) return;
    setChronicleText(localChronicle(engine.seed, turn, ranking, history));
    setChronicleOpen(true);
  }, [engine, gameMode, gameRegion, history, ranking, turn]);
  const copyText = useCallback(async (text: string, confirmation: string) => {
    try { await navigator.clipboard.writeText(text); notify(confirmation); }
    catch { notify("Nie udało się skopiować tekstu"); }
  }, [notify]);
  const copyAiPrompt = useCallback(() => {
    if (!engine || !gameMode || !gameRegion) return;
    void copyText(chroniclePrompt(engine.seed, turn, regionLabels[gameRegion], gameMode === "war" ? "War only" : gameMode === "strategy" ? "Strategiczny" : "Pełny", ranking, history), "Prompt kroniki skopiowany");
  }, [copyText, engine, gameMode, gameRegion, history, ranking, turn]);
  const generateAiChronicle = useCallback(async () => {
    if (!engine || !gameMode || !gameRegion || chronicleLoading) return;
    setChronicleLoading(true);
    try {
      const prompt = chroniclePrompt(engine.seed, turn, regionLabels[gameRegion], gameMode === "war" ? "War only" : gameMode === "strategy" ? "Strategiczny" : "Pełny", ranking, history);
      const response = await fetch("/api/chronicle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
      const payload = await response.json() as { text?: string; error?: string };
      if (!response.ok || !payload.text) throw new Error(payload.error ?? "Generator AI nie jest skonfigurowany");
      setChronicleText(payload.text);
      notify("Kronika AI jest gotowa");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Nie udało się utworzyć kroniki AI");
    } finally { setChronicleLoading(false); }
  }, [chronicleLoading, engine, gameMode, gameRegion, history, notify, ranking, turn]);
  const wheelCountryId = draft.countryId ?? last?.countryId ?? null;
  const chooseMapStyle = (style: MapStyle) => {
    setMapStyle(style);
    try { localStorage.setItem(MAP_STYLE_KEY, style); } catch { /* preference remains session-only */ }
    notify(style === "colors" ? "Mapa: kolory państw" : style === "labels" ? "Mapa: nazwy państw" : style === "flags" ? "Mapa: flagi państw" : style === "relief" ? "Mapa: relief geograficzny" : "Mapa: kolory z flagami");
  };
  const chooseAnimationMode = (mode: AnimationMode) => {
    setAnimationMode(mode);
    if (mode === "off") setBattleFx(null);
    try { localStorage.setItem(ANIMATION_KEY, mode); } catch { /* preference remains session-only */ }
    notify(mode === "full" ? "Animacje pełne" : mode === "reduced" ? "Animacje skrócone" : "Animacje wyłączone");
  };
  const battleAngle = battleFx ? Math.atan2(battleFx.direction.dy, battleFx.direction.dx) * 180 / Math.PI : 0;
  const visibleMapLabels = useMemo(() => mapLabels.flatMap((label) => [-1, 0, 1].flatMap((wrap) => {
    const x = mapSize.width / 2 + pan.x + (label.x / 100 + wrap - .5) * mapSize.width * zoom;
    const y = mapSize.height / 2 + pan.y + (label.y / 100 - .5) * mapSize.height * zoom;
    return x > -100 && x < mapSize.width + 100 && y > -60 && y < mapSize.height + 60 ? [{ ...label, wrap }] : [];
  })), [mapLabels, mapSize, pan, zoom]);
  const capitalPlacements: CapitalPlacement[] = useMemo(() => engine?.getCapitalPlacements() ?? [], [dataVersion, engine]);
  const visibleCapitals = useMemo(() => capitalPlacements.flatMap((capital) => [-1, 0, 1].flatMap((wrap) => {
    const left = mapSize.width / 2 + pan.x + (capital.x / 100 + wrap - .5) * mapSize.width * zoom;
    const top = mapSize.height / 2 + pan.y + (capital.y / 100 - .5) * mapSize.height * zoom;
    return left > -70 && left < mapSize.width + 70 && top > -35 && top < mapSize.height + 35 ? [{ ...capital, wrap, left, top }] : [];
  })), [capitalPlacements, mapSize, pan, zoom]);

  return (
    <main className="app-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top"><span className="brand-mark"><i /><i /></span><span><strong>LOSY ŚWIATA</strong><small>symulator zmiennych granic</small></span></a>
        <div className="world-status"><span><b>{turn}</b> tura</span><span><b>{activeCountries}</b> państw</span>{gameMode && <span><b>{gameMode === "war" ? "WAR ONLY" : gameMode === "strategy" ? "STRATEGICZNY" : "PEŁNY"}</b> tryb</span>}<span className={`status ${busy ? "rolling" : "ready"}`}><i />{autoRunning ? `AUTO${typeof autoRemaining === "number" ? ` · ${autoRemaining}` : ""}` : busy ? "TRWA RUNDA" : gameMode === "strategy" ? "DOWÓDZTWO" : `KROK ${stageOrder.indexOf(stage) + 1}/5`}</span></div>
        <div className="top-actions">
          <button className="text-button" onClick={() => setRules(true)}>Zasady</button>
          <div className="menu-wrap"><button className="icon-button" aria-label="Menu zapisu i eksportu" aria-expanded={menu} onClick={() => setMenu((value) => !value)}>•••</button>
            {menu && <div className="export-menu">
              <span className="menu-label">Wygląd mapy</span>
              <div className="menu-segments map-style-segments" role="group" aria-label="Wygląd mapy">
                <button className={mapStyle === "colors" ? "active" : ""} onClick={() => chooseMapStyle("colors")}>Kolory</button>
                <button className={mapStyle === "labels" ? "active" : ""} onClick={() => chooseMapStyle("labels")}>Nazwy</button>
                <button className={mapStyle === "relief" ? "active" : ""} onClick={() => chooseMapStyle("relief")}>Relief</button>
                <button className={mapStyle === "hybrid" ? "active" : ""} onClick={() => chooseMapStyle("hybrid")}>Hybrid</button>
                <button className={mapStyle === "flags" ? "active" : ""} onClick={() => chooseMapStyle("flags")}>Flagi</button>
              </div>
              <span className="menu-label">Animacje walki</span>
              <div className="menu-segments" role="group" aria-label="Animacje walki">
                <button className={animationMode === "full" ? "active" : ""} onClick={() => chooseAnimationMode("full")}>Pełne</button>
                <button className={animationMode === "reduced" ? "active" : ""} onClick={() => chooseAnimationMode("reduced")}>Krótkie</button>
                <button className={animationMode === "off" ? "active" : ""} onClick={() => chooseAnimationMode("off")}>Wył.</button>
              </div>
              <hr /><button onClick={saveFile}>Pobierz zapis gry</button><button onClick={() => fileRef.current?.click()}>Wczytaj zapis</button><button onClick={saveGameLog}>Eksportuj log gry JSON</button><button onClick={savePng}>Eksportuj mapę PNG</button><hr /><button className="danger" onClick={newGame}>Nowa rozgrywka</button>
            </div>}
          </div>
          <input ref={fileRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={loadFile} />
        </div>
      </header>

      {updateAvailable && <div className="update-banner" role="alert">
        <span><b>Dostępna jest poprawiona wersja gry.</b> Zapis pozostanie zachowany na tym urządzeniu.</span>
        <button onClick={() => window.location.reload()}>Odśwież aktualizację</button>
      </div>}

      <section className="game-layout">
        <div className="map-column">
          <header className="map-heading"><div><span className="eyebrow">{mapStyle === "relief" ? "MAPA GEOGRAFICZNA" : "MAPA POLITYCZNA"} · {gameRegion ? regionLabels[gameRegion].toUpperCase() : "STAN NA ŻYWO"}</span><h1>{last ? `Tura ${last.turn}: ${last.countryName}` : "Świat przed pierwszą turą"}</h1></div><div className="map-legend"><span><i className="change" /> ostatnia zmiana</span><span><i className="border" /> granica</span></div></header>
          <div className="map-frame" ref={mapRef}>
            {!ready && <div className="map-loader"><div className="loader-globe" /><span>{phase}</span></div>}
            <canvas ref={backdropRef} className="map-source" aria-hidden="true" />
            <canvas
              ref={canvasRef}
              className="world-map"
              aria-label={`Interaktywna ${mapStyle === "relief" ? "geograficzna" : "polityczna"} mapa świata. Rozsuń palce, aby powiększyć, i przeciągnij mapę.`}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={(event) => finishPointer(event, true)}
              onPointerCancel={(event) => finishPointer(event, false)}
              onPointerLeave={() => setHover(null)}
              onWheel={wheelZoom}
              onDoubleClick={() => zoomBy(1.25)}
            />
            <canvas
              ref={outlineRef}
              className="map-source"
              aria-hidden="true"
            />
            {(mapStyle === "labels" || mapStyle === "relief") && <div className={`country-label-layer ${autoFocusing ? "is-auto-focusing" : ""}`} aria-hidden="true">
              {visibleMapLabels.map((label) => <span key={`${label.owner}:${label.wrap}`} className="country-map-label" style={{ left: `calc(50% + ${pan.x}px + ${(label.x - 50 + label.wrap * 100) * zoom}%)`, top: `calc(50% + ${pan.y}px + ${(label.y - 50) * zoom}%)`, fontSize: `${label.fontSize}px` }}>{label.lines.map((line) => <i key={line}>{line}</i>)}</span>)}
            </div>}
            {capitalDisplay !== "off" && <div className="capital-layer" aria-hidden="true">
              {visibleCapitals.map((capital) => {
                const showName = capitalDisplay === "labels" && zoom >= 5.5;
                return <span key={`${capital.countryId}:${capital.wrap}`} className={`capital-marker ${capital.controlled ? "" : "occupied"} ${zoom < 2 ? "overview" : ""} ${showName ? "named" : ""}`} style={{ left: capital.left, top: capital.top }}><i>★</i>{showName && <b>{capital.name}</b>}</span>;
              })}
            </div>}
            {battleFx && animationMode !== "off" && <div className={`battle-layer ${animationMode}`} aria-hidden="true" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}>
              {[-100, 0, 100].map((wrap) => <div key={`${battleFx.key}:${wrap}`} className={`battle-marker ${battleFx.phase}`} style={{ left: `${battleFx.x + wrap}%`, top: `${battleFx.y}%` }}>
                <i className="battle-arrow" style={{ transform: `translate(-100%,-50%) rotate(${battleAngle}deg)` }} />
                <i className="battle-ring" />
                <span className="battle-swords">⚔</span>
              </div>)}
            </div>}
            <div className="map-shade" /><span className="coordinates">180°W&nbsp;&nbsp;&nbsp; 0° &nbsp;&nbsp;&nbsp;180°E</span>
            <div className="zoom-controls" aria-label="Powiększenie mapy">
              <button onClick={() => zoomBy(1)} aria-label="Powiększ mapę">+</button>
              <button onClick={() => zoomBy(-1)} aria-label="Pomniejsz mapę">−</button>
              <button className="zoom-reset" onClick={resetView} aria-label="Pokaż całą mapę">⌂</button>
              <button className="zoom-player" disabled={playerCountryId === null} onClick={() => { if (playerCountryId !== null) focusCountry(playerCountryId); }} title={playerCountryId === null ? undefined : "Home — wróć do swojego państwa"} aria-label={playerCountryId === null ? "Nie wybrano państwa gracza" : `Wróć do państwa ${playerCountry?.name ?? "gracza"}`}>{playerCountry?.flag ?? "◎"}</button>
              <button className={`zoom-capitals ${capitalDisplay}`} onClick={() => setCapitalDisplay((current) => current === "labels" ? "markers" : current === "markers" ? "off" : "labels")} title={capitalDisplay === "labels" ? "Stolice: gwiazdy i nazwy (nazwy od dużego zbliżenia)" : capitalDisplay === "markers" ? "Stolice: tylko gwiazdy" : "Stolice: wyłączone"} aria-label={capitalDisplay === "labels" ? "Stolice z nazwami. Kliknij, aby pozostawić same gwiazdy" : capitalDisplay === "markers" ? "Same gwiazdy stolic. Kliknij, aby wyłączyć stolice" : "Stolice wyłączone. Kliknij, aby pokazać nazwy i gwiazdy"}>{capitalDisplay === "labels" ? "★A" : capitalDisplay === "markers" ? "★" : "☆"}</button>
              <span title={rendererKind === "2D" ? "Renderer zgodnościowy Canvas 2D" : "Szybki renderer GPU"}>{Math.round(zoom * 100)}%{rendererKind ? ` · ${rendererKind}` : ""}</span>
            </div>
            <span className="zoom-hint">Rozsuń palce · przeciągnij</span>
            {selectedDossier && selected && <aside className="country-dossier" aria-label={`Informacje o państwie ${selected.country.name}`}>
              <header><span>{selected.country.flag}</span><div><small>{selectedDossier.countryId === playerCountryId ? "TWOJE PAŃSTWO" : "KARTA PAŃSTWA"}</small><h2>{selected.country.name}</h2><em>{formatArea(selected.area)}</em></div><button onClick={() => setSelectedId(null)} aria-label="Zamknij kartę państwa">×</button></header>
              <section className="dossier-strength"><div><small>POTENCJAŁ</small><strong>{selectedDossier.strength.rating}<i>/100</i></strong><em>{selectedDossier.strength.tier}</em></div><div><small>RANKING POTENCJAŁU</small><strong>#{selectedDossier.strength.rank || "—"}</strong><em>z {selectedDossier.strength.activeCountries}</em></div><div><small>WYNIK MODELU</small><strong>{Math.round(selectedDossier.strength.power)}</strong><em>baza 2021 + stan gry</em></div></section>
              <section className="capacity-breakdown"><header><b>MOŻLIWOŚCI PAŃSTWA</b><span>0–100</span></header><div>{Object.entries(selectedDossier.strength.components).map(([key, value]) => { const v = Math.max(0, Math.min(100, value)); return <span key={key}><small>{componentLabels[key as keyof typeof componentLabels]}</small><b>{Math.round(v)}</b><i><em style={{ width: `${Math.min(100, v)}%` }} /></i></span>; })}</div><footer><span>Wyczerpanie wojenne <b>{Math.round(selectedDossier.strength.exhaustion)}%</b></span><span>Integracja zdobyczy <b>{Math.round(selectedDossier.strength.integration)}%</b></span></footer></section>
              {selectedDossier.capabilityChanges.length > 0 && <section className="capability-changes"><header><b>ZMIANY POTENCJAŁU</b> <span>ostatnia tura</span></header><div>{selectedDossier.capabilityChanges.map((item) => <span key={item.key} className={`capability-change ${item.trend}`}><small>{item.label}</small><b>{item.value}</b><strong>{item.delta}</strong></span>)}</div><footer><span>Niepewność wywiadu <b>{Math.round((engine?.getCountryCapabilityState(selectedDossier.countryId)?.uncertainty ?? 0) * 100)}%</b></span><span>Każdy wskaźnik zmienia się w własnym tempie.</span></footer></section>}
              <section className="dossier-stats"><div><span>Sektory</span><b>{selectedDossier.regions.length}</b></div><div><span>Prowincje</span><b>{selectedDossier.provinceCount}</b></div><div><span>Ofensywy</span><b>{selectedDossier.outgoing.length}</b></div><div><span>Obrona</span><b>{selectedDossier.incoming.length}</b></div></section>
              {selectedDossier.assessment && <section className={`war-assessment ${selectedDossier.assessment.level}`}><small>TWOJA OFENSYWA PRZECIW TEMU KRAJOWI</small><strong>{selectedDossier.assessment.label}</strong><div><i style={{ width: `${selectedDossier.assessment.chance}%` }} /></div><p>Szansa powodzenia: <b>{selectedDossier.assessment.chance}%</b>. Obrona własnego regionu daje przeciwnikowi +15%; {selectedDossier.assessment.front.attackerFronts > 1 ? `Twoje ${selectedDossier.assessment.front.attackerFronts} fronty rozpraszają siły.` : "nie masz kary za wiele frontów."} Każdy kwartał zawiera jawny czynnik losowy.</p></section>}
              {selectedDossier.attackableRegions.length > 0 && <section className="dossier-targets"><header><b>DOSTĘPNE CELE</b><span>{selectedDossier.attackableRegions.length}</span></header>{selectedDossier.attackableRegions.map((region) => <button key={region.id} disabled={Boolean(playerCampaign)} onClick={() => selectStrategicTarget(region.id)}><span>{region.name}</span><b>{formatArea(region.areaKm2)}</b><i>WYBIERZ I POKAŻ →</i></button>)}</section>}
              <section className="dossier-regions"><header><b>KONTROLOWANE SEKTORY</b><span>{selectedDossier.regions.length}</span></header><div>{selectedDossier.regions.slice(0, 8).map((region) => <button key={region.id} className={inspectedSectorId === region.id ? "active" : ""} onClick={() => { setInspectedSectorId(region.id); highlightRef.current = engine?.getStrategicRegionIndices(region.id) ?? []; paint(); }}><span>{region.name}</span><b>{region.provinceCount} prow. · {formatArea(region.areaKm2)}</b></button>)}</div>{selectedDossier.regions.length > 8 && <small>oraz {selectedDossier.regions.length - 8} kolejnych sektorów</small>}</section>
              {inspectedSectorId !== null && strategicRegions[inspectedSectorId]?.ownerId === selectedDossier.countryId && <section className="sector-composition"><header><b>SKŁAD SEKTORA</b><span>{strategicRegions[inspectedSectorId].provinceCount}</span></header><strong>{strategicRegions[inspectedSectorId].name}</strong><p>{strategicRegions[inspectedSectorId].provinceNames.join(" · ")}</p></section>}
            </aside>}
            {hover && <div className="map-tooltip" style={{ left: hover.x, top: hover.y }}><span>{hover.country.flag}</span><strong>{hover.country.name}</strong></div>}
            {last && <div className={`event-ribbon ${last.action}`}><span>{actionIcons[last.action]}</span><p>{last.text}</p><b>{last.directionShort}</b></div>}
            {winner && <div className="winner-announcement" role="status"><span>KONIEC ROZGRYWKI</span><p>GRĘ WYGRAŁ:</p><h2>{winner.flag} {winner.name}</h2><button onClick={newGame}>Nowa rozgrywka</button></div>}
          </div>
          <div className="map-footer"><div className="phase-line"><i className={busy ? "pulse" : ""} /><p>{phase}</p></div>
            {selected && <div className="selected-country"><span>{selected.country.flag}</span><div><strong>{selected.country.name}</strong><small>{formatArea(selected.area)} · {Math.round(selected.share * 100)}% stanu początkowego</small></div><button onClick={() => setSelectedId(null)} aria-label="Zamknij">×</button></div>}
          </div>
        </div>

        <aside className="controls">
          <header className="control-heading"><div><span className="eyebrow">{gameMode === "war" ? "WAR ONLY" : gameMode === "strategy" ? "TRYB STRATEGICZNY" : "TRYB PEŁNY"} · {gameRegion ? regionLabels[gameRegion].toUpperCase() : "CAŁY ŚWIAT"} · {gameMode === "strategy" ? strategicDate(turn + 1).toUpperCase() : `TURA ${turn + 1} · KROK ${stageOrder.indexOf(stage) + 1} Z 5`}</span><h2>{gameMode === "strategy" ? "Dowództwo państwa" : "Koła losujące"}</h2></div><div className="speed">{[1, 2, 4, 8].map((value) => <button key={value} className={speed === value ? "active" : ""} onClick={() => setSpeed(value)}>{value}×</button>)}</div></header>
          <button className="current-seed" disabled={!engine} title="Kliknij, aby skopiować seed tej rozgrywki" onClick={() => engine && void copyText(String(engine.seed), "Seed skopiowany")}><span>SEED TEGO ŚWIATA</span><b>{engine?.seed ?? "—"}</b><i>⧉ KOPIUJ</i></button>
          {gameMode === "strategy" ? <div className="strategy-command" aria-live="polite">
            <div className="strategy-player">
              <span>{playerCountry?.flag ?? "◎"}</span>
              <div><small>TWOJE PAŃSTWO</small><strong>{playerCountry?.name ?? "—"}</strong><em>{playerCountryId === null ? "Brak dowódcy" : `${strategicRegions.filter(({ ownerId }) => ownerId === playerCountryId).length} sektorów · ${strategicRegions.filter(({ ownerId }) => ownerId === playerCountryId).reduce((sum, region) => sum + region.provinceCount, 0)} prowincji`}</em></div>
              {playerStrength && <div className="strategy-strength" title={`Potencjał państwa łączy gospodarkę, ludność, technologię, logistykę, wojsko i sprawność instytucji. Zdobycze dają tylko część zasobów do czasu asymilacji, a wyczerpanie wojenne obniża wynik. Siła na konkretnym froncie jest liczona osobno.`}><small>POTENCJAŁ PAŃSTWA</small><strong>{playerStrength.rating}<i>/100</i></strong><em>{playerStrength.tier} · #{playerStrength.rank} z {playerStrength.activeCountries}</em><b>wynik modelu {Math.round(playerStrength.power)} · wyczerpanie {Math.round(playerStrength.exhaustion)}%</b></div>}
              {selectedDossier?.manpower && <div className="manpower-card"><header><b>SIŁY ZBROJNE</b><span>dane wywiadu</span></header><div><span><small>Dysponujacy</small><b>{selectedDossier.manpower.available}</b><small>na {selectedDossier.manpower.active} aktywnych, {selectedDossier.manpower.reserves} rezerwy</small></span><span><small>Koszt utrzymania</small><b>{selectedDossier.manpower.maintenanceCost.toFixed(1)}</b><small>jednostek/kwartał</small></span><span><small>Mobilizacja</small><b>{selectedDossier.manpower.mobilization === "hidden" ? "Ukryta" : selectedDossier.manpower.mobilization === "open" ? "Jawna" : "Pełna"}</b><small>{selectedDossier.manpower.mobilization === "full" ? "+35% obrony" : selectedDossier.manpower.mobilization === "open" ? "+10-25% obrony" : "zwykła gotowość"}</small></span></div></div>}
              {selectedDossier?.regimeType && <section className="regime-card"><header><b>REŻIM</b><span>typ systemu politycznego</span></header><div><span><small>System</small><b>{engine?.getRegimeLabel(selectedDossier.regimeType)}</b></span><span><small>Doświadczenie bojowe</small><b>{Math.round(selectedDossier.combatExperience)}</b><small>punktów</small></span></div></section>}
              {selectedDossier?.informationEnvironment && <section className="information-card"><header><b>ŚRODOWISKO INFORMACYJNE</b><span>{engine?.getInformationEnvironmentLabel(selectedDossier.informationEnvironment.score)}</span></header><div><span><small>Technologia</small><b>{Math.round(selectedDossier.informationEnvironment.techComponent)}</b><small>dostęp do platform</small></span><span><small>Kontrola mediów</small><b>{Math.round(selectedDossier.informationEnvironment.mediaControl)}</b><small>cenzura/propaganda</small></span><span><small>Służby specjalne</small><b>{Math.round(selectedDossier.informationEnvironment.servicesStrength)}</b><small>inwigilacja</small></span></div></section>}
              {selectedDossier?.demographics && <section className="demographics-card"><header><b>DEMOGRAFIA</b><span>{engine?.getDemographicLabel(selectedDossier.demographicType)}</span></header><div className="demographics-bars">{Object.entries(selectedDossier.demographics).map(([key, value]) => <span key={key}><small>{key === "children" ? "Dzieci 0-14" : key === "youth" ? "Młodzież 15-24" : key === "primeAge" ? "Najlepszy wiek 25-44" : key === "middleAge" ? "Średni wiek 45-64" : key === "elderly" ? "Seniorzy 65+" : "80+ lat"}</small><b>{Math.round((value ?? 0) * 100)}%</b><i><em style={{ width: `${Math.min(100, Math.max(0, (value ?? 0) * 100))}%` }} /></i></span>)}</div><footer><span>Ludność bezwzględna: <b>{engine?.getCountryPopulationAbsolute(selectedDossier.countryId) ? Math.round(engine.getCountryPopulationAbsolute(selectedDossier.countryId)).toLocaleString("pl-PL") + " osób" : "—"}</b></span><span>Typ piramidy: <b>{engine?.getDemographicLabel(selectedDossier.demographicType)}</b></span><span>Granice: <b>{selectedDossier.borderPolicy === "closed" ? "Zamknięte" : selectedDossier.borderPolicy === "selective" ? "Selektywne" : selectedDossier.borderPolicy === "open" ? "Otwarte" : "Masowe"}</b></span></footer></section>}
              {selectedDossier?.demographics && <section className="demographics-card"><header><b>DEMOGRAFIA</b><span>{engine?.getDemographicLabel(selectedDossier.demographicType)}</span></header><div className="demographics-bars">{Object.entries(selectedDossier.demographics).map(([key, value]) => <span key={key}><small>{key === "children" ? "Dzieci 0-14" : key === "youth" ? "Młodzież 15-24" : key === "primeAge" ? "Najlepszy wiek 25-44" : key === "middleAge" ? "Średni wiek 45-64" : key === "elderly" ? "Seniorzy 65+" : "80+ lat"}</small><b>{Math.round((value ?? 0) * 100)}%</b><i><em style={{ width: `${Math.min(100, Math.max(0, (value ?? 0) * 100))}%` }} /></i></span>)}</div><footer><span>Ludność bezwzględna: <b>{engine?.getCountryPopulationAbsolute(selectedDossier.countryId) ? Math.round(engine.getCountryPopulationAbsolute(selectedDossier.countryId)).toLocaleString("pl-PL") + " osób" : "—"}</b></span><span>Typ piramidy: <b>{engine?.getDemographicLabel(selectedDossier.demographicType)}</b></span><span>Granice: <b>{selectedDossier.borderPolicy === "closed" ? "Zamknięte" : selectedDossier.borderPolicy === "selective" ? "Selektywne" : selectedDossier.borderPolicy === "open" ? "Otwarte" : "Masowe"}</b></span></footer></section>}
              {selectedDossier?.playerPolicyState && selectedDossier.countryId === playerCountryId && (() => {
                const policyState = selectedDossier.playerPolicyState;
                const policies = engine ? engine.getAvailablePlayerPolicies(playerCountryId) : [];
                return <section className="policy-card"><header><b>DECYZJE PREZYDENTA</b><span>punkty decyzyjne: <b className="policy-points">{policyState.decisionPoints}</b></span></header><div className="policy-list">{policies.length ? policies.map((policy) => <div key={policy.id} className="policy-item"><div><small>{policy.name}</small><b>{policy.cost} PD · {policy.cooldown} kw. cooldown</b><small>{policy.description}</small></div><button disabled={busy || policyState.decisionPoints < policy.cost || policy.lastUsedTurn > 0} onClick={() => { if (engine && engine.activatePlayerPolicy(policy.id)) { refresh(engine); autosave(engine); notify(`Aktywowano: ${policy.name}`); } }}>Wykonaj</button></div>) : <small>Brak dostępnych aktów w tej turze.</small>}</div></section>;
              })()}
            </div>
            {playerOccupations.length > 0 && <section className="occupation-list"><header><b>ASYMILACJA ZDOBYCZY</b><span>{playerOccupations.length} równocześnie · wolniej</span></header>{playerOccupations.slice(0, 5).map((occupation) => <div key={occupation.regionId}><span>{strategicRegions[occupation.regionId]?.name}</span><b>{Math.round(occupation.progress)}%</b><i><em style={{ width: `${occupation.progress}%` }} /></i><small>+{occupation.lastGain.toFixed(1)} pkt/kw.</small></div>)}</section>}
            {playerDefensePolicy && <div className="diplomatic-balance"><span>◉ RÓWNOWAGA SIŁ</span><p>{playerDefensePolicy.protectedRounds > 0 ? `Pakt o nieagresji: jeszcze ${playerDefensePolicy.protectedRounds} ${playerDefensePolicy.protectedRounds === 1 ? "kwartał" : "kwartały"}.` : `Przeciw Tobie może trwać jednocześnie maksymalnie ${playerDefensePolicy.maxIncoming === 1 ? "1 kampania" : "2 kampanie"}.`}</p></div>}
            {incomingCampaigns.length > 0 && <section className="defense-alert" role="alert">
              <header><span>⚠</span><div><b>{playerCountry?.name?.toUpperCase()} JEST ATAKOWANA</b><small>{incomingCampaigns.length === 1 ? "1 wroga kampania" : `${incomingCampaigns.length} wrogie kampanie`}</small></div></header>
              {incomingCampaigns.map((campaign) => <div key={campaign.id}><span>{engine?.getCountry(campaign.attackerId)?.flag} {engine?.getCountry(campaign.attackerId)?.name}</span><strong>{strategicRegions[campaign.regionId]?.name}</strong><b>{Math.round(campaign.progress)}%</b></div>)}
              <div className="defense-decisions">
                <button className={playerDefenseState?.posture === "continue" ? "active" : ""} onClick={() => changeDefensePosture("continue")}><b>Kontynuuj operacje</b><small>Pełna ofensywa · zwykła obrona</small></button>
                <button className={playerDefenseState?.posture === "general" ? "active" : ""} onClick={() => changeDefensePosture("general")}><b>Obrona całego kraju</b><small>+30% obrony · ofensywa −2 pkt/kw. · szybsze wyczerpanie</small></button>
                <button className={playerDefenseState?.posture === "sector" ? "active" : ""} onClick={() => changeDefensePosture("sector")}><b>Broń kluczowego sektora</b><small>+50% tutaj · −10% na innych frontach · ofensywa wstrzymana</small></button>
              </div>
              {playerDefenseState?.posture === "sector" && <label className="defense-focus"><span>PRIORYTET OBRONY</span><select value={playerDefenseState.focusRegionId ?? incomingCampaigns[0]?.regionId ?? ""} onChange={(event) => changeDefensePosture("sector", Number(event.target.value))}>{incomingCampaigns.map((campaign) => <option key={campaign.regionId} value={campaign.regionId}>{strategicRegions[campaign.regionId]?.name} · {engine?.getCountry(campaign.attackerId)?.name}</option>)}</select></label>}
              <button className="mobilization-button" disabled={!playerDefenseState?.mobilizationReady || busy} onClick={activateDefenseMobilization}>{playerDefenseState?.mobilizationActive ? `MOBILIZACJA TRWA · ${playerDefenseState.mobilizationRoundsLeft} KW.` : playerDefenseState?.mobilizationReady ? "OGŁOŚ MOBILIZACJĘ · +25% OBRONY NA 2 KWARTAŁY" : `MOBILIZACJA DOSTĘPNA ZA ${playerDefenseState?.mobilizationCooldownLeft ?? 0} KW.`}<small>Natychmiastowy koszt: +12 wyczerpania</small></button>
            </section>}
            {playerCampaignConflict ? <div className="campaign-conflict" role="alert">
              <header><span>CEL ZMIENIŁ WŁAŚCICIELA</span><b>{Math.round(playerCampaignConflict.campaign.progress)}%</b></header>
              <strong>{strategicRegions[playerCampaignConflict.campaign.regionId]?.name}</strong>
              <p>{engine?.getCountry(playerCampaignConflict.campaign.defenderId)?.flag} {engine?.getCountry(playerCampaignConflict.campaign.defenderId)?.name} utracił ten region. Obecny właściciel to {engine?.getCountry(playerCampaignConflict.currentDefenderId)?.flag} {engine?.getCountry(playerCampaignConflict.currentDefenderId)?.name}.</p>
              <small>Kontynuacja zachowa 70% obecnego postępu i rozpocznie wojnę z nowym właścicielem.</small>
              <div><button onClick={() => resolveCampaignConflict(true)}>⚔ Kontynuuj atak</button><button onClick={() => resolveCampaignConflict(false)}>Wycofaj wojska</button></div>
            </div> : playerCampaign ? <div className="campaign-card active"><header><span>⚔ AKTYWNA KAMPANIA</span><b>{Math.round(playerCampaign.progress)}%</b></header><strong>{strategicRegions[playerCampaign.regionId]?.name}</strong><small>Przeciwnik: {engine?.getCountry(playerCampaign.defenderId)?.flag} {engine?.getCountry(playerCampaign.defenderId)?.name} · {strategicRegions[playerCampaign.regionId]?.provinceCount ?? 1} prow. · kwartał kampanii {playerCampaign.turns + 1} · siła przeciwnika {engine?.getStrategicStrength(playerCampaign.defenderId).rating}/100</small>{playerCampaign.lastRandomFactor && <small className="campaign-roll">Ostatni kwartał: los ×{playerCampaign.lastRandomFactor.toFixed(2)} · zmiana frontu {playerCampaign.lastMomentum! >= 0 ? "+" : ""}{playerCampaign.lastMomentum?.toFixed(1)} pkt</small>}<div><i style={{ width: `${playerCampaign.progress}%` }} /></div></div> : <><label className="strategy-target"><span>CEL NOWEJ KAMPANII</span><select value={strategicTargetId ?? ""} onChange={(event) => selectStrategicTarget(event.target.value ? Number(event.target.value) : null)}><option value="">Bez nowej wojny w tym kwartale</option>{strategicTargets.map((region) => <option key={region.id} value={region.id}>{engine?.getCountry(region.ownerId)?.flag} {region.name} · {region.provinceCount} prow. · siła {engine?.getStrategicStrength(region.ownerId).rating}/100 · {formatArea(region.areaKm2)}</option>)}</select><small>Wybranie celu automatycznie pokazuje go na mapie. Można atakować sektor lądowo sąsiedni albo położony do 500 km przez nieprzerwane morze.</small></label>
            {selectedTargetDetails && <section className={`target-intelligence ${selectedTargetDetails.assessment.level}`}><header><span>ROZPOZNANIE CELU</span><b>{selectedTargetDetails.assessment.chance}% SZANS</b></header><h3>{selectedTargetDetails.region.name}</h3><p>{selectedTargetDetails.owner?.flag} Kontrola: <b>{selectedTargetDetails.owner?.name}</b>{selectedTargetDetails.originalOwner?.id !== selectedTargetDetails.owner?.id ? ` · historycznie w grze: ${selectedTargetDetails.originalOwner?.name}` : ""}</p><div><span><small>Powierzchnia</small><b>{formatArea(selectedTargetDetails.region.areaKm2)}</b></span><span><small>Prowincje</small><b>{selectedTargetDetails.region.provinceCount}</b></span><span><small>Opór sektora</small><b>{selectedTargetDetails.resistance.label} ×{selectedTargetDetails.resistance.factor.toFixed(2)}</b></span><span><small>Potencjał obrońcy</small><b>{selectedTargetDetails.strength.rating}/100</b></span></div><strong>{selectedTargetDetails.assessment.label}</strong>{selectedTargetDetails.occupation && <em>Integracja obecnego właściciela: {Math.round(selectedTargetDetails.occupation.progress)}%</em>}<small>{selectedTargetDetails.region.provinceNames.join(" · ")}</small></section>}</>}
            <button className="strategy-round" disabled={!ready || busy || !playerCountry || Boolean(playerCampaignConflict)} onClick={() => void runStrategicRound()}>{busy ? "AI rozgrywa kwartał…" : playerCampaignConflict ? "Najpierw zdecyduj o kampanii" : playerCampaign ? "Kontynuuj kampanię i rozegraj kwartał" : strategicTargetId === null ? "Rozegraj kwartał bez wojny" : "Rozpocznij kampanię i rozegraj kwartał"}</button>
            <div className="auto-controls" aria-label="Automatyczna symulacja strategiczna">{autoRunning ? <button className="auto-stop" onClick={stopAuto}>■ Zatrzymaj po tym kwartale</button> : <><button disabled={busy} onClick={() => void runAuto(10)}>▶ 10 kwartałów</button><button disabled={busy} onClick={() => void runAuto(50)}>▶ 50 kwartałów</button><button disabled={busy} onClick={() => void runAuto(null)}>∞ Ciągły</button></>}</div>
            <div className="campaign-overview"><header><b>WOJNY ŚWIATA</b><span>{strategicCampaigns.length} aktywnych</span></header>{strategicCampaigns.slice().sort((a,b)=>b.progress-a.progress).slice(0,6).map((campaign) => <button key={campaign.id} onClick={() => { const region=strategicRegions[campaign.regionId]; if(region){ setSelectedId(region.ownerId); focusCountry(region.ownerId); } }}><span>{engine?.getCountry(campaign.attackerId)?.flag} {engine?.getCountry(campaign.attackerId)?.name}</span><i>→</i><span>{engine?.getCountry(campaign.defenderId)?.flag} {strategicRegions[campaign.regionId]?.name}</span><b>{Math.round(campaign.progress)}%</b></button>)}</div>
          </div> : <><div className="wheel-grid" aria-live="polite">
            <Wheel step="01" label="Kraj" value={wheels.country} rolling={activeWheel === "country"} current={stage === "country"} icon="◎" onValueClick={wheelCountryId === null ? undefined : () => { setSelectedId(wheelCountryId); focusCountry(wheelCountryId); }} />
            <Wheel step="02" label="Akcja" value={wheels.action} rolling={activeWheel === "action"} current={stage === "action"} icon="△" />
            <Wheel step="03" label="Kierunek" value={wheels.direction} rolling={activeWheel === "direction"} current={stage === "direction"} icon={wheels.direction.split(" ")[0] || "↑"} />
            <Wheel step="04" label="Wielkość" value={wheels.size} rolling={activeWheel === "size"} current={stage === "size"} icon="%" />
          </div>
          <div className="primary-controls">
            <button className={`turn-button ${stage === "apply" ? "apply" : ""}`} disabled={!ready || !gameMode || busy} onClick={() => void runStage()}><span>{busy ? (stage === "apply" ? "ZMIENIAM GRANICE" : "TRWA LOSOWANIE") : stageLabels[stage]}</span><kbd>SPACJA</kbd></button>
            <div className="secondary-controls"><button disabled={!engine?.canUndo() || busy} onClick={undo}><span>↶</span> Cofnij ostatnią turę</button></div>
            <div className="auto-controls" aria-label="Automatyczna symulacja">
              {autoRunning ? <button className="auto-stop" onClick={stopAuto}>■ Zatrzymaj po tej turze</button> : <>
                <button disabled={!ready || !gameMode || busy || stage !== "country"} onClick={() => void runAuto(10)}>▶ 10 tur</button>
                <button disabled={!ready || !gameMode || busy || stage !== "country"} onClick={() => void runAuto(50)}>▶ 50 tur</button>
                <button disabled={!ready || !gameMode || busy || stage !== "country"} onClick={() => void runAuto(null)}>∞ Ciągły</button>
              </>}
            </div>
            <label className="major-toggle"><input type="checkbox" checked={pauseOnMajor} disabled={autoRunning} onChange={(event) => setPauseOnMajor(event.target.checked)} /> Pauza po eliminacji lub wyniku ALL</label>
          </div></>}
          <div className="history-panel world-panel">
            <nav className="panel-tabs" aria-label="Informacje o świecie">
              <button className={sidePanel === "history" ? "active" : ""} onClick={() => setSidePanel("history")}>Historia</button>
              <button className={sidePanel === "ranking" ? "active" : ""} onClick={() => setSidePanel("ranking")}>Ranking</button>
              <button className={sidePanel === "chronicle" ? "active" : ""} onClick={() => setSidePanel("chronicle")}>Kronika</button>
            </nav>
            {sidePanel === "history" && <><header><h3>Historia świata</h3><span>{history.length ? `${history.length} ostatnich zdarzeń` : "brak zdarzeń"}</span></header><div className="history-list">{history.length ? history.slice(0, 12).map((record) => <History key={`${record.turn}-${record.countryId}`} record={record} />) : <div className="empty-history"><span>◇</span><p>Pierwsza zmiana granic pojawi się tutaj po rozegraniu tury.</p></div>}</div></>}
            {sidePanel === "ranking" && <>
              <header><h3>{gameMode === "strategy" ? "Ranking potencjału" : "Ranking państw"}</h3><span>{activeCountries} aktywnych</span></header>
              {gameMode === "strategy" && <p className="ranking-note">Domyślnie według potencjału państwa. Ranking terytorialny pozostaje osobną kolumną.</p>}
              <div className={`ranking-head sortable ${gameMode === "strategy" ? "with-strength" : ""}`}>
                <button onClick={() => changeRankingSort("rank")} title="Pozycja według kontrolowanego obszaru"># TER. {rankingArrow("rank")}</button>
                <button onClick={() => changeRankingSort("country")}>Państwo {rankingArrow("country")}</button>
                <button onClick={() => changeRankingSort("area")}>Obszar {rankingArrow("area")}</button>
                {gameMode === "strategy" && <button onClick={() => changeRankingSort("strength")}>Potencjał {rankingArrow("strength")}</button>}
                <button onClick={() => changeRankingSort("change")}>Zmiana {rankingArrow("change")}</button>
                <button onClick={() => changeRankingSort("defeats")}>Podboje {rankingArrow("defeats")}</button>
              </div>
              <div className={`ranking-list ${gameMode === "strategy" ? "with-strength" : ""}`}>
                {sortedRanking.map((entry) => {
                  const s = entry.strength;
                  const expanded = expandedRankingCountryId === entry.countryId;
                  const explanation = s ? `Potencjał #${s.rank}: gospodarka ${Math.round(s.components.economy)}, ludność ${Math.round(s.components.population)}, technologia ${Math.round(s.components.technology)}, logistyka ${Math.round(s.components.logistics)}, wojsko ${Math.round(s.components.military)}, instytucje ${Math.round(s.components.stability)}. Kliknij wynik, aby rozwinąć.` : "Potencjał jest liczony w trybie strategicznym.";
                  return <div key={entry.countryId} className={`ranking-entry ${!entry.active ? "eliminated" : ""} ${expanded ? "expanded" : ""}`}>
                    <button className="ranking-main" onClick={() => { setSelectedId(entry.countryId); focusCountry(entry.countryId); }}>
                      <b title={`#${entry.rank} terytorialnie`}>{entry.rank}</b>
                      <span className="ranking-country"><i>{entry.flag}</i><strong>{entry.name}</strong>{s && <small>#{s.rank} potencjału</small>}</span>
                      <span className="ranking-area">{formatArea(entry.areaKm2)}</span>
                      {gameMode === "strategy" && <span className="ranking-strength" role="button" tabIndex={0} title={explanation} onClick={(event) => { event.stopPropagation(); setExpandedRankingCountryId(expanded ? null : entry.countryId); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); setExpandedRankingCountryId(expanded ? null : entry.countryId); } }}><b>{s?.rating ?? 0}</b><i>/100</i><em>{expanded ? "▴" : "▾"}</em></span>}
                      <em className={entry.changePercent > 0 ? "up" : entry.changePercent < 0 ? "down" : ""}>{entry.changePercent > 0 ? "+" : ""}{entry.changePercent.toFixed(1)}%</em>
                      <small title="Liczba wyeliminowanych państw">⚔ {entry.defeats}</small>
                    </button>
                    {expanded && s && <div className="ranking-breakdown">{Object.entries(s.components).map(([key, value]) => <span key={key}><small>{componentLabels[key as keyof typeof componentLabels]}</small><i><em style={{ width: `${Math.min(100, value)}%` }} /></i><b>{Math.round(value)}</b></span>)}<footer><span>Wyczerpanie <b>{Math.round(s.exhaustion)}%</b></span><span>Integracja <b>{Math.round(s.integration)}%</b></span><span>Siła frontu: liczona dopiero dla konkretnego ataku</span></footer></div>}
                  </div>;
                })}
              </div>
            </>}
            {sidePanel === "chronicle" && <div className="chronicle-card"><span className="chronicle-seal">✦</span><h3>Kronika tego świata</h3><p>Zamień do 120 ostatnich zdarzeń i końcowy ranking w opowieść o epokach, potęgach i upadkach.</p><button disabled={!history.length} onClick={buildChronicle}>Otwórz kronikę</button><small>Lokalny szkic działa zawsze. Wersja AI wymaga skonfigurowania klucza po stronie serwera.</small></div>}
          </div>
        </aside>
      </section>

      <footer className="app-footer"><span>Mapa zapisuje się automatycznie na tym urządzeniu</span><span className="terrain-credit">Prowincje: Natural Earth Admin‑1 · Wysokości: ETOPO1/GMTED2010</span><button className="seed-copy" disabled={!engine} onClick={() => engine && void copyText(String(engine.seed), "Seed skopiowany")}>Seed świata: <b>{engine?.seed ?? "—"}</b> ⧉</button></footer>

      {rules && <div className="modal-backdrop" onMouseDown={() => setRules(false)}><section className="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setRules(false)}>×</button><span className="eyebrow">REGUŁY SYMULACJI</span><h2 id="rules-title">Jak zmienia się świat?</h2>
        <ol className="rules-steps"><li><b>1</b><span><strong>Kraj</strong>Klikasz i losujesz jeden z istniejących krajów.</span></li><li><b>2</b><span><strong>Akcja</strong>W trybie pełnym losujesz wojnę, nowy ląd albo erozję. W War only zawsze wypada wojna.</span></li><li><b>3</b><span><strong>Kierunek</strong>Losujesz jeden z ośmiu kierunków. Gdy cel jest niemożliwy, klikasz ten etap ponownie.</span></li><li><b>4</b><span><strong>Wielkość</strong>Losujesz obszar liczony względem aktualnej wielkości kraju.</span></li><li><b>5</b><span><strong>Wykonanie</strong>Dopiero ostatnie kliknięcie zmienia granice na mapie.</span></li></ol>
        <div className="size-table"><div><span>TINY</span><b>1–5%</b></div><div><span>SMALL</span><b>5–15%</b></div><div><span>MEDIUM</span><b>15–30%</b></div><div><span>BIG</span><b>30–50%</b></div><div><span>LARGE</span><b>50–75%</b></div><div><span>ALL</span><b>cały wróg</b></div></div>
        <p className="rules-note"><b>TRYB STRATEGICZNY</b> zachowuje prawdziwe prowincje na mapie, a nadmiar bardzo małych jednostek łączy w sektory strategiczne. Jedna tura oznacza jeden kwartał, począwszy od 2021 r. Możliwości państwa wynikają z sześciu widocznych wskaźników: gospodarki, ludności, technologii, logistyki, wojska i sprawności instytucji. Siła konkretnego frontu uwzględnia ponadto obronę własnego terenu, liczbę równoczesnych frontów, wyczerpanie oraz jawny czynnik losowy. Duże i złożone regiony stawiają większy opór. Po zdobyciu sektor zmienia właściciela, lecz jego zasoby są dostępne tylko częściowo; asymilacja trwa wiele kwartałów. Każda dodatkowa równoczesna asymilacja spowalnia wszystkie pozostałe. Długotrwałe wojny zwiększają wyczerpanie, a pokój stopniowo je obniża. Dane bazowe pochodzą z World Bank Open Data (2021; wskaźnik logistyki 2018). <b>WAR ONLY</b> i <b>TRYB PEŁNY</b> zachowują dotychczasowe zasady losowania granic.</p><button className="modal-primary" onClick={() => setRules(false)}>Rozumiem</button></section></div>}
      {gameMode === null && <div className="mode-screen"><section className={`mode-panel ${pendingMode ? "region-panel" : ""} ${pendingRegion ? "country-panel" : ""}`} role="dialog" aria-modal="true" aria-labelledby="mode-title">
        {!pendingMode ? <>
          <div className="mode-emblem" aria-hidden="true"><span>◎</span></div>
          <span className="eyebrow">NOWA ROZGRYWKA · KROK 1</span>
          <h2 id="mode-title">Wybierz tryb gry</h2>
          <p className="mode-intro">Zasady akcji zostaną zapisane razem z tym światem. Każdy etap tury nadal uruchamiasz własnym kliknięciem.</p>
          <div className="mode-options">
            <button className="mode-option full" disabled={!ready || !engine} onClick={() => chooseGameMode("full")}>
              <span className="mode-icon" aria-hidden="true">◇</span><span><strong>Pełny</strong><small>Wojna, nowy ląd i erozja</small></span><b>DALEJ →</b>
            </button>
            <button className="mode-option war" disabled={!ready || !engine} onClick={() => chooseGameMode("war")}>
              <span className="mode-icon" aria-hidden="true">⚔</span><span><strong>War only</strong><small>Tylko wojna — bez lądu i erozji</small></span><b>DALEJ →</b>
            </button>
            <button className="mode-option strategy" disabled={!ready || !engine} onClick={() => chooseGameMode("strategy")}>
              <span className="mode-icon" aria-hidden="true">♟</span><span><strong>Strategiczny</strong><small>Prawdziwe prowincje, zbalansowane sektory, kampanie i przeciwnicy AI</small></span><b>DALEJ →</b>
            </button>
          </div>
          <p className="mode-footnote">{ready ? "W kolejnym kroku wybierzesz obszar rozgrywki." : "Przygotowuję mapę świata…"}</p>
        </> : pendingMode === "strategy" && pendingRegion ? <>
          <button className="mode-back" onClick={() => setPendingRegion(null)}>← Wróć do obszaru</button>
          <span className="eyebrow">NOWA ROZGRYWKA · KROK 3 Z 3 · STRATEGICZNY</span>
          <h2 id="mode-title">Wybierz swoje państwo</h2>
          <p className="mode-intro">Ty wybierasz cele kampanii tego państwa. Wszystkie pozostałe kraje podejmują decyzje samodzielnie.</p>
          <div className="country-picker-grid">
            {eligiblePlayerCountries.map((country) => <button key={country.id} disabled={!ready || !engine} onClick={() => choosePlayerCountry(country.id)}><span>{country.flag}</span><strong>{country.name}</strong><small>{formatArea(engine?.getCountryInitialKm2(country.id) ?? 0)}</small><b>GRAJ →</b></button>)}
          </div>
          {!eligiblePlayerCountries.length && <p className="mode-footnote">W tym obszarze nie ma państw spełniających wybrane zasady.</p>}
        </> : <>
          <button className="mode-back" onClick={() => { setPendingMode(null); setPendingRegion(null); }}>← Wróć do trybu</button>
          <span className="eyebrow">NOWA ROZGRYWKA · KROK 2 {pendingMode === "strategy" ? "Z 3" : "Z 2"} · {pendingMode === "war" ? "WAR ONLY" : pendingMode === "strategy" ? "STRATEGICZNY" : "PEŁNY"}</span>
          <h2 id="mode-title">Wybierz obszar</h2>
          <p className="mode-intro">Losowania obejmą tylko państwa wybranego regionu. Pozostała część mapy będzie przygaszona i nie weźmie udziału w grze.</p>
          <div className="seed-picker">
            <label htmlFor="world-seed">Seed świata</label>
            <div><input id="world-seed" inputMode="numeric" pattern="[0-9]*" value={seedInput} onChange={(event) => setSeedInput(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Losowy" /><button type="button" onClick={() => setSeedInput(String(randomSeed()))}>Losuj</button></div>
            <small>Ten sam seed, tryb, region i ustawienie mikropaństw odtwarzają identyczny przebieg.</small>
          </div>
          <fieldset className="microstate-picker">
            <legend>Najmniejsze państwa</legend>
            <label className={microstateRule === "all" ? "selected" : ""}><input type="radio" name="microstates" checked={microstateRule === "all"} onChange={() => setMicrostateRule("all")} /><span><b>Wszystkie grają</b><small>Każde państwo może być losowane i wygrać.</small></span></label>
            <label className={microstateRule === "exclude" ? "selected" : ""}><input type="radio" name="microstates" checked={microstateRule === "exclude"} onChange={() => setMicrostateRule("exclude")} /><span><b>Bez mikropaństw</b><small>Kraje poniżej 10 000 km² nie wykonują tur i nie mogą wygrać, ale można je podbić.</small></span></label>
          </fieldset>
          <div className="region-options">
            {regionOptions.map((option) => <button key={option.key} className={`region-option ${option.key === "world" ? "featured" : ""}`} disabled={!ready || !engine} onClick={() => chooseGameRegion(option.key)}>
              <span aria-hidden="true">{option.icon}</span><span><strong>{regionLabels[option.key]}</strong><small>{option.detail}</small></span><b>→</b>
            </button>)}
          </div>
          <p className="mode-footnote">Wybrany tryb, obszar i udział mikropaństw są zapisywane razem z rozgrywką.</p>
        </>}
      </section></div>}
      {chronicleOpen && <div className="modal-backdrop" onMouseDown={() => setChronicleOpen(false)}><section className="chronicle-modal" role="dialog" aria-modal="true" aria-labelledby="chronicle-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setChronicleOpen(false)}>×</button><span className="eyebrow">SEED {engine?.seed} · {turn} TUR</span><h2 id="chronicle-title">Kronika świata</h2><div className="chronicle-text">{chronicleText}</div><div className="chronicle-actions"><button onClick={() => void copyText(chronicleText, "Kronika skopiowana")}>Kopiuj kronikę</button><button onClick={copyAiPrompt}>Kopiuj prompt do ChatGPT</button><button className="modal-primary" disabled={chronicleLoading} onClick={() => void generateAiChronicle()}>{chronicleLoading ? "Piszę kronikę…" : "Napisz przez AI"}</button></div><p className="chronicle-note">Generator AI działa wyłącznie po stronie serwera i nigdy nie ujawnia klucza w przeglądarce. Bez konfiguracji możesz użyć lokalnego szkicu albo skopiować gotowy prompt.</p></section></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
