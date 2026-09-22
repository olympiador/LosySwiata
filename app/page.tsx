"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { createPortal } from "react-dom";
import { WarPopulationBalance } from "./war-population-balance";

const SW_PATH = "/sw.js";

function useServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const dev = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(location.hostname);
    if (!dev) {
      navigator.serviceWorker.register(SW_PATH).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'UPDATE_AVAILABLE') {
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const dev = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(location.hostname);
    if (dev) return;
    const id = window.setInterval(() => {
      navigator.serviceWorker.ready.then((registration) => {
        if (registration.active && 'postMessage' in registration.active) {
          registration.active.postMessage({ type: 'CHECK_UPDATE' });
        }
      }).catch(() => {});
    }, 60000);
    return () => window.clearInterval(id);
  }, []);
}
import {
  ACTIONS,
  CATACLYSM_EVERY_TURNS,
  DIRECTIONS,
  STRATEGIC_CASUS_BELLI,
  STRATEGIC_OCCUPATION_POLICIES,
  MAP_H,
  MAP_W,
  SIZE_LABELS,
  WorldEngine,
  formatArea,
  isSnapshot,
  type ActionKey,
  type Country,
  type CapitalPlacement,
  type StrategicCityPlacement,
  type StrategicCapitalRelocationOption,
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
  type StrategicCasusBelliId,
  type StrategicBattleArtifact,
  type StrategicDefensePosture,
  type StrategicOccupation,
  type StrategicOccupationPolicyChoice,
  type StrategicRegion,
  type StrategicWarHistoryEntry,
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
const warOutcomeLabels: Record<StrategicWarHistoryEntry["outcome"], string> = { captured: "Zdobyty sektor", repelled: "Atak odparty", withdrawn: "Ofensywa wycofana", stalemate: "Front wygasł" };
type Gesture = {
  points: Map<number, Point>;
  last: Point | null;
  pinch: { distance: number; center: Point; zoom: number; pan: Point } | null;
  frame: { left: number; top: number; width: number; height: number } | null;
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
type DossierTab = "overview" | "economy" | "population" | "military" | "logistics" | "policies" | "sector";
const PLAYER_TABS: DossierTab[] = ["overview", "economy", "population", "military", "logistics", "policies"];
const OBSERVER_TABS: DossierTab[] = ["overview", "economy", "population", "military", "logistics"];
const tabLabels: Record<DossierTab, string> = {
  overview: "Przegląd",
  economy: "Gospodarka",
  population: "Ludność",
  military: "Wojsko",
  logistics: "Logistyka",
  policies: "Polityka",
  sector: "Sektor",
};

function wait(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

function normalizeCountrySearch(value: string) {
  return value.trim().toLocaleLowerCase("pl").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function strategicDate(turn: number) {
  const completed = Math.max(0, turn - 1);
  return `${completed % 4 + 1}. kw. ${2021 + Math.floor(completed / 4)}`;
}

const componentLabels = { economy: "Gospodarka", population: "Ludność", technology: "Technologia", logistics: "Logistyka", military: "Wojsko", stability: "Instytucje" } as const;
const capabilityTooltips: Record<keyof typeof componentLabels, string> = {
  economy: "Stan gospodarki określa, ile państwo może utrzymać, odbudować i przeznaczyć na wojsko. Osłabiają ją wojna i okupacja, wzmacniają rozwój oraz sprawna logistyka.",
  population: "Potencjał ludnościowy, z którego wynikają rynek pracy i rezerwy. Zmieniają go demografia, migracja, uchodźcy i straty wojenne.",
  technology: "Zdolność do rozwoju, modernizacji i działań cyfrowych. Rośnie przez inwestycje badawcze, a słabnie przez wojnę i sankcje.",
  logistics: "Sprawność transportu, zaopatrzenia i odbudowy. Zależy od portów, dróg, kolei, lotnisk, dostępu do morza oraz inwestycji.",
  military: "Możliwości wojskowe kraju. Wpływają na nie zasoby, mobilizacja, doświadczenie bojowe, wojna i stan gospodarki.",
  stability: "Spójność społeczna i zdolność instytucji do działania. Zmieniają ją wojna, okupacja, ustrój, polityka i środowisko informacyjne.",
};

const playerCapabilityAdvice: Record<keyof typeof componentLabels, string> = {
  economy: "Silniejsza gospodarka daje więcej środków na armię, odbudowę i odporność na długą wojnę. Rozwijaj logistykę, unikaj wyniszczających konfliktów i szybko integruj zdobyte tereny.",
  population: "Ludność tworzy rynek pracy i rezerwy. Chroń mieszkańców przed stratami wojennymi, a politykę graniczną dobieraj do potrzeb kraju.",
  technology: "Technologia ułatwia modernizację państwa. Inwestuj w rozwój, gdy kraj jest stabilny i ma zasoby, a nie w samym środku kryzysu.",
  logistics: "Logistyka decyduje, czy gospodarka i armia mogą działać poza stolicą. Buduj drogi, kolej, porty i lotniska w słabszych regionach.",
  military: "Wojsko chroni granice i zwiększa szanse ofensywy, ale zależy od gospodarki, ludzi oraz zaopatrzenia. Najpierw zabezpiecz zaplecze.",
  stability: "Sprawne instytucje pomagają przetrwać kryzys i włączyć nowe ziemie do państwa. Ograniczaj koszty wojny i nie przeciążaj kraju podbojami.",
};

function InfoTip({ children }: { children: string }) {
  const trigger = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const show = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(250, window.innerWidth - 16);
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2));
    const above = rect.top > 132;
    setPosition({ left, top: above ? Math.max(8, rect.top - 118) : Math.min(window.innerHeight - 8, rect.bottom + 8) });
  };
  const hide = () => setPosition(null);
  return <span ref={trigger} className="info-tip" tabIndex={0} aria-label={`Wyjaśnienie: ${children}`} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}><span aria-hidden="true">i</span>{position && createPortal(<span className="global-tooltip" role="tooltip" style={position}>{children}</span>, document.body)}</span>;
}

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

function Wheel({ step, label, value, rolling, current, onValueClick }: { step: string; label: string; value: string; rolling: boolean; current: boolean; onValueClick?: () => void }) {
  return (
    <div className={`wheel-card ${rolling ? "is-rolling" : ""} ${current ? "is-current" : ""}`}>
      <span className="wheel-step">{step}</span>
      <div className="wheel-copy"><small>{label}</small>{onValueClick ? <button className="wheel-value" title={`${value} — pokaż na mapie`} onClick={onValueClick}>{value}</button> : <strong title={value}>{value}</strong>}</div>
    </div>
  );
}

// Powód częściowego wykonania silnik dopisuje w tekście rekordu po myślniku.
function partialWarningText(record: TurnRecord) {
  const reason = record.text.split("—")[1]?.trim().replace(/\.$/, "");
  const done = Math.round((record.actualFraction ?? 0) * 100);
  const planned = Math.round(record.fraction * 100);
  return `Kierunek ${record.directionShort} się dławi: wykonano ${done}% zamiast ${planned}%${reason ? ` (${reason})` : ""}`;
}

