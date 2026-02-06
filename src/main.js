import buildConfig from "../buildConfig.json";
import { createGame, getCardTypeKeyForMultiplier } from "./game/game.js";
import { ControlPanel } from "./controlPanel/controlPanel.js";
import { ServerRelay } from "./serverRelay.js";
import { createServer } from "./server/server.js";
import localConfig from "./gameConfig.json";
import { getFileExtension, resolveAssetFromGlob } from "./game/assetResolver.js";

const SOUND_MODULES = import.meta.glob("../assets/sounds/*.*", { eager: true });
const SOUND_EXTENSION = getFileExtension("sounds", ".wav");
const tileTapDownSoundUrl = resolveAssetFromGlob(
  SOUND_MODULES,
  "TileTapDown",
  {
    extension: SOUND_EXTENSION,
    fallbackExtension: ".wav",
  }
);
const tileFlipSoundUrl = resolveAssetFromGlob(SOUND_MODULES, "TileFlip", {
  extension: SOUND_EXTENSION,
  fallbackExtension: ".wav",
});
const tileHoverSoundUrl = resolveAssetFromGlob(SOUND_MODULES, "TileHover", {
  extension: SOUND_EXTENSION,
  fallbackExtension: ".wav",
});
const roundWinSoundUrl = resolveAssetFromGlob(SOUND_MODULES, "Win", {
  extension: SOUND_EXTENSION,
  fallbackExtension: ".wav",
});
const roundLostSoundUrl = resolveAssetFromGlob(SOUND_MODULES, "Lost", {
  extension: SOUND_EXTENSION,
  fallbackExtension: ".wav",
});

/* Build Log */
const localGameName = localConfig?.app?.gameName ?? "Unknown";
const buildId = buildConfig?.buildId ?? "0.0.0";
const buildDate = buildConfig?.buildDate ?? "Unknown";
const buildEnvironment = buildConfig?.environment ?? "Production";

console.info(`🎮 Game: ${localGameName}`);
console.info(`🚀 Build: ${buildId}`);
console.info(`📅 Date: ${buildDate}`);
console.info(`🌐 Environment: ${buildEnvironment}`);

async function loadRuntimeConfig() {
  const fallback = localConfig ?? {};
  const configPath = `${import.meta.env.BASE_URL ?? "/"}gameConfig.json`;
  const configUrl = new URL(configPath, window.location.origin).toString();

  try {
    const response = await fetch(configUrl, { cache: "no-store" });

    if (!response.ok) {
      console.warn(
        `[CONFIG] Failed to load runtime config from ${configUrl}. Using bundled defaults.`
      );
      return fallback;
    }

    const runtimeConfig = await response.json();
    return runtimeConfig ?? fallback;
  } catch (error) {
    console.warn(
      `[CONFIG] Error while loading runtime config from ${configUrl}. Using bundled defaults.`,
      error
    );
    return fallback;
  }
}

