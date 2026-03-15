import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const LINKS = {
  home: "/",
  about: "/about/",
  team: "/team/",
  robots: "/robots/",
  scouting: "/scouting/",
  sponsors: "/sponsors/",
  media: "/media/",
  contact: "/contact/"
};

const PAGE = "scouting";

const STORAGE_KEYS = {
  activeEventId: "bf-scouting-active-event-v1",
  activeTab: "bf-scouting-active-tab-v1",
  overviewMode: "bf-scouting-overview-mode-v1",
  outbox: "bf-scouting-outbox-v1",
  lastSyncAt: "bf-scouting-last-sync-v1",
  matchDraft: "bf-scouting-match-draft-v1",
  matchDraftSavedAt: "bf-scouting-match-draft-saved-v1",
  pitDraft: "bf-scouting-pit-draft-v1",
  pitDraftSavedAt: "bf-scouting-pit-draft-saved-v1"
};

const SCOUT_RELOAD_NEW_VALUE = "__new__";
const STATBOTICS_API_BASE = "https://api.statbotics.io/v3";
const TBA_MEDIA_PROXY_FUNCTION = "tba-media";
const TRACKED_TEAM_NUMBER = 10312;
const TEXAS_STATE_CODE = "TX";
const DEFAULT_WORKSPACE_TAB = "overview";
const OVERVIEW_MODE_COMPETITION = "competition";
const OVERVIEW_MODE_TEXAS = "texas";
const OVERVIEW_MATCH_LIMIT = 100;
const MATCH_LEVEL_ORDER = Object.freeze({
  qm: 0,
  ef: 1,
  qf: 2,
  sf: 3,
  f: 4
});
const MATCH_LEVEL_LABELS = Object.freeze({
  qm: "Qual",
  ef: "Eighthfinal",
  qf: "Quarterfinal",
  sf: "Semifinal",
  f: "Final"
});
const QF_ALLIANCE_SEED_MAP = Object.freeze({
  1: { red: 1, blue: 8 },
  2: { red: 4, blue: 5 },
  3: { red: 2, blue: 7 },
  4: { red: 3, blue: 6 }
});

const AUTO_PATH_DEFAULTS = Object.freeze({
  drawColor: "#ff7f00",
  drawSize: 5,
  eraseSize: 18,
  minDrawSize: 2,
  maxDrawSize: 18,
  minEraseSize: 8,
  maxEraseSize: 48
});

const MATCH_DEFAULTS = Object.freeze({
  scout_name: "",
  team_number: "",
  match_number: "",
  match_type: "Qualification",
  alliance_color: "Blue",
  shift_pattern: "team",
  station: "1",
  auto_fuel: 0,
  auto_tower_result: "None",
  transition_fuel: 0,
  shift_1_fuel: 0,
  shift_2_fuel: 0,
  shift_3_fuel: 0,
  shift_4_fuel: 0,
  endgame_fuel: 0,
  endgame_tower_result: "None",
  defense_rating: 3,
  penalty_count: 0,
  breakdown: false,
  no_show: false,
  notes: ""
});

const PIT_DEFAULTS = Object.freeze({
  scout_name: "",
  team_number: "",
  drivetrain: "Swerve",
  fuel_scoring_capability: "High volume",
  estimated_fuel_per_match: "",
  barge_route: "Unknown",
  cycle_time: "",
  scoring_speed: "Unknown",
  intake_style: "Unknown",
  shooter_type: "Unknown",
  hopper_size: "",
  climb_level: "",
  auto_summary: "",
  auto_path_drawing: "",
  defense_capability: "Balanced",
  preferred_strategy: "",
  reliability_notes: "",
  notes: ""
});

const DEFAULT_SCOUTING_EVENTS = Object.freeze([
  {
    slug: "fit-san-antonio-2026",
    name: "FIT District San Antonio Event",
    event_code: "TXSAN",
    location: "Freeman Coliseum, San Antonio, TX",
    start_date: "2026-03-12",
    end_date: "2026-03-14",
    is_active: true
  },
  {
    slug: "fit-amarillo-2026",
    name: "FIT District Amarillo Event",
    event_code: "TXAMA",
    location: "Amarillo Civic Center, Amarillo, TX",
    start_date: "2026-04-02",
    end_date: "2026-04-04",
    is_active: false
  }
]);

const state = {
  config: null,
  client: null,
  session: null,
  events: [],
  activeEventId: loadStoredValue(STORAGE_KEYS.activeEventId, ""),
  matchEntries: [],
  pitEntries: [],
  teamSummary: [],
  outbox: loadStoredJson(STORAGE_KEYS.outbox, []),
  activeTab: loadStoredValue(STORAGE_KEYS.activeTab, DEFAULT_WORKSPACE_TAB),
  authReady: false,
  authRedirecting: false,
  overviewMode: loadStoredValue(STORAGE_KEYS.overviewMode, OVERVIEW_MODE_COMPETITION),
  overviewLoading: false,
  overviewError: "",
  overviewFetchedAt: "",
  overviewCompetitionRows: [],
  overviewTexasRows: [],
  overviewMatches: [],
  overviewAllianceSelections: [],
  overviewTeamMediaByTeam: new Map(),
  overviewEventData: null,
  trackerEventsBySeason: new Map(),
  trackerMatchesByEvent: new Map(),
  trackerPredictionDataByEvent: new Map(),
  trackerSelectedSeason: "",
  trackerSelectedEventKey: "",
  trackerLoading: false,
  trackerError: "",
  trackerMatches: [],
  trackerEvent: null,
  trackerPredictionMatches: [],
  trackerPredictionAccuracy: null,
  trackerPredictionError: "",
  analysisResult: null,
  analysisNeedsRefresh: true,
  analysisRunning: false,
  analysisRunAt: "",
  lastSyncAt: loadStoredValue(STORAGE_KEYS.lastSyncAt, ""),
  scoutReloadSelections: {
    match: SCOUT_RELOAD_NEW_VALUE,
    pit: SCOUT_RELOAD_NEW_VALUE
  },
  editingEntryIds: {
    match: "",
    pit: ""
  },
  connectionOnline: navigator.onLine,
  isRefreshing: false,
  pendingAuthMessage: "",
  pendingAuthTone: ""
};

const elements = {};
const customSelectRegistry = new WeakMap();
let activeCustomSelect = null;
let customSelectEventsBound = false;
let overviewRequestToken = 0;
let trackerRequestToken = 0;
const autoPathState = {
  mode: "draw",
  drawColor: AUTO_PATH_DEFAULTS.drawColor,
  drawSize: AUTO_PATH_DEFAULTS.drawSize,
  eraseSize: AUTO_PATH_DEFAULTS.eraseSize,
  strokes: [],
  activeStroke: null,
  pointerId: null,
  initialized: false,
  resizeObserver: null
};

document.addEventListener("DOMContentLoaded", () => {
  void init();
});

async function init() {
  cacheDom();
  removeStoredValue("bf-scouting-analysis-debug-override-v1");
  initCustomSelects();
  initAutoPathBoard();
  state.config = normalizeConfig(window.SCOUTING_CONFIG || {});
  renderMatchTrackerSeasonOptions();
  updateMatchTrackerLinks();

  applyYear();
  wireLinks();
  setActive();
  initTheme();
  initLogoSwap();
  initPointerRipples();
  hydrateDraftForms();
  bindEvents();
  renderAll();

  if (!configReady()) {
    renderConfigState();
    return;
  }

  renderConfigState();

  state.client = createClient(state.config.supabaseUrl, state.config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  readOAuthErrorFromUrl();

  const { data, error } = await state.client.auth.getSession();
  if (error) {
    setAuthMessage(normalizeError(error, "Unable to restore the current session."), "danger");
  }

  state.client.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return;
    if (event === "SIGNED_OUT") {
      void syncSession(null);
      return;
    }

    const currentUserId = String(state.session?.user?.id || "");
    const nextUserId = String(session?.user?.id || "");
    const shouldReloadSession =
      !state.authReady ||
      !currentUserId ||
      !nextUserId ||
      currentUserId !== nextUserId;

    if (event === "SIGNED_IN" && shouldReloadSession) {
      void syncSession(session);
      return;
    }

    applyPassiveSessionUpdate(session);
  });

  await syncSession(data?.session || null);
}

function cacheDom() {
  elements.year = document.getElementById("year");
  elements.themeToggle = document.getElementById("themeToggle");
  elements.lockView = document.getElementById("lockView");
  elements.appView = document.getElementById("appView");
  elements.unlockForm = document.getElementById("unlockForm");
  elements.googleSignInButton = document.getElementById("googleSignInButton");
  elements.authMessage = document.getElementById("authMessage");
  elements.eventSelect = document.getElementById("eventSelect");
  elements.retryOutboxInline = document.getElementById("retryOutboxInline");
  elements.signOutButton = document.getElementById("signOutButton");
  elements.authPill = document.getElementById("authPill");
  elements.connectionPill = document.getElementById("connectionPill");
  elements.queuePill = document.getElementById("queuePill");
  elements.currentEventName = document.getElementById("currentEventName");
  elements.currentEventMeta = document.getElementById("currentEventMeta");
  elements.appMessage = document.getElementById("appMessage");
  elements.tabButtons = Array.from(document.querySelectorAll(".tab-button"));
  elements.tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
  elements.overviewCompetitionValue = document.getElementById("overviewCompetitionValue");
  elements.overviewCompetitionMeta = document.getElementById("overviewCompetitionMeta");
  elements.overviewCompetitionStream = document.getElementById("overviewCompetitionStream");
  elements.overviewTexasValue = document.getElementById("overviewTexasValue");
  elements.overviewTexasMeta = document.getElementById("overviewTexasMeta");
  elements.overviewWorldValue = document.getElementById("overviewWorldValue");
  elements.overviewWorldMeta = document.getElementById("overviewWorldMeta");
  elements.overviewEventClosedBanner = document.getElementById("overviewEventClosedBanner");
  elements.overviewModeButtons = Array.from(document.querySelectorAll("[data-overview-mode]"));
  elements.overviewSourceMeta = document.getElementById("overviewSourceMeta");
  elements.overviewRankingsHead = document.getElementById("overviewRankingsHead");
  elements.overviewRankingsBody = document.getElementById("overviewRankingsBody");
  elements.overviewPredictionLabel = document.getElementById("overviewPredictionLabel");
  elements.overviewTrackerSeasonSelect = document.getElementById("overviewTrackerSeasonSelect");
  elements.overviewTrackerEventSelect = document.getElementById("overviewTrackerEventSelect");
  elements.overviewTrackerEventMeta = document.getElementById("overviewTrackerEventMeta");
  elements.overviewTrackerEventName = document.getElementById("overviewTrackerEventName");
  elements.overviewTrackerEventSubtitle = document.getElementById("overviewTrackerEventSubtitle");
  elements.overviewTrackerEventSummary = document.getElementById("overviewTrackerEventSummary");
  elements.overviewTrackerStatus = document.getElementById("overviewTrackerStatus");
  elements.overviewPredictionBody = document.getElementById("overviewPredictionBody");
  elements.overviewTrackerLinks = document.getElementById("overviewTrackerLinks");
  elements.overviewTrackerEventLink = document.getElementById("overviewTrackerEventLink");
  elements.overviewTrackerTeamLink = document.getElementById("overviewTrackerTeamLink");
  elements.runPickAnalysisButton = document.getElementById("runPickAnalysisButton");
  elements.pickAnalysisStatus = document.getElementById("pickAnalysisStatus");
  elements.pickAnalysisBest = document.getElementById("pickAnalysisBest");
  elements.pickAnalysisBody = document.getElementById("pickAnalysisBody");
  elements.outboxEmpty = document.getElementById("outboxEmpty");
  elements.outboxList = document.getElementById("outboxList");
  elements.matchForm = document.getElementById("matchForm");
  elements.matchEntryLoadSelect = document.getElementById("matchEntryLoadSelect");
  elements.matchSaveDraftButton = document.getElementById("matchSaveDraftButton");
  elements.matchSubmitButton = document.getElementById("matchSubmitButton");
  elements.matchDraftStamp = document.getElementById("matchDraftStamp");
  elements.matchFormMessage = document.getElementById("matchFormMessage");
  elements.shiftPatternInput = document.getElementById("shiftPatternInput");
  elements.shiftPatternToggle = document.getElementById("shiftPatternToggle");
  elements.pitForm = document.getElementById("pitForm");
  elements.pitEntryLoadSelect = document.getElementById("pitEntryLoadSelect");
  elements.pitSaveDraftButton = document.getElementById("pitSaveDraftButton");
  elements.pitSubmitButton = document.getElementById("pitSubmitButton");
  elements.pitDraftStamp = document.getElementById("pitDraftStamp");
  elements.pitFormMessage = document.getElementById("pitFormMessage");
  elements.autoPathField = document.getElementById("autoPathField");
  elements.autoPathBoard = document.getElementById("autoPathBoard");
  elements.autoPathCanvas = document.getElementById("autoPathCanvas");
  elements.autoPathFieldImage = document.getElementById("autoPathFieldImage");
  elements.autoPathDrawingInput = document.getElementById("autoPathDrawingInput");
  elements.autoPathDrawButton = document.getElementById("autoPathDrawButton");
  elements.autoPathEraseButton = document.getElementById("autoPathEraseButton");
  elements.autoPathColorInput = document.getElementById("autoPathColorInput");
  elements.autoPathColorValue = document.getElementById("autoPathColorValue");
  elements.autoPathDrawSizeInput = document.getElementById("autoPathDrawSizeInput");
  elements.autoPathDrawSizeValue = document.getElementById("autoPathDrawSizeValue");
  elements.autoPathEraseSizeInput = document.getElementById("autoPathEraseSizeInput");
  elements.autoPathEraseSizeValue = document.getElementById("autoPathEraseSizeValue");
  elements.autoPathUndoButton = document.getElementById("autoPathUndoButton");
  elements.autoPathClearButton = document.getElementById("autoPathClearButton");
  elements.exportMatchButton = document.getElementById("exportMatchButton");
  elements.exportPitButton = document.getElementById("exportPitButton");
  elements.exportSummaryButton = document.getElementById("exportSummaryButton");
}

function initCustomSelects(root = document) {
  root.querySelectorAll("select").forEach((select) => {
    if (customSelectRegistry.has(select)) {
      refreshCustomSelect(select);
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "custom-select";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select__trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    const labelText =
      select.getAttribute("aria-label") ||
      select.closest(".field, label")?.querySelector("span")?.textContent?.trim() ||
      select.name ||
      "Select option";
    trigger.setAttribute("aria-label", labelText);

    const value = document.createElement("span");
    value.className = "custom-select__value";
    trigger.appendChild(value);

    const menu = document.createElement("div");
    menu.className = "custom-select__menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;

    const menuId = `custom-select-${createId()}`;
    menu.id = menuId;
    trigger.setAttribute("aria-controls", menuId);

    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(select, trigger, menu);

    select.classList.add("custom-select__native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    customSelectRegistry.set(select, {
      wrapper,
      trigger,
      value,
      menu,
      highlightedIndex: -1
    });

    trigger.addEventListener("click", () => {
      if (isCustomSelectOpen(select)) {
        closeCustomSelect(select);
      } else {
        openCustomSelect(select);
      }
    });

    trigger.addEventListener("keydown", (event) => {
      handleCustomSelectKeydown(event, select);
    });

    menu.addEventListener("click", (event) => {
      const optionButton = event.target.closest(".custom-select__option");
      if (!optionButton) return;
      chooseCustomSelectOption(select, Number(optionButton.dataset.optionIndex));
    });

    select.addEventListener("change", () => {
      syncCustomSelect(select);
    });

    select.addEventListener("input", () => {
      syncCustomSelect(select);
    });

    refreshCustomSelect(select);
  });

  if (customSelectEventsBound) return;
  customSelectEventsBound = true;

  document.addEventListener("click", (event) => {
    if (!activeCustomSelect) return;
    const refs = customSelectRegistry.get(activeCustomSelect);
    if (!refs || refs.wrapper.contains(event.target)) return;
    closeCustomSelect(activeCustomSelect);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !activeCustomSelect) return;
    closeCustomSelect(activeCustomSelect);
  });

  window.addEventListener("blur", () => {
    closeCustomSelect(activeCustomSelect);
  });
}

function initAutoPathBoard() {
  if (
    autoPathState.initialized ||
    !elements.autoPathBoard ||
    !elements.autoPathCanvas ||
    !elements.autoPathDrawingInput
  ) {
    return;
  }

  autoPathState.initialized = true;

  if (elements.autoPathDrawButton) {
    elements.autoPathDrawButton.addEventListener("click", () => {
      setAutoPathMode("draw");
    });
  }

  if (elements.autoPathEraseButton) {
    elements.autoPathEraseButton.addEventListener("click", () => {
      setAutoPathMode("erase");
    });
  }

  if (elements.autoPathColorInput) {
    elements.autoPathColorInput.addEventListener("input", (event) => {
      autoPathState.drawColor = sanitizeAutoPathColor(event.target.value);
      syncAutoPathToolSettings();
    });
  }

  if (elements.autoPathDrawSizeInput) {
    elements.autoPathDrawSizeInput.addEventListener("input", (event) => {
      autoPathState.drawSize = normalizeAutoPathStrokeSize("draw", event.target.value);
      syncAutoPathToolSettings();
    });
  }

  if (elements.autoPathEraseSizeInput) {
    elements.autoPathEraseSizeInput.addEventListener("input", (event) => {
      autoPathState.eraseSize = normalizeAutoPathStrokeSize("erase", event.target.value);
      syncAutoPathToolSettings();
    });
  }

  if (elements.autoPathUndoButton) {
    elements.autoPathUndoButton.addEventListener("click", () => {
      if (!autoPathState.strokes.length) return;
      autoPathState.strokes.pop();
      persistAutoPathDrawing();
      renderAutoPathCanvas();
    });
  }

  if (elements.autoPathClearButton) {
    elements.autoPathClearButton.addEventListener("click", () => {
      if (!autoPathState.strokes.length && !autoPathState.activeStroke) return;
      const confirmed = window.confirm("Clear the entire auto path drawing?");
      if (!confirmed) return;

      autoPathState.strokes = [];
      autoPathState.activeStroke = null;
      autoPathState.pointerId = null;
      persistAutoPathDrawing();
      renderAutoPathCanvas();
    });
  }

  elements.autoPathCanvas.addEventListener("pointerdown", handleAutoPathPointerDown);
  elements.autoPathCanvas.addEventListener("pointermove", handleAutoPathPointerMove);
  elements.autoPathCanvas.addEventListener("pointerup", handleAutoPathPointerEnd);
  elements.autoPathCanvas.addEventListener("pointerleave", handleAutoPathPointerEnd);
  elements.autoPathCanvas.addEventListener("pointercancel", handleAutoPathPointerEnd);

  if (typeof ResizeObserver !== "undefined") {
    autoPathState.resizeObserver = new ResizeObserver(() => {
      syncAutoPathCanvasSize();
    });
    autoPathState.resizeObserver.observe(elements.autoPathBoard);
  }

  if (elements.autoPathFieldImage && !elements.autoPathFieldImage.complete) {
    elements.autoPathFieldImage.addEventListener("load", () => {
      syncAutoPathCanvasSize();
    });
  }

  setAutoPathMode("draw");
  syncAutoPathCanvasSize();
  loadAutoPathDrawing("");
}

function setAutoPathMode(mode) {
  autoPathState.mode = mode === "erase" ? "erase" : "draw";

  if (elements.autoPathDrawButton) {
    elements.autoPathDrawButton.classList.toggle("is-active", autoPathState.mode === "draw");
  }

  if (elements.autoPathEraseButton) {
    elements.autoPathEraseButton.classList.toggle("is-active", autoPathState.mode === "erase");
  }

  syncAutoPathToolSettings();
}

function syncAutoPathToolSettings() {
  autoPathState.drawColor = sanitizeAutoPathColor(autoPathState.drawColor);
  autoPathState.drawSize = normalizeAutoPathStrokeSize("draw", autoPathState.drawSize);
  autoPathState.eraseSize = normalizeAutoPathStrokeSize("erase", autoPathState.eraseSize);

  if (elements.autoPathColorInput) {
    elements.autoPathColorInput.value = autoPathState.drawColor;
  }

  if (elements.autoPathColorValue) {
    elements.autoPathColorValue.textContent = autoPathState.drawColor.toUpperCase();
  }

  if (elements.autoPathDrawSizeInput) {
    elements.autoPathDrawSizeInput.value = String(autoPathState.drawSize);
  }

  if (elements.autoPathDrawSizeValue) {
    elements.autoPathDrawSizeValue.textContent = `${autoPathState.drawSize} px`;
  }

  if (elements.autoPathEraseSizeInput) {
    elements.autoPathEraseSizeInput.value = String(autoPathState.eraseSize);
  }

  if (elements.autoPathEraseSizeValue) {
    elements.autoPathEraseSizeValue.textContent = `${autoPathState.eraseSize} px`;
  }

  updateAutoPathCursor();
}

function updateAutoPathCursor() {
  if (!elements.autoPathCanvas) return;

  const isErasing = autoPathState.mode === "erase";
  elements.autoPathCanvas.classList.toggle("is-erasing", isErasing);
  elements.autoPathCanvas.style.cursor = isErasing
    ? buildAutoPathEraserCursor(autoPathState.eraseSize)
    : "crosshair";
}

function buildAutoPathEraserCursor(size) {
  const diameter = normalizeAutoPathStrokeSize("erase", size);
  const cursorSize = clampInteger(Math.max(diameter + 12, 24), 24, 64);
  const center = Math.round(cursorSize / 2);
  const radius = Math.max(4, Math.min(center - 3, Math.round(diameter / 2)));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cursorSize}" height="${cursorSize}" viewBox="0 0 ${cursorSize} ${cursorSize}"><circle cx="${center}" cy="${center}" r="${radius}" fill="#ffffff" fill-opacity="0.14" stroke="#ff7f00" stroke-width="2"/><circle cx="${center}" cy="${center}" r="1.5" fill="#ff7f00"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${center} ${center}, crosshair`;
}

function syncAutoPathCanvasSize() {
  const canvas = elements.autoPathCanvas;
  const board = elements.autoPathBoard;
  if (!canvas || !board) return;

  const rect = board.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const ratio = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  renderAutoPathCanvas();
}

function handleAutoPathPointerDown(event) {
  if (!elements.autoPathCanvas) return;
  event.preventDefault();

  const point = getAutoPathPoint(event);
  autoPathState.pointerId = event.pointerId;
  autoPathState.activeStroke = {
    mode: autoPathState.mode,
    color: autoPathState.mode === "erase" ? "" : autoPathState.drawColor,
    size:
      autoPathState.mode === "erase"
        ? normalizeAutoPathStrokeSize("erase", autoPathState.eraseSize)
        : normalizeAutoPathStrokeSize("draw", autoPathState.drawSize),
    points: [point]
  };

  elements.autoPathCanvas.setPointerCapture?.(event.pointerId);
  renderAutoPathCanvas();
}

function handleAutoPathPointerMove(event) {
  if (autoPathState.pointerId !== event.pointerId || !autoPathState.activeStroke) return;
  event.preventDefault();

  autoPathState.activeStroke.points.push(getAutoPathPoint(event));
  renderAutoPathCanvas();
}

function handleAutoPathPointerEnd(event) {
  if (autoPathState.pointerId !== event.pointerId || !autoPathState.activeStroke) return;
  event.preventDefault();

  const stroke = {
    ...autoPathState.activeStroke,
    points: normalizeStrokePoints(autoPathState.activeStroke.points)
  };

  if (stroke.points.length >= 1) {
    autoPathState.strokes.push(stroke);
    persistAutoPathDrawing();
  }

  autoPathState.pointerId = null;
  autoPathState.activeStroke = null;
  renderAutoPathCanvas();
}

function getAutoPathPoint(event) {
  const rect = elements.autoPathCanvas.getBoundingClientRect();
  const x = rect.width ? (event.clientX - rect.left) / rect.width : 0;
  const y = rect.height ? (event.clientY - rect.top) / rect.height : 0;

  return {
    x: clampNumber(x, 0, 1),
    y: clampNumber(y, 0, 1)
  };
}

function normalizeStrokePoints(points) {
  const normalized = [];

  points.forEach((point) => {
    const x = clampNumber(point.x, 0, 1);
    const y = clampNumber(point.y, 0, 1);
    const lastPoint = normalized[normalized.length - 1];
    if (lastPoint && Math.abs(lastPoint.x - x) < 0.0015 && Math.abs(lastPoint.y - y) < 0.0015) {
      return;
    }
    normalized.push({ x, y });
  });

  return normalized;
}