function History({ record }: { record: TurnRecord }) {
  const strategic = record.directionShort === "REG";
  return (
    <article className="history-item">
      <span className={`history-icon ${record.action}`}>{record.cataclysm ? "🌊" : actionIcons[record.action]}</span>
      <div>
        <header><b>Tura {record.turn}</b><em>{strategic ? "KAMPANIA" : `${SIZE_LABELS[record.size]}${record.partial ? " · CZĘŚCIOWO" : ""}`}</em>{record.capitalLost && <em className="history-flag">STOLICA UPADŁA</em>}{record.capitalRelocated && <em className="history-flag relocated">NOWA SIEDZIBA</em>}{record.cataclysm && <em className="history-flag">KATAKLIZM</em>}{record.bridgeTo && <em className="history-flag relocated">MOST LĄDOWY</em>}</header>
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
  const [playerCountryQuery, setPlayerCountryQuery] = useState("");
  const [playerCountryId, setPlayerCountryId] = useState<number | null>(null);
  const [strategicTargetId, setStrategicTargetId] = useState<number | null>(null);
  const [strategicCasusBelli, setStrategicCasusBelli] = useState<StrategicCasusBelliId>("security-threat");
  const [inspectedSectorId, setInspectedSectorId] = useState<number | null>(null);
  const [strategicRegions, setStrategicRegions] = useState<StrategicRegion[]>([]);
  const [strategicCampaigns, setStrategicCampaigns] = useState<StrategicCampaign[]>([]);
  const [strategicOccupations, setStrategicOccupations] = useState<StrategicOccupation[]>([]);
  const [battleArtifacts, setBattleArtifacts] = useState<StrategicBattleArtifact[]>([]);
  const [warReport, setWarReport] = useState<StrategicWarHistoryEntry | null>(null);
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
  const [dossierTab, setDossierTab] = useState<DossierTab>("overview");
  const [dossierMode, setDossierMode] = useState<"country" | "sector">("country");
  const [battleFx, setBattleFx] = useState<BattleFx | null>(null);
  const [playerAlarm, setPlayerAlarm] = useState<string | null>(null);
  const [seedInput, setSeedInput] = useState("");
  const [microstateRule, setMicrostateRule] = useState<MicrostateRule>("all");
  const [cataclysmOption, setCataclysmOption] = useState(false);
  const [partialWarning, setPartialWarning] = useState<string | null>(null);
  const [sidePanel, setSidePanel] = useState<SidePanel>("history");
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
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
  const vectorMapRef = useRef<SVGSVGElement>(null);
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
  const interactiveFrameRef = useRef<number | null>(null);
  const wheelCommitTimerRef = useRef<number | null>(null);
  const viewSizeRef = useRef({ width: 1, height: 1 });
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveIdleRef = useRef<number | null>(null);
  const autosaveInstanceRef = useRef<WorldEngine | null>(null);
  const paintRef = useRef<() => void>(() => {});
  const labelKeyRef = useRef("");
  const labelViewKeyRef = useRef("");
  const backdropKeyRef = useRef("");
  const fallbackBorderZoomRef = useRef(-1);
  const gestureRef = useRef<Gesture>({ points: new Map(), last: null, pinch: null, frame: null, moved: false, hadMulti: false });

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
    setBattleArtifacts(instance.getStrategicBattleArtifacts());
    setDataVersion((value) => value + 1);
  }, []);

  const autosave = useCallback((instance: WorldEngine) => {
    autosaveInstanceRef.current = instance;
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    const idleWindow = window as unknown as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (autosaveIdleRef.current !== null) idleWindow.cancelIdleCallback?.(autosaveIdleRef.current);
    const write = () => {
      autosaveIdleRef.current = null;
      if (gestureRef.current.points.size || wheelCommitTimerRef.current !== null) {
        autosaveTimerRef.current = window.setTimeout(write, 300);
        return;
      }
      autosaveTimerRef.current = null;
      const current = autosaveInstanceRef.current;
      if (!current) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current.snapshot()));
        autosaveInstanceRef.current = null;
      } catch { /* storage can be unavailable */ }
    };
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      if (idleWindow.requestIdleCallback) autosaveIdleRef.current = idleWindow.requestIdleCallback(write, { timeout: 2_000 });
      else autosaveTimerRef.current = window.setTimeout(write, 250);
    }, 180);
  }, []);

  const drawInteractiveView = useCallback(() => {
    if (interactiveFrameRef.current !== null) return;
    interactiveFrameRef.current = window.requestAnimationFrame(() => {
      interactiveFrameRef.current = null;
      if (!mapRef.current) return;
      const rect = viewSizeRef.current;
      if (vectorMapRef.current) {
        const width = 2 / zoomRef.current, height = 1 / zoomRef.current;
        const panX = panRef.current.x / Math.max(1, rect.width), panY = panRef.current.y / Math.max(1, rect.height);
        vectorMapRef.current.setAttribute("viewBox", `${1 - panX * 2 / zoomRef.current - width / 2} ${.5 - panY / zoomRef.current - height / 2} ${width} ${height}`);
      }
      const renderer = mapRendererRef.current;
      if (!renderer) return;
      if (!renderer.screenSpaceBorders) {
        paintRef.current();
        return;
      }
      const focusedRegionId = strategicTargetId ?? inspectedSectorId;
      renderer.draw({
        zoom: zoomRef.current,
        panX: panRef.current.x / Math.max(1, rect.width),
        panY: -panRef.current.y / Math.max(1, rect.height),
        selectedOwner: selectedRef.current === null ? 0 : selectedRef.current + 1,
        selectedRegion: focusedRegionId === null ? 0 : focusedRegionId + 1,
        interacting: true,
      });
    });
  }, [inspectedSectorId, strategicTargetId]);

  const applyView = useCallback((nextZoom: number, nextPan: Point, commit = true) => {
    const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    const rect = gestureRef.current.frame ?? (mapRef.current ? viewSizeRef.current : null);
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
    if (commit) {
      setZoom(clampedZoom);
      setPan(clampedPan);
      setHover(null);
    } else drawInteractiveView();
  }, [drawInteractiveView]);

  const commitInteractiveView = useCallback(() => {
    if (interactiveFrameRef.current !== null) {
      window.cancelAnimationFrame(interactiveFrameRef.current);
      interactiveFrameRef.current = null;
    }
    setZoom(zoomRef.current);
    setPan({ ...panRef.current });
    setHover(null);
    paintRef.current();
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
        setCataclysmOption(instance.isCataclysmEnabled());
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
    viewSizeRef.current = { width: rect.width, height: rect.height };
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
    const focusedRegionId = strategicTargetId ?? inspectedSectorId;
    const renderHighlight = !mapRendererRef.current.screenSpaceBorders && focusedRegionId !== null
      ? engine.getStrategicRegionIndices(focusedRegionId)
      : focusedRegionId !== null ? [] : highlightRef.current;
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
    mapRendererRef.current.draw({ zoom: zoomRef.current, panX: panRef.current.x / Math.max(1, rect.width), panY: -panRef.current.y / Math.max(1, rect.height), selectedOwner: selectedRef.current === null ? 0 : selectedRef.current + 1, selectedRegion: focusedRegionId === null ? 0 : focusedRegionId + 1 });
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
  }, [dataVersion, engine, inspectedSectorId, mapLabels.length, mapStyle, strategicTargetId]);

  useEffect(() => { paintRef.current = paint; }, [paint]);
  useEffect(() => {
    const flushAutosave = () => {
      const current = autosaveInstanceRef.current;
      if (!current) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current.snapshot()));
        autosaveInstanceRef.current = null;
      } catch { /* storage can be unavailable */ }
    };
    window.addEventListener("pagehide", flushAutosave);
    return () => {
      window.removeEventListener("pagehide", flushAutosave);
      if (interactiveFrameRef.current !== null) window.cancelAnimationFrame(interactiveFrameRef.current);
      if (wheelCommitTimerRef.current !== null) window.clearTimeout(wheelCommitTimerRef.current);
      if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
      if (autosaveIdleRef.current !== null) (window as unknown as { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback?.(autosaveIdleRef.current);
      flushAutosave();
    };
  }, []);

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

  // Wspólne zgłoszenia trybu pełnego po apply(): częściowe wykonanie, most lądowy,
  // kataklizm. Wywoływane i z ręcznej tury, i z automatu, żeby oba szły tym samym torem.
  const announceFullModeEvents = useCallback((result: ReturnType<WorldEngine["apply"]>) => {
    if (gameMode !== "full") return;
    if (result.record.partial) {
      setPartialWarning(partialWarningText(result.record));
      notify("Akcja wykonana częściowo");
    } else setPartialWarning(null);
    if (result.record.bridgeTo) notify(`◆ Nowy ląd połączył ${result.record.countryName} z ${result.record.bridgeTo}`);
    if (result.cataclysmRecord) notify("🌊 Kataklizm: morza zalały niziny");
  }, [gameMode, notify]);

  const runStage = useCallback(async () => {
    if (!engine || !ready || !gameMode || busyRef.current) return;
    busyRef.current = true; setBusy(true); setMenu(false);
    try {
      if (stage === "country") {
        setBattleFx(null);
        setPartialWarning(null);
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
        const attacker = engine.getCountry(draft.countryId);
        if (gameMode === "war" && draft.action === "war" && playerCountryId !== null && result.targetId === playerCountryId) {
          const defenderName = engine.getCountry(playerCountryId)?.name ?? "Twoje państwo";
          const alarmText = `ALARM: ${defenderName} jest celem ataku ${attacker?.name ?? "przeciwnika"} z kierunku ${result.direction.short}`;
          setPlayerAlarm(alarmText);
          setPhase(alarmText);
          notify(`⚠ ${alarmText}`);
          focusCountry(playerCountryId);
          return;
        }
        setPlayerAlarm(null);
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
      }
      const result = engine.apply(plan);
      // The vector map already shows the changed territory. Rebuilding a
      // raster outline here produced the blocky post-action halo and forced
      // another full-map scan on the main thread.
      highlightRef.current = gameMode === "strategy" ? result.changedIndices : [];
      activeTurnRef.current = null;
      setActiveTurnId(null);
      // Commit the light vector update first. The heavier GPU texture refresh
      // runs from the post-render effect, after the changed coast is visible.
      refresh(engine); autosave(engine);
      setPlayerAlarm(null);
      announceFullModeEvents(result);
      const playerName = playerCountryId === null ? null : engine.getCountry(playerCountryId)?.name ?? null;
      if (playerName && result.record.eliminated === playerName) {
        setPhase("Twoje państwo zniknęło z mapy");
        notify("⚠ Twoje państwo zniknęło z mapy");
      } else setPhase(result.cataclysmRecord?.text ?? result.record.text);
      if (draft.action === "war" && battleFx && animationMode !== "off") setBattleFx((current) => current ? { ...current, phase: "front" } : current);
      setDraft({}); setStage("country");
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = window.setTimeout(() => { highlightRef.current = []; setBattleFx(null); paint(); }, animationMode === "full" ? 1700 : 850);
    } finally { busyRef.current = false; setBusy(false); }
  }, [animationMode, announceFullModeEvents, autosave, battleFx, draft, engine, focusCountry, gameMode, notify, paint, playerCountryId, ready, refresh, speed, spin, stage]);

  const applyWarVeto = useCallback(async () => {
    if (!engine || gameMode !== "war" || busyRef.current) return;
    if (stage !== "size" || draft.countryId === undefined || !draft.action) return;
    busyRef.current = true; setBusy(true);
    try {
      const result = engine.vetoDirection(draft.countryId, draft.action);
      if (!result) return;
      const left = engine.getWarVetoesLeft();
      // Weto zużywa zasób partii poza apply(), więc licznik trzeba odświeżyć ręcznie.
      setDataVersion((value) => value + 1);
      autosave(engine);
      setPhase("Weto: losuję nowy kierunek…");
      await spin("direction", DIRECTIONS.map((item) => `${arrows[item.short]} ${item.short}`), `${arrows[result.direction.short]} ${result.direction.short}`, 320);
      if (!result.valid) {
        setBattleFx(null);
        setPlayerAlarm(null);
        setDraft((current) => ({ ...current, direction: undefined, targetId: undefined, size: undefined, fraction: undefined }));
        setWheels((current) => ({ ...current, size: "—" }));
        setStage("direction");
        setPhase("Po wecie brak celu, losuj kierunek ponownie");
        return;
      }
      setDraft((current) => ({ ...current, direction: result.direction, targetId: result.targetId, size: undefined, fraction: undefined }));
      if (result.impactIndex !== null && animationMode !== "off") {
        setBattleFx({ x: ((result.impactIndex % MAP_W) + 0.5) / MAP_W * 100, y: (Math.floor(result.impactIndex / MAP_W) + 0.5) / MAP_H * 100, direction: result.direction, phase: "aim", key: Date.now() });
      } else setBattleFx(null);
      setWheels((current) => ({ ...current, size: "—" }));
      if (playerCountryId !== null && result.targetId === playerCountryId) {
        const defenderName = engine.getCountry(playerCountryId)?.name ?? "Twoje państwo";
        const attacker = engine.getCountry(draft.countryId);
        const alarmText = `ALARM: ${defenderName} jest celem ataku ${attacker?.name ?? "przeciwnika"} z kierunku ${result.direction.short}`;
        setPlayerAlarm(alarmText);
        setPhase(alarmText);
        notify(`⚠ ${alarmText}`);
        focusCountry(playerCountryId);
        return;
      }
      setPlayerAlarm(null);
      setPhase(`Weto: nowy kierunek ${result.direction.short} (zostało ${left})`);
    } finally { busyRef.current = false; setBusy(false); }
  }, [animationMode, autosave, draft, engine, focusCountry, gameMode, notify, playerCountryId, spin, stage]);

  const stopAuto = useCallback(() => {
    autoRunRef.current = false;
    setPhase("Zatrzymuję automat po bieżącej turze…");
  }, []);

  const runStrategicRound = useCallback(async (targetRegionId: number | null = strategicTargetId) => {
    if (!engine || gameMode !== "strategy" || busyRef.current) return;
    busyRef.current = true; setBusy(true); setBattleFx(null);
    try {
      const incomingBefore = new Set(engine.getStrategicCampaigns().filter(({ defenderId }) => defenderId === engine.playerCountryId).map(({ id }) => id));
      const result = engine.advanceStrategicRound(targetRegionId, strategicCasusBelli);
      highlightRef.current = result.changedIndices;
      refresh(engine); autosave(engine); paint();
      const playerNeighbours = new Set<number>();
      if (engine.playerCountryId !== null) for (const region of engine.getStrategicRegions()) if (region.ownerId === engine.playerCountryId) for (const neighbourId of region.neighbours) {
        const neighbour = engine.getStrategicRegions()[neighbourId];
        if (neighbour && neighbour.ownerId !== engine.playerCountryId) playerNeighbours.add(neighbour.ownerId);
      }
      const finishedWar = result.completedWars.find((war) => war.attackerId === engine.playerCountryId || war.defenderId === engine.playerCountryId || playerNeighbours.has(war.attackerId) || playerNeighbours.has(war.defenderId));
      if (finishedWar) setWarReport(finishedWar);
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
  }, [autosave, engine, focusStrategicRegion, gameMode, notify, paint, refresh, strategicCasusBelli, strategicTargetId]);

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
        if (engine.isPlayerThreatened(plan)) notify(`⚠ ${engine.getCountry(engine.playerCountryId)?.name ?? "Twoje państwo"} jest celem ataku ${actor?.name ?? "przeciwnika"}`);
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
        highlightRef.current = [];
        activeTurnRef.current = null;
        setActiveTurnId(null);
        refresh(engine);
        autosave(engine);
        paint();
        announceFullModeEvents(result);
        const autoPlayerName = engine.playerCountryId === null ? null : engine.getCountry(engine.playerCountryId)?.name ?? null;
        if (autoPlayerName && result.record.eliminated === autoPlayerName) {
          setPhase("Twoje państwo zniknęło z mapy");
          notify("⚠ Twoje państwo zniknęło z mapy");
        } else setPhase(result.cataclysmRecord?.text ?? result.record.text);
        if (remaining !== null) {
          remaining -= 1;
          setAutoRemaining(remaining);
        }
        // Kataklizm to wydarzenie tej samej wagi co eliminacja — automat staje.
        if (pauseOnMajor && (result.record.eliminated || result.record.size === "all" || result.cataclysmRecord)) {
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
  }, [announceFullModeEvents, autosave, engine, focusStrategicRegion, gameMode, notify, paint, pauseOnMajor, ready, refresh, resetView, stage]);

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
    if (!engine || busy) return;
    if (gameMode === "war" && engine.getWarUndosLeft() <= 0) { notify("Wyczerpałeś cofnięcia w tej partii"); return; }
    if (!engine.undo()) return;
    setDraft({}); setStage("country"); setBattleFx(null); setPlayerAlarm(null); setPartialWarning(null); activeTurnRef.current = null; setActiveTurnId(null); highlightRef.current = []; refresh(engine); autosave(engine); paint();
    setPhase(engine.history.at(-1)?.text ?? "Cofnięto do początku rozgrywki");
    setWheels({ country: "—", action: "—", direction: "—", size: "—" }); notify("Ostatnia tura została cofnięta");
  };

  const chooseGameMode = (mode: GameMode) => {
    if (!engine || !ready || busy) return;
    setPendingMode(mode);
    setPendingRegion(null);
    setPlayerCountryQuery("");
    setCataclysmOption(false);
  };

  const requestedSeed = () => {
    const rawSeed = seedInput.trim();
    const seed = rawSeed ? Number(rawSeed) : randomSeed();
    if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) { notify("Seed musi być liczbą całkowitą od 1 do 4 294 967 295"); return null; }
    return seed;
  };

  const startConfiguredGame = (mode: GameMode, region: GameRegion, seed: number, playerId: number | null) => {
    if (!engine) return;
    engine.reset(seed, mode, region, microstateRule, mode === "full" ? { cataclysm: cataclysmOption } : undefined);
    engine.setPlayerCountry(playerId);
    setGameMode(mode); setGameRegion(region); setPlayerCountryId(playerId);
    setRankingSort(mode === "strategy" ? { key: "strength", direction: "desc" } : { key: "rank", direction: "asc" });
    setExpandedRankingCountryId(null);
    setPendingMode(null); setPendingRegion(null); setStrategicTargetId(null); setWarReport(null); setPlayerAlarm(null); setPartialWarning(null);
    setSeedInput(String(seed)); setSpeed(4);
    autosave(engine); refresh(engine);
    setPhase(mode === "strategy" && playerId !== null
      ? `Tryb strategiczny · dowodzisz państwem ${engine.getCountry(playerId)?.name} · wybierz cel pierwszej kampanii`
      : mode === "war" && playerId !== null
        ? `War only · ${regionLabels[region]} · Twoje państwo to ${engine.getCountry(playerId)?.name} — świat czeka na pierwszy ruch`
        : `${mode === "war" ? "War only" : "Tryb pełny"} · ${regionLabels[region]} — świat czeka na pierwszy ruch`);
    paint();
    if (mode === "war" && playerId !== null) focusCountry(playerId);
  };

  const chooseGameRegion = (region: GameRegion) => {
    if (!engine || !ready || !pendingMode || busy) return;
    const seed = requestedSeed();
    if (seed === null) return;
    if (pendingMode === "strategy" || pendingMode === "war") { setSeedInput(String(seed)); setPendingRegion(region); setPlayerCountryQuery(""); return; }
    startConfiguredGame(pendingMode, region, seed, null);
  };

  const choosePlayerCountry = (countryId: number | null) => {
    if (!pendingRegion || (pendingMode !== "strategy" && pendingMode !== "war")) return;
    if (countryId === null && pendingMode !== "war") return;
    const seed = requestedSeed();
    if (seed === null) return;
    startConfiguredGame(pendingMode, pendingRegion, seed, countryId);
  };

  const newGame = () => {
    if (!engine || busy || !confirm("Rozpocząć nową rozgrywkę? Obecny świat zostanie zastąpiony.")) return;
    setDraft({}); setStage("country"); setBattleFx(null); setWarReport(null); setPlayerAlarm(null); engine.reset(); selectedRef.current = null; setSelectedId(null); activeTurnRef.current = null; setActiveTurnId(null); highlightRef.current = [];
    refresh(engine); try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage can be unavailable */ } setWheels({ country: "—", action: "—", direction: "—", size: "—" });
    engine.setMicrostateRule("all");
    setGameMode(null); setGameRegion(null); setPendingMode(null); setPendingRegion(null); setPlayerCountryId(null); setStrategicTargetId(null); setMicrostateRule("all"); setSeedInput(""); setSidePanel("history"); setInfoPanelOpen(false); setSpeed(4); setPhase("Wybierz tryb nowej rozgrywki"); setMenu(false); resetView(); paint();
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
      engine.load(parsed); setGameMode(engine.gameMode); setGameRegion(engine.gameRegion); setMicrostateRule(engine.microstateRule); setCataclysmOption(engine.isCataclysmEnabled()); setPartialWarning(null); setPlayerCountryId(engine.playerCountryId); setSeedInput(String(engine.seed)); setPendingMode(null); setPendingRegion(null); setDraft({}); setStage("country"); setBattleFx(null); selectedRef.current = null; setSelectedId(null); activeTurnRef.current = null; setActiveTurnId(null); highlightRef.current = [];
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
    if (!gesture.points.size) {
      gesture.moved = false;
      gesture.hadMulti = false;
      const frame = mapRef.current?.getBoundingClientRect();
      gesture.frame = frame ? { left: frame.left, top: frame.top, width: frame.width, height: frame.height } : null;
      if (frame) viewSizeRef.current = { width: frame.width, height: frame.height };
    }
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
        if (Math.abs(dx) + Math.abs(dy) > 1) {
          gesture.moved = true;
          mapRef.current?.classList.add("is-map-dragging");
        }
        if (zoomRef.current >= MIN_ZOOM) applyView(zoomRef.current, { x: panRef.current.x + dx, y: panRef.current.y + dy }, false);
        gesture.last = current;
      } else if (gesture.pinch) {
        const [first, second] = [...gesture.points.values()];
        const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
        const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, gesture.pinch.zoom * distance / gesture.pinch.distance));
        const frame = gesture.frame ?? mapRef.current?.getBoundingClientRect();
        const frameCenter = frame ? { x: frame.left + frame.width / 2, y: frame.top + frame.height / 2 } : { x: 0, y: 0 };
        const scale = nextZoom / gesture.pinch.zoom;
        mapRef.current?.classList.add("is-map-dragging");
        applyView(nextZoom, {
          x: center.x - frameCenter.x - scale * (gesture.pinch.center.x - frameCenter.x - gesture.pinch.pan.x),
          y: center.y - frameCenter.y - scale * (gesture.pinch.center.y - frameCenter.y - gesture.pinch.pan.y),
        }, false);
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
      const country = countryAtPointer(event);
      if (country) {
        const point = worldPointAtPointer(event);
        const region = point ? engine?.getStrategicRegionAt(point.worldX, point.worldY) : null;
        setSelectedId((current) => {
          if (current === country.id) {
            setDossierMode("sector");
            if (region?.ownerId === country.id) {
              setInspectedSectorId(region.id);
              setDossierTab("military");
            } else setDossierTab("overview");
          } else {
            setDossierMode("country");
            setDossierTab("overview");
          }
          return country.id;
        });
      }
    }
    if (gesture.points.size === 1) {
      gesture.last = [...gesture.points.values()][0];
      gesture.pinch = null;
    } else if (!gesture.points.size) {
      commitInteractiveView();
      mapRef.current?.classList.remove("is-map-dragging");
      gesture.last = null;
      gesture.pinch = null;
      gesture.frame = null;
      gesture.moved = false;
      gesture.hadMulti = false;
    }
  };

  const wheelZoom = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const frame = event.currentTarget.getBoundingClientRect();
    viewSizeRef.current = { width: frame.width, height: frame.height };
    const oldZoom = zoomRef.current;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * Math.exp(-event.deltaY * .0015)));
    const localX = event.clientX - frame.left - frame.width / 2;
    const localY = event.clientY - frame.top - frame.height / 2;
    const worldOffsetX = (localX - panRef.current.x) / oldZoom;
    const worldOffsetY = (localY - panRef.current.y) / oldZoom;
    mapRef.current?.classList.add("is-map-dragging");
    applyView(nextZoom, {
      x: localX - worldOffsetX * nextZoom,
      y: localY - worldOffsetY * nextZoom,
    }, false);
    if (wheelCommitTimerRef.current !== null) window.clearTimeout(wheelCommitTimerRef.current);
    wheelCommitTimerRef.current = window.setTimeout(() => {
      wheelCommitTimerRef.current = null;
      commitInteractiveView();
      mapRef.current?.classList.remove("is-map-dragging");
    }, 110);
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
      .filter((entry) => engine.canCountryAct(entry.countryId))
      .map((entry) => {
        const country = engine.getCountry(entry.countryId);
        return { ...entry, name: country?.name ?? "Nieznane państwo", flag: country?.flag ?? "", strength: strengths?.get(entry.countryId) ?? null };
      });
  }, [dataVersion, engine, gameMode]);
  const sortedRanking = useMemo(() => [...ranking].sort((first, second) => {
    let comparison = 0;
    if (rankingSort.key === "country") comparison = first.name.localeCompare(second.name, "pl");
    else if (rankingSort.key === "rank") comparison = (first.rank || Number.MAX_SAFE_INTEGER) - (second.rank || Number.MAX_SAFE_INTEGER);
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
  // Pasek lądu i zegar kataklizmu są liczone z silnika, więc muszą się odświeżać
  // po każdej turze — stąd dataVersion w zależnościach.
  const landRatio = useMemo(() => gameMode === "full" && engine ? engine.getLandRatio() : null, [dataVersion, engine, gameMode]);
  const cataclysmIn = useMemo(() => {
    if (gameMode !== "full" || !engine || !engine.isCataclysmEnabled()) return null;
    return CATACLYSM_EVERY_TURNS - (turn % CATACLYSM_EVERY_TURNS);
  }, [dataVersion, engine, gameMode, turn]);
  const playerCountry = engine?.getCountry(playerCountryId) ?? null;
  const playerCampaign = strategicCampaigns.find(({ attackerId }) => attackerId === playerCountryId) ?? null;
  const playerCampaignConflict = useMemo(() => engine?.getPlayerCampaignConflict() ?? null, [dataVersion, engine]);
  const playerStrength = useMemo(() => engine && playerCountryId !== null && gameMode === "strategy" ? engine.getStrategicStrength(playerCountryId) : null, [dataVersion, engine, gameMode, playerCountryId]);
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
      assessment: engine.getStrategicWarPreview(playerCountryId, region.ownerId, region.id, strategicCasusBelli),
      resistance: engine.getStrategicRegionResistance(region.id),
      occupation: strategicOccupations.find(({ regionId, ownerId }) => regionId === region.id && ownerId === region.ownerId),
    };
  }, [engine, playerCountryId, strategicCasusBelli, strategicOccupations, strategicRegions, strategicTargetId]);
  const playerOccupations = useMemo(() => playerCountryId === null ? [] : strategicOccupations.filter(({ ownerId, progress }) => ownerId === playerCountryId && progress < 100), [playerCountryId, strategicOccupations]);
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
    const countryLogistics = engine.getCountryLogisticsFromRegions(countryId);
    const maritimeTrade = engine.getCountryMaritimeTrade(countryId);
    const regionLogistics = regions.map(r => engine.getRegionLogistics(r.id)).filter((item): item is NonNullable<ReturnType<typeof engine.getRegionLogistics>> => item !== null);
    const regimeType = engine.getCountryRegimeType(countryId);
    const informationEnvironment = engine.getCountryInformationEnvironment(countryId);
    const combatExperience = engine.getCountryCombatExperience(countryId);
    const demographics = engine.getCountryDemographics(countryId);
    const demographicType = engine.getCountryDemographicType(countryId);
    const populationAbsolute = engine.getCountryPopulationAbsolute(countryId);
    const refugeesHosted = engine.getCountryRefugeesHosted(countryId);
    const refugeeComposition = engine.getCountryRefugeeComposition(countryId);
    const borderPolicy = engine.getCountryBorderPolicy(countryId);
    const assimilationProgress = playerOccupations.find(o => strategicRegions[o.regionId]?.ownerId === countryId)?.progress ?? 0;
    const playerPolicyState = playerCountryId === countryId ? engine.getPlayerPolicyState() : null;
    const resources = engine.getStrategicResourceSecurity(countryId);
    const politics = engine.getStrategicPoliticalState(countryId);
    const objectives = engine.getStrategicObjectives(countryId);
    return { countryId, regions, provinceCount, strength, outgoing, incoming, occupations, attackableRegions, assessment, capabilityChanges, manpower, countryLogistics, maritimeTrade, regionLogistics, regimeType, informationEnvironment, combatExperience, demographics, demographicType, populationAbsolute, refugeesHosted, refugeeComposition, borderPolicy, assimilationProgress, playerPolicyState, resources, politics, objectives };
  }, [engine, gameMode, playerCountryId, selected, strategicCampaigns, strategicOccupations, strategicRegions, strategicTargets, dataVersion, playerOccupations]);
  const playerDossier = useMemo(() => {
    if (!engine || gameMode !== "strategy" || playerCountryId === null) return null;
    const countryId = playerCountryId;
    const regions = strategicRegions.filter(({ ownerId }) => ownerId === countryId).sort((a, b) => b.areaKm2 - a.areaKm2);
    const strength = engine.getStrategicStrength(countryId);
    const outgoing = strategicCampaigns.filter(({ attackerId }) => attackerId === countryId);
    const incoming = strategicCampaigns.filter(({ defenderId, regionId }) => defenderId === countryId && strategicRegions[regionId]?.ownerId === countryId);
    const occupations = strategicOccupations.filter(({ ownerId, progress }) => ownerId === countryId && progress < 100);
    const provinceCount = regions.reduce((sum, region) => sum + region.provinceCount, 0);
    const capabilityChanges = engine.getCountryCapabilityChanges(countryId);
    const manpower = engine.getCountryManpower(countryId);
    const countryLogistics = engine.getCountryLogisticsFromRegions(countryId);
    const maritimeTrade = engine.getCountryMaritimeTrade(countryId);
    const regionLogistics = regions.map(r => engine.getRegionLogistics(r.id)).filter((item): item is NonNullable<ReturnType<typeof engine.getRegionLogistics>> => item !== null);
    const regimeType = engine.getCountryRegimeType(countryId);
    const informationEnvironment = engine.getCountryInformationEnvironment(countryId);
    const combatExperience = engine.getCountryCombatExperience(countryId);
    const demographics = engine.getCountryDemographics(countryId);
    const demographicType = engine.getCountryDemographicType(countryId);
    const populationAbsolute = engine.getCountryPopulationAbsolute(countryId);
    const refugeesHosted = engine.getCountryRefugeesHosted(countryId);
    const refugeeComposition = engine.getCountryRefugeeComposition(countryId);
    const borderPolicy = engine.getCountryBorderPolicy(countryId);
    const assimilationProgress = playerOccupations.find(o => strategicRegions[o.regionId]?.ownerId === countryId)?.progress ?? 0;
    const playerPolicyState = engine.getPlayerPolicyState();
    const attackableRegions = playerCountryId === countryId ? strategicTargets.filter(({ ownerId }) => ownerId !== countryId) : [];
    const resources = engine.getStrategicResourceSecurity(countryId);
    const politics = engine.getStrategicPoliticalState(countryId);
    const objectives = engine.getStrategicObjectives(countryId);
    return { countryId, regions, provinceCount, strength, outgoing, incoming, occupations, attackableRegions, assessment: null, capabilityChanges, manpower, countryLogistics, maritimeTrade, regionLogistics, regimeType, informationEnvironment, combatExperience, demographics, demographicType, populationAbsolute, refugeesHosted, refugeeComposition, borderPolicy, assimilationProgress, playerPolicyState, resources, politics, objectives };
  }, [engine, gameMode, playerCountryId, strategicCampaigns, strategicOccupations, strategicRegions, strategicTargets, dataVersion, playerOccupations]);
  const changeOccupationPolicy = useCallback((regionId: number, policy: StrategicOccupationPolicyChoice) => {
    if (!engine || busy || !engine.setStrategicOccupationPolicy(regionId, policy)) return;
    refresh(engine); autosave(engine); paint();
    notify(policy === "withdrawal" ? "Wycofano się z okupowanego sektora." : `Zmieniono model okupacji: ${STRATEGIC_OCCUPATION_POLICIES[policy].name}.`);
  }, [autosave, busy, engine, notify, paint, refresh]);
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
  const visiblePlayerCountries = useMemo(() => {
    const query = normalizeCountrySearch(playerCountryQuery);
    if (pendingMode !== "war" || !query) return eligiblePlayerCountries;
    return eligiblePlayerCountries.filter((country) => normalizeCountrySearch(`${country.name} ${country.iso}`).includes(query));
  }, [eligiblePlayerCountries, pendingMode, playerCountryQuery]);
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
  const vectorMapCountries = useMemo(() => engine?.getVectorMapCountries() ?? [], [dataVersion, engine]);
  const vectorChangeLayers = useMemo(() => engine?.getVectorChangeLayers() ?? [], [dataVersion, engine]);
  const vectorMapViewBox = useMemo(() => {
    const panX = pan.x / Math.max(1, mapSize.width), panY = pan.y / Math.max(1, mapSize.height);
    const width = 2 / zoom, height = 1 / zoom;
    return `${1 - panX * 2 / zoom - width / 2} ${.5 - panY / zoom - height / 2} ${width} ${height}`;
  }, [mapSize.height, mapSize.width, pan.x, pan.y, zoom]);
  const visibleMapLabels = useMemo(() => mapLabels.flatMap((label) => [-1, 0, 1].flatMap((wrap) => {
    const x = mapSize.width / 2 + pan.x + (label.x / 100 + wrap - .5) * mapSize.width * zoom;
    const y = mapSize.height / 2 + pan.y + (label.y / 100 - .5) * mapSize.height * zoom;
    return x > -100 && x < mapSize.width + 100 && y > -60 && y < mapSize.height + 60 ? [{ ...label, wrap }] : [];
  })), [mapLabels, mapSize, pan, zoom]);
  const capitalPlacements: CapitalPlacement[] = useMemo(() => engine?.getCapitalPlacements() ?? [], [dataVersion, engine]);
  const cityPlacements: StrategicCityPlacement[] = useMemo(() => engine?.getStrategicCityPlacements() ?? [], [dataVersion, engine]);
  const warGuarantee = useMemo(() => gameMode === "war" ? engine?.getWarGuarantee() ?? null : null, [dataVersion, engine, gameMode]);
  const warVetoesLeft = useMemo(() => gameMode === "war" ? engine?.getWarVetoesLeft() ?? 0 : 0, [dataVersion, engine, gameMode]);
  const warUndosLeft = useMemo(() => gameMode === "war" ? engine?.getWarUndosLeft() ?? 0 : 0, [dataVersion, engine, gameMode]);
  const warGuaranteeUsed = useMemo(() => gameMode === "war" ? engine?.isWarGuaranteeUsed() ?? false : false, [dataVersion, engine, gameMode]);
  const lostCapitalCountries = useMemo(() => {
    if (gameMode !== "war") return new Set<number>();
    return new Set(capitalPlacements.filter((capital) => !capital.controlled).map((capital) => capital.countryId));
  }, [capitalPlacements, gameMode]);
  const warTitle = useCallback((countryId: number) => gameMode === "war" ? engine?.getCountryTitle(countryId) ?? null : null, [dataVersion, engine, gameMode]);
  const grantWarGuarantee = useCallback((countryId: number) => {
    if (!engine || busy || gameMode !== "war" || !engine.setWarGuarantee(countryId)) return;
    refresh(engine); autosave(engine);
    notify(`Gwarancja obronna dla ${engine.getCountry(countryId)?.name ?? "kraju"}`);
  }, [autosave, busy, engine, gameMode, notify, refresh]);
  const visibleCapitals = useMemo(() => capitalPlacements.flatMap((capital) => [-1, 0, 1].flatMap((wrap) => {
    const left = mapSize.width / 2 + pan.x + (capital.x / 100 + wrap - .5) * mapSize.width * zoom;
    const top = mapSize.height / 2 + pan.y + (capital.y / 100 - .5) * mapSize.height * zoom;
    return left > -70 && left < mapSize.width + 70 && top > -35 && top < mapSize.height + 35 ? [{ ...capital, wrap, left, top }] : [];
  })), [capitalPlacements, mapSize, pan, zoom]);
  const visibleCities = useMemo(() => cityPlacements.flatMap((city) => [-1, 0, 1].flatMap((wrap) => {
    const left = mapSize.width / 2 + pan.x + (city.x / 100 + wrap - .5) * mapSize.width * zoom;
    const top = mapSize.height / 2 + pan.y + (city.y / 100 - .5) * mapSize.height * zoom;
    return left > -30 && left < mapSize.width + 30 && top > -30 && top < mapSize.height + 30 ? [{ ...city, wrap, left, top }] : [];
  })), [cityPlacements, mapSize, pan, zoom]);
  const capitalRelocationOptions: StrategicCapitalRelocationOption[] = useMemo(() => engine && playerCountryId !== null ? engine.getCapitalRelocationOptions(playerCountryId) : [], [dataVersion, engine, playerCountryId]);

  return (
    <main className={`app-shell map-room ${gameMode === "strategy" ? "map-room-strategy" : "map-room-classic"}`} id="top">
      <header className="topbar">
        <a className="brand" href="#top"><span className="brand-mark"><i /><i /></span><span><strong>LOSY ŚWIATA</strong><small>atlas przemian</small></span></a>
        <div className="world-status"><span><b>{turn}</b> tura</span><span><b>{activeCountries}</b> państw</span>{gameMode && <span><b>{gameMode === "war" ? "WAR ONLY" : gameMode === "strategy" ? "STRATEGICZNY" : "PEŁNY"}</b> tryb</span>}{cataclysmIn !== null && <span title="Kataklizm zalewa niziny całego świata co 40 tur">🌊 kataklizm za <b>{cataclysmIn} tur</b></span>}{warGuarantee && <span title="Gwarancja obronna: ten kraj traci o połowę mniej">🛡 <b>{engine?.getCountry(warGuarantee.countryId)?.name ?? "—"}</b> · {warGuarantee.turnsLeft} tur</span>}<span className={`status ${busy ? "rolling" : "ready"}`}><i />{autoRunning ? `AUTO${typeof autoRemaining === "number" ? ` · ${autoRemaining}` : ""}` : busy ? "TRWA RUNDA" : gameMode === "strategy" ? "DOWÓDZTWO" : `KROK ${stageOrder.indexOf(stage) + 1}/5`}</span></div>
        <div className="top-actions">
          <button className="text-button" onClick={() => { setSidePanel("history"); setInfoPanelOpen(true); }}>Dziennik</button>
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
          <header className="map-heading"><div><span className="eyebrow">{mapStyle === "relief" ? "MAPA GEOGRAFICZNA" : "MAPA POLITYCZNA"} · {gameRegion ? regionLabels[gameRegion].toUpperCase() : "STAN NA ŻYWO"}</span><button className="seed-inline" disabled={!engine} title="Kliknij, aby skopiować seed tej rozgrywki" onClick={() => engine && void copyText(String(engine.seed), "Seed skopiowany")}>seed <b>{engine?.seed ?? "—"}</b> ⧉</button>{landRatio !== null && <span className="land-ratio" title="Ile lądu zostało względem początku świata. Gdy ubywa, gra częściej losuje nowy ląd, gdy przybywa, częściej erozję."><small>LĄD</small><i><b style={{ width: `${Math.min(100, Math.max(0, Math.round(landRatio * 100)))}%` }} /></i><em>{Math.round(landRatio * 100)}%</em></span>}<h1>{last ? `Tura ${last.turn}: ${last.countryName}` : "Świat przed pierwszą turą"}</h1></div></header>
          <div className="map-frame" ref={mapRef} onContextMenu={(event) => { event.preventDefault(); setSelectedId(null); }}>
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
              onContextMenu={(event) => { event.preventDefault(); setSelectedId(null); }}
            />
            <canvas
              ref={outlineRef}
              className="map-source"
              aria-hidden="true"
            />
            {engine && gameMode !== "strategy" && mapStyle !== "flags" && mapStyle !== "hybrid" && <svg ref={vectorMapRef} className="vector-country-layer" viewBox={vectorMapViewBox} preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="vector-map-ocean" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#0b2936" />
                  <stop offset=".52" stopColor="#09222e" />
                  <stop offset="1" stopColor="#071923" />
                </linearGradient>
              </defs>
              {[-1, 0, 1].map((wrap) => <g key={wrap} transform={`translate(${wrap * 2} 0)`}>
                <rect className="vector-ocean" x="0" y="0" width="2" height="1" fill="url(#vector-map-ocean)" />
                {vectorMapCountries.map((country) => <path key={country.countryId} data-country-id={country.countryId} className={`vector-country${selectedId === country.countryId ? " selected" : ""}`} d={country.path} fill={country.fill} />)}
                {vectorChangeLayers.length > 0 && <g className="vector-change-layer" transform={`scale(${2 / MAP_W} ${1 / MAP_H})`}>
                  {vectorChangeLayers.map((layer) => <path key={layer.ownerId} className="vector-change" d={layer.path} fill={layer.fill} stroke={layer.fill} />)}
                </g>}
              </g>)}
            </svg>}
            {(mapStyle === "labels" || mapStyle === "relief") && <div className={`country-label-layer ${autoFocusing ? "is-auto-focusing" : ""}`} aria-hidden="true">
              {visibleMapLabels.map((label) => <span key={`${label.owner}:${label.wrap}`} className="country-map-label" style={{ left: `calc(50% + ${pan.x}px + ${(label.x - 50 + label.wrap * 100) * zoom}%)`, top: `calc(50% + ${pan.y}px + ${(label.y - 50) * zoom}%)`, fontSize: `${label.fontSize}px` }}>{label.lines.map((line) => <i key={line}>{line}</i>)}</span>)}
            </div>}
            {capitalDisplay !== "off" && <div className="capital-layer" aria-hidden="true">
              {visibleCapitals.map((capital) => {
                const showName = capitalDisplay === "labels" && zoom >= 5.5;
                return <span key={`${capital.countryId}:${capital.wrap}`} className={`capital-marker ${capital.controlled ? "" : "occupied"} ${zoom < 2 ? "overview" : ""} ${showName ? "named" : ""}`} style={{ left: capital.left, top: capital.top }}><i>★</i>{showName && <b>{capital.name}</b>}</span>;
              })}
            </div>}
            {gameMode === "strategy" && zoom >= 1.35 && <div className="city-layer" aria-hidden="true">
              {visibleCities.map((city) => <span key={`${city.id}:${city.wrap}`} className={`city-marker ${city.controlled ? "" : "occupied"}`} style={{ left: city.left, top: city.top }} title={city.name}><i>◆</i></span>)}
            </div>}
            {battleArtifacts.length > 0 && <div className="war-scar-layer" aria-hidden="true" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}>
              {battleArtifacts.slice(-80).map((artifact) => [-100, 0, 100].map((wrap) => <span key={`${artifact.id}:${wrap}`} className={`war-scar ${artifact.kind}`} style={{ left: `${artifact.x + wrap}%`, top: `${artifact.y}%`, opacity: Math.max(.2, 1 - Math.max(0, turn - artifact.turn) / 34), transform: `translate(-50%,-50%) scale(${1 / zoom})` }} title="Ślady ostatnich walk">{artifact.kind === "burned" ? "♨" : "⚔"}</span>))}
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
              <nav className="dossier-tabs">{(selectedDossier.countryId === playerCountryId ? PLAYER_TABS : OBSERVER_TABS).map((tab) => <button key={tab} type="button" className={dossierTab === tab ? "active" : ""} onClick={() => setDossierTab(tab)}>{tabLabels[tab]}</button>)}</nav>
              {dossierTab === "economy" && selectedDossier.strength && <section className="dossier-strength"><div><small>POTENCJAŁ <InfoTip>Łączna ocena możliwości państwa w skali 0–100. Łączy gospodarkę, ludność, technologię, logistykę, wojsko i instytucje.</InfoTip></small><strong>{selectedDossier.strength.rating}<i>/100</i></strong><em>{selectedDossier.strength.tier}</em></div><div><small>RANKING POTENCJAŁU <InfoTip>Miejsce tego kraju w rankingu wszystkich aktywnych państw według tej samej skali.</InfoTip></small><strong>#{selectedDossier.strength.rank || "—"}</strong><em>z {selectedDossier.strength.activeCountries}</em></div><div><small>WYNIK MODELU <InfoTip>Surowy wynik modelu przed zaokrągleniem do widocznej skali 0–100.</InfoTip></small><strong>{Math.round(selectedDossier.strength.power)}</strong><em>baza 2021 + stan gry</em></div></section>}
              {dossierTab === "economy" && <section className="capacity-breakdown"><header><b>MOŻLIWOŚCI PAŃSTWA</b><span>0–100</span></header><div>{Object.entries(selectedDossier.strength.components).map(([key, value]) => { const component = key as keyof typeof componentLabels; const v = Math.max(0, Math.min(100, value)); const tip = selectedDossier.countryId === playerCountryId ? playerCapabilityAdvice[component] : capabilityTooltips[component]; return <span key={key}><small>{componentLabels[component]} <InfoTip>{tip}</InfoTip></small><b>{Math.round(v)}</b><i><em style={{ width: `${Math.min(100, v)}%` }} /></i></span>; })}</div><footer><span>Wyczerpanie wojenne <b>{Math.round(selectedDossier.strength.exhaustion)}%</b></span><span>Integracja zdobyczy <b>{Math.round(selectedDossier.strength.integration)}%</b></span></footer></section>}
              {dossierTab === "economy" && <section className="resource-security"><header><b>BEZPIECZEŃSTWO ZASOBÓW</b><span>gotowość <b>{Math.round(selectedDossier.resources.readiness)}/100</b></span></header><div>{(["energy", "industry", "food", "technology", "logistics"] as const).map((key) => <span key={key} className={selectedDossier.resources.bottleneck === key ? "bottleneck" : ""}><small>{key === "energy" ? "Energia" : key === "industry" ? "Przemysł" : key === "food" ? "Żywność" : key === "technology" ? "Technologie" : "Transport"}</small><b>{Math.round(selectedDossier.resources[key])}</b><i><em style={{ width: `${selectedDossier.resources[key]}%` }} /></i></span>)}</div><footer>Wąskie gardło: <b>{selectedDossier.resources.bottleneck === "energy" ? "energia" : selectedDossier.resources.bottleneck === "industry" ? "przemysł" : selectedDossier.resources.bottleneck === "food" ? "żywność" : selectedDossier.resources.bottleneck === "technology" ? "technologie" : "transport"}</b>. Najsłabsze zasoby ograniczają ofensywę.</footer></section>}
              {dossierTab === "overview" && <section className="political-balance"><header><b>MANDAT I REPUTACJA</b><span>skutki działań utrzymują się w czasie</span></header><div><span><small>Legitymizacja</small><b>{Math.round(selectedDossier.politics.legitimacy)}</b></span><span><small>Reputacja</small><b>{Math.round(selectedDossier.politics.reputation)}</b></span><span><small>Poparcie wojny</small><b>{Math.round(selectedDossier.politics.warSupport)}</b></span></div></section>}
              {dossierTab === "overview" && <section className="strategic-objectives"><header><b>CELE PAŃSTWA</b><span>{selectedDossier.objectives.filter((objective) => objective.completed).reduce((sum, objective) => sum + objective.points, 0)}/100 pkt</span></header>{selectedDossier.objectives.map((objective) => <div key={objective.id} className={objective.completed ? "completed" : ""}><span><b>{objective.name}</b><small>{objective.description}</small></span><strong>{objective.completed ? `✓ ${objective.points} pkt` : `${Math.round(objective.progress)}%`}</strong><i><em style={{ width: `${objective.progress}%` }} /></i></div>)}</section>}
              {dossierTab === "overview" && selectedDossier.capabilityChanges.length > 0 && <section className="capability-changes"><header><b>ZMIANY POTENCJAŁU</b> <span>ostatnia tura</span></header><div>{selectedDossier.capabilityChanges.map((item) => <span key={item.key} className={`capability-change ${item.trend}`}><small>{item.label} <InfoTip>{`${capabilityTooltips[item.key as keyof typeof componentLabels]} Wartość duża to mocniejszy zasób, a liczba ze znakiem pokazuje zmianę w ostatnim kwartale.`}</InfoTip></small><b>{item.value}</b><strong>{item.delta}</strong></span>)}</div><footer>{selectedDossier.countryId === playerCountryId ? <span>Dane własne <b>pełne</b> <InfoTip>Własne ministerstwa i służby przekazują pełne dane o kraju gracza.</InfoTip></span> : <span>Pewność danych <b>{Math.round((1 - (engine?.getCountryCapabilityState(selectedDossier.countryId)?.uncertainty ?? 0)) * 100)}%</b> <InfoTip>Szacunek wiarygodności informacji o obcym państwie. Startuje od 57–82%, zależnie od kraju, a potem spada przy dużych zmianach granic i z upływem tur. Wyższa wartość oznacza lepsze rozpoznanie.</InfoTip></span>}<span>Każdy wskaźnik zmienia się we własnym tempie. <InfoTip>Zmiana jednego zasobu nie oznacza automatycznie zmiany wszystkich pozostałych.</InfoTip></span></footer></section>}
              {dossierTab === "population" && <section className="population-dossier">
                <div><small>LUDNOŚĆ BEZWZGLĘDNA</small><strong>{Math.round(selectedDossier.populationAbsolute ?? 0).toLocaleString("pl-PL")} osób</strong></div>
                <details className="regional-population"><summary>Ludność regionów ({selectedDossier.regions.length})</summary><p>{engine?.getPopulationDistribution(selectedDossier.countryId) === "ghsl-2020" ? "Rozmieszczenie ludności: GHS-POP 2020" : "Starszy zapis lub brak danych: szacunek powierzchniowy"} <InfoTip>{engine?.getPopulationDistribution(selectedDossier.countryId) === "ghsl-2020" ? "Udziały regionów wynikają z globalnej siatki ludności GHS-POP Komisji Europejskiej z 2020 roku, zsumowanej w granicach sektorów gry. Suma jest dopasowana do krajowej ludności z roku startowego. To dane modelowane na podstawie spisów i zabudowy, nie dokładny spis każdego regionu. Później uwzględniane są wojny i migracje." : "Zachowano rozkład rozpoczętej partii albo nie udało się uzyskać danych dla tego kraju. Nowa gra z załadowaną siatką GHS-POP uwzględnia skupiska ludności zamiast samej powierzchni."}</InfoTip></p><div className="logistics-regions">{selectedDossier.regions.map((region) => <button type="button" key={region.id} className={inspectedSectorId === region.id ? "selected" : ""} onClick={() => { setInspectedSectorId(region.id); focusStrategicRegion(region.id); }}><b>{region.name}</b><small>{(engine?.getRegionPopulation(region.id) ?? 0).toLocaleString("pl-PL")} mieszkańców</small></button>)}</div></details>
                {selectedDossier.demographics && <div className="demographics-bars">{Object.entries(selectedDossier.demographics).map(([key, value]) => <span key={key}><small>{key === "children" ? "Dzieci 0-14" : key === "youth" ? "Młodzież 15-24" : key === "primeAge" ? "Najlepszy wiek 25-44" : key === "middleAge" ? "Średni wiek 45-64" : key === "elderly" ? "Seniorzy 65+" : "80+ lat"}</small><b>{Math.round((value ?? 0) * 100)}%</b><i><em style={{ width: `${Math.min(100, Math.max(0, (value ?? 0) * 100))}%` }} /></i></span>)}</div>}
                {selectedDossier.countryId === playerCountryId && <aside className="population-guidance"><b>JAKA PIRAMIDA POMAGA PAŃSTWU?</b><p>Najbardziej korzystny jest duży udział osób 25–44, które pracują, płacą podatki i tworzą rezerwy, przy stabilnym dopływie dzieci i młodzieży. Chroń ludność przed wojną, utrzymuj stabilność i dobieraj otwartość granic do braków na rynku pracy.</p></aside>}
                <footer><span>Typ piramidy: <b>{engine?.getDemographicLabel(selectedDossier.demographicType)}</b></span><span>Granice: <b>{selectedDossier.borderPolicy === "closed" ? "Zamknięte" : selectedDossier.borderPolicy === "selective" ? "Selektywne" : selectedDossier.borderPolicy === "open" ? "Otwarte" : "Masowe"}</b></span>{selectedDossier.refugeesHosted > 0 && <span>Uchodźcy: <b>{Math.round(selectedDossier.refugeesHosted).toLocaleString("pl-PL")}</b></span>}{selectedDossier.refugeesHosted > 0 && selectedDossier.refugeeComposition.women + selectedDossier.refugeeComposition.men + selectedDossier.refugeeComposition.children > 0 && <span>Skład: <b>{Math.round(selectedDossier.refugeeComposition.women / selectedDossier.refugeesHosted * 100)}% kobiet, {Math.round(selectedDossier.refugeeComposition.children / selectedDossier.refugeesHosted * 100)}% dzieci</b> <InfoTip>W czasie pełnej mobilizacji dorosłych mężczyzn rzadziej wypuszcza się za granicę, dlatego wśród uchodźców rośnie udział kobiet i dzieci.</InfoTip></span>}</footer>
              </section>}
              {dossierTab === "military" && <section className="dossier-stats"><div><span>Sektory</span><b>{selectedDossier.regions.length}</b></div><div><span>Aktywne ofensywy</span><b>{selectedDossier.outgoing.length}</b></div><div><span>Bronione kierunki</span><b>{selectedDossier.incoming.length}</b></div></section>}
              {dossierTab === "military" && (() => { const wars = engine?.getStrategicWarHistory(selectedDossier.countryId).slice(-8).reverse() ?? []; return <section className="country-war-history"><header><b>HISTORIA WOJEN</b><span>{wars.length ? `${wars.length} ostatnich` : "brak zakończonych"}</span></header>{wars.length ? wars.map((war) => { const enemyId = war.attackerId === selectedDossier.countryId ? war.defenderId : war.attackerId; const sector = strategicRegions[war.regionId]; return <div key={war.id}><span><b>{engine?.getCountry(enemyId)?.flag} {engine?.getCountry(enemyId)?.name}</b><small>{strategicDate(war.startedTurn)} – {strategicDate(war.endedTurn)} · {sector?.name ?? "nieznany sektor"}</small></span><em className={war.outcome}>{warOutcomeLabels[war.outcome]}</em><small>straty: {war.attackerId === selectedDossier.countryId ? war.attackerCasualties.toLocaleString("pl-PL") : war.defenderCasualties.toLocaleString("pl-PL")} · {war.battles} potyczek</small><button type="button" className="war-history-open" onClick={() => setWarReport(war)}>Bilans wojny</button></div>; }) : <small>To państwo nie zakończyło jeszcze żadnej kampanii.</small>}</section>; })()}
              {dossierTab === "military" && selectedDossier.assessment && <section className={`war-assessment ${selectedDossier.assessment.level}`}><small>TWOJA OFENSYWA PRZECIW TEMU KRAJOWI</small><strong>{selectedDossier.assessment.label}</strong><div><i style={{ width: `${selectedDossier.assessment.chance}%` }} /></div><p>Szansa powodzenia: <b>{selectedDossier.assessment.chance}%</b>. Obrona własnego regionu daje przeciwnikowi +15%; {selectedDossier.assessment.front.attackerFronts > 1 ? `Twoje ${selectedDossier.assessment.front.attackerFronts} fronty rozpraszają siły.` : "nie masz kary za wiele frontów."} Każdy kwartał zawiera jawny czynnik losowy.</p></section>}
              {dossierTab === "military" && selectedDossier.attackableRegions.length > 0 && <section className="dossier-targets"><header><b>DOSTĘPNE CELE</b><span>{selectedDossier.attackableRegions.length}</span></header>{selectedDossier.attackableRegions.map((region) => <button key={region.id} onClick={() => selectStrategicTarget(region.id)}><span>{region.name}</span><b>{formatArea(region.areaKm2)}</b><i>WYBIERZ I POKAŻ →</i></button>)}</section>}
              {dossierTab === "military" && <section className="dossier-regions"><header><b>SEKTORY TERENOWE I OBRONA</b><span>{selectedDossier.regions.length}</span></header><small>To te same jednostki terenu, które zakładka Logistyka nazywa regionami. Kliknięcie zawsze pokazuje ten sam obszar na mapie.</small><div>{selectedDossier.regions.map((region) => <button key={region.id} className={inspectedSectorId === region.id ? "active" : ""} onClick={() => { setInspectedSectorId(region.id); focusStrategicRegion(region.id); }}><span>{region.name}</span><b>{formatArea(region.areaKm2)}</b></button>)}</div></section>}
              {dossierTab === "logistics" && <section className="logistics-dossier"><div><small>INDEKS LOGISTYCZNY <InfoTip>Ocena sprawności transportu i zaopatrzenia w skali 0–100. Uwzględnia porty, kolej, drogi, połączenia lotnicze i inwestycje.</InfoTip></small><strong>{typeof selectedDossier.countryLogistics === "number" ? Math.round(selectedDossier.countryLogistics) : "—"}</strong><em>/100</em></div><div><span><small>WPŁYW NA GOSPODARKĘ <InfoTip>Infrastruktura wpływa na potencjał logistyczny i zaopatrzenie. Gra nie nalicza osobnego, stałego bonusu do gospodarki za przekroczenie progu indeksu.</InfoTip></small><b>{"pośredni"}</b></span><span><small>WPŁYW NA REZERWY <InfoTip>Liczba rezerw zależy od ludności i mobilizacji. Logistyka wpływa na możliwości wykorzystania sił, ale nie odejmuje bezpośrednio ludzi z rezerw.</InfoTip></small><b>{"brak bezpośredniego"}</b></span></div><details><summary>{(selectedDossier.regionLogistics ?? []).length} regionów <InfoTip>Region logistyczny jest tym samym sektorem terenowym widocznym w Wojsku. Kliknij nazwę, aby go zaznaczyć i przybliżyć na mapie.</InfoTip></summary><div className="logistics-regions">{(selectedDossier.regionLogistics ?? []).map((item) => <button key={item.regionId} className={inspectedSectorId === item.regionId ? "active" : ""} onClick={() => { setInspectedSectorId(item.regionId); focusStrategicRegion(item.regionId); }}><small>{strategicRegions[item.regionId]?.name ?? `Region ${item.regionId}`} <InfoTip>Indeks sektora łączy wszystkie widoczne niżej elementy infrastruktury.</InfoTip></small><b>{Math.round(item.logisticsIndex)}</b><small>porty {item.portCount} <InfoTip>Początkowe porty pochodzą z Natural Earth; liczba uwzględnia też porty wybudowane w rozgrywce. Porty są najważniejszym elementem handlu morskiego.</InfoTip> · kolej {Math.round(item.railDensity)}/100 <InfoTip>Poziom sieci kolejowej, nie liczba kilometrów. Modernizacja kolei podnosi go w wybranym sektorze, wojna i utrata sektora odbierają jego korzyści.</InfoTip> · drogi {Math.round(item.roadDensity)}/100 <InfoTip>Poziom sieci drogowej, nie liczba kilometrów. Modernizacja dróg podnosi go w wybranym sektorze, a wojna może ograniczyć dostępne zaplecze.</InfoTip> · lotniska {item.airportCount} <InfoTip>Początkowa liczba średnich i dużych lotnisk pochodzi z OurAirports; w rozgrywce uwzględnia też ukończone budowy. Ukończona rozbudowa dodaje jedno lotnisko w tym regionie.</InfoTip></small></button>)}</div></details></section>}
              {dossierTab === "policies" && selectedDossier.playerPolicyState && <section className="policy-dossier"><header><b>DECYZJE PREZYDENTA</b><span>punkty decyzyjne: <b className="policy-points">{selectedDossier.playerPolicyState!.decisionPoints}</b></span></header><div className="policy-list">{(engine ? engine.getAvailablePlayerPolicies(selectedDossier.countryId) : []).length ? (engine ? engine.getAvailablePlayerPolicies(selectedDossier.countryId) : []).map((policy) => { const isRegional = ["build-port", "modernize-roads", "expand-airport", "rail-upgrade", "fortify-sector"].includes(policy.id); const regionOptions = isRegional ? (selectedDossier.regions ?? []).filter((r) => r.ownerId === selectedDossier.countryId && (policy.id !== "build-port" || r.maritimeAccess > 0)) : []; const preview = engine?.getPlayerPolicyPreview(policy.id); return <div key={policy.id} className="policy-item"><div><small>{policy.name}</small><b>{policy.cost} PD · {policy.cooldown} kw. cooldown</b><small>{policy.description}</small>{preview && <small className="decision-preview">Po wykonaniu: {preview.summary}</small>}</div>{isRegional && regionOptions.length ? <select disabled={busy || selectedDossier.playerPolicyState!.decisionPoints < policy.cost} onChange={(event) => { if (engine && event.target.value) { engine.activateLogisticsPolicy(policy.id, Number(event.target.value)); refresh(engine); autosave(engine); notify(`Inwestycja: ${policy.name}`); } }}><option value="">Wybierz region...</option>{regionOptions.map((r) => <option key={r.id} value={r.id}>{r.name} · {Math.round(r.areaKm2 ?? 0)} km²</option>)}</select> : <button disabled={busy || selectedDossier.playerPolicyState!.decisionPoints < policy.cost} onClick={() => { if (engine && engine.activatePlayerPolicy(policy.id)) { refresh(engine); autosave(engine); notify(`Aktywowano: ${policy.name}`); } }}>Wykonaj</button>}</div>; }) : <small>Brak dostępnych aktów w tej turze.</small>}</div><footer>{(engine ? engine.getCountryLogisticsInvestments(selectedDossier.countryId) : []).length ? <div><small>Aktywne inwestycje:</small>{(engine ? engine.getCountryLogisticsInvestments(selectedDossier.countryId) : []).slice(0, 4).map((inv) => <span key={inv.id}><b>{inv.type}</b><small>{strategicRegions[inv.regionId]?.name ?? `Region ${inv.regionId}`}</small><small>poz. {inv.remainingTurns} kw.</small></span>)}</div> : <span>Brak aktywnych inwestycji.</span>}</footer></section>}
              {dossierTab === "military" && inspectedSectorId !== null && (() => { const sector = strategicRegions[inspectedSectorId]; const ownerId = sector?.ownerId ?? selectedDossier.countryId; const owner = engine?.getCountry(ownerId); const regionLogistics = engine?.getRegionLogistics(inspectedSectorId); const defense = engine?.getStrategicRegionResistance(inspectedSectorId); const terrain = engine?.getStrategicRegionTerrain(inspectedSectorId); const profile = engine?.getStrategicRegionDefenseProfile(inspectedSectorId); return <section className="sector-detail"><header><b>{sector?.name ?? `Sektor ${inspectedSectorId}`}</b><span>{owner?.flag} {owner?.name ?? "—"}</span></header><div><span><small>Obrona <InfoTip>Łączy wielkość sektora, teren i poziom umocnień. Wyższa wartość spowalnia atakującego.</InfoTip></small><b>{defense?.label ?? "—"}</b></span><span><small>Teren <InfoTip>Rzeźba terenu wpływa na tempo marszu, rozpoznanie i liczbę dogodnych osi natarcia.</InfoTip></small><b>{terrain?.label ?? "—"}</b></span><span><small>Umocnienia <InfoTip>Stałe przygotowanie obronne sektora. Możesz je podnosić decyzją „Przygotuj umocnienia” w zakładce Decyzje.</InfoTip></small><b>{profile ? `${profile.fortification}/100` : "—"}</b><i>{profile?.fortificationLabel}</i></span><span><small>Logistyka <InfoTip>Określa sprawność dowozu ludzi, amunicji i paliwa do sektora.</InfoTip></small><b>{typeof regionLogistics === "number" ? Math.round(regionLogistics) : "—"}</b></span></div><footer><p><b>Przeszkoda dla atakującego:</b> {profile?.naturalObstacle ?? terrain?.description ?? ""}. {profile?.attackerBrief ?? ""}</p><p><b>Źródło umocnień:</b> {profile?.source ?? "—"}</p><p>{formatArea(sector?.areaKm2 ?? 0)}. {sector?.provinceNames.length ? sector.provinceNames.join(" · ") : ""}</p></footer></section>; })()}
            </aside>}
            {hover && <div className="map-tooltip" style={{ left: hover.x, top: hover.y }}><span>{hover.country.flag}</span><strong>{hover.country.name}</strong>{gameMode === "war" && warTitle(hover.country.id) && <em className="country-title">{warTitle(hover.country.id)}</em>}</div>}
            {last && <div className={`event-ribbon ${last.action}`}><span>{actionIcons[last.action]}</span><p>{last.text}</p><b>{last.directionShort}</b></div>}
            {winner && <div className="winner-announcement" role="status"><span>KONIEC ROZGRYWKI</span><p>GRĘ WYGRAŁ:</p><h2>{winner.flag} {winner.name}</h2><button onClick={newGame}>Nowa rozgrywka</button></div>}
          </div>
          <div className="map-footer"><div className="phase-line"><i className={busy ? "pulse" : ""} /><p>{phase}</p></div>
            {selected && <div className="selected-country"><span>{selected.country.flag}</span><div><strong>{selected.country.name}{gameMode === "war" && warTitle(selected.country.id) && <em className="country-title">{warTitle(selected.country.id)}</em>}</strong><small>{formatArea(selected.area)} · {Math.round(selected.share * 100)}% stanu początkowego</small></div><button onClick={() => setSelectedId(null)} aria-label="Zamknij">×</button></div>}
          </div>
        </div>

        <aside className="controls">
          <header className="control-heading"><div><span className="eyebrow">{gameMode === "war" ? "WAR ONLY" : gameMode === "strategy" ? "TRYB STRATEGICZNY" : "TRYB PEŁNY"} · {gameRegion ? regionLabels[gameRegion].toUpperCase() : "CAŁY ŚWIAT"} · {gameMode === "strategy" ? strategicDate(turn + 1).toUpperCase() : `TURA ${turn + 1} · KROK ${stageOrder.indexOf(stage) + 1} Z 5`}</span><h2>{gameMode === "strategy" ? "Dowództwo państwa" : "Koła losujące"}</h2></div><div className="speed">{[1, 2, 4, 8].map((value) => <button key={value} className={speed === value ? "active" : ""} onClick={() => setSpeed(value)}>{value}×</button>)}</div></header>
          {gameMode === "strategy" ? <div className="strategy-command" aria-live="polite">
            <button className="strategy-round" disabled={!ready || busy || !playerCountry || Boolean(playerCampaignConflict)} onClick={() => void runStrategicRound()}>{busy ? "AI rozgrywa kwartał…" : playerCampaignConflict ? "Najpierw zdecyduj o kampanii" : playerCampaign ? "Kontynuuj kampanię i rozegraj kwartał" : strategicTargetId === null ? "Zarządzaj państwem przez kwartał" : "Rozpocznij kampanię i rozegraj kwartał"}</button>
            <div className="strategy-player">
              <span>{playerCountry?.flag ?? "◎"}</span>
              <div><small>TWOJE PAŃSTWO</small><strong>{playerCountry?.name ?? "—"}</strong></div>
              {!selectedDossier && playerStrength && <div className="strategy-strength" title={`Potencjał państwa łączy gospodarkę, ludność, technologię, logistykę, wojsko i sprawność instytucji. Zdobycze dają tylko część zasobów do czasu asymilacji, a wyczerpanie wojenne obniża wynik. Siła na konkretnym froncie jest liczona osobno.`}><small>POTENCJAŁ PAŃSTWA</small><strong>{playerStrength.rating}<i>/100</i></strong><em>{playerStrength.tier} · #{playerStrength.rank} z {playerStrength.activeCountries}</em><b>wynik modelu {Math.round(playerStrength.power)} · wyczerpanie {Math.round(playerStrength.exhaustion)}%</b></div>}
              {!selectedDossier && playerDossier?.manpower && <div className="manpower-card"><header><b>SIŁY ZBROJNE</b><span>dane wywiadu</span></header><div><span><small>Dysponujący</small><b>{playerDossier.manpower.available}</b><small>na {playerDossier.manpower.active} aktywnych, {playerDossier.manpower.reserves} rezerwy</small></span><span><small>Koszt utrzymania</small><b>{playerDossier.manpower.maintenanceCost.toFixed(1)}</b><small>jednostek/kwartał</small></span><span><small>Mobilizacja</small><b>{playerDossier.manpower.mobilization === "hidden" ? "Ukryta" : playerDossier.manpower.mobilization === "open" ? "Jawna" : "Pełna"}</b><small>{playerDossier.manpower.mobilization === "full" ? "+35% obrony" : playerDossier.manpower.mobilization === "open" ? "+10-25% obrony" : "zwykła gotowość"}</small></span></div></div>}
              {!selectedDossier && playerDossier && <section className="logistics-dossier"><div><small>INDEKS LOGISTYCZNY <InfoTip>Ocena sprawności transportu i zaopatrzenia w skali 0–100. Uwzględnia porty, kolej, drogi, połączenia lotnicze i inwestycje.</InfoTip></small><strong>{typeof playerDossier.countryLogistics === "number" ? Math.round(playerDossier.countryLogistics) : "—"}</strong><em>/100</em></div><div><span><small>WPŁYW NA GOSPODARKĘ <InfoTip>Infrastruktura wpływa na potencjał logistyczny i zaopatrzenie. Gra nie nalicza osobnego, stałego bonusu do gospodarki za przekroczenie progu indeksu.</InfoTip></small><b>{"pośredni"}</b></span><span><small>WPŁYW NA REZERWY <InfoTip>Liczba rezerw zależy od ludności i mobilizacji. Logistyka wpływa na możliwości wykorzystania sił, ale nie odejmuje bezpośrednio ludzi z rezerw.</InfoTip></small><b>{"brak bezpośredniego"}</b></span></div><details><summary>{(playerDossier.regionLogistics ?? []).length} regionów <InfoTip>Region logistyczny jest tym samym sektorem terenowym widocznym w Wojsku. Kliknij nazwę, aby go zaznaczyć i przybliżyć na mapie.</InfoTip></summary><div className="logistics-regions">{(playerDossier.regionLogistics ?? []).map((item) => <button key={item.regionId} className={inspectedSectorId === item.regionId ? "active" : ""} onClick={() => { setInspectedSectorId(item.regionId); focusStrategicRegion(item.regionId); }}><small>{strategicRegions[item.regionId]?.name ?? `Region ${item.regionId}`} <InfoTip>Indeks sektora łączy wszystkie widoczne niżej elementy infrastruktury.</InfoTip></small><b>{Math.round(item.logisticsIndex)}</b><small>porty {item.portCount} <InfoTip>Początkowe porty pochodzą z Natural Earth; liczba uwzględnia też porty wybudowane w rozgrywce. Porty są najważniejszym elementem handlu morskiego.</InfoTip> · kolej {Math.round(item.railDensity)}/100 <InfoTip>Poziom sieci kolejowej, nie liczba kilometrów. Modernizacja kolei podnosi go w wybranym sektorze, wojna i utrata sektora odbierają jego korzyści.</InfoTip> · drogi {Math.round(item.roadDensity)}/100 <InfoTip>Poziom sieci drogowej, nie liczba kilometrów. Modernizacja dróg podnosi go w wybranym sektorze, a wojna może ograniczyć dostępne zaplecze.</InfoTip> · lotniska {item.airportCount} <InfoTip>Początkowa liczba średnich i dużych lotnisk pochodzi z OurAirports; w rozgrywce uwzględnia też ukończone budowy. Ukończona rozbudowa dodaje jedno lotnisko w tym regionie.</InfoTip></small></button>)}</div></details></section>}
              {!selectedDossier && playerDossier?.regimeType && <section className="regime-card"><header><b>REŻIM</b><span>typ systemu politycznego</span></header><div><span><small>System</small><b>{engine?.getRegimeLabel(playerDossier.regimeType)}</b></span></div></section>}
              {!selectedDossier && playerDossier?.combatExperience !== undefined && <section className="experience-card"><header><b>DOŚWIADCZENIE BOJOWE</b><span>punkty doświadczenia</span></header><div><span><small>Suma</small><b>{Math.round(playerDossier.combatExperience)}</b><small>punktów</small></span></div></section>}
              {!selectedDossier && playerDossier?.informationEnvironment && <section className="information-card"><header><b>ŚRODOWISKO INFORMACYJNE</b><span>{engine?.getInformationEnvironmentLabel(playerDossier.informationEnvironment.score)}</span></header><div><span><small>Technologia</small><b>{Math.round(playerDossier.informationEnvironment.techComponent)}</b><small>dostęp do platform</small></span><span><small>Kontrola mediów</small><b>{Math.round(playerDossier.informationEnvironment.mediaControl)}</b><small>cenzura/propaganda</small></span><span><small>Służby specjalne</small><b>{Math.round(playerDossier.informationEnvironment.servicesStrength)}</b><small>inwigilacja</small></span></div></section>}
              {!selectedDossier && playerDossier?.demographics && <section className="demographics-card"><header><b>DEMOGRAFIA</b><span>{engine?.getDemographicLabel(playerDossier.demographicType)}</span></header><div className="demographics-bars">{Object.entries(playerDossier.demographics).map(([key, value]) => <span key={key}><small>{key === "children" ? "Dzieci 0-14" : key === "youth" ? "Młodzież 15-24" : key === "primeAge" ? "Najlepszy wiek 25-44" : key === "middleAge" ? "Średni wiek 45-64" : key === "elderly" ? "Seniorzy 65+" : "80+ lat"}</small><b>{Math.round((value ?? 0) * 100)}%</b><i><em style={{ width: `${Math.min(100, Math.max(0, (value ?? 0) * 100))}%` }} /></i></span>)}</div><footer><span>Ludność bezwzględna: <b>{engine?.getCountryPopulationAbsolute(playerDossier.countryId) ? Math.round(engine.getCountryPopulationAbsolute(playerDossier.countryId)).toLocaleString("pl-PL") + " osób" : "—"}</b></span><span>Typ piramidy: <b>{engine?.getDemographicLabel(playerDossier.demographicType)}</b></span><span>Granice: <b>{playerDossier.borderPolicy === "closed" ? "Zamknięte" : playerDossier.borderPolicy === "selective" ? "Selektywne" : playerDossier.borderPolicy === "open" ? "Otwarte" : "Masowe"}</b></span>{playerDossier.refugeesHosted > 0 && <span>Uchodźcy: <b>{Math.round(playerDossier.refugeesHosted).toLocaleString("pl-PL")}</b></span>}{playerDossier.refugeesHosted > 0 && playerDossier.refugeeComposition.women + playerDossier.refugeeComposition.men + playerDossier.refugeeComposition.children > 0 && <span>Skład: <b>{Math.round(playerDossier.refugeeComposition.women / playerDossier.refugeesHosted * 100)}% kobiet, {Math.round(playerDossier.refugeeComposition.children / playerDossier.refugeesHosted * 100)}% dzieci</b> <InfoTip>Pełna mobilizacja zatrzymuje większość dorosłych mężczyzn. Z tego powodu strumień uchodźczy z takiego państwa jest przede wszystkim kobieco-dziecięcy.</InfoTip></span>}</footer></section>}
              {!selectedDossier && playerDossier?.playerPolicyState && (() => {
                const policyState = playerDossier.playerPolicyState;
                const policies = engine ? engine.getAvailablePlayerPolicies(playerCountryId!) : [];
                const countryRegions = (playerDossier.regions ?? []).filter((r) => r.ownerId === playerCountryId!);
                const investments = engine ? engine.getCountryLogisticsInvestments(playerCountryId!) : [];
                return <section className="policy-card"><header><b>DECYZJE PREZYDENTA</b><span>punkty decyzyjne: <b className="policy-points">{policyState.decisionPoints}</b></span></header><div className="policy-list">{policies.length ? policies.map((policy) => {
                  const isRegional = ["build-port", "modernize-roads", "expand-airport", "rail-upgrade", "fortify-sector"].includes(policy.id);
                  const regionOptions = isRegional ? countryRegions.filter((r) => policy.id === "build-port" ? r.maritimeAccess > 0 : true) : [];
                  const preview = engine?.getPlayerPolicyPreview(policy.id);
                  return <div key={policy.id} className="policy-item"><div><small>{policy.name}</small><b>{policy.cost} PD · {policy.cooldown} kw. cooldown</b><small>{policy.description}</small>{preview && <small className="decision-preview">Po wykonaniu: {preview.summary}</small>}</div>{isRegional && regionOptions.length ? <select disabled={busy || policyState.decisionPoints < policy.cost} onChange={(event) => { if (engine && event.target.value) { engine.activateLogisticsPolicy(policy.id, Number(event.target.value)); refresh(engine); autosave(engine); notify(`Inwestycja: ${policy.name}`); } }}><option value="">Wybierz region...</option>{regionOptions.map((r) => <option key={r.id} value={r.id}>{r.name} · {Math.round(r.areaKm2 ?? 0)} km²</option>)}</select> : <button disabled={busy || policyState.decisionPoints < policy.cost} onClick={() => { if (engine && engine.activatePlayerPolicy(policy.id)) { refresh(engine); autosave(engine); notify(`Aktywowano: ${policy.name}`); } }}>Wykonaj</button>}</div>;
                }) : <small>Brak dostępnych aktów w tej turze.</small>}</div><footer>{investments.length ? <div><small>Aktywne inwestycje:</small>{investments.slice(0, 4).map((inv) => <span key={inv.id}><b>{inv.type}</b><small>{strategicRegions[inv.regionId]?.name ?? `Region ${inv.regionId}`}</small><small>poz. {inv.remainingTurns} kw.</small></span>)}</div> : <span>Brak aktywnych inwestycji.</span>}</footer></section>;
              })()}
            </div>
            {!selectedDossier && playerDossier && <section className="strategic-dashboard"><div className="politics-summary"><b>MANDAT</b><span>Legitymizacja <strong>{Math.round(playerDossier.politics.legitimacy)}</strong></span><span>Reputacja <strong>{Math.round(playerDossier.politics.reputation)}</strong></span><span>Poparcie wojny <strong>{Math.round(playerDossier.politics.warSupport)}</strong></span></div><div className="resources-summary"><b>ZASOBY · GOTOWOŚĆ {Math.round(playerDossier.resources.readiness)}</b>{(["energy", "industry", "food", "technology", "logistics"] as const).map((key) => <span key={key} className={playerDossier.resources.bottleneck === key ? "bottleneck" : ""}><small>{key === "energy" ? "Energia" : key === "industry" ? "Przemysł" : key === "food" ? "Żywność" : key === "technology" ? "Technologie" : "Transport"}</small><strong>{Math.round(playerDossier.resources[key])}</strong></span>)}</div><div className="objectives-summary"><b>CELE PAŃSTWA</b>{playerDossier.objectives.map((objective) => <span key={objective.id} className={objective.completed ? "completed" : ""}><small>{objective.name}</small><strong>{objective.completed ? `✓ ${objective.points}` : `${Math.round(objective.progress)}%`}</strong></span>)}</div></section>}
            {playerOccupations.length > 0 && <section className="occupation-list"><header><b>ZARZĄDZANIE ZDOBYCZAMI</b><span>{playerOccupations.length} równocześnie · koszt administracyjny rośnie</span></header>{playerOccupations.map((occupation) => { const currentPolicy = occupation.policy ?? "annexation"; return <div key={occupation.regionId}><span>{strategicRegions[occupation.regionId]?.name}</span><b>{Math.round(occupation.progress)}%</b><i><em style={{ width: `${occupation.progress}%` }} /></i><small>{STRATEGIC_OCCUPATION_POLICIES[currentPolicy].description}</small><label><small>Model okupacji</small><select value={currentPolicy} disabled={busy} onChange={(event) => changeOccupationPolicy(occupation.regionId, event.target.value as StrategicOccupationPolicyChoice)}>{(Object.entries(STRATEGIC_OCCUPATION_POLICIES) as Array<[Exclude<StrategicOccupationPolicyChoice, "withdrawal">, (typeof STRATEGIC_OCCUPATION_POLICIES)["annexation"]]>).map(([id, item]) => <option key={id} value={id}>{item.name} · {Math.round(item.resourceCeiling * 100)}% zasobów</option>)}</select></label><button type="button" disabled={busy} onClick={() => changeOccupationPolicy(occupation.regionId, "withdrawal")}>Wycofaj administrację i oddaj sektor</button></div>; })}</section>}
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
            </div> : playerCampaign ? <div className="campaign-card active"><header><span>⚔ AKTYWNA KAMPANIA</span><b>{Math.round(playerCampaign.progress)}%</b></header><strong>{strategicRegions[playerCampaign.regionId]?.name}</strong><small>Przeciwnik: {engine?.getCountry(playerCampaign.defenderId)?.flag} {engine?.getCountry(playerCampaign.defenderId)?.name} · {strategicRegions[playerCampaign.regionId]?.provinceCount ?? 1} prow. · kwartał kampanii {playerCampaign.turns + 1} · siła przeciwnika {engine?.getStrategicStrength(playerCampaign.defenderId).rating}/100</small><small>Uzasadnienie: {STRATEGIC_CASUS_BELLI[playerCampaign.casusBelli ?? "security-threat"].name}</small>{playerCampaign.lastRandomFactor && <small className="campaign-roll">Ostatni kwartał: los ×{playerCampaign.lastRandomFactor.toFixed(2)} · zmiana frontu {playerCampaign.lastMomentum! >= 0 ? "+" : ""}{playerCampaign.lastMomentum?.toFixed(1)} pkt</small>}<div><i style={{ width: `${playerCampaign.progress}%` }} /></div></div> : <><label className="strategy-target"><span>CEL NOWEJ KAMPANII</span><select value={strategicTargetId ?? ""} onChange={(event) => selectStrategicTarget(event.target.value ? Number(event.target.value) : null)}><option value="">Bez nowej wojny w tym kwartale</option>{strategicTargets.map((region) => <option key={region.id} value={region.id}>{engine?.getCountry(region.ownerId)?.flag} {region.name} · {region.provinceCount} prow. · siła {engine?.getStrategicStrength(region.ownerId).rating}/100 · {formatArea(region.areaKm2)}</option>)}</select><small>Wybranie celu automatycznie pokazuje go na mapie. Można atakować sektor lądowo sąsiedni albo położony do 500 km przez nieprzerwane morze.</small></label><label className="casus-belli"><span>UZASADNIENIE WOJNY</span><select value={strategicCasusBelli} onChange={(event) => setStrategicCasusBelli(event.target.value as StrategicCasusBelliId)}>{Object.values(STRATEGIC_CASUS_BELLI).map((casus) => <option key={casus.id} value={casus.id}>{casus.name}</option>)}</select><small>{STRATEGIC_CASUS_BELLI[strategicCasusBelli].description}</small></label>
            {selectedTargetDetails && <section className={`target-intelligence ${selectedTargetDetails.assessment.level}`}><header><span>ROZPOZNANIE I SKUTKI DECYZJI</span><b>{selectedTargetDetails.assessment.chance}% SZANS</b></header><h3>{selectedTargetDetails.region.name}</h3><p>{selectedTargetDetails.owner?.flag} Kontrola: <b>{selectedTargetDetails.owner?.name}</b>{selectedTargetDetails.originalOwner?.id !== selectedTargetDetails.owner?.id ? ` · historycznie w grze: ${selectedTargetDetails.originalOwner?.name}` : ""}</p><div><span><small>Opór sektora</small><b>{selectedTargetDetails.resistance.label} ×{selectedTargetDetails.resistance.factor.toFixed(2)}</b></span><span><small>Gotowość zasobowa</small><b>{Math.round(selectedTargetDetails.assessment.resourceReadiness)}/100</b></span><span><small>Zaufanie → po decyzji</small><b>{Math.round(selectedTargetDetails.assessment.relationBefore.trust)} → {Math.round(selectedTargetDetails.assessment.relationAfter.trust)}</b></span><span><small>Napięcie → po decyzji</small><b>{Math.round(selectedTargetDetails.assessment.relationBefore.tension)} → {Math.round(selectedTargetDetails.assessment.relationAfter.tension)}</b></span></div><strong>{selectedTargetDetails.assessment.label}</strong><p className="decision-consequences">Po rozpoczęciu wojny: {selectedTargetDetails.assessment.consequences.join(" · ")}.</p>{selectedTargetDetails.occupation && <em>Integracja obecnego właściciela: {Math.round(selectedTargetDetails.occupation.progress)}%</em>}<small>{selectedTargetDetails.region.provinceNames.join(" · ")}</small></section>}</>}
            <div className="campaign-overview"><header><b>WOJNY ŚWIATA</b><span>{strategicCampaigns.length} aktywnych</span></header>{strategicCampaigns.slice().sort((a,b)=>b.progress-a.progress).slice(0,6).map((campaign) => <button key={campaign.id} onClick={() => { const region=strategicRegions[campaign.regionId]; if(region){ setSelectedId(region.ownerId); focusCountry(region.ownerId); } }}><span>{engine?.getCountry(campaign.attackerId)?.flag} {engine?.getCountry(campaign.attackerId)?.name}</span><i>→</i><span>{engine?.getCountry(campaign.defenderId)?.flag} {strategicRegions[campaign.regionId]?.name}</span><b>{Math.round(campaign.progress)}%</b></button>)}</div>
          </div> : <>{gameMode === "war" && playerAlarm && <div className="player-alarm" role="alert"><span aria-hidden="true">⚠</span><div><b>ALARM OBRONNY</b><small>{playerAlarm}</small></div></div>}
          {gameMode === "full" && partialWarning && <div className="partial-warning" role="status"><span aria-hidden="true">◐</span><div><b>AKCJA CZĘŚCIOWA</b><small>{partialWarning}</small></div></div>}
          <div className="turn-console">
            <div className="wheel-grid" aria-live="polite">
              <Wheel step="01" label="Kraj" value={wheels.country} rolling={activeWheel === "country"} current={stage === "country"} onValueClick={wheelCountryId === null ? undefined : () => { setSelectedId(wheelCountryId); focusCountry(wheelCountryId); }} />
              <Wheel step="02" label="Akcja" value={wheels.action} rolling={activeWheel === "action"} current={stage === "action"} />
              <Wheel step="03" label="Kierunek" value={wheels.direction} rolling={activeWheel === "direction"} current={stage === "direction"} />
              <Wheel step="04" label="Wielkość" value={wheels.size} rolling={activeWheel === "size"} current={stage === "size"} />
            </div>
            <div className="primary-controls">
            <button className={`turn-button ${stage === "apply" ? "apply" : ""}`} disabled={!ready || !gameMode || busy} onClick={() => void runStage()}><span>{busy ? (stage === "apply" ? "ZMIENIAM GRANICE" : "TRWA LOSOWANIE") : stageLabels[stage]}</span><kbd>SPACJA</kbd></button>
            <div className="secondary-controls">
              <button disabled={!engine?.canUndo() || busy || (gameMode === "war" && warUndosLeft === 0)} onClick={undo}><span>↶</span> Cofnij ostatnią turę{gameMode === "war" ? ` (${warUndosLeft})` : ""}</button>
              {gameMode === "war" && stage === "size" && <button className="veto-button" disabled={busy || warVetoesLeft === 0} title="Weto kierunku: odrzuć wylosowany kierunek i wylosuj nowy" onClick={() => void applyWarVeto()}>WETO ({warVetoesLeft})</button>}
            </div>
            <div className="auto-controls" aria-label="Automatyczna symulacja">
              {autoRunning ? <button className="auto-stop" onClick={stopAuto}>■ Zatrzymaj po tej turze</button> : <>
                <button disabled={!ready || !gameMode || busy || stage !== "country"} onClick={() => void runAuto(10)}>▶ 10 tur</button>
                <button disabled={!ready || !gameMode || busy || stage !== "country"} onClick={() => void runAuto(50)}>▶ 50 tur</button>
                <button disabled={!ready || !gameMode || busy || stage !== "country"} onClick={() => void runAuto(null)}>∞ Ciągły</button>
              </>}
            </div>
            <label className="major-toggle"><input type="checkbox" checked={pauseOnMajor} disabled={autoRunning} onChange={(event) => setPauseOnMajor(event.target.checked)} /> Pauza po eliminacji lub wyniku ALL</label>
            </div>
          </div></>}
          <div className={`history-panel world-panel ${infoPanelOpen ? "open" : ""}`}>
            <nav className="panel-tabs" aria-label="Informacje o świecie">
              <button className={sidePanel === "history" ? "active" : ""} onClick={() => setSidePanel("history")}>Historia</button>
              <button className={sidePanel === "ranking" ? "active" : ""} onClick={() => setSidePanel("ranking")}>Ranking</button>
              <button className={sidePanel === "chronicle" ? "active" : ""} onClick={() => setSidePanel("chronicle")}>Kronika</button>
              <button className="panel-close" onClick={() => setInfoPanelOpen(false)} aria-label="Zamknij panel">×</button>
            </nav>
            {sidePanel === "history" && <><header><h3>Historia świata</h3><span>{history.length ? `${history.length} ostatnich zdarzeń` : "brak zdarzeń"}</span></header><div className="history-list">{history.length ? history.slice(0, 12).map((record) => <History key={`${record.turn}-${record.countryId}${record.cataclysm ? "-kataklizm" : ""}`} record={record} />) : <div className="empty-history"><span>◇</span><p>Pierwsza zmiana granic pojawi się tutaj po rozegraniu tury.</p></div>}</div></>}
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
                      <b title={entry.active ? `#${entry.rank} według kontrolowanego obszaru` : "Państwo wyeliminowane"}>{entry.active ? entry.rank : "—"}</b>
                      <span className="ranking-country"><i>{entry.flag}</i><strong>{entry.name}</strong>{gameMode === "war" && warTitle(entry.countryId) && <em className="country-title">{warTitle(entry.countryId)}</em>}{gameMode === "war" && lostCapitalCountries.has(entry.countryId) && <i className="country-flag-icon lost" title="stolica utracona">⚑</i>}{gameMode === "war" && (engine?.getWarExhaustion(entry.countryId) ?? 0) >= 9 && <i className="country-flag-icon tired" title="zmęczenie wojną">⏳</i>}{gameMode === "war" && warGuarantee?.countryId === entry.countryId && <i className="country-flag-icon guarded" title="gwarancja obronna">🛡</i>}{s && <small>#{s.rank} potencjału</small>}</span>
                      <span className="ranking-area">{formatArea(entry.areaKm2)}</span>
                      {gameMode === "strategy" && <span className="ranking-strength" role="button" tabIndex={0} title={explanation} onClick={(event) => { event.stopPropagation(); setExpandedRankingCountryId(expanded ? null : entry.countryId); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); setExpandedRankingCountryId(expanded ? null : entry.countryId); } }}><b>{s?.rating ?? 0}</b><i>/100</i><em>{expanded ? "▴" : "▾"}</em></span>}
                      <em className={entry.changePercent > 0 ? "up" : entry.changePercent < 0 ? "down" : ""}>{entry.changePercent > 0 ? "+" : ""}{entry.changePercent.toFixed(1)}%</em>
                      <small title="Liczba wyeliminowanych państw">⚔ {entry.defeats}</small>
                    </button>
                    {gameMode === "war" && !warGuarantee && !warGuaranteeUsed && entry.active && <button className="guarantee-button" title="Gwarancja obronna: przez 10 tur ten kraj traci o połowę mniej" onClick={() => grantWarGuarantee(entry.countryId)}>Gwarancja</button>}
                    {expanded && s && <div className="ranking-breakdown">{Object.entries(s.components).map(([key, value]) => <span key={key}><small>{componentLabels[key as keyof typeof componentLabels]}</small><i><em style={{ width: `${Math.min(100, value)}%` }} /></i><b>{Math.round(value)}</b></span>)}<footer><span>Wyczerpanie <b>{Math.round(s.exhaustion)}%</b></span><span>Integracja <b>{Math.round(s.integration)}%</b></span><span>Siła frontu: liczona dopiero dla konkretnego ataku</span></footer></div>}
                  </div>;
                })}
              </div>
            </>}
            {sidePanel === "chronicle" && <div className="chronicle-card"><span className="chronicle-seal">✦</span><h3>Kronika tego świata</h3><p>Zamień do 120 ostatnich zdarzeń i końcowy ranking w opowieść o epokach, potęgach i upadkach.</p><button disabled={!history.length} onClick={buildChronicle}>Otwórz kronikę</button><small>Lokalny szkic działa zawsze. Wersja AI wymaga skonfigurowania klucza po stronie serwera.</small></div>}
          </div>
        </aside>
      </section>

      {gameMode && <section className="ranking-ticker" aria-label="Czołówka rankingu państw">
        <button className="ranking-ticker-label" onClick={() => { setSidePanel("ranking"); setInfoPanelOpen(true); }}><span>RANKING</span><small>pełna tabela</small></button>
        <div className="ranking-ticker-track">
          {sortedRanking.filter((entry) => entry.active).slice(0, 8).map((entry) => <button key={entry.countryId} onClick={() => { setSelectedId(entry.countryId); focusCountry(entry.countryId); }}>
            <b>{entry.rank}</b><span>{entry.flag}</span><strong>{entry.name}</strong><em>{gameMode === "strategy" ? `${entry.strength?.rating ?? 0}/100` : formatArea(entry.areaKm2)}</em>
          </button>)}
        </div>
        <button className="ranking-ticker-more" onClick={() => { setSidePanel("ranking"); setInfoPanelOpen(true); }} aria-label="Otwórz pełny ranking">↗</button>
      </section>}

      <footer className="app-footer"><span>Mapa zapisuje się automatycznie na tym urządzeniu</span><span className="terrain-credit">Prowincje: Natural Earth Admin‑1 · Wysokości: ETOPO1/GMTED2010</span><button className="seed-copy" disabled={!engine} onClick={() => engine && void copyText(String(engine.seed), "Seed skopiowany")}>Seed świata: <b>{engine?.seed ?? "—"}</b> ⧉</button></footer>

      {!warReport && capitalRelocationOptions.length > 0 && <div className="modal-backdrop war-report-backdrop" role="presentation"><section className="war-report capital-relocation" role="dialog" aria-modal="true" aria-labelledby="capital-relocation-title"><span className="eyebrow">UTRATA STOLICY</span><h2 id="capital-relocation-title">Rząd musi przenieść siedzibę</h2><p className="war-report-target">Wybierz bezpieczną stolicę zastępczą. Położenie, logistyka i odległość od frontu będą wpływać na zdolność państwa do działania.</p><div className="capital-relocation-options">{capitalRelocationOptions.map((option) => <button key={option.regionId} onClick={() => { if (!engine?.relocatePlayerCapital(option.regionId)) return; refresh(engine); autosave(engine); paint(); setPhase(`Stolica została przeniesiona do: ${option.name}.`); notify("Wybrano nową siedzibę rządu"); }}><b>{option.name}</b><small>{option.reason}</small><em>ocena {Math.round(option.score)}</em></button>)}</div></section></div>}

      {warReport && (() => {
        const attacker = engine?.getCountry(warReport.attackerId);
        const defender = engine?.getCountry(warReport.defenderId);
        const sector = strategicRegions[warReport.regionId];
        const fled = warReport.refugeesFled ?? 0;
        const destinations = (warReport.refugeeDestinations ?? []).filter(({ people }) => people > 0).sort((a, b) => b.people - a.people);
        return <div className="modal-backdrop war-report-backdrop" role="presentation"><section className="war-report" role="dialog" aria-modal="true" aria-labelledby="war-report-title"><button className="modal-close" onClick={() => setWarReport(null)} aria-label="Zamknij raport wojenny">×</button><span className="eyebrow">RAPORT ZAKOŃCZONEJ WOJNY · SZACUNEK MODELU</span><h2 id="war-report-title">{warOutcomeLabels[warReport.outcome]}</h2><p className="war-report-target">{attacker?.flag} {attacker?.name} <b>→</b> {defender?.flag} {defender?.name}</p><div className="war-report-area"><span>SPORNY OBSZAR</span><strong>{sector?.name ?? "nieznany sektor"}</strong><small>{strategicDate(warReport.startedTurn)} – {strategicDate(warReport.endedTurn)} · {warReport.battles} potyczek</small></div><div className="war-losses"><div><span>{attacker?.flag}</span><small>STRATY ATAKUJĄCEGO</small><strong>{warReport.attackerCasualties.toLocaleString("pl-PL")}</strong></div><div><span>{defender?.flag}</span><small>STRATY BRONIĄCEGO</small><strong>{warReport.defenderCasualties.toLocaleString("pl-PL")}</strong></div></div><div className="war-demographic-impact"><span>ZMIANY W LUDNOŚCI</span><div><small>{attacker?.flag} {attacker?.name}</small><b>−{warReport.attackerCasualties.toLocaleString("pl-PL")} osób w stratach bojowych</b></div><div><small>{defender?.flag} {defender?.name}</small><b>{fled ? `${fled.toLocaleString("pl-PL")} osób uciekło` : "brak odnotowanego odpływu uchodźców"}</b>{fled > 0 && <small>{Math.round((warReport.refugeesFledWomen ?? 0) / fled * 100)}% kobiet, {Math.round((warReport.refugeesFledChildren ?? 0) / fled * 100)}% dzieci, {Math.round((warReport.refugeesFledMen ?? 0) / fled * 100)}% dorosłych mężczyzn</small>}</div></div>{destinations.length > 0 && <div className="war-refugee-destinations"><span>DOKĄD UCIEKLI</span>{destinations.map(({ countryId, people }) => { const country = engine?.getCountry(countryId); return <div key={countryId}><small>{country?.flag} {country?.name ?? "nieznane państwo"}</small><b>+{people.toLocaleString("pl-PL")}</b></div>; })}</div>}<p className="war-report-note">Te osoby są odejmowane od ludności broniącego się kraju i dodawane do ludności państw przyjmujących. W zakładce Ludność każdego z nich widać łączną liczbę przyjętych uchodźców.</p><WarPopulationBalance war={warReport} attackerName={attacker?.name ?? "Atakujący"} defenderName={defender?.name ?? "Broniący"} /><button className="modal-primary" onClick={() => setWarReport(null)}>Przejdź dalej</button></section></div>;
      })()}

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
        </> : (pendingMode === "strategy" || pendingMode === "war") && pendingRegion ? <>
          <button className="mode-back" onClick={() => { setPendingRegion(null); setPlayerCountryQuery(""); }}>← Wróć do obszaru</button>
          <span className="eyebrow">NOWA ROZGRYWKA · KROK 3 Z 3 · {pendingMode === "war" ? "WAR ONLY" : "STRATEGICZNY"}</span>
          <h2 id="mode-title">{pendingMode === "war" ? "Wybierz swoje państwo (opcjonalnie)" : "Wybierz swoje państwo"}</h2>
          <p className="mode-intro">{pendingMode === "war"
            ? "Własne państwo daje alarm o ataku, weto kierunku, gwarancję obronną i szybki powrót kamery. Możesz też oglądać świat bez żadnego kraju."
            : "Ty wybierasz cele kampanii tego państwa. Wszystkie pozostałe kraje podejmują decyzje samodzielnie."}</p>
          {pendingMode === "war" && <button className="mode-skip-player" disabled={!ready || !engine} onClick={() => choosePlayerCountry(null)}>Graj bez własnego państwa →</button>}
          {pendingMode === "war" && <label className="country-search"><span>Wyszukaj państwo</span><input type="search" value={playerCountryQuery} onChange={(event) => setPlayerCountryQuery(event.target.value)} placeholder="Nazwa lub kod, np. Polska albo CH" autoComplete="off" /><small>{visiblePlayerCountries.length} z {eligiblePlayerCountries.length}</small></label>}
          <div className="country-picker-grid">
            {visiblePlayerCountries.map((country) => <button key={country.id} disabled={!ready || !engine} onClick={() => choosePlayerCountry(country.id)}><span>{country.flag}</span><strong>{country.name}</strong><small>{formatArea(engine?.getCountryInitialKm2(country.id) ?? 0)}</small><b>GRAJ →</b></button>)}
          </div>
          {eligiblePlayerCountries.length > 0 && !visiblePlayerCountries.length && <p className="mode-footnote">Nie znaleziono państwa pasującego do wyszukiwania.</p>}
          {!eligiblePlayerCountries.length && <p className="mode-footnote">W tym obszarze nie ma państw spełniających wybrane zasady.</p>}
        </> : <>
          <button className="mode-back" onClick={() => { setPendingMode(null); setPendingRegion(null); }}>← Wróć do trybu</button>
          <span className="eyebrow">NOWA ROZGRYWKA · KROK 2 {pendingMode === "full" ? "Z 2" : "Z 3"} · {pendingMode === "war" ? "WAR ONLY" : pendingMode === "strategy" ? "STRATEGICZNY" : "PEŁNY"}</span>
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
          {pendingMode === "full" && <fieldset className="cataclysm-picker">
            <legend>Kataklizmy</legend>
            <label className={cataclysmOption ? "selected" : ""}><input type="checkbox" checked={cataclysmOption} onChange={(event) => setCataclysmOption(event.target.checked)} /><span><b>Kataklizmy co 40 tur (morza zalewają niziny całego świata)</b><small>Co czterdziestą turę każde grające państwo traci część najniżej położonego terytorium. Wyłączone domyślnie.</small></span></label>
          </fieldset>}
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
