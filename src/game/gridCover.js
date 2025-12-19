import { BlurFilter, Graphics } from "pixi.js";

const DEFAULT_COLOR = 0xeaff00;
const DEFAULT_RADIUS = 100;
const DEFAULT_BLUR = 33;
const DEFAULT_THRESHOLD = 20;

export class GridCover {
  constructor({
    parent,
    color = DEFAULT_COLOR,
    radius = DEFAULT_RADIUS,
    blur = DEFAULT_BLUR,
    threshold = DEFAULT_THRESHOLD,
  } = {}) {
    this.parent = parent ?? null;
    this.color = color;
    this.radius = radius;
    this.blur = blur;
    this.threshold = threshold;

    this.cover = new Graphics();
    this.mask = new Graphics();
    this.mask.filters = [new BlurFilter(this.blur)];
    this.cover.setMask({
      mask: this.mask,
      inverse: true,
    });

    this.cover.eventMode = "static";
    this.cover.cursor = "pointer";

    this._lastCut = null;

    this.cover.on("pointermove", this.#handlePointerMove, this);
    this.cover.on("pointerenter", this.#handlePointerEnter, this);

    if (this.parent) {
      this.parent.addChild(this.cover);
    }
  }

  setLayout({ x = 0, y = 0, size = 0 } = {}) {
    this.cover.clear().rect(0, 0, size, size).fill(this.color);
    this.cover.position.set(x, y);
    if (this.cover.parent && !this.mask.parent) {
      this.cover.parent.addChild(this.mask);
    }
  }

  clearCuts() {
    this.mask.clear();
    this._lastCut = null;
  }

  #handlePointerEnter(event) {
    this.#applyCutFromEvent(event, true);
  }

  #handlePointerMove(event) {
    this.#applyCutFromEvent(event, false);
  }

  #applyCutFromEvent(event, force) {
    if (!event?.data) return;
    const position = event.data.getLocalPosition(this.cover);
    const lastCut = this._lastCut;

    if (!force && lastCut) {
      const dx = position.x - lastCut.x;
      const dy = position.y - lastCut.y;
      if (dx * dx + dy * dy < this.threshold * this.threshold) {
        return;
      }
    }

    this.mask.circle(position.x, position.y, this.radius).fill(0xffffff);
    this._lastCut = { x: position.x, y: position.y };
  }
}
