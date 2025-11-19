import { AnimatedSprite, BlurFilter, Container, Graphics, Sprite, Texture } from "pixi.js";
import Ease from "../ease.js";

const AUTO_SELECTION_COLOR = 0xCFDD00;

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
    };
    this.matchEffects = {
      sparkTexture: matchEffects?.sparkTexture ?? null,
      sparkDuration: Math.max(0, matchEffects?.sparkDuration ?? 1500),
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
    this._activeSparkCleanup = null;
    this._pendingIconAnimation = false;
    this._deferredIconConfigurator = null;
    this._deferredIconRevealedByPlayer = false;
    this._deferredIconStartFromFirstFrame = false;

    this._tiltDir = 1;
    this._baseX = 0;
    this._baseY = 0;

    this.container = this.#createCard(tileSize);
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
      if (this._wrap) {
        this.setSkew(0);
      }
      const icon = this._icon;
      if (icon) {
        icon.stop?.();
        icon.gotoAndStop?.(0);
      }
    }
  }

  get displayObject() {
    return this.container;
  }

  setAutoSelected(selected, { refresh = true } = {}) {
    this.isAutoSelected = Boolean(selected);
    if (refresh) {
      this.refreshTint();
    }
  }

  applyTint(color) {
    if (!this._card) return;
    this._card.tint = color ?? this.palette.defaultTint;
    this._inset.tint = color ?? this.palette.defaultTint;
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
    const { hoverEnabled, hoverEnterDuration, hoverExitDuration, hoverSkewAmount, hoverTiltAxis } =
      this.animationOptions;

    if (!hoverEnabled) return;

    const wrap = this._wrap;
    if (!wrap) return;

    const startScale = wrap.scale.x;
    const endScale = on ? 1.03 : 1.0;
    const startSkew = this.getSkew();
    const endSkew = on ? hoverSkewAmount : 0;
    const startY = this.container.y;
    const endY = on ? this._baseY - 3 : this._baseY;

    const token = Symbol("card-hover");
    this._hoverToken = token;

    if (this.disableAnimations) {
      this._wrap.scale?.set?.(endScale);
      this.setSkew(endSkew);
      this.container.y = endY;
      return;
    }

    this.tween({
      duration: on ? hoverEnterDuration : hoverExitDuration,
      ease: (x) => (on ? 1 - Math.pow(1 - x, 3) : x * x * x),
      update: (p) => {
        if (this._hoverToken !== token) return;
        const scale = startScale + (endScale - startScale) * p;
        wrap.scale.x = wrap.scale.y = scale;
        const k = startSkew + (endSkew - startSkew) * p;
        this.setSkew(k);
        this.container.y = startY + (endY - startY) * p;
      },
      complete: () => {
        if (this._hoverToken !== token) return;
        wrap.scale.x = wrap.scale.y = endScale;
        this.setSkew(endSkew);
        this.container.y = endY;
      },
    });
  }

  stopHover() {
    this._hoverToken = Symbol("card-hover-cancel");
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
    const baseSkew = this.getSkew();
    const baseScale = wrap.scale.x;

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
          1 + Math.sin(p * Math.PI * wiggleSelectionTimes) * wiggleSelectionScale;
        wrap.scale.x = wrap.scale.y = baseScale * scaleWiggle;
      },
      complete: () => {
        if (this._wiggleToken !== token) return;
        this.setSkew(baseSkew);
        wrap.scale.x = wrap.scale.y = baseScale;
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

    const baseScaleX = baseScale.x;
    const baseScaleY = baseScale.y;
    const targetScaleX = baseScaleX * scaleMultiplier;
    const targetScaleY = baseScaleY * scaleMultiplier;

    const token = Symbol("card-bump");
    this._bumpToken = token;

    if (this.disableAnimations || duration <= 0) {
      baseScale.x = baseScaleX;
      baseScale.y = baseScaleY;
      this._bumpToken = null;
      return;
    }

    const easeOut = (value) => 1 - Math.pow(1 - value, 3);

    this.tween({
      duration,
      ease: (t) => t,
      update: (t) => {
        const scale = wrap.scale;
        if (
          this._bumpToken !== token ||
          this.destroyed ||
          !scale
        ) {
          return;
        }
        const phase = t < 0.5 ? easeOut(t / 0.5) : easeOut((1 - t) / 0.5);
        const nextScaleX = baseScaleX + (targetScaleX - baseScaleX) * phase;
        const nextScaleY = baseScaleY + (targetScaleY - baseScaleY) * phase;
        scale.x = nextScaleX;
        scale.y = nextScaleY;
      },
      complete: () => {
        const scale = wrap.scale;
        if (this._bumpToken !== token || !scale) {
          this._bumpToken = null;
          return;
        }
        scale.x = baseScaleX;
        scale.y = baseScaleY;
        this._bumpToken = null;
      },
    });
  }

  highlightWin({ faceColor = 0xeaff00, scaleMultiplier = 1.08, duration = 260 } = {}) {
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
    this.setSkew(0);
    this.container.x = this._baseX;
    this.container.y = this._baseY;
    this.container.rotation = 0;
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
    shouldPlayIconAnimation = false,
    deferIconAnimation = false,
  }) {
    this._pendingIconAnimation = false;
    this._deferredIconConfigurator = null;
    this._deferredIconRevealedByPlayer = false;
    this._deferredIconStartFromFirstFrame = false;

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
    const card = this._card;
    const inset = this._inset;
    const icon = this._icon;
    const tileSize = this._tileSize;
    const radius = this._tileRadius;
    const pad = this._tilePad;
    const startScaleY = Math.max(1, wrap.scale.y);
    const startSkew = this.getSkew();
    const startTilt = this._tiltDir >= 0 ? +1 : -1;

    const palette = this.palette;
    const contentConfig = content ?? {};
    const contentKey =
      contentConfig.key ?? contentConfig.face ?? contentConfig.type ?? null;
    const wantsIconAnimation =
      Boolean(shouldPlayIconAnimation) && !this.disableAnimations;
    const shouldDeferIconAnimation = wantsIconAnimation && Boolean(deferIconAnimation);
    const shouldAnimateIconNow = wantsIconAnimation && !shouldDeferIconAnimation;

    this.tween({
      duration: flipDuration,
      ease: (t) => easeFlip(t),
      update: (t) => {
        if (
          this.destroyed ||
          !wrap?.scale ||
          !card ||
          card.destroyed ||
          !inset ||
          inset.destroyed ||
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
          const maxW = tileSize * baseSize * iconSizeFactor;
          const maxH = tileSize * baseSize * iconSizeFactor;
          icon.width = maxW;
          icon.height = maxH;

          if (contentConfig.texture) {
            if (Array.isArray(icon.textures)) {
              icon.textures = [contentConfig.texture];
            }
            icon.texture = contentConfig.texture;
          }

          const iconContext = {
            card: this,
            revealedByPlayer,
            shouldPlayAnimation: shouldAnimateIconNow,
            animationHandled: false,
          };

          contentConfig.configureIcon?.(icon, iconContext);

          if (!iconContext.animationHandled && Array.isArray(icon.textures)) {
            icon.gotoAndStop?.(0);
            if (
              shouldAnimateIconNow &&
              icon.textures.length > 1 &&
              typeof icon.play === "function"
            ) {
              icon.play();
            } else {
              icon.stop?.();
            }
          }

          if (shouldDeferIconAnimation) {
            this._pendingIconAnimation = true;
            this._deferredIconConfigurator =
              typeof contentConfig.configureIcon === "function"
                ? contentConfig.configureIcon
                : null;
            this._deferredIconRevealedByPlayer = revealedByPlayer;
            this._deferredIconStartFromFirstFrame = true;
            icon.stop?.();
            icon.gotoAndStop?.(0);
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

  playDeferredIconAnimation() {
    if (!this.revealed || !this._pendingIconAnimation) {
      return;
    }

    if (this.disableAnimations) {
      this._pendingIconAnimation = false;
      this._deferredIconConfigurator = null;
      this._deferredIconRevealedByPlayer = false;
      this._deferredIconStartFromFirstFrame = false;
      return;
    }

    const icon = this._icon;
    if (!icon) {
      this._pendingIconAnimation = false;
      this._deferredIconConfigurator = null;
      this._deferredIconStartFromFirstFrame = false;
      return;
    }

    icon.gotoAndStop?.(0);

    const context = {
      card: this,
      revealedByPlayer: this._deferredIconRevealedByPlayer,
      shouldPlayAnimation: true,
      animationHandled: false,
      startFromFirstFrame: this._deferredIconStartFromFirstFrame,
    };

    if (typeof this._deferredIconConfigurator === "function") {
      this._deferredIconConfigurator(icon, context);
    }

    if (!context.animationHandled && Array.isArray(icon.textures)) {
      if (icon.textures.length > 1 && typeof icon.play === "function") {
        icon.play();
      } else {
        icon.stop?.();
      }
    }

    this._pendingIconAnimation = false;
    this._deferredIconConfigurator = null;
    this._deferredIconRevealedByPlayer = false;
    this._deferredIconStartFromFirstFrame = false;
  }

  flipFace(color) {
    if (!this._card) return;
    this._card
      .clear()
      .roundRect(0, 0, this._tileSize, this._tileSize, this._tileRadius)
      .fill(color)
      .stroke({
        color: this.palette.tileStrokeFlipped ?? this.palette.tileStroke,
        width: this.strokeWidth,
        alpha: 0.9,
      });
  }

  flipInset(color) {
    if (!this._inset) return;
    const pad = this._tilePad;
    const size = this._tileSize - pad * 2;
    this._inset
      .clear()
      .roundRect(pad, pad, size, size, Math.max(0, this._tileRadius - pad))
      .fill(color);
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
    if (scale != null) {
      this.container.scale?.set?.(scale, scale);
      this._layoutScale = scale;
    }
    if (!this._shakeActive) {
      this.container.rotation = 0;
    }
  }

  setSkew(v) {
    if (!this._wrap?.skew) return;
    if (this.animationOptions.hoverTiltAxis === "y") {
      this._wrap.skew.y = v;
    } else {
      this._wrap.skew.x = v;
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
    this._icon?.stop?.();
    this.container?.destroy?.({ children: true });
    this._wrap = null;
    this._card = null;
    this._inset = null;
    this._icon = null;
    this._matchEffectsLayer = null;
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
    this._spawnTweenCancel();
    this._spawnTweenCancel = null;

    if (wrap?.scale?.set) {
      wrap.scale.set(1, 1);
    } else if (wrap?.scale) {
      wrap.scale.x = 1;
      wrap.scale.y = 1;
    }
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
      texture?.width ?? texture?.orig?.width ?? texture?.baseTexture?.width ?? 1;
    const textureHeight =
      texture?.height ?? texture?.orig?.height ?? texture?.baseTexture?.height ?? 1;
    const maxDimension = Math.max(1, textureWidth, textureHeight);
    const baseScale = (this._tileSize * 1.5) / maxDimension;

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
      return paletteSet?.revealed ?? fallbackRevealed ?? this.palette.defaultTint;
    }

    return (
      paletteSet?.unrevealed ??
      fallbackUnrevealed ??
      this.palette.defaultTint ?? 0xffffff
    );
  }

  #createCard(tileSize) {
    const pad = Math.max(6, Math.floor(tileSize * 0.04));
    const radius = Math.max(10, Math.floor(tileSize * 0.06));
    const elevationOffset = Math.max(2, Math.floor(tileSize * 0.04));
    const lipOffset = Math.max(4, Math.floor(tileSize * 0.01));
    const shadowBlur = Math.max(10, Math.floor(tileSize * 0.22));

    const elevationShadow = new Graphics()
      .roundRect(0, 0, tileSize, tileSize, radius)
      .fill(this.palette.tileElevationShadow);
    elevationShadow.y = elevationOffset;
    elevationShadow.alpha = 0.32;
    const shadowFilter = new BlurFilter(shadowBlur);
    shadowFilter.quality = 2;
    elevationShadow.filters = [shadowFilter];

    const elevationLip = new Graphics()
      .roundRect(0, 0, tileSize, tileSize, radius)
      .fill(this.palette.tileElevationBase);
    elevationLip.y = lipOffset;
    elevationLip.alpha = 0.85;

    const card = new Graphics();
    card
      .roundRect(0, 0, tileSize, tileSize, radius)
      .fill(this.palette.tileBase)
      .stroke({
        color: this.palette.tileStroke,
        width: this.strokeWidth,
        alpha: 0.9,
      });

    const inset = new Graphics();
    inset
      .roundRect(pad, pad, tileSize - pad * 2, tileSize - pad * 2, Math.max(0, radius - pad))
      .fill(this.palette.tileInset);

    const icon = new AnimatedSprite([Texture.EMPTY]);
    icon.anchor.set(0.5);
    icon.x = tileSize / 2;
    icon.y = tileSize / 2;
    icon.visible = false;
    icon.loop = true;
    icon.animationSpeed = 0.25;
    icon.stop();
    icon.gotoAndStop?.(0);

    const matchEffectsLayer = new Container();
    matchEffectsLayer.position.set(tileSize / 2, tileSize / 2);

    const flipWrap = new Container();
    flipWrap.addChild(
      elevationShadow,
      elevationLip,
      card,
      inset,
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
    this._card = card;
    this._inset = inset;
    this._icon = icon;
    this._matchEffectsLayer = matchEffectsLayer;
    this._tileSize = tileSize;
    this._tileRadius = radius;
    this._tilePad = pad;

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

    tile.on("pointerover", () => this.interactionCallbacks.onPointerOver?.(this));
    tile.on("pointerout", () => this.interactionCallbacks.onPointerOut?.(this));
    tile.on("pointerdown", () => this.interactionCallbacks.onPointerDown?.(this));
    tile.on("pointerup", () => this.interactionCallbacks.onPointerUp?.(this));
    tile.on("pointerupoutside", () =>
      this.interactionCallbacks.onPointerUpOutside?.(this)
    );
    tile.on("pointertap", () => this.interactionCallbacks.onPointerTap?.(this));

    return tile;
  }
}