function renderAutoPathCanvas() {
  const canvas = elements.autoPathCanvas;
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;

  const width = canvas.clientWidth || 1;
  const height = canvas.clientHeight || 1;
  context.clearRect(0, 0, width, height);
  context.lineCap = "round";
  context.lineJoin = "round";

  autoPathState.strokes.forEach((stroke) => {
    drawAutoPathStroke(context, stroke, width, height);
  });

  if (autoPathState.activeStroke) {
    drawAutoPathStroke(context, autoPathState.activeStroke, width, height);
  }
}

function drawAutoPathStroke(context, stroke, width, height) {
  const points = Array.isArray(stroke?.points) ? stroke.points : [];
  if (!points.length) return;

  const isErasing = stroke.mode === "erase";
  const strokeColor = isErasing ? "#000000" : sanitizeAutoPathColor(stroke.color);
  const strokeSize = normalizeAutoPathStrokeSize(stroke.mode, stroke.size);

  context.save();
  context.strokeStyle = isErasing ? "rgba(0, 0, 0, 1)" : strokeColor;
  context.globalCompositeOperation = isErasing ? "destination-out" : "source-over";
  context.lineWidth = strokeSize;
  context.shadowBlur = isErasing ? 0 : 14;
  context.shadowColor = isErasing ? "transparent" : hexToRgba(strokeColor, 0.35);

  context.beginPath();
  context.moveTo(points[0].x * width, points[0].y * height);

  if (points.length === 1) {
    context.lineTo(points[0].x * width + 0.01, points[0].y * height + 0.01);
  } else {
    points.slice(1).forEach((point) => {
      context.lineTo(point.x * width, point.y * height);
    });
  }

  context.stroke();
  context.restore();
}

function persistAutoPathDrawing() {
  if (!elements.autoPathDrawingInput) return;

  elements.autoPathDrawingInput.value = autoPathState.strokes.length
    ? JSON.stringify(autoPathState.strokes)
    : "";
  elements.autoPathDrawingInput.dispatchEvent(new Event("input", { bubbles: true }));
  elements.autoPathDrawingInput.dispatchEvent(new Event("change", { bubbles: true }));
}

function loadAutoPathDrawing(serialized) {
  autoPathState.strokes = parseAutoPathDrawing(serialized);
  autoPathState.activeStroke = null;
  autoPathState.pointerId = null;
  if (elements.autoPathDrawingInput) {
    elements.autoPathDrawingInput.value = serialized || "";
  }
  renderAutoPathCanvas();
}

function syncAutoPathBoardFromField() {
  if (!elements.autoPathDrawingInput) return;
  loadAutoPathDrawing(elements.autoPathDrawingInput.value || "");
}

function parseAutoPathDrawing(serialized) {
  if (!serialized) return [];

  try {
    const parsed = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((stroke) => {
        const mode = stroke?.mode === "erase" ? "erase" : "draw";
        return {
          mode,
          color: mode === "erase" ? "" : sanitizeAutoPathColor(stroke?.color),
          size: normalizeAutoPathStrokeSize(mode, stroke?.size),
          points: normalizeStrokePoints(Array.isArray(stroke?.points) ? stroke.points : [])
        };
      })
      .filter((stroke) => stroke.points.length);
  } catch (error) {
    return [];
  }
}

function refreshCustomSelect(select) {
  const refs = customSelectRegistry.get(select);
  if (!refs) return;

  refs.menu.innerHTML = "";

  Array.from(select.options).forEach((option, index) => {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = "custom-select__option";
    optionButton.dataset.optionIndex = String(index);
    optionButton.setAttribute("role", "option");
    optionButton.textContent = option.textContent || option.label || option.value || "Untitled option";
    optionButton.disabled = option.disabled;
    refs.menu.appendChild(optionButton);
  });

  syncCustomSelect(select);
}

function syncCustomSelect(select) {
  const refs = customSelectRegistry.get(select);
  if (!refs) return;

  const options = Array.from(select.options);
  if ((select.disabled || !options.length) && activeCustomSelect === select) {
    activeCustomSelect = null;
  }
  const selectedOption =
    options[select.selectedIndex] || options.find((option) => option.selected) || options[0] || null;
  const open = activeCustomSelect === select;

  refs.value.textContent = selectedOption
    ? selectedOption.textContent || selectedOption.label || selectedOption.value
    : "No options available";

  if (!options.length || select.disabled) {
    refs.highlightedIndex = -1;
  } else if (open && !isSelectableOption(options, refs.highlightedIndex)) {
    refs.highlightedIndex = findSelectableOptionIndex(options, Math.max(select.selectedIndex, 0), 1);
  }

  refs.wrapper.classList.toggle("is-open", open);
  refs.wrapper.classList.toggle("is-disabled", Boolean(select.disabled || !options.length));
  refs.trigger.disabled = Boolean(select.disabled || !options.length);
  refs.trigger.setAttribute("aria-expanded", open ? "true" : "false");
  refs.menu.hidden = !open;

  Array.from(refs.menu.children).forEach((optionButton, index) => {
    const option = options[index];
    const selected = index === select.selectedIndex;
    const highlighted = open && index === refs.highlightedIndex;
    optionButton.classList.toggle("is-selected", selected);
    optionButton.classList.toggle("is-highlighted", highlighted);
    optionButton.setAttribute("aria-selected", selected ? "true" : "false");
    optionButton.disabled = Boolean(option?.disabled);
  });
}

function openCustomSelect(select) {
  const refs = customSelectRegistry.get(select);
  if (!refs || refs.trigger.disabled) return;

  if (activeCustomSelect && activeCustomSelect !== select) {
    closeCustomSelect(activeCustomSelect);
  }

  activeCustomSelect = select;
  const options = Array.from(select.options);
  refs.highlightedIndex = findSelectableOptionIndex(options, Math.max(select.selectedIndex, 0), 1);
  syncCustomSelect(select);
  scrollCustomSelectOptionIntoView(select, refs.highlightedIndex);
}

function closeCustomSelect(select) {
  const refs = customSelectRegistry.get(select);
  if (!refs) return;

  if (activeCustomSelect === select) {
    activeCustomSelect = null;
  }

  refs.highlightedIndex = -1;
  syncCustomSelect(select);
}

function isCustomSelectOpen(select) {
  return activeCustomSelect === select;
}

function chooseCustomSelectOption(select, index) {
  const option = select.options[index];
  if (!option || option.disabled) return;

  const refs = customSelectRegistry.get(select);
  if (refs) refs.highlightedIndex = index;

  select.selectedIndex = index;
  closeCustomSelect(select);
  syncCustomSelect(select);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));

  if (refs) refs.trigger.focus();
}

function handleCustomSelectKeydown(event, select) {
  const options = Array.from(select.options);
  if (!options.length || select.disabled) return;

  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      if (!isCustomSelectOpen(select)) openCustomSelect(select);
      moveCustomSelectHighlight(select, 1);
      break;
    case "ArrowUp":
      event.preventDefault();
      if (!isCustomSelectOpen(select)) openCustomSelect(select);
      moveCustomSelectHighlight(select, -1);
      break;
    case "Home":
      event.preventDefault();
      if (!isCustomSelectOpen(select)) openCustomSelect(select);
      setCustomSelectHighlight(select, findSelectableOptionIndex(options, 0, 1));
      break;
    case "End":
      event.preventDefault();
      if (!isCustomSelectOpen(select)) openCustomSelect(select);
      setCustomSelectHighlight(select, findSelectableOptionIndex(options, options.length - 1, -1));
      break;
    case "Enter":
    case " ":
      event.preventDefault();
      if (!isCustomSelectOpen(select)) {
        openCustomSelect(select);
        break;
      }
      chooseCustomSelectOption(select, getCustomSelectHighlightedIndex(select));
      break;
    case "Tab":
      closeCustomSelect(select);
      break;
    default:
      break;
  }
}

function moveCustomSelectHighlight(select, delta) {
  const refs = customSelectRegistry.get(select);
  if (!refs) return;

  const options = Array.from(select.options);
  const currentIndex = refs.highlightedIndex >= 0 ? refs.highlightedIndex : select.selectedIndex;
  const startIndex = currentIndex >= 0 ? currentIndex + delta : delta > 0 ? 0 : options.length - 1;
  const nextIndex = findSelectableOptionIndex(options, startIndex, delta);
  if (nextIndex < 0) return;

  refs.highlightedIndex = nextIndex;
  syncCustomSelect(select);
  scrollCustomSelectOptionIntoView(select, nextIndex);
}

function setCustomSelectHighlight(select, index) {
  if (index < 0) return;
  const refs = customSelectRegistry.get(select);
  if (!refs) return;

  refs.highlightedIndex = index;
  syncCustomSelect(select);
  scrollCustomSelectOptionIntoView(select, index);
}

function getCustomSelectHighlightedIndex(select) {
  const refs = customSelectRegistry.get(select);
  if (!refs) return -1;
  if (refs.highlightedIndex >= 0) return refs.highlightedIndex;
  return findSelectableOptionIndex(Array.from(select.options), Math.max(select.selectedIndex, 0), 1);
}

function scrollCustomSelectOptionIntoView(select, index) {
  const refs = customSelectRegistry.get(select);
  const optionButton = refs?.menu.querySelector(`[data-option-index="${index}"]`);
  if (!optionButton) return;
  optionButton.scrollIntoView({ block: "nearest" });
}

function findSelectableOptionIndex(options, startIndex, step) {
  if (!options.length) return -1;

  let index = startIndex;
  while (index >= 0 && index < options.length) {
    if (isSelectableOption(options, index)) return index;
    index += step;
  }

  return -1;
}

function isSelectableOption(options, index) {
  return index >= 0 && index < options.length && !options[index].disabled;
}

function normalizeAutoPathStrokeSize(mode, value) {
  const isErasing = mode === "erase";
  const fallback = isErasing ? AUTO_PATH_DEFAULTS.eraseSize : AUTO_PATH_DEFAULTS.drawSize;
  const min = isErasing ? AUTO_PATH_DEFAULTS.minEraseSize : AUTO_PATH_DEFAULTS.minDrawSize;
  const max = isErasing ? AUTO_PATH_DEFAULTS.maxEraseSize : AUTO_PATH_DEFAULTS.maxDrawSize;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return clampInteger(parsed, min, max);
}

function sanitizeAutoPathColor(value) {
  const normalized = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : AUTO_PATH_DEFAULTS.drawColor;
}

function hexToRgba(color, alpha = 1) {
  const normalized = sanitizeAutoPathColor(color).slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${clampNumber(alpha, 0, 1)})`;
}

function bindEvents() {
  if (elements.themeToggle) {
    elements.themeToggle.addEventListener("click", toggleTheme);
  }

  if (elements.unlockForm) {
    elements.unlockForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void handleGoogleSignIn();
    });
  }

  if (elements.retryOutboxInline) {
    elements.retryOutboxInline.addEventListener("click", () => {
      void flushOutbox();
    });
  }

  if (elements.signOutButton) {
    elements.signOutButton.addEventListener("click", () => {
      void handleSignOut();
    });
  }

  if (elements.eventSelect) {
    elements.eventSelect.addEventListener("change", () => {
      void handleEventChange(elements.eventSelect.value);
    });
  }

  if (elements.overviewTrackerSeasonSelect) {
    elements.overviewTrackerSeasonSelect.addEventListener("change", () => {
      const season = Number(elements.overviewTrackerSeasonSelect.value);
      void handleMatchTrackerSeasonChange(season);
    });
  }

  if (elements.overviewTrackerEventSelect) {
    elements.overviewTrackerEventSelect.addEventListener("change", () => {
      void handleMatchTrackerEventChange(elements.overviewTrackerEventSelect.value);
    });
  }

  elements.overviewModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setOverviewMode(button.dataset.overviewMode || OVERVIEW_MODE_COMPETITION);
    });
  });

  if (elements.runPickAnalysisButton) {
    elements.runPickAnalysisButton.addEventListener("click", (event) => {
      event.preventDefault();
      runPickAnalysis();
    });
  }

  if (elements.matchEntryLoadSelect) {
    elements.matchEntryLoadSelect.addEventListener("change", () => {
      handleScoutReload("match");
    });
  }

  if (elements.pitEntryLoadSelect) {
    elements.pitEntryLoadSelect.addEventListener("change", () => {
      handleScoutReload("pit");
    });
  }

  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      showTab(button.dataset.tab || "overview");
    });
  });

  bindCounterButtons();
  bindDraftPersistence(elements.matchForm, "match");
  bindDraftPersistence(elements.pitForm, "pit");
  bindShiftAvailability();
  bindFormValidation(elements.matchForm, "match");
  bindFormValidation(elements.pitForm, "pit");

  if (elements.matchSaveDraftButton) {
    elements.matchSaveDraftButton.addEventListener("click", () => {
      persistDraft("match", { manual: true });
    });
  }

  if (elements.pitSaveDraftButton) {
    elements.pitSaveDraftButton.addEventListener("click", () => {
      persistDraft("pit", { manual: true });
    });
  }

  if (elements.matchForm) {
    elements.matchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitMatchForm();
    });
  }

  if (elements.pitForm) {
    elements.pitForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitPitForm();
    });
  }

  if (elements.exportMatchButton) {
    elements.exportMatchButton.addEventListener("click", () => {
      exportMatchCsv();
    });
  }

  if (elements.exportPitButton) {
    elements.exportPitButton.addEventListener("click", () => {
      exportPitCsv();
    });
  }

  if (elements.exportSummaryButton) {
    elements.exportSummaryButton.addEventListener("click", () => {
      exportSummaryCsv();
    });
  }

  window.addEventListener("online", () => {
    state.connectionOnline = true;
    renderStatusPills();
  });

  window.addEventListener("offline", () => {
    state.connectionOnline = false;
    renderStatusPills();
  });
}

function bindCounterButtons() {
  document.querySelectorAll("[data-counter-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.getAttribute("data-counter-target");
      const step = Number(button.getAttribute("data-counter-step") || 0);
      const input = targetId ? document.getElementById(targetId) : null;
      if (!input) return;
      const current = Math.max(0, Number(input.value || 0));
      const next = Math.max(0, current + step);
      input.value = String(next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const form = input.form;
      if (form === elements.matchForm) persistDraft("match");
      if (form === elements.pitForm) persistDraft("pit");
    });
  });
}

function bindDraftPersistence(form, kind) {
  if (!form) return;

  const persist = () => {
    persistDraft(kind);
  };

  form.addEventListener("input", persist);
  form.addEventListener("change", persist);
}

function applyYear() {
  if (elements.year) {
    elements.year.textContent = String(new Date().getFullYear());
  }
}

function wireLinks() {
  document.querySelectorAll("[data-link]").forEach((link) => {
    const key = link.getAttribute("data-link");
    if (!key || !LINKS[key]) return;
    const href = link.getAttribute("href") || "";
    const hash = href.includes("#") ? href.slice(href.indexOf("#")) : "";
    link.setAttribute("href", LINKS[key] + hash);
  });
}

function setActive() {
  document.querySelectorAll(`.nav-links a[data-link="${PAGE}"]`).forEach((link) => {
    link.classList.add("active");
  });
}

function initTheme() {
  const html = document.documentElement;
  const stored = loadStoredValue("bf-theme", "");
  if (stored === "dark") html.setAttribute("data-theme", "dark");
  else if (stored === "light") html.setAttribute("data-theme", "light");
  else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    html.setAttribute("data-theme", "dark");
  }
  setThemeLabel();
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", isDark ? "light" : "dark");
  saveStoredValue("bf-theme", isDark ? "light" : "dark");
  setThemeLabel();
}

function setThemeLabel() {
  if (!elements.themeToggle) return;
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  elements.themeToggle.textContent = isDark ? "Light" : "Dark";
}

function initLogoSwap() {
  function forEachLogo(fn) {
    const images = document.querySelectorAll('img[src$="blacklogo.png"], img[src$="whitelogo.png"]');
    images.forEach(fn);
  }

  function isDarkMode() {
    const html = document.documentElement;
    const theme = (html.getAttribute("data-theme") || "").toLowerCase();
    if (theme === "dark") return true;
    if (theme === "light") return false;
    if (html.classList.contains("dark") || html.classList.contains("theme-dark")) return true;
    if (html.classList.contains("light") || html.classList.contains("theme-light")) return false;
    if (window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  }

  function setLogoByTheme() {
    const dark = isDarkMode();
    forEachLogo((image) => {
      const current = image.getAttribute("src") || "";
      const desired = current.replace(/(white|black)logo\.png$/i, dark ? "whitelogo.png" : "blacklogo.png");
      if (desired !== current) image.setAttribute("src", desired);
    });
  }

  setLogoByTheme();

  try {
    const observer = new MutationObserver(setLogoByTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"]
    });

    if (window.matchMedia) {
      const query = window.matchMedia("(prefers-color-scheme: dark)");
      if (query.addEventListener) query.addEventListener("change", setLogoByTheme);
      else if (query.addListener) query.addListener(setLogoByTheme);
    }

    window.addEventListener("storage", setLogoByTheme);
  } catch (error) {
    // ignore unsupported observer APIs
  }
}

function initPointerRipples() {
  document.querySelectorAll(".btn, .glass-button, .tab-button").forEach((button) => {
    button.addEventListener("mousemove", (event) => {
      const rect = button.getBoundingClientRect();
      button.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      button.style.setProperty("--my", `${event.clientY - rect.top}px`);
    });
  });
}

function hydrateDraftForms() {
  setFormValues(elements.matchForm, normalizeMatchValues(loadStoredJson(STORAGE_KEYS.matchDraft, MATCH_DEFAULTS)));
  setFormValues(elements.pitForm, normalizePitValues(loadStoredJson(STORAGE_KEYS.pitDraft, PIT_DEFAULTS)));
  updateShiftFieldAvailability();
  renderDraftStamp("match");
  renderDraftStamp("pit");
  showTab(state.activeTab);
}

function bindShiftAvailability() {
  if (!elements.matchForm) return;

  if (elements.shiftPatternToggle) {
    elements.shiftPatternToggle.addEventListener("click", () => {
      const nextValue = getMatchShiftPatternValue(elements.matchForm) === "alternate" ? "team" : "alternate";
      setMatchShiftPatternValue(nextValue, { dispatch: true });
      updateShiftFieldAvailability();
    });
  }

  elements.matchForm.querySelectorAll('[name="alliance_color"]').forEach((field) => {
    field.addEventListener("change", () => {
      updateShiftFieldAvailability();
    });
  });

  elements.matchForm.querySelectorAll('[name="shift_pattern"]').forEach((field) => {
    field.addEventListener("change", () => {
      updateShiftFieldAvailability();
    });
  });
}

async function handleGoogleSignIn() {
  if (!state.client || !configReady()) {
    setAuthMessage("Scouting sign-in is unavailable right now.", "warn");
    return;
  }

  if (state.session && isAllowedEmail(getSessionEmail(state.session))) {
    state.authRedirecting = false;
    state.authReady = true;
    renderAll();
    return;
  }

  state.authRedirecting = true;
  state.authReady = false;
  renderAll();
  setAuthMessage("Redirecting to Google sign-in...", "success");

  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await state.client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        hd: state.config.allowedEmailDomain,
        prompt: "select_account"
      }
    }
  });

  if (error) {
    state.authRedirecting = false;
    state.authReady = true;
    renderAll();
    setAuthMessage(normalizeError(error, "Unable to start Google sign-in."), "danger");
  }
}

async function handleSignOut() {
  if (!state.client) return;
  state.authReady = false;
  state.authRedirecting = false;
  state.pendingAuthMessage = "Signed out.";
  state.pendingAuthTone = "success";
  await state.client.auth.signOut();
  setAppMessage("");
}

async function syncSession(session) {
  state.session = session;
  state.authReady = false;

  if (!session) {
    state.events = [];
    state.matchEntries = [];
    state.pitEntries = [];
    state.teamSummary = [];
    resetOverviewState();
    resetMatchTrackerState();
    state.isRefreshing = false;
    state.authRedirecting = false;
    state.authReady = true;
    renderAll();

    if (state.pendingAuthMessage) {
      setAuthMessage(state.pendingAuthMessage, state.pendingAuthTone || "warn");
      state.pendingAuthMessage = "";
      state.pendingAuthTone = "";
    } else {
      setAuthMessage("", "");
    }
    return;
  }

  const email = getSessionEmail(session);
  if (!isAllowedEmail(email)) {
    state.authRedirecting = false;
    state.pendingAuthMessage = `Only ${state.config.allowedEmailDomain} Google accounts can access scouting.`;
    state.pendingAuthTone = "danger";
    await state.client.auth.signOut();
    return;
  }

  state.authRedirecting = false;
  setAuthMessage(`Signed in as ${email}.`, "success");
  showTab(DEFAULT_WORKSPACE_TAB);
  await refreshData({ message: "" });
  state.authReady = true;
  renderAll();
}

function applyPassiveSessionUpdate(session) {
  state.session = session;
  state.authRedirecting = false;
  state.authReady = Boolean(session && isAllowedEmail(getSessionEmail(session)));
  renderAuthState();
  renderStatusPills();
  renderFormAvailability();
}

async function refreshData({ message } = {}) {
  if (!state.client || !state.session) return;

  state.isRefreshing = true;
  renderStatusPills();
  renderFormAvailability();

  try {
    await loadEvents();
    await Promise.all([
      loadEntriesForActiveEvent(),
      loadOverviewData()
    ]);
    queueMatchTrackerSync();
    state.lastSyncAt = new Date().toISOString();
    saveStoredValue(STORAGE_KEYS.lastSyncAt, state.lastSyncAt);
    if (typeof message === "string") {
      setAppMessage(message, message ? "success" : "");
    } else {
      setAppMessage("Scouting data refreshed.", "success");
    }
  } catch (error) {
    setAppMessage(normalizeError(error, "Unable to load scouting data from Supabase."), "danger");
  } finally {
    state.isRefreshing = false;
    renderAll();
  }
}

async function loadEvents() {
  const { data, error } = await fetchScoutingEvents();
  if (error) throw error;

  let events = Array.isArray(data) ? data : [];
  events = await ensureDefaultScoutingEvents(events);
  state.events = events.filter((event) => !isHiddenScoutingEvent(event));

  const currentStillExists = state.events.some((event) => event.id === state.activeEventId);
  if (!currentStillExists) {
    const preferred =
      state.events.find((event) => event.id === loadStoredValue(STORAGE_KEYS.activeEventId, "")) ||
      state.events.find((event) => event.is_active) ||
      state.events[0] ||
      null;

    state.activeEventId = preferred ? preferred.id : "";
  }

  saveStoredValue(STORAGE_KEYS.activeEventId, state.activeEventId);
}

async function fetchScoutingEvents() {
  return state.client
    .from("scouting_events")
    .select("*")
    .order("is_active", { ascending: false })
    .order("start_date", { ascending: false })
    .order("name", { ascending: true });
}

async function ensureDefaultScoutingEvents(existingEvents) {
  if (!state.client || !state.session) return existingEvents;

  const existingSlugs = new Set(existingEvents.map((event) => event.slug));
  const missingEvents = DEFAULT_SCOUTING_EVENTS.filter((event) => !existingSlugs.has(event.slug));

  if (!missingEvents.length) {
    return existingEvents;
  }

  let insertedAny = false;

  for (const event of missingEvents) {
    const { error } = await state.client.from("scouting_events").insert(event);
    if (error) {
      if (isUniqueConflictError(error)) continue;
      throw error;
    }
    insertedAny = true;
  }

  if (!insertedAny) {
    return existingEvents;
  }

  const refreshed = await fetchScoutingEvents();
  if (refreshed.error) throw refreshed.error;
  return Array.isArray(refreshed.data) ? refreshed.data : existingEvents;
}

function isHiddenScoutingEvent(event) {
  const values = [event?.name, event?.event_code, event?.slug]
    .map((value) => String(value || "").trim().toLowerCase());

  return values.some((value) => {
    return (
      value === "sample" ||
      value === "sample event" ||
      value.includes("sample event") ||
      value.startsWith("sample-") ||
      value.endsWith("-sample")
    );
  });
}

async function loadEntriesForActiveEvent() {
  if (!state.activeEventId) {
    state.matchEntries = [];
    state.pitEntries = [];
    state.teamSummary = [];
    return;
  }

  const [matchResponse, pitResponse] = await Promise.all([
    state.client
      .from("match_scout_entries")
      .select("*")
      .eq("event_id", state.activeEventId)
      .order("created_at", { ascending: false }),
    state.client
      .from("pit_scout_entries")
      .select("*")
      .eq("event_id", state.activeEventId)
      .order("created_at", { ascending: false })
  ]);

  if (matchResponse.error) throw matchResponse.error;
  if (pitResponse.error) throw pitResponse.error;

  state.matchEntries = dedupeScoutingEntries(Array.isArray(matchResponse.data) ? matchResponse.data : [], "match");
  state.pitEntries = dedupeScoutingEntries(Array.isArray(pitResponse.data) ? pitResponse.data : [], "pit");
  state.teamSummary = buildTeamSummary(state.matchEntries, state.pitEntries);
  state.analysisNeedsRefresh = true;
}

function resetOverviewState() {
  state.overviewLoading = false;
  state.overviewError = "";
  state.overviewFetchedAt = "";
  state.overviewCompetitionRows = [];
  state.overviewTexasRows = [];
  state.overviewMatches = [];
  state.overviewAllianceSelections = [];
  state.overviewTeamMediaByTeam = new Map();
  state.overviewEventData = null;
  state.analysisResult = null;
  state.analysisNeedsRefresh = true;
  state.analysisRunning = false;
  state.analysisRunAt = "";
}

function resetMatchTrackerState({ preserveSelection = false } = {}) {
  state.trackerLoading = false;
  state.trackerError = "";
  state.trackerMatches = [];
  state.trackerEvent = null;
  state.trackerPredictionMatches = [];
  state.trackerPredictionAccuracy = null;
  state.trackerPredictionError = "";
  if (!preserveSelection) {
    state.trackerSelectedSeason = "";
    state.trackerSelectedEventKey = "";
  }
}

function setOverviewMode(mode) {
  const nextMode = mode === OVERVIEW_MODE_TEXAS ? OVERVIEW_MODE_TEXAS : OVERVIEW_MODE_COMPETITION;
  if (state.overviewMode === nextMode) return;
  state.overviewMode = nextMode;
  saveStoredValue(STORAGE_KEYS.overviewMode, state.overviewMode);
  renderOverview();
}

async function loadOverviewData() {
  const event = getActiveEvent();
  if (!event) {
    resetOverviewState();
    renderOverview();
    return;
  }

  const eventKey = getStatboticsEventKey(event);
  const season = getEventSeason(event);
  const tbaEventKey = buildBlueAllianceEventKey(event);
  const requestToken = ++overviewRequestToken;

  state.overviewLoading = true;
  state.overviewError = "";
  renderOverview();

  try {
    const [competitionRows, texasRows, matches, eventData] = await Promise.all([
      fetchStatbotics(`team_events?event=${encodeURIComponent(eventKey)}&limit=1000`),
      fetchStatbotics(`team_years?year=${season}&state=${encodeURIComponent(TEXAS_STATE_CODE)}&limit=500`),
      fetchStatbotics(`matches?event=${encodeURIComponent(eventKey)}&limit=${OVERVIEW_MATCH_LIMIT}`),
      fetchStatbotics(`event/${encodeURIComponent(eventKey)}`)
    ]);

    if (requestToken !== overviewRequestToken) return;

    state.overviewCompetitionRows = sortCompetitionRows(competitionRows);
    state.overviewTexasRows = sortTexasRows(texasRows);
    state.overviewMatches = Array.isArray(matches) ? matches.slice() : [];
    state.overviewEventData = eventData && !Array.isArray(eventData) ? eventData : null;
    state.overviewFetchedAt = new Date().toISOString();
    state.analysisNeedsRefresh = true;
    void hydrateOverviewBlueAllianceData({
      requestToken,
      eventKey: tbaEventKey,
      season,
      competitionRows,
      texasRows
    });
  } catch (error) {
    if (requestToken !== overviewRequestToken) return;
    resetOverviewState();
    state.overviewError = normalizeError(error, "Unable to load Statbotics overview data.");
  } finally {
    if (requestToken !== overviewRequestToken) return;
    state.overviewLoading = false;
    renderOverview();
  }
}

async function hydrateOverviewBlueAllianceData({ requestToken, eventKey, season, competitionRows, texasRows }) {
  try {
    const teamNumbers = [
      ...(Array.isArray(competitionRows) ? competitionRows.map((row) => row?.team ?? row?.teamNumber) : []),
      ...(Array.isArray(texasRows) ? texasRows.map((row) => row?.team ?? row?.teamNumber) : [])
    ].filter((teamNum) => Number.isFinite(Number(teamNum)) && Number(teamNum) > 0);

    const [allianceSelections, teamMediaMap] = await Promise.all([
      fetchOverviewAllianceSelections(eventKey),
      fetchOverviewTeamMedia(eventKey)
    ]);

    if (requestToken !== overviewRequestToken) return;

    state.overviewAllianceSelections = Array.isArray(allianceSelections) ? allianceSelections.slice() : [];
    state.overviewTeamMediaByTeam = teamMediaMap instanceof Map ? teamMediaMap : new Map();
    renderOverview();

    const missingMediaMap = await fetchMissingTeamMedia(teamNumbers, state.overviewTeamMediaByTeam, season);
    if (requestToken !== overviewRequestToken || !missingMediaMap.size) return;

    missingMediaMap.forEach((src, teamNum) => {
      state.overviewTeamMediaByTeam.set(teamNum, src);
    });
    renderOverview();
  } catch (error) {
    console.warn("Unable to finish background overview enrichment", error);
  }
}

function queueMatchTrackerSync(options) {
  void syncMatchTrackerSelection(options).catch((error) => {
    console.warn("Unable to sync match tracker", error);
  });
}

async function fetchStatbotics(path) {
  const response = await fetch(`${STATBOTICS_API_BASE}/${path}`, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Statbotics request failed (${response.status}).`);
  }

  return response.json();
}

