import { AnimatedSprite, Container, Sprite, Texture } from "pixi.js";
import Ease from "../ease.js";

const AUTO_SELECTION_COLOR = 0xcfdd00;

/**
 * Card encapsulates the visual and interaction logic for a single tile on the grid.
 * It exposes a PIXI.Container that can be added to a parent scene while the
 * surrounding game container can control its behaviour via the provided
 * callbacks.
 */
export class Card {
  constructor({
    app,
    palette,
    animationOptions,
    iconOptions,
    matchEffects,
    frameTexture,
    stateTextures,
    row,
    col,
    tileSize,
    strokeWidth,
    disableAnimations,
    interactionCallbacks = {},
  }) {
    this.app = app;
    this.palette = palette;
    this.animationOptions = animationOptions;
    this.iconOptions = {
      sizePercentage: iconOptions?.sizePercentage ?? 0.7,
      revealedSizeFactor: iconOptions?.revealedSizeFactor ?? 0.85,
      scaleMultiplier: Math.max(0, iconOptions?.scale ?? 1.0),
      offsetX: Number(iconOptions?.offsetX ?? 0) || 0,
      offsetY: Number(iconOptions?.offsetY ?? 0) || 0,
    };
    this.matchEffects = {
      sparkTexture: matchEffects?.sparkTexture ?? null,
      sparkDuration: Math.max(0, matchEffects?.sparkDuration ?? 1500),
    };
    this.frameTexture = frameTexture ?? null;
    this.stateTextures = {
      default: stateTextures?.default ?? null,
      hover: stateTextures?.hover ?? null,
      flipped: stateTextures?.flipped ?? null,
    };
    this.row = row;
    this.col = col;
    this.strokeWidth = strokeWidth;
    this.disableAnimations = Boolean(disableAnimations);
    this.interactionCallbacks = interactionCallbacks;

    this.revealed = false;
    this.destroyed = false;
    this.isAutoSelected = false;
    this.taped = false;

    this._animating = false;
    this._pressed = false;
    this._hoverToken = null;
    this._wiggleToken = null;
    this._bumpToken = null;
    this._layoutScale = 1;
    this._shakeActive = false;
    this._shakeTicker = null;
    this._shakeIconBase = null;
    this._swapHandled = false;
    this._winHighlighted = false;
    this._winHighlightInterval = null;
    this._spawnTweenCancel = null;
    this._matchEffectsLayer = null;
    this._frameSprite = null;
    this._frameTweenCancel = null;
    this._activeSparkCleanup = null;

    this._tiltDir = 1;
    this._baseX = 0;
    this._baseY = 0;
    this._iconContentConfig = null;
    this._iconLastRevealContext = null;
    this._shadowContainer = null;
    this._shadowWrap = null;
    this._tileSprite = null;
    this._tileState = "default";
    this._isHovering = false;

    this.container = this.#createCard(tileSize);
    this.hideWinFrame();
  }

  setDisableAnimations(disabled) {
    this.disableAnimations = disabled;
    if (disabled) {
      this.#cancelSpawnAnimation();
      this.forceFlatPose();
      this.refreshTint();
      if (this._wrap?.scale?.set) {
        this._wrap.scale.set(1);
      }
      if (this._shadowWrap?.scale?.set) {
        this._shadowWrap.scale.set(1);
      }
      if (this._wrap) {
        this.setSkew(0);
      }
      if (this._frameSprite) {
        this._frameTweenCancel?.();
        this._frameTweenCancel = null;
      }
      this.stopIconAnimation({ resetToFirstFrame: true });
    }
  }

  get displayObject() {
    return this.container;
  }

  get shadowDisplayObject() {
    return this._shadowContainer;
  }

  setAutoSelected(selected, { refresh = true } = {}) {
    this.isAutoSelected = Boolean(selected);
    if (refresh) {
      this.refreshTint();
    }
  }

  applyTint(color) {
    if (!this._tileSprite) return;
    const fallback = this.palette.defaultTint ?? 0xffffff;
    this._tileSprite.tint = color ?? fallback;
  }

  refreshTint() {
    if (this.revealed) return;
    const base = this.isAutoSelected
      ? AUTO_SELECTION_COLOR
      : this.palette.defaultTint;
    this.applyTint(base);
  }

  setPressed(pressed) {
    this._pressed = pressed;
    if (!pressed) {
      this.refreshTint();
    } else {
      this.applyTint(this.palette.pressedTint);
    }
  }

