import {
  Assets,
  Container,
  Graphics,
  Point,
  Rectangle,
  RenderTexture,
  Sprite,
  Texture,
} from "pixi.js";
const ERASE_BLEND = "destination-out";

const gridCoverModules = import.meta.glob(
  "../../assets/sprites/gridCover.png",
  {
    eager: true,
  }
);

const scratchMaskModules = import.meta.glob(
  "../../assets/sprites/scratchMasks/scratchMask_*.png",
  {
    eager: true,
  }
);

function resolveModuleValue(mod) {
  if (!mod) return null;
  if (typeof mod === "string") return mod;
  if (typeof mod.default === "string") return mod.default;
  return null;
}

async function loadTexture(source) {
  if (!source) return null;
  try {
    return await Assets.load(source);
  } catch (error) {
    console.warn("ScratchCover texture load failed", source, error);
    return null;
  }
}

export async function loadScratchCoverAssets() {
  const coverSource = resolveModuleValue(
    gridCoverModules["../../assets/sprites/gridCover.png"]
  );

  const scratchMaskEntries = Object.entries(scratchMaskModules).map(
    ([path, mod]) => {
      const match = path.match(/scratchMask_(\d+)\.png$/i);
      const id = match ? Number(match[1]) : path;
      return {
        id,
        source: resolveModuleValue(mod),
      };
    }
  );

  scratchMaskEntries.sort((a, b) => {
    if (typeof a.id === "number" && typeof b.id === "number") {
      return a.id - b.id;
    }
    return String(a.id).localeCompare(String(b.id));
  });

  const [coverTexture, maskTextures] = await Promise.all([
    loadTexture(coverSource),
    Promise.all(
      scratchMaskEntries.map(async (entry) => ({
        id: entry.id,
        texture: await loadTexture(entry.source),
      }))
    ),
  ]);

  const scratchMaskTextures = maskTextures
    .filter((entry) => Boolean(entry.texture))
    .map((entry) => ({
      id: entry.id,
      texture: entry.texture,
    }));

  if (!scratchMaskTextures.length) {
    console.warn("ScratchCover assets: no scratch mask textures were loaded");
  }

  return {
    coverTexture,
    scratchMaskTextures,
  };
}