async function fetchOverviewAllianceSelections(eventKey) {
  const normalizedKey = String(eventKey || "").trim().toLowerCase();
  if (!normalizedKey) return [];

  try {
    const payload = await requestTbaMedia({ mode: "alliances", eventKey: normalizedKey });
    return Array.isArray(payload?.alliances) ? payload.alliances : [];
  } catch (error) {
    console.warn("Unable to load Blue Alliance alliance selections", error);
    return [];
  }
}

async function fetchOverviewTeamMedia(eventKey) {
  const normalizedKey = String(eventKey || "").trim().toLowerCase();
  if (!normalizedKey) return new Map();

  try {
    const payload = await requestTbaMedia({ mode: "team_media", eventKey: normalizedKey });
    return buildOverviewTeamMediaMap(payload?.media);
  } catch (error) {
    console.warn("Unable to load Blue Alliance team media", error);
    return new Map();
  }
}

async function fetchMissingTeamMedia(teamNumbers, existingMediaMap, season) {
  const missingTeams = teamNumbers.filter((teamNum) => {
    const num = Number(teamNum || 0);
    return Number.isFinite(num) && num > 0 && !existingMediaMap.has(num);
  });

  if (missingTeams.length === 0) return new Map();

  const mediaMap = new Map();
  const batchSize = 10;
  const normalizedSeason = Number(season || getCurrentSeason());
  
  for (let i = 0; i < missingTeams.length; i += batchSize) {
    const batch = missingTeams.slice(i, i + batchSize);
    const promises = batch.map(async (teamNum) => {
      const teamKey = `frc${teamNum}`;
      const num = Number(teamNum);
      try {
        const payload = await requestTbaMedia({ mode: "team_media", teamKey, year: normalizedSeason });
        const mediaEntries = payload?.media;
        
        // When fetching by teamKey, media entries might not have team_keys set
        // So we need to ensure each entry is associated with this team
        const normalizedEntries = Array.isArray(mediaEntries) 
          ? mediaEntries.map((entry) => {
              // If entry doesn't have team_keys, add it
              if (entry && typeof entry === "object") {
                if (!Array.isArray(entry.team_keys) || entry.team_keys.length === 0) {
                  return { ...entry, team_keys: [teamKey] };
                }
              }
              return entry;
            })
          : [];
        
        const teamMediaMap = buildOverviewTeamMediaMap(normalizedEntries);
        return { teamNum: num, mediaMap: teamMediaMap };
      } catch (error) {
        console.warn(`Unable to load media for team ${teamNum}`, error);
        return { teamNum: num, mediaMap: new Map() };
      }
    });

    const results = await Promise.all(promises);
    results.forEach(({ teamNum, mediaMap: teamMedia }) => {
      if (teamMedia.has(teamNum)) {
        mediaMap.set(teamNum, teamMedia.get(teamNum));
      }
    });
  }

  return mediaMap;
}

async function handleMatchTrackerSeasonChange(season) {
  if (!Number.isInteger(season) || season < 1992) return;
  state.trackerSelectedSeason = season;
  state.trackerSelectedEventKey = "";
  await loadMatchTrackerSeasonEvents(season, { fallbackToFirst: true });
}

async function handleMatchTrackerEventChange(eventKey) {
  const nextEventKey = String(eventKey || "").trim().toLowerCase();
  state.trackerSelectedEventKey = nextEventKey;
  if (!nextEventKey) {
    resetMatchTrackerState({ preserveSelection: true });
    renderOverviewPredictions();
    return;
  }
  await loadMatchTrackerEventData(nextEventKey);
}

async function syncMatchTrackerSelection({ forceActiveEvent = false } = {}) {
  renderMatchTrackerSeasonOptions();

  if (!configReady() || !elements.overviewTrackerSeasonSelect || !elements.overviewTrackerEventSelect) {
    renderOverviewPredictions();
    return;
  }

  const activeEvent = getActiveEvent();
  const activeSeason = activeEvent ? getEventSeason(activeEvent) : getCurrentSeason();
  const activeEventKey = buildBlueAllianceEventKey(activeEvent);
  const currentSeason = Number(state.trackerSelectedSeason);
  const desiredSeason =
    forceActiveEvent || !Number.isInteger(currentSeason) ? activeSeason : currentSeason;
  const desiredEventKey = forceActiveEvent ? activeEventKey : state.trackerSelectedEventKey || activeEventKey;

  state.trackerSelectedSeason = desiredSeason;
  renderMatchTrackerSeasonOptions();
  await loadMatchTrackerSeasonEvents(desiredSeason, {
    preferredEventKey: desiredEventKey,
    fallbackToFirst: true
  });
}

function renderMatchTrackerSeasonOptions() {
  if (!elements.overviewTrackerSeasonSelect) return;

  const select = elements.overviewTrackerSeasonSelect;
  const seasons = getMatchTrackerSeasonOptions();
  select.innerHTML = seasons.map((season) => `<option value="${season}">${season}</option>`).join("");

  if (!seasons.length) {
    select.innerHTML = '<option value="">No seasons available</option>';
    select.disabled = true;
    refreshCustomSelect(select);
    return;
  }

  const selectedSeason = Number(state.trackerSelectedSeason);
  const nextSeason = seasons.includes(selectedSeason) ? selectedSeason : seasons[0];
  state.trackerSelectedSeason = nextSeason;
  select.disabled = !configReady();
  select.value = String(nextSeason);
  refreshCustomSelect(select);
}

function renderMatchTrackerEventOptions(events, { selectedValue = "", disabled = false, placeholder = "Choose a competition" } = {}) {
  if (!elements.overviewTrackerEventSelect) return;

  const select = elements.overviewTrackerEventSelect;
  const rows = Array.isArray(events) ? events : [];

  if (!rows.length) {
    select.innerHTML = `<option value="">${placeholder}</option>`;
    select.value = "";
    select.disabled = true;
    refreshCustomSelect(select);
    return;
  }

  select.innerHTML = rows
    .map((event) => `<option value="${escapeHtml(event.key)}">${escapeHtml(event.name || event.key)}</option>`)
    .join("");
  select.disabled = disabled;
  select.value = rows.some((event) => event.key === selectedValue) ? selectedValue : rows[0].key;
  refreshCustomSelect(select);
}

async function loadMatchTrackerSeasonEvents(season, { preferredEventKey = "", fallbackToFirst = true } = {}) {
  const token = ++trackerRequestToken;
  const normalizedSeason = Number(season);
  state.trackerSelectedSeason = normalizedSeason;
  state.trackerSelectedEventKey = "";
  resetMatchTrackerState({ preserveSelection: true });
  renderMatchTrackerEventOptions([], { placeholder: "Loading competitions..." });
  renderOverviewPredictions();

  try {
    const events = await getMatchTrackerSeasonEvents(normalizedSeason);
    if (token !== trackerRequestToken) return;

    if (!events.length) {
      state.trackerError = `No competitions were found for Team ${TRACKED_TEAM_NUMBER} in ${normalizedSeason}.`;
      renderMatchTrackerEventOptions([], { placeholder: "No competitions found" });
      renderOverviewPredictions();
      return;
    }

    const nextEventKey = events.some((event) => event.key === preferredEventKey)
      ? preferredEventKey
      : fallbackToFirst
        ? getDefaultMatchTrackerEventKey(events)
        : "";

    state.trackerSelectedEventKey = nextEventKey;
    renderMatchTrackerEventOptions(events, { selectedValue: nextEventKey });

    if (!nextEventKey) {
      renderOverviewPredictions();
      return;
    }

    await loadMatchTrackerEventData(nextEventKey, token);
  } catch (error) {
    if (token !== trackerRequestToken) return;
    state.trackerError = normalizeError(error, "Unable to load competitions right now.");
    renderMatchTrackerEventOptions([], { placeholder: "Unable to load competitions" });
    renderOverviewPredictions();
  }
}

async function loadMatchTrackerEventData(eventKey, inheritedToken) {
  const token = inheritedToken || ++trackerRequestToken;
  const selectedEventKey = String(eventKey || "").trim().toLowerCase();

  if (!selectedEventKey) {
    resetMatchTrackerState({ preserveSelection: true });
    renderOverviewPredictions();
    return;
  }

  state.trackerSelectedEventKey = selectedEventKey;
  state.trackerLoading = true;
  state.trackerError = "";
  state.trackerMatches = [];
  state.trackerEvent = getMatchTrackerEventByKey(Number(state.trackerSelectedSeason), selectedEventKey);
  state.trackerPredictionMatches = [];
  state.trackerPredictionAccuracy = null;
  state.trackerPredictionError = "";
  renderOverviewPredictions();

  try {
    const [matchesResult, predictionResult] = await Promise.allSettled([
      getMatchTrackerMatches(selectedEventKey),
      getMatchTrackerPredictionData(selectedEventKey)
    ]);

    if (token !== trackerRequestToken) return;

    if (matchesResult.status !== "fulfilled") {
      throw matchesResult.reason;
    }

    state.trackerMatches = Array.isArray(matchesResult.value) ? matchesResult.value.slice() : [];
    state.trackerEvent = getMatchTrackerEventByKey(Number(state.trackerSelectedSeason), selectedEventKey);

    const predictionData =
      predictionResult.status === "fulfilled"
        ? predictionResult.value
        : {
            matches: [],
            eventData: null,
            error: normalizeError(predictionResult.reason, "Statbotics predictions are unavailable right now.")
          };

    state.trackerPredictionMatches = Array.isArray(predictionData?.matches) ? predictionData.matches.slice() : [];
    state.trackerPredictionAccuracy = Number.isFinite(Number(predictionData?.eventData?.metrics?.win_prob?.acc))
      ? Number(predictionData.eventData.metrics.win_prob.acc)
      : null;
    state.trackerPredictionError = String(predictionData?.error || "").trim();
  } catch (error) {
    if (token !== trackerRequestToken) return;
    state.trackerError = normalizeError(error, "Unable to load match videos right now.");
    state.trackerMatches = [];
    state.trackerPredictionMatches = [];
    state.trackerPredictionAccuracy = null;
    state.trackerPredictionError = "";
  } finally {
    if (token !== trackerRequestToken) return;
    state.trackerLoading = false;
    renderOverviewPredictions();
  }
}

async function getMatchTrackerSeasonEvents(season) {
  const normalizedSeason = Number(season);
  if (state.trackerEventsBySeason.has(normalizedSeason)) {
    return state.trackerEventsBySeason.get(normalizedSeason);
  }

  const payload = await requestTbaMedia({ mode: "events", season: normalizedSeason });
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const sortedEvents = events.slice().sort(sortBlueAllianceEventsByDate);
  state.trackerEventsBySeason.set(normalizedSeason, sortedEvents);
  return sortedEvents;
}

async function getMatchTrackerMatches(eventKey) {
  const normalizedKey = String(eventKey || "").trim().toLowerCase();
  if (state.trackerMatchesByEvent.has(normalizedKey)) {
    return state.trackerMatchesByEvent.get(normalizedKey);
  }

  const payload = await requestTbaMedia({ mode: "matches", eventKey: normalizedKey });
  const matches = Array.isArray(payload?.matches) ? payload.matches : [];
  const sortedMatches = matches.slice().sort(compareBlueAllianceMatches);
  state.trackerMatchesByEvent.set(normalizedKey, sortedMatches);
  return sortedMatches;
}

async function getMatchTrackerPredictionData(eventKey) {
  const normalizedKey = String(eventKey || "").trim().toLowerCase();
  const liveOverviewData = getLiveOverviewPredictionData(normalizedKey);
  if (liveOverviewData) {
    return liveOverviewData;
  }

  if (state.trackerPredictionDataByEvent.has(normalizedKey)) {
    return state.trackerPredictionDataByEvent.get(normalizedKey);
  }

  try {
    const [matches, eventData] = await Promise.all([
      fetchStatbotics(`matches?event=${encodeURIComponent(normalizedKey)}&limit=${OVERVIEW_MATCH_LIMIT}`),
      fetchStatbotics(`event/${encodeURIComponent(normalizedKey)}`)
    ]);

    const data = {
      matches: Array.isArray(matches) ? matches : [],
      eventData: eventData && !Array.isArray(eventData) ? eventData : null,
      error: ""
    };
    state.trackerPredictionDataByEvent.set(normalizedKey, data);
    return data;
  } catch (error) {
    const data = {
      matches: [],
      eventData: null,
      error: normalizeError(error, "Statbotics predictions are unavailable right now.")
    };
    state.trackerPredictionDataByEvent.set(normalizedKey, data);
    return data;
  }
}

function getLiveOverviewPredictionData(eventKey) {
  const activeEventKey = getStatboticsEventKey(getActiveEvent());
  if (!eventKey || !activeEventKey || activeEventKey !== eventKey) {
    return null;
  }

  if (state.overviewError || (!state.overviewMatches.length && !state.overviewEventData)) {
    return null;
  }

  return {
    matches: Array.isArray(state.overviewMatches) ? state.overviewMatches.slice() : [],
    eventData: state.overviewEventData || null,
    error: ""
  };
}

