import { ServerRelay } from "../serverRelay.js";
import { ServerPanel } from "./serverPanel.js";
import gameConfig from "../gameConfig.json";

export const DEFAULT_SERVER_URL = "https://dev.securesocket.net:8443";
export const DEFAULT_SCRATCH_GAME_ID = "CrashLilBaby";

let sessionId = null;
let sessionGameDetails = null;
let sessionGameUrl = null;
let sessionUserToken = null;
let lastBetResult = null;
let lastBetRoundId = null;
let lastBetBalance = null;
let lastBetRegisteredBets = [];
let activeRound = null;

const GRID_ROWS = Math.max(
  1,
  Number.isFinite(gameConfig?.gameplay?.grid?.rows)
    ? gameConfig.gameplay.grid.rows
    : Number.isFinite(gameConfig?.gameplay?.gridSize)
    ? gameConfig.gameplay.gridSize
    : 3
);
const GRID_COLUMNS = Math.max(
  1,
  Number.isFinite(gameConfig?.gameplay?.grid?.columns)
    ? gameConfig.gameplay.grid.columns
    : Number.isFinite(gameConfig?.gameplay?.gridSize)
    ? gameConfig.gameplay.gridSize
    : 3
);
const cardTypeMultipliersMap = new Map(
  Object.entries(gameConfig?.gameplay?.multipliersMapping ?? {}).flatMap(
    ([cardTypeKey, multiplierValue]) => {
      if (!/^cardType_\d+$/i.test(cardTypeKey)) {
        return [];
      }

      const parsedMultiplier = Number(multiplierValue);
      if (!Number.isFinite(parsedMultiplier)) {
        return [];
      }

      return [[parsedMultiplier, cardTypeKey]];
    }
  )
);
const availableCardTypes = Array.from(cardTypeMultipliersMap.values());

function normalizeBaseUrl(url) {
  if (typeof url !== "string") {
    return DEFAULT_SERVER_URL;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return DEFAULT_SERVER_URL;
  }

  return trimmed.replace(/\/+$/, "");
}

function normalizeScratchGameId(id) {
  if (typeof id !== "string") {
    return DEFAULT_SCRATCH_GAME_ID;
  }

  const trimmed = id.trim();
  if (!trimmed) {
    return DEFAULT_SCRATCH_GAME_ID;
  }

  return trimmed;
}

export function getSessionId() {
  return sessionId;
}

export function getGameSessionDetails() {
  return sessionGameDetails;
}

export function getGameUrl() {
  return sessionGameUrl;
}

export function getUserToken() {
  return sessionUserToken;
}

function ensureRelay(relay) {
  if (!relay) {
    throw new Error("A ServerRelay instance is required");
  }
  if (!(relay instanceof ServerRelay)) {
    throw new Error("Server expects a ServerRelay instance");
  }
  return relay;
}

function isServerRelay(candidate) {
  return candidate instanceof ServerRelay;
}

function normalizeBetAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, numeric);
}

function formatBetAmountLiteral(amount) {
  const normalized = normalizeBetAmount(amount);
  const safeDecimals = 8;
  try {
    return normalized.toFixed(safeDecimals);
  } catch (error) {
    const fallback = String(normalized);
    if (/e/i.test(fallback)) {
      return Number.isFinite(normalized)
        ? normalized.toLocaleString("en-US", {
            useGrouping: false,
            minimumFractionDigits: safeDecimals,
            maximumFractionDigits: safeDecimals,
          })
        : "0.00000000";
    }
    return fallback;
  }
}

function serializeBetRequestBody({ type = "bet", amountLiteral, betInfo }) {
  const safeType = typeof type === "string" && type.length ? type : "bet";
  const literal =
    typeof amountLiteral === "string" && amountLiteral.length > 0
      ? amountLiteral
      : "0.00000000";
  const betInfoJson = JSON.stringify(betInfo ?? {});
  return `{"type":${JSON.stringify(safeType)},"amount":${literal},"betInfo":${betInfoJson}}`;
}

function normalizeBetRate(rate) {
  const numeric = Number(rate);
  if (!Number.isFinite(numeric)) {
    return 2;
  }
  return Math.max(1, Math.floor(numeric)) || 2;
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
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLUMNS; col += 1) {
      positions.push({ row, col });
    }
  }
  return positions;
}

