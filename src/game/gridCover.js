import { BLEND_MODES, BlurFilter, Container, Graphics } from "pixi.js";

const DEFAULT_COLOR = 0xEAFF00;
const DEFAULT_RADIUS = 100;
const DEFAULT_BLUR_SIZE = 33;
const DEFAULT_MOVEMENT_THRESHOLD = 20;

export function createGridCover({
  width,
  height,
  color = DEFAULT_COLOR,
  radius = DEFAULT_RADIUS,
  blurSize = DEFAULT_BLUR_SIZE,
  movementThreshold = DEFAULT_MOVEMENT_THRESHOLD,
} = {}) {
  const coverContainer = new Container();

  const cover = new Graphics();
  cover.rect(0, 0, width, height).fill(color);
  cover.eventMode = "static";
  cover.cursor = "pointer";

  const eraser = new Graphics();
  eraser.blendMode = BLEND_MODES.ERASE;
  eraser.filters = [new BlurFilter({ strength: blurSize })];

  coverContainer.addChild(cover, eraser);

  let lastCutPosition = null;

  const maybeCut = (event) => {
    const position = event.getLocalPosition(cover);

    if (lastCutPosition) {
      const deltaX = position.x - lastCutPosition.x;
      const deltaY = position.y - lastCutPosition.y;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance < movementThreshold) {
        return;
      }
    }

    lastCutPosition = { x: position.x, y: position.y };
    eraser.circle(position.x, position.y, radius).fill(0xffffff);
  };

  cover.on("pointermove", maybeCut);
  cover.on("pointerover", maybeCut);

  return {
    container: coverContainer,
    cover,
    eraser,
  };
}