async function requestTbaMedia(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") {
      query.set(key, String(value));
    }
  });

  const response = await fetch(`${state.config.supabaseUrl}/functions/v1/${TBA_MEDIA_PROXY_FUNCTION}?${query.toString()}`, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    let errorMessage = `Match tracker request failed with ${response.status}.`;
    try {
      const payload = await response.json();
      if (payload && typeof payload.error === "string" && payload.error.trim()) {
        errorMessage = payload.error.trim();
      }
    } catch (error) {
      // Ignore JSON parse issues and fall back to the HTTP status.
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

function getMatchTrackerSeasonOptions() {
  const currentSeason = getCurrentSeason();
  const seasons = new Set([
    currentSeason,
    currentSeason - 1,
    currentSeason - 2,
    currentSeason - 3
  ]);

  state.events.forEach((event) => {
    seasons.add(getEventSeason(event));
  });

  state.trackerEventsBySeason.forEach((_, season) => {
    seasons.add(Number(season));
  });

  return Array.from(seasons)
    .filter((season) => Number.isInteger(season) && season >= 1992)
    .sort((left, right) => right - left);
}

function getMatchTrackerEventByKey(season, eventKey) {
  const events = state.trackerEventsBySeason.get(Number(season)) || [];
  return events.find((event) => event.key === eventKey) || null;
}

function getDefaultMatchTrackerEventKey(events) {
  const rows = Array.isArray(events) ? events : [];
  return rows.length ? rows[rows.length - 1].key : "";
}

function buildBlueAllianceEventKey(event) {
  if (!event) return "";
  const season = getEventSeason(event);
  const eventCode = String(event.event_code || "")
    .trim()
    .toLowerCase();
  return eventCode ? `${season}${eventCode}` : "";
}

function getCurrentSeason() {
  return new Date().getFullYear();
}

function sortBlueAllianceEventsByDate(left, right) {
  const leftDate = Date.parse(left?.end_date || left?.start_date || `${left?.year || 0}-01-01`);
  const rightDate = Date.parse(right?.end_date || right?.start_date || `${right?.year || 0}-01-01`);

  if (leftDate !== rightDate) {
    return rightDate - leftDate;
  }

  return String(left?.name || "").localeCompare(String(right?.name || ""));
}

function compareBlueAllianceMatches(left, right) {
  const levelDiff = (MATCH_LEVEL_ORDER[left?.comp_level] ?? 99) - (MATCH_LEVEL_ORDER[right?.comp_level] ?? 99);
  if (levelDiff !== 0) {
    return levelDiff;
  }

  const setDiff = Number(left?.set_number || 0) - Number(right?.set_number || 0);
  if (setDiff !== 0) {
    return setDiff;
  }

  return Number(left?.match_number || 0) - Number(right?.match_number || 0);
}

function sortCompetitionRows(rows) {
  return (Array.isArray(rows) ? rows.slice() : []).sort((left, right) => {
    return compareNullableNumbers(left?.record?.qual?.rank, right?.record?.qual?.rank) || compareNullableNumbers(left?.team, right?.team);
  });
}

function sortTexasRows(rows) {
  return (Array.isArray(rows) ? rows.slice() : []).sort((left, right) => {
    return (
      compareNullableNumbers(left?.epa?.ranks?.state?.rank, right?.epa?.ranks?.state?.rank) ||
      compareNullableNumbers(left?.district_rank, right?.district_rank) ||
      compareNullableNumbers(left?.team, right?.team)
    );
  });
}

function getTrackedEventRow() {
  return state.overviewCompetitionRows.find((row) => Number(row?.team) === TRACKED_TEAM_NUMBER) || null;
}

function getTrackedTexasRow() {
  return state.overviewTexasRows.find((row) => Number(row?.team) === TRACKED_TEAM_NUMBER) || null;
}

function getEventSeason(event) {
  const startYear = Number(String(event?.start_date || "").slice(0, 4));
  return Number.isFinite(startYear) && startYear > 2000 ? startYear : new Date().getFullYear();
}

function getStatboticsEventKey(event) {
  if (!event) return "";
  return `${getEventSeason(event)}${String(event.event_code || "").trim().toLowerCase()}`;
}

function getTrackedAlliance(match) {
  const redTeams = match?.alliances?.red?.team_keys || [];
  const blueTeams = match?.alliances?.blue?.team_keys || [];
  if (redTeams.includes(TRACKED_TEAM_NUMBER)) return "red";
  if (blueTeams.includes(TRACKED_TEAM_NUMBER)) return "blue";
  return "";
}

function getTrackedWinProbability(match, alliance) {
  const redWinProbability = Number(match?.pred?.red_win_prob || 0);
  if (alliance === "red") return redWinProbability;
  if (alliance === "blue") return 1 - redWinProbability;
  return redWinProbability;
}

function formatTrackedPredictedScore(match, alliance) {
  const predicted = match?.pred || {};
  const ownScore = alliance === "blue" ? predicted.blue_score : predicted.red_score;
  const opponentScore = alliance === "blue" ? predicted.red_score : predicted.blue_score;
  if (!Number.isFinite(ownScore) || !Number.isFinite(opponentScore)) {
    return "Prediction unavailable";
  }
  return `${Math.round(ownScore)} - ${Math.round(opponentScore)}`;
}

function buildMatchTrackerCards(matches, predictionMatches) {
  const predictionMap = new Map(
    (Array.isArray(predictionMatches) ? predictionMatches : [])
      .filter((match) => match && typeof match.key === "string")
      .map((match) => [match.key, match])
  );

  return (Array.isArray(matches) ? matches : [])
    .slice()
    .sort(compareBlueAllianceMatches)
    .filter((match) => Array.isArray(match?.videos) && match.videos.length)
    .map((match) => decorateMatchTrackerMatch(match, predictionMap.get(match.key)));
}

function decorateMatchTrackerMatch(match, predictionMatch) {
  const alliance = getBlueAllianceAllianceForTeam(match, `frc${TRACKED_TEAM_NUMBER}`);
  const opponentAlliance = alliance === "red" ? "blue" : "red";
  const ourTeams = getBlueAllianceAllianceTeams(match, alliance);
  const opponentTeams = getBlueAllianceAllianceTeams(match, opponentAlliance);
  const ourScore = getBlueAllianceAllianceScore(match, alliance);
  const opponentScore = getBlueAllianceAllianceScore(match, opponentAlliance);
  const played =
    Number.isFinite(ourScore) &&
    ourScore >= 0 &&
    Number.isFinite(opponentScore) &&
    opponentScore >= 0;

  let resultLine = `${formatBlueAllianceMatchLabel(match)} scheduled`;
  let scoreLine = "Score not posted yet";
  let tone = "";

  if (played) {
    const didWin = ourScore > opponentScore;
    const didTie = ourScore === opponentScore;
    resultLine = didTie ? "Match ended in a tie" : didWin ? "Match win" : "Match loss";
    scoreLine = `${didTie ? "Tied" : didWin ? "Won" : "Lost"} ${ourScore}-${opponentScore}`;
    tone = didTie ? "" : didWin ? "positive" : "negative";
  } else {
    const scheduledAt = match?.actual_time || match?.predicted_time || match?.time;
    scoreLine = scheduledAt ? `Scheduled ${formatUnixDateTime(scheduledAt)}` : "Scheduled";
  }

  const winProbability = predictionMatch ? formatPercentage(getTrackedWinProbability(predictionMatch, alliance), 1) : "--";
  const predictedScore = predictionMatch ? formatTrackedPredictedScore(predictionMatch, alliance) : "Prediction unavailable";

  return {
    key: match?.key || "",
    label: formatBlueAllianceMatchLabel(match),
    alliance,
    allianceLabel: alliance === "red" ? "Red Alliance" : alliance === "blue" ? "Blue Alliance" : "Alliance TBD",
    resultLine,
    scoreLine,
    winProbability,
    predictedScore,
    teamLine: ourTeams.join(", ") || "Team list unavailable",
    opponentLine: opponentTeams.join(", ") || "Team list unavailable",
    watchUrl: buildWatchSourceUrl(match),
    detailUrl: match?.key ? `https://www.thebluealliance.com/match/${encodeURIComponent(match.key)}` : "#",
    video: getBlueAlliancePrimaryVideo(match),
    tone
  };
}

function renderMatchTrackerCard(match) {
  const embed = match.video && match.video.type === "youtube"
    ? `<iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(match.video.key)}" title="${escapeHtml(match.label)} video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`
    : `<div class="tracker-card-fallback"><div><strong>${escapeHtml(match.label)}</strong><p>Video source is available on The Blue Alliance.</p></div></div>`;

  return `
    <article class="tracker-card" ${match.tone ? `data-tone="${escapeHtml(match.tone)}"` : ""}>
      <div class="tracker-card-media">${embed}</div>
      <div class="tracker-card-copy">
        <div class="tracker-card-topline">
          <span class="tracker-chip tracker-chip--label">${escapeHtml(match.label)}</span>
          <span class="tracker-chip tracker-chip--alliance" data-alliance="${escapeHtml(match.alliance)}">${escapeHtml(match.allianceLabel)}</span>
        </div>
        <h4 class="tracker-card-title">${escapeHtml(match.resultLine)}</h4>
        <p class="tracker-card-summary">${escapeHtml(match.scoreLine)}</p>
        <div class="tracker-card-metrics">
          <div class="tracker-metric">
            <span>Win odds</span>
            <strong>${escapeHtml(match.winProbability)}</strong>
          </div>
          <div class="tracker-metric">
            <span>Predicted score</span>
            <strong>${escapeHtml(match.predictedScore)}</strong>
          </div>
        </div>
        <p class="tracker-card-teams"><strong>Alliance:</strong> ${escapeHtml(match.teamLine)}</p>
        <p class="tracker-card-teams"><strong>Opposition:</strong> ${escapeHtml(match.opponentLine)}</p>
        <div class="tracker-card-actions">
          <a class="btn secondary" href="${match.watchUrl}" target="_blank" rel="noreferrer noopener">Watch Source</a>
          <a class="btn secondary" href="${match.detailUrl}" target="_blank" rel="noreferrer noopener">Match Details</a>
        </div>
      </div>
    </article>
  `;
}

function renderMatchTrackerEventMeta() {
  if (
    !elements.overviewTrackerEventMeta ||
    !elements.overviewTrackerEventName ||
    !elements.overviewTrackerEventSubtitle ||
    !elements.overviewTrackerEventSummary
  ) {
    return;
  }

  if (!state.trackerEvent) {
    elements.overviewTrackerEventMeta.hidden = true;
    return;
  }

  elements.overviewTrackerEventMeta.hidden = false;
  elements.overviewTrackerEventName.textContent = state.trackerEvent.name || "Selected competition";
  elements.overviewTrackerEventSubtitle.textContent = buildBlueAllianceEventSubtitle(state.trackerEvent);

  if (state.trackerLoading && !state.trackerMatches.length) {
    elements.overviewTrackerEventSummary.textContent = "Loading matches...";
    return;
  }

  const totalMatches = state.trackerMatches.length;
  const videoCount = state.trackerMatches.filter((match) => Array.isArray(match?.videos) && match.videos.length).length;
  const summaryParts = [];

  if (totalMatches) {
    summaryParts.push(`${videoCount} videos from ${totalMatches} team match${totalMatches === 1 ? "" : "es"}`);
  } else {
    summaryParts.push("No team matches loaded yet");
  }

  if (Number.isFinite(state.trackerPredictionAccuracy)) {
    summaryParts.push(`model accuracy ${formatPercentage(state.trackerPredictionAccuracy, 1)}`);
  }

  if (state.trackerPredictionError) {
    summaryParts.push("predicted scores unavailable");
  }

  elements.overviewTrackerEventSummary.textContent = summaryParts.join(" • ");
}

function updateMatchTrackerLinks(eventKey = state.trackerSelectedEventKey) {
  if (elements.overviewTrackerTeamLink) {
    elements.overviewTrackerTeamLink.href = `https://www.thebluealliance.com/team/${TRACKED_TEAM_NUMBER}`;
  }

  if (elements.overviewTrackerEventLink) {
    if (eventKey) {
      elements.overviewTrackerEventLink.href = `https://www.thebluealliance.com/event/${encodeURIComponent(eventKey)}`;
      elements.overviewTrackerEventLink.textContent = "Open Competition on The Blue Alliance";
    } else {
      elements.overviewTrackerEventLink.href = `https://www.thebluealliance.com/team/${TRACKED_TEAM_NUMBER}`;
      elements.overviewTrackerEventLink.textContent = "Browse Team 10312 on The Blue Alliance";
    }
  }
}

function setMatchTrackerStatus(message, tone = "") {
  if (!elements.overviewTrackerStatus) return;
  elements.overviewTrackerStatus.textContent = message;
  elements.overviewTrackerStatus.dataset.tone = tone || "";
}

function formatBlueAllianceMatchLabel(match) {
  const base = MATCH_LEVEL_LABELS[match?.comp_level] || "Match";
  if (match?.comp_level === "qm") {
    return `${base} ${match?.match_number || "?"}`;
  }

  if (match?.set_number && match?.match_number) {
    return `${base} ${match.set_number}-${match.match_number}`;
  }

  return `${base} ${match?.match_number || "?"}`;
}

function buildBlueAllianceEventSubtitle(event) {
  const location = [event?.city, event?.state_prov, event?.country].filter(Boolean).join(", ");
  const dateText = formatArchiveDateRange(event?.start_date, event?.end_date);

  if (location && dateText) {
    return `${location} • ${dateText}`;
  }

  return location || dateText || "Blue Alliance competition archive";
}

function formatUnixDateTime(unixSeconds) {
  const timestamp = Number(unixSeconds);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  return formatDateTime(timestamp * 1000);
}

function formatArchiveDateRange(startDate, endDate) {
  if (!startDate) return "";

  const start = new Date(`${startDate}T12:00:00`);
  const end = endDate ? new Date(`${endDate}T12:00:00`) : null;
  const shortOptions = { month: "short", day: "numeric" };

  if (!end || startDate === endDate) {
    return `${start.toLocaleDateString(undefined, shortOptions)}, ${start.getFullYear()}`;
  }

  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${start.toLocaleDateString(undefined, shortOptions)}-${end.getDate()}, ${end.getFullYear()}`;
  }

  return `${start.toLocaleDateString(undefined, shortOptions)} - ${end.toLocaleDateString(undefined, shortOptions)}, ${end.getFullYear()}`;
}

function buildWatchSourceUrl(match) {
  const video = getBlueAlliancePrimaryVideo(match);
  if (video?.type === "youtube" && video.key) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(video.key)}`;
  }
  return match?.key ? `https://www.thebluealliance.com/match/${encodeURIComponent(match.key)}` : "#";
}

function getBlueAlliancePrimaryVideo(match) {
  const videos = Array.isArray(match?.videos) ? match.videos : [];
  return videos.find((video) => video && video.type === "youtube" && video.key) || videos.find((video) => video && video.key) || null;
}

function getBlueAllianceAllianceForTeam(match, teamKey) {
  const redTeams = getBlueAllianceAllianceTeams(match, "red", true);
  if (redTeams.includes(teamKey)) return "red";

  const blueTeams = getBlueAllianceAllianceTeams(match, "blue", true);
  if (blueTeams.includes(teamKey)) return "blue";

  return "unknown";
}

function getBlueAllianceAllianceTeams(match, alliance, rawKeys = false) {
  const teams =
    match?.alliances?.[alliance] && Array.isArray(match.alliances[alliance].team_keys)
      ? match.alliances[alliance].team_keys
      : [];

  return rawKeys ? teams : teams.map(formatBlueAllianceTeamKey);
}

function getBlueAllianceAllianceScore(match, alliance) {
  const score = match?.alliances?.[alliance]?.score;
  return typeof score === "number" ? score : null;
}

function formatBlueAllianceTeamKey(teamKey) {
  return teamKey ? String(teamKey).replace(/^frc/i, "Team ") : "Unknown team";
}

function isCompletedStatboticsMatch(match) {
  return String(match?.status || "").toLowerCase() === "completed";
}

function matchIncludesTeam(match, teamNumber) {
  const target = Number(teamNumber || 0);
  const redTeams = match?.alliances?.red?.team_keys || [];
  const blueTeams = match?.alliances?.blue?.team_keys || [];
  return redTeams.includes(target) || blueTeams.includes(target);
}

function formatStatboticsTeam(row) {
  const teamNumber = row?.team ?? row?.teamNumber ?? "--";
  const teamName = row?.team_name || row?.name || "";
  return teamName ? `${teamNumber} • ${teamName}` : String(teamNumber);
}

function normalizeStatboticsVideoUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-zA-Z0-9_-]{6,}$/.test(raw)) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(raw)}`;
  }
  return "";
}

function isCurrentEventOver() {
  const status = String(state.overviewEventData?.status || state.overviewEventData?.status_str || "")
    .trim()
    .toLowerCase();
  return status === "completed" || status === "complete" || status === "finished" || status === "over";
}

async function handleEventChange(eventId) {
  state.activeEventId = eventId;
  state.matchEntries = [];
  state.pitEntries = [];
  state.teamSummary = [];
  resetOverviewState();
  clearEditingEntryId("match");
  clearEditingEntryId("pit");
  setScoutReloadSelection("match", SCOUT_RELOAD_NEW_VALUE);
  setScoutReloadSelection("pit", SCOUT_RELOAD_NEW_VALUE);
  saveStoredValue(STORAGE_KEYS.activeEventId, state.activeEventId);

  if (!state.session) {
    renderAll();
    return;
  }

  try {
    state.isRefreshing = true;
    renderAll();
    await Promise.all([
      loadEntriesForActiveEvent(),
      loadOverviewData()
    ]);
    queueMatchTrackerSync({ forceActiveEvent: true });
    state.lastSyncAt = new Date().toISOString();
    saveStoredValue(STORAGE_KEYS.lastSyncAt, state.lastSyncAt);
    setAppMessage("Event data loaded.", "success");
  } catch (error) {
    setAppMessage(normalizeError(error, "Unable to switch events."), "danger");
  } finally {
    state.isRefreshing = false;
    renderAll();
  }
}

async function submitMatchForm() {
  if (!state.client || !state.session) {
    setFormMessage(elements.matchFormMessage, "Sign in before submitting match entries.", "warn");
    return;
  }

  activateFormValidation(elements.matchForm);
  const validation = validateMatchForm({ apply: true });
  if (!validation.valid) {
    setFormMessage(elements.matchFormMessage, validation.message, "danger");
    focusFormValidationTarget(elements.matchForm, validation.focusName);
    return;
  }

  const payload = buildMatchPayload();
  const saveTarget = resolveMatchSaveTarget(payload);
  setFormMessage(elements.matchFormMessage, "Submitting match entry...", "success");
  elements.matchSubmitButton.disabled = true;

  try {
    if (!state.connectionOnline) {
      throw new Error("Device is offline.");
    }

    const result = await saveMatchEntry(payload, saveTarget);

    resetMatchDraft(payload.scout_name);
    await loadEntriesForActiveEvent();
    state.lastSyncAt = new Date().toISOString();
    saveStoredValue(STORAGE_KEYS.lastSyncAt, state.lastSyncAt);
    setFormMessage(
      elements.matchFormMessage,
      result.action === "update" ? "Match entry updated." : "Match entry synced.",
      "success"
    );
    if (result.missingColumns.length) {
      console.warn("Match entry saved with legacy schema fallback:", result.missingColumns);
    }
    setAppMessage(result.action === "update" ? "Match entry updated." : "Match entry saved.", "success");
  } catch (error) {
    if (shouldQueueSyncError(error)) {
      enqueueOutbox("match", payload, { targetId: saveTarget.targetId });
      setFormMessage(
        elements.matchFormMessage,
        "Sync failed. The match entry was saved to this device outbox.",
        "warn"
      );
      setAppMessage(normalizeError(error, "Entry queued in the outbox for retry."), "warn");
    } else {
      setFormMessage(elements.matchFormMessage, normalizeError(error, "Unable to save match entry."), "danger");
      setAppMessage(normalizeError(error, "Unable to save match entry."), "danger");
    }
  } finally {
    elements.matchSubmitButton.disabled = false;
    renderAll();
  }
}

async function submitPitForm() {
  if (!state.client || !state.session) {
    setFormMessage(elements.pitFormMessage, "Sign in before submitting pit entries.", "warn");
    return;
  }

  activateFormValidation(elements.pitForm);
  const validation = validatePitForm({ apply: true });
  if (!validation.valid) {
    setFormMessage(elements.pitFormMessage, validation.message, "danger");
    focusFormValidationTarget(elements.pitForm, validation.focusName);
    return;
  }

  const payload = buildPitPayload();
  const saveTarget = resolvePitSaveTarget(payload);
  setFormMessage(elements.pitFormMessage, "Submitting pit entry...", "success");
  elements.pitSubmitButton.disabled = true;

  try {
    if (!state.connectionOnline) {
      throw new Error("Device is offline.");
    }

    const result = await savePitEntry(payload, saveTarget);

    resetPitDraft(payload.scout_name);
    await loadEntriesForActiveEvent();
    state.lastSyncAt = new Date().toISOString();
    saveStoredValue(STORAGE_KEYS.lastSyncAt, state.lastSyncAt);
    setFormMessage(
      elements.pitFormMessage,
      result.action === "update" ? "Pit entry updated." : "Pit entry synced.",
      "success"
    );
    if (result.missingColumns.length) {
      console.warn("Pit entry saved with legacy schema fallback:", result.missingColumns);
    }
    setAppMessage(result.action === "update" ? "Pit entry updated." : "Pit entry saved.", "success");
  } catch (error) {
    if (shouldQueueSyncError(error)) {
      enqueueOutbox("pit", payload, { targetId: saveTarget.targetId });
      setFormMessage(
        elements.pitFormMessage,
        "Sync failed. The pit entry was saved to this device outbox.",
        "warn"
      );
      setAppMessage(normalizeError(error, "Entry queued in the outbox for retry."), "warn");
    } else {
      setFormMessage(elements.pitFormMessage, normalizeError(error, "Unable to save pit entry."), "danger");
      setAppMessage(normalizeError(error, "Unable to save pit entry."), "danger");
    }
  } finally {
    elements.pitSubmitButton.disabled = false;
    renderAll();
  }
}

async function flushOutbox() {
  if (!state.client || !state.session) {
    setAppMessage("Sign in before retrying the outbox.", "warn");
    return;
  }

  if (!state.outbox.length) {
    setAppMessage("The outbox is already empty.", "success");
    return;
  }

  state.isRefreshing = true;
  renderAll();

  const remaining = [];
  let syncedCount = 0;

  for (const item of state.outbox) {
    try {
      if (item.type === "match") {
        await saveMatchEntry(item.payload, { targetId: item.targetId });
      } else {
        await savePitEntry(item.payload, { targetId: item.targetId });
      }
      syncedCount += 1;
    } catch (error) {
      remaining.push(item);
    }
  }

  state.outbox = remaining;
  saveStoredJson(STORAGE_KEYS.outbox, state.outbox);

  if (syncedCount > 0) {
    await loadEntriesForActiveEvent();
    state.lastSyncAt = new Date().toISOString();
    saveStoredValue(STORAGE_KEYS.lastSyncAt, state.lastSyncAt);
  }

  state.isRefreshing = false;

  if (remaining.length) {
    setAppMessage(`Synced ${syncedCount} queued entries. ${remaining.length} still need retry.`, "warn");
  } else {
    setAppMessage(`Synced ${syncedCount} queued entries. Outbox cleared.`, "success");
  }

  renderAll();
}

function showTab(tabName) {
  const validTab = elements.tabButtons.some((button) => button.dataset.tab === tabName)
    ? tabName
    : DEFAULT_WORKSPACE_TAB;

  state.activeTab = validTab;
  saveStoredValue(STORAGE_KEYS.activeTab, state.activeTab);

  elements.tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === validTab;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  elements.tabPanels.forEach((panel) => {
    const isActive = panel.id === `panel-${validTab}`;
    panel.classList.toggle("hidden", !isActive);
  });

  if (validTab === "pit") {
    requestAnimationFrame(() => {
      syncAutoPathCanvasSize();
    });
  }
}

function renderAll() {
  renderConfigState();
  renderAuthState();
  renderEventOptions();
  renderCurrentEvent();
  renderStatusPills();
  renderOverview();
  renderOutbox();
  renderScoutReloadOptions();
  renderDraftStamp("match");
  renderDraftStamp("pit");
  renderFormAvailability();
}

function renderConfigState() {
  const configured = configReady();

  if (elements.googleSignInButton) {
    elements.googleSignInButton.disabled = !configured;
  }
}

function isSessionRestorePending() {
  return configReady() && !state.authReady;
}

function renderAuthState() {
  const configured = configReady();
  const signedIn = Boolean(state.session && isAllowedEmail(getSessionEmail(state.session)));
  const restoringSession = isSessionRestorePending();
  const showApp = configured && (signedIn || restoringSession);

  elements.lockView.classList.toggle("hidden", showApp);
  elements.appView.classList.toggle("hidden", !showApp);

  if (elements.googleSignInButton) {
    if (!configured) {
      elements.googleSignInButton.textContent = "Sign In With Google";
      elements.googleSignInButton.disabled = true;
    } else if (restoringSession) {
      elements.googleSignInButton.textContent = "Sign In With Google";
      elements.googleSignInButton.disabled = true;
    } else {
      elements.googleSignInButton.textContent = "Sign In With Google";
      elements.googleSignInButton.disabled = false;
    }
  }

  if (showApp) {
    const email = getSessionEmail(state.session);
    if (signedIn && email) {
      setStatusPill(elements.authPill, `Signed in: ${email}`, "success");
    } else {
      setStatusPill(elements.authPill, "Loading workspace...", "warn");
    }
    return;
  }

  if (restoringSession) {
    setStatusPill(elements.authPill, "Loading workspace...", "warn");
    return;
  }

  setStatusPill(elements.authPill, "Locked", "warn");
}

function renderEventOptions() {
  if (!elements.eventSelect) return;

  const select = elements.eventSelect;
  select.innerHTML = "";
  const restoringSession = isSessionRestorePending();

  if (restoringSession) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Loading events...";
    select.appendChild(option);
    select.value = "";
    select.disabled = true;
    refreshCustomSelect(select);
    return;
  }

  if (!state.events.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = state.session ? "No events configured" : "Sign in to load events";
    select.appendChild(option);
    select.value = "";
    select.disabled = true;
    refreshCustomSelect(select);
    return;
  }

  state.events.forEach((event) => {
    const option = document.createElement("option");
    option.value = event.id;
    option.textContent = `${event.name} (${event.event_code})`;
    select.appendChild(option);
  });

  select.disabled = false;
  select.value = state.activeEventId;
  refreshCustomSelect(select);
}

function renderCurrentEvent() {
  const event = getActiveEvent();
  const restoringSession = isSessionRestorePending();

  if (!event) {
    if (restoringSession) {
      elements.currentEventName.textContent = "Loading workspace...";
      elements.currentEventMeta.textContent = "Restoring scouting session and event data.";
      return;
    }

    elements.currentEventName.textContent = "No active event selected";
    elements.currentEventMeta.textContent = state.session
      ? "Create or activate a scouting_events row in Supabase to enable submissions."
      : "Sign in with Google to load team events.";
    return;
  }

  elements.currentEventName.textContent = event.name;
  elements.currentEventMeta.textContent = [
    event.event_code,
    event.location || "Location TBD",
    formatDateRange(event.start_date, event.end_date)
  ]
    .filter(Boolean)
    .join(" • ");
}

function renderStatusPills() {
  setStatusPill(
    elements.connectionPill,
    state.connectionOnline ? "Online" : "Offline",
    state.connectionOnline ? "success" : "danger"
  );

  const queueTone = state.outbox.length ? "warn" : "success";
  setStatusPill(elements.queuePill, `Outbox: ${state.outbox.length}`, queueTone);
}

function renderOverview() {
  renderOverviewEventState();
  renderOverviewModeButtons();
  renderOverviewBanners();
  renderOverviewTable();
  renderOverviewPredictions();
  renderPickAnalysis();
}

function renderOverviewEventState() {
  if (!elements.overviewEventClosedBanner) return;
  const eventOver = isCurrentEventOver();
  elements.overviewEventClosedBanner.textContent = "This event is over.";
  elements.overviewEventClosedBanner.classList.toggle("hidden", !eventOver);
}

function renderOverviewModeButtons() {
  elements.overviewModeButtons.forEach((button) => {
    const mode = button.dataset.overviewMode || OVERVIEW_MODE_COMPETITION;
    const active = mode === state.overviewMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function renderOverviewBanners() {
  const eventRow = getTrackedEventRow();
  const texasRow = getTrackedTexasRow();
  const eventStreamUrl = normalizeStatboticsVideoUrl(state.overviewEventData?.video);
  const restoringSession = isSessionRestorePending();

  if (!elements.overviewCompetitionValue) return;
  renderOverviewCompetitionStream(eventStreamUrl);

  if ((restoringSession || state.overviewLoading) && !eventRow && !texasRow) {
    setOverviewBanner(elements.overviewCompetitionValue, elements.overviewCompetitionMeta, "Loading", "Pulling Statbotics event data.");
    setOverviewBanner(elements.overviewTexasValue, elements.overviewTexasMeta, "Loading", "Pulling Texas district data.");
    setOverviewBanner(elements.overviewWorldValue, elements.overviewWorldMeta, "Loading", "Pulling global EPA rank.");
    return;
  }

  if (state.overviewError && !eventRow && !texasRow) {
    setOverviewBanner(elements.overviewCompetitionValue, elements.overviewCompetitionMeta, "Unavailable", state.overviewError);
    setOverviewBanner(elements.overviewTexasValue, elements.overviewTexasMeta, "Unavailable", "Texas and world rankings are temporarily unavailable.");
    setOverviewBanner(elements.overviewWorldValue, elements.overviewWorldMeta, "Unavailable", "Statbotics could not return a team-year row.");
    return;
  }

  if (eventRow) {
    const qualRecord = eventRow.record?.qual || {};
    setOverviewBanner(
      elements.overviewCompetitionValue,
      elements.overviewCompetitionMeta,
      `#${eventRow.record?.qual?.rank || "--"}`,
      `${eventRow.event_name || "Selected event"} • ${formatRecord(qualRecord)} • EPA ${formatDecimal(eventRow.epa?.total_points?.mean)}`
    );
  } else {
    setOverviewBanner(
      elements.overviewCompetitionValue,
      elements.overviewCompetitionMeta,
      "No rank",
      "Team 10312 does not have a Statbotics event row for the selected event yet."
    );
  }

  if (texasRow) {
    const stateRank = texasRow.epa?.ranks?.state?.rank;
    const stateCount = texasRow.epa?.ranks?.state?.team_count;
    setOverviewBanner(
      elements.overviewTexasValue,
      elements.overviewTexasMeta,
      `#${texasRow.district_rank || texasRow.epa?.ranks?.district?.rank || "--"}`,
      `FIT district • Texas EPA #${stateRank || "--"} of ${stateCount || "--"} • ${texasRow.district_points ?? "--"} pts`
    );
    setOverviewBanner(
      elements.overviewWorldValue,
      elements.overviewWorldMeta,
      `#${texasRow.epa?.ranks?.total?.rank || "--"}`,
      `${texasRow.epa?.ranks?.total?.team_count || "--"} teams • percentile ${formatPercentage(
        texasRow.epa?.ranks?.total?.percentile,
        1
      )} • EPA ${formatDecimal(texasRow.epa?.total_points?.mean)}`
    );
    return;
  }

  setOverviewBanner(
    elements.overviewTexasValue,
    elements.overviewTexasMeta,
    "No rank",
    "Texas district data is not available from Statbotics for this season yet."
  );
  setOverviewBanner(
    elements.overviewWorldValue,
    elements.overviewWorldMeta,
    "No rank",
    "Global EPA rank is unavailable until Team 10312 has a Statbotics team-year row."
  );
}

