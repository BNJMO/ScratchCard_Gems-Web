import { Assets, BlurFilter, Graphics, Rectangle, RenderTexture, Sprite } from "pixi.js";

export class CoverScratch {
  constructor({ scene, radius, blurSize, padding = 16 } = {}) {
    this.scene = scene;
    this.radiusOption = radius;
    this.blurSizeOption = blurSize;
    this.padding = Math.max(0, Number(padding) || 0);
    this.enabled = true;

    this.coverGraphics = null;
    this.maskTexture = null;
    this.maskSprite = null;
    this.brush = null;
    this.line = null;
    this.brushMaskTextures = [];
    this.coverBounds = new Rectangle();
    this._currentRadius = null;
    this._currentBlur = null;
    this._pointerMoveHandler = (event) => this.#handlePointerMove(event);
    this._pointerDownHandler = (event) => this.#handlePointerDown(event);
    this._pointerUpHandler = () => this.#handlePointerUp();
    this._pointerOutHandler = () => this.#handlePointerOut();
    this._initialized = false;
    this._dragging = false;
    this._lastDrawnPoint = null;
  }

  async init() {
    const app = this.scene?.app;
    if (!app || !this.scene?.board) return;

    // Load brush mask textures FIRST before any brush building
    let masksJustLoaded = false;
    if (this.brushMaskTextures.length === 0) {
      await this.#loadBrushMasks();
      masksJustLoaded = true;
      console.log('Masks loaded, ready to build brush');
    }

    if (!this.line) {
      this.line = new Graphics();
    }

    if (!this._initialized) {
      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;
      app.stage.on("pointerdown", this._pointerDownHandler);
      app.stage.on("pointerup", this._pointerUpHandler);
      app.stage.on("pointerupoutside", this._pointerUpHandler);
      app.stage.on("pointermove", this._pointerMoveHandler);
      app.stage.on("pointerout", this._pointerOutHandler);
      this._initialized = true;
    }

    // Force rebuild if masks were just loaded, or build if no brush exists
    if (masksJustLoaded || !this.brush) {
      this.#rebuildBrush();
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

    const targetRadius = this.radiusOption ?? Math.max(12, Math.floor((layout.tileSize ?? 64) * 0.3));
    const targetBlur = this.blurSizeOption ?? Math.max(8, Math.floor(targetRadius * 0.25));

    if (targetRadius !== this._currentRadius || targetBlur !== this._currentBlur) {
      this.#rebuildBrush(targetRadius, targetBlur);
    }

    const sizeChanged = this.#ensureCoverAndMask();

    if (sizeChanged) {
      this.reset();
    }
  }

  destroy() {
    const app = this.scene?.app;
    if (app?.stage) {
      app.stage.off("pointerdown", this._pointerDownHandler);
      app.stage.off("pointerup", this._pointerUpHandler);
      app.stage.off("pointerupoutside", this._pointerUpHandler);
      app.stage.off("pointermove", this._pointerMoveHandler);
      app.stage.off("pointerout", this._pointerOutHandler);
    }

    // Remove mask from cover
    if (this.coverGraphics) {
      this.coverGraphics.mask = null;
    }

    if (this.coverGraphics?.parent) {
      this.coverGraphics.parent.removeChild(this.coverGraphics);
    }

    if (this.maskSprite?.parent) {
      this.maskSprite.parent.removeChild(this.maskSprite);
    }

    this.coverGraphics?.destroy();
    this.maskSprite?.destroy({ texture: false, baseTexture: false });
    this.maskTexture?.destroy(true);
    this.brush?.destroy();
    this.line?.destroy();
    this.coverGraphics = null;
    this.maskSprite = null;
    this.maskTexture = null;
    this.brush = null;
    this.line = null;
    this._initialized = false;
  }

  reset() {
    this._dragging = false;
    this._lastDrawnPoint = null;

    // Restore cover to full opacity
    if (this.coverGraphics) {
      this.coverGraphics.alpha = 1;
    }

    // Clear all scratches - fill mask with white to show full cover
    this.#clearMask();
  }

  setEnabled(enabled = true) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this._dragging = false;
      this._lastDrawnPoint = null;
    }
  }

  fadeOut(duration = 1000) {
    if (!this.coverGraphics) return;

    const startTime = Date.now();
    const startAlpha = this.coverGraphics.alpha;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic for smooth animation
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      this.coverGraphics.alpha = startAlpha * (1 - easedProgress);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Animation complete
        this.coverGraphics.alpha = 0;
      }
    };

    requestAnimationFrame(animate);
  }

  async #ensureCoverAndMask() {
    const app = this.scene?.app;
    const board = this.scene?.board;
    if (!app || !board) return false;

    const width = Math.max(1, Math.ceil(this.coverBounds.width));
    const height = Math.max(1, Math.ceil(this.coverBounds.height));

    const needsNew =
      !this.maskTexture ||
      this.maskTexture.width !== width ||
      this.maskTexture.height !== height;

    if (!needsNew) {
      return false;
    }

    // Create the mask texture (render texture for scratching)
    this.maskTexture?.destroy(true);
    this.maskTexture = RenderTexture.create({
      width,
      height,
      resolution: app.renderer.resolution ?? 1,
    });

    // Create the cover sprite from image (on top of the board)
    if (!this.coverGraphics) {
      const coverTexture = await Assets.load('assets/sprites/scratchCover.png');
      this.coverGraphics = new Sprite(coverTexture);
      this.coverGraphics.eventMode = "none";
      // Add cover above the board
      board.parent?.addChild(this.coverGraphics);
    }

    // Position and size the cover to match the bounds
    // Convert board local position to parent coordinate system
    const globalPos = board.toGlobal({ x: this.coverBounds.x, y: this.coverBounds.y });
    const localPos = board.parent.toLocal(globalPos);

    this.coverGraphics.position.set(localPos.x, localPos.y);
    this.coverGraphics.width = width;
    this.coverGraphics.height = height;

    // Create mask sprite for the cover
    if (!this.maskSprite) {
      this.maskSprite = new Sprite(this.maskTexture);
      this.maskSprite.eventMode = "none";
      board.parent?.addChild(this.maskSprite);
    } else {
      this.maskSprite.texture = this.maskTexture;
    }

    // Position mask sprite in parent's coordinate system
    this.maskSprite.position.set(localPos.x, localPos.y);

    // Apply mask to cover - cover only shows where mask is white
    // We'll invert this by filling mask with white initially and erasing where scratched
    this.coverGraphics.mask = this.maskSprite;

    return true;
  }

  async #loadBrushMasks() {
    const masks = [];

    // Try to load masks with indices 0-20 (adjust range as needed)
    for (let index = 0; index < 20; index++) {
      try {
        const path = `assets/sprites/scratchMasks/scratchMask_${index}.png`;
        const texture = await Assets.load(path);
        masks.push(texture);
        console.log(`Loaded brush mask ${index}`);
      } catch (error) {
        // This index doesn't exist, continue to next
        console.log(`No brush mask found at index ${index}, stopping...`);
        break;
      }
    }

    this.brushMaskTextures = masks;
    console.log(`Total brush masks loaded: ${masks.length}`);
  }

  #rebuildBrush(radius = 96, blurSize = 24) {
    const app = this.scene?.app;
    if (!app) return;

    this.brush?.destroy();

    // Select a random brush mask texture
    if (this.brushMaskTextures.length > 0) {
      const randomIndex = Math.floor(Math.random() * this.brushMaskTextures.length);
      const maskTexture = this.brushMaskTextures[randomIndex];

      console.log(`Using brush mask ${randomIndex} of ${this.brushMaskTextures.length}`);

      this.brush = new Sprite(maskTexture);
      this.brush.anchor.set(0.5);
      this.brush.tint = 0x000000; // Tint to black to erase the cover mask

      // Scale the brush to match the desired radius
      const scale = (radius * 2) / Math.max(maskTexture.width, maskTexture.height);
      this.brush.scale.set(scale);
    } else {
      // Fallback to circle brush if no masks loaded
      console.log('Using fallback circle brush - no masks loaded');
      this.brush = new Graphics()
        .circle(0, 0, radius)
        .fill({ color: 0x000000 });
    }

    this._currentRadius = radius;
    this._currentBlur = blurSize;
  }

  #clearMask() {
    const app = this.scene?.app;
    if (!app || !this.maskTexture) return;

    // Fill the mask texture with white
    // This makes the cover fully visible (white mask = cover shows)
    const filler = new Graphics()
      .rect(0, 0, this.maskTexture.width, this.maskTexture.height)
      .fill({ color: 0xffffff });

    app.renderer.render({
      container: filler,
      target: this.maskTexture,
      clear: true,
    });

    filler.destroy();
  }

  #scratch(globalX, globalY) {
    if (!this.enabled) return;
    if (!this.brush || !this.maskTexture || !this.scene?.board || !this.line) return;

    const app = this.scene.app;
    if (!app) return;

    // Select a random brush mask for each scratch point
    if (this.brushMaskTextures.length > 0 && this.brush instanceof Sprite) {
      const randomIndex = Math.floor(Math.random() * this.brushMaskTextures.length);
      const maskTexture = this.brushMaskTextures[randomIndex];

      // Update the brush texture
      this.brush.texture = maskTexture;

      // Recalculate scale to match the desired radius
      const scale = (this._currentRadius * 2) / Math.max(maskTexture.width, maskTexture.height);
      this.brush.scale.set(scale);
    }

    const localPoint = this.scene.board.toLocal({ x: globalX, y: globalY });

    // Check bounds
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

    // Position and render the brush to the mask texture
    this.brush.position.set(localX, localY);
    app.renderer.render({
      container: this.brush,
      target: this.maskTexture,
      clear: false,
    });

    // Smooth out the drawing by connecting the previous point to the current one
    if (this._lastDrawnPoint) {
      // Draw a line connecting the points
      const dx = localX - this._lastDrawnPoint.x;
      const dy = localY - this._lastDrawnPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.ceil(distance / (this._currentRadius * 0.5));

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = this._lastDrawnPoint.x + dx * t;
        const y = this._lastDrawnPoint.y + dy * t;

        // Select a random brush mask for each interpolated point
        if (this.brushMaskTextures.length > 0 && this.brush instanceof Sprite) {
          const randomIndex = Math.floor(Math.random() * this.brushMaskTextures.length);
          const maskTexture = this.brushMaskTextures[randomIndex];

          // Update the brush texture
          this.brush.texture = maskTexture;

          // Recalculate scale to match the desired radius
          const scale = (this._currentRadius * 2) / Math.max(maskTexture.width, maskTexture.height);
          this.brush.scale.set(scale);
        }

        this.brush.position.set(x, y);
        app.renderer.render({
          container: this.brush,
          target: this.maskTexture,
          clear: false,
        });
      }
    }

    // Update last drawn point
    if (!this._lastDrawnPoint) {
      this._lastDrawnPoint = { x: 0, y: 0 };
    }
    this._lastDrawnPoint.x = localX;
    this._lastDrawnPoint.y = localY;
  }

  #handlePointerDown(event) {
    if (!this.enabled || !event || !event.global) return;
    this._dragging = true;
    this.#scratch(event.global.x, event.global.y);
  }

  #handlePointerUp() {
    this._dragging = false;
    this._lastDrawnPoint = null;
  }

  #handlePointerMove(event) {
    if (!this.enabled || !event || !event.global) return;
    this.#scratch(event.global.x, event.global.y);
  }

  #handlePointerOut() {
    this._lastDrawnPoint = null;
  }
}
