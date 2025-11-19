import {
  Container,
  Graphics,
  Rectangle,
  RenderTexture,
  Sprite,
  Texture,
} from "pixi.js";

const DEFAULT_SAMPLE_SIZE = 32;
const DEFAULT_POINTER_RATE_MS = 1000 / 60;
const MIN_BRUSH_RADIUS = 4;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getDevicePixelRatio() {
  if (typeof window === "undefined") {
    return 1;
  }
  const ratio = Number(window.devicePixelRatio);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

function createCanvas(size = DEFAULT_SAMPLE_SIZE) {
  if (typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class ScratchCell {
  static defaultRenderer = null;

  static setDefaultRenderer(renderer) {
    ScratchCell.defaultRenderer = renderer ?? null;
  }

  constructor({
    renderer,
    width = 1,
    height = 1,
    symbolTexture = Texture.EMPTY,
    coverTexture = null,
    brushTextures = [],
    brushRadius = 30,
    brushSpacing,
    autoRevealThreshold = 0.35,
    pixelRatio,
    showBrushPreview = false,
  } = {}) {
    this.renderer = renderer ?? ScratchCell.defaultRenderer ?? null;
    this.pixelRatio = pixelRatio ?? getDevicePixelRatio();
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.autoRevealThreshold = clamp(autoRevealThreshold, 0, 1);
    this.brushRadius = Math.max(MIN_BRUSH_RADIUS, brushRadius);
    this.brushSpacing = Math.max(1, brushSpacing ?? this.brushRadius * 0.5);
    this.showBrushPreview = Boolean(showBrushPreview);

    this.container = new Container();
    this.container.eventMode = "static";
    this.container.cursor = "pointer";
    this.container.pivot.set(0);

    this.symbolSprite = new Sprite(symbolTexture ?? Texture.EMPTY);
    this.symbolSprite.anchor.set(0.5);
    this.symbolSprite.eventMode = "none";
    this.container.addChild(this.symbolSprite);

    this.coverRenderTexture = this.#createRenderTexture(this.width, this.height);
    this.coverSprite = new Sprite(this.coverRenderTexture);
    this.coverSprite.anchor.set(0.5);
    this.coverSprite.eventMode = "none";
    this.container.addChild(this.coverSprite);

    this.coverGraphics = new Graphics();
    this.coverFillSprite = new Sprite(Texture.WHITE);
    this.brushGraphic = new Graphics();
    this.brushGraphic.blendMode = "erase";
    this.brushSprite = new Sprite(Texture.WHITE);
    this.brushSprite.anchor.set(0.5);
    this.brushSprite.blendMode = "erase";

    this.brushPreview = new Graphics();
    this.brushPreview.circle(0, 0, this.brushRadius).stroke({
      color: 0xffffff,
      width: 2,
      alpha: 0.3,
    });
    this.brushPreview.visible = false;
    if (this.showBrushPreview) {
      this.container.addChild(this.brushPreview);
    }

    this.sampleTexture = RenderTexture.create({
      width: DEFAULT_SAMPLE_SIZE,
      height: DEFAULT_SAMPLE_SIZE,
      resolution: 1,
    });
    this.sampleSprite = new Sprite(this.coverRenderTexture);
    this.sampleSprite.anchor.set(0);
    this.sampleSprite.width = DEFAULT_SAMPLE_SIZE;
    this.sampleSprite.height = DEFAULT_SAMPLE_SIZE;

    this.sampleCanvas = createCanvas(DEFAULT_SAMPLE_SIZE);
    this.sampleContext = this.sampleCanvas?.getContext("2d") ?? null;

    this._coverBaseTexture = coverTexture ?? null;
    this._brushTextures = Array.isArray(brushTextures)
      ? brushTextures.filter(Boolean)
      : [];
    this._symbolTexture = symbolTexture ?? Texture.EMPTY;
    this._scratchListeners = new Set();
    this._revealListeners = new Set();
    this._activePointers = new Map();
    this._interactive = true;
    this._revealComplete = false;
    this._lastSampleTime = 0;
    this._pointerThrottleMs = DEFAULT_POINTER_RATE_MS;

    this.#updateHitArea();
    this.#bindInteraction();
    this.reset(symbolTexture);
  }

  get displayObject() {
    return this.container;
  }

  setInteractive(enabled) {
    this._interactive = Boolean(enabled);
    this.container.eventMode = this._interactive ? "static" : "none";
    if (!this._interactive) {
      this.brushPreview.visible = false;
      this.#clearPointers();
    }
  }

  setSize(width, height) {
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));
    if (nextWidth === this.width && nextHeight === this.height) {
      return;
    }
    this.width = nextWidth;
    this.height = nextHeight;
    this.symbolSprite.width = nextWidth;
    this.symbolSprite.height = nextHeight;
    this.coverRenderTexture?.destroy?.(true);
    this.coverRenderTexture = this.#createRenderTexture(nextWidth, nextHeight);
    this.coverSprite.texture = this.coverRenderTexture;
    this.coverSprite.width = nextWidth;
    this.coverSprite.height = nextHeight;
    this.sampleSprite.texture = this.coverRenderTexture;
    this.#updateHitArea();
    this.reset();
  }

  setCoverTexture(texture) {
    this._coverBaseTexture = texture ?? null;
    this.#fillCover();
  }

  setSymbolTexture(texture) {
    this._symbolTexture = texture ?? Texture.EMPTY;
    this.symbolSprite.texture = this._symbolTexture;
    this.symbolSprite.width = this.width;
    this.symbolSprite.height = this.height;
    this.symbolSprite.alpha = this._symbolTexture === Texture.EMPTY ? 0 : 1;
  }

  setBrushTextures(textures = []) {
    this._brushTextures = Array.isArray(textures)
      ? textures.filter(Boolean)
      : [];
  }

  setBrushRadius(radius) {
    const next = Math.max(MIN_BRUSH_RADIUS, Math.floor(radius));
    if (next === this.brushRadius) return;
    this.brushRadius = next;
    this.brushSpacing = Math.max(1, this.brushRadius * 0.5);
    if (this.showBrushPreview) {
      this.brushPreview.clear();
      this.brushPreview.circle(0, 0, this.brushRadius).stroke({
        color: 0xffffff,
        width: 2,
        alpha: 0.3,
      });
    }
  }

  reset(symbolTexture = this._symbolTexture) {
    if (symbolTexture) {
      this.setSymbolTexture(symbolTexture);
    }
    this._revealComplete = false;
    this.coverSprite.visible = true;
    this.coverSprite.alpha = 1;
    this.setInteractive(true);
    this.#clearPointers();
    this.#fillCover();
  }

  revealAll() {
    if (this._revealComplete) return;
    this._revealComplete = true;
    this.coverSprite.visible = false;
    this.setInteractive(false);
    this.#emitRevealComplete();
  }

  onRevealComplete(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }
    this._revealListeners.add(callback);
    return () => this._revealListeners.delete(callback);
  }

  onScratch(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }
    this._scratchListeners.add(callback);
    return () => this._scratchListeners.delete(callback);
  }

  #updateHitArea() {
    if (!this.container) return;
    this.container.hitArea = new Rectangle(
      -this.width / 2,
      -this.height / 2,
      this.width,
      this.height
    );
  }

  #createRenderTexture(width, height) {
    return RenderTexture.create({
      width,
      height,
      resolution: this.pixelRatio,
    });
  }

  #bindInteraction() {
    this.container.on("pointerdown", (event) => {
      if (!this._interactive) return;
      this.#beginPointer(event);
    });
    this.container.on("pointermove", (event) => {
      if (!this._interactive) return;
      this.#movePointer(event);
    });
    const endPointer = (event) => {
      if (!this._interactive) return;
      this.#endPointer(event);
    };
    this.container.on("pointerup", endPointer);
    this.container.on("pointerupoutside", endPointer);
    this.container.on("pointercancel", endPointer);
    this.container.on("pointerout", (event) => {
      if (!this._interactive) return;
      this.#endPointer(event);
      if (this.showBrushPreview) {
        this.brushPreview.visible = false;
      }
    });
    if (this.showBrushPreview) {
      this.container.on("pointerover", () => {
        if (!this._interactive) return;
        this.brushPreview.visible = true;
      });
    }
  }

  #beginPointer(event) {
    const pointerId = event.pointerId ?? 0;
    const point = this.#eventToTexturePoint(event);
    const now = performance.now();
    this._activePointers.set(pointerId, {
      lastPoint: point,
      lastTime: now,
    });
    this.#stamp(point);
  }

  #movePointer(event) {
    const pointerId = event.pointerId ?? 0;
    const entry = this._activePointers.get(pointerId);
    if (!entry) return;
    const now = performance.now();
    if (now - entry.lastTime < this._pointerThrottleMs) {
      return;
    }
    const nextPoint = this.#eventToTexturePoint(event);
    this.#drawStroke(entry.lastPoint, nextPoint);
    entry.lastPoint = nextPoint;
    entry.lastTime = now;
  }

  #endPointer(event) {
    const pointerId = event?.pointerId ?? 0;
    this._activePointers.delete(pointerId);
    this.#scheduleRevealCheck();
  }

  #clearPointers() {
    this._activePointers.clear();
  }

  #eventToTexturePoint(event) {
    const local = this.container.toLocal(event.global);
    const x = clamp(local.x + this.width / 2, 0, this.width);
    const y = clamp(local.y + this.height / 2, 0, this.height);
    if (this.showBrushPreview) {
      this.brushPreview.position.set(local.x, local.y);
    }
    return { x, y };
  }

  #drawStroke(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    if (!(distance > 0)) {
      this.#stamp(to);
      return;
    }
    const steps = Math.max(1, Math.floor(distance / this.brushSpacing));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const point = { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
      this.#stamp(point);
    }
  }

  #stamp(point) {
    if (!this.renderer) return;
    const radius = this.#renderStamp(point);
    this.#emitScratch(point, radius);
  }

  #renderStamp(point) {
    let radius = this.brushRadius;
    if (this._brushTextures.length > 0) {
      const texture = this.#randomBrushTexture();
      if (texture) {
        const sprite = this.brushSprite;
        sprite.texture = texture;
        sprite.width = sprite.height = this.brushRadius * 2;
        sprite.position.set(point.x, point.y);
        sprite.rotation = Math.random() * Math.PI * 2;
        this.renderer.render(sprite, {
          renderTexture: this.coverRenderTexture,
          clear: false,
        });
        radius = sprite.width / 2;
        this.#applySampleStamp(point, radius);
        return radius;
      }
    }
    const g = this.brushGraphic;
    g.clear();
    g.circle(0, 0, this.brushRadius).fill(0xffffff);
    g.position.set(point.x, point.y);
    this.renderer.render(g, {
      renderTexture: this.coverRenderTexture,
      clear: false,
    });
    this.#applySampleStamp(point, radius);
    return radius;
  }

  #randomBrushTexture() {
    if (!this._brushTextures.length) {
      return null;
    }
    const index = Math.floor(Math.random() * this._brushTextures.length);
    return this._brushTextures[index] ?? null;
  }

  #fillCover() {
    if (!this.renderer) return;
    if (this._coverBaseTexture) {
      const filler = this.coverFillSprite;
      filler.texture = this._coverBaseTexture;
      filler.anchor.set(0);
      filler.width = this.width;
      filler.height = this.height;
      filler.position.set(0, 0);
      this.renderer.render(filler, {
        renderTexture: this.coverRenderTexture,
        clear: true,
      });
    } else {
      this.coverGraphics.clear();
      this.coverGraphics.rect(0, 0, this.width, this.height);
      this.coverGraphics.position.set(0, 0);
      this.coverGraphics.fill(0xd7d7d7);
      this.renderer.render(this.coverGraphics, {
        renderTexture: this.coverRenderTexture,
        clear: true,
      });
    }
    this.#resetSampleCanvas();
  }

  #scheduleRevealCheck() {
    if (this._revealComplete) return;
    this.#checkRevealProgress();
  }

  #checkRevealProgress() {
    if (!this.renderer || this._revealComplete) {
      return;
    }
    const now = performance.now();
    if (now - this._lastSampleTime < 80) {
      return;
    }
    this._lastSampleTime = now;
    const clearedRatio = this.#calculateClearedRatio();
    if (clearedRatio >= this.autoRevealThreshold) {
      this.revealAll();
    }
  }

  #calculateClearedRatio() {
    if (!this.renderer) {
      return 0;
    }
    this.sampleSprite.texture = this.coverRenderTexture;
    this.sampleSprite.width = DEFAULT_SAMPLE_SIZE;
    this.sampleSprite.height = DEFAULT_SAMPLE_SIZE;
    this.sampleSprite.position.set(0, 0);
    this.renderer.render(this.sampleSprite, {
      renderTexture: this.sampleTexture,
      clear: true,
    });
    const pixels = this.renderer.extract?.pixels?.(this.sampleTexture);
    if (pixels && pixels.length) {
      let transparent = 0;
      const totalPixels = pixels.length / 4;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] <= 5) {
          transparent += 1;
        }
      }
      return transparent / Math.max(1, totalPixels);
    }
    if (this.sampleContext && this.sampleCanvas) {
      const data = this.sampleContext.getImageData(
        0,
        0,
        DEFAULT_SAMPLE_SIZE,
        DEFAULT_SAMPLE_SIZE
      ).data;
      let transparent = 0;
      const totalPixels = data.length / 4;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] <= 5) transparent += 1;
      }
      return transparent / Math.max(1, totalPixels);
    }
    return 0;
  }

  #applySampleStamp(point, radius) {
    if (!this.sampleContext || !this.sampleCanvas) return;
    const scaleX = DEFAULT_SAMPLE_SIZE / this.width;
    const scaleY = DEFAULT_SAMPLE_SIZE / this.height;
    const ctx = this.sampleContext;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(point.x * scaleX, point.y * scaleY, radius * Math.max(scaleX, scaleY), 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();
  }

  #resetSampleCanvas() {
    if (!this.sampleContext || !this.sampleCanvas) return;
    this.sampleContext.globalCompositeOperation = "source-over";
    this.sampleContext.fillStyle = "rgba(255,255,255,1)";
    this.sampleContext.fillRect(0, 0, DEFAULT_SAMPLE_SIZE, DEFAULT_SAMPLE_SIZE);
  }

  #emitScratch(point, radius) {
    if (!this._scratchListeners.size) return;
    const payload = {
      x: point.x - this.width / 2,
      y: point.y - this.height / 2,
      radius,
    };
    for (const listener of this._scratchListeners) {
      try {
        listener(payload);
      } catch (error) {
        console.error("ScratchCell scratch listener failed", error);
      }
    }
  }

  #emitRevealComplete() {
    for (const listener of this._revealListeners) {
      try {
        listener();
      } catch (error) {
        console.error("ScratchCell reveal listener failed", error);
      }
    }
  }
}

export function createScratchCellGridExample(renderer, symbolTextures = []) {
  const grid = new Container();
  const cellSize = 120;
  const spacing = 16;
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const index = row * 3 + col;
      const cell = new ScratchCell({
        renderer,
        width: cellSize,
        height: cellSize,
        symbolTexture: symbolTextures[index] ?? Texture.WHITE,
      });
      cell.container.position.set(
        col * (cellSize + spacing) + cellSize / 2,
        row * (cellSize + spacing) + cellSize / 2
      );
      grid.addChild(cell.container);
    }
  }
  return grid;
}