function renderOverviewTable() {
  if (!elements.overviewRankingsHead || !elements.overviewRankingsBody || !elements.overviewSourceMeta) return;

  const columns = getOverviewRankingColumns();
  const rows =
    state.overviewMode === OVERVIEW_MODE_TEXAS ? state.overviewTexasRows : state.overviewCompetitionRows;
  const hasRows = Array.isArray(rows) && rows.length > 0;
  const restoringSession = isSessionRestorePending();
  const isRefreshingExistingRows = state.overviewLoading && hasRows;

  elements.overviewRankingsHead.innerHTML = "";
  const headRow = document.createElement("tr");
  columns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column.label;
    th.className = column.headClassName || "";
    headRow.appendChild(th);
  });
  elements.overviewRankingsHead.appendChild(headRow);

  if ((restoringSession || state.overviewLoading) && !hasRows) {
    elements.overviewSourceMeta.textContent = "Loading Statbotics rankings and predictions...";
    renderOverviewMessageRow(elements.overviewRankingsBody, columns.length, "Loading live Statbotics rankings...");
    return;
  }

  if (state.overviewError) {
    elements.overviewSourceMeta.textContent = state.overviewError;
    renderOverviewMessageRow(elements.overviewRankingsBody, columns.length, state.overviewError);
    return;
  }

  elements.overviewSourceMeta.textContent = [
    `${state.overviewCompetitionRows.length} event teams`,
    `${state.overviewTexasRows.length} Texas teams`,
    state.overviewFetchedAt ? `Updated ${formatTime(state.overviewFetchedAt)}` : "",
    isRefreshingExistingRows ? "Refreshing live Statbotics data..." : "",
    "Source: Statbotics • team media: The Blue Alliance"
  ]
    .filter(Boolean)
    .join(" • ");

  if (!rows.length) {
    renderOverviewMessageRow(elements.overviewRankingsBody, columns.length, "No Statbotics ranking rows are available yet.");
    return;
  }

  const fragment = document.createDocumentFragment();

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    if (Number(row.team) === TRACKED_TEAM_NUMBER) {
      tr.classList.add("is-tracked-row");
    }

    columns.forEach((column) => {
      const td = document.createElement("td");
      td.className = column.cellClassName || "";
      if (typeof column.render === "function") {
        td.innerHTML = column.render(row);
      } else {
        td.textContent = String(column.getValue(row));
      }
      tr.appendChild(td);
    });

    fragment.appendChild(tr);
  });

  elements.overviewRankingsBody.innerHTML = "";
  elements.overviewRankingsBody.appendChild(fragment);
}

function getOverviewRankingColumns() {
  if (state.overviewMode === OVERVIEW_MODE_TEXAS) {
    return [
      {
        label: "Rank",
        headClassName: "rankings-table__col--rank",
        cellClassName: "rankings-table__cell--rank",
        getValue: (row) => row.epa?.ranks?.state?.rank || row.district_rank || "--"
      },
      {
        label: "Team",
        headClassName: "rankings-table__col--team",
        cellClassName: "rankings-table__cell--team",
        render: renderOverviewTeamCell
      },
      {
        label: "Ranking Score",
        headClassName: "rankings-table__col--metric",
        cellClassName: "rankings-table__cell--metric",
        getValue: (row) => formatNullableFixedDecimal(row.record?.qual?.rps_per_match)
      },
      {
        label: "Match",
        headClassName: "rankings-table__col--metric",
        cellClassName: "rankings-table__cell--metric",
        getValue: (row) => formatNullableFixedDecimal(row.epa?.breakdown?.total_points)
      },
      {
        label: "Auto Fuel",
        headClassName: "rankings-table__col--metric",
        cellClassName: "rankings-table__cell--metric",
        getValue: (row) => formatNullableFixedDecimal(row.epa?.breakdown?.auto_fuel)
      },
      {
        label: "Tower",
        headClassName: "rankings-table__col--metric",
        cellClassName: "rankings-table__cell--metric",
        getValue: (row) => formatNullableFixedDecimal(row.epa?.breakdown?.total_tower)
      },
      {
        label: "W-L-T",
        headClassName: "rankings-table__col--metric",
        cellClassName: "rankings-table__cell--metric",
        getValue: (row) => formatRecordCompact(row.record?.qual)
      },
      {
        label: "Matches Played",
        headClassName: "rankings-table__col--metric",
        cellClassName: "rankings-table__cell--metric",
        getValue: (row) => getRecordMatchesPlayed(row.record?.qual)
      }
    ];
  }

  return [
    {
      label: "Rank",
      headClassName: "rankings-table__col--rank",
      cellClassName: "rankings-table__cell--rank",
      getValue: (row) => row.record?.qual?.rank || "--"
    },
    {
      label: "Team",
      headClassName: "rankings-table__col--team",
      cellClassName: "rankings-table__cell--team",
      render: renderOverviewTeamCell
    },
    {
      label: "Ranking Score",
      headClassName: "rankings-table__col--metric",
      cellClassName: "rankings-table__cell--metric",
      getValue: (row) => formatNullableFixedDecimal(row.record?.qual?.rps_per_match)
    },
    {
      label: "Match",
      headClassName: "rankings-table__col--metric",
      cellClassName: "rankings-table__cell--metric",
      getValue: (row) => formatNullableFixedDecimal(row.epa?.breakdown?.total_points)
    },
    {
      label: "Auto Fuel",
      headClassName: "rankings-table__col--metric",
      cellClassName: "rankings-table__cell--metric",
      getValue: (row) => formatNullableFixedDecimal(row.epa?.breakdown?.auto_fuel)
    },
    {
      label: "Tower",
      headClassName: "rankings-table__col--metric",
      cellClassName: "rankings-table__cell--metric",
      getValue: (row) => formatNullableFixedDecimal(row.epa?.breakdown?.total_tower)
    },
    {
      label: "W-L-T",
      headClassName: "rankings-table__col--metric",
      cellClassName: "rankings-table__cell--metric",
      getValue: (row) => formatRecordCompact(row.record?.qual)
    },
    {
      label: "Matches Played",
      headClassName: "rankings-table__col--metric",
      cellClassName: "rankings-table__cell--metric",
      getValue: (row) => getRecordMatchesPlayed(row.record?.qual)
    }
  ];
}

function renderOverviewTeamCell(row) {
  const teamNumber = row?.team ?? row?.teamNumber ?? "--";
  const teamName = row?.team_name || row?.name || `Team ${teamNumber}`;
  const href = `https://www.thebluealliance.com/team/${encodeURIComponent(String(teamNumber))}`;
  const logoSrc = getOverviewTeamLogoSource(teamNumber);
  const logoMarkup = logoSrc
    ? `<span class="rankings-team-cell__logo"><img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(teamName)} logo" loading="lazy" /></span>`
    : `<span class="rankings-team-cell__logo rankings-team-cell__logo--placeholder" aria-hidden="true">${escapeHtml(teamNumber)}</span>`;

  return `
    <div class="rankings-team-cell">
      ${logoMarkup}
      <div class="rankings-team-cell__copy">
        <a class="rankings-team-cell__number" href="${href}" target="_blank" rel="noreferrer noopener">
          ${escapeHtml(teamNumber)}
        </a>
        <span class="rankings-team-cell__name">${escapeHtml(teamName)}</span>
      </div>
    </div>
  `;
}

function renderOverviewPredictions() {
  if (
    !elements.overviewPredictionBody ||
    !elements.overviewPredictionLabel ||
    !elements.overviewTrackerStatus
  ) {
    return;
  }

  renderMatchTrackerSeasonOptions();
  updateMatchTrackerLinks();
  renderMatchTrackerEventMeta();
  const restoringSession = isSessionRestorePending();

  elements.overviewPredictionLabel.textContent = state.trackerPredictionError
    ? "Match videos are loaded from The Blue Alliance. Predicted scores are temporarily unavailable for this competition."
    : "Browse Team 10312 match videos by season and competition. Predicted scores are powered by Statbotics.";
  const cards = buildMatchTrackerCards(state.trackerMatches, state.trackerPredictionMatches);
  const hasCards = cards.length > 0;

  if (!configReady()) {
    clearMatchTrackerCards();
    setMatchTrackerStatus("Match tracker is unavailable until Supabase is configured.");
    return;
  }

  if (state.trackerError) {
    clearMatchTrackerCards();
    setMatchTrackerStatus(state.trackerError, "error");
    return;
  }

  if (!state.trackerSelectedEventKey) {
    if (restoringSession) {
      clearMatchTrackerCards();
      setMatchTrackerStatus("Loading match tracker...", "loading");
      return;
    }
    clearMatchTrackerCards();
    setMatchTrackerStatus("Choose a competition to load match videos.");
    return;
  }

  if (state.trackerLoading && !hasCards) {
    clearMatchTrackerCards();
    setMatchTrackerStatus(
      state.trackerSelectedEventKey ? "Loading match videos..." : "Loading competitions...",
      "loading"
    );
    return;
  }

  if (!hasCards) {
    clearMatchTrackerCards();
    setMatchTrackerStatus("No videos available for this event.");
    return;
  }

  renderMatchTrackerCards(cards);
  if (elements.overviewTrackerLinks) {
    elements.overviewTrackerLinks.hidden = false;
  }
  setMatchTrackerStatus(
    state.trackerLoading
      ? "Refreshing match videos..."
      : `${cards.length} team match video${cards.length === 1 ? "" : "s"} loaded from The Blue Alliance.${state.trackerPredictionError ? " Predicted scores unavailable." : ""}`,
    state.trackerLoading ? "loading" : ""
  );
}

function clearMatchTrackerCards() {
  if (!elements.overviewPredictionBody) return;
  elements.overviewPredictionBody.hidden = true;
  elements.overviewPredictionBody.innerHTML = "";
  delete elements.overviewPredictionBody.dataset.renderSignature;
  if (elements.overviewTrackerLinks) {
    elements.overviewTrackerLinks.hidden = true;
  }
}

function renderMatchTrackerCards(cards) {
  if (!elements.overviewPredictionBody) return;

  const signature = getMatchTrackerRenderSignature(cards);
  if (elements.overviewPredictionBody.dataset.renderSignature !== signature) {
    elements.overviewPredictionBody.innerHTML = cards.map((match) => renderMatchTrackerCard(match)).join("");
    elements.overviewPredictionBody.dataset.renderSignature = signature;
  }

  elements.overviewPredictionBody.hidden = false;
}

function getMatchTrackerRenderSignature(cards) {
  return (Array.isArray(cards) ? cards : [])
    .map((match) =>
      [
        match?.key || "",
        match?.label || "",
        match?.alliance || "",
        match?.resultLine || "",
        match?.scoreLine || "",
        match?.winProbability || "",
        match?.predictedScore || "",
        match?.watchUrl || "",
        match?.detailUrl || "",
        match?.video?.type || "",
        match?.video?.key || ""
      ].join("::")
    )
    .join("|");
}

function renderOverviewMessageRow(target, colSpan, message) {
  target.innerHTML = "";
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = colSpan;
  td.textContent = message;
  tr.appendChild(td);
  target.appendChild(tr);
}

function setOverviewBanner(valueTarget, metaTarget, value, meta) {
  if (valueTarget) valueTarget.textContent = value;
  if (metaTarget) metaTarget.textContent = meta;
}

function renderOverviewCompetitionStream(url) {
  if (!elements.overviewCompetitionStream) return;
  const hasUrl = Boolean(url);
  elements.overviewCompetitionStream.classList.toggle("hidden", !hasUrl);
  elements.overviewCompetitionStream.href = hasUrl ? url : "#";
}

function runPickAnalysis() {
  if (state.analysisRunning) return;

  const event = getActiveEvent();
  const ourRow = getTrackedEventRow();
  if (isCurrentEventOver()) {
    setAppMessage("Pick analysis is disabled because this event is already over.", "warn");
    return;
  }

  if (!event || !state.overviewCompetitionRows.length) {
    setAppMessage("Load an event before running pick analysis.", "warn");
    return;
  }

  if (!ourRow) {
    setAppMessage("Team 10312 does not have a Statbotics event row yet for this event.", "warn");
    return;
  }

  state.analysisRunning = true;
  renderPickAnalysis();

  try {
    state.analysisResult = buildAlliancePickAnalysis();
    state.analysisNeedsRefresh = false;
    state.analysisRunAt = new Date().toISOString();
  } catch (error) {
    state.analysisResult = null;
    setAppMessage(normalizeError(error, "Unable to run pick analysis."), "danger");
  } finally {
    state.analysisRunning = false;
    renderPickAnalysis();
  }
}

function buildAlliancePickAnalysis() {
  const ourRow = getTrackedEventRow();
  const ourSummary = getSummaryRow(TRACKED_TEAM_NUMBER);
  const ourRank = Number(ourRow?.record?.qual?.rank || Number.POSITIVE_INFINITY);
  const actualAvailability =
    buildTbaAllianceSelectionAvailabilityContext(state.overviewAllianceSelections, state.overviewCompetitionRows) ||
    buildCompletedEventAvailabilityContext(state.overviewMatches, state.overviewCompetitionRows);

  if (actualAvailability && actualAvailability.canPick === false) {
    return {
      ourRank: Number.isFinite(ourRank) ? ourRank : 0,
      actualAvailability,
      recommendation: null,
      shortlist: []
    };
  }

  const candidates = (actualAvailability?.availableRows?.length
    ? actualAvailability.availableRows
    : state.overviewCompetitionRows.filter((row) => Number(row?.team) !== TRACKED_TEAM_NUMBER)
  ).filter((row) => Number(row?.team) !== TRACKED_TEAM_NUMBER);

  if (!candidates.length) {
    return {
      ourRank: Number.isFinite(ourRank) ? ourRank : 0,
      actualAvailability,
      recommendation: null,
      shortlist: []
    };
  }

  const metricContext = buildAnalysisMetricContext(candidates);
  const weights = getPickAnalysisWeights(ourRank);
  const ourProfile = buildOurAllianceProfile(ourRow, ourSummary, metricContext);

  const shortlist = candidates
    .map((row) => scoreAllianceCandidate(row, ourProfile, metricContext, weights, actualAvailability))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  return {
    ourRank: Number.isFinite(ourRank) ? ourRank : 0,
    actualAvailability,
    recommendation: shortlist[0] || null,
    shortlist
  };
}

function buildTbaAllianceSelectionAvailabilityContext(alliances, competitionRows) {
  const normalizedAlliances = normalizeTbaAllianceSelections(alliances);
  if (!normalizedAlliances.length) return null;

  const selectedTeamNumbers = new Set();
  const declinedTeamNumbers = new Set();
  normalizedAlliances.forEach((alliance) => {
    alliance.teamNumbers.forEach((teamNumber) => {
      selectedTeamNumbers.add(teamNumber);
    });
    alliance.declinedTeamNumbers.forEach((teamNumber) => {
      declinedTeamNumbers.add(teamNumber);
    });
  });

  const unavailableTeamNumbers = new Set([TRACKED_TEAM_NUMBER]);
  selectedTeamNumbers.forEach((teamNumber) => unavailableTeamNumbers.add(teamNumber));
  declinedTeamNumbers.forEach((teamNumber) => unavailableTeamNumbers.add(teamNumber));

  const ourAlliance = normalizedAlliances.find((alliance) => alliance.teamNumbers.includes(TRACKED_TEAM_NUMBER)) || null;
  const ourRole = ourAlliance ? getTbaAllianceRole(ourAlliance, TRACKED_TEAM_NUMBER) : declinedTeamNumbers.has(TRACKED_TEAM_NUMBER) ? "declined" : "undrafted";
  const canPick = Boolean(ourAlliance && ourRole === "captain" && ourAlliance.teamNumbers.length < 3);
  const availableRows = canPick
    ? (Array.isArray(competitionRows) ? competitionRows : []).filter((row) => {
        const teamNumber = Number(row?.team || 0);
        return Number.isFinite(teamNumber) && !unavailableTeamNumbers.has(teamNumber);
      })
    : [];

  return {
    source: "tba",
    canPick,
    ourAllianceSeed: ourAlliance?.seed || null,
    ourRole,
    pickStage: canPick ? getTbaAlliancePickStage(ourAlliance) : "",
    ourAlliance,
    availableRows,
    selectedTeamNumbers: Array.from(selectedTeamNumbers).sort((left, right) => left - right),
    declinedTeamNumbers: Array.from(declinedTeamNumbers).sort((left, right) => left - right),
    unavailableTeamNumbers: Array.from(unavailableTeamNumbers).sort((left, right) => left - right)
  };
}

function buildCompletedEventAvailabilityContext(matches, competitionRows) {
  const qfMatches = (Array.isArray(matches) ? matches : [])
    .filter((match) => String(match?.comp_level || "").toLowerCase() === "qf")
    .sort((left, right) => {
      return compareNullableNumbers(left?.set_number, right?.set_number) || compareNullableNumbers(left?.match_number, right?.match_number);
    });

  if (!qfMatches.length) return null;

  const alliancesBySeed = new Map();
  qfMatches.forEach((match) => {
    const seedMap = QF_ALLIANCE_SEED_MAP[Number(match?.set_number || 0)];
    if (!seedMap) return;
    registerAllianceSeed(alliancesBySeed, seedMap.red, match?.alliances?.red?.team_keys || []);
    registerAllianceSeed(alliancesBySeed, seedMap.blue, match?.alliances?.blue?.team_keys || []);
  });

  if (!alliancesBySeed.size) return null;

  const ourAlliance = Array.from(alliancesBySeed.values()).find((alliance) => alliance.captain === TRACKED_TEAM_NUMBER);
  if (!ourAlliance) return null;

  const unavailableTeamNumbers = new Set([TRACKED_TEAM_NUMBER]);
  alliancesBySeed.forEach((alliance) => {
    if (Number.isFinite(alliance.captain)) unavailableTeamNumbers.add(alliance.captain);
    if (alliance.seed < ourAlliance.seed && Number.isFinite(alliance.firstPick)) {
      unavailableTeamNumbers.add(alliance.firstPick);
    }
  });

  const availableRows = (Array.isArray(competitionRows) ? competitionRows : []).filter((row) => {
    const teamNumber = Number(row?.team || 0);
    return Number.isFinite(teamNumber) && !unavailableTeamNumbers.has(teamNumber);
  });

  return {
    source: "playoffs",
    canPick: true,
    ourRole: "captain",
    availableRows,
    ourAllianceSeed: ourAlliance.seed,
    unavailableTeamNumbers: Array.from(unavailableTeamNumbers).sort((left, right) => left - right)
  };
}

function normalizeTbaAllianceSelections(alliances) {
  return (Array.isArray(alliances) ? alliances : [])
    .map((alliance, index) => {
      const seed = Number(alliance?.number || index + 1);
      const picks = (Array.isArray(alliance?.picks) ? alliance.picks : [])
        .map(parseTbaTeamNumber)
        .filter((teamNumber) => Number.isFinite(teamNumber));
      const declines = (Array.isArray(alliance?.declines) ? alliance.declines : [])
        .map(parseTbaTeamNumber)
        .filter((teamNumber) => Number.isFinite(teamNumber));

      if (!Number.isFinite(seed) || !picks.length) return null;

      return {
        seed,
        name: String(alliance?.name || `Alliance ${seed}`),
        teamNumbers: picks,
        captain: picks[0] || null,
        firstPick: picks[1] || null,
        secondPick: picks[2] || null,
        declinedTeamNumbers: declines
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.seed - right.seed);
}

function buildOverviewTeamMediaMap(mediaEntries) {
  const bestMediaByTeam = new Map();

  normalizeOverviewTeamMediaEntries(mediaEntries).forEach((entry) => {
    const imageSource = getPreferredTbaTeamMediaSource(entry);
    if (!imageSource) return;

    const teamNumbers = getTbaMediaTeamNumbers(entry);

    teamNumbers.forEach((teamNumber) => {
      const current = bestMediaByTeam.get(teamNumber);
      if (!current || current.rank > imageSource.rank) {
        bestMediaByTeam.set(teamNumber, imageSource);
      }
    });
  });

  const mediaMap = new Map();
  bestMediaByTeam.forEach((value, teamNumber) => {
    mediaMap.set(teamNumber, value.src);
  });
  return mediaMap;
}

function normalizeOverviewTeamMediaEntries(mediaEntries) {
  if (Array.isArray(mediaEntries)) {
    return mediaEntries;
  }

  if (!mediaEntries || typeof mediaEntries !== "object") {
    return [];
  }

  const normalized = [];
  Object.entries(mediaEntries).forEach(([teamKey, value]) => {
    const entries = Array.isArray(value) ? value : [value];
    entries.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      if (Array.isArray(entry.team_keys) && entry.team_keys.length) {
        normalized.push(entry);
        return;
      }

      normalized.push({
        ...entry,
        team_keys: [teamKey]
      });
    });
  });
  return normalized;
}

function getTbaMediaTeamNumbers(entry) {
  const teamKeys = [
    ...(Array.isArray(entry?.team_keys) ? entry.team_keys : []),
    entry?.team_key,
    entry?.references?.team_key,
    entry?.details?.team_key
  ];

  return Array.from(
    new Set(
      teamKeys
        .map(parseTbaTeamNumber)
        .filter((teamNumber) => Number.isFinite(teamNumber))
    )
  );
}

function getPreferredTbaTeamMediaSource(entry) {
  const type = String(entry?.type || "").trim().toLowerCase();
  const preferred = entry?.preferred === true;
  const base64Image = String(entry?.details?.base64Image || entry?.details?.base64image || "").trim();
  if (type === "avatar" && base64Image) {
    return {
      rank: 0,
      src: `data:image/png;base64,${base64Image}`
    };
  }

  const directUrl = normalizeTbaMediaUrl(entry?.direct_url);
  if (!directUrl || isTbaPlaceholderMediaUrl(directUrl) || !isProbablyRenderableImageUrl(directUrl, type)) {
    return null;
  }

  if (type === "avatar") {
    return {
      rank: 1,
      src: directUrl
    };
  }

  if (preferred) {
    return {
      rank: 2,
      src: directUrl
    };
  }

  return {
    rank: 3,
    src: directUrl
  };
}