  hover(on) {
    if (this.revealed || this._animating) return;
    const {
      hoverEnabled,
      hoverEnterDuration,
      hoverExitDuration,
      hoverSkewAmount,
      hoverTiltAxis,
    } = this.animationOptions;

    if (!hoverEnabled) return;

    const wrap = this._wrap;
    const shadowWrap = this._shadowWrap;
    const shadowContainer = this._shadowContainer;
    if (!wrap) return;

    this.#setHoverState(on);

    const startScale = wrap.scale.x;
    const endScale = on ? 1.03 : 1.0;
    const startSkew = this.getSkew();
    const endSkew = on ? hoverSkewAmount : 0;
    const startY = this.container.y;
    const endY = on ? this._baseY - 3 : this._baseY;
    const startShadowY = shadowContainer?.y ?? startY;
    const endShadowY = on ? this._baseY - 3 : this._baseY;

    const token = Symbol("card-hover");
    this._hoverToken = token;

    if (this.disableAnimations) {
      this._wrap.scale?.set?.(endScale);
      shadowWrap?.scale?.set?.(endScale);
      this.setSkew(endSkew);
      this.container.y = endY;
      if (shadowContainer) {
        shadowContainer.y = endShadowY;
      }
      return;
    }

    this.tween({
      duration: on ? hoverEnterDuration : hoverExitDuration,
      ease: (x) => (on ? 1 - Math.pow(1 - x, 3) : x * x * x),
      update: (p) => {
        if (this._hoverToken !== token) return;
        const scale = startScale + (endScale - startScale) * p;
        wrap.scale.x = wrap.scale.y = scale;
        if (shadowWrap?.scale) {
          shadowWrap.scale.x = shadowWrap.scale.y = scale;
        }
        const k = startSkew + (endSkew - startSkew) * p;
        this.setSkew(k);
        const nextY = startY + (endY - startY) * p;
        this.container.y = nextY;
        if (shadowContainer) {
          shadowContainer.y =
            startShadowY + (endShadowY - startShadowY) * p;
        }
      },
      complete: () => {
        if (this._hoverToken !== token) return;
        wrap.scale.x = wrap.scale.y = endScale;
        if (shadowWrap?.scale) {
          shadowWrap.scale.x = shadowWrap.scale.y = endScale;
        }
        this.setSkew(endSkew);
        this.container.y = endY;
        if (shadowContainer) {
          shadowContainer.y = endShadowY;
        }
      },
    });
  }

  stopHover() {
    this._hoverToken = Symbol("card-hover-cancel");
    this.#setHoverState(false);
  }

  wiggle() {
    const {
      wiggleSelectionEnabled,
      wiggleSelectionDuration,
      wiggleSelectionTimes,
      wiggleSelectionIntensity,
      wiggleSelectionScale,
    } = this.animationOptions;

    if (!wiggleSelectionEnabled || this._animating) return;

    const wrap = this._wrap;
    const shadowWrap = this._shadowWrap;
    const baseSkew = this.getSkew();
    const baseScale = wrap.scale.x;
    const baseShadowScale = shadowWrap?.scale?.x ?? null;

    this._animating = true;

    const token = Symbol("card-wiggle");
    this._wiggleToken = token;

    this.tween({
      duration: wiggleSelectionDuration,
      ease: (p) => p,
      update: (p) => {
        if (this._wiggleToken !== token) return;
        const wiggle =
          Math.sin(p * Math.PI * wiggleSelectionTimes) *
          wiggleSelectionIntensity;
        this.setSkew(baseSkew + wiggle);

        const scaleWiggle =
          1 +
          Math.sin(p * Math.PI * wiggleSelectionTimes) * wiggleSelectionScale;
        wrap.scale.x = wrap.scale.y = baseScale * scaleWiggle;
        if (shadowWrap?.scale && baseShadowScale != null) {
          const next = baseShadowScale * scaleWiggle;
          shadowWrap.scale.x = shadowWrap.scale.y = next;
        }
      },
      complete: () => {
        if (this._wiggleToken !== token) return;
        this.setSkew(baseSkew);
        wrap.scale.x = wrap.scale.y = baseScale;
        if (shadowWrap?.scale && baseShadowScale != null) {
          shadowWrap.scale.x = shadowWrap.scale.y = baseShadowScale;
        }
        this._animating = false;
      },
    });
  }

  stopWiggle() {
    this._wiggleToken = Symbol("card-wiggle-cancel");
    this._animating = false;
  }

