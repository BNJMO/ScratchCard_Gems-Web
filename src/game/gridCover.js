import { Container, Sprite, Texture } from "pixi.js";

const DEFAULT_SCRATCH_DISTANCE = 6;
const MIN_STAMP_RATIO = 0.12;

function createCanvas() {
  if (typeof document === "undefined") {
    return null;
  }
  return document.createElement("canvas");
}

export class GridCover {
  constructor({ app, texture, maskTextures = [] } = {}) {
    this.app = app;
    this.coverTexture = texture ?? Texture.WHITE;
    this.maskTextures = Array.isArray(maskTextures)
      ? maskTextures.filter(Boolean)
      : [];

    this.container = new Container();
    this.container.eventMode = "static";
    this.container.cursor = "pointer";

    this.coverSprite = new Sprite(this.coverTexture);
    this.coverSprite.anchor.set(0.5);
    this.coverSprite.eventMode = "none";

    this.maskCanvas = createCanvas();
    this.maskContext = this.maskCanvas?.getContext("2d");
    this.maskTexture = this.maskCanvas
      ? Texture.from(this.maskCanvas)
      : Texture.WHITE;
    this.maskSprite = new Sprite(this.maskTexture);
    this.maskSprite.anchor.set(0.5);
    this.maskSprite.eventMode = "none";
    this.coverSprite.mask = this.maskSprite;

    this.container.addChild(this.coverSprite, this.maskSprite);

    this._scratchListeners = new Set();
    this._scratching = false;
    this._lastPoint = null;
    this._distanceAccumulator = 0;
    this._distanceThreshold = DEFAULT_SCRATCH_DISTANCE;

    this._fadeTween = null;
    this._stampRadius = 0;
    this._coverWidth = 1;
    this._coverHeight = 1;

    this.#bindEvents();
    this.resetMask();
  }

  setTextures({ texture, maskTextures } = {}) {
    if (texture) {
      this.coverTexture = texture;
      this.coverSprite.texture = texture;
    }
    if (Array.isArray(maskTextures)) {
      this.maskTextures = maskTextures.filter(Boolean);
    }
  }

  setLayout({ width, height } = {}) {
    const safeWidth = Math.max(1, Math.floor(width ?? this._coverWidth));
    const safeHeight = Math.max(1, Math.floor(height ?? this._coverHeight));
    if (safeWidth === this._coverWidth && safeHeight === this._coverHeight) {
      return;
    }

    this._coverWidth = safeWidth;
    this._coverHeight = safeHeight;

    this.coverSprite.width = safeWidth;
    this.coverSprite.height = safeHeight;

    this.#resizeMaskTexture(safeWidth, safeHeight);
    this.resetMask();
  }

  #resizeMaskTexture(width, height) {
    this._stampRadius = Math.max(width, height) * MIN_STAMP_RATIO * 0.5;
    if (!this.maskCanvas) {
      return;
    }

    this.maskCanvas.width = width;
    this.maskCanvas.height = height;

