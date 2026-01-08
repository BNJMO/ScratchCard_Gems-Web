import { Assets, Rectangle, Texture } from "pixi.js";
import { getFileExtension, resolveAssetFromGlob, filterEntriesByExtension } from "./assetResolver.js";

const SINGLE_SPRITESHEET_MODULES = import.meta.glob("../../assets/sprites/cardTypes/animated/*.{png,jpg,jpeg,webp}", {
  eager: true,
  import: "default"
});

const CARD_TYPE_EXTENSION = getFileExtension("cardTypes", ".png");

/**
 * Loads individual spritesheet files for animated cards
 * Each file contains all animation frames for a single card type
 */
export async function loadCardTypeAnimations(config = {}) {
  const {
    totalFrames = 8,
    columns = 4,
    rows = 2,
    speed = 0.14,
    animationSpeed = speed, // Use animationSpeed if provided, fallback to speed
    svgResolution = 2
  } = config;

  console.log("Loading single spritesheets with config:", { totalFrames, columns, rows, speed: animationSpeed });

  // Check if we have any modules loaded
  if (!SINGLE_SPRITESHEET_MODULES || Object.keys(SINGLE_SPRITESHEET_MODULES).length === 0) {
    console.warn("No single spritesheet modules found. Make sure assets/sprites/cardTypes/animated/ directory exists with PNG files.");
    return [];
  }

  const filteredEntries = filterEntriesByExtension(
    Object.entries(SINGLE_SPRITESHEET_MODULES),
    CARD_TYPE_EXTENSION,
    ".png"
  );

  const cardTypeEntries = filteredEntries
    .map(([path, mod]) => {
      const texturePath = typeof mod === "string" ? mod : mod?.default ?? null;
      if (!texturePath) {
        return null;
      }
      
      // Look for cardType_X.png pattern for single spritesheets
      const match = path.match(/cardType_(\d+)/i);
      if (!match) {
        console.warn(`Skipping file ${path} - single spritesheet files must be named cardType_0.png, cardType_1.png, etc.`);
        return null;
      }
      
      const order = Number.parseInt(match[1], 10);
      return {
        path,
        texturePath,
        order: Number.isFinite(order) ? order : Number.POSITIVE_INFINITY,
        key: `cardType_${match[1]}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.path.localeCompare(b.path);
    });

  if (!cardTypeEntries.length) {
    console.warn("No valid single spritesheet files found. Expected files like cardType_0.png, cardType_1.png, etc.");
    console.warn("Found files that don't match the pattern:", Object.keys(SINGLE_SPRITESHEET_MODULES));
    return [];
  }

  const results = [];

  for (const entry of cardTypeEntries) {
    try {
      // Load the spritesheet texture
      const baseTexture = await loadTexture(entry.texturePath, { svgResolution });
      if (!baseTexture) {
        console.warn(`Failed to load texture: ${entry.texturePath}`);
        continue;
      }

      console.log(`Loading spritesheet: ${entry.texturePath}`);
      console.log(`Base texture dimensions: ${baseTexture.width}x${baseTexture.height}`);

      // Extract individual frames from the spritesheet
      const frames = extractFramesFromSpritesheet(baseTexture, {
        totalFrames,
        columns,
        rows
      });

      if (frames.length === 0) {
        console.warn(`No frames extracted from: ${entry.texturePath}`);
        continue;
      }

      const key = entry.key ?? `cardType_${results.length}`;
      
      results.push({
        key,
        frames,
        texture: frames[0], // First frame as default texture
        speed: animationSpeed, // Use the resolved animation speed
        totalFrames: frames.length
      });

      console.log(`Loaded single spritesheet: ${key} with ${frames.length} frames, speed: ${animationSpeed}`);
    } catch (error) {
      console.error(`Error loading single spritesheet ${entry.texturePath}:`, error);
    }
  }

  console.log(`Successfully loaded ${results.length} single spritesheets`);
  return results;
}

/**
 * Extracts individual frame textures from a spritesheet
 */
function extractFramesFromSpritesheet(baseTexture, { totalFrames, columns, rows }) {
  const frames = [];
  
  if (!baseTexture || !baseTexture.source) {
    console.warn("Invalid base texture for frame extraction");
    return frames;
  }

  // Get texture dimensions - try multiple ways to ensure we get the right values
  const textureWidth = baseTexture.source?.width || baseTexture.width || 0;
  const textureHeight = baseTexture.source?.height || baseTexture.height || 0;
  
  console.log("Base texture info:", {
    width: baseTexture.width,
    height: baseTexture.height,
    sourceWidth: baseTexture.source?.width,
    sourceHeight: baseTexture.source?.height,
    finalWidth: textureWidth,
    finalHeight: textureHeight
  });
  
  if (!textureWidth || !textureHeight) {
    console.warn("Texture has invalid dimensions:", { textureWidth, textureHeight });
    return frames;
  }

  const frameWidth = Math.floor(textureWidth / columns);
  const frameHeight = Math.floor(textureHeight / rows);

  if (frameWidth <= 0 || frameHeight <= 0) {
    console.warn("Invalid frame dimensions:", { frameWidth, frameHeight, columns, rows });
    return frames;
  }

  // Ensure we don't try to extract more frames than the grid can hold
  const maxPossibleFrames = columns * rows;
  const actualFrameCount = Math.min(totalFrames, maxPossibleFrames);

  console.log("Frame extraction parameters:", { 
    textureWidth, 
    textureHeight, 
    frameWidth, 
    frameHeight, 
    columns, 
    rows, 
    requestedFrames: totalFrames,
    maxPossibleFrames,
    actualFrameCount 
  });

  for (let i = 0; i < actualFrameCount; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    
    const x = col * frameWidth;
    const y = row * frameHeight;

    // Ensure we don't go outside texture bounds
    if (x + frameWidth > textureWidth || y + frameHeight > textureHeight) {
      console.warn(`Frame ${i} would exceed texture bounds, skipping`);
      break;
    }

    try {
      const frameRect = new Rectangle(x, y, frameWidth, frameHeight);
      const frameTexture = new Texture({
        source: baseTexture.source,
        frame: frameRect
      });
      
      frames.push(frameTexture);
      console.log(`Created frame ${i}: x=${x}, y=${y}, w=${frameWidth}, h=${frameHeight}`);
    } catch (error) {
      console.error(`Error creating frame ${i}:`, error);
    }
  }

  console.log(`Successfully extracted ${frames.length} frames from spritesheet`);
  return frames;
}

/**
 * Load texture with optional SVG resolution
 */
async function loadTexture(path, options = {}) {
  if (!path) return null;
  
  try {
    const isSvg = typeof path === "string" && /\.svg(?:$|\?)/i.test(path);
    const asset = isSvg
      ? {
          src: path,
          data: {
            resolution: options.svgResolution || 2,
          },
        }
      : path;
    
    return await Assets.load(asset);
  } catch (error) {
    console.error("Single spritesheet texture load failed", path, error);
    return null;
  }
}