function generateServerRoundAssignments({ status, winningCardType }) {
  const betWon = status === "Won";
  const cardTypes =
    Array.isArray(availableCardTypes) && availableCardTypes.length > 0
      ? [...availableCardTypes]
      : [null];
  const positions = shuffleArray(createCardPositions());
  const assignments = [];
  const counts = new Map(cardTypes.map((key) => [key, 0]));

  if (betWon) {
    const primaryType =
      typeof winningCardType === "string" && cardTypes.includes(winningCardType)
        ? winningCardType
        : cardTypes[0] ?? null;
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

    return assignments;
  }

  for (const position of positions) {
    const available = cardTypes.filter((type) => (counts.get(type) ?? 0) < 2);
    const pool = available.length > 0 ? available : cardTypes;
    const choice = pool[Math.floor(Math.random() * pool.length)] ?? null;
    counts.set(choice, (counts.get(choice) ?? 0) + 1);
    assignments.push({
      row: position.row,
      col: position.col,
      contentKey: choice,
    });
  }

  return assignments;
}

function createRoundLookup(assignments = []) {
  const lookup = new Map();
  assignments.forEach((entry) => {
    if (typeof entry?.row !== "number" || typeof entry?.col !== "number") {
      return;
    }
    lookup.set(`${entry.row},${entry.col}`, entry.contentKey ?? null);
  });
  return lookup;
}

function clearActiveRound() {
  activeRound = null;
}

async function handleServerBetRequest({
  relay,
  url,
  scratchGameId,
  payload,
  auto = false,
}) {
  const amount = payload?.bet ?? payload?.amount ?? 0;
  const submitted = await submitBet({
    url,
    gameId: scratchGameId,
    amount,
    relay,
  });

  const state = submitted?.state ?? null;
  const status = typeof state?.status === "string" ? state.status : "Lost";
  const didWin = status === "Won";
  const multiplier = Number(state?.multiplier);
  const winningCardType = didWin
    ? cardTypeMultipliersMap.get(multiplier) ?? null
    : null;
  const winAmount = state?.winAmount ?? 0;
  const assignments = generateServerRoundAssignments({
    status,
    winningCardType,
  });

  activeRound = {
    assignments,
    lookup: createRoundLookup(assignments),
    result: didWin ? "win" : "lost",
  };

  relay.deliver("profit:update-multiplier", {
    value: didWin ? multiplier : 1,
    numericValue: didWin ? multiplier : 1,
  });
  relay.deliver("profit:update-total", {
    value: winAmount,
    numericValue: Number(winAmount),
  });
  relay.deliver("start-bet", {
    result: didWin ? "win" : "lost",
    status,
    multiplier: didWin ? multiplier : null,
    winAmount,
    winningCardType,
  });

  if (auto) {
    relay.deliver("auto-bet-result", {
      results: assignments,
      status,
      multiplier: didWin ? multiplier : null,
      winAmount,
      winningCardType,
    });
    relay.deliver("finalize-bet", {});
    clearActiveRound();
  }
}

export async function initializeSessionId({
  url = DEFAULT_SERVER_URL,
  relay,
} = {}) {
  const baseUrl = normalizeBaseUrl(url);
  const endpoint = `${baseUrl}/get_session_id`;

  const requestPayload = {
    method: "GET",
    url: endpoint,
  };

  if (isServerRelay(relay)) {
    relay.send("api:get_session_id:request", requestPayload);
  }

  let response;

  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
      },
    });
  } catch (networkError) {
    if (isServerRelay(relay)) {
      relay.deliver("api:get_session_id:response", {
        ok: false,
        error: networkError?.message ?? "Network error",
        request: requestPayload,
      });
    }
    throw networkError;
  }

  const rawBody = await response.text();
  let nextSessionId = rawBody;

  const responsePayload = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: rawBody,
    request: requestPayload,
  };

  try {
    const parsed = JSON.parse(rawBody);
    if (typeof parsed === "string") {
      nextSessionId = parsed;
    } else if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.sessionId === "string"
    ) {
      nextSessionId = parsed.sessionId;
    }
  } catch (error) {
    // Response is not JSON; treat raw body as the session id string.
  }

  if (typeof nextSessionId !== "string" || nextSessionId.length === 0) {
    if (isServerRelay(relay)) {
      relay.deliver("api:get_session_id:response", {
        ...responsePayload,
        ok: false,
        error: "Session id response did not include a session id value",
      });
    }
    throw new Error("Session id response did not include a session id value");
  }

  if (!response.ok) {
    if (isServerRelay(relay)) {
      relay.deliver("api:get_session_id:response", {
        ...responsePayload,
        ok: false,
        error: `Failed to initialize session id: ${response.status} ${response.statusText}`,
      });
    }
    throw new Error(
      `Failed to initialize session id: ${response.status} ${response.statusText}`
    );
  }

  sessionId = nextSessionId;

  if (isServerRelay(relay)) {
    relay.deliver("api:get_session_id:response", {
      ...responsePayload,
      ok: true,
      sessionId,
    });
  }

  return sessionId;
}

