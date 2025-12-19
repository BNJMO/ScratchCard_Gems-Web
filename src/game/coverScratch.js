import { BlurFilter, Graphics, Rectangle, RenderTexture, Sprite } from "pixi.js";

export class CoverScratch {
  constructor({ scene, radius, blurSize, padding = 16 } = {}) {
    this.scene = scene;
    this.radiusOption = radius;
    this.blurSizeOption = blurSize;
    this.padding = Math.max(0, Number(padding) || 0);

    this.coverSprite = null;
    this.coverTexture = null;
    this.brush = null;
    this.coverBounds = new Rectangle();
    this._currentRadius = null;
    this._currentBlur = null;
    this._pointerMoveHandler = (event) => this.#handlePointerMove(event);
    this._initialized = false;
  }

  init() {
    const app = this.scene?.app;
    if (!app || !this.scene?.board) return;

    if (!this.brush) {
      this.#rebuildBrush();
    }

    if (!this._initialized) {
      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;
      app.stage.on("pointermove", this._pointerMoveHandler);
      this._initialized = true;
    }

    this.syncWithLayout();
  }

  syncWithLayout() {
    const layout = this.scene?.getBoardLayout?.();
    const app = this.scene?.app;
    if (!layout || !app || !this.scene?.board) return;

    const contentSize = layout.contentSize ?? 0;
    const half = contentSize / 2;

    this.coverBounds.x = -half - this.padding;
    this.coverBounds.y = -half - this.padding;
    this.coverBounds.width = contentSize + this.padding * 2;
    this.coverBounds.height = contentSize + this.padding * 2;

    const targetRadius = this.radiusOption ?? Math.max(12, Math.floor((layout.tileSize ?? 64) * 0.8));
    const targetBlur = this.blurSizeOption ?? Math.max(8, Math.floor(targetRadius * 0.25));

    if (targetRadius !== this._currentRadius || targetBlur !== this._currentBlur) {
      this.#rebuildBrush(targetRadius, targetBlur);
    }

    const sizeChanged = this.#ensureCoverTexture();
    this.#positionCoverSprite();

    if (sizeChanged) {
      this.reset();
    }
  }

  destroy() {
    const app = this.scene?.app;
    if (app?.stage) {
      app.stage.off("pointermove", this._pointerMoveHandler);
    }

    if (this.coverSprite?.parent) {
      this.coverSprite.parent.removeChild(this.coverSprite);
    }

    this.coverSprite?.destroy({ texture: false, baseTexture: false });
    this.coverTexture?.destroy(true);
    this.brush?.destroy();
    this.coverSprite = null;
    this.coverTexture = null;
    this.brush = null;
    this._initialized = false;
  }

  reset() {
    this.#fillCover();
  }

  #ensureCoverTexture() {
    const app = this.scene?.app;
    if (!app) return false;

    const width = Math.max(1, Math.ceil(this.coverBounds.width));
    const height = Math.max(1, Math.ceil(this.coverBounds.height));

    const needsNewTexture =
      !this.coverTexture ||
      this.coverTexture.width !== width ||
      this.coverTexture.height !== height;

    if (!needsNewTexture) {
      return false;
    }

    this.coverTexture?.destroy(true);
    this.coverTexture = RenderTexture.create({
      width,
      height,
      resolution: app.renderer.resolution ?? 1,
    });

    if (!this.coverSprite) {
      this.coverSprite = new Sprite(this.coverTexture);
      this.coverSprite.eventMode = "none";
      this.coverSprite.renderable = true;
      this.scene?.board?.addChild(this.coverSprite);
    } else {
      this.coverSprite.texture = this.coverTexture;
    }

    return true;
  }

  #positionCoverSprite() {
    if (!this.coverSprite) return;
    this.coverSprite.position.set(this.coverBounds.x, this.coverBounds.y);
  }

  #rebuildBrush(radius = 96, blurSize = 24) {
    this.brush?.destroy();

    const brush = new Graphics()
      .circle(0, 0, radius)
      .fill({ color: 0xeaff00 });

    brush.blendMode = "erase";
    brush.filters = [new BlurFilter(blurSize)];

    this.brush = brush;
    this._currentRadius = radius;
    this._currentBlur = blurSize;
  }

  #fillCover() {
    const app = this.scene?.app;
    if (!app || !this.coverTexture) return;

    const filler = new Graphics()
      .rect(0, 0, this.coverTexture.width, this.coverTexture.height)
      .fill({ color: 0xeaff00 });

    app.renderer.render({
      container: filler,
      target: this.coverTexture,
      clear: true,
    });

    filler.destroy();
  }

  #scratch(globalX, globalY) {
    if (!this.brush || !this.coverTexture || !this.scene?.board) return;

    const localPoint = this.scene.board.toLocal({ x: globalX, y: globalY });

    if (
      localPoint.x < this.coverBounds.x ||
      localPoint.x > this.coverBounds.x + this.coverBounds.width ||
      localPoint.y < this.coverBounds.y ||
      localPoint.y > this.coverBounds.y + this.coverBounds.height
    ) {
      return;
    }

    const localX = localPoint.x - this.coverBounds.x;
    const localY = localPoint.y - this.coverBounds.y;

    this.brush.position.set(localX, localY);

    this.scene?.app?.renderer?.render({
      container: this.brush,
      target: this.coverTexture,
      clear: false,
    });
  }

  #handlePointerMove(event) {
    if (!event || !event.global) return;
    this.#scratch(event.global.x, event.global.y);
  }
}
