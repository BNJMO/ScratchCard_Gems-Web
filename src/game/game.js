import { Assets } from "pixi.js";
import { GameScene } from "./gameScene.js";
import { GameRules } from "./gameRules.js";
import { loadCardTypeAnimations } from "./spritesheetProvider.js";
import tileTapDownSoundUrl from "../../assets/sounds/TileTapDown.wav";
import tileFlipSoundUrl from "../../assets/sounds/TileFlip.wav";
import tileHoverSoundUrl from "../../assets/sounds/TileHover.wav";
import gameStartSoundUrl from "../../assets/sounds/GameStart.wav";
import roundWinSoundUrl from "../../assets/sounds/Win.wav";
import roundLostSoundUrl from "../../assets/sounds/Lost.wav";
import twoMatchSoundUrl from "../../assets/sounds/2Match.wav";
import sparkSpriteUrl from "../../assets/sprites/Spark.png";
import winFrameSpriteUrl from "../../assets/sprites/winFrame.svg";
import tileUnflippedSpriteUrl from "../../assets/sprites/tile_unflipped.svg";
import tileHoveredSpriteUrl from "../../assets/sprites/tile_hovered.svg";
import tileFlippedSpriteUrl from "../../assets/sprites/tile_flipped.svg";

const optionalBackgroundSpriteModules = import.meta.glob(
  "../../assets/sprites/game_background.svg",
  {
    eager: true,
  }
);

const gameBackgroundSpriteUrl = (() => {
  const module =
    optionalBackgroundSpriteModules["../../assets/sprites/game_background.svg"];
  if (!module) {
    return null;
  }
  return typeof module === "string" ? module : module?.default ?? null;
})();

const DEFAULT_CARD_ANIMATION_SPEED = 0.16;
const MS_PER_60FPS_FRAME = 1000 / 60;

const CARD_TYPE_TEXTURE_MODULES = import.meta.glob(
  "../../assets/sprites/cardTypes/static/cardType_*.svg",
  { eager: true }
);