const DEFAULT_OPTIONS = {
  scratchDistance: 3,
  maskScaleRange: [1.5, 2.0],
  randomRotation: true,
  alphaThreshold: 0.2,
  enableHover: true,
  useRoundBrush: true,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class ScratchCover {
  constructor({
    app,
    coverTexture,
    scratchMaskTextures = [],
    options = {},
  } = {}) {
    if (!app) {
      throw new Error("ScratchCover requires a Pixi Application instance");
    }

    this.app = app;
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
    this.options.scratchDistance = Math.max(1, this.options.scratchDistance);
    this.options.alphaThreshold = clamp(
      this.options.alphaThreshold,
      0,
      1
    );

    this.enabled = true;
    this._coverSize = { width: 0, height: 0 };
    this._maskTextureSize = { width: 0, height: 0 };
    this._localToMaskScale = { x: 1, y: 1 };
    this._lastScratchPoint = null;
    this._hovering = false;
    this._destroyed = false;
    this._hasScratched = false;
    this._alphaThreshold255 = Math.round(
      this.options.alphaThreshold * 255
    );

    this._cardCenters = new Map();
    this._listeners = new Map();
    this._tmpLocalPoint = new Point();
    this._scratchStamp = new Sprite(Texture.WHITE);
    this._scratchStamp.anchor.set(0.5);
    this._scratchStamp.visible = true; // must be visible to render into RT
    this._roundScratchTexture = null;
    this.container = new Container();
    this.container.eventMode = "static"; // capture pointer events
    this.container.sortableChildren = false;

    this.coverSprite = new Sprite(coverTexture ?? Texture.WHITE);
    this.coverSprite.anchor.set(0.5);
    this.coverSprite.alpha = 1;
    this.coverSprite.visible = Boolean(coverTexture);
    this.coverSprite.eventMode = "none";

    this.maskSprite = new Sprite(Texture.WHITE);
    this.maskSprite.anchor.set(0.5);
    this.maskSprite.visible = true; // Must be visible to work as mask

    this.container.addChild(this.maskSprite);
    this.container.addChild(this.coverSprite);
    // Use mask property - the mask sprite controls what's visible
    this.coverSprite.mask = this.maskSprite;

    this.setScratchTextures(scratchMaskTextures);
    this.#createEventBindings();
  }

  setScratchTextures(entries = []) {
    if (this.options.useRoundBrush) {
      this.scratchTextures = [this.#getRoundScratchTexture()].filter(Boolean);
      return;
    }

    this.scratchTextures = entries
      .map((entry) => entry?.texture ?? entry)
      .map((texture) => this.#createAlphaMaskTexture(texture))
      .filter(Boolean);

    if (!this.scratchTextures.length) {
      this.scratchTextures = [this.#getRoundScratchTexture()].filter(Boolean);
    }
  }

  setCoverTexture(texture) {
    this.coverSprite.texture = texture ?? Texture.WHITE;
    this.coverSprite.visible = Boolean(texture);
  }

  on(event, handler) {
    if (!event || typeof handler !== "function") return () => {};
    const key = String(event);
    const listeners = this._listeners.get(key) ?? new Set();
    listeners.add(handler);
    this._listeners.set(key, listeners);
    return () => this.off(key, handler);
  }

  off(event, handler) {
    if (!event || !handler) return;
    const listeners = this._listeners.get(String(event));
    listeners?.delete(handler);
  }

  emit(event, payload) {
    const listeners = this._listeners.get(String(event));
    if (!listeners || !listeners.size) return;
    for (const handler of Array.from(listeners)) {
      try {
        handler(payload);
      } catch (error) {
        console.error("ScratchCover listener failed", error);
      }
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this._lastScratchPoint = null;
    }
  }

  setLayout({ width, height }) {
    const safeWidth = Math.max(1, Math.round(width ?? this._coverSize.width));
    const safeHeight = Math.max(1, Math.round(height ?? this._coverSize.height));
    const sizeChanged =
      safeWidth !== this._coverSize.width || safeHeight !== this._coverSize.height;

    this._coverSize.width = safeWidth;
    this._coverSize.height = safeHeight;

    this.coverSprite.width = safeWidth;
    this.coverSprite.height = safeHeight;
    this.maskSprite.width = safeWidth;
    this.maskSprite.height = safeHeight;

    // Allow container to receive pointer events within the cover bounds
    this.container.hitArea = new Rectangle(-safeWidth / 2, -safeHeight / 2, safeWidth, safeHeight);

    if (sizeChanged) {
      this.#recreateMaskTexture(safeWidth, safeHeight);
    }
  }

  setCardCenters(centers = []) {
    this._cardCenters.clear();
    centers.forEach((entry, index) => {
      if (!entry) return;
      const id = entry.id ?? `${index}`;
      this._cardCenters.set(id, {
        id,
        x: entry.x ?? 0,
        y: entry.y ?? 0,
        data: entry.data,
        revealed: Boolean(entry.revealed ?? false),
      });
    });

    // Immediately evaluate any cards that might already be exposed due to an
    // existing scratch pattern (for example, when the cover is reused between
    // rounds without being reset).
    this.evaluateCardReveals();
  }

  markCardRevealed(id) {
    const card = this._cardCenters.get(id);
    if (card) {
      card.revealed = true;
    }
  }

  resetMask({ resetCardReveals = true } = {}) {
    if (!this._maskRenderTexture) return;
    this.#fillMaskTexture(1);
    if (resetCardReveals) {
      for (const card of this._cardCenters.values()) {
        card.revealed = false;
      }
    }
    this.coverSprite.alpha = 1;
    this.coverSprite.visible = true;
  }

  evaluateCardReveals() {
    this.#checkCardReveals();
  }

  revealAllInstant() {
    if (!this._maskRenderTexture) return;
    this.#fillMaskTexture(0);
    this.coverSprite.alpha = 0;
    this.emit("scratch", { type: "reveal-all" });
    for (const card of this._cardCenters.values()) {
      if (!card.revealed) {
        card.revealed = true;
        this.emit("cardRevealed", { id: card.id, data: card.data });
      }
    }
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.#removeEventBindings();
    this._scratchStamp?.destroy({ children: true, texture: false, baseTexture: false });
    this._roundScratchTexture?.destroy(true);
    this._maskRenderTexture?.destroy(true);
    this.coverSprite?.destroy();
    this.maskSprite?.destroy();
    this.container?.destroy({ children: true });
    this._listeners.clear();
    this._cardCenters.clear();
  }

  #createEventBindings() {
    // Bind to the scratch container, not the global stage
    this._onPointerMove = (event) => this.#handlePointerMove(event);
    this._onPointerOut = () => this.#handlePointerLeave();

    this.container.on("pointermove", this._onPointerMove);
    this.container.on("pointerleave", this._onPointerOut);
    this.container.on("pointerout", this._onPointerOut);
  }

  #removeEventBindings() {
    if (this._onPointerMove) {
      this.container.off("pointermove", this._onPointerMove);
    }
    if (this._onPointerOut) {
      this.container.off("pointerleave", this._onPointerOut);
      this.container.off("pointerout", this._onPointerOut);
    }
  }

  #handlePointerLeave() {
    this._hovering = false;
    this._lastScratchPoint = null;
  }

  #handlePointerMove(event) {
    if (!this.enabled || this._destroyed || !this.options.enableHover) {
      return;
    }
    if (!event || !event.global) return;
    if (!this._maskRenderTexture) {
      console.warn("No mask render texture in handlePointerMove");
      return;
    }

    const localPoint = this.container.worldTransform.applyInverse(
      event.global,
      this._tmpLocalPoint
    );
    const halfWidth = this._coverSize.width / 2;
    const halfHeight = this._coverSize.height / 2;

    const inside =
      localPoint.x >= -halfWidth &&
      localPoint.x <= halfWidth &&
      localPoint.y >= -halfHeight &&
      localPoint.y <= halfHeight;

    if (!inside) {
      this.#handlePointerLeave();
      return;
    }

    this._hovering = true;

    if (!this._lastScratchPoint) {
      this.#scratchAt(localPoint.x, localPoint.y);
      this._lastScratchPoint = { x: localPoint.x, y: localPoint.y };
      return;
    }

    const dx = localPoint.x - this._lastScratchPoint.x;
    const dy = localPoint.y - this._lastScratchPoint.y;
    const distance = Math.hypot(dx, dy);
    if (distance < this.options.scratchDistance) {
      return;
    }

    const steps = Math.max(1, Math.floor(distance / this.options.scratchDistance));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const x = this._lastScratchPoint.x + dx * t;
      const y = this._lastScratchPoint.y + dy * t;
      this.#scratchAt(x, y);
    }

    this._lastScratchPoint = { x: localPoint.x, y: localPoint.y };
  }

  #scratchAt(localX, localY) {
    if (!this._maskRenderTexture) return;
    const renderer = this.app?.renderer;
    if (!renderer) return;

    const textureEntry = this.#getRandomScratchTexture();
    const stamp = this._scratchStamp;
    stamp.texture = textureEntry ?? Texture.WHITE;
    // Use destination-out to permanently remove alpha from the mask
    stamp.blendMode = ERASE_BLEND;
    stamp.angle = this.options.randomRotation ? Math.random() * 360 : 0;
    // Ensure stamp is fully opaque so it erases properly
    stamp.alpha = 1;

    const desiredWidth = Math.max(48, Math.round(this._maskRenderTexture.width * 0.12));
    const [minScale, maxScale] = this.options.maskScaleRange;
    const baseScale = desiredWidth / (stamp.texture.width || desiredWidth);
    const randomMultiplier = minScale + Math.random() * (maxScale - minScale);
    stamp.scale.set(baseScale * randomMultiplier);

    const maskX = this.#localToMaskX(localX);
    const maskY = this.#localToMaskY(localY);
    stamp.position.set(maskX, maskY);

    renderer.render({
      container: stamp,
      target: this._maskRenderTexture,
      clear: false,
    });

    stamp.blendMode = "normal";
    this.emit("scratch", { x: localX, y: localY });
    this.#checkCardReveals();
  }

  #localToMaskX(localX) {
    return (
      (localX + this._coverSize.width / 2) * this._localToMaskScale.x
    );
  }

  #localToMaskY(localY) {
    return (
      (localY + this._coverSize.height / 2) * this._localToMaskScale.y
    );
  }

  #getRandomScratchTexture() {
    if (!this.scratchTextures?.length) {
      return Texture.WHITE;
    }
    const index = Math.floor(Math.random() * this.scratchTextures.length);
    return this.scratchTextures[index];
  }

  #getRoundScratchTexture() {
    if (this._roundScratchTexture) {
      return this._roundScratchTexture;
    }

    const renderer = this.app?.renderer;
    if (!renderer) return Texture.WHITE;

    const diameter = 128;
    const radius = diameter / 2;
    const gfx = new Graphics();
    gfx.circle(radius, radius, radius);
    gfx.fill({ color: 0xffffff, alpha: 1 });

    const texture = renderer.generateTexture(gfx, {
      resolution: 1,
      region: new Rectangle(0, 0, diameter, diameter),
    });

    gfx.destroy(true);
    this._roundScratchTexture = texture;
    return texture;
  }

  #createAlphaMaskTexture(texture) {
    if (!texture || typeof document === "undefined") return texture;
    const source = texture.baseTexture?.resource?.source;
    if (!source || !source.width || !source.height) return texture;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return texture;

      ctx.drawImage(source, 0, 0, source.width, source.height);
      const imageData = ctx.getImageData(0, 0, source.width, source.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Convert bright pixels to transparency and dark stroke to opaque black
        const alpha = 255 - Math.max(r, g, b);
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = alpha;
      }

      ctx.putImageData(imageData, 0, 0);
      return Texture.from(canvas);
    } catch (error) {
      console.warn("ScratchCover mask texture normalization failed", error);
      return texture;
    }
  }

  #recreateMaskTexture(width, height) {
    this._maskRenderTexture?.destroy(true);
    const safeWidth = Math.max(1, Math.round(width));
    const safeHeight = Math.max(1, Math.round(height));
    this._maskTextureSize.width = safeWidth;
    this._maskTextureSize.height = safeHeight;

    this._maskRenderTexture = RenderTexture.create({
      width: safeWidth,
      height: safeHeight,
      resolution: 1,
    });

    this.maskSprite.texture = this._maskRenderTexture;
    this.maskSprite.visible = true;

    this._localToMaskScale.x = this._maskRenderTexture.width / this._coverSize.width;
    this._localToMaskScale.y = this._maskRenderTexture.height / this._coverSize.height;

    this.#fillMaskTexture(1);
  }

  #fillMaskTexture(alpha) {
    if (!this._maskRenderTexture || !this.app?.renderer) return;
    const gfx = new Graphics();
    gfx.rect(0, 0, this._maskRenderTexture.width, this._maskRenderTexture.height);
    gfx.fill({ color: 0xffffff, alpha: clamp(alpha, 0, 1) });
    this.app.renderer.render({
      container: gfx,
      target: this._maskRenderTexture,
      clear: true,
    });
    gfx.destroy();
  }

  #checkCardReveals() {
    if (!this._cardCenters.size) return;
    for (const card of this._cardCenters.values()) {
      if (card.revealed) continue;
      const isTransparent = this.#isPointTransparent(card.x, card.y);
      if (isTransparent) {
        card.revealed = true;
        this.emit("cardRevealed", { id: card.id, data: card.data });
      }
    }
  }

  #isPointTransparent(localX, localY) {
    if (!this._maskRenderTexture || !this.app?.renderer) return false;
    const maskX = clamp(Math.round(this.#localToMaskX(localX)), 0, this._maskTextureSize.width - 1);
    const maskY = clamp(Math.round(this.#localToMaskY(localY)), 0, this._maskTextureSize.height - 1);
    const frame = new Rectangle(maskX, maskY, 1, 1);
    try {
      const pixels = this.app.renderer.extract.pixels({
        target: this._maskRenderTexture,
        frame,
      });
      const alpha = pixels?.[3] ?? 255;
      return alpha <= this._alphaThreshold255;
    } catch (error) {
      console.warn("ScratchCover pixel extract failed", error);
      return false;
    }
  }
}
