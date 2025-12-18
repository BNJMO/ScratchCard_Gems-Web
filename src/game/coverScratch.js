import {
  BlurFilter,
  Container,
  Graphics,
  MaskFilter,
  Rectangle,
  SCALE_MODES,
  Sprite,
} from "pixi.js";

export class CoverScratch {
  constructor({
    app,
    texture,
    radius = 100,
    blurSize = 32,
    padding = 16,
    minRadiusScale = 0.65,
    maxRadiusScale = 1.35,
  } = {}) {
    this.app = app;
    this.texture = texture;
    this.radius = Math.max(1, radius);
    this.blurSize = Math.max(0, blurSize);
    this.padding = Math.max(0, padding);
    this.minRadiusScale = minRadiusScale;
    this.maxRadiusScale = maxRadiusScale;

    this.container = new Container();
    this.container.eventMode = "none";
    this.container.sortableChildren = true;

    this.coverSprite = null;
    this.revealSprite = null;
    this.maskFilter = null;
    this.hitArea = null;
  }

  init() {
    if (!this.app || !this.texture) {
      return;
    }

    this.coverSprite = new Sprite(this.texture);
    this.coverSprite.anchor.set(0.5);
    this.coverSprite.eventMode = "none";
    this.coverSprite.zIndex = 1;
    this.container.addChild(this.coverSprite);

    const revealTexture = this.#createRevealTexture();
    this.revealSprite = new Sprite(revealTexture);
    this.revealSprite.anchor.set(0.5);
    this.revealSprite.eventMode = "none";
    this.revealSprite.renderable = false;
    this.revealSprite.zIndex = 2;
    this.container.addChild(this.revealSprite);

    this.maskFilter = new MaskFilter({
      sprite: this.revealSprite,
      inverse: true,
    });
    this.maskFilter.enabled = false;
    this.coverSprite.filters = [this.maskFilter];

    if (!this.app.stage.eventMode || this.app.stage.eventMode === "none") {
      this.app.stage.eventMode = "static";
    }
    if (!this.app.stage.hitArea) {
      this.app.stage.hitArea = this.app.screen;
    }

    this.app.stage.on("pointermove", this.#handlePointerMove);
    this.app.stage.on("pointerout", this.#handlePointerLeave);
    this.app.stage.on("pointerleave", this.#handlePointerLeave);
  }

  get displayObject() {
    return this.container;
  }

  #createRevealTexture() {
    const circle = new Graphics()
      .circle(this.radius + this.blurSize, this.radius + this.blurSize, this.radius)
      .fill({ color: 0xff0000 });

    circle.filters = [new BlurFilter(this.blurSize)];

    const bounds = new Rectangle(
      0,
      0,
      (this.radius + this.blurSize) * 2,
      (this.radius + this.blurSize) * 2
    );

    return this.app.renderer.generateTexture({
      target: circle,
      style: { scaleMode: SCALE_MODES.NEAREST },
      resolution: 1,
      frame: bounds,
    });
  }

  updateLayout(layout) {
    if (!layout || !this.coverSprite || !this.revealSprite) {
      return;
    }

    const { contentSize, boardCenterX, boardCenterY, tileSize } = layout;
    const size = Math.max(1, contentSize || 1);

    this.container.position.set(
      boardCenterX ?? size / 2,
      boardCenterY ?? size / 2
    );

    this.coverSprite.width = size;
    this.coverSprite.height = size;

    const halfSize = size / 2;
    this.hitArea = new Rectangle(
      -halfSize - this.padding,
      -halfSize - this.padding,
      size + this.padding * 2,
      size + this.padding * 2
    );
    this.container.hitArea = this.hitArea;

    const normalizedTile = Math.max(1, tileSize || 1);
    const baseScale = normalizedTile / 120;
    const clampedScale = Math.max(
      this.minRadiusScale,
      Math.min(this.maxRadiusScale, baseScale)
    );
    this.revealSprite.scale.set(clampedScale);
  }

  #handlePointerMove = (event) => {
    if (!this.hitArea || !this.revealSprite || !this.maskFilter) {
      return;
    }

    const localPosition = this.container.toLocal(event.global);
    const inside = this.hitArea.contains(localPosition.x, localPosition.y);

    this.maskFilter.enabled = inside;
    this.revealSprite.renderable = inside;

    if (!inside) {
      return;
    }

    this.revealSprite.position.copyFrom(localPosition);
  };

  #handlePointerLeave = () => {
    if (this.maskFilter) {
      this.maskFilter.enabled = false;
    }
    if (this.revealSprite) {
      this.revealSprite.renderable = false;
    }
  };

  destroy() {
    if (this.app?.stage) {
      this.app.stage.off("pointermove", this.#handlePointerMove);
      this.app.stage.off("pointerout", this.#handlePointerLeave);
      this.app.stage.off("pointerleave", this.#handlePointerLeave);
    }

    this.container?.destroy({ children: true });
    this.maskFilter?.destroy();
    this.coverSprite = null;
    this.revealSprite = null;
    this.hitArea = null;
  }
}
