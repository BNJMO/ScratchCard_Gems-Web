import { Assets, Rectangle, Texture } from "pixi.js";

const SPRITESHEET_COLUMNS = 3;
const SPRITESHEET_ROWS = 4;
const SPRITESHEET_CELL_WIDTH = 152;
const SPRITESHEET_CELL_HEIGHT = 166;
const SPRITESHEET_HORIZONTAL_GAP = 4;
const SPRITESHEET_VERTICAL_GAP = 8;
const SPRITESHEET_PADDING_LEFT = 0;
const SPRITESHEET_PADDING_TOP = 0;
const SPRITESHEET_PADDING_RIGHT = 0;
const SPRITESHEET_PADDING_BOTTOM = 0;
// Scales the hardcoded cell metrics so higher-resolution spritesheets can be used.
const SPRITESHEET_RESOLUTION_FACTOR = 0.75;
const CARD_TYPE_COUNT = SPRITESHEET_COLUMNS * SPRITESHEET_ROWS;

const SPRITESHEET_MODULES = import.meta.glob(
  "../../assets/sprites/spritesheets/*.png",
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
// Retain references to the loaded spritesheet textures so that the
// underlying base textures remain alive while frame textures are in use.
let retainedSpritesheets = [];

function sliceSpritesheet(baseTexture) {
  const frames = [];
  const width = baseTexture?.width ?? 0;
  const height = baseTexture?.height ?? 0;
  const resolutionFactor = SPRITESHEET_RESOLUTION_FACTOR;
  const cellWidth = SPRITESHEET_CELL_WIDTH * resolutionFactor;
  const cellHeight = SPRITESHEET_CELL_HEIGHT * resolutionFactor;
  const horizontalGap = SPRITESHEET_HORIZONTAL_GAP * resolutionFactor;
  const verticalGap = SPRITESHEET_VERTICAL_GAP * resolutionFactor;
  const paddingLeft = SPRITESHEET_PADDING_LEFT * resolutionFactor;
  const paddingTop = SPRITESHEET_PADDING_TOP * resolutionFactor;
  const paddingRight = SPRITESHEET_PADDING_RIGHT * resolutionFactor;
  const paddingBottom = SPRITESHEET_PADDING_BOTTOM * resolutionFactor;

  for (let row = 0; row < SPRITESHEET_ROWS; row += 1) {
    for (let col = 0; col < SPRITESHEET_COLUMNS; col += 1) {
      const frameX = paddingLeft + col * cellWidth + col * horizontalGap;
      const frameY = paddingTop + row * cellHeight + row * verticalGap;

      if (
        frameX + cellWidth > width - paddingRight ||
        frameY + cellHeight > height - paddingBottom
      ) {
        frames.push(null);
        continue;
      }

      const frame = new Rectangle(frameX, frameY, cellWidth, cellHeight);
      frames.push(
        new Texture({
          source: baseTexture,
          frame,
        })
      );
    }
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
  const buckets = Array.from({ length: CARD_TYPE_COUNT }, () => []);
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

    frames.forEach((frameTexture, index) => {
      if (!frameTexture) {
        return;
      }
      const bucket = buckets[index];
      if (bucket) {
        bucket.push(frameTexture);
      } else {
        frameTexture.destroy(true);
      }
    });
  }

  retainedSpritesheets = loadedSheets;

  return buckets.map((textures, index) => ({
    key: `cardType_${index}`,
    frames: textures,
    texture: textures[0] ?? null,
  }));
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

export function getCardTypeCount() {
  return CARD_TYPE_COUNT;
}