async function startApp(config) {
  const CONFIG = config ?? {};
const APP_CONFIG = CONFIG.app ?? {};
const GAMEPLAY_CONFIG = CONFIG.gameplay ?? {};
const GRID_CONFIG = GAMEPLAY_CONFIG.grid ?? {};
const HOVER_CONFIG = GAMEPLAY_CONFIG.hover ?? {};
const CARD_CONFIG = GAMEPLAY_CONFIG.card ?? {};

const GAME_NAME =
  typeof APP_CONFIG.gameName === "string" && APP_CONFIG.gameName.trim()
    ? APP_CONFIG.gameName
    : "Flip Cards - Gems";
const GRID_ROWS = Math.max(
  1,
  Number.isFinite(GRID_CONFIG.rows)
    ? GRID_CONFIG.rows
    : Number.isFinite(GAMEPLAY_CONFIG.gridSize)
    ? GAMEPLAY_CONFIG.gridSize
    : 3
);
const GRID_COLUMNS = Math.max(
  1,
  Number.isFinite(GRID_CONFIG.columns)
    ? GRID_CONFIG.columns
    : Number.isFinite(GAMEPLAY_CONFIG.gridSize)
    ? GAMEPLAY_CONFIG.gridSize
    : 3
);
let currentGridRows = GRID_ROWS;
let currentGridColumns = GRID_COLUMNS;
const cardIconType =
  CARD_CONFIG.iconType === "animated" || CARD_CONFIG.iconType === "static"
    ? CARD_CONFIG.iconType
    : "static";
const cardIconScale = Number.isFinite(CARD_CONFIG.iconScale)
  ? CARD_CONFIG.iconScale
  : 1.0;
const cardIconOffsetX = Number.isFinite(CARD_CONFIG.iconOffsetX)
  ? CARD_CONFIG.iconOffsetX
  : 0;
const cardIconOffsetY = Number.isFinite(CARD_CONFIG.iconOffsetY)
  ? CARD_CONFIG.iconOffsetY
  : -5;
const cardSpritesheetAnimationSpeed = Number.isFinite(
  CARD_CONFIG.spritesheetAnimationSpeed
)
  ? CARD_CONFIG.spritesheetAnimationSpeed
  : 0.14;
const cardMatchShake =
  typeof CARD_CONFIG.matchShake === "boolean" ? CARD_CONFIG.matchShake : true;
const hoverEnabled =
  typeof HOVER_CONFIG.enabled === "boolean" ? HOVER_CONFIG.enabled : true;
const hoverEnterDuration = Number.isFinite(HOVER_CONFIG.enterDuration)
  ? HOVER_CONFIG.enterDuration
  : 120;
const hoverExitDuration = Number.isFinite(HOVER_CONFIG.exitDuration)
  ? HOVER_CONFIG.exitDuration
  : 200;

let game;
let controlPanel;
let demoMode = true;
const serverRelay = new ServerRelay();
let serverUI = null;
let suppressRelay = false;
let betButtonMode = "bet";
let roundActive = false;
let cashoutAvailable = false;
let lastKnownGameState = null;
let selectionDelayHandle = null;
let selectionPending = false;
let minesSelectionLocked = false;
let controlPanelMode = "manual";
let autoRunActive = false;
let autoRoundInProgress = false;
let autoResetTimer = null;
let autoStopPending = false;
let autoRemainingBets = 0;
let manualRoundNeedsReset = false;

let availableCardTypes = [];
let currentBetResult = null;
const currentRoundAssignments = new Map();

let totalProfitMultiplierValue = 1;
let totalProfitAmountDisplayValue = "0.00000000";

const AUTO_RESET_DELAY_MS = 1000;
let autoResetDelayMs = AUTO_RESET_DELAY_MS;

function withRelaySuppressed(callback) {
  suppressRelay = true;
  try {
    return callback?.();
  } finally {
    suppressRelay = false;
  }
}

function coerceNumericValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }
  if (value != null) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function setTotalProfitMultiplierValue(value) {
  const numeric = coerceNumericValue(value);
  const normalized = numeric != null && numeric > 0 ? numeric : 1;
  totalProfitMultiplierValue = normalized;
  controlPanel?.setTotalProfitMultiplier?.(normalized);
}

