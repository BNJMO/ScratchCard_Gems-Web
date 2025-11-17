import tileTapDownSoundUrl from "../../assets/sounds/TileTapDown.wav";
import tileFlipSoundUrl from "../../assets/sounds/TileFlip.wav";
import tileHoverSoundUrl from "../../assets/sounds/TileHover.wav";
import gameStartSoundUrl from "../../assets/sounds/GameStart.wav";
import roundWinSoundUrl from "../../assets/sounds/Win.wav";
import roundLostSoundUrl from "../../assets/sounds/Lost.wav";
import twoMatchSoundUrl from "../../assets/sounds/2Match.wav";

export const DEFAULT_PALETTE = {
  appBg: 0x091b26,
  tileBase: 0x223845,
  tileInset: 0x223845,
  tileStroke: 0x223845,
  tileStrokeFlipped: 0x0f0f0f,
  tileElevationBase: 0x1b2931,
  tileElevationFlipped: 0x040c0f,
  tileElevationHover: 0x1f3f4c,
  tileElevationShadow: 0x091b26,
  hover: 0x35586b,
  pressedTint: 0x7a7a7a,
  defaultTint: 0xffffff,
  cardFace: 0x061217,
  cardFaceUnrevealed: 0x061217,
  cardInset: 0x061217,
  cardInsetUnrevealed: 0x061217,
  winPopupBorder: 0xeaff00,
  winPopupBackground: 0x091b26,
  winPopupMultiplierText: 0xeaff00,
  winPopupSeparationLine: 0x1b2931,
};

export const DEFAULT_GAME_CONFIG = {
  size: 600,
  backgroundColor: "#091B26",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Arial",
  grid: 3,
  mines: 1,
  autoResetDelayMs: 1000,
  iconSizePercentage: 0.7,
  iconRevealedSizeOpacity: 0.2,
  iconRevealedSizeFactor: 0.7,
  cardsSpawnDuration: 350,
  revealAllIntervalDelay: 40,
  strokeWidth: 1,
  gapBetweenTiles: 0.013,
  hoverEnabled: true,
  hoverEnterDuration: 120,
  hoverExitDuration: 200,
  hoverTiltAxis: "x",
  hoverSkewAmount: 0.0,
  disableAnimations: false,
  wiggleSelectionEnabled: true,
  wiggleSelectionDuration: 900,
  wiggleSelectionTimes: 15,
  wiggleSelectionIntensity: 0.03,
  wiggleSelectionScale: 0.005,
  flipDelayMin: 150,
  flipDelayMax: 500,
  flipDuration: 300,
  flipEaseFunction: "easeInOutSine",
  svgRasterizationResolutionMultiplier: 2,
  tileTapDownSoundPath: tileTapDownSoundUrl,
  tileFlipSoundPath: tileFlipSoundUrl,
  tileHoverSoundPath: tileHoverSoundUrl,
  gameStartSoundPath: gameStartSoundUrl,
  roundWinSoundPath: roundWinSoundUrl,
  roundLostSoundPath: roundLostSoundUrl,
  twoMatchSoundPath: twoMatchSoundUrl,
  winPopupShowDuration: 260,
  winPopupWidth: 260,
  winPopupHeight: 200,
  palette: DEFAULT_PALETTE,
};

const DATA_ATTRIBUTE_MAPPING = {
  grid: "gridSize",
  size: "gridSizePixels",
  mines: "mines",
  autoResetDelayMs: "autoResetDelay",
  disableAnimations: "disableAnimations",
};

const ENV_MAPPING = {
  grid: ["VITE_GAME_GRID", "VITE_GRID_SIZE"],
  size: ["VITE_GAME_SIZE"],
  mines: ["VITE_GAME_MINES"],
  disableAnimations: ["VITE_GAME_DISABLE_ANIMATIONS", "VITE_DISABLE_ANIMATIONS"],
  autoResetDelayMs: ["VITE_GAME_AUTO_RESET_DELAY_MS"],
};

function coerceNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function coerceBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(normalized);
  }
  return Boolean(value);
}