export async function initializeGameSession({
  url = DEFAULT_SERVER_URL,
  scratchGameId = DEFAULT_SCRATCH_GAME_ID,
  relay,
} = {}) {
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    const error = new Error(
      "Cannot join game session before the session id is initialized"
    );
    if (isServerRelay(relay)) {
      relay.deliver("api:join:response", {
        ok: false,
        error: error.message,
      });
    }
    throw error;
  }

  const baseUrl = normalizeBaseUrl(url);
  const gameId = normalizeScratchGameId(scratchGameId);
  const endpoint = `${baseUrl}/join/${encodeURIComponent(gameId)}/`;

  sessionGameDetails = null;
  sessionGameUrl = null;
  sessionUserToken = null;

  const requestPayload = {
    method: "GET",
    url: endpoint,
    gameId,
  };

  if (isServerRelay(relay)) {
    relay.send("api:join:request", requestPayload);
  }

  let response;

  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "X-CASINOTV-TOKEN": sessionId,
        "X-CASINOTV-PROTOCOL-VERSION": "1.1",
      },
    });
  } catch (networkError) {
    if (isServerRelay(relay)) {
      relay.deliver("api:join:response", {
        ok: false,
        error: networkError?.message ?? "Network error",
        request: requestPayload,
      });
    }
    throw networkError;
  }

  const rawBody = await response.text();
  let parsedBody = null;

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (error) {
      // Response body was not JSON; leave parsedBody as null.
    }
  }

  const responsePayload = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: parsedBody ?? rawBody,
    request: requestPayload,
  };

  if (!response.ok) {
    if (isServerRelay(relay)) {
      relay.deliver("api:join:response", {
        ...responsePayload,
        ok: false,
        error: `Failed to join game session: ${response.status} ${response.statusText}`,
      });
    }
    throw new Error(
      `Failed to join game session: ${response.status} ${response.statusText}`
    );
  }

  if (!parsedBody || typeof parsedBody !== "object") {
    if (isServerRelay(relay)) {
      relay.deliver("api:join:response", {
        ...responsePayload,
        ok: false,
        error: "Join game session response was not valid JSON",
      });
    }
    throw new Error("Join game session response was not valid JSON");
  }

  const isSuccess = Boolean(parsedBody?.IsSuccess);
  const responseData = parsedBody?.ResponseData ?? null;

  if (!isSuccess || !responseData) {
    if (isServerRelay(relay)) {
      relay.deliver("api:join:response", {
        ...responsePayload,
        ok: false,
        error: "Join game session response did not indicate success",
      });
    }
    throw new Error("Join game session response did not indicate success");
  }

  const gameData = responseData?.GameData ?? null;
  const userData = responseData?.UserData ?? null;
  const userDataList = responseData?.UserDataList ?? null;
  const gameIds = Array.isArray(responseData?.GameIds)
    ? [...responseData.GameIds]
    : [];

  sessionGameDetails = {
    isSuccess,
    gameIds,
    gameData,
    userData,
    userDataList,
    raw: parsedBody,
  };

  sessionGameUrl =
    typeof gameData?.gameUrl === "string" && gameData.gameUrl
      ? gameData.gameUrl
      : null;
  sessionUserToken =
    typeof gameData?.userToken === "string" && gameData.userToken
      ? gameData.userToken
      : null;

  if (isServerRelay(relay)) {
    relay.deliver("api:join:response", {
      ...responsePayload,
      ok: true,
      gameSession: sessionGameDetails,
      gameUrl: sessionGameUrl,
      userToken: sessionUserToken,
    });
  }

  return sessionGameDetails;
}