  bump({ scaleMultiplier = 1.08, duration = 350 } = {}) {
    const wrap = this._wrap;
    if (!wrap) return;

    const baseScale = wrap.scale;
    if (!baseScale) return;

    const shadowWrap = this._shadowWrap;
    const shadowScale = shadowWrap?.scale ?? null;

    const baseScaleX = baseScale.x;
    const baseScaleY = baseScale.y;
    const targetScaleX = baseScaleX * scaleMultiplier;
    const targetScaleY = baseScaleY * scaleMultiplier;
    const shadowBaseScaleX = shadowScale?.x ?? null;
    const shadowBaseScaleY = shadowScale?.y ?? null;
    const shadowTargetScaleX =
      shadowBaseScaleX != null ? shadowBaseScaleX * scaleMultiplier : null;
    const shadowTargetScaleY =
      shadowBaseScaleY != null ? shadowBaseScaleY * scaleMultiplier : null;

    const token = Symbol("card-bump");
    this._bumpToken = token;

    if (this.disableAnimations || duration <= 0) {
      baseScale.x = baseScaleX;
      baseScale.y = baseScaleY;
      if (shadowScale && shadowBaseScaleX != null && shadowBaseScaleY != null) {
        shadowScale.x = shadowBaseScaleX;
        shadowScale.y = shadowBaseScaleY;
      }
      this._bumpToken = null;
      return;
    }

    const easeOut = (value) => 1 - Math.pow(1 - value, 3);

    this.tween({
      duration,
      ease: (t) => t,
      update: (t) => {
        const scale = wrap.scale;
        if (this._bumpToken !== token || this.destroyed || !scale) {
          return;
        }
        const phase = t < 0.5 ? easeOut(t / 0.5) : easeOut((1 - t) / 0.5);
        const nextScaleX = baseScaleX + (targetScaleX - baseScaleX) * phase;
        const nextScaleY = baseScaleY + (targetScaleY - baseScaleY) * phase;
        scale.x = nextScaleX;
        scale.y = nextScaleY;
        if (
          shadowScale &&
          shadowBaseScaleX != null &&
          shadowBaseScaleY != null &&
          shadowTargetScaleX != null &&
          shadowTargetScaleY != null
        ) {
          const nextShadowX =
            shadowBaseScaleX +
            (shadowTargetScaleX - shadowBaseScaleX) * phase;
          const nextShadowY =
            shadowBaseScaleY +
            (shadowTargetScaleY - shadowBaseScaleY) * phase;
          shadowScale.x = nextShadowX;
          shadowScale.y = nextShadowY;
        }
      },
      complete: () => {
        const scale = wrap.scale;
        if (this._bumpToken !== token || !scale) {
          this._bumpToken = null;
          return;
        }
        scale.x = baseScaleX;
        scale.y = baseScaleY;
        if (shadowScale && shadowBaseScaleX != null && shadowBaseScaleY != null) {
          shadowScale.x = shadowBaseScaleX;
          shadowScale.y = shadowBaseScaleY;
        }
        this._bumpToken = null;
      },
    });
  }

  playIconAnimation({ startFromFirstFrame = false } = {}) {
    if (this.disableAnimations || !this.revealed) {
      return;
    }

    const icon = this._icon;
    if (!icon || icon.destroyed) {
      return;
    }

    const iconContext = {
      card: this,
      revealedByPlayer: this._iconLastRevealContext?.revealedByPlayer ?? false,
      shouldPlayAnimation: true,
      startFromFirstFrame,
      animationHandled: false,
    };

    const configureIcon = this._iconContentConfig?.configureIcon;
    if (typeof configureIcon === "function") {
      configureIcon(icon, iconContext);
    }

    if (!iconContext.animationHandled && Array.isArray(icon.textures)) {
      if (startFromFirstFrame) {
        icon.gotoAndStop?.(0);
        if (typeof icon._currentTime === "number") {
          icon._currentTime = 0;
        }
      }
      if (icon.textures.length > 1 && typeof icon.play === "function") {
        icon.play();
      }
    }
  }

  stopIconAnimation({ resetToFirstFrame = false } = {}) {
    const icon = this._icon;
    if (!icon) {
      return;
    }
    icon.stop?.();
    if (resetToFirstFrame) {
      icon.gotoAndStop?.(0);
      if (typeof icon._currentTime === "number") {
        icon._currentTime = 0;
      }
    }
  }

  highlightWin({
    faceColor = 0xeaff00,
    scaleMultiplier = 1.03,
    duration = 260,
  } = {}) {
    if (!this.revealed || this._winHighlighted) {
      return;
    }

    this._winHighlighted = true;
    this.#stopWinHighlightLoop();
    this.flipFace(faceColor);
    this.bump({ scaleMultiplier, duration });
    this._winHighlightInterval = setInterval(() => {
      if (!this.revealed || this.destroyed) {
        this.#stopWinHighlightLoop();
        return;
      }
      this.bump({ scaleMultiplier, duration });
    }, 1000);
  }