function normalizeTbaMediaUrl(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  if (source.startsWith("data:image/")) return source;

  try {
    const url = new URL(source, "https://www.thebluealliance.com");
    if (!/^https?:$/i.test(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function isProbablyRenderableImageUrl(url, type = "") {
  const normalizedType = String(type || "").trim().toLowerCase();
  if (!url) return false;
  if (String(url).startsWith("data:image/")) return true;

  try {
    const parsed = new URL(url);
    if (/\.(avif|gif|jpe?g|png|svg|webp)(?:$|\?)/i.test(parsed.pathname)) {
      return true;
    }

    if (normalizedType === "avatar") {
      return true;
    }

    return /(^|\.)i\.imgur\.com$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function isTbaPlaceholderMediaUrl(url) {
  if (!url || String(url).startsWith("data:image/")) return false;

  try {
    const parsed = new URL(url);
    if (!/(^|\.)thebluealliance\.com$/i.test(parsed.hostname)) {
      return false;
    }

    return /(placeholder|default|missing|no[-_]?avatar|avatar[-_]?placeholder)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function registerAllianceSeed(target, seed, teamKeys) {
  const numericSeed = Number(seed || 0);
  if (!numericSeed || target.has(numericSeed)) return;
  const roster = (Array.isArray(teamKeys) ? teamKeys : []).map((team) => Number(team)).filter((team) => Number.isFinite(team));
  if (!roster.length) return;
  target.set(numericSeed, {
    seed: numericSeed,
    captain: roster[0] || null,
    firstPick: roster[1] || null,
    secondPick: roster[2] || null,
    teams: roster
  });
}

function getTbaAllianceRole(alliance, teamNumber) {
  const target = Number(teamNumber || 0);
  if (!alliance || !target) return "";
  if (alliance.captain === target) return "captain";
  if (alliance.firstPick === target) return "first_pick";
  if (alliance.secondPick === target) return "second_pick";
  return "member";
}

function getTbaAlliancePickStage(alliance) {
  const pickCount = Array.isArray(alliance?.teamNumbers) ? alliance.teamNumbers.length : 0;
  if (pickCount <= 1) return "first pick";
  if (pickCount === 2) return "second pick";
  return "picks complete";
}

function parseTbaTeamNumber(value) {
  const normalized = String(value || "").trim().replace(/^frc/i, "");
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const numeric = Number(normalized);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function getOverviewTeamLogoSource(teamNumber) {
  const target = Number(teamNumber || 0);
  if (!Number.isFinite(target)) return "";
  return state.overviewTeamMediaByTeam.get(target) || "";
}

function buildAnalysisMetricContext(candidates) {
  return {
    epaBounds: getMetricBounds(candidates.map((row) => row?.epa?.total_points?.mean)),
    statboticsFuelBounds: getMetricBounds(candidates.map((row) => row?.epa?.breakdown?.total_fuel)),
    statboticsTowerBounds: getMetricBounds(candidates.map((row) => row?.epa?.breakdown?.total_tower)),
    qualRankBounds: getMetricBounds(candidates.map((row) => row?.record?.qual?.rank)),
    districtPointBounds: getMetricBounds(candidates.map((row) => row?.district_points)),
    worldRankBounds: getMetricBounds(candidates.map((row) => row?.epa?.ranks?.total?.rank)),
    localOffenseBounds: getMetricBounds(state.teamSummary.map((row) => row?.avg_total_fuel)),
    localAutoBounds: getMetricBounds(state.teamSummary.map((row) => row?.avg_auto_fuel)),
    localDefenseBounds: getMetricBounds(state.teamSummary.map((row) => row?.avg_defense_rating)),
    localTowerBounds: getMetricBounds(state.teamSummary.map((row) => row?.tower_success_rate))
  };
}

function buildOurAllianceProfile(ourRow, ourSummary, context) {
  const offenseSource = ourSummary?.matches_scouted
    ? normalizeMetric(ourSummary.avg_total_fuel, context.localOffenseBounds, 0.45)
    : normalizeMetric(ourRow?.epa?.total_points?.mean, context.epaBounds, 0.45);
  const defenseSource = ourSummary?.matches_scouted
    ? normalizeMetric(ourSummary.avg_defense_rating, context.localDefenseBounds, 0.4)
    : normalizeDefenseCapability(ourSummary?.defense_capability || "Unknown");
  const towerSource = ourSummary?.matches_scouted
    ? clamp(Number(ourSummary.tower_success_rate || 0) / 100, 0, 1)
    : 0.4;

  return {
    offenseNeed: clamp(1.15 - offenseSource, 0.35, 1),
    defenseNeed: clamp(1.05 - defenseSource, 0.35, 1),
    towerNeed: clamp(1.05 - towerSource, 0.25, 1)
  };
}

function scoreAllianceCandidate(row, ourProfile, context, weights, actualAvailability = null) {
  const summary = getSummaryRow(row?.team);
  const hasPitData = Boolean(summary && buildPitSnapshot(summary) !== "No pit data");
  const epaScore = normalizeMetric(row?.epa?.total_points?.mean, context.epaBounds, 0.45);
  const rankScore = invertMetric(row?.record?.qual?.rank, context.qualRankBounds, 0.4);
  const districtScore = buildDistrictStrengthScore(row, context);
  const offenseScore = buildCandidateOffenseScore(row, summary, context);
  const defenseScore = buildCandidateDefenseScore(summary, context);
  const reliabilityScore = buildCandidateReliabilityScore(summary);
  const towerScore = buildCandidateTowerScore(row, summary, context);
  const complementScore = buildComplementScore(offenseScore, defenseScore, towerScore, ourProfile);
  const availabilityScore = actualAvailability
    ? 1
    : buildAvailabilityScore(row?.record?.qual?.rank, Number(getTrackedEventRow()?.record?.qual?.rank || 999));
  const confidenceScore = buildConfidenceScore(summary, hasPitData);
  const pitReadiness = buildPitReadinessScore(summary);

  const contributions = {
    epa: weights.epa * epaScore,
    rank: weights.rank * rankScore,
    district: weights.district * districtScore,
    offense: weights.offense * offenseScore,
    defense: weights.defense * defenseScore,
    reliability: weights.reliability * reliabilityScore,
    tower: weights.tower * towerScore,
    complement: weights.complement * complementScore,
    availability: weights.availability * availabilityScore,
    confidence: weights.confidence * confidenceScore,
    pit: weights.pit * pitReadiness
  };

  let score = 100 * Object.values(contributions).reduce((sum, value) => sum + value, 0);
  if (Number(row?.record?.qual?.rank || 999) <= 8 && Number(getTrackedEventRow()?.record?.qual?.rank || 999) <= 8) {
    score -= 8;
  }
  if (summary?.breakdown_count >= 2) {
    score -= 4;
  }

  return {
    team: Number(row?.team || 0),
    teamName: row?.team_name || row?.name || "",
    eventRank: Number(row?.record?.qual?.rank || 0),
    epa: Number(row?.epa?.total_points?.mean || 0),
    score: roundToTwo(Math.max(score, 0)),
    reasons: buildCandidateReasons(row, summary, contributions, actualAvailability)
  };
}

function buildDistrictStrengthScore(row, context) {
  const districtPointsScore = normalizeMetric(row?.district_points, context.districtPointBounds, 0.4);
  const worldRankScore = invertMetric(row?.epa?.ranks?.total?.rank, context.worldRankBounds, 0.4);
  return roundToTwo((districtPointsScore * 0.55) + (worldRankScore * 0.45));
}

function buildCandidateOffenseScore(row, summary, context) {
  const statboticsOffense = normalizeMetric(row?.epa?.breakdown?.total_fuel, context.statboticsFuelBounds, 0.45);
  if (!summary?.matches_scouted) return statboticsOffense;

  const liveFuel = normalizeMetric(summary.avg_total_fuel, context.localOffenseBounds, statboticsOffense);
  const liveAuto = normalizeMetric(summary.avg_auto_fuel, context.localAutoBounds, statboticsOffense);
  const pitFuel = normalizeFuelCapability(summary.fuel_scoring_capability);
  return roundToTwo((liveFuel * 0.55) + (liveAuto * 0.2) + (pitFuel * 0.1) + (statboticsOffense * 0.15));
}

function buildCandidateDefenseScore(summary, context) {
  if (!summary) return 0.4;
  const liveDefense = normalizeMetric(summary.avg_defense_rating, context.localDefenseBounds, 0.45);
  const pitDefense = normalizeDefenseCapability(summary.defense_capability);
  return roundToTwo((liveDefense * 0.7) + (pitDefense * 0.3));
}

function buildCandidateReliabilityScore(summary) {
  if (!summary?.matches_scouted) return 0.72;
  let score = clamp(1 - Number(summary.breakdown_count || 0) / Math.max(Number(summary.matches_scouted || 1), 1), 0.2, 1);
  const reliabilityNotes = String(summary.reliability_notes || "").toLowerCase();
  if (/(break|repair|issue|dead|battery|chain|electrical|brownout)/.test(reliabilityNotes)) {
    score -= 0.08;
  }
  return clamp(score, 0.15, 1);
}

function buildCandidateTowerScore(row, summary, context) {
  if (summary?.matches_scouted) {
    return clamp(Number(summary.tower_success_rate || 0) / 100, 0, 1);
  }
  return normalizeMetric(row?.epa?.breakdown?.total_tower, context.statboticsTowerBounds, 0.35);
}

function buildComplementScore(offenseScore, defenseScore, towerScore, ourProfile) {
  const totalNeed = ourProfile.offenseNeed + ourProfile.defenseNeed + ourProfile.towerNeed;
  return roundToTwo(
    ((offenseScore * ourProfile.offenseNeed) +
      (defenseScore * ourProfile.defenseNeed) +
      (towerScore * ourProfile.towerNeed)) /
      Math.max(totalNeed, 0.01)
  );
}

function buildAvailabilityScore(candidateRank, ourRank) {
  const rank = Number(candidateRank || 999);
  const ourSeed = Number(ourRank || 999);

  if (ourSeed <= 4) {
    if (rank <= 8) return 0.12;
    if (rank <= 16) return 1;
    if (rank <= 24) return 0.82;
    return 0.55;
  }

  if (ourSeed <= 8) {
    if (rank <= 8) return 0.1;
    if (rank <= 20) return 1;
    if (rank <= 30) return 0.76;
    return 0.5;
  }

  if (ourSeed <= 16) {
    if (rank <= 8) return 0.42;
    if (rank <= 24) return 0.95;
    return 0.7;
  }

  if (rank <= 24) return 0.92;
  return 0.78;
}

function buildConfidenceScore(summary, hasPitData) {
  if (!summary) return 0.22;
  const matchCoverage = clamp(Number(summary.matches_scouted || 0) / 6, 0, 1);
  return clamp((matchCoverage * 0.75) + (hasPitData ? 0.25 : 0.08), 0.2, 1);
}

function buildPitReadinessScore(summary) {
  if (!summary) return 0.35;
  const fuel = normalizeFuelCapability(summary.fuel_scoring_capability);
  const defense = normalizeDefenseCapability(summary.defense_capability);
  const speed = normalizeScoringSpeed(summary.scoring_speed);
  const climb = normalizeClimbLevel(summary.climb_level);
  const strategy = /defense|cycle|endgame|pair|feeder|trap|amp|speaker|tower/i.test(String(summary.preferred_strategy || ""))
    ? 0.8
    : 0.5;
  return roundToTwo((fuel * 0.3) + (defense * 0.2) + (speed * 0.25) + (climb * 0.15) + (strategy * 0.1));
}

function buildCandidateReasons(row, summary, contributions, actualAvailability = null) {
  const reasonLabels = {
    epa: "elite Statbotics EPA",
    rank: "strong event seed",
    district: "strong season profile",
    offense: "productive live scoring",
    defense: "helpful defense profile",
    reliability: "reliable so far",
    tower: "good tower conversion",
    complement: "fits our current needs",
    availability: "good availability from our seed",
    confidence: "well-scouted profile",
    pit: "strong pit-readiness notes"
  };

  const topReasons = Object.entries(contributions)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([key]) => reasonLabels[key]);

  if (!summary?.matches_scouted) {
    topReasons.push("limited local scouting, leaning on Statbotics");
  }

  if (actualAvailability?.source === "tba" && actualAvailability.canPick) {
    topReasons.push(`still available on the live TBA draft board for our ${actualAvailability.pickStage}`);
  } else if (actualAvailability?.ourAllianceSeed) {
    topReasons.push(`available at captain seed #${actualAvailability.ourAllianceSeed}`);
  }

  return Array.from(new Set(topReasons)).slice(0, 3);
}

function describeAnalysisAvailability(actualAvailability) {
  if (!actualAvailability) return "Projected current availability";

  if (actualAvailability.source === "tba") {
    if (actualAvailability.ourRole === "captain") {
      if (actualAvailability.canPick) {
        return `Live TBA alliance board • Captain seed #${actualAvailability.ourAllianceSeed} • choosing ${actualAvailability.pickStage}`;
      }
      return `Live TBA alliance board • Alliance #${actualAvailability.ourAllianceSeed} is already full`;
    }

    if (actualAvailability.ourRole === "first_pick") {
      return `Live TBA alliance board • Team 10312 is already the first pick on Alliance #${actualAvailability.ourAllianceSeed}`;
    }

    if (actualAvailability.ourRole === "second_pick") {
      return `Live TBA alliance board • Team 10312 is already the second pick on Alliance #${actualAvailability.ourAllianceSeed}`;
    }

    if (actualAvailability.ourRole === "declined") {
      return "Live TBA alliance board • Team 10312 is marked as declined";
    }

    return "Live TBA alliance board • Team 10312 is not on a published alliance";
  }

  if (actualAvailability.ourAllianceSeed) {
    return `Captain seed #${actualAvailability.ourAllianceSeed} actual availability`;
  }

  return "Projected current availability";
}

function describeAnalysisPickWindow(actualAvailability) {
  if (!actualAvailability) return "Projected available";

  if (actualAvailability.source === "tba") {
    if (actualAvailability.canPick) {
      const teamsOffBoard = Math.max(Number(actualAvailability.unavailableTeamNumbers?.length || 1) - 1, 0);
      return `${capitalizeFirst(actualAvailability.pickStage)} • ${teamsOffBoard} teams already off the board`;
    }

    if (actualAvailability.ourRole === "captain") {
      return `Alliance #${actualAvailability.ourAllianceSeed} already has three teams`;
    }

    return `Already drafted on Alliance #${actualAvailability.ourAllianceSeed || "--"}`;
  }

  if (actualAvailability.ourAllianceSeed) {
    return `Available at seed #${actualAvailability.ourAllianceSeed}`;
  }

  return "Projected available";
}

function describeNoPickRecommendation(actualAvailability) {
  if (!actualAvailability) {
    return "No valid pick candidates were found for the current event.";
  }

  if (actualAvailability.source === "tba") {
    if (actualAvailability.ourRole === "captain" && !actualAvailability.canPick) {
      return `Alliance #${actualAvailability.ourAllianceSeed} already has all of its published picks on The Blue Alliance.`;
    }

    if (actualAvailability.ourRole === "first_pick" || actualAvailability.ourRole === "second_pick") {
      return `Team 10312 is already drafted on Alliance #${actualAvailability.ourAllianceSeed}, so there are no captain picks left to recommend here.`;
    }

    if (actualAvailability.ourRole === "declined") {
      return "Team 10312 is listed as declined on The Blue Alliance, so pick recommendations are unavailable.";
    }

    return "Team 10312 is not listed as a captain on The Blue Alliance, so there is no alliance draft slot to score.";
  }

  return "No valid pick candidates were found for the current event.";
}

function getPickAnalysisWeights(ourRank) {
  if (Number(ourRank || 999) <= 8) {
    return {
      epa: 0.19,
      rank: 0.07,
      district: 0.05,
      offense: 0.13,
      defense: 0.09,
      reliability: 0.1,
      tower: 0.06,
      complement: 0.14,
      availability: 0.11,
      confidence: 0.03,
      pit: 0.03
    };
  }

  return {
    epa: 0.23,
    rank: 0.09,
    district: 0.06,
    offense: 0.13,
    defense: 0.08,
    reliability: 0.1,
    tower: 0.05,
    complement: 0.1,
    availability: 0.07,
    confidence: 0.05,
    pit: 0.04
  };
}

function getSummaryRow(teamNumber) {
  const target = Number(teamNumber || 0);
  return state.teamSummary.find((row) => Number(row?.team_number) === target) || null;
}

function getMetricBounds(values) {
  const numbers = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!numbers.length) {
    return { min: 0, max: 1 };
  }
  return {
    min: Math.min(...numbers),
    max: Math.max(...numbers)
  };
}

function normalizeMetric(value, bounds, fallback = 0.5) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  const min = Number(bounds?.min);
  const max = Number(bounds?.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0.5;
  return clamp((numericValue - min) / (max - min), 0, 1);
}

function invertMetric(value, bounds, fallback = 0.5) {
  const normalized = normalizeMetric(value, bounds, fallback);
  return clamp(1 - normalized, 0, 1);
}

function normalizeFuelCapability(value) {
  switch (String(value || "").trim().toLowerCase()) {
    case "high volume":
      return 1;
    case "steady":
      return 0.8;
    case "situational":
      return 0.55;
    case "minimal":
      return 0.25;
    default:
      return 0.45;
  }
}

function normalizeDefenseCapability(value) {
  switch (String(value || "").trim().toLowerCase()) {
    case "strong":
      return 1;
    case "balanced":
      return 0.7;
    case "light":
      return 0.35;
    default:
      return 0.45;
  }
}

function normalizeScoringSpeed(value) {
  switch (String(value || "").trim().toLowerCase()) {
    case "very fast":
      return 1;
    case "fast":
      return 0.82;
    case "average":
      return 0.6;
    case "slow":
      return 0.3;
    default:
      return 0.45;
  }
}

function normalizeClimbLevel(value) {
  switch (String(value || "").trim().toLowerCase()) {
    case "level 3":
      return 1;
    case "level 2":
      return 0.7;
    case "level 1":
      return 0.4;
    default:
      return 0.2;
  }
}

function renderPickAnalysis() {
  if (!elements.pickAnalysisStatus || !elements.pickAnalysisBest || !elements.pickAnalysisBody) return;

  const eventOver = isCurrentEventOver();
  const restoringSession = isSessionRestorePending();
  const canAnalyze = Boolean(
    state.session && getActiveEvent() && state.overviewCompetitionRows.length && !state.overviewLoading && !eventOver && !restoringSession
  );
  elements.pickAnalysisBest.classList.remove("analysis-best");

  if (elements.runPickAnalysisButton) {
    elements.runPickAnalysisButton.disabled = !canAnalyze;
    elements.runPickAnalysisButton.setAttribute("aria-busy", state.analysisRunning ? "true" : "false");
    elements.runPickAnalysisButton.textContent = state.analysisRunning ? "Analyzing..." : "Run Analysis";
  }

  if (!getActiveEvent()) {
    if (restoringSession) {
      elements.pickAnalysisStatus.textContent = "Loading workspace data for pick analysis.";
      elements.pickAnalysisBest.classList.add("empty-state");
      elements.pickAnalysisBest.textContent = "Pick analysis will be available after the workspace loads.";
      renderOverviewMessageRow(elements.pickAnalysisBody, 5, "Loading current event data...");
      return;
    }
    elements.pickAnalysisStatus.textContent = "Select an event to enable pick analysis.";
    elements.pickAnalysisBest.classList.add("empty-state");
    elements.pickAnalysisBest.textContent = "No event selected.";
    renderOverviewMessageRow(elements.pickAnalysisBody, 5, "Pick analysis is unavailable until an event is selected.");
    return;
  }

  if (state.overviewLoading) {
    elements.pickAnalysisStatus.textContent = "Waiting for Statbotics event rows to finish loading.";
    elements.pickAnalysisBest.classList.add("empty-state");
    elements.pickAnalysisBest.textContent = "Analysis will be available after the current event data loads.";
    renderOverviewMessageRow(elements.pickAnalysisBody, 5, "Loading current event data...");
    return;
  }

  if (state.overviewError) {
    elements.pickAnalysisStatus.textContent = "Statbotics event data is unavailable, so the analysis cannot run.";
    elements.pickAnalysisBest.classList.add("empty-state");
    elements.pickAnalysisBest.textContent = state.overviewError;
    renderOverviewMessageRow(elements.pickAnalysisBody, 5, state.overviewError);
    return;
  }

  if (eventOver) {
    elements.pickAnalysisStatus.textContent = "This event is over, so pick analysis is disabled.";
    elements.pickAnalysisBest.classList.add("empty-state");
    elements.pickAnalysisBest.textContent = "Completed events keep their rankings visible, but alliance-pick analysis is locked.";
    renderOverviewMessageRow(elements.pickAnalysisBody, 5, "Pick analysis is disabled because this event is completed.");
    return;
  }

  if (!state.analysisResult) {
    elements.pickAnalysisStatus.textContent = "Press Run Analysis to score alliance partners from the currently loaded Statbotics and scouting data.";
    elements.pickAnalysisBest.classList.add("empty-state");
    elements.pickAnalysisBest.textContent = "No pick recommendation yet.";
    renderOverviewMessageRow(elements.pickAnalysisBody, 5, "Run the analysis to build a ranked shortlist.");
    return;
  }

  const recommendation = state.analysisResult.recommendation;
  const availabilityLabel = describeAnalysisAvailability(state.analysisResult.actualAvailability);
  const noRecommendationMessage = describeNoPickRecommendation(state.analysisResult.actualAvailability);
  elements.pickAnalysisStatus.textContent = [
    `Our rank: #${state.analysisResult.ourRank || "--"}`,
    availabilityLabel,
    state.analysisNeedsRefresh ? "Scouting changed since the last run. Press Run Analysis again." : "",
    state.analysisRunAt ? `Last run ${formatTime(state.analysisRunAt)}` : ""
  ]
    .filter(Boolean)
    .join(" • ");

  elements.pickAnalysisBest.innerHTML = "";
  elements.pickAnalysisBest.classList.remove("empty-state");
  elements.pickAnalysisBest.classList.add("analysis-best");

  if (recommendation) {
    const eyebrow = document.createElement("span");
    eyebrow.className = "section-label";
    eyebrow.textContent = recommendation.teamName || `Team ${recommendation.team}`;
    const title = document.createElement("strong");
    title.textContent = "Best current pick";
    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = [
      `Team ${recommendation.team}`,
      describeAnalysisPickWindow(state.analysisResult.actualAvailability),
      `Fit score ${formatDecimal(recommendation.score)}`,
      `Event rank #${recommendation.eventRank || "--"}`,
      `EPA ${formatDecimal(recommendation.epa)}`
    ]
      .filter(Boolean)
      .join(" • ");
    const reasons = document.createElement("p");
    reasons.className = "muted";
    reasons.textContent = recommendation.reasons.join(" • ");
    elements.pickAnalysisBest.append(eyebrow, title, meta, reasons);
  } else {
    elements.pickAnalysisBest.classList.remove("analysis-best");
    elements.pickAnalysisBest.classList.add("empty-state");
    elements.pickAnalysisBest.textContent = noRecommendationMessage;
  }

  renderAnalysisShortlist();
}

function renderAnalysisShortlist() {
  const body = elements.pickAnalysisBody;
  body.innerHTML = "";
  if (!state.analysisResult?.shortlist?.length) {
    renderOverviewMessageRow(body, 5, describeNoPickRecommendation(state.analysisResult?.actualAvailability || null));
    return;
  }

  const fragment = document.createDocumentFragment();
  state.analysisResult.shortlist.forEach((candidate, index) => {
    const tr = document.createElement("tr");
    if (index === 0) {
      tr.classList.add("is-tracked-row");
    }

    [
      `${candidate.team}${candidate.teamName ? ` • ${candidate.teamName}` : ""}`,
      formatDecimal(candidate.score),
      candidate.eventRank || "--",
      formatDecimal(candidate.epa),
      candidate.reasons.join(" • ")
    ].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = String(value);
      tr.appendChild(td);
    });

    fragment.appendChild(tr);
  });

  body.appendChild(fragment);
}

function renderOutbox() {
  if (!elements.outboxList || !elements.outboxEmpty) {
    return;
  }

  elements.outboxList.innerHTML = "";
  elements.outboxEmpty.classList.toggle("hidden", state.outbox.length > 0);

  if (!state.outbox.length) {
    return;
  }

  const fragment = document.createDocumentFragment();

  state.outbox.forEach((item) => {
    const payload = item.payload || {};
    const wrapper = document.createElement("div");
    wrapper.className = "outbox-item";

    const heading = document.createElement("strong");
    heading.textContent =
      item.type === "match"
        ? `Match • Team ${payload.team_number || "?"} • ${payload.match_type || "Match"} ${payload.match_number || ""}`.trim()
        : `Pit • Team ${payload.team_number || "?"}`;

    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = [
      getEventName(payload.event_id),
      payload.scout_name || "Unknown scout",
      formatDateTime(item.created_at)
    ]
      .filter(Boolean)
      .join(" • ");

    const detail = document.createElement("p");
    detail.className = "muted";
    detail.textContent =
      item.type === "match"
        ? `${payload.alliance_color || "Alliance"} ${payload.station || ""} • Defense ${payload.defense_rating ?? "-"}`
        : `${payload.drivetrain || "Drive unknown"} • ${payload.fuel_scoring_capability || "Fuel unknown"}`;

    if (item.type !== "match") {
      detail.textContent = [
        payload.drivetrain || "Drive unknown",
        payload.fuel_scoring_capability || "Fuel unknown",
        payload.barge_route && payload.barge_route !== "Unknown" ? `Barge ${payload.barge_route}` : "",
        Number(payload.estimated_fuel_per_match || 0) > 0
          ? `Fuel ${payload.estimated_fuel_per_match}/match`
          : ""
      ]
        .filter(Boolean)
        .join(" â€¢ ");
    }

    wrapper.append(heading, meta, detail);
    fragment.appendChild(wrapper);
  });

  elements.outboxList.appendChild(fragment);
}

function renderSummaryTable() {
  const query = (elements.teamSearch.value || "").trim().toLowerCase();
  const rows = state.teamSummary.filter((row) => {
    const pitSnapshot = buildPitSnapshot(row).toLowerCase();
    return (
      row.team_number.toString().includes(query) ||
      pitSnapshot.includes(query) ||
      (row.barge_route || "").toLowerCase().includes(query) ||
      (row.cycle_time || "").toLowerCase().includes(query) ||
      (row.scoring_speed || "").toLowerCase().includes(query) ||
      (row.intake_style || "").toLowerCase().includes(query) ||
      (row.shooter_type || "").toLowerCase().includes(query) ||
      (row.hopper_size || "").toLowerCase().includes(query) ||
      (row.climb_level || "").toLowerCase().includes(query) ||
      (row.preferred_strategy || "").toLowerCase().includes(query) ||
      (row.auto_summary || "").toLowerCase().includes(query)
    );
  });

  elements.summaryCount.textContent = `${rows.length} team${rows.length === 1 ? "" : "s"} visible`;
  elements.summaryTableBody.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.textContent = "No teams match the current filter.";
    tr.appendChild(td);
    elements.summaryTableBody.appendChild(tr);
    return;
  }

  const fragment = document.createDocumentFragment();
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const values = [
      row.team_number,
      row.matches_scouted,
      formatDecimal(row.avg_auto_fuel),
      formatDecimal(row.avg_total_fuel),
      `${formatDecimal(row.tower_success_rate)}%`,
      formatDecimal(row.avg_defense_rating),
      row.breakdown_count,
      buildPitSnapshot(row)
    ];

    values.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = String(value);
      tr.appendChild(td);
    });

    fragment.appendChild(tr);
  });

  elements.summaryTableBody.appendChild(fragment);
}