export async function submitBet({
  url = DEFAULT_SERVER_URL,
  gameId = DEFAULT_SCRATCH_GAME_ID,
  amount = 0,
  rate = 0,
  targetMultiplier = null,
  relay,
} = {}) {
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    const error = new Error(
      "Cannot submit bet before the session id is initialized"
    );
    if (isServerRelay(relay)) {
      relay.deliver("api:bet:response", {
        ok: false,
        error: error.message,
      });
    }
    throw error;
  }

  const baseUrl = normalizeBaseUrl(url);
  const normalizedGameId = normalizeScratchGameId(gameId);
  const endpoint = `${baseUrl}/post/${encodeURIComponent(normalizedGameId)}`;

  lastBetResult = null;
  lastBetRoundId = null;
  lastBetBalance = null;
  lastBetRegisteredBets = [];

  const normalizedAmount = normalizeBetAmount(amount);
  const normalizedRate = normalizeBetRate(rate || 2);
  const amountLiteral = formatBetAmountLiteral(normalizedAmount);
  const normalizedTargetMultiplier = Number.isFinite(targetMultiplier)
    ? targetMultiplier
    : null;

  const betInfo = {
    id: 1,
    title: {
      key: "straight",
      value: {},
    },
    type: "straight",
    items: [],
    rate: normalizedRate,
    state: "Active",
  };

  if (normalizedTargetMultiplier !== null) {
    betInfo.targetMultiplier = normalizedTargetMultiplier;
  }

  const requestBody = {
    type: "bet",
    amount: normalizedAmount,
    betInfo,
  };

  const serializedRequestBody = serializeBetRequestBody({
    type: requestBody.type,
    amountLiteral,
    betInfo,
  });

  const requestPayload = {
    method: "POST",
    url: endpoint,
    gameId: normalizedGameId,
    body: requestBody,
    bodyLiteral: serializedRequestBody,
  };

  if (isServerRelay(relay)) {
    relay.send("api:bet:request", requestPayload);
  }

  let response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "X-CASINOTV-TOKEN": sessionId,
        "X-CASINOTV-PROTOCOL-VERSION": "1.1",
      },
      body: serializedRequestBody,
    });
  } catch (networkError) {
    if (isServerRelay(relay)) {
      relay.deliver("api:bet:response", {
        ok: false,
        error: networkError?.message ?? "Network error",
        request: requestPayload,
      });
    }
    throw networkError;
  }

  const rawBody = await response.text();
  let parsedBody = null;

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (error) {
      // Response body was not JSON; leave parsedBody as null.
    }
  }

  const responsePayload = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: parsedBody ?? rawBody,
    request: requestPayload,
  };

  if (!response.ok) {
    if (isServerRelay(relay)) {
      relay.deliver("api:bet:response", {
        ...responsePayload,
        ok: false,
        error: `Failed to submit bet: ${response.status} ${response.statusText}`,
      });
    }
    throw new Error(
      `Failed to submit bet: ${response.status} ${response.statusText}`
    );
  }

  if (!parsedBody || typeof parsedBody !== "object") {
    if (isServerRelay(relay)) {
      relay.deliver("api:bet:response", {
        ...responsePayload,
        ok: false,
        error: "Bet response was not valid JSON",
      });
    }
    throw new Error("Bet response was not valid JSON");
  }

  const isSuccess = Boolean(parsedBody?.IsSuccess);
  const responseData = parsedBody?.ResponseData ?? null;
  const registeredBets = Array.isArray(responseData?.registeredBets)
    ? responseData.registeredBets.map((bet) => ({ ...(bet ?? {}) }))
    : [];
  const balance = responseData?.balance ?? null;
  const state = responseData?.state ?? null;
  const roundId = responseData?.roundId ?? null;

  if (!responseData) {
    if (isServerRelay(relay)) {
      relay.deliver("api:bet:response", {
        ...responsePayload,
        ok: false,
        error: "Bet response did not include response data",
      });
    }
    throw new Error("Bet response did not include response data");
  }

  lastBetResult = state ?? null;
  lastBetRoundId = roundId ?? null;
  lastBetBalance = balance ?? null;
  lastBetRegisteredBets = registeredBets;

  if (isServerRelay(relay)) {
    relay.deliver("api:bet:response", {
      ...responsePayload,
      ok: true,
      bet: {
        success: isSuccess,
        state,
        roundId,
        registeredBets,
        balance,
      },
    });
  }

  return {
    isSuccess,
    responseData,
    state,
    roundId,
    registeredBets,
    balance,
    raw: parsedBody,
  };
}

