import { Assets } from "pixi.js";
import { GameScene } from "./gameScene.js";
import { GameRules } from "./gameRules.js";
import { DEFAULT_GAME_CONFIG, DEFAULT_PALETTE } from "../config/gameConfig.js";
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

const CARD_TYPE_TEXTURES = (() => {
  const modules = import.meta.glob(
    "../../assets/sprites/cardTypes/cardType_*.svg",
    { eager: true }
  );
  return Object.entries(modules).map(([path, mod]) => {
    const match = path.match(/cardType_([^/]+)\.svg$/i);
    const id = match?.[1] ?? path;
    const texturePath =
      typeof mod === "string" ? mod : mod?.default ?? mod ?? null;
    return {
      key: id,
      texturePath,
    };
  });
})();

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

function isAutoModeActive(getMode) {
  try {
    return String(getMode?.() ?? "manual").toLowerCase() === "auto";
  } catch (error) {
    console.warn("getMode failed", error);
    return false;
  }
}

export async function createGame(mount, opts = {}) {
  const fallbackConfig = DEFAULT_GAME_CONFIG ?? {};
  const GRID = Math.max(
    2,
    Math.min(10, Math.floor(opts.grid ?? fallbackConfig.grid ?? 3)),
  );
  const fontFamily =
    opts.fontFamily ?? fallbackConfig.fontFamily ?? "Inter, system-ui, -apple-system, Segoe UI, Arial";
  const initialSize = Math.max(1, opts.size ?? fallbackConfig.size ?? 400);
  const onCardSelected = opts.onCardSelected ?? (() => {});
  const onChange = opts.onChange ?? (() => {});
  const getMode =
    typeof opts.getMode === "function" ? () => opts.getMode() : () => "manual";
  const palette = {
    ...DEFAULT_PALETTE,
    ...(fallbackConfig.palette ?? {}),
    ...(opts.palette ?? {}),
  };

  const backgroundColor =
    opts.backgroundColor ?? fallbackConfig.backgroundColor ?? palette.appBg;

  let disableAnimations = Boolean(
    opts.disableAnimations ?? fallbackConfig.disableAnimations ?? false,
  );

  const iconSizePercentage =
    opts.iconSizePercentage ?? fallbackConfig.iconSizePercentage ?? 0.7;
  const iconRevealedSizeFactor =
    opts.iconRevealedSizeFactor ??
    fallbackConfig.iconRevealedSizeFactor ??
    0.7;
  const cardsSpawnDuration =
    opts.cardsSpawnDuration ?? fallbackConfig.cardsSpawnDuration ?? 350;
  const revealAllIntervalDelay =
    opts.revealAllIntervalDelay ?? fallbackConfig.revealAllIntervalDelay ?? 40;
  const autoResetDelayMs = Number(
    opts.autoResetDelayMs ?? fallbackConfig.autoResetDelayMs ?? 1500,
  );
  const strokeWidth = opts.strokeWidth ?? fallbackConfig.strokeWidth ?? 1;
  const gapBetweenTiles =
    opts.gapBetweenTiles ?? fallbackConfig.gapBetweenTiles ?? 0.1;
  const flipDuration =
    opts.flipDuration ?? fallbackConfig.flipDuration ?? 300;
  const flipEaseFunction =
    opts.flipEaseFunction ??
    fallbackConfig.flipEaseFunction ??
    "easeInOutSine";

  const hoverOptions = {
    hoverEnabled: opts.hoverEnabled ?? fallbackConfig.hoverEnabled ?? true,
    hoverEnterDuration:
      opts.hoverEnterDuration ?? fallbackConfig.hoverEnterDuration ?? 120,
    hoverExitDuration:
      opts.hoverExitDuration ?? fallbackConfig.hoverExitDuration ?? 200,
    hoverSkewAmount:
      opts.hoverSkewAmount ?? fallbackConfig.hoverSkewAmount ?? 0.0,
    hoverTiltAxis: opts.hoverTiltAxis ?? fallbackConfig.hoverTiltAxis ?? "x",
  };

  const wiggleOptions = {
    wiggleSelectionEnabled:
      opts.wiggleSelectionEnabled ??
      fallbackConfig.wiggleSelectionEnabled ??
      true,
    wiggleSelectionDuration:
      opts.wiggleSelectionDuration ??
      fallbackConfig.wiggleSelectionDuration ??
      900,
    wiggleSelectionTimes:
      opts.wiggleSelectionTimes ?? fallbackConfig.wiggleSelectionTimes ?? 15,
    wiggleSelectionIntensity:
      opts.wiggleSelectionIntensity ??
      fallbackConfig.wiggleSelectionIntensity ??
      0.03,
    wiggleSelectionScale:
      opts.wiggleSelectionScale ?? fallbackConfig.wiggleSelectionScale ?? 0.005,
  };

  const winPopupOptions = {
    winPopupWidth:
      opts.winPopupWidth ?? fallbackConfig.winPopupWidth ?? 240,
    winPopupHeight:
      opts.winPopupHeight ?? fallbackConfig.winPopupHeight ?? 170,
  };

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
    const multiplier = Number(
      opts.svgRasterizationResolutionMultiplier ??
        fallbackConfig.svgRasterizationResolutionMultiplier,
    );
    const safeMultiplier = Number.isFinite(multiplier) && multiplier > 0
      ? multiplier
      : 2;
    const computed = Math.ceil(getDevicePixelRatio() * safeMultiplier);
    return Math.max(2, computed);
  })();

  const soundEffectPaths = {
    tileTapDown:
      opts.tileTapDownSoundPath ?? fallbackConfig.tileTapDownSoundPath,
    tileFlip: opts.tileFlipSoundPath ?? fallbackConfig.tileFlipSoundPath,
    tileHover: opts.tileHoverSoundPath ?? fallbackConfig.tileHoverSoundPath,
    gameStart: opts.gameStartSoundPath ?? fallbackConfig.gameStartSoundPath,
    roundWin: opts.roundWinSoundPath ?? fallbackConfig.roundWinSoundPath,
    roundLost: opts.roundLostSoundPath ?? fallbackConfig.roundLostSoundPath,
    twoMatch: opts.twoMatchSoundPath ?? fallbackConfig.twoMatchSoundPath,
  };

  if (!CARD_TYPE_TEXTURES.length) {
    throw new Error("No scratch card textures found under assets/sprites/cardTypes");
  }

  const defaultContentDefinitions = CARD_TYPE_TEXTURES.reduce(
    (acc, { key, texturePath }) => {
      acc[key] = {
        texturePath,
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
      return acc;
    },
    {}
  );

  const userContentDefinitions =
    opts.contentDefinitions ?? fallbackConfig.contentDefinitions ?? {};
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
    loadTexture(gameBackgroundSpriteUrl, { svgResolution: svgRasterizationResolution }),
    loadTexture(sparkSpriteUrl),
    loadTexture(winFrameSpriteUrl),
    loadTexture(tileUnflippedSpriteUrl, { svgResolution: svgRasterizationResolution }),
    loadTexture(tileHoveredSpriteUrl, { svgResolution: svgRasterizationResolution }),
    loadTexture(tileFlippedSpriteUrl, { svgResolution: svgRasterizationResolution }),
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
    cancelPendingAutoReveals();
    resetManualMatchTracking();
    for (const card of scene.cards) {
      card?.hideWinFrame?.();
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

      const faceKey = currentAssignments.get(key) ?? null;
      if (faceKey != null) {
        const content = contentLibrary[faceKey];
        if (content) {
          card.setInitialIcon(content, { iconSizePercentage });
        }
      }
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
    if (!card || card.revealed) return;
    clearScheduledAutoReveal(card);
    
    const content = contentLibrary[face] ?? {};
    const pitch = 0.9 + Math.random() * 0.2;
    soundManager.play("tileFlip", { speed: pitch });
    card._revealedFace = face;
    
    const isWinningFace =
      currentRoundOutcome.betResult === "win" &&
      currentRoundOutcome.winningKey != null &&
      face != null &&
      face === currentRoundOutcome.winningKey;
    const engagedWinningBefore =
      currentRoundOutcome.revealedWinning +
      currentRoundOutcome.pendingWinningReveals;
    
    // Cards are already face-up, just mark as revealed without flip animation
    card.revealed = true;
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
    
    if (typeof content.playSound === "function") {
      content.playSound({ revealedByPlayer, card });
    }
    
    // Immediately trigger completion callback
    const contentKey = content.key ?? face;
    handleCardRevealComplete(card, {
      content,
      key: contentKey,
      face: contentKey,
      revealedByPlayer,
    });
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
          if (!manualShakingCards.has(trackedCard)) {
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
      if (shouldPreserveWinShake) {
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
    const excludedCards = new Set(Array.isArray(exclude) ? exclude.filter(Boolean) : []);
    if (excludedCards.size === 0 && isAutoRevealInProgress()) {
      return;
    }

    // Instantly reveal the scratch cover
    scene.scratchLayer?.revealAllInstant?.();

    const unrevealed = scene.cards.filter(
      (card) =>
        !card.revealed &&
        !card.destroyed &&
        !card._animating &&
        !card._autoRevealScheduled &&
        !excludedCards.has(card)
    );
    if (!unrevealed.length) return;
    const ordered = [...unrevealed].sort((a, b) => (a.row === b.row ? a.col - b.col : a.row - b.row));

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
        const outcome = rules.revealResult({ row: card.row, col: card.col, result: assignedFace });
        revealCard(card, outcome.face, { revealedByPlayer: false, forceFullIconSize: true });
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

  function handlePointerOver(card) { /* disabled in scratch mode */ }
  function handlePointerOut(card) { /* disabled in scratch mode */ }
  function handlePointerDown(card) { /* disabled in scratch mode */ }
  function handlePointerUp(card) { /* disabled in scratch mode */ }

  scene.buildGrid({
    interactionFactory: () => ({
      onPointerOver: handlePointerOver,
      onPointerOut: handlePointerOut,
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onPointerUpOutside: handlePointerUp,
      onPointerTap: () => {},
    }),
  });

  registerCards();
  soundManager.play("gameStart");

  // Subscribe to scratch cover events after cards are registered
  if (scene.scratchLayer) {
    scene.scratchLayer.on("cardRevealed", ({ data }) => {
      if (!data) return;
      const key = `${data.row},${data.col}`;
      const card = cardsByKey.get(key);
      if (!card || card.revealed) return;
      const assignedFace = currentAssignments.get(key) ?? null;
      const outcome = rules.revealResult({ row: data.row, col: data.col, result: assignedFace });
      revealCard(card, outcome.face, { revealedByPlayer: true });
      notifyStateChange();
    });
  }

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
        onPointerTap: () => {},
      }),
    });
    registerCards();
    // Option B: persist scratch coverage until next game (do not reset cover here)
    notifyStateChange();
  }

  function setMines() {
    // Mines not used in scratch cards; function kept for API compatibility
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
    
    // Don't reset scratch mask - keep scratched areas visible
    // Only reset card reveal states
    if (scene.scratchLayer) {
      for (const card of scene.scratchLayer._cardCenters?.values() ?? []) {
        card.revealed = false;
      }
    }
    
    for (const [key, card] of cardsByKey.entries()) {
      card._assignedContent = currentAssignments.get(key) ?? null;
      const faceKey = currentAssignments.get(key) ?? null;
      if (faceKey != null) {
        const content = contentLibrary[faceKey];
        if (content) {
          card.setInitialIcon(content, { iconSizePercentage });
        }
      }
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
    const card = candidates[Math.floor(Math.random() * candidates.length)];
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