function clampValue(name, value, { min, max, integer = false }, fallback, errors) {
  if (!Number.isFinite(value)) {
    errors.push(`${name} must be a finite number. Using ${fallback}.`);
    return fallback;
  }
  let nextValue = integer ? Math.round(value) : value;
  if (typeof min === "number" && nextValue < min) {
    errors.push(`${name} of ${value} is below minimum ${min}. Clamping to ${min}.`);
    nextValue = min;
  }
  if (typeof max === "number" && nextValue > max) {
    errors.push(`${name} of ${value} exceeds maximum ${max}. Clamping to ${max}.`);
    nextValue = max;
  }
  return nextValue;
}

function sanitizePalette(palette, errors) {
  const sanitized = { ...DEFAULT_PALETTE };
  if (!palette || typeof palette !== "object") {
    return sanitized;
  }

  for (const [key, value] of Object.entries(palette)) {
    if (value == null) continue;
    const numericValue = typeof value === "string" ? Number(value) : value;
    if (!Number.isFinite(numericValue)) {
      errors.push(`Palette value for "${key}" is not numeric. Falling back to default.`);
      continue;
    }
    sanitized[key] = numericValue;
  }

  return sanitized;
}

function validateSoundPath(key, value, fallback, errors) {
  if (value == null) return fallback;
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`Sound path for ${key} must be a non-empty string. Using default.`);
    return fallback;
  }
  const trimmed = value.trim();
  const hasValidExtension = /\.(wav|mp3|ogg)(?:$|\?)/i.test(trimmed);
  if (!hasValidExtension) {
    errors.push(
      `Sound path for ${key} (${trimmed}) does not look like an audio asset (.wav/.mp3/.ogg). Using default.`,
    );
    return fallback;
  }
  return trimmed;
}

function extractDatasetOverrides(dataset = {}) {
  const overrides = {};
  for (const [key, dataKey] of Object.entries(DATA_ATTRIBUTE_MAPPING)) {
    if (!Object.prototype.hasOwnProperty.call(dataset, dataKey)) continue;
    const rawValue = dataset[dataKey];
    if (key === "disableAnimations") {
      overrides[key] = coerceBoolean(rawValue);
    } else {
      const numeric = coerceNumber(rawValue);
      if (numeric != null) {
        overrides[key] = numeric;
      }
    }
  }
  return overrides;
}

function extractEnvOverrides(envSource = {}) {
  const overrides = {};
  for (const [key, envKeys] of Object.entries(ENV_MAPPING)) {
    for (const envKey of envKeys) {
      if (envSource?.[envKey] == null) continue;
      const value = envSource[envKey];
      if (key === "disableAnimations") {
        overrides[key] = coerceBoolean(value);
      } else {
        const numeric = coerceNumber(value);
        if (numeric != null) {
          overrides[key] = numeric;
        }
      }
      break;
    }
  }
  return overrides;
}