function renderFormAvailability() {
  const enabled = Boolean(state.session && getActiveEvent() && !state.isRefreshing);
  const canRetry = Boolean(state.session && state.outbox.length && !state.isRefreshing);

  if (elements.retryOutboxInline) elements.retryOutboxInline.disabled = !canRetry;
  if (elements.signOutButton) elements.signOutButton.disabled = !state.session;
  if (elements.matchSubmitButton) elements.matchSubmitButton.disabled = !enabled;
  if (elements.pitSubmitButton) elements.pitSubmitButton.disabled = !enabled;
  if (elements.exportMatchButton) elements.exportMatchButton.disabled = !state.matchEntries.length;
  if (elements.exportPitButton) elements.exportPitButton.disabled = !state.pitEntries.length;
  if (elements.exportSummaryButton) elements.exportSummaryButton.disabled = !state.teamSummary.length;
  if (elements.matchSubmitButton) {
    elements.matchSubmitButton.textContent = getEditingEntryId("match") ? "Update Match Entry" : "Submit Match Entry";
  }
  if (elements.pitSubmitButton) {
    elements.pitSubmitButton.textContent = getEditingEntryId("pit") ? "Update Pit Entry" : "Submit Pit Entry";
  }
}

function renderScoutReloadOptions() {
  renderScoutReloadSelect("match", state.matchEntries);
  renderScoutReloadSelect("pit", state.pitEntries);
}

function renderScoutReloadSelect(kind, entries) {
  const select = kind === "match" ? elements.matchEntryLoadSelect : elements.pitEntryLoadSelect;
  if (!select) return;

  const event = getActiveEvent();
  const rows = Array.isArray(entries) ? entries : [];
  const enabled = Boolean(state.session && event && !state.isRefreshing);

  select.innerHTML = "";

  const newOption = document.createElement("option");
  newOption.value = SCOUT_RELOAD_NEW_VALUE;
  newOption.textContent = `New ${kind} scout`;
  select.appendChild(newOption);

  if (enabled) {
    rows.forEach((entry) => {
      const option = document.createElement("option");
      option.value = getScoutReloadEntryValue(entry, kind);
      option.textContent = formatScoutReloadOptionLabel(entry, kind);
      select.appendChild(option);
    });
  }

  select.disabled = !enabled;
  syncScoutReloadSelect(kind);
  refreshCustomSelect(select);
}

function formatScoutReloadOptionLabel(entry, kind) {
  if (kind === "match") {
    return [
      `Team ${entry.team_number || "?"}`,
      `${entry.match_type || "Match"} ${entry.match_number || ""}`.trim(),
      entry.scout_name || "",
      formatDateTime(entry.created_at)
    ]
      .filter(Boolean)
      .join(" • ");
  }

  return [
    `Team ${entry.team_number || "?"}`,
    entry.scout_name || "",
    formatDateTime(entry.created_at)
  ]
    .filter(Boolean)
    .join(" • ");
}

function getScoutReloadEntryValue(entry, kind) {
  const fallback =
    kind === "match"
      ? `match:${entry.team_number || ""}:${entry.match_number || ""}:${entry.created_at || ""}`
      : `pit:${entry.team_number || ""}:${entry.created_at || ""}`;
  return String(entry?.id || fallback);
}

function handleScoutReload(kind) {
  const isMatch = kind === "match";
  const select = isMatch ? elements.matchEntryLoadSelect : elements.pitEntryLoadSelect;
  const messageTarget = isMatch ? elements.matchFormMessage : elements.pitFormMessage;
  const entries = isMatch ? state.matchEntries : state.pitEntries;
  const selectedValue = String(select?.value || "");

  if (!selectedValue) return;

  if (selectedValue === SCOUT_RELOAD_NEW_VALUE) {
    setScoutReloadSelection(kind, SCOUT_RELOAD_NEW_VALUE);
    clearEditingEntryId(kind);
    if (isMatch) {
      resetMatchDraft("");
    } else {
      resetPitDraft("");
    }
    setFormMessage(messageTarget, `Started a new ${kind} scout.`, "success");
    return;
  }

  const entry = entries.find((row) => getScoutReloadEntryValue(row, kind) === selectedValue);

  if (!entry) {
    resetScoutReloadSelect(kind);
    setFormMessage(messageTarget, "That scout entry is no longer available.", "warn");
    return;
  }

  setScoutReloadSelection(kind, selectedValue);
  setEditingEntryId(kind, getEntryId(entry));
  syncScoutReloadSelect(kind);
  refreshCustomSelect(select);
  setFormValues(isMatch ? elements.matchForm : elements.pitForm, isMatch ? normalizeMatchValues(entry) : normalizePitValues(entry));
  deactivateFormValidation(isMatch ? elements.matchForm : elements.pitForm);
  persistDraft(kind);

  const detail = isMatch
    ? `Team ${entry.team_number || "?"}, ${entry.match_type || "Match"} ${entry.match_number || ""}`.trim()
    : `Team ${entry.team_number || "?"}`;
  setFormMessage(messageTarget, `Loaded past ${kind} scout for ${detail}.`, "success");
}

function syncScoutReloadSelect(kind) {
  const select = kind === "match" ? elements.matchEntryLoadSelect : elements.pitEntryLoadSelect;
  if (!select) return;

  const selectedValue = getScoutReloadSelection(kind);
  const availableValues = Array.from(select.options, (option) => option.value);
  const nextValue = availableValues.includes(selectedValue) ? selectedValue : SCOUT_RELOAD_NEW_VALUE;
  setScoutReloadSelection(kind, nextValue);
  select.value = nextValue;
}

function resetScoutReloadSelect(kind) {
  setScoutReloadSelection(kind, SCOUT_RELOAD_NEW_VALUE);
  syncScoutReloadSelect(kind);
  refreshCustomSelect(kind === "match" ? elements.matchEntryLoadSelect : elements.pitEntryLoadSelect);
}

function getScoutReloadSelection(kind) {
  return state.scoutReloadSelections?.[kind] || SCOUT_RELOAD_NEW_VALUE;
}

function setScoutReloadSelection(kind, value) {
  state.scoutReloadSelections[kind] = value || SCOUT_RELOAD_NEW_VALUE;
}

function persistDraft(kind, { manual = false } = {}) {
  const isMatch = kind === "match";
  const storageKey = isMatch ? STORAGE_KEYS.matchDraft : STORAGE_KEYS.pitDraft;
  const stampKey = isMatch ? STORAGE_KEYS.matchDraftSavedAt : STORAGE_KEYS.pitDraftSavedAt;
  const form = isMatch ? elements.matchForm : elements.pitForm;
  const values = isMatch ? collectMatchValues() : collectPitValues();

  saveStoredJson(storageKey, values);
  const savedAt = new Date().toISOString();
  saveStoredValue(stampKey, savedAt);
  renderDraftStamp(kind);

  if (manual) {
    setFormMessage(
      isMatch ? elements.matchFormMessage : elements.pitFormMessage,
      "Draft saved locally on this device.",
      "success"
    );
  }
}

function renderDraftStamp(kind) {
  const isMatch = kind === "match";
  const stampKey = isMatch ? STORAGE_KEYS.matchDraftSavedAt : STORAGE_KEYS.pitDraftSavedAt;
  const stamp = loadStoredValue(stampKey, "");
  const target = isMatch ? elements.matchDraftStamp : elements.pitDraftStamp;

  if (!target) return;
  target.textContent = stamp ? `Saved ${formatTime(stamp)}` : "";
}

function resetMatchDraft(scoutName) {
  const next = { ...MATCH_DEFAULTS, scout_name: scoutName || "" };
  saveStoredJson(STORAGE_KEYS.matchDraft, next);
  removeStoredValue(STORAGE_KEYS.matchDraftSavedAt);
  clearEditingEntryId("match");
  setFormValues(elements.matchForm, next);
  resetScoutReloadSelect("match");
  deactivateFormValidation(elements.matchForm);
  renderDraftStamp("match");
}

function resetPitDraft(scoutName) {
  const next = { ...PIT_DEFAULTS, scout_name: scoutName || "" };
  saveStoredJson(STORAGE_KEYS.pitDraft, next);
  removeStoredValue(STORAGE_KEYS.pitDraftSavedAt);
  clearEditingEntryId("pit");
  setFormValues(elements.pitForm, next);
  loadAutoPathDrawing("");
  resetScoutReloadSelect("pit");
  deactivateFormValidation(elements.pitForm);
  renderDraftStamp("pit");
}

function buildMatchPayload() {
  const values = collectMatchValues();
  const shift1Alliance = getShift1Alliance(values.alliance_color, values.shift_pattern);
  return {
    event_id: state.activeEventId,
    scout_name: values.scout_name,
    team_number: toPositiveInteger(values.team_number),
    match_number: toPositiveInteger(values.match_number),
    match_type: values.match_type,
    alliance_color: values.alliance_color,
    shift_1_alliance: shift1Alliance,
    station: clampInteger(values.station, 1, 3),
    auto_fuel: toNonNegativeInteger(values.auto_fuel),
    auto_tower_result: values.auto_tower_result,
    transition_fuel: toNonNegativeInteger(values.transition_fuel),
    shift_1_fuel: normalizeShiftFuel(1, values),
    shift_2_fuel: normalizeShiftFuel(2, values),
    shift_3_fuel: normalizeShiftFuel(3, values),
    shift_4_fuel: normalizeShiftFuel(4, values),
    endgame_fuel: toNonNegativeInteger(values.endgame_fuel),
    endgame_tower_result: values.endgame_tower_result,
    defense_rating: clampInteger(values.defense_rating, 0, 5),
    penalty_count: toNonNegativeInteger(values.penalty_count),
    breakdown: Boolean(values.breakdown),
    no_show: Boolean(values.no_show),
    notes: values.notes
  };
}

function buildPitPayload() {
  const values = collectPitValues();
  return {
    event_id: state.activeEventId,
    scout_name: values.scout_name,
    team_number: toPositiveInteger(values.team_number),
    drivetrain: values.drivetrain,
    fuel_scoring_capability: values.fuel_scoring_capability,
    estimated_fuel_per_match: toNonNegativeInteger(values.estimated_fuel_per_match),
    barge_route: values.barge_route,
    auto_path_drawing: values.auto_path_drawing,
    tower_capability: "",
    cycle_time: values.cycle_time,
    scoring_speed: values.scoring_speed,
    intake_style: values.intake_style,
    shooter_type: values.shooter_type,
    hopper_size: values.hopper_size,
    climb_level: values.climb_level,
    auto_summary: values.auto_summary,
    defense_capability: values.defense_capability,
    preferred_strategy: values.preferred_strategy,
    reliability_notes: values.reliability_notes,
    notes: values.notes
  };
}

function validateMatchForm({ apply = false } = {}) {
  const form = elements.matchForm;
  const values = collectMatchValues();
  const showState = apply && isFormValidationActive(form);
  let message = "";
  let focusName = "";

  if (!state.activeEventId) {
    message = "Select an active event before scouting.";
  }

  const checkField = (name, valid, nextMessage) => {
    if (apply) {
      setFieldValidationState(form, name, valid, showState);
    }
    if (!valid && !message) {
      message = nextMessage;
      focusName = name;
    }
  };

  checkField("scout_name", Boolean(values.scout_name), "Scout name is required.");
  checkField("team_number", toPositiveInteger(values.team_number) > 0, "Enter a valid team number.");
  checkField("match_number", toPositiveInteger(values.match_number) > 0, "Enter a valid match number.");
  checkField("match_type", Boolean(values.match_type), "Match type is required.");
  checkField("alliance_color", Boolean(values.alliance_color), "Alliance color is required.");
  checkField("shift_pattern", Boolean(values.shift_pattern), "Choose the shift pattern.");
  checkField("station", ["1", "2", "3"].includes(String(values.station)), "Choose a driver station.");

  const hasObservation = hasMatchObservation(values);
  if (apply) {
    setFieldValidationState(form, "auto_tower_result", hasObservation, showState);
    setFieldValidationState(form, "endgame_tower_result", hasObservation, showState);
    setFieldValidationState(form, "defense_rating", hasObservation, showState);
    setFieldValidationState(form, "notes", hasObservation, showState);
    setToggleValidationState(form, "breakdown", hasObservation, showState);
    setToggleValidationState(form, "no_show", hasObservation, showState);
    setCounterCardsValidationState(form, hasObservation, showState);
  }

  if (!hasObservation && !message) {
    message = "Add at least one real match observation before submitting.";
    focusName = "notes";
  }

  return {
    valid: !message,
    message,
    focusName
  };
}

function validatePitForm({ apply = false } = {}) {
  const form = elements.pitForm;
  const values = collectPitValues();
  const showState = apply && isFormValidationActive(form);
  let message = "";
  let focusName = "";

  if (!state.activeEventId) {
    message = "Select an active event before scouting.";
  }

  const checkField = (name, valid, nextMessage) => {
    if (apply) {
      setFieldValidationState(form, name, valid, showState);
    }
    if (!valid && !message) {
      message = nextMessage;
      focusName = name;
    }
  };

  checkField("scout_name", Boolean(values.scout_name), "Scout name is required.");
  checkField("team_number", toPositiveInteger(values.team_number) > 0, "Enter a valid team number.");
  checkField("cycle_time", Boolean(values.cycle_time), "Add the team's cycle time.");
  checkField(
    "estimated_fuel_per_match",
    toNonNegativeInteger(values.estimated_fuel_per_match) > 0,
    "Add the team's estimated total fuel per match."
  );
  checkField(
    "scoring_speed",
    Boolean(values.scoring_speed) && values.scoring_speed !== "Unknown",
    "Choose the team's scoring speed."
  );
  checkField(
    "intake_style",
    Boolean(values.intake_style) && values.intake_style !== "Unknown",
    "Choose the team's intake style."
  );
  checkField(
    "shooter_type",
    Boolean(values.shooter_type) && values.shooter_type !== "Unknown",
    "Choose the team's shooter type."
  );
  const hasAutoDetail = hasAutoPathDrawing(values.auto_path_drawing);
  if (apply) {
    setFieldValidationState(form, "auto_path_drawing", hasAutoDetail, showState);
  }
  if (!hasAutoDetail && !message) {
    message = "Draw the team's auto path.";
    focusName = "auto_path_drawing";
  }
  checkField(
    "preferred_strategy",
    Boolean(values.preferred_strategy),
    "Add the team's preferred strategy."
  );

  return {
    valid: !message,
    message,
    focusName
  };
}

function collectMatchValues() {
  const form = elements.matchForm;
  return normalizeMatchValues({
    scout_name: readFieldValue(form, "scout_name"),
    team_number: readFieldValue(form, "team_number"),
    match_number: readFieldValue(form, "match_number"),
    match_type: readFieldValue(form, "match_type"),
    alliance_color: readRadioValue(form, "alliance_color", "Blue"),
    shift_pattern: getMatchShiftPatternValue(form),
    station: readRadioValue(form, "station", "1"),
    auto_fuel: readFieldValue(form, "auto_fuel"),
    auto_tower_result: readFieldValue(form, "auto_tower_result"),
    transition_fuel: readFieldValue(form, "transition_fuel"),
    shift_1_fuel: readFieldValue(form, "shift_1_fuel"),
    shift_2_fuel: readFieldValue(form, "shift_2_fuel"),
    shift_3_fuel: readFieldValue(form, "shift_3_fuel"),
    shift_4_fuel: readFieldValue(form, "shift_4_fuel"),
    endgame_fuel: readFieldValue(form, "endgame_fuel"),
    endgame_tower_result: readFieldValue(form, "endgame_tower_result"),
    defense_rating: readFieldValue(form, "defense_rating"),
    penalty_count: readFieldValue(form, "penalty_count"),
    breakdown: readCheckboxValue(form, "breakdown"),
    no_show: readCheckboxValue(form, "no_show"),
    notes: readFieldValue(form, "notes")
  });
}

function collectPitValues() {
  const form = elements.pitForm;
  return normalizePitValues({
    scout_name: readFieldValue(form, "scout_name"),
    team_number: readFieldValue(form, "team_number"),
    drivetrain: readFieldValue(form, "drivetrain"),
    fuel_scoring_capability: readFieldValue(form, "fuel_scoring_capability"),
    estimated_fuel_per_match: readFieldValue(form, "estimated_fuel_per_match"),
    barge_route: readFieldValue(form, "barge_route"),
    cycle_time: readFieldValue(form, "cycle_time"),
    scoring_speed: readFieldValue(form, "scoring_speed"),
    intake_style: readFieldValue(form, "intake_style"),
    shooter_type: readFieldValue(form, "shooter_type"),
    hopper_size: readFieldValue(form, "hopper_size"),
    climb_level: readFieldValue(form, "climb_level"),
    auto_summary: readFieldValue(form, "auto_summary"),
    auto_path_drawing: readFieldValue(form, "auto_path_drawing"),
    defense_capability: readFieldValue(form, "defense_capability"),
    preferred_strategy: readFieldValue(form, "preferred_strategy"),
    reliability_notes: readFieldValue(form, "reliability_notes"),
    notes: readFieldValue(form, "notes")
  });
}

function enqueueOutbox(type, payload, { targetId = "" } = {}) {
  state.outbox.unshift({
    id: createId(),
    type,
    payload,
    targetId: String(targetId || ""),
    created_at: new Date().toISOString()
  });
  saveStoredJson(STORAGE_KEYS.outbox, state.outbox);
}

async function saveMatchEntry(payload, options = {}) {
  const target = resolveMatchSaveTarget(payload, options.targetId);
  if (target.targetId) {
    const result = await updateRowWithSchemaFallback("match_scout_entries", target.targetId, payload);
    return { action: "update", targetId: target.targetId, missingColumns: result.missingColumns };
  }

  const result = await insertRowWithSchemaFallback("match_scout_entries", payload);
  return { action: "insert", targetId: "", missingColumns: result.missingColumns };
}

async function savePitEntry(payload, options = {}) {
  const target = resolvePitSaveTarget(payload, options.targetId);
  if (target.targetId) {
    const result = await updateRowWithSchemaFallback("pit_scout_entries", target.targetId, payload);
    return { action: "update", targetId: target.targetId, missingColumns: result.missingColumns };
  }

  const result = await insertRowWithSchemaFallback("pit_scout_entries", payload);
  return { action: "insert", targetId: "", missingColumns: result.missingColumns };
}

async function insertRowWithSchemaFallback(tableName, payload) {
  const legacyPayload = { ...payload };
  const missingColumns = [];

  while (true) {
    const { error } = await state.client.from(tableName).insert(legacyPayload);
    if (!error) {
      return { missingColumns };
    }

    const missingColumn = extractMissingColumnName(error, legacyPayload);
    if (!missingColumn || missingColumns.includes(missingColumn)) {
      throw error;
    }

    delete legacyPayload[missingColumn];
    missingColumns.push(missingColumn);
  }
}

async function updateRowWithSchemaFallback(tableName, rowId, payload) {
  const legacyPayload = { ...payload };
  const missingColumns = [];

  while (true) {
    const { data, error } = await state.client.from(tableName).update(legacyPayload).eq("id", rowId).select("id").maybeSingle();
    if (!error) {
      if (data?.id) {
        return { missingColumns };
      }
      throw new Error("Unable to locate the existing entry to update.");
    }

    const missingColumn = extractMissingColumnName(error, legacyPayload);
    if (!missingColumn || missingColumns.includes(missingColumn)) {
      throw error;
    }

    delete legacyPayload[missingColumn];
    missingColumns.push(missingColumn);
  }
}

function resolveMatchSaveTarget(payload, preferredTargetId = "") {
  const editingId = String(preferredTargetId || getEditingEntryId("match"));
  if (editingId) {
    return { targetId: editingId };
  }

  return { targetId: getEntryId(findExistingMatchEntry(payload)) };
}

function resolvePitSaveTarget(payload, preferredTargetId = "") {
  const editingId = String(preferredTargetId || getEditingEntryId("pit"));
  if (editingId) {
    return { targetId: editingId };
  }

  return { targetId: getEntryId(findExistingPitEntry(payload)) };
}

function findExistingMatchEntry(payload) {
  const eventId = String(payload?.event_id || "");
  const teamNumber = toPositiveInteger(payload?.team_number);
  const matchNumber = toPositiveInteger(payload?.match_number);
  const matchType = String(payload?.match_type || "");

  return (
    state.matchEntries.find((entry) => {
      return (
        String(entry?.event_id || "") === eventId &&
        toPositiveInteger(entry?.team_number) === teamNumber &&
        toPositiveInteger(entry?.match_number) === matchNumber &&
        String(entry?.match_type || "") === matchType
      );
    }) || null
  );
}

function findExistingPitEntry(payload) {
  const eventId = String(payload?.event_id || "");
  const teamNumber = toPositiveInteger(payload?.team_number);

  return (
    state.pitEntries.find((entry) => {
      return String(entry?.event_id || "") === eventId && toPositiveInteger(entry?.team_number) === teamNumber;
    }) || null
  );
}