const DEFAULT_PALETTE = {
  appBg: 0x091b26,
  tileBase: 0x223845, // main tile face
  tileInset: 0x223845, // inner inset
  tileStroke: 0x223845, // subtle outline
  tileStrokeFlipped: 0x0f0f0f, // subtle outline
  tileElevationBase: 0x152a33, // visible lip beneath tile face
  tileElevationFlipped: 0x040c0f, // revealed tile elevation lip
  tileElevationHover: 0x1f3f4c, // hover elevation lip
  tileElevationBase: 0x1b2931,
  tileElevationShadow: 0x091b26, // soft drop shadow
  hover: 0x35586b, // hover
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

const WIN_FACE_COLOR = 0x061217;

const SOUND_ALIASES = {
  tileHover: "mines.tileHover",
  tileTapDown: "mines.tileTapDown",
  tileFlip: "mines.tileFlip",
  gameStart: "mines.gameStart",
  roundWin: "mines.roundWin",
  roundLost: "mines.roundLost",
  twoMatch: "mines.twoMatch",
};

function createDummySound() {
  return {
    add: (_, options) => {
      if (options?.loaded) {
        setTimeout(() => options.loaded(), 0);
      }
    },
    play: () => {},
    stop: () => {},
    exists: () => false,
  };
}

async function loadSoundLibrary() {
  try {
    const soundModule = await import("@pixi/sound");
    return soundModule.sound;
  } catch (error) {
    console.warn("Sounds disabled:", error.message);
    return createDummySound();
  }
}

function getDevicePixelRatio() {
  if (typeof window === "undefined") {
    return 1;
  }
  const ratio = Number(window.devicePixelRatio);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

function resolveSvgResolution(svgResolution) {
  if (Number.isFinite(svgResolution) && svgResolution > 0) {
    return svgResolution;
  }
  const defaultMultiplier = 2;
  const resolution = getDevicePixelRatio() * defaultMultiplier;
  return Math.max(2, Math.ceil(resolution));
}

async function loadTexture(path, options = {}) {
  if (!path) return null;
  try {
    const isSvg = typeof path === "string" && /\.svg(?:$|\?)/i.test(path);
    const asset = isSvg
      ? {
          src: path,
          data: {
            resolution: resolveSvgResolution(options.svgResolution),
          },
        }
      : path;
    return await Assets.load(asset);
  } catch (error) {
    console.error("Texture load failed", path, error);
    return null;
  }
}

function getCardTypeTextureEntries() {
  return Object.entries(CARD_TYPE_TEXTURE_MODULES)
    .map(([path, mod]) => {
      const texturePath = typeof mod === "string" ? mod : mod?.default ?? null;
      if (!texturePath) {
        return null;
      }
      const match = path.match(/cardType_(\d+)/i);
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
}

async function loadCardTypeTextures({ svgResolution } = {}) {
  const entries = getCardTypeTextureEntries();
  const textures = [];

  for (const entry of entries) {
    const texture = await loadTexture(entry.texturePath, { svgResolution });
    if (!texture) {
      continue;
    }
    const key = entry.key ?? `cardType_${textures.length}`;
    textures.push({
      key,
      frames: [texture],
      texture,
    });
  }

  return textures;
}

function getSoundAlias(key) {
  return SOUND_ALIASES[key] ?? `mines.${key}`;
}

function createSoundManager(sound, soundEffectPaths) {
  const enabledSoundKeys = Object.entries(soundEffectPaths)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);

  for (const key of enabledSoundKeys) {
    const alias = getSoundAlias(key);
    if (!alias || sound.exists(alias)) continue;
    sound.add(alias, {
      url: soundEffectPaths[key],
      preload: true,
      loaded: () => {},
    });
  }

  return {
    play(name, options) {
      const alias = getSoundAlias(name);
      if (!alias || !sound.exists(alias)) return;
      sound.play(alias, options);
    },
  };
}

function sanitizeAnimationFrames(frames) {
  if (!Array.isArray(frames)) {
    return [];
  }
  return frames.filter((texture) => Boolean(texture));
}

function createAnimatedIconConfigurator(
  frames,
  { animationSpeed = DEFAULT_CARD_ANIMATION_SPEED } = {}
) {
  const textures = sanitizeAnimationFrames(frames);
  if (!textures.length) {
    return null;
  }

  const hasAnimation = textures.length > 1;
  const firstTexture = textures[0] ?? null;
  const resolvedAnimationSpeed =
    typeof animationSpeed === "number" ? animationSpeed : DEFAULT_CARD_ANIMATION_SPEED;
  const shouldAnimate = hasAnimation && resolvedAnimationSpeed !== 0;

  const getNow = () =>
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  const animationTimeline = {
    anchorTime: getNow(),
  };

  const resolveSynchronizedTime = () => {
    if (!shouldAnimate || !textures.length) {
      return 0;
    }

    const elapsedMs = getNow() - animationTimeline.anchorTime;
    return (elapsedMs / MS_PER_60FPS_FRAME) * resolvedAnimationSpeed;
  };

  return (icon, context = {}) => {
    if (!icon) return;

    const shouldPlayAnimation = Boolean(
      context?.shouldPlayAnimation ?? true
    );
    const startFromFirstFrame = Boolean(context?.startFromFirstFrame);

    if (Array.isArray(icon.textures)) {
      const nextTextures = textures.slice();
      icon.textures = nextTextures;
      icon.loop = true;
      if (typeof resolvedAnimationSpeed === "number") {
        icon.animationSpeed = resolvedAnimationSpeed;
      }
      if (firstTexture) {
        icon.texture = firstTexture;
      }
      const canAnimate = shouldAnimate && shouldPlayAnimation;
      const timelineTime = canAnimate && !startFromFirstFrame
        ? resolveSynchronizedTime()
        : 0;
      let frameIndex = 0;
      if (canAnimate && textures.length > 0 && !startFromFirstFrame) {
        frameIndex = ((Math.floor(timelineTime) % textures.length) + textures.length) % textures.length;
      }

      if (typeof icon.gotoAndStop === "function") {
        icon.gotoAndStop(frameIndex);
      } else if ("currentFrame" in icon) {
        try {
          icon.currentFrame = frameIndex;
        } catch (error) {
          // ignore invalid frame assignments
        }
      }

      if (canAnimate) {
        if (startFromFirstFrame) {
          icon._currentTime = 0;
        } else if (Number.isFinite(timelineTime)) {
          icon._currentTime = timelineTime;
        }
      }

      if (canAnimate && typeof icon.play === "function") {
        icon.play();
      } else {
        icon.stop?.();
      }

      if (context && typeof context === "object") {
        context.animationHandled = true;
      }
    } else if (firstTexture) {
      icon.texture = firstTexture;
      if (context && typeof context === "object") {
        context.animationHandled = true;
      }
    }
  };
}

function isAutoModeActive(getMode) {
  try {
    return String(getMode?.() ?? "manual").toLowerCase() === "auto";
  } catch (error) {
    console.warn("getMode failed", error);
    return false;
  }
}

export async function createGame(mount, opts = {}) {
  const GRID = 3;
  const fontFamily =
    opts.fontFamily ?? "Inter, system-ui, -apple-system, Segoe UI, Arial";
  const initialSize = Math.max(1, opts.size ?? 400);
  const onCardSelected = opts.onCardSelected ?? (() => {});
  const onChange = opts.onChange ?? (() => {});
  const getMode =
    typeof opts.getMode === "function" ? () => opts.getMode() : () => "manual";
  const palette = {
    ...DEFAULT_PALETTE,
    ...(opts.palette ?? {}),
  };

  const backgroundColor = opts.backgroundColor ?? palette.appBg;

  let disableAnimations = Boolean(opts.disableAnimations ?? false);

  const iconSizePercentage = opts.iconSizePercentage ?? 0.7;
  const iconRevealedSizeFactor = opts.iconRevealedSizeFactor ?? 0.85;
  const iconScaleMultiplier = Math.max(0, opts.cardIconScale ?? 1.0);
  const iconOffsetX = Number(opts.cardIconOffsetX ?? 0) || 0;
  const iconOffsetY = Number(opts.cardIconOffsetY ?? 0) || 0;
  const matchShakeEnabled = opts.cardMatchShake ?? true;
  const cardSpritesheetAnimationSpeed = Number.isFinite(
    opts.cardSpritesheetAnimationSpeed
  )
    ? opts.cardSpritesheetAnimationSpeed
    : DEFAULT_CARD_ANIMATION_SPEED;
  const cardsSpawnDuration = opts.cardsSpawnDuration ?? 350;
  const revealAllIntervalDelay = opts.revealAllIntervalDelay ?? 40;
  const autoResetDelayMs = Number(opts.autoResetDelayMs ?? 1500);
  const strokeWidth = opts.strokeWidth ?? 1;
  const gapBetweenTiles = opts.gapBetweenTiles ?? 0.1;
  const flipDuration = opts.flipDuration ?? 300;
  const flipEaseFunction = opts.flipEaseFunction ?? "easeInOutSine";

  const hoverOptions = {
    hoverEnabled: opts.hoverEnabled ?? true,
    hoverEnterDuration: opts.hoverEnterDuration ?? 120,
    hoverExitDuration: opts.hoverExitDuration ?? 200,
    hoverSkewAmount: opts.hoverSkewAmount ?? 0.00,
    hoverTiltAxis: opts.hoverTiltAxis ?? "x",
  };

  const wiggleOptions = {
    wiggleSelectionEnabled: opts.wiggleSelectionEnabled ?? true,
    wiggleSelectionDuration: opts.wiggleSelectionDuration ?? 900,
    wiggleSelectionTimes: opts.wiggleSelectionTimes ?? 15,
    wiggleSelectionIntensity: opts.wiggleSelectionIntensity ?? 0.03,
    wiggleSelectionScale: opts.wiggleSelectionScale ?? 0.005,
  };

  const winPopupOptions = {
    winPopupWidth: opts.winPopupWidth ?? 240,
    winPopupHeight: opts.winPopupHeight ?? 170,
  };


  // Resolve mount element
  const root =
    typeof mount === "string" ? document.querySelector(mount) : mount;
  if (!root) throw new Error("createGame: mount element not found");

  root.style.position = root.style.position || "relative";
  root.style.aspectRatio = root.style.aspectRatio || "1 / 1";
  if (!root.style.width && !root.style.height) {
    root.style.width = "100%";
  }
  if (!root.style.maxWidth) {
    root.style.maxWidth = "100%";
  }

  function measureRootSize() {
    const rect = root.getBoundingClientRect();
    const width = Math.max(1, rect.width || root.clientWidth || initialSize);
    const height = Math.max(1, rect.height || root.clientHeight || width);
    return { width, height };
  }

  const svgRasterizationResolution = (() => {
    const absolute = Number(opts.svgRasterizationResolution);
    if (Number.isFinite(absolute) && absolute > 0) {
      return absolute;
    }
    const multiplier = Number(opts.svgRasterizationResolutionMultiplier);
    const safeMultiplier = Number.isFinite(multiplier) && multiplier > 0
      ? multiplier
      : 2;
    const computed = Math.ceil(getDevicePixelRatio() * safeMultiplier);
    return Math.max(2, computed);
  })();

  const soundEffectPaths = {
    tileTapDown: opts.tileTapDownSoundPath ?? tileTapDownSoundUrl,
    tileFlip: opts.tileFlipSoundPath ?? tileFlipSoundUrl,
    tileHover: opts.tileHoverSoundPath ?? tileHoverSoundUrl,
    gameStart: opts.gameStartSoundPath ?? gameStartSoundUrl,
    roundWin: opts.roundWinSoundPath ?? roundWinSoundUrl,
    roundLost: opts.roundLostSoundPath ?? roundLostSoundUrl,
    twoMatch: opts.twoMatchSoundPath ?? twoMatchSoundUrl,
  };

  const cardTypeEntries = (opts.useAnimatedSpritesheets ?? true)
    ? await loadCardTypeAnimations()
    : await loadCardTypeTextures({
        svgResolution: svgRasterizationResolution,
      });
  if (!cardTypeEntries.length) {
    throw new Error(
      opts.useAnimatedSpritesheets === false
        ? "No scratch card textures found under assets/sprites/cardTypes"
        : "No scratch card textures found under assets/sprites/spritesheets"
    );
  }

  const defaultContentDefinitions = cardTypeEntries.reduce(
    (acc, entry, index) => {
      const key = entry?.key ?? `cardType_${index}`;
      const sanitizedFrames = sanitizeAnimationFrames(entry?.frames);
      const primaryTexture = entry?.texture ?? sanitizedFrames[0] ?? null;
      const configureIcon = createAnimatedIconConfigurator(sanitizedFrames, {
        animationSpeed: cardSpritesheetAnimationSpeed,
      });

      const definition = {
        texture: primaryTexture,
        palette: {
          face: {
            revealed: palette.cardFace,
            unrevealed: palette.cardFaceUnrevealed,
          },
          inset: {
            revealed: palette.cardInset,
            unrevealed: palette.cardInsetUnrevealed,
          },
        },
      };

      if (configureIcon) {
        definition.configureIcon = configureIcon;
      }

      acc[key] = definition;
      return acc;
    },
    {}
  );

  const userContentDefinitions = opts.contentDefinitions ?? {};
  const mergedContentDefinitions = {};
  const contentKeys = new Set([
    ...Object.keys(defaultContentDefinitions),
    ...Object.keys(userContentDefinitions),
  ]);

  for (const key of contentKeys) {
    const merged = {
      ...(defaultContentDefinitions[key] ?? {}),
      ...(userContentDefinitions[key] ?? {}),
    };
    mergedContentDefinitions[key] = merged;
    if (merged.revealSoundPath && merged.revealSoundKey) {
      soundEffectPaths[merged.revealSoundKey] = merged.revealSoundPath;
    }
  }

  const sound = await loadSoundLibrary();
  const soundManager = createSoundManager(sound, soundEffectPaths);

  const contentLibrary = {};
  await Promise.all(
    Object.entries(mergedContentDefinitions).map(async ([key, definition]) => {
      const entry = { ...definition };
      let texture = entry.texture;
      if (!texture && entry.texturePath) {
        texture = await loadTexture(entry.texturePath, {
          svgResolution: svgRasterizationResolution,
        });
      }

      const playSound =
        typeof entry.playSound === "function"
          ? (context = {}) => entry.playSound({ key, ...context })
          : null;

      contentLibrary[key] = {
        key,
        texture,
        palette: entry.palette ?? {},
        fallbackPalette: entry.fallbackPalette ?? {},
        iconSizePercentage: entry.iconSizePercentage,
        iconRevealedSizeFactor: entry.iconRevealedSizeFactor,
        configureIcon: entry.configureIcon,
        onReveal: entry.onReveal,
        playSound,
      };
    })
  );


  const [
    gameBackgroundTexture,
    matchSparkTexture,
    winFrameTexture,
    tileDefaultTexture,
    tileHoverTexture,
    tileFlippedTexture,
  ] = await Promise.all([
    loadTexture(gameBackgroundSpriteUrl, {svgResolution: svgRasterizationResolution,}),
    loadTexture(sparkSpriteUrl),
    loadTexture(winFrameSpriteUrl),
    loadTexture(tileUnflippedSpriteUrl, {
      svgResolution: svgRasterizationResolution,
    }),
    loadTexture(tileHoveredSpriteUrl, {
      svgResolution: svgRasterizationResolution,
    }),
    loadTexture(tileFlippedSpriteUrl, {
      svgResolution: svgRasterizationResolution,
    }),
  ]);

  const scene = new GameScene({
    root,
    backgroundColor,
    initialSize,
    palette,
    fontFamily,
    gridSize: GRID,
    strokeWidth,
    cardOptions: {
      icon: {
        sizePercentage: iconSizePercentage,
        revealedSizeFactor: iconRevealedSizeFactor,
        scale: iconScaleMultiplier,
        offsetX: iconOffsetX,
        offsetY: iconOffsetY,
      },
      matchEffects: {
        sparkTexture: matchSparkTexture,
        sparkDuration: 1500,
      },
      frameTexture: winFrameTexture,
      stateTextures: {
        default: tileDefaultTexture,
        hover: tileHoverTexture,
        flipped: tileFlippedTexture,
      },
      winPopupWidth: winPopupOptions.winPopupWidth,
      winPopupHeight: winPopupOptions.winPopupHeight,
    },
    backgroundTexture: gameBackgroundTexture,
    layoutOptions: { gapBetweenTiles },
    animationOptions: {
      ...hoverOptions,
      ...wiggleOptions,
      cardsSpawnDuration,
      disableAnimations,
    },
  });

  await scene.init();

  const rules = new GameRules({ gridSize: GRID });

  const cardsByKey = new Map();
  const currentAssignments = new Map();
  const currentRoundOutcome = {
    betResult: null,
    winningKey: null,
    winningCountRequired: 0,
    revealedWinning: 0,
    pendingWinningReveals: 0,
    autoRevealTriggered: false,
    feedbackPlayed: false,
    soundKey: null,
    winningCards: new Set(),
    pendingReveals: 0,
    manualMatchPairsTriggered: 0,
    winFramesShown: false,
    winningAnimationsStarted: false,
  };
  const manualMatchTracker = new Map();
  const manualShakingCards = new Set();
  const scheduledAutoRevealTimers = new Set();

  function clearScheduledAutoReveal(card) {
    if (!card) return;
    const handle = card._autoRevealTimer;
    if (handle != null) {
      clearTimeout(handle);
      scheduledAutoRevealTimers.delete(handle);
      card._autoRevealTimer = null;
    }
    card._autoRevealScheduled = false;
  }

  function cancelPendingAutoReveals() {
    if (scheduledAutoRevealTimers.size > 0) {
      for (const handle of scheduledAutoRevealTimers) {
        clearTimeout(handle);
      }
      scheduledAutoRevealTimers.clear();
    }
    for (const card of scene.cards) {
      clearScheduledAutoReveal(card);
    }
  }

  function isAutoRevealInProgress() {
    if (scheduledAutoRevealTimers.size > 0) {
      return true;
    }
    for (const card of scene.cards) {
      if (card?._autoRevealScheduled) {
        return true;
      }
    }
    return false;
  }

  function stopAllMatchShakes({ preserve } = {}) {
    const preserveSet = preserve ? new Set(preserve) : null;
    const nextTracked = new Set();
    for (const card of manualShakingCards) {
      if (preserveSet?.has(card)) {
        nextTracked.add(card);
        continue;
      }
      card?.stopMatchShake?.();
    }
    manualShakingCards.clear();
    if (preserveSet) {
      for (const card of nextTracked) {
        manualShakingCards.add(card);
      }
    }
  }

  function resetManualMatchTracking() {
    manualMatchTracker.clear();
    currentRoundOutcome.manualMatchPairsTriggered = 0;
    stopAllMatchShakes();
  }

  function resetRoundOutcome() {
    currentRoundOutcome.betResult = null;
    currentRoundOutcome.winningKey = null;
    currentRoundOutcome.winningCountRequired = 0;
    currentRoundOutcome.revealedWinning = 0;
    currentRoundOutcome.pendingWinningReveals = 0;
    currentRoundOutcome.autoRevealTriggered = false;
    currentRoundOutcome.feedbackPlayed = false;
    currentRoundOutcome.soundKey = null;
    currentRoundOutcome.winningCards.clear();
    currentRoundOutcome.pendingReveals = 0;
    currentRoundOutcome.manualMatchPairsTriggered = 0;
    currentRoundOutcome.winFramesShown = false;
    currentRoundOutcome.winningAnimationsStarted = false;
    cancelPendingAutoReveals();
    resetManualMatchTracking();
    for (const card of scene.cards) {
      card?.hideWinFrame?.();
      card?.stopIconAnimation?.({ resetToFirstFrame: true });
    }
  }

  function applyRoundOutcomeMeta(meta = {}, assignments = []) {
    resetRoundOutcome();

    const betResult = typeof meta.betResult === "string" ? meta.betResult : null;
    currentRoundOutcome.betResult = betResult;

    if (betResult === "win" && meta.winningKey != null) {
      currentRoundOutcome.winningKey = meta.winningKey;
      const explicitCount = Number(meta.totalWinningCards);
      if (Number.isFinite(explicitCount) && explicitCount > 0) {
        currentRoundOutcome.winningCountRequired = explicitCount;
      } else {
        const derivedCount = assignments.filter(
          (entry) => entry?.contentKey === meta.winningKey
        ).length;
        currentRoundOutcome.winningCountRequired = derivedCount;
      }
    }

    if (betResult === "win") {
      currentRoundOutcome.soundKey = "roundWin";
    } else if (betResult === "lost") {
      currentRoundOutcome.soundKey = "roundLost";
    }
  }

  function registerCards() {
    cardsByKey.clear();
    for (const card of scene.cards) {
      const key = `${card.row},${card.col}`;
      cardsByKey.set(key, card);
      card.setDisableAnimations(disableAnimations);
      card._assignedContent = currentAssignments.get(key) ?? null;
      card._pendingWinningReveal = false;
      card._randomSelectionPending = false;
      clearScheduledAutoReveal(card);
      card.stopMatchShake?.();
    }
  }

  function notifyStateChange() {
    onChange(rules.getState());
  }

  function enterWaitingState(card) {
    rules.selectTile(card.row, card.col);
    const skew = typeof card.getSkew === "function" ? card.getSkew() : 0;
    card._tiltDir = skew >= 0 ? +1 : -1;
    card.wiggle();
    onCardSelected({ row: card.row, col: card.col, tile: card });
    notifyStateChange();
  }

  function revealCard(
    card,
    face,
    { revealedByPlayer = true, forceFullIconSize = false } = {}
  ) {
    if (!card) return;
    clearScheduledAutoReveal(card);
    const content = contentLibrary[face] ?? {};
    const pitch = 0.9 + Math.random() * 0.2;
    soundManager.play("tileFlip", { speed: pitch });
    card._revealedFace = face;
    const iconRevealFactor = forceFullIconSize ? 1 : iconRevealedSizeFactor;
    const isWinningFace =
      currentRoundOutcome.betResult === "win" &&
      currentRoundOutcome.winningKey != null &&
      face != null &&
      face === currentRoundOutcome.winningKey;
    const engagedWinningBefore =
      currentRoundOutcome.revealedWinning +
      currentRoundOutcome.pendingWinningReveals;
    const started = card.reveal({
      content,
      useSelectionTint: false,
      revealedByPlayer,
      iconSizePercentage,
      iconRevealedSizeFactor: iconRevealFactor,
      flipDuration,
      flipEaseFunction,
      onComplete: (instance, payload) => {
        currentRoundOutcome.pendingReveals = Math.max(
          0,
          currentRoundOutcome.pendingReveals - 1
        );
        handleCardRevealComplete(instance, payload);
      },
    });
    if (started) {
      currentRoundOutcome.pendingReveals += 1;
      card._pendingWinningReveal = Boolean(isWinningFace);
      if (isWinningFace) {
        currentRoundOutcome.pendingWinningReveals += 1;
        const engagedWinningAfter = engagedWinningBefore + 1;
        if (
          !currentRoundOutcome.autoRevealTriggered &&
          currentRoundOutcome.winningCountRequired > 0 &&
          engagedWinningAfter >= currentRoundOutcome.winningCountRequired
        ) {
          currentRoundOutcome.autoRevealTriggered = true;
          revealRemainingTiles({ exclude: [card] });
        }
      }
    }
    if (!started) {
      card._pendingWinningReveal = false;
    }
    if (typeof content.playSound === "function") {
      content.playSound({ revealedByPlayer, card });
    }
  }

  function handleCardRevealComplete(card, payload = {}) {
    if (!card) return;

    card._randomSelectionPending = false;

    const assignmentKey = `${card.row},${card.col}`;
    const payloadKey =
      payload?.key ??
      payload?.content?.key ??
      payload?.content?.face ??
      card?._revealedFace ??
      currentAssignments.get(assignmentKey) ??
      null;

    if (
      currentRoundOutcome.betResult === "win" &&
      currentRoundOutcome.winningKey != null &&
      payloadKey != null &&
      payloadKey === currentRoundOutcome.winningKey
    ) {
      currentRoundOutcome.revealedWinning += 1;
      currentRoundOutcome.winningCards.add(card);
    }

    const reachedWinningThreshold =
      currentRoundOutcome.betResult === "win" &&
      currentRoundOutcome.winningCountRequired > 0 &&
      currentRoundOutcome.revealedWinning >=
        currentRoundOutcome.winningCountRequired;
    if (
      reachedWinningThreshold &&
      !currentRoundOutcome.winFramesShown &&
      currentRoundOutcome.winningCards.size > 0
    ) {
      currentRoundOutcome.winFramesShown = true;
      for (const winningCard of currentRoundOutcome.winningCards) {
        winningCard?.fadeInWinFrame?.({ duration: 250 });
      }
    }

    if (
      reachedWinningThreshold &&
      !currentRoundOutcome.winningAnimationsStarted &&
      currentRoundOutcome.winningCards.size > 0
    ) {
      currentRoundOutcome.winningAnimationsStarted = true;
      for (const winningCard of currentRoundOutcome.winningCards) {
        winningCard?.playIconAnimation?.({ startFromFirstFrame: true });
      }
    }

    if (card._pendingWinningReveal) {
      currentRoundOutcome.pendingWinningReveals = Math.max(
        0,
        currentRoundOutcome.pendingWinningReveals - 1
      );
      card._pendingWinningReveal = false;
    }

    const state = rules.getState();

    const autoModeActive = isAutoModeActive(getMode);
    if (autoModeActive) {
      stopAllMatchShakes();
      manualMatchTracker.clear();
      currentRoundOutcome.manualMatchPairsTriggered = 0;
    } else if (payloadKey != null) {
      let tracked = manualMatchTracker.get(payloadKey);
      if (!tracked) {
        tracked = { cards: new Set(), triggered: false };
        manualMatchTracker.set(payloadKey, tracked);
      }
      tracked.cards.add(card);
      const eligibleForEffect =
        tracked.cards.size >= 2 && state.revealed < state.totalTiles;
      if (eligibleForEffect && !tracked.triggered) {
        tracked.triggered = true;
        currentRoundOutcome.manualMatchPairsTriggered += 1;
        const matchCount = currentRoundOutcome.manualMatchPairsTriggered;
        const pitchIncrease = Math.max(0, matchCount - 1) * 0.05;
        const playbackSpeed = 1 + pitchIncrease;
        soundManager.play("twoMatch", { speed: playbackSpeed });
        for (const trackedCard of tracked.cards) {
          trackedCard.playMatchSpark?.();
        }
      }
      if (eligibleForEffect) {
        for (const trackedCard of tracked.cards) {
          if (matchShakeEnabled && !manualShakingCards.has(trackedCard)) {
            trackedCard.startMatchShake?.();
            manualShakingCards.add(trackedCard);
          }
        }
      }
    }

    if (
      currentRoundOutcome.betResult === "win" &&
      !currentRoundOutcome.autoRevealTriggered &&
      currentRoundOutcome.winningKey != null &&
      currentRoundOutcome.winningCountRequired > 0 &&
      currentRoundOutcome.revealedWinning >=
        currentRoundOutcome.winningCountRequired &&
      state.revealed < state.totalTiles
    ) {
      currentRoundOutcome.autoRevealTriggered = true;
      revealRemainingTiles();
    }

    const allCardsRevealed = state.revealed >= state.totalTiles;
    const animationsCompleted = currentRoundOutcome.pendingReveals <= 0;

    if (allCardsRevealed) {
      const shouldPreserveWinShake =
        currentRoundOutcome.betResult === "win" &&
        currentRoundOutcome.winningCards.size > 0;
      if (shouldPreserveWinShake && matchShakeEnabled) {
        stopAllMatchShakes({ preserve: currentRoundOutcome.winningCards });
        for (const winningCard of currentRoundOutcome.winningCards) {
          if (!manualShakingCards.has(winningCard)) {
            winningCard.startMatchShake?.();
            manualShakingCards.add(winningCard);
          }
        }
      } else {
        stopAllMatchShakes();
      }
      manualMatchTracker.clear();
    }

    if (
      !currentRoundOutcome.feedbackPlayed &&
      allCardsRevealed &&
      animationsCompleted
    ) {
      currentRoundOutcome.feedbackPlayed = true;

      if (
        currentRoundOutcome.betResult === "win" &&
        currentRoundOutcome.winningCards.size > 0
      ) {
        for (const winningCard of currentRoundOutcome.winningCards) {
          winningCard.highlightWin?.({ faceColor: WIN_FACE_COLOR });
        }
      }

      currentRoundOutcome.winningCards.clear();

      if (currentRoundOutcome.soundKey) {
        soundManager.play(currentRoundOutcome.soundKey);
      }
    }
  }

  function revealRemainingTiles({ exclude = [] } = {}) {
    currentRoundOutcome.autoRevealTriggered = true;
    const excludedCards = new Set(
      Array.isArray(exclude) ? exclude.filter(Boolean) : []
    );
    if (excludedCards.size === 0 && isAutoRevealInProgress()) {
      return;
    }
    const unrevealed = scene.cards.filter(
      (card) =>
        !card.revealed &&
        !card.destroyed &&
        !card._animating &&
        !card._autoRevealScheduled &&
        !excludedCards.has(card)
    );
    if (!unrevealed.length) return;
    const ordered = [...unrevealed].sort((a, b) => {
      if (a.row === b.row) {
        return a.col - b.col;
      }
      return a.row - b.row;
    });

    ordered.forEach((card, index) => {
      clearScheduledAutoReveal(card);
      card._autoRevealScheduled = true;
      const assignedFace = currentAssignments.get(`${card.row},${card.col}`) ?? null;
      const delay = disableAnimations ? 0 : revealAllIntervalDelay * index;
      const handle = setTimeout(() => {
        scheduledAutoRevealTimers.delete(handle);
        card._autoRevealTimer = null;
        card._autoRevealScheduled = false;
        if (card.destroyed || card.revealed) {
          return;
        }
        const outcome = rules.revealResult({
          row: card.row,
          col: card.col,
          result: assignedFace,
        });
        revealCard(card, outcome.face, {
          revealedByPlayer: false,
          forceFullIconSize: true,
        });
        notifyStateChange();
      }, delay);
      scheduledAutoRevealTimers.add(handle);
      card._autoRevealTimer = handle;
    });
  }

  function handleCardTap(card) {
    const autoMode = isAutoModeActive(getMode);
    if (card.revealed || card._animating || rules.gameOver) return;

    if (autoMode) {
      return;
    }

    if (rules.waitingForChoice) return;

    card.taped = true;
    card.hover(false);
    enterWaitingState(card);
  }

  function handlePointerOver(card) {
    if (card.revealed || card._animating || rules.gameOver) return;
    if (isAutoModeActive(getMode)) return;
    soundManager.play("tileHover");
    card.hover(true);
  }

  function handlePointerOut(card) {
    if (card.revealed || card._animating) return;
    card.hover(false);
    if (card._pressed) {
      card._pressed = false;
      card.refreshTint();
    }
  }

  function handlePointerDown(card) {
    if (card.revealed || card._animating || rules.gameOver) return;
    if (isAutoModeActive(getMode)) return;
    soundManager.play("tileTapDown");
    card.setPressed(true);
  }

  function handlePointerUp(card) {
    if (card._pressed) {
      card.setPressed(false);
    }
  }

  scene.buildGrid({
    interactionFactory: () => ({
      onPointerOver: handlePointerOver,
      onPointerOut: handlePointerOut,
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onPointerUpOutside: handlePointerUp,
      onPointerTap: handleCardTap,
    }),
  });

  registerCards();
  soundManager.play("gameStart");

  function reset() {
    rules.reset();
    currentAssignments.clear();
    resetRoundOutcome();
    rules.setAssignments(currentAssignments);
    scene.hideWinPopup();
    scene.clearGrid();
    scene.buildGrid({
      interactionFactory: () => ({
        onPointerOver: handlePointerOver,
        onPointerOut: handlePointerOut,
        onPointerDown: handlePointerDown,
        onPointerUp: handlePointerUp,
        onPointerUpOutside: handlePointerUp,
        onPointerTap: handleCardTap,
      }),
    });
    registerCards();
    notifyStateChange();
  }

  function setMines() {
    // Mines are not used in Scratch Cards; this function exists for API
    // compatibility with the control panel.
  }

  function setRoundAssignments(assignments = [], meta = {}) {
    currentAssignments.clear();
    applyRoundOutcomeMeta(meta, assignments);
    for (const entry of assignments) {
      if (entry && typeof entry.row === "number" && typeof entry.col === "number") {
        const key = `${entry.row},${entry.col}`;
        currentAssignments.set(key, entry.contentKey ?? entry.result ?? null);
      }
    }
    rules.setAssignments(currentAssignments);
    for (const [key, card] of cardsByKey.entries()) {
      card._assignedContent = currentAssignments.get(key) ?? null;
    }
    notifyStateChange();
  }

  function revealSelectedCard(contentKey) {
    const selection = rules.selectedTile;
    if (!selection) return;
    const card = cardsByKey.get(`${selection.row},${selection.col}`);
    if (!card || card.revealed) return;
    const key = `${selection.row},${selection.col}`;
    const resolvedContent =
      contentKey ?? currentAssignments.get(key) ?? card._assignedContent;
    const outcome = rules.revealResult({ ...selection, result: resolvedContent });
    revealCard(card, outcome.face);
    rules.clearSelection();
    notifyStateChange();
  }

  function selectRandomTile() {
    const pendingSelection = rules.selectedTile;
    const candidates = scene.cards.filter((card) => {
      if (
        card.revealed ||
        card._animating ||
        card.destroyed ||
        card._randomSelectionPending
      ) {
        return false;
      }
      if (
        pendingSelection &&
        card.row === pendingSelection.row &&
        card.col === pendingSelection.col
      ) {
        return false;
      }
      return true;
    });
    if (!candidates.length) return null;
    const card =
      candidates[Math.floor(Math.random() * candidates.length)];
    card._randomSelectionPending = true;
    handleCardTap(card);
    return { row: card.row, col: card.col };
  }

  function revealAutoSelections(results = []) {
    if (!Array.isArray(results)) return;
    for (const entry of results) {
      const card = cardsByKey.get(`${entry.row},${entry.col}`);
      if (!card || card.revealed) continue;
      const outcome = rules.revealResult({
        row: entry.row,
        col: entry.col,
        result:
          entry.contentKey ?? entry.result ?? currentAssignments.get(`${entry.row},${entry.col}`),
      });
      revealCard(card, outcome.face, { revealedByPlayer: true });
    }
    notifyStateChange();
  }

  function getState() {
    return rules.getState();
  }

  function destroy() {
    scene.destroy();
    cardsByKey.clear();
    resetRoundOutcome();
  }

  function setAnimationsEnabled(enabled) {
    disableAnimations = !enabled;
    scene.setAnimationsEnabled(enabled);
  }

  function getAvailableContentKeys() {
    return Object.keys(contentLibrary);
  }

  return {
    app: scene.app,
    reset,
    setMines,
    getState,
    destroy,
    revealSelectedCard,
    selectRandomTile,
    revealAutoSelections,
    revealRemainingTiles,
    isAutoRevealInProgress,
    getAutoResetDelay: () => autoResetDelayMs,
    setAnimationsEnabled,
    setRoundAssignments,
    getCardContentKeys: getAvailableContentKeys,
  };
}