  forceFlatPose() {
    if (!this._wrap?.scale || !this.container) return;
    this.stopMatchShake();
    this._wrap.scale.x = this._wrap.scale.y = 1;
    if (this._shadowWrap?.scale) {
      this._shadowWrap.scale.x = this._shadowWrap.scale.y = 1;
    }
    this.setSkew(0);
    this.container.x = this._baseX;
    this.container.y = this._baseY;
    this.container.rotation = 0;
    if (this._shadowContainer) {
      this._shadowContainer.x = this._baseX;
      this._shadowContainer.y = this._baseY;
      this._shadowContainer.rotation = 0;
    }
    this._shakeActive = false;
    this._bumpToken = null;
    this.#stopWinHighlightLoop();
  }

  reveal({
    content,
    useSelectionTint = false,
    revealedByPlayer = false,
    iconSizePercentage,
    iconRevealedSizeFactor,
    onComplete,
    flipDuration,
    flipEaseFunction,
  }) {
    if (!this._wrap || this.revealed) {
      return false;
    }

    if (this._animating) {
      this.stopWiggle();
    }

    if (this._animating) {
      return false;
    }

    this.#cancelSpawnAnimation();

    this._animating = true;
    if (this.container) {
      this.container.eventMode = "none";
      this.container.cursor = "default";
    }
    this.#stopWinHighlightLoop();
    this._winHighlighted = false;
    this.stopHover();
    this.stopWiggle();

    const easeFlip = Ease[flipEaseFunction] || ((t) => t);
    const wrap = this._wrap;
    const shadowWrap = this._shadowWrap;
    const tileSprite = this._tileSprite;
    const icon = this._icon;
    const tileSize = this._tileSize;
    const startScaleY = Math.max(1, wrap.scale.y);
    const startShadowScaleY = shadowWrap?.scale
      ? Math.max(1, shadowWrap.scale.y)
      : null;
    const startSkew = this.getSkew();
    const startTilt = this._tiltDir >= 0 ? +1 : -1;

    const palette = this.palette;
    const contentConfig = content ?? {};
    const contentKey =
      contentConfig.key ?? contentConfig.face ?? contentConfig.type ?? null;
    const shouldPlayIconAnimation = false;

    this._iconContentConfig = contentConfig;
    this._iconLastRevealContext = { revealedByPlayer };

    this.tween({
      duration: flipDuration,
      ease: (t) => easeFlip(t),
      update: (t) => {
        if (
          this.destroyed ||
          !wrap?.scale ||
          !tileSprite ||
          tileSprite.destroyed ||
          !icon ||
          icon.destroyed
        ) {
          return;
        }
        const widthFactor = Math.max(0.0001, Math.abs(Math.cos(Math.PI * t)));
        const elev = Math.sin(Math.PI * t);
        const popS = 1 + 0.06 * elev;
        const biasSkew = startTilt * 0.22 * Math.sin(Math.PI * t);
        const skewOut = startSkew * (1 - t) + biasSkew;

        wrap.scale.x = widthFactor * popS;
        wrap.scale.y = startScaleY * popS;
        if (shadowWrap?.scale) {
          const baseY = startShadowScaleY ?? startScaleY;
          shadowWrap.scale.x = widthFactor * popS;
          shadowWrap.scale.y = baseY * popS;
        }
        this.setSkew(skewOut);

        if (!this._swapHandled && t >= 0.5) {
          this._swapHandled = true;
          icon.stop?.();
          icon.gotoAndStop?.(0);
          icon.visible = true;
          const iconSizeFactor = revealedByPlayer
            ? 1.0
            : iconRevealedSizeFactor ??
              contentConfig.iconRevealedSizeFactor ??
              this.iconOptions.revealedSizeFactor;
          const baseSize =
            iconSizePercentage ??
            contentConfig.iconSizePercentage ??
            this.iconOptions.sizePercentage;
          const iconScaleMultiplier = this.iconOptions.scaleMultiplier ?? 1;
          const maxDimension =
            tileSize * baseSize * iconSizeFactor * iconScaleMultiplier;

          if (contentConfig.texture) {
            icon.texture = contentConfig.texture;
          }

          const iconContext = {
            card: this,
            revealedByPlayer,
            shouldPlayAnimation: shouldPlayIconAnimation,
            startFromFirstFrame: true,
            animationHandled: false,
          };

          contentConfig.configureIcon?.(icon, iconContext);

          const referenceTexture = contentConfig.texture ?? icon.texture ?? null;
          this.#applyIconSizing(icon, maxDimension, referenceTexture);

          if (!iconContext.animationHandled && Array.isArray(icon.textures)) {
            icon.gotoAndStop?.(0);
            if (
              shouldPlayIconAnimation &&
              icon.textures.length > 1 &&
              typeof icon.play === "function"
            ) {
              icon.play();
            } else {
              icon.stop?.();
            }
          }

          const facePalette = this.#resolveRevealColor({
            paletteSet: contentConfig.palette?.face,
            revealedByPlayer,
            useSelectionTint,
            fallbackRevealed:
              contentConfig.fallbackPalette?.face?.revealed ??
              palette.cardFace ??
              this.palette.cardFace ??
              this.palette.defaultTint,
            fallbackUnrevealed:
              contentConfig.fallbackPalette?.face?.unrevealed ??
              palette.cardFaceUnrevealed ??
              this.palette.cardFaceUnrevealed ??
              this.palette.defaultTint,
          });
          this.flipFace(facePalette);

          const insetPalette = this.#resolveRevealColor({
            paletteSet: contentConfig.palette?.inset,
            revealedByPlayer,
            useSelectionTint: false,
            fallbackRevealed:
              contentConfig.fallbackPalette?.inset?.revealed ??
              palette.cardInset ??
              this.palette.cardInset ??
              this.palette.defaultTint,
            fallbackUnrevealed:
              contentConfig.fallbackPalette?.inset?.unrevealed ??
              palette.cardInsetUnrevealed ??
              this.palette.cardInsetUnrevealed ??
              this.palette.defaultTint,
          });
          this.flipInset(insetPalette);

          if (revealedByPlayer) {
            contentConfig.playSound?.({ card: this, revealedByPlayer });
          }

          contentConfig.onReveal?.({ card: this, revealedByPlayer });
        }
      },
      complete: () => {
        if (!this.destroyed) {
          this.forceFlatPose();
        }
        this._animating = false;
        this.revealed = true;
        this.#updateTileTexture();
        this._swapHandled = false;
        const completionPayload = {
          content: contentConfig,
          key: contentKey,
          revealedByPlayer,
        };
        if (contentKey != null && completionPayload.face == null) {
          completionPayload.face = contentKey;
        }
        onComplete?.(this, completionPayload);
      },
    });

    return true;
  }

  flipFace(color) {
    const sprite = this._tileSprite;
    if (!sprite) return;
    this._tileState = "flipped";
    this._isHovering = false;
    this.#updateTileTexture();
    if (this.stateTextures?.flipped) {
      sprite.tint = 0xffffff;
      return;
    }

    if (color != null) {
      sprite.tint = color;
    } else {
      const fallback = this.palette.defaultTint ?? 0xffffff;
      sprite.tint = fallback;
    }
  }

  flipInset(color) {
    // No-op: inset visuals are now handled by tile sprites.
  }

  tween({ duration, ease = (t) => t, update, complete }) {
    if (this.disableAnimations || duration <= 0) {
      update?.(ease(1));
      complete?.();
      return () => {};
    }

    const start = performance.now();
    const loop = () => {
      const elapsed = (performance.now() - start) / duration;
      const t = Math.min(1, elapsed);
      update?.(ease(t));
      if (t >= 1) {
        this.app.ticker.remove(loop);
        complete?.();
      }
    };
    this.app.ticker.add(loop);

    return () => {
      this.app.ticker.remove(loop);
    };
  }

  setLayout({ x, y, scale }) {
    this._baseX = x;
    this._baseY = y;
    this.container.position.set(x, y);
    this._shadowContainer?.position.set(x, y);
    if (scale != null) {
      this.container.scale?.set?.(scale, scale);
      this._shadowContainer?.scale?.set?.(scale, scale);
      this._layoutScale = scale;
    }
    if (!this._shakeActive) {
      this.container.rotation = 0;
      if (this._shadowContainer) {
        this._shadowContainer.rotation = 0;
      }
    }
  }

  setSkew(v) {
    if (!this._wrap?.skew) return;
    if (this.animationOptions.hoverTiltAxis === "y") {
      this._wrap.skew.y = v;
      if (this._shadowWrap?.skew) {
        this._shadowWrap.skew.y = v;
      }
    } else {
      this._wrap.skew.x = v;
      if (this._shadowWrap?.skew) {
        this._shadowWrap.skew.x = v;
      }
    }
  }

  getSkew() {
    if (!this._wrap) return 0;
    return this.animationOptions.hoverTiltAxis === "y"
      ? this._wrap.skew.y
      : this._wrap.skew.x;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopHover();
    this.stopWiggle();
    this.stopMatchShake();
    this._activeSparkCleanup?.();
    this._bumpToken = null;
    this.#cancelSpawnAnimation();
    this.#stopWinHighlightLoop();
    if (this._frameTweenCancel) {
      this._frameTweenCancel();
      this._frameTweenCancel = null;
    }
    this._shadowContainer?.destroy?.({ children: true });
    this._shadowContainer = null;
    this._shadowWrap = null;
    this.container?.destroy?.({ children: true });
    this._wrap = null;
    this._tileSprite = null;
    this.stopIconAnimation();
    this._icon = null;
    this._frameSprite = null;
    this._matchEffectsLayer = null;
    this._iconContentConfig = null;
    this._iconLastRevealContext = null;
  }

  fadeInWinFrame({ duration = 1000 } = {}) {
    const sprite = this._frameSprite;
    if (!sprite) return;

    const startAlpha = sprite.visible ? sprite.alpha ?? 0 : 0;
    const clampedStart = Math.min(1, Math.max(0, startAlpha));
    if (clampedStart >= 0.999) {
      sprite.visible = true;
      sprite.alpha = 1;
      return;
    }

    this._frameTweenCancel?.();
    this._frameTweenCancel = null;

    sprite.visible = true;
    sprite.alpha = clampedStart;

    this._frameTweenCancel = this.tween({
      duration,
      ease: (t) => t,
      update: (p) => {
        const eased = Math.min(1, Math.max(0, p));
        sprite.alpha = clampedStart + (1 - clampedStart) * eased;
      },
      complete: () => {
        sprite.alpha = 1;
        sprite.visible = true;
        this._frameTweenCancel = null;
      },
    });
  }

  hideWinFrame() {
    const sprite = this._frameSprite;
    if (!sprite) return;
    this._frameTweenCancel?.();
    this._frameTweenCancel = null;
    sprite.alpha = 0;
    sprite.visible = false;
  }

  #stopWinHighlightLoop() {
    if (this._winHighlightInterval != null) {
      clearInterval(this._winHighlightInterval);
      this._winHighlightInterval = null;
    }
  }

  #cancelSpawnAnimation() {
    if (typeof this._spawnTweenCancel !== "function") {
      return;
    }

    const wrap = this._wrap;
    const shadowWrap = this._shadowWrap;
    this._spawnTweenCancel();
    this._spawnTweenCancel = null;

    if (wrap?.scale?.set) {
      wrap.scale.set(1, 1);
    } else if (wrap?.scale) {
      wrap.scale.x = 1;
      wrap.scale.y = 1;
    }
    if (shadowWrap?.scale?.set) {
      shadowWrap.scale.set(1, 1);
    } else if (shadowWrap?.scale) {
      shadowWrap.scale.x = 1;
      shadowWrap.scale.y = 1;
    }
  }

  #applyIconSizing(icon, maxDimension, textureOverride = null) {
    if (!icon) {
      return;
    }

    const targetSize = Math.max(0, maxDimension ?? 0);
    const texture = textureOverride ?? icon.texture ?? null;

    const applySquareSize = () => {
      icon.width = targetSize;
      icon.height = targetSize;
    };

    if (!texture) {
      applySquareSize();
      return;
    }

    const dimensions = this.#getTextureDimensions(texture);
    if (!dimensions) {
      applySquareSize();

      if (texture?.valid === false && typeof texture.once === "function") {
        texture.once("update", () => {
          if (this.destroyed || icon.destroyed) {
            return;
          }
          this.#applyIconSizing(icon, maxDimension, texture);
        });
      }

      return;
    }

    const aspect = dimensions.width / dimensions.height;
    if (!Number.isFinite(aspect) || aspect <= 0) {
      applySquareSize();
      return;
    }

    if (aspect >= 1) {
      icon.width = targetSize;
      icon.height = targetSize / aspect;
    } else {
      icon.height = targetSize;
      icon.width = targetSize * aspect;
    }
  }

  #getTextureDimensions(texture) {
    if (!texture) {
      return null;
    }

    const width =
      texture?.orig?.width ??
      texture?.frame?.width ??
      texture?.trim?.width ??
      texture?.baseTexture?.realWidth ??
      texture?.baseTexture?.width ??
      texture?.width ??
      0;

    const height =
      texture?.orig?.height ??
      texture?.frame?.height ??
      texture?.trim?.height ??
      texture?.baseTexture?.realHeight ??
      texture?.baseTexture?.height ??
      texture?.height ??
      0;

    if (width > 0 && height > 0) {
      return { width, height };
    }

    return null;
  }

  startMatchShake({
    amplitude = 1.0,
    verticalFactor = 1.0,
    rotationAmplitude = 0.011,
    frequency = 2,
  } = {}) {
    if (this.destroyed || this._shakeActive || !this.container) {
      return;
    }
    if (this.disableAnimations) {
      return;
    }

    const icon = this._icon;
    if (!icon) {
      return;
    }

    this._shakeActive = true;
    const baseX = icon.x;
    const baseY = icon.y;
    const baseRotation = icon.rotation ?? 0;
    const scaledAmplitude = amplitude;
    const scaledVertical = scaledAmplitude * verticalFactor;
    const startTime = performance.now();

    this._shakeIconBase = { x: baseX, y: baseY, rotation: baseRotation };

    const tick = () => {
      if (
        !this._shakeActive ||
        this.destroyed ||
        !this.container ||
        !icon ||
        icon.destroyed
      ) {
        this.stopMatchShake();
        return;
      }

      const elapsed = (performance.now() - startTime) / 1000;
      const angle = elapsed * frequency * Math.PI * 2;
      icon.x = baseX + Math.sin(angle) * scaledAmplitude;
      icon.y = baseY + Math.cos(angle) * scaledVertical;
      icon.rotation = baseRotation + Math.sin(angle * 0.9) * rotationAmplitude;
    };

    this._shakeTicker = tick;
    this.app.ticker.add(tick);
  }

  stopMatchShake() {
    if (!this._shakeActive) {
      return;
    }

    this._shakeActive = false;
    if (this._shakeTicker) {
      this.app.ticker.remove(this._shakeTicker);
      this._shakeTicker = null;
    }
    if (this._icon) {
      const base = this._shakeIconBase ?? {
        x: this._icon.x,
        y: this._icon.y,
        rotation: this._icon.rotation ?? 0,
      };
      this._icon.x = base.x;
      this._icon.y = base.y;
      this._icon.rotation = base.rotation;
    }
    this._shakeIconBase = null;
    if (this.container) {
      this.container.x = this._baseX;
      this.container.y = this._baseY;
      this.container.rotation = 0;
    }
    if (this._shadowContainer) {
      this._shadowContainer.x = this._baseX;
      this._shadowContainer.y = this._baseY;
      this._shadowContainer.rotation = 0;
    }
  }

  playMatchSpark() {
    if (
      this.destroyed ||
      this.disableAnimations ||
      !this._matchEffectsLayer ||
      !this.matchEffects?.sparkTexture
    ) {
      return;
    }

    this._activeSparkCleanup?.();

    const texture = this.matchEffects.sparkTexture;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(0, 0);
    sprite.alpha = 0;

    const textureWidth =
      texture?.width ??
      texture?.orig?.width ??
      texture?.baseTexture?.width ??
      1;
    const textureHeight =
      texture?.height ??
      texture?.orig?.height ??
      texture?.baseTexture?.height ??
      1;
    const maxDimension = Math.max(1, textureWidth, textureHeight);
    const baseScale = (this._tileSize * 1.2) / maxDimension;

    const appearPortion = 0.25;
    const startScale = 0.45;
    const peakScale = 1.08;
    const endScale = 0.2;
    const peakRotation = 0.18 * (Math.random() < 0.5 ? -1 : 1);
    const duration = Math.max(1, this.matchEffects.sparkDuration ?? 1500);

    sprite.scale.set(baseScale * startScale);

    this._matchEffectsLayer.addChild(sprite);

    let finished = false;
    let cancelTween = null;

    const finish = (fromComplete = false) => {
      if (finished) {
        return;
      }
      finished = true;
      if (!fromComplete) {
        cancelTween?.();
      }
      if (sprite?.parent) {
        sprite.parent.removeChild(sprite);
      }
      sprite?.destroy?.();
      if (this._activeSparkCleanup === finish) {
        this._activeSparkCleanup = null;
      }
    };

    cancelTween = this.tween({
      duration,
      ease: (t) => t,
      update: (progress) => {
        if (finished) {
          return;
        }
        if (
          this.destroyed ||
          !sprite ||
          !sprite.parent ||
          !this._matchEffectsLayer ||
          this._matchEffectsLayer.destroyed
        ) {
          finish();
          return;
        }

        let scaleFactor;
        let rotation;
        let alpha;

        if (progress < appearPortion) {
          const local = progress / appearPortion;
          const eased = Ease.easeOutBack(local);
          scaleFactor = startScale + (peakScale - startScale) * eased;
          rotation = peakRotation * eased;
          alpha = Math.min(1, eased);
        } else {
          const local = Math.min(
            1,
            Math.max(0, (progress - appearPortion) / (1 - appearPortion))
          );
          const eased = 1 - Math.pow(1 - local, 3);
          scaleFactor = peakScale - (peakScale - endScale) * eased;
          rotation = peakRotation * (1 - eased);
          alpha = Math.max(0, 1 - eased);
        }

        const scaled = baseScale * scaleFactor;
        sprite.scale.set(scaled, scaled);
        sprite.rotation = rotation;
        sprite.alpha = alpha;
      },
      complete: () => finish(true),
    });

    this._activeSparkCleanup = finish;
  }

  #resolveRevealColor({
    paletteSet,
    revealedByPlayer,
    useSelectionTint,
    fallbackRevealed,
    fallbackUnrevealed,
  }) {
    if (revealedByPlayer && useSelectionTint) {
      return AUTO_SELECTION_COLOR;
    }

    if (revealedByPlayer) {
      return (
        paletteSet?.revealed ?? fallbackRevealed ?? this.palette.defaultTint
      );
    }

    return (
      paletteSet?.unrevealed ??
      fallbackUnrevealed ??
      this.palette.defaultTint ??
      0xffffff
    );
  }

  #setHoverState(isHovering) {
    const shouldHover = Boolean(isHovering && !this.revealed);
    if (this._isHovering === shouldHover && this._tileState !== "flipped") {
      return;
    }
    this._isHovering = shouldHover;
    this.#updateTileTexture();
  }

  #updateTileTexture() {
    const sprite = this._tileSprite;
    if (!sprite) return;

    let texture = this.stateTextures.default ?? Texture.WHITE;
    if (this._tileState === "flipped" || this.revealed) {
      texture = this.stateTextures.flipped ?? texture;
    } else if (this._isHovering && this.stateTextures.hover) {
      texture = this.stateTextures.hover;
    }

    if (texture && sprite.texture !== texture) {
      sprite.texture = texture;
    }

    if (this._tileSize > 0) {
      sprite.width = this._tileSize;
      sprite.height = this._tileSize;
    }
  }

  #createCard(tileSize) {
    const tileTexture = this.stateTextures.default ?? Texture.WHITE;
    const tileSprite = new Sprite(tileTexture);
    tileSprite.anchor.set(0.5);
    tileSprite.position.set(tileSize / 2, tileSize / 2);
    tileSprite.width = tileSize;
    tileSprite.height = tileSize;

    const icon = new AnimatedSprite([Texture.EMPTY]);
    icon.anchor.set(0.5);
    icon.x = tileSize / 2 + this.iconOptions.offsetX;
    icon.y = tileSize / 2 + this.iconOptions.offsetY;
    icon.visible = false;
    icon.loop = true;
    icon.animationSpeed = 0.25;
    icon.stop();
    icon.gotoAndStop?.(0);

    const frameSprite = this.frameTexture
      ? new Sprite(this.frameTexture)
      : null;
    if (frameSprite) {
      frameSprite.anchor.set(0.5);
      frameSprite.position.set(tileSize / 2, (tileSize - 8) / 2);
      frameSprite.width = tileSize;
      frameSprite.height = tileSize - 4;
      frameSprite.alpha = 0;
      frameSprite.visible = false;
    }

    const matchEffectsLayer = new Container();
    matchEffectsLayer.position.set(tileSize / 2, tileSize / 2);

    const flipWrap = new Container();
    flipWrap.addChild(
      tileSprite,
      ...(frameSprite ? [frameSprite] : []),
      matchEffectsLayer,
      icon
    );

    flipWrap.position.set(tileSize / 2, tileSize / 2);
    flipWrap.pivot.set(tileSize / 2, tileSize / 2);

    const tile = new Container();
    tile.addChild(flipWrap);
    tile.eventMode = "static";
    tile.cursor = "pointer";

    tile.row = this.row;
    tile.col = this.col;

    this._wrap = flipWrap;
    this._shadowContainer = null;
    this._shadowWrap = null;
    this._tileSprite = tileSprite;
    this._icon = icon;
    this._frameSprite = frameSprite;
    this._matchEffectsLayer = matchEffectsLayer;
    this._tileSize = tileSize;
    this._tileState = "default";
    this._isHovering = false;

    this.applyTint(this.palette.defaultTint);
    this.#updateTileTexture();

    const s0 = 0.0001;
    flipWrap.scale?.set?.(s0);
    if (this.disableAnimations) {
      flipWrap.scale?.set?.(1, 1);
    } else {
      this._spawnTweenCancel?.();
      this._spawnTweenCancel = this.tween({
        duration: this.animationOptions.cardsSpawnDuration,
        ease: (x) => Ease.easeOutBack(x),
        update: (p) => {
          const s = s0 + (1 - s0) * p;
          flipWrap.scale?.set?.(s);
        },
        complete: () => {
          flipWrap.scale?.set?.(1, 1);
          this._spawnTweenCancel = null;
        },
      });
    }

    tile.on("pointerover", () =>
      this.interactionCallbacks.onPointerOver?.(this)
    );
    tile.on("pointerout", () => this.interactionCallbacks.onPointerOut?.(this));
    tile.on("pointerdown", () =>
      this.interactionCallbacks.onPointerDown?.(this)
    );
    tile.on("pointerup", () => this.interactionCallbacks.onPointerUp?.(this));
    tile.on("pointerupoutside", () =>
      this.interactionCallbacks.onPointerUpOutside?.(this)
    );
    tile.on("pointertap", () => this.interactionCallbacks.onPointerTap?.(this));

    return tile;
  }
}
