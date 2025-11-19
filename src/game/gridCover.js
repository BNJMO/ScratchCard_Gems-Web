import { Texture } from "pixi.js";
import { ScratchCell } from "./scratchCell.js";

const DEFAULT_AUTO_REVEAL_THRESHOLD = 0.55;

export class GridCover {
  constructor({ app, texture, maskTextures = [] } = {}) {
    this.app = app;
    this.coverTexture = texture ?? Texture.WHITE;
    this.maskTextures = Array.isArray(maskTextures)
      ? maskTextures.filter(Boolean)
      : [];

    ScratchCell.setDefaultRenderer(app?.renderer ?? null);
    this.cell = new ScratchCell({
      renderer: app?.renderer,
      width: 1,
      height: 1,
      symbolTexture: Texture.EMPTY,
      coverTexture: this.coverTexture,
      brushTextures: this.maskTextures,
      brushRadius: 30,
      autoRevealThreshold: DEFAULT_AUTO_REVEAL_THRESHOLD,
    });

    this.container = this.cell.container;
    this.container.visible = false;

    this._scratchListeners = new Set();
    this._coverWidth = 1;
    this._coverHeight = 1;
    this._fadeTickerCancel = null;

    this.cell.onScratch((payload) => this.#emitScratch(payload));
    this.cell.onRevealComplete(() => this.disableInteraction());
  }

  setTextures({ texture, maskTextures } = {}) {
    if (texture) {
      this.coverTexture = texture;
      this.cell.setCoverTexture(texture);
    }
    if (Array.isArray(maskTextures)) {
      this.maskTextures = maskTextures.filter(Boolean);
      this.cell.setBrushTextures(this.maskTextures);
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
    this.cell.setSize(safeWidth, safeHeight);
    const brushRadius = Math.max(16, Math.min(safeWidth, safeHeight) * 0.15);
    this.cell.setBrushRadius(brushRadius);
  }

  resetMask() {
    this.#cancelFadeTicker();
    this.cell.reset();
    this.container.visible = true;
    this.container.alpha = 1;
    this.enableInteraction();
  }

  enableInteraction() {
    this.cell.setInteractive(true);
    this.container.cursor = "pointer";
  }

  disableInteraction() {
    this.cell.setInteractive(false);
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
      this.cell.revealAll();
      this.container.visible = false;
      onComplete?.();
      return;
    }

    this.disableInteraction();

    this.#cancelFadeTicker();

    const start = performance.now();
    const initialAlpha = this.container.alpha;
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, duration > 0 ? elapsed / duration : 1);
      this.container.alpha = initialAlpha * (1 - t);
      if (t >= 1) {
        this.cell.revealAll();
        this.container.visible = false;
        this.container.alpha = 0;
        this.app.ticker.remove(tick);
        this._fadeTickerCancel = null;
        onComplete?.();
      }
    };

    this._fadeTickerCancel = () => {
      this.app.ticker.remove(tick);
    };

    this.app.ticker.add(tick);
  }

  #emitScratch(payload) {
    if (!payload) return;
    for (const listener of this._scratchListeners) {
      try {
        listener(payload);
      } catch (error) {
        console.error("GridCover scratch listener failed", error);
      }
    }
  }

  #cancelFadeTicker() {
    if (typeof this._fadeTickerCancel === "function") {
      this._fadeTickerCancel();
      this._fadeTickerCancel = null;
    }
  }
}