function dedupeScoutingEntries(entries, kind) {
  const seen = new Set();
  const rows = Array.isArray(entries) ? entries : [];

  return rows.filter((entry) => {
    const key = kind === "match" ? getMatchEntryKey(entry) : getPitEntryKey(entry);
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getMatchEntryKey(entry) {
  return [
    String(entry?.event_id || ""),
    toPositiveInteger(entry?.team_number),
    String(entry?.match_type || ""),
    toPositiveInteger(entry?.match_number)
  ].join("::");
}

function getPitEntryKey(entry) {
  return [String(entry?.event_id || ""), toPositiveInteger(entry?.team_number)].join("::");
}

function getEntryId(entry) {
  return String(entry?.id || "");
}

function getEditingEntryId(kind) {
  return String(state.editingEntryIds?.[kind] || "");
}

function setEditingEntryId(kind, value) {
  state.editingEntryIds[kind] = String(value || "");
}

function clearEditingEntryId(kind) {
  setEditingEntryId(kind, "");
}

function buildTeamSummary(matchEntries, pitEntries) {
  const matchMap = new Map();
  const pitLatest = new Map();

  pitEntries.forEach((entry) => {
    if (!pitLatest.has(entry.team_number)) {
      pitLatest.set(entry.team_number, entry);
    }
  });

  matchEntries.forEach((entry) => {
    const key = entry.team_number;
    const totalFuel =
      Number(entry.auto_fuel || 0) +
      Number(entry.transition_fuel || 0) +
      Number(entry.shift_1_fuel || 0) +
      Number(entry.shift_2_fuel || 0) +
      Number(entry.shift_3_fuel || 0) +
      Number(entry.shift_4_fuel || 0) +
      Number(entry.endgame_fuel || 0);

    const summary = matchMap.get(key) || {
      event_id: entry.event_id,
      team_number: Number(entry.team_number),
      matches_scouted: 0,
      autoFuelTotal: 0,
      totalFuelTotal: 0,
      towerSuccessCount: 0,
      defenseTotal: 0,
      breakdown_count: 0
    };

    summary.matches_scouted += 1;
    summary.autoFuelTotal += Number(entry.auto_fuel || 0);
    summary.totalFuelTotal += totalFuel;
    summary.towerSuccessCount +=
      entry.auto_tower_result === "Complete" || entry.endgame_tower_result === "Complete" ? 1 : 0;
    summary.defenseTotal += Number(entry.defense_rating || 0);
    summary.breakdown_count += entry.breakdown ? 1 : 0;

    matchMap.set(key, summary);
  });

  const teamNumbers = Array.from(
    new Set([...matchMap.keys(), ...pitLatest.keys()].map((value) => Number(value)))
  ).sort((left, right) => left - right);

  return teamNumbers.map((teamNumber) => {
    const matchSummary = matchMap.get(teamNumber);
    const pit = pitLatest.get(teamNumber);
    const matches = matchSummary?.matches_scouted || 0;

    return {
      event_id: state.activeEventId,
      team_number: teamNumber,
      matches_scouted: matches,
      avg_auto_fuel: matches ? roundToTwo(matchSummary.autoFuelTotal / matches) : 0,
      avg_total_fuel: matches ? roundToTwo(matchSummary.totalFuelTotal / matches) : 0,
      tower_success_rate: matches ? roundToTwo((matchSummary.towerSuccessCount / matches) * 100) : 0,
      avg_defense_rating: matches ? roundToTwo(matchSummary.defenseTotal / matches) : 0,
      breakdown_count: matchSummary?.breakdown_count || 0,
      drivetrain: pit?.drivetrain || "",
      fuel_scoring_capability: pit?.fuel_scoring_capability || "",
      estimated_fuel_per_match: Number(pit?.estimated_fuel_per_match || 0),
      barge_route: pit?.barge_route || "",
      cycle_time: pit?.cycle_time || "",
      scoring_speed: pit?.scoring_speed || "",
      intake_style: pit?.intake_style || "",
      shooter_type: pit?.shooter_type || "",
      hopper_size: pit?.hopper_size || "",
      climb_level: pit?.climb_level || "",
      auto_summary: pit?.auto_summary || "",
      defense_capability: pit?.defense_capability || "",
      preferred_strategy: pit?.preferred_strategy || "",
      reliability_notes: pit?.reliability_notes || "",
      pit_notes: pit?.notes || ""
    };
  });
}

function normalizeSummaryRow(row) {
  return {
    event_id: row.event_id,
    team_number: Number(row.team_number),
    matches_scouted: Number(row.matches_scouted || 0),
    avg_auto_fuel: Number(row.avg_auto_fuel || 0),
    avg_total_fuel: Number(row.avg_total_fuel || 0),
    tower_success_rate: Number(row.tower_success_rate || 0),
    avg_defense_rating: Number(row.avg_defense_rating || 0),
    breakdown_count: Number(row.breakdown_count || 0),
    drivetrain: row.drivetrain || "",
    fuel_scoring_capability: row.fuel_scoring_capability || "",
    estimated_fuel_per_match: Number(row.estimated_fuel_per_match || 0),
    barge_route: row.barge_route || "",
    cycle_time: row.cycle_time || "",
    scoring_speed: row.scoring_speed || "",
    intake_style: row.intake_style || "",
    shooter_type: row.shooter_type || "",
    hopper_size: row.hopper_size || "",
    climb_level: row.climb_level || "",
    auto_summary: row.auto_summary || "",
    defense_capability: row.defense_capability || "",
    preferred_strategy: row.preferred_strategy || "",
    reliability_notes: row.reliability_notes || "",
    pit_notes: row.pit_notes || ""
  };
}

function buildPitSnapshot(row) {
  const snapshot = [
    row.drivetrain,
    row.shooter_type,
    row.intake_style,
    row.estimated_fuel_per_match ? `Fuel ${row.estimated_fuel_per_match}/match` : "",
    row.barge_route && row.barge_route !== "Unknown" ? `Barge ${row.barge_route}` : "",
    row.cycle_time ? `Cycle ${row.cycle_time}` : "",
    row.scoring_speed,
    row.climb_level ? `Climb ${row.climb_level}` : "",
    row.hopper_size ? `Hopper ${row.hopper_size}` : ""
  ]
    .filter((value) => value && value !== "Unknown")
    .join(" • ");

  return snapshot || "No pit data";
}

function exportMatchCsv() {
  if (!state.matchEntries.length) {
    setAppMessage("No match entries are loaded for export.", "warn");
    return;
  }

  const rows = state.matchEntries.map((entry) => ({
    event_id: entry.event_id,
    team_number: entry.team_number,
    match_number: entry.match_number,
    match_type: entry.match_type,
    alliance_color: entry.alliance_color,
    shift_1_alliance: entry.shift_1_alliance,
    station: entry.station,
    scout_name: entry.scout_name,
    auto_fuel: entry.auto_fuel,
    auto_tower_result: entry.auto_tower_result,
    transition_fuel: entry.transition_fuel,
    shift_1_fuel: entry.shift_1_fuel,
    shift_2_fuel: entry.shift_2_fuel,
    shift_3_fuel: entry.shift_3_fuel,
    shift_4_fuel: entry.shift_4_fuel,
    endgame_fuel: entry.endgame_fuel,
    endgame_tower_result: entry.endgame_tower_result,
    defense_rating: entry.defense_rating,
    penalty_count: entry.penalty_count,
    breakdown: entry.breakdown,
    no_show: entry.no_show,
    notes: entry.notes,
    created_at: entry.created_at
  }));

  downloadCsv(`${buildExportPrefix()}-matches.csv`, rows);
}

function exportPitCsv() {
  if (!state.pitEntries.length) {
    setAppMessage("No pit entries are loaded for export.", "warn");
    return;
  }

  const rows = state.pitEntries.map((entry) => ({
    event_id: entry.event_id,
    team_number: entry.team_number,
    scout_name: entry.scout_name,
    drivetrain: entry.drivetrain,
    fuel_scoring_capability: entry.fuel_scoring_capability,
    estimated_fuel_per_match: Number(entry.estimated_fuel_per_match || 0),
    barge_route: entry.barge_route,
    cycle_time: entry.cycle_time,
    scoring_speed: entry.scoring_speed,
    intake_style: entry.intake_style,
    shooter_type: entry.shooter_type,
    hopper_size: entry.hopper_size,
    climb_level: entry.climb_level,
    auto_summary: entry.auto_summary,
    defense_capability: entry.defense_capability,
    preferred_strategy: entry.preferred_strategy,
    reliability_notes: entry.reliability_notes,
    notes: entry.notes,
    created_at: entry.created_at
  }));

  downloadCsv(`${buildExportPrefix()}-pits.csv`, rows);
}

function exportSummaryCsv() {
  if (!state.teamSummary.length) {
    setAppMessage("No summary data is loaded for export.", "warn");
    return;
  }

  const rows = state.teamSummary.map((row) => ({
    event_id: row.event_id,
    team_number: row.team_number,
    matches_scouted: row.matches_scouted,
    avg_auto_fuel: row.avg_auto_fuel,
    avg_total_fuel: row.avg_total_fuel,
    tower_success_rate: row.tower_success_rate,
    avg_defense_rating: row.avg_defense_rating,
    breakdown_count: row.breakdown_count,
    drivetrain: row.drivetrain,
    fuel_scoring_capability: row.fuel_scoring_capability,
    estimated_fuel_per_match: row.estimated_fuel_per_match,
    barge_route: row.barge_route,
    cycle_time: row.cycle_time,
    scoring_speed: row.scoring_speed,
    intake_style: row.intake_style,
    shooter_type: row.shooter_type,
    hopper_size: row.hopper_size,
    climb_level: row.climb_level,
    auto_summary: row.auto_summary,
    defense_capability: row.defense_capability,
    preferred_strategy: row.preferred_strategy,
    reliability_notes: row.reliability_notes,
    pit_notes: row.pit_notes
  }));

  downloadCsv(`${buildExportPrefix()}-summary.csv`, rows);
}

function downloadCsv(filename, rows) {
  const csv = toCsv(rows);
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(","))
  ];
  return lines.join("\n");
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value).replace(/"/g, "\"\"");
  return /[",\n]/.test(stringValue) ? `"${stringValue}"` : stringValue;
}

function readOAuthErrorFromUrl() {
  const url = new URL(window.location.href);
  const errorDescription = url.searchParams.get("error_description");
  const message = url.searchParams.get("message");
  const authError = errorDescription || message;
  if (!authError) return;

  state.pendingAuthMessage = authError;
  state.pendingAuthTone = "danger";
}

function normalizeConfig(rawConfig) {
  return {
    supabaseUrl: String(rawConfig.supabaseUrl || "").trim(),
    supabaseAnonKey: String(rawConfig.supabaseAnonKey || "").trim(),
    allowedEmailDomain: String(rawConfig.allowedEmailDomain || "team10312.com")
      .trim()
      .replace(/^@/, "")
      .toLowerCase()
  };
}

function configReady() {
  return (
    Boolean(state.config?.supabaseUrl) &&
    !state.config.supabaseUrl.includes("YOUR-PROJECT") &&
    Boolean(state.config?.supabaseAnonKey) &&
    !state.config.supabaseAnonKey.includes("YOUR-PUBLIC-ANON-KEY")
  );
}

function isAllowedEmail(email) {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${state.config.allowedEmailDomain}`);
}

function getSessionEmail(session) {
  return String(session?.user?.email || "").trim().toLowerCase();
}

function getActiveEvent() {
  return state.events.find((event) => event.id === state.activeEventId) || null;
}

function getEventName(eventId) {
  return state.events.find((event) => event.id === eventId)?.name || "Unknown event";
}

function buildExportPrefix() {
  const event = getActiveEvent();
  return event?.slug || event?.event_code?.toLowerCase() || "scouting-export";
}

function setStatusPill(target, text, tone = "") {
  if (!target) return;
  target.textContent = text;
  target.classList.remove("is-success", "is-warn", "is-danger");
  if (tone) {
    target.classList.add(`is-${tone}`);
  }
}

function setAuthMessage(text = "", tone = "") {
  setMessage(elements.authMessage, text, tone);
}

function setAppMessage(text = "", tone = "") {
  setMessage(elements.appMessage, text, tone);
}

function setFormMessage(target, text = "", tone = "") {
  setMessage(target, text, tone);
}

function setMessage(target, text = "", tone = "") {
  if (!target) return;
  target.textContent = text;
  target.classList.remove("is-success", "is-warn", "is-danger");
  if (tone) target.classList.add(`is-${tone}`);
}

function setFormValues(form, values) {
  if (!form) return;
  Object.entries(values).forEach(([name, value]) => {
    const fields = form.querySelectorAll(`[name="${name}"]`);
    if (!fields.length) return;

    if (fields[0].type === "radio") {
      fields.forEach((field) => {
        field.checked = String(field.value) === String(value);
      });
      return;
    }

    if (fields[0].type === "checkbox") {
      fields[0].checked = Boolean(value);
      return;
    }

    if (fields[0].tagName === "SELECT") {
      fields[0].value = String(value ?? "");
      syncCustomSelect(fields[0]);
      return;
    }

    fields[0].value = String(value ?? "");
  });

  if (form === elements.matchForm) {
    updateShiftFieldAvailability();
  } else if (form === elements.pitForm) {
    syncAutoPathBoardFromField();
  }
}

function bindFormValidation(form, kind) {
  if (!form) return;

  const validate = () => {
    if (!isFormValidationActive(form)) return;
    if (kind === "match") validateMatchForm({ apply: true });
    else validatePitForm({ apply: true });
  };

  form.addEventListener("input", validate);
  form.addEventListener("change", validate);
}

function activateFormValidation(form) {
  if (!form) return;
  form.dataset.validationActive = "true";
}

function deactivateFormValidation(form) {
  if (!form) return;
  delete form.dataset.validationActive;
  clearValidationState(form);
}

function isFormValidationActive(form) {
  return form?.dataset.validationActive === "true";
}

function clearValidationState(form) {
  if (!form) return;
  form
    .querySelectorAll(".field, .counter-card, .toggle-card")
    .forEach((target) => target.classList.remove("is-valid", "is-invalid"));
}

function setValidationState(target, valid, active) {
  if (!target) return;
  target.classList.remove("is-valid", "is-invalid");
  if (!active) return;
  target.classList.add(valid ? "is-valid" : "is-invalid");
}

function getFieldContainer(form, name) {
  const field = form?.querySelector(`[name="${name}"]`);
  return field?.closest(".field") || null;
}

function setFieldValidationState(form, name, valid, active) {
  setValidationState(getFieldContainer(form, name), valid, active);
}

function setToggleValidationState(form, name, valid, active) {
  const toggle = form?.querySelector(`[name="${name}"]`)?.closest(".toggle-card");
  setValidationState(toggle, valid, active);
}

function setCounterCardsValidationState(form, valid, active) {
  form?.querySelectorAll(".counter-card").forEach((card) => {
    setValidationState(card, valid, active);
  });
}

function focusFormValidationTarget(form, name) {
  if (!name) return;

  if (name === "shift_pattern" && elements.shiftPatternToggle) {
    elements.shiftPatternToggle.focus();
    return;
  }

  const field = form?.querySelector(`[name="${name}"]`);
  if (!field) return;

  if (field.tagName === "SELECT") {
    customSelectRegistry.get(field)?.trigger?.focus();
    return;
  }

  if (field.type === "radio" || field.type === "checkbox") {
    field.focus();
    return;
  }

  field.focus();
}

function hasMeaningfulText(value, minLength = 6) {
  return String(value || "").trim().length >= minLength;
}

function hasAutoPathDrawing(serialized) {
  return parseAutoPathDrawing(serialized).length > 0;
}

function hasMatchObservation(values) {
  const numericObservationFields = [
    "auto_fuel",
    "transition_fuel",
    "shift_1_fuel",
    "shift_2_fuel",
    "shift_3_fuel",
    "shift_4_fuel",
    "endgame_fuel",
    "penalty_count"
  ];

  if (numericObservationFields.some((field) => toNonNegativeInteger(values[field]) > 0)) {
    return true;
  }

  if (values.auto_tower_result !== "None" || values.endgame_tower_result !== "None") {
    return true;
  }

  if (clampInteger(values.defense_rating, 0, 5) !== MATCH_DEFAULTS.defense_rating) {
    return true;
  }

  if (values.breakdown || values.no_show) {
    return true;
  }

  return hasMeaningfulText(values.notes, 6);
}

function readFieldValue(form, name) {
  const field = form?.elements?.namedItem(name);
  if (!field) return "";
  return typeof field.value === "string" ? field.value.trim() : "";
}

function readRadioValue(form, name, fallback = "") {
  const selected = form?.querySelector(`[name="${name}"]:checked`);
  return selected ? selected.value : fallback;
}

function readCheckboxValue(form, name) {
  const field = form?.querySelector(`[name="${name}"]`);
  return Boolean(field?.checked);
}

function normalizeMatchValues(values) {
  const allianceColor = normalizeAllianceColor(values.alliance_color ?? MATCH_DEFAULTS.alliance_color);
  const shiftPattern = normalizeShiftPattern(
    values.shift_pattern,
    values.shift_1_alliance,
    allianceColor
  );

  return {
    ...MATCH_DEFAULTS,
    ...values,
    scout_name: String(values.scout_name ?? MATCH_DEFAULTS.scout_name).trim(),
    team_number: normalizeNumericDraftValue(values.team_number),
    match_number: normalizeNumericDraftValue(values.match_number),
    alliance_color: allianceColor,
    shift_pattern: shiftPattern,
    station: String(values.station ?? MATCH_DEFAULTS.station),
    auto_fuel: toNonNegativeInteger(values.auto_fuel),
    transition_fuel: toNonNegativeInteger(values.transition_fuel),
    shift_1_fuel: toNonNegativeInteger(values.shift_1_fuel),
    shift_2_fuel: toNonNegativeInteger(values.shift_2_fuel),
    shift_3_fuel: toNonNegativeInteger(values.shift_3_fuel),
    shift_4_fuel: toNonNegativeInteger(values.shift_4_fuel),
    endgame_fuel: toNonNegativeInteger(values.endgame_fuel),
    defense_rating: clampInteger(values.defense_rating, 0, 5),
    penalty_count: toNonNegativeInteger(values.penalty_count),
    breakdown: Boolean(values.breakdown),
    no_show: Boolean(values.no_show),
    notes: String(values.notes ?? "").trim()
  };
}

function normalizePitValues(values) {
  return {
    ...PIT_DEFAULTS,
    ...values,
    scout_name: String(values.scout_name ?? PIT_DEFAULTS.scout_name).trim(),
    team_number: normalizeNumericDraftValue(values.team_number),
    drivetrain: String(values.drivetrain ?? PIT_DEFAULTS.drivetrain).trim(),
    fuel_scoring_capability: String(
      values.fuel_scoring_capability ?? PIT_DEFAULTS.fuel_scoring_capability
    ).trim(),
    estimated_fuel_per_match: normalizeNumericDraftValue(values.estimated_fuel_per_match),
    barge_route: String(values.barge_route ?? PIT_DEFAULTS.barge_route).trim() || PIT_DEFAULTS.barge_route,
    cycle_time: String(values.cycle_time ?? "").trim(),
    scoring_speed: String(values.scoring_speed ?? PIT_DEFAULTS.scoring_speed).trim(),
    intake_style: String(values.intake_style ?? PIT_DEFAULTS.intake_style).trim(),
    shooter_type: String(values.shooter_type ?? PIT_DEFAULTS.shooter_type).trim(),
    hopper_size: String(values.hopper_size ?? "").trim(),
    climb_level: String(values.climb_level ?? "").trim(),
    auto_summary: String(values.auto_summary ?? "").trim(),
    auto_path_drawing: String(values.auto_path_drawing ?? ""),
    defense_capability: String(values.defense_capability ?? PIT_DEFAULTS.defense_capability).trim(),
    preferred_strategy: String(values.preferred_strategy ?? "").trim(),
    reliability_notes: String(values.reliability_notes ?? "").trim(),
    notes: String(values.notes ?? "").trim()
  };
}

function normalizeNumericDraftValue(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(Math.max(0, Number(value) || 0));
}

function toPositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toNonNegativeInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeAllianceColor(value) {
  return String(value || "").trim().toLowerCase() === "red" ? "Red" : "Blue";
}

function normalizeShiftPattern(value, legacyShift1Alliance, allianceColor) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "alternate") return "alternate";
  if (normalized === "team") return "team";

  if (legacyShift1Alliance) {
    return normalizeAllianceColor(legacyShift1Alliance) === allianceColor ? "team" : "alternate";
  }

  return MATCH_DEFAULTS.shift_pattern;
}

function getOpposingAlliance(allianceColor) {
  return normalizeAllianceColor(allianceColor) === "Red" ? "Blue" : "Red";
}

function getMatchShiftPatternValue(form = elements.matchForm) {
  const hiddenField = form?.querySelector('[name="shift_pattern"]');
  if (hiddenField) {
    return normalizeShiftPattern(hiddenField.value);
  }

  return normalizeShiftPattern(readRadioValue(form, "shift_pattern", MATCH_DEFAULTS.shift_pattern));
}

function setMatchShiftPatternValue(value, { dispatch = false } = {}) {
  const normalized = normalizeShiftPattern(value);

  if (elements.shiftPatternInput) {
    elements.shiftPatternInput.value = normalized;
  }

  syncShiftPatternToggle(normalized);

  if (dispatch && elements.shiftPatternInput) {
    elements.shiftPatternInput.dispatchEvent(new Event("input", { bubbles: true }));
    elements.shiftPatternInput.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return normalized;
}

function syncShiftPatternToggle(value = getMatchShiftPatternValue(elements.matchForm)) {
  if (!elements.shiftPatternToggle) return;

  const isAlternate = normalizeShiftPattern(value) === "alternate";
  elements.shiftPatternToggle.classList.toggle("is-active", isAlternate);
  elements.shiftPatternToggle.setAttribute("aria-pressed", isAlternate ? "true" : "false");
}

function getShift1Alliance(allianceColor, shiftPattern) {
  const selectedAlliance = normalizeAllianceColor(allianceColor);
  return shiftPattern === "alternate" ? getOpposingAlliance(selectedAlliance) : selectedAlliance;
}

function isTrackedShift(shiftNumber, shiftPattern) {
  const startOnTeam = normalizeShiftPattern(shiftPattern) === "team";
  return shiftNumber % 2 === 1 ? startOnTeam : !startOnTeam;
}

function updateShiftFieldAvailability() {
  if (!elements.matchForm) return;

  const shiftPattern = getMatchShiftPatternValue(elements.matchForm);
  const selectedAlliance = readRadioValue(elements.matchForm, "alliance_color", MATCH_DEFAULTS.alliance_color);
  const shift1Alliance = getShift1Alliance(selectedAlliance, shiftPattern);
  let valuesChanged = false;

  syncShiftPatternToggle(shiftPattern);

  [1, 2, 3, 4].forEach((shiftNumber) => {
    const active = isTrackedShift(shiftNumber, shiftPattern);
    const shiftAlliance = shiftNumber % 2 === 1 ? shift1Alliance : getOpposingAlliance(shift1Alliance);
    const card = elements.matchForm.querySelector(`[data-shift-card="${shiftNumber}"]`);
    const label = document.getElementById(`shift-${shiftNumber}-label`);
    const note = document.getElementById(`shift-${shiftNumber}-note`);
    const input = document.getElementById(`match-shift_${shiftNumber}_fuel`);
    const buttons = elements.matchForm.querySelectorAll(
      `[data-counter-target="match-shift_${shiftNumber}_fuel"]`
    );

    if (label) label.textContent = `Shift ${shiftNumber} · ${shiftAlliance}`;
    if (note) note.textContent = active ? "Your scoring shift" : "Opposing scoring shift";
    if (card) card.classList.toggle("counter-card--disabled", !active);

    if (input) {
      input.disabled = !active;
      if (!active && Number(input.value || 0) !== 0) {
        input.value = "0";
        valuesChanged = true;
      }
    }

    buttons.forEach((button) => {
      button.disabled = !active;
    });
  });

  if (valuesChanged) {
    saveStoredJson(STORAGE_KEYS.matchDraft, collectMatchValues());
  }
}

function normalizeShiftFuel(shiftNumber, values) {
  const fieldName = `shift_${shiftNumber}_fuel`;
  if (!isTrackedShift(shiftNumber, values.shift_pattern)) return 0;
  return toNonNegativeInteger(values[fieldName]);
}

function clampInteger(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function roundToTwo(value) {
  return Math.round(value * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function compareNullableNumbers(left, right) {
  const leftValue = Number.isFinite(Number(left)) ? Number(left) : Number.POSITIVE_INFINITY;
  const rightValue = Number.isFinite(Number(right)) ? Number(right) : Number.POSITIVE_INFINITY;
  return leftValue - rightValue;
}

function formatPercentage(value, precision = 0) {
  if (!Number.isFinite(Number(value))) return "--";
  return `${(Number(value) * 100).toFixed(precision).replace(/\.0$/, "")}%`;
}

function formatRecord(record) {
  if (!record) return "No record";
  return `${record.wins || 0}-${record.losses || 0}-${record.ties || 0}`;
}

function formatRecordCompact(record) {
  if (!record) return "--";
  return `${record.wins || 0}-${record.losses || 0}-${record.ties || 0}`;
}

function getRecordMatchesPlayed(record) {
  if (!record) return "--";
  if (Number.isFinite(Number(record.count))) {
    return Number(record.count);
  }
  const wins = Number(record.wins || 0);
  const losses = Number(record.losses || 0);
  const ties = Number(record.ties || 0);
  return wins + losses + ties;
}

function formatDecimal(value) {
  return Number(value || 0).toFixed(1).replace(/\.0$/, "");
}

function formatNullableDecimal(value) {
  return Number.isFinite(Number(value)) ? formatDecimal(value) : "--";
}

function formatNullableFixedDecimal(value, digits = 2) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toFixed(digits) : "--";
}

function capitalizeFirst(value) {
  const text = String(value || "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return "";
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  if (start && end) {
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }

  return (start || end)?.toLocaleDateString() || "";
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeError(error, fallback) {
  return String(error?.message || fallback).trim();
}

function shouldQueueSyncError(error) {
  const message = normalizeError(error, "").toLowerCase();
  return (
    !message ||
    message.includes("offline") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("timed out")
  );
}

function isUniqueConflictError(error) {
  return error?.code === "23505";
}

function extractMissingColumnName(error, payload) {
  const message = normalizeError(error, "");
  const patterns = [
    /could not find the ['"]([^'"]+)['"] column/i,
    /column ['"]([^'"]+)['"] of relation/i,
    /column ['"]([^'"]+)['"] does not exist/i,
    /unknown column ['"]([^'"]+)['"]/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    const columnName = match?.[1];
    if (columnName && Object.prototype.hasOwnProperty.call(payload, columnName)) {
      return columnName;
    }
  }

  return "";
}

function loadStoredValue(key, fallback = "") {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function saveStoredValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // ignore storage failures
  }
}

function removeStoredValue(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    // ignore storage failures
  }
}

function loadStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function saveStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // ignore storage failures
  }
}