export async function initializeServerConnection({
  relay,
  url = DEFAULT_SERVER_URL,
  scratchGameId = DEFAULT_SCRATCH_GAME_ID,
} = {}) {
  const serverRelay = ensureRelay(relay);
  const gameSessionId = await initializeSessionId({ url, relay: serverRelay });
  const gameSession = await initializeGameSession({
    url,
    scratchGameId,
    relay: serverRelay,
  });

  return {
    sessionId: gameSessionId,
    gameSession,
    gameUrl: getGameUrl(),
    userToken: getUserToken(),
  };
}

export function createServer(relay, options = {}) {
  const serverRelay = ensureRelay(relay);
  const {
    mount = document.querySelector(".app-wrapper") ?? document.body,
    onDemoModeToggle = () => {},
    onVisibilityChange = () => {},
    initialDemoMode = true,
    initialCollapsed = false,
    initialHidden = false,
    serverUrl = DEFAULT_SERVER_URL,
    scratchGameId = DEFAULT_SCRATCH_GAME_ID,
    autoInitialize = true,
  } = options;

  const serverPanel = new ServerPanel({
    mount,
    initialDemoMode: Boolean(initialDemoMode),
    initialCollapsed: Boolean(initialCollapsed),
    initialHidden: Boolean(initialHidden),
    onDemoModeToggle,
    onVisibilityChange,
  });

  serverRelay.addEventListener("demomodechange", (event) => {
    serverPanel.setDemoMode(Boolean(event.detail?.value));
  });

  const outgoingHandler = (event) => {
    const { type, payload } = event.detail ?? {};
    serverPanel.appendLog("outgoing", type, payload);
  };

  const incomingHandler = (event) => {
    const { type, payload } = event.detail ?? {};
    serverPanel.appendLog("incoming", type, payload);
  };

  serverRelay.addEventListener("outgoing", outgoingHandler);
  serverRelay.addEventListener("incoming", incomingHandler);

  const gameActionHandler = (event) => {
    const { type, payload } = event.detail ?? {};
    if (serverRelay.demoMode) {
      return;
    }

    if (type === "action:bet") {
      handleServerBetRequest({
        relay: serverRelay,
        url: serverUrl,
        scratchGameId,
        payload,
        auto: false,
      }).catch((error) => {
        console.error("Failed to resolve server bet", error);
        clearActiveRound();
      });
      return;
    }

    if (type === "game:manual-selection") {
      const row = Number(payload?.row);
      const col = Number(payload?.col);
      const key = `${row},${col}`;
      const contentKey = activeRound?.lookup?.get(key) ?? null;
      serverRelay.deliver("bet-result", {
        row,
        col,
        contentKey,
        result: contentKey,
      });
      return;
    }

    if (type === "game:auto-round-request") {
      handleServerBetRequest({
        relay: serverRelay,
        url: serverUrl,
        scratchGameId,
        payload,
        auto: true,
      }).catch((error) => {
        console.error("Failed to resolve auto bet", error);
        clearActiveRound();
      });
      return;
    }

    if (type === "action:cashout" || type === "finalize-bet") {
      clearActiveRound();
    }
  };

  serverRelay.addEventListener("outgoing", gameActionHandler);

  const initializationPromise = autoInitialize
    ? initializeServerConnection({
        relay: serverRelay,
        url: serverUrl,
        scratchGameId,
      }).catch((error) => {
        console.error("Server initialization failed", error);
        throw error;
      })
    : null;

  return {
    element: serverPanel.container,
    setDemoMode: (enabled) => serverPanel.setDemoMode(enabled),
    show: () => serverPanel.show(),
    hide: () => serverPanel.hide(),
    isVisible: () => serverPanel.isVisible(),
    initialize: () =>
      initializeServerConnection({
        relay: serverRelay,
        url: serverUrl,
        scratchGameId,
      }),
    initialization: initializationPromise,
    destroy() {
      serverRelay.removeEventListener("outgoing", outgoingHandler);
      serverRelay.removeEventListener("outgoing", gameActionHandler);
      serverRelay.removeEventListener("incoming", incomingHandler);
      serverPanel.destroy();
    },
  };
}