function normalizeTotalProfitAmount(value) {
  const numeric = coerceNumericValue(value);
  if (numeric != null) {
    const clamped = Math.max(0, numeric);
    return clamped.toFixed(8);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "0.00000000";
}

function setTotalProfitAmountValue(value) {
  const normalized = normalizeTotalProfitAmount(value);
  totalProfitAmountDisplayValue = normalized;
  controlPanel?.setProfitValue?.(normalized);
  const numeric = coerceNumericValue(normalized);
  game?.setWinPopupAmount?.(numeric != null ? numeric : 0);
}

function sendRelayMessage(type, payload = {}) {
  if (demoMode || suppressRelay) {
    return;
  }
  serverRelay.send(type, payload);
}

function setDemoMode(value) {
  const next = Boolean(value);
  if (demoMode === next) {
    serverRelay.setDemoMode(next);
    serverUI?.setDemoMode?.(next);
    return;
  }

  demoMode = next;
  serverRelay.setDemoMode(next);
  serverUI?.setDemoMode?.(next);

  if (demoMode) {
    clearSelectionDelay();
  }
}

function applyServerReveal(payload = {}) {
  clearSelectionDelay();
  selectionPending = false;
  const contentKey = payload?.contentKey ?? payload?.result ?? null;
  if (typeof payload?.row === "number" && typeof payload?.col === "number") {
    currentRoundAssignments.set(
      getCardKey(payload.row, payload.col),
      contentKey
    );
  }
  game?.revealSelectedCard?.(contentKey);
}

function applyAutoResultsFromServer(results = []) {
  clearSelectionDelay();
  selectionPending = false;
  if (!Array.isArray(results) || results.length === 0) {
    return;
  }
  results.forEach((entry) => {
    if (typeof entry?.row === "number" && typeof entry?.col === "number") {
      currentRoundAssignments.set(
        getCardKey(entry.row, entry.col),
        entry.contentKey ?? entry.result ?? null
      );
    }
  });
  game?.revealAutoSelections?.(results);
}

const serverMount =
  document.querySelector(".app-wrapper") ?? document.body;
serverUI = createServer(serverRelay, {
  mount: serverMount,
  onDemoModeToggle: (value) => setDemoMode(value),
  initialDemoMode: demoMode,
  initialHidden: true,
  onVisibilityChange: (isVisible) => {
    controlPanel?.setServerPanelVisibility?.(isVisible);
  },
});
controlPanel?.setServerPanelVisibility?.(
  serverUI?.isVisible?.() ?? false
);
serverRelay.setDemoMode(demoMode);

serverRelay.addEventListener("incoming", (event) => {
  const { type, payload } = event.detail ?? {};
  withRelaySuppressed(() => {
    switch (type) {
      case "start-bet":
        performBet();
        setControlPanelRandomState(true);
        break;
      case "bet-result":
        applyServerReveal(payload);
        break;
      case "auto-bet-result":
        applyAutoResultsFromServer(payload?.results);
        break;
      case "stop-autobet":
        stopAutoBetProcess({
          reason: typeof payload?.reason === "string" ? payload.reason : "user",
          completed: Boolean(payload?.completed),
        });
        break;
      case "finalize-bet":
        finalizeRound();
        break;
      case "cashout":
        if (roundActive && cashoutAvailable) {
          handleCashout();
        }
        break;
      case "profit:update-multiplier": {
        const incomingValue =
          payload?.numericValue ?? payload?.value ?? null;
        setTotalProfitMultiplierValue(incomingValue);
        break;
      }
      case "profit:update-total": {
        const incomingValue =
          payload?.numericValue ?? payload?.value ?? null;
        setTotalProfitAmountValue(incomingValue);
        break;
      }
      default:
        break;
    }
  });
});

serverRelay.addEventListener("demomodechange", (event) => {
  const value = Boolean(event.detail?.value);
  if (demoMode === value) {
    return;
  }
  demoMode = value;
  serverUI?.setDemoMode?.(value);
  if (demoMode) {
    clearSelectionDelay();
  }
});

function setControlPanelBetMode(mode) {
  const normalized =
    mode === "cashout" ? "cashout" : mode === "scratch" ? "scratch" : "bet";
  betButtonMode = normalized;
  controlPanel?.setBetButtonMode?.(betButtonMode);
}

function setControlPanelBetState(isClickable) {
  controlPanel?.setBetButtonState?.(
    isClickable ? "clickable" : "non-clickable"
  );
}

function setControlPanelRandomState(isClickable) {
  controlPanel?.setRandomPickState?.(
    isClickable ? "clickable" : "non-clickable"
  );
}

function setControlPanelAutoStartState(isClickable) {
  controlPanel?.setAutoStartButtonState?.(
    isClickable ? "clickable" : "non-clickable"
  );
}

function setControlPanelMinesState(isClickable) {
  controlPanel?.setMinesSelectState?.(
    isClickable ? "clickable" : "non-clickable"
  );
}

function setControlPanelLoadingState(isLoading) {
  if (!controlPanel) {
    return;
  }

  if (isLoading) {
    setControlPanelBetState(false);
    setControlPanelRandomState(false);
    setControlPanelAutoStartState(false);
    setControlPanelMinesState(false);
    controlPanel.setModeToggleClickable?.(false);
    controlPanel.setBetControlsClickable?.(false);
    controlPanel.setNumberOfBetsClickable?.(false);
    controlPanel.setAdvancedToggleClickable?.(false);
    controlPanel.setAdvancedStrategyControlsClickable?.(false);
    controlPanel.setStopOnProfitClickable?.(false);
    controlPanel.setStopOnLossClickable?.(false);
    controlPanel.setAnimationsToggleClickable?.(false);
    controlPanel.setShowServerButtonClickable?.(false);
    return;
  }

  finalizeRound();
  controlPanel.setNumberOfBetsClickable?.(true);
  controlPanel.setAdvancedToggleClickable?.(true);
  controlPanel.setAdvancedStrategyControlsClickable?.(true);
  controlPanel.setStopOnProfitClickable?.(true);
  controlPanel.setStopOnLossClickable?.(true);
  controlPanel.setAnimationsToggleClickable?.(true);
  controlPanel.setShowServerButtonClickable?.(true);
  controlPanel.setServerPanelVisibility?.(
    serverUI?.isVisible?.() ?? false
  );
}

function disableServerRoundSetupControls() {
  setControlPanelBetState(false);
  setControlPanelRandomState(false);
  setControlPanelMinesState(false);
  controlPanel?.setModeToggleClickable?.(false);
  controlPanel?.setBetControlsClickable?.(false);
}

function normalizeMinesValue(value, maxMines) {
  const numeric = Math.floor(Number(value));
  let mines = Number.isFinite(numeric) ? numeric : 1;
  mines = Math.max(1, mines);
  if (Number.isFinite(maxMines)) {
    mines = Math.min(mines, maxMines);
  }
  return mines;
}

function applyMinesOption(value, { syncGame = false } = {}) {
  const maxMines = controlPanel?.getMaxMines?.();
  const mines = normalizeMinesValue(value, maxMines);

  opts.mines = mines;

  if (syncGame) {
    if (typeof game?.setMines === "function") {
      game.setMines(mines);
    } else {
      game?.reset?.();
    }
  }

  return mines;
}

function setGameBoardInteractivity(enabled) {
  const gameNode = document.querySelector("#game");
  if (!gameNode) {
    return;
  }
  gameNode.classList.toggle("is-round-complete", !enabled);
}

function clearSelectionDelay() {
  if (selectionDelayHandle) {
    clearTimeout(selectionDelayHandle);
    selectionDelayHandle = null;
  }
  selectionPending = false;
}

function beginSelectionDelay() {
  clearSelectionDelay();
  selectionPending = true;
  setControlPanelBetState(false);
  setControlPanelRandomState(false);
}

function setAutoRunUIState(active) {
  if (!controlPanel) {
    return;
  }

  if (active) {
    controlPanel.setAutoStartButtonMode?.("stop");
    setControlPanelAutoStartState(true);
    controlPanel.setModeToggleClickable?.(false);
    controlPanel.setBetControlsClickable?.(false);
    setControlPanelMinesState(false);
    controlPanel.setNumberOfBetsClickable?.(false);
    controlPanel.setAdvancedToggleClickable?.(false);
    controlPanel.setAdvancedStrategyControlsClickable?.(false);
    controlPanel.setStopOnProfitClickable?.(false);
    controlPanel.setStopOnLossClickable?.(false);
  } else {
    controlPanel.setAutoStartButtonMode?.("start");
    const canClick = controlPanelMode === "auto";
    setControlPanelAutoStartState(canClick);
    controlPanel.setModeToggleClickable?.(true);
    controlPanel.setBetControlsClickable?.(true);
    setControlPanelMinesState(true);
    controlPanel.setNumberOfBetsClickable?.(true);
    controlPanel.setAdvancedToggleClickable?.(true);
    controlPanel.setAdvancedStrategyControlsClickable?.(true);
    controlPanel.setStopOnProfitClickable?.(true);
    controlPanel.setStopOnLossClickable?.(true);
  }
}

function setAutoRunFinishingState() {
  if (!controlPanel) {
    return;
  }

  controlPanel.setAutoStartButtonMode?.("finish");
  setControlPanelAutoStartState(false);
  controlPanel.setModeToggleClickable?.(false);
  controlPanel.setBetControlsClickable?.(false);
  setControlPanelMinesState(false);
  controlPanel.setNumberOfBetsClickable?.(false);
  controlPanel.setAdvancedToggleClickable?.(false);
  controlPanel.setAdvancedStrategyControlsClickable?.(false);
  controlPanel.setStopOnProfitClickable?.(false);
  controlPanel.setStopOnLossClickable?.(false);
}

function clearAutoRoundTimer() {
  if (autoResetTimer) {
    clearTimeout(autoResetTimer);
    autoResetTimer = null;
  }
}

function determineDemoBetResult() {
  const lostProbability = Math.random() < 0.4;
  const betResult = lostProbability ? "lost" : "win";
  return betResult;
}


function getCurrentBetAmountValue() {
  const numericAmount = coerceNumericValue(controlPanel?.getBetValue?.());
  return numericAmount != null ? Math.max(0, numericAmount) : 0;
}

function isDemoBetAmount() {
  return getCurrentBetAmountValue() <= 0;
}



function randomCardTypeExcluding(excludedKey = null) {
  const cardTypes =
    Array.isArray(availableCardTypes) && availableCardTypes.length > 0
      ? [...availableCardTypes]
      : [null];
  const pool = cardTypes.filter((key) => key !== excludedKey);
  const source = pool.length > 0 ? pool : cardTypes;
  return source[Math.floor(Math.random() * source.length)] ?? null;
}

function getServerOutcomeFromBetResponse(response) {
  const state = response?.state ?? null;
  const status = typeof state?.status === "string" ? state.status : "";
  const won = status.toLowerCase() === "won";
  const winAmount = coerceNumericValue(state?.winAmount);
  const multiplier = coerceNumericValue(state?.multiplier);
  const winningKey = won ? getCardTypeKeyForMultiplier(multiplier) : null;

  return {
    betResult: won ? "win" : "lost",
    winningKey,
    winAmount: winAmount != null ? winAmount : 0,
  };
}

async function submitServerBetRound() {
  const betAmount = controlPanel?.getBetValue?.() ?? 0;
  const betNumericAmount = coerceNumericValue(betAmount) ?? 0;

  disableServerRoundSetupControls();

  try {
    const response = await serverUI?.submitBet?.({
      amount: betNumericAmount,
    });

    const outcome = getServerOutcomeFromBetResponse(response ?? {});
    setTotalProfitAmountValue(outcome.winAmount);

    performBet();
    game?.reset?.();
    prepareScratchRound(outcome.betResult, { winningKey: outcome.winningKey });

    if (controlPanelMode === "auto") {
      setTimeout(() => {
        if (!autoRunActive) {
          return;
        }
        game?.revealRemainingTiles?.();
      }, 0);
    }
  } catch (error) {
    console.error("Failed to submit server bet", error);
    finalizeRound();
  }
}

function executeAutoBetRound() {
  if (!autoRunActive) {
    return;
  }

  autoRoundInProgress = true;

  if (!demoMode && !suppressRelay && !isDemoBetAmount()) {
    submitServerBetRound();
    return;
  }

  const betResult = determineDemoBetResult();
  handleBet(betResult);

  setTimeout(() => {
    if (!autoRunActive) {
      return;
    }
    game?.revealRemainingTiles?.();
  }, 0);
}

function scheduleNextAutoBetRound(delay = autoResetDelayMs) {
  if (!autoRunActive) {
    return;
  }

  clearAutoRoundTimer();
  autoResetTimer = setTimeout(() => {
    autoResetTimer = null;
    if (!autoRunActive) {
      return;
    }
    executeAutoBetRound();
  }, delay);
}

function startAutoBetProcess() {
  if (autoRunActive || controlPanelMode !== "auto") {
    return;
  }

  autoRunActive = true;
  autoRoundInProgress = false;
  autoStopPending = false;

  const configuredBets = Math.max(
    0,
    Math.floor(Number(controlPanel?.getNumberOfBetsValue?.()) || 0)
  );
  autoRemainingBets = configuredBets;

  if (!demoMode && !suppressRelay) {
    const payload = { numberOfBets: configuredBets };
    sendRelayMessage("control:start-autobet", payload);
    sendRelayMessage("action:start-autobet", payload);
  }

  setAutoRunUIState(true);
  executeAutoBetRound();
}

function stopAutoBetProcess({ reason = "user", completed = false } = {}) {
  clearSelectionDelay();
  clearAutoRoundTimer();

  const wasActive = autoRunActive;
  autoRunActive = false;
  autoRoundInProgress = false;

  if (!demoMode && !suppressRelay && wasActive) {
    sendRelayMessage("action:stop-autobet", {
      reason,
      completed,
    });
  }

  const shouldWaitForRound = roundActive && !completed;

  if (shouldWaitForRound) {
    autoStopPending = true;
    setAutoRunFinishingState();
    if (!game?.isAutoRevealInProgress?.()) {
      game?.revealRemainingTiles?.();
    }
    return;
  }

  autoStopPending = false;

  if (roundActive) {
    finalizeRound();
  }

  setAutoRunUIState(false);
}

function applyRoundInteractiveState(state) {
  if (!roundActive) {
    return;
  }

  if (controlPanelMode === "auto") {
    setControlPanelBetState(false);
    setControlPanelRandomState(false);
    setGameBoardInteractivity(false);
    cashoutAvailable = false;
    return;
  }

  const revealedCount = state?.revealed ?? 0;
  const totalTiles =
    state?.totalTiles ?? currentGridRows * currentGridColumns;

  if (selectionPending || state?.waitingForChoice) {
    setControlPanelBetState(false);
    setControlPanelRandomState(false);
    cashoutAvailable = false;
    return;
  }

  cashoutAvailable = false;
  const hasHiddenTiles = revealedCount < totalTiles;
  if (betButtonMode === "scratch") {
    setControlPanelBetState(hasHiddenTiles);
  } else {
    setControlPanelBetState(false);
  }
  setControlPanelRandomState(true);
}

function prepareForNewRoundState() {
  roundActive = true;
  cashoutAvailable = false;
  clearSelectionDelay();
  const isAutoMode = controlPanelMode === "auto";
  game?.setScratchEnabled?.(true);
  if (isAutoMode) {
    setControlPanelBetMode("bet");
    setControlPanelBetState(false);
  } else {
    setControlPanelBetMode("scratch");
    setControlPanelBetState(true);
  }
  setControlPanelRandomState(!isAutoMode);
  setGameBoardInteractivity(!isAutoMode);
  minesSelectionLocked = false;

  if (!isAutoMode) {
    manualRoundNeedsReset = false;
    setControlPanelMinesState(false);
    controlPanel?.setModeToggleClickable?.(false);
    controlPanel?.setBetControlsClickable?.(false);
  } else {
    controlPanel?.setModeToggleClickable?.(!autoRunActive);
    controlPanel?.setBetControlsClickable?.(!autoRunActive);
    if (!autoRunActive) {
      setControlPanelMinesState(true);
      setControlPanelAutoStartState(true);
    }
  }
}

function finalizeRound() {
  roundActive = false;
  cashoutAvailable = false;
  game?.setScratchEnabled?.(false);
  clearSelectionDelay();
  setControlPanelBetMode("bet");
  setControlPanelRandomState(false);
  setGameBoardInteractivity(false);
  minesSelectionLocked = false;
  setControlPanelMinesState(true);

  if (autoRunActive) {
    setControlPanelBetState(false);
    setControlPanelMinesState(false);
    controlPanel?.setModeToggleClickable?.(false);
    controlPanel?.setBetControlsClickable?.(false);
    setControlPanelAutoStartState(true);
  } else {
    setControlPanelBetState(true);
    setControlPanelMinesState(true);
    controlPanel?.setModeToggleClickable?.(true);
    controlPanel?.setBetControlsClickable?.(true);
    if (controlPanelMode === "auto") {
      setControlPanelAutoStartState(true);
    } else {
      setControlPanelAutoStartState(false);
    }
  }

  currentBetResult = null;
  currentRoundAssignments.clear();

  if (autoStopPending) {
    autoStopPending = false;
    setAutoRunUIState(false);
  }
}

function handleBetButtonClick() {
  if (betButtonMode === "cashout") {
    handleCashout();
  } else if (betButtonMode === "scratch") {
    handleScratchButtonClick();
  } else {
    if (!demoMode && !suppressRelay && !isDemoBetAmount()) {
      submitServerBetRound();
      return;
    }

    const betResult = determineDemoBetResult();
    handleBet(betResult);
  }
}

function handleScratchButtonClick() {
  if (controlPanelMode !== "manual") {
    return;
  }

  revealRemainingTilesAndFinalize();
}

function markManualRoundForReset() {
  if (controlPanelMode === "manual") {
    manualRoundNeedsReset = true;
  }
}

function handleCashout() {
  if (!roundActive || !cashoutAvailable) {
    return;
  }

  if (!demoMode && !suppressRelay) {
    sendRelayMessage("action:cashout", {});
    return;
  }

  markManualRoundForReset();
  game?.revealRemainingTiles?.();
  finalizeRound();
}

function revealRemainingTilesAndFinalize() {
  if (!roundActive || selectionPending) {
    return;
  }

  game?.fadeOutScratchCover?.();
  markManualRoundForReset();
  game?.revealRemainingTiles?.();
  finalizeRound();
}

function performBet() {
  applyMinesOption(controlPanel?.getMinesValue?.(), {
    syncGame: true,
  });
  prepareForNewRoundState();
  manualRoundNeedsReset = false;
}

function getCardKey(row, col) {
  return `${row},${col}`;
}

function shuffleArray(values = []) {
  const array = [...values];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function createCardPositions() {
  const positions = [];
  for (let row = 0; row < currentGridRows; row += 1) {
    for (let col = 0; col < currentGridColumns; col += 1) {
      positions.push({ row, col });
    }
  }
  return positions;
}

function generateScratchCardAssignments(betResult, options = {}) {
  const cardTypes =
    Array.isArray(availableCardTypes) && availableCardTypes.length > 0
      ? [...availableCardTypes]
      : [null];
  const positions = shuffleArray(createCardPositions());
  const assignments = [];
  const counts = new Map(cardTypes.map((key) => [key, 0]));
  let winningKey = null;

  if (betResult === "win") {
    const requestedWinningKey = options?.winningKey;
    const primaryType =
      requestedWinningKey != null && cardTypes.includes(requestedWinningKey)
        ? requestedWinningKey
        : randomCardTypeExcluding(null);
    winningKey = primaryType ?? null;
    const primarySlots = Math.min(3, positions.length);
    for (let i = 0; i < primarySlots; i += 1) {
      const position = positions.shift();
      if (!position) break;
      assignments.push({
        row: position.row,
        col: position.col,
        contentKey: primaryType,
      });
      counts.set(primaryType, (counts.get(primaryType) ?? 0) + 1);
    }

    for (const position of positions) {
      const available = cardTypes.filter((type) => {
        if (type === primaryType) {
          return (counts.get(type) ?? 0) < 3;
        }
        return (counts.get(type) ?? 0) < 2;
      });
      const pool = available.length > 0 ? available : cardTypes;
      const choice = pool[Math.floor(Math.random() * pool.length)] ?? null;
      counts.set(choice, (counts.get(choice) ?? 0) + 1);
      assignments.push({
        row: position.row,
        col: position.col,
        contentKey: choice,
      });
    }
  } else {
    for (const position of positions) {
      const available = cardTypes.filter(
        (type) => (counts.get(type) ?? 0) < 2
      );
      const pool = available.length > 0 ? available : cardTypes;
      const choice = pool[Math.floor(Math.random() * pool.length)] ?? null;
      counts.set(choice, (counts.get(choice) ?? 0) + 1);
      assignments.push({
        row: position.row,
        col: position.col,
        contentKey: choice,
      });
    }
  }

  return { assignments, winningKey };
}

function prepareScratchRound(betResult, options = {}) {
  currentBetResult = betResult;
  if (!game) {
    return;
  }

  const { assignments, winningKey } = generateScratchCardAssignments(betResult, options);
  currentRoundAssignments.clear();
  for (const entry of assignments) {
    currentRoundAssignments.set(
      getCardKey(entry.row, entry.col),
      entry.contentKey ?? null
    );
  }
  const totalWinningCards =
    winningKey != null
      ? assignments.filter((entry) => entry.contentKey === winningKey).length
      : 0;
  game?.setRoundAssignments?.(assignments, {
    betResult,
    winningKey,
    totalWinningCards,
  });
}

function handleBet(betResult = "lost", options = {}) {
  if (!demoMode && !suppressRelay) {
    return;
  }

  performBet();
  game?.reset?.();
  prepareScratchRound(betResult, options);
}

function handleGameStateChange(state) {
  lastKnownGameState = state;
  if (!roundActive) {
    return;
  }

  if (state?.gameOver) {
    finalizeRound();
    if (
      controlPanelMode === "auto" &&
      (autoRunActive || autoRoundInProgress)
    ) {
      handleAutoRoundCompleted();
    }
    return;
  }

  applyRoundInteractiveState(state);
}

function handleRandomPickClick() {
  if (!roundActive || selectionPending) {
    return;
  }

  game?.selectRandomTile?.();
}

function handleAutoRoundCompleted() {
  const hadFiniteLimit = autoRemainingBets > 0;
  if (hadFiniteLimit) {
    autoRemainingBets = Math.max(0, autoRemainingBets - 1);
    controlPanel?.setNumberOfBetsValue?.(autoRemainingBets);
  }

  autoRoundInProgress = false;

  if (!autoRunActive) {
    return;
  }

  if (hadFiniteLimit && autoRemainingBets === 0) {
    stopAutoBetProcess({ reason: "completed", completed: true });
    return;
  }

  scheduleNextAutoBetRound();
}

function handleCardSelected(selection) {
  if (!roundActive) {
    return;
  }

  if (controlPanelMode === "auto") {
    return;
  }

  if (!minesSelectionLocked) {
    minesSelectionLocked = true;
    setControlPanelMinesState(false);
  }

  beginSelectionDelay();

  if (!demoMode && !suppressRelay) {
    const payload = {
      row: selection?.row,
      col: selection?.col,
    };
    sendRelayMessage("game:manual-selection", payload);
    return;
  }

  selectionDelayHandle = null;

  if (!roundActive) {
    selectionPending = false;
    return;
  }

  const key = getCardKey(selection?.row, selection?.col);
  const contentKey = currentRoundAssignments.get(key) ?? null;

  selectionPending = false;
  game?.revealSelectedCard?.(contentKey);
}

function handleStartAutobetClick() {
  if (autoRunActive) {
    stopAutoBetProcess();
    return;
  }

  if (controlPanelMode !== "auto") {
    return;
  }

  startAutoBetProcess();
}

const opts = {
  size: 600,
  backgroundColor: "#091B26",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Arial",
  gridRows: GRID_ROWS,
  gridColumns: GRID_COLUMNS,
  mines: 1,
  autoResetDelayMs: AUTO_RESET_DELAY_MS,
  iconSizePercentage: 0.7,
  iconRevealedSizeOpacity: 0.2,
  iconRevealedSizeFactor: 0.7,
  cardsSpawnDuration: 350,
  revealAllIntervalDelay: 40,
  strokeWidth: 1,
  gapBetweenTiles: 0.013,
  hoverEnabled,
  hoverEnterDuration,
  hoverExitDuration,
  hoverTiltAxis: "x",
  hoverSkewAmount: 0.00,
  disableAnimations: false,
  wiggleSelectionEnabled: false,
  wiggleSelectionDuration: 900,
  wiggleSelectionTimes: 15,
  wiggleSelectionIntensity: 0.03,
  wiggleSelectionScale: 0.005,
  flipDelayMin: 150,
  flipDelayMax: 500,
  flipDuration: 300,
  flipEaseFunction: "easeInOutSine",
  cardIconType,
  cardIconScale,
  cardIconOffsetX,
  cardIconOffsetY,
  cardSpritesheetAnimationSpeed,
  cardMatchShake,
  tileTapDownSoundPath: tileTapDownSoundUrl,
  tileFlipSoundPath: tileFlipSoundUrl,
  tileHoverSoundPath: tileHoverSoundUrl,
  roundWinSoundPath: roundWinSoundUrl,
  roundLostSoundPath: roundLostSoundUrl,
  winPopupShowDuration: 260,
  getMode: () => controlPanelMode,
  onCardSelected: (selection) => handleCardSelected(selection),
  onChange: handleGameStateChange,
};

  const totalTiles = opts.gridRows * opts.gridColumns;
  const maxMines = Math.max(1, totalTiles - 1);
  const initialMines = Math.max(1, Math.min(opts.mines ?? 1, maxMines));
  opts.mines = initialMines;

  // Initialize Control Panel
  try {
    controlPanel = new ControlPanel("#control-panel", {
      gameName: GAME_NAME,
      totalTiles,
      maxMines,
      initialMines,
    });
    controlPanelMode = controlPanel?.getMode?.() ?? "manual";
    controlPanel.addEventListener("modechange", (event) => {
      const nextMode = event.detail?.mode === "auto" ? "auto" : "manual";
      const previousMode = controlPanelMode;

      if (nextMode === previousMode) {
        return;
      }

      if (autoRunActive && nextMode !== "auto") {
        stopAutoBetProcess();
      }

      controlPanelMode = nextMode;

      if (nextMode === "auto") {
        if (previousMode === "manual") {
          if (roundActive) {
            finalizeRound();
          }
          if (manualRoundNeedsReset) {
            game?.reset?.();
            manualRoundNeedsReset = false;
          }
        }
        setControlPanelRandomState(false);
        setGameBoardInteractivity(false);
        if (!autoRunActive) {
          setControlPanelAutoStartState(true);
        }
      } else {
        setControlPanelAutoStartState(false);
        if (previousMode === "auto") {
          game?.reset?.();
          manualRoundNeedsReset = false;
          setGameBoardInteractivity(false);
          setControlPanelRandomState(false);
          setControlPanelBetState(true);
        } else {
          setGameBoardInteractivity(true);
          if (!roundActive) {
            setControlPanelRandomState(true);
          }
        }
      }
    });
    controlPanel.addEventListener("betvaluechange", (event) => {
      console.debug(`Bet value updated to ${event.detail.value}`);
      sendRelayMessage("control:bet-value", {
        value: event.detail?.value,
        numericValue: event.detail?.numericValue,
      });
    });
    controlPanel.addEventListener("mineschanged", (event) => {
      const shouldSyncGame =
        controlPanelMode === "auto" && !autoRunActive && !autoRoundInProgress;

      applyMinesOption(event.detail.value, { syncGame: shouldSyncGame });
      sendRelayMessage("control:mines", {
        value: event.detail?.value,
        totalTiles: event.detail?.totalTiles,
        gems: event.detail?.gems,
      });
    });
    controlPanel.addEventListener("numberofbetschange", (event) => {
      if (!autoRunActive) {
        autoRemainingBets = Math.max(
          0,
          Math.floor(Number(event.detail?.value) || 0)
        );
      }
      sendRelayMessage("control:number-of-bets", {
        value: event.detail?.value,
      });
    });
    controlPanel.addEventListener("strategychange", (event) => {
      sendRelayMessage("control:strategy-mode", {
        key: event.detail?.key,
        mode: event.detail?.mode,
      });
    });
    controlPanel.addEventListener("strategyvaluechange", (event) => {
      sendRelayMessage("control:strategy-value", {
        key: event.detail?.key,
        value: event.detail?.value,
      });
    });
    controlPanel.addEventListener("stoponprofitchange", (event) => {
      sendRelayMessage("control:stop-on-profit", {
        value: event.detail?.value,
      });
    });
    controlPanel.addEventListener("stoponlosschange", (event) => {
      sendRelayMessage("control:stop-on-loss", {
        value: event.detail?.value,
      });
    });
    controlPanel.addEventListener("animationschange", (event) => {
      const enabled = Boolean(event.detail?.enabled);
      opts.disableAnimations = !enabled;
      game?.setAnimationsEnabled?.(enabled);
    });
    controlPanel.addEventListener("showserver", () => {
      serverUI?.show?.();
    });
    controlPanel.addEventListener("bet", handleBetButtonClick);
    controlPanel.addEventListener("randompick", handleRandomPickClick);
    controlPanel.addEventListener("startautobet", handleStartAutobetClick);
    finalizeRound();
    controlPanel.setBetAmountDisplay("$0.00");
    setTotalProfitMultiplierValue(0.0);
    controlPanel.setProfitOnWinDisplay("$0.00");
    setTotalProfitAmountValue("0.00000000");
    opts.disableAnimations = !(controlPanel.getAnimationsEnabled?.() ?? true);
    controlPanel.setServerPanelVisibility(
      serverUI?.isVisible?.() ?? false
    );
    setControlPanelLoadingState(true);
  } catch (err) {
    console.error("Control panel initialization failed:", err);
  }

  // Initialize Game
  try {
    game = await createGame("#game", opts);
    window.game = game;
    availableCardTypes = game?.getCardContentKeys?.() ?? [];
    autoResetDelayMs = Number(
      game?.getAutoResetDelay?.() ?? AUTO_RESET_DELAY_MS
    );
    const state = game?.getState?.();
    if (state) {
      if (Number.isFinite(state.gridRows)) {
        currentGridRows = Math.max(1, state.gridRows);
      }
      if (Number.isFinite(state.gridColumns)) {
        currentGridColumns = Math.max(1, state.gridColumns);
      }
      const totalTiles =
        state.totalTiles ??
        (state.gridRows && state.gridColumns
          ? state.gridRows * state.gridColumns
          : state.grid * state.grid);
      if (totalTiles != null) {
        controlPanel?.setTotalTiles?.(totalTiles, { emit: false });
      }
      controlPanel?.setMinesValue?.(opts.mines, { emit: false });
    }
    const animationsEnabled = controlPanel?.getAnimationsEnabled?.();
    if (animationsEnabled != null) {
      game?.setAnimationsEnabled?.(Boolean(animationsEnabled));
    }
    setControlPanelLoadingState(false);
  } catch (e) {
    console.error("Game initialization failed:", e);
    const gameDiv = document.querySelector("#game");
    if (gameDiv) {
      gameDiv.innerHTML = `
        <div style="color: #f44336; padding: 20px; background: rgba(0,0,0,0.8); border-radius: 8px;">
          <h3>❌ Game Failed to Initialize</h3>
          <p><strong>Error:</strong> ${e.message}</p>
          <p>Check console (F12) for full details.</p>
        </div>
      `;
    }
  }
}

loadRuntimeConfig()
  .then(startApp)
  .catch((error) => {
    console.error(
      "[CONFIG] Falling back to bundled defaults after runtime load failed.",
      error
    );
    startApp(localConfig ?? {});
  });
