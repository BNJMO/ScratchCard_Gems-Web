import { BlurFilter, Graphics, Rectangle, SCALE_MODES, Sprite } from "pixi.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export class CoverScratch {
  constructor({ scene, radius, blurSize, padding = 16 } = {}) {
    this.scene = scene;
    this.radiusOption = radius;
    this.blurSizeOption = blurSize;
    this.padding = Math.max(0, Number(padding) || 0);

    this.focusSprite = null;
    this.coverBounds = new Rectangle();
    this._currentRadius = null;
    this._currentBlur = null;
    this._pointerMoveHandler = (event) => this.#handlePointerMove(event);
    this._initialized = false;
  }

  init() {
    const app = this.scene?.app;
    if (!app || !this.scene?.board) return;

    if (!this.focusSprite) {
      this.#rebuildFocus();
    }

    if (!this._initialized) {
      app.stage.eventMode = app.stage.eventMode === "none" ? "static" : app.stage.eventMode ?? "static";
      app.stage.hitArea = app.screen;
      app.stage.on("pointermove", this._pointerMoveHandler);
      this._initialized = true;
    }

    this.#applyMask();
    this.syncWithLayout();
  }

  syncWithLayout() {
    const layout = this.scene?.getBoardLayout?.();
    const app = this.scene?.app;
    if (!layout || !app || !this.scene?.board || !this.focusSprite) return;

    const contentSize = layout.contentSize ?? 0;
    const half = contentSize / 2;

    this.coverBounds.x = (layout.boardCenterX ?? 0) - half - this.padding;
    this.coverBounds.y = (layout.boardCenterY ?? 0) - half - this.padding;
    this.coverBounds.width = contentSize + this.padding * 2;
    this.coverBounds.height = contentSize + this.padding * 2;

    const targetRadius = this.radiusOption ?? Math.max(12, Math.floor((layout.tileSize ?? 64) * 0.8));
    const targetBlur = this.blurSizeOption ?? Math.max(8, Math.floor(targetRadius * 0.25));

    if (targetRadius !== this._currentRadius || targetBlur !== this._currentBlur) {
      this.#rebuildFocus(targetRadius, targetBlur);
    }

    app.stage.hitArea = app.screen;

    const centerX = layout.boardCenterX ?? app.screen.width / 2;
    const centerY = layout.boardCenterY ?? app.screen.height / 2;
    this.#positionFocus(centerX, centerY);
  }

  destroy() {
    const app = this.scene?.app;
    if (app?.stage) {
      app.stage.off("pointermove", this._pointerMoveHandler);
    }

    if (this.scene?.board && this.scene.board.mask === this.focusSprite) {
      this.scene.board.mask = null;
    }

    if (this.focusSprite?.parent) {
      this.focusSprite.parent.removeChild(this.focusSprite);
    }

    this.focusSprite?.destroy({ texture: true, baseTexture: true });
    this.focusSprite = null;
    this._initialized = false;
  }

  #applyMask() {
    if (!this.scene?.board || !this.focusSprite) return;
    this.scene.board.mask = this.focusSprite;
  }

  #rebuildFocus(radius = 96, blurSize = 24) {
    const app = this.scene?.app;
    if (!app) return;

    if (this.focusSprite) {
      if (this.scene?.board?.mask === this.focusSprite) {
        this.scene.board.mask = null;
      }

      if (this.focusSprite.parent) {
        this.focusSprite.parent.removeChild(this.focusSprite);
      }

      this.focusSprite.destroy({ texture: true, baseTexture: true });
      this.focusSprite = null;
    }

    const circle = new Graphics()
      .circle(radius + blurSize, radius + blurSize, radius)
      .fill({ color: 0xffffff });

    circle.filters = [new BlurFilter(blurSize)];

    const bounds = new Rectangle(
      0,
      0,
      (radius + blurSize) * 2,
      (radius + blurSize) * 2
    );

    const texture = app.renderer.generateTexture({
      target: circle,
      style: { scaleMode: SCALE_MODES.NEAREST },
      resolution: 1,
      frame: bounds,
    });

    circle.destroy();

    const focus = new Sprite(texture);
    focus.eventMode = "none";
    focus.renderable = true;

    this.focusSprite = focus;
    this._currentRadius = radius;
    this._currentBlur = blurSize;

    this.#applyMask();
    app.stage.addChild(focus);
  }

  #positionFocus(x, y) {
    if (!this.focusSprite) return;

    const bounds = this.coverBounds;
    if (!(bounds.width > 0 && bounds.height > 0)) return;

    const clampedX = clamp(x, bounds.x, bounds.x + bounds.width);
    const clampedY = clamp(y, bounds.y, bounds.y + bounds.height);

    this.focusSprite.position.set(
      clampedX - this.focusSprite.width / 2,
      clampedY - this.focusSprite.height / 2
    );
  }

  #handlePointerMove(event) {
    if (!event || !event.global) return;
    this.#positionFocus(event.global.x, event.global.y);
  }
}
