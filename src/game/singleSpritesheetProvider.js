import { Assets, Rectangle, Texture } from "pixi.js";
import gameConfig from "../gameConfig.json";

const spritesheetConfig =
  gameConfig?.gameplay?.singleSpritesheetProvider ?? {};
const SPRITESHEET_COLUMNS = Number.isFinite(spritesheetConfig.columns)
  ? spritesheetConfig.columns
  : 1;
const SPRITESHEET_ROWS = Number.isFinite(spritesheetConfig.rows)
  ? spritesheetConfig.rows
  : 1;
const MAX_FRAMES = SPRITESHEET_COLUMNS * SPRITESHEET_ROWS;
const SPRITESHEET_TOTAL_FRAMES = Number.isFinite(spritesheetConfig.totalFrames)
  ? Math.min(Math.max(spritesheetConfig.totalFrames, 0), MAX_FRAMES)
  : MAX_FRAMES;
const SPRITESHEET_SPEED = Number.isFinite(spritesheetConfig.speed)
  ? spritesheetConfig.speed
  : null;

const SPRITESHEET_MODULES = import.meta.glob(
  "../../assets/sprites/cardTypes/animated/*.png",
  { eager: true }
);

const SPRITESHEET_ENTRIES = Object.entries(SPRITESHEET_MODULES)
  .map(([path, mod]) => {
    const texturePath =
      typeof mod === "string" ? mod : mod?.default ?? mod ?? null;
    if (!texturePath) {
      return null;
    }
    const match = path.match(/\/([0-9]+)\.png$/i);
    const order = match ? Number.parseInt(match[1], 10) : Number.NaN;
    return {
      path,
      texturePath,
      order: Number.isFinite(order) ? order : Number.POSITIVE_INFINITY,
      key: match ? `cardType_${match[1]}` : null,
    };
  })
  .filter(Boolean)
  .sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.path.localeCompare(b.path);
  });

let cachedAnimations = null;
let loadingPromise = null;
let retainedSpritesheets = [];

function sliceSpritesheet(baseTexture) {
  const frames = [];
  const width = baseTexture?.width ?? 0;
  const height = baseTexture?.height ?? 0;
  if (!width || !height || !SPRITESHEET_COLUMNS || !SPRITESHEET_ROWS) {
    return frames;
  }

  const cellWidth = width / SPRITESHEET_COLUMNS;
  const cellHeight = height / SPRITESHEET_ROWS;

  for (let frameIndex = 0; frameIndex < SPRITESHEET_TOTAL_FRAMES; frameIndex += 1) {
    const row = Math.floor(frameIndex / SPRITESHEET_COLUMNS);
    const col = frameIndex % SPRITESHEET_COLUMNS;
    if (row >= SPRITESHEET_ROWS) {
      break;
    }

    const frame = new Rectangle(
      col * cellWidth,
      row * cellHeight,
      cellWidth,
      cellHeight
    );
    frames.push(
      new Texture({
        source: baseTexture,
        frame,
      })
    );
  }

  return frames;
}

async function loadTexture(path) {
  if (!path) return null;
  try {
    return await Assets.load(path);
  } catch (error) {
    console.error("Failed to load spritesheet texture", path, error);
    return null;
  }
}

async function buildAnimations() {
  const animations = [];
  const loadedSheets = [];

  for (const entry of SPRITESHEET_ENTRIES) {
    const texture = await loadTexture(entry.texturePath);
    if (!texture) continue;

    loadedSheets.push(texture);
    const baseTexture = texture.baseTexture ?? texture.source ?? null;
    if (!baseTexture) {
      continue;
    }
    const frames = sliceSpritesheet(baseTexture);
    const key = entry.key ?? `cardType_${animations.length}`;
    animations.push({
      key,
      frames,
      texture: frames[0] ?? texture,
    });
  }

  retainedSpritesheets = loadedSheets;

  return animations;
}

export async function loadCardTypeAnimations() {
  if (cachedAnimations) {
    return cachedAnimations;
  }
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = buildAnimations()
    .then((animations) => {
      cachedAnimations = animations;
      loadingPromise = null;
      return cachedAnimations;
    })
    .catch((error) => {
      console.error("Failed to build card type animations", error);
      loadingPromise = null;
      cachedAnimations = [];
      return cachedAnimations;
    });

  return loadingPromise;
}

export function getSpritesheetAnimationSpeed() {
  return SPRITESHEET_SPEED;
}