    if (this.maskTexture && this.maskTexture !== Texture.WHITE) {
      this.maskTexture.destroy(true);
    }
    this.maskTexture = Texture.from(this.maskCanvas);
    this.maskSprite.texture = this.maskTexture;
    this.maskSprite.width = width;
    this.maskSprite.height = height;

  }

  resetMask() {
    if (!this.maskContext || !this.maskCanvas) {
      return;
    }

    this.maskContext.globalCompositeOperation = "source-over";
    this.maskContext.fillStyle = "#ffffff";
    this.maskContext.fillRect(0, 0, this._coverWidth, this._coverHeight);
    this.maskTexture.baseTexture?.update?.();

    this.container.visible = true;
    this.container.alpha = 1;
    this.enableInteraction();
  }

  enableInteraction() {
    this.container.eventMode = "static";
    this.container.cursor = "pointer";
  }

  disableInteraction() {
    this.container.eventMode = "none";
    this.container.cursor = "default";
  }

  addScratchListener(listener) {
    if (typeof listener === "function") {
      this._scratchListeners.add(listener);
    }
    return () => this._scratchListeners.delete(listener);
  }

  clearScratchListeners() {
    this._scratchListeners.clear();
  }

  fadeOut(duration = 400, onComplete) {
    if (!this.app) {
      this.container.visible = false;
      onComplete?.();
      return;
    }

    this.disableInteraction();

    if (typeof this._fadeTween === "function") {
      this._fadeTween();
      this._fadeTween = null;
    }

    const start = performance.now();
    const initialAlpha = this.container.alpha;
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / duration);
      this.container.alpha = initialAlpha * (1 - t);
      if (t >= 1) {
        this.app.ticker.remove(tick);
        this.container.visible = false;
        this.container.alpha = 0;
        this._fadeTween = null;
        onComplete?.();
      }
    };

    this._fadeTween = () => {
      this.app.ticker.remove(tick);
    };

    this.app.ticker.add(tick);
  }

  #bindEvents() {
    this.container.on("pointerdown", (event) => {
      if (this.container.eventMode === "none") return;
      this._scratching = true;
      const local = this.#toLocal(event.global);
      this._lastPoint = local;
      this._distanceAccumulator = 0;
      this.#applyScratch(local);
    });

    this.container.on("pointerup", () => this.#endScratch());
    this.container.on("pointerupoutside", () => this.#endScratch());
    this.container.on("pointerout", () => this.#endScratch());
    this.container.on("pointermove", (event) => {
      if (!this._scratching) return;
      const local = this.#toLocal(event.global);
      const dx = local.x - (this._lastPoint?.x ?? local.x);
      const dy = local.y - (this._lastPoint?.y ?? local.y);
      const distance = Math.hypot(dx, dy);
      this._distanceAccumulator += distance;
      if (this._distanceAccumulator >= this._distanceThreshold) {
        this.#applyScratch(local);
        this._distanceAccumulator = 0;
        this._lastPoint = local;
      }
    });
  }

  #endScratch() {
    this._scratching = false;
    this._lastPoint = null;
    this._distanceAccumulator = 0;
  }

  #toLocal(globalPoint) {
    return this.container.toLocal(globalPoint);
  }

  #applyScratch(localPoint) {
    if (!this.maskContext || !this.maskCanvas) {
      return;
    }

    const texture = this.#getRandomMaskTexture();
    const baseWidth = texture?.width || 1;
    const targetSize = Math.max(
      this._stampRadius * 2,
      Math.min(this._coverWidth, this._coverHeight) * MIN_STAMP_RATIO
    );
    const source = texture?.baseTexture?.resource?.source ?? null;
    const offsetX = localPoint.x + this._coverWidth / 2;
    const offsetY = localPoint.y + this._coverHeight / 2;

    this.maskContext.save();
    this.maskContext.globalCompositeOperation = "destination-out";
    this.maskContext.translate(offsetX, offsetY);
    this.maskContext.rotate(Math.random() * Math.PI * 2);
    if (source && source.width && source.height) {
      this.maskContext.drawImage(
        source,
        -targetSize / 2,
        -targetSize / 2,
        targetSize,
        targetSize
      );
    } else {
      this.maskContext.beginPath();
      this.maskContext.arc(0, 0, targetSize / 2, 0, Math.PI * 2);
      this.maskContext.fillStyle = "#ffffff";
      this.maskContext.fill();
    }
    this.maskContext.restore();
    this.maskTexture.baseTexture?.update?.();

    const worldRadius = targetSize / 2;
    this.#emitScratch({
      x: localPoint.x,
      y: localPoint.y,
      radius: worldRadius,
    });
  }

  #getRandomMaskTexture() {
    if (!this.maskTextures.length) {
      return Texture.WHITE;
    }
    const index = Math.floor(Math.random() * this.maskTextures.length);
    return this.maskTextures[index] ?? Texture.WHITE;
  }

  #emitScratch(payload) {
    for (const listener of this._scratchListeners) {
      try {
        listener?.(payload);
      } catch (error) {
        console.error("GridCover scratch listener failed", error);
      }
    }
  }
}