export function validateGameConfig(config) {
  const errors = [];
  const merged = {
    ...DEFAULT_GAME_CONFIG,
    ...(config || {}),
  };

  merged.palette = sanitizePalette(merged.palette, errors);

  merged.grid = clampValue(
    "Grid size",
    coerceNumber(merged.grid) ?? DEFAULT_GAME_CONFIG.grid,
    { min: 2, max: 10, integer: true },
    DEFAULT_GAME_CONFIG.grid,
    errors,
  );

  const maxMines = Math.max(1, merged.grid * merged.grid - 1);
  merged.mines = clampValue(
    "Mines",
    coerceNumber(merged.mines) ?? DEFAULT_GAME_CONFIG.mines,
    { min: 1, max: maxMines, integer: true },
    DEFAULT_GAME_CONFIG.mines,
    errors,
  );

  merged.size = clampValue(
    "Canvas size",
    coerceNumber(merged.size) ?? DEFAULT_GAME_CONFIG.size,
    { min: 200, max: 2000, integer: true },
    DEFAULT_GAME_CONFIG.size,
    errors,
  );

  merged.autoResetDelayMs = clampValue(
    "Auto reset delay",
    coerceNumber(merged.autoResetDelayMs) ?? DEFAULT_GAME_CONFIG.autoResetDelayMs,
    { min: 200, max: 10000, integer: true },
    DEFAULT_GAME_CONFIG.autoResetDelayMs,
    errors,
  );

  merged.iconSizePercentage = clampValue(
    "Icon size",
    coerceNumber(merged.iconSizePercentage) ?? DEFAULT_GAME_CONFIG.iconSizePercentage,
    { min: 0.1, max: 1 },
    DEFAULT_GAME_CONFIG.iconSizePercentage,
    errors,
  );

  merged.iconRevealedSizeFactor = clampValue(
    "Revealed icon scale",
    coerceNumber(merged.iconRevealedSizeFactor) ?? DEFAULT_GAME_CONFIG.iconRevealedSizeFactor,
    { min: 0.1, max: 1 },
    DEFAULT_GAME_CONFIG.iconRevealedSizeFactor,
    errors,
  );

  merged.gapBetweenTiles = clampValue(
    "Gap between tiles",
    coerceNumber(merged.gapBetweenTiles) ?? DEFAULT_GAME_CONFIG.gapBetweenTiles,
    { min: 0, max: 0.2 },
    DEFAULT_GAME_CONFIG.gapBetweenTiles,
    errors,
  );

  merged.flipDelayMin = clampValue(
    "Minimum flip delay",
    coerceNumber(merged.flipDelayMin) ?? DEFAULT_GAME_CONFIG.flipDelayMin,
    { min: 0, max: 5000, integer: true },
    DEFAULT_GAME_CONFIG.flipDelayMin,
    errors,
  );

  merged.flipDelayMax = clampValue(
    "Maximum flip delay",
    coerceNumber(merged.flipDelayMax) ?? DEFAULT_GAME_CONFIG.flipDelayMax,
    { min: merged.flipDelayMin, max: 8000, integer: true },
    DEFAULT_GAME_CONFIG.flipDelayMax,
    errors,
  );

  merged.flipDuration = clampValue(
    "Flip duration",
    coerceNumber(merged.flipDuration) ?? DEFAULT_GAME_CONFIG.flipDuration,
    { min: 50, max: 5000, integer: true },
    DEFAULT_GAME_CONFIG.flipDuration,
    errors,
  );

  merged.cardsSpawnDuration = clampValue(
    "Card spawn duration",
    coerceNumber(merged.cardsSpawnDuration) ?? DEFAULT_GAME_CONFIG.cardsSpawnDuration,
    { min: 50, max: 5000, integer: true },
    DEFAULT_GAME_CONFIG.cardsSpawnDuration,
    errors,
  );

  merged.revealAllIntervalDelay = clampValue(
    "Reveal-all interval",
    coerceNumber(merged.revealAllIntervalDelay) ?? DEFAULT_GAME_CONFIG.revealAllIntervalDelay,
    { min: 5, max: 5000, integer: true },
    DEFAULT_GAME_CONFIG.revealAllIntervalDelay,
    errors,
  );

  merged.disableAnimations = Boolean(merged.disableAnimations);

  const soundKeys = [
    "tileTapDownSoundPath",
    "tileFlipSoundPath",
    "tileHoverSoundPath",
    "gameStartSoundPath",
    "roundWinSoundPath",
    "roundLostSoundPath",
    "twoMatchSoundPath",
  ];

  for (const soundKey of soundKeys) {
    const fallback = DEFAULT_GAME_CONFIG[soundKey];
    merged[soundKey] = validateSoundPath(soundKey, merged[soundKey], fallback, errors);
  }

  if (
    merged.svgRasterizationResolutionMultiplier != null &&
    !Number.isFinite(merged.svgRasterizationResolutionMultiplier)
  ) {
    errors.push(
      `SVG rasterization multiplier must be numeric. Using ${DEFAULT_GAME_CONFIG.svgRasterizationResolutionMultiplier}.`,
    );
    merged.svgRasterizationResolutionMultiplier =
      DEFAULT_GAME_CONFIG.svgRasterizationResolutionMultiplier;
  }

  return { config: merged, errors };
}

export function resolveGameConfig({ mount, env } = {}) {
  const datasetOverrides = extractDatasetOverrides(mount?.dataset ?? {});
  const envOverrides = extractEnvOverrides(env ?? (typeof import.meta !== "undefined" ? import.meta.env ?? {} : {}));

  const merged = {
    ...DEFAULT_GAME_CONFIG,
    ...envOverrides,
    ...datasetOverrides,
  };

  const { config, errors } = validateGameConfig(merged);
  if (errors.length > 0) {
    for (const message of errors) {
      console.error(`[game-config] ${message}`);
    }
  }
  return { config, errors };
}
