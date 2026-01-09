import { Application, Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
import { Card } from "./card.js";
import { WinPopup } from "./winPopup.js";
import { SpriteWinPopup } from "./spriteWinPopup.js";
import gameConfig from "../gameConfig.json";

const DEFAULT_FONT_FAMILY = "Inter, system-ui, -apple-system, Segoe UI, Arial";

export class GameScene {
  constructor({
    root,
    backgroundColor,
    initialSize,
    palette,
    backgroundTexture,
    fontFamily = DEFAULT_FONT_FAMILY,
    gridRows,
    gridColumns,
    strokeWidth,
    cardOptions,
    layoutOptions,
    animationOptions,
    winPopupOptions,
    onResize,
  }) {
    this.root = root;
    this.backgroundColor = backgroundColor;
    this.initialSize = Math.max(1, initialSize || 400);
    this.palette = palette;
    this.fontFamily = fontFamily;
    this.backgroundTexture = backgroundTexture ?? null;
    this.gridRows = Math.max(1, gridRows || 1);
    this.gridColumns = Math.max(1, gridColumns || 1);
    this.strokeWidth = strokeWidth;
    this.cardOptions = {
      icon: cardOptions?.icon ?? {},
      winPopupWidth: cardOptions?.winPopupWidth,
      winPopupHeight: cardOptions?.winPopupHeight,
      matchEffects: cardOptions?.matchEffects ?? {},
      frameTexture: cardOptions?.frameTexture ?? null,
      frameScale: cardOptions?.frameScale ?? 1.0,
      frameOffsetX: cardOptions?.frameOffsetX ?? 0,
      frameOffsetY: cardOptions?.frameOffsetY ?? 0,
      tileScaleFactorX: cardOptions?.tileScaleFactorX ?? 1.0,
      tileScaleFactorY: cardOptions?.tileScaleFactorY ?? 1.0,
      stateTextures: cardOptions?.stateTextures ?? {},
    };
    this.layoutOptions = {
      gapBetweenTiles: layoutOptions?.gapBetweenTiles ?? 0.012,
      tilePaddingX: layoutOptions?.tilePaddingX ?? 1.0,
      tilePaddingY: layoutOptions?.tilePaddingY ?? 1.0,
    };
    this.animationOptions = {
      hoverEnabled: animationOptions?.hoverEnabled ?? true,
      hoverEnterDuration: animationOptions?.hoverEnterDuration ?? 120,
      hoverExitDuration: animationOptions?.hoverExitDuration ?? 200,
      hoverSkewAmount: animationOptions?.hoverSkewAmount ?? 0.02,
      hoverTiltAxis: animationOptions?.hoverTiltAxis ?? "x",
      wiggleSelectionEnabled: animationOptions?.wiggleSelectionEnabled ?? true,
      wiggleSelectionDuration: animationOptions?.wiggleSelectionDuration ?? 900,
      wiggleSelectionTimes: animationOptions?.wiggleSelectionTimes ?? 15,
      wiggleSelectionIntensity: animationOptions?.wiggleSelectionIntensity ?? 0.03,
      wiggleSelectionScale: animationOptions?.wiggleSelectionScale ?? 0.005,
      cardsSpawnDuration: animationOptions?.cardsSpawnDuration ?? 350,
      disableAnimations: animationOptions?.disableAnimations ?? false,
    };
    this.winPopupOptions = {
      useSprite: winPopupOptions?.useSprite ?? gameConfig?.gameplay?.winPopup?.useSprite ?? true,
      spriteName: winPopupOptions?.spriteName ?? gameConfig?.gameplay?.winPopup?.spriteName ?? "winPopup",
      scale: winPopupOptions?.scale ?? gameConfig?.gameplay?.winPopup?.scale ?? 0.6,
      offsetX: winPopupOptions?.offsetX ?? gameConfig?.gameplay?.winPopup?.offsetX ?? 0,
      offsetY: winPopupOptions?.offsetY ?? gameConfig?.gameplay?.winPopup?.offsetY ?? 0,
      showDuration: winPopupOptions?.showDuration ?? gameConfig?.gameplay?.winPopup?.showDuration ?? 2000,
      animationDuration: winPopupOptions?.animationDuration ?? gameConfig?.gameplay?.winPopup?.animationDuration ?? 300,
      showText: winPopupOptions?.showText ?? gameConfig?.gameplay?.winPopup?.showText ?? true,
      textColor: winPopupOptions?.textColor ?? gameConfig?.gameplay?.winPopup?.textColor ?? "#FFFFFF",
      amountColor: winPopupOptions?.amountColor ?? gameConfig?.gameplay?.winPopup?.amountColor ?? "#EAFF00",
      baseFontSize: winPopupOptions?.baseFontSize ?? winPopupOptions?.fontSize ?? gameConfig?.gameplay?.winPopup?.fontSize ?? 22,
      baseAmountFontSize: winPopupOptions?.baseAmountFontSize ?? winPopupOptions?.amountFontSize ?? gameConfig?.gameplay?.winPopup?.amountFontSize ?? 18,
      textOffsetX: winPopupOptions?.textOffsetX ?? gameConfig?.gameplay?.winPopup?.textOffsetX ?? 0,
      textOffsetY: winPopupOptions?.textOffsetY ?? gameConfig?.gameplay?.winPopup?.textOffsetY ?? 0,
    };
    this.onResize = onResize;

    this.cards = [];
    this.disableAnimations = this.animationOptions.disableAnimations;

    this.app = null;
    this.board = null;
    this.boardShadows = null;
    this.boardContent = null;
    this.winPopup = null;
    this.backgroundSprite = null;
    this.resizeObserver = null;
    this._windowResizeListener = null;
    this._currentResolution = 1;
    this._lastLayout = null;
  }

  async init() {
    this.app = new Application();
    const initialResolution = this.#getTargetResolution();
    await this.app.init({
      background: this.backgroundColor,
      width: this.initialSize,
      height: this.initialSize,
      antialias: true,
      resolution: initialResolution,
    });

    this._currentResolution = initialResolution;
    this.app.renderer.resolution = this._currentResolution;

    if (this.backgroundTexture) {
      this.backgroundSprite = new Sprite(this.backgroundTexture);
      this.backgroundSprite.anchor.set(0.5, 0.5);
      this.backgroundSprite.eventMode = "none";
      this.app.stage.addChild(this.backgroundSprite);
    }

    this.board = new Container();
    this.boardShadows = new Container();
    this.boardShadows.eventMode = "none";
    this.boardContent = new Container();
    this.board.addChild(this.boardShadows, this.boardContent);
    this.app.stage.addChild(this.board);

    this.root.innerHTML = "";
    this.root.appendChild(this.app.canvas);

    const accentColor = this.#colorToHex(
      this.palette?.winPopupBorder,
      "#EAFF00"
    );
    const backgroundColor = this.#colorToHex(
      this.palette?.winPopupBackground,
      "#0B1E29"
    );

    if (this.winPopupOptions.useSprite) {
      this.winPopup = new SpriteWinPopup({
        parent: this.root,
        spriteName: this.winPopupOptions.spriteName,
        scale: this.winPopupOptions.scale,
        offsetX: this.winPopupOptions.offsetX,
        offsetY: this.winPopupOptions.offsetY,
        showDuration: this.winPopupOptions.showDuration,
        animationDuration: this.winPopupOptions.animationDuration,
        showText: this.winPopupOptions.showText,
        textColor: this.winPopupOptions.textColor,
        amountColor: this.winPopupOptions.amountColor,
        baseFontSize: this.winPopupOptions.baseFontSize,
        baseAmountFontSize: this.winPopupOptions.baseAmountFontSize,
        textOffsetX: this.winPopupOptions.textOffsetX,
        textOffsetY: this.winPopupOptions.textOffsetY,
      });
    } else {
      this.winPopup = new WinPopup({
        parent: this.root,
        fontFamily: this.fontFamily,
        accentColor,
        backgroundColor,
      });
    }

    this.#setupRootSizing();
    this.#setupWindowResizeListener();
    this.resize();
  }

  destroy() {
    this.resizeObserver?.disconnect();
    if (this._windowResizeListener && typeof window !== "undefined") {
      window.removeEventListener("resize", this._windowResizeListener);
    }
    this._windowResizeListener = null;
    this.cards.forEach((card) => {
      card?.destroy?.();
    });
    this.cards = [];
    this.app?.destroy(true);
    if (this.app?.canvas?.parentNode === this.root) {
      this.root.removeChild(this.app.canvas);
    }
    this.winPopup?.destroy?.();
  }

  buildGrid({ interactionFactory }) {
    this.clearGrid();
    const layout = this.#layoutSizes();

    for (let r = 0; r < this.gridRows; r += 1) {
      for (let c = 0; c < this.gridColumns; c += 1) {
        const card = new Card({
          app: this.app,
          palette: this.palette,
          animationOptions: this.animationOptions,
          iconOptions: this.cardOptions.icon,
          matchEffects: this.cardOptions.matchEffects,
          frameTexture: this.cardOptions.frameTexture,
          frameScale: this.cardOptions.frameScale,
          frameOffsetX: this.cardOptions.frameOffsetX,
          frameOffsetY: this.cardOptions.frameOffsetY,
          tileScaleFactorX: this.cardOptions.tileScaleFactorX,
          tileScaleFactorY: this.cardOptions.tileScaleFactorY,
          stateTextures: this.cardOptions.stateTextures,
          row: r,
          col: c,
          tileSize: layout.tileSize,
          strokeWidth: this.strokeWidth,
          disableAnimations: this.disableAnimations,
          interactionCallbacks: interactionFactory?.(r, c),
        });

        this.cards.push(card);
        if (card.shadowDisplayObject) {
          this.boardShadows?.addChild(card.shadowDisplayObject);
        }
        this.boardContent?.addChild(card.displayObject);
      }
    }

    this.layoutCards(layout);
  }

  layoutCards(layout = this.#layoutSizes()) {
    if (!this.cards.length) return;

    const {
      tileSize,
      gapX,
      gapY,
      contentWidth,
      contentHeight,
      boardCenterX,
      boardCenterY,
    } = layout;
    const startX = -contentWidth / 2;
    const startY = -contentHeight / 2;

    for (const card of this.cards) {
      const scale = tileSize / card._tileSize;
      const x = startX + card.col * (tileSize + gapX);
      const y = startY + card.row * (tileSize + gapY);
      card.setLayout({ x, y, scale });
    }

    const centerX =
      boardCenterX ?? (this.app?.renderer?.width ?? 0) / 2;
    const centerY =
      boardCenterY ?? (this.app?.renderer?.height ?? 0) / 2;

    this.board.position.set(centerX, centerY);
    this._lastLayout = layout;
  }

  resize() {
    if (!this.app) return;

    const resolution = this.#getTargetResolution();
    if (resolution !== this._currentResolution) {
      this._currentResolution = resolution;
      this.app.renderer.resolution = resolution;
    }

    const width = Math.max(1, this.root.clientWidth || this.initialSize);
    const height = Math.max(1, this.root.clientHeight || width);
    this.app.renderer.resize(width, height);
    this.#syncCanvasCssSize({ width, height });
    this.#layoutBackgroundSprite();
    if (this.cards.length > 0) {
      this.layoutCards();
    }

    if (!this.winPopupOptions.useSprite) {
      const size = Math.min(width, height);
      const winPopupWidth = size * 0.40;
      const winPopupHeight = size * 0.15;
      this.winPopup?.setSize?.({ width: winPopupWidth, height: winPopupHeight });
    } else {
      // Update sprite win popup position on resize
      this.winPopup?.updatePosition?.();
    }

    this.onResize?.(Math.min(width, height));
  }

  #colorToHex(value, fallback = "#000000") {
    if (typeof value === "number" && Number.isFinite(value)) {
      const hex = value.toString(16).padStart(6, "0");
      return `#${hex}`;
    }
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    return fallback;
  }

  #layoutBackgroundSprite() {
    if (!this.app || !this.backgroundSprite) return;

    const rendererWidth = this.app.renderer.width;
    const rendererHeight = this.app.renderer.height;
    if (rendererWidth <= 0 || rendererHeight <= 0) return;

    const texture = this.backgroundSprite.texture;
    const textureWidth = texture?.orig?.width || texture?.width || 0;
    const textureHeight = texture?.orig?.height || texture?.height || 0;
    if (textureWidth <= 0 || textureHeight <= 0) {
      return;
    }

    const scale = Math.max(
      rendererWidth / textureWidth,
      rendererHeight / textureHeight
    );

    this.backgroundSprite.scale.set(scale);
    this.backgroundSprite.position.set(
      rendererWidth / 2,
      rendererHeight / 2
    );
  }

  clearGrid() {
    for (const card of this.cards) {
      card?.destroy?.();
    }
    this.boardShadows?.removeChildren();
    this.boardContent?.removeChildren();
    this.cards = [];
    this._lastLayout = null;
  }

  setAnimationsEnabled(enabled) {
    this.disableAnimations = !enabled;
    for (const card of this.cards) {
      card.setDisableAnimations(!enabled);
    }
  }

  hideWinPopup() {
    this.winPopup?.hide?.();
  }

  showWinPopup({ amount } = {}) {
    this.winPopup?.show?.({ amount });
  }

  setWinPopupAmount(amount) {
    this.winPopup?.setAmount?.(amount);
  }

  updateWinPopupOptions(newOptions = {}) {
    this.winPopupOptions = {
      ...this.winPopupOptions,
      ...newOptions,
    };
    
    if (this.winPopup && typeof this.winPopup.updateOptions === 'function') {
      this.winPopup.updateOptions(newOptions);
    }
  }

  // Debug method to test win popup
  testWinPopup(amount = 100.50) {
    console.log("Testing win popup with amount:", amount);
    this.showWinPopup({ amount });
  }

  // Method to force recreate popup with new settings
  recreatePopup() {
    if (this.winPopup) {
      this.winPopup.destroy();
      this.winPopup = null;
    }
    
    // Recreate with current options
    const accentColor = this.#colorToHex(
      this.palette?.winPopupBorder,
      "#EAFF00"
    );
    const backgroundColor = this.#colorToHex(
      this.palette?.winPopupBackground,
      "#0B1E29"
    );

    if (this.winPopupOptions.useSprite) {
      this.winPopup = new SpriteWinPopup({
        parent: this.root,
        spriteName: this.winPopupOptions.spriteName,
        scale: this.winPopupOptions.scale,
        offsetX: this.winPopupOptions.offsetX,
        offsetY: this.winPopupOptions.offsetY,
        showDuration: this.winPopupOptions.showDuration,
        animationDuration: this.winPopupOptions.animationDuration,
        showText: this.winPopupOptions.showText,
        textColor: this.winPopupOptions.textColor,
        amountColor: this.winPopupOptions.amountColor,
        baseFontSize: this.winPopupOptions.baseFontSize,
        baseAmountFontSize: this.winPopupOptions.baseAmountFontSize,
        textOffsetX: this.winPopupOptions.textOffsetX,
        textOffsetY: this.winPopupOptions.textOffsetY,
      });
    } else {
      this.winPopup = new WinPopup({
        parent: this.root,
        fontFamily: this.fontFamily,
        accentColor,
        backgroundColor,
      });
    }
    
    console.log("Popup recreated with new settings");
  }

  // Method to update popup settings and recreate
  updatePopupSettings(newSettings = {}) {
    const defaultSettings = {
      scale: 0.5,
      baseFontSize: 90,
      baseAmountFontSize: 22,
      ...newSettings
    };
    
    // Update the options
    this.winPopupOptions = {
      ...this.winPopupOptions,
      ...defaultSettings
    };
    
    // Recreate the popup
    this.recreatePopup();
    
    console.log("Updated popup settings:", defaultSettings);
    
    // Test the popup with new settings
    setTimeout(() => {
      this.testWinPopup(123.45);
    }, 100);
  }

  #setupRootSizing() {
    if (!this.root) return;
    this.root.style.position = this.root.style.position || "relative";
    this.root.style.aspectRatio = this.root.style.aspectRatio || "1 / 1";
    if (!this.root.style.width && !this.root.style.height) {
      this.root.style.width = `${this.initialSize}px`;
      this.root.style.maxWidth = "100%";
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.root);
  }

  #setupWindowResizeListener() {
    if (this._windowResizeListener && typeof window !== "undefined") {
      window.removeEventListener("resize", this._windowResizeListener);
    }

    this._windowResizeListener = () => {
      this.resize();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("resize", this._windowResizeListener, {
        passive: true,
      });
    }
  }

  #syncCanvasCssSize({ width, height }) {
    const canvas = this.app?.canvas;
    if (!canvas) return;

    const cssWidth = `${width}px`;
    const cssHeight = `${height}px`;
    if (canvas.style.width !== cssWidth) {
      canvas.style.width = cssWidth;
    }
    if (canvas.style.height !== cssHeight) {
      canvas.style.height = cssHeight;
    }
    if (canvas.style.maxWidth !== "100%") {
      canvas.style.maxWidth = "100%";
    }
    if (canvas.style.maxHeight !== "100%") {
      canvas.style.maxHeight = "100%";
    }
  }

  #getTargetResolution() {
    if (typeof window === "undefined") {
      return 1;
    }

    const deviceRatio = Number(window.devicePixelRatio) || 1;
    return Math.max(1, Math.min(deviceRatio, 2));
  }

  #layoutSizes() {
    const rendererWidth = this.app?.renderer?.width ?? 1;
    const rendererHeight = this.app?.renderer?.height ?? 1;
    const { horizontal, vertical } = this.#getGridPadding();

    const availableWidth = Math.max(1, rendererWidth - horizontal * 2);
    const availableHeight = Math.max(1, rendererHeight - vertical * 2);
    const size = Math.min(availableWidth, availableHeight);

    const topSpace = 30;
    const boardSpace = Math.max(40, size - topSpace - 5);
    const gapValue = this.layoutOptions?.gapBetweenTiles ?? 0.012;
    const baseGap = Math.max(1, Math.floor(boardSpace * gapValue));
    const paddingX = Number(this.layoutOptions?.tilePaddingX ?? 1);
    const paddingY = Number(this.layoutOptions?.tilePaddingY ?? 1);
    const gapX = Math.max(0, Math.floor(baseGap * paddingX));
    const gapY = Math.max(0, Math.floor(baseGap * paddingY));
    const totalHorizontalGaps = gapX * Math.max(0, this.gridColumns - 1);
    const totalVerticalGaps = gapY * Math.max(0, this.gridRows - 1);
    const tileAreaWidth = Math.max(1, boardSpace - totalHorizontalGaps);
    const tileAreaHeight = Math.max(1, boardSpace - totalVerticalGaps);
    const tileSize = Math.max(
      1,
      Math.floor(
        Math.min(
          tileAreaWidth / this.gridColumns,
          tileAreaHeight / this.gridRows
        )
      )
    );
    const contentWidth = tileSize * this.gridColumns + totalHorizontalGaps;
    const contentHeight = tileSize * this.gridRows + totalVerticalGaps;
    const contentSize = Math.max(contentWidth, contentHeight);
    const boardCenterX = horizontal + availableWidth / 2;
    const boardCenterY = vertical + availableHeight / 2;

    return {
      tileSize,
      gapX,
      gapY,
      contentWidth,
      contentHeight,
      contentSize,
      boardCenterX,
      boardCenterY,
    };
  }

  getBoardLayout() {
    const layout = this._lastLayout;
    if (!layout) return null;

    return {
      ...layout,
    };
  }

  getBoardBounds() {
    const layout = this._lastLayout;
    if (!layout) return null;

    const width = layout.contentWidth ?? layout.contentSize ?? 0;
    const height = layout.contentHeight ?? layout.contentSize ?? 0;
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    return new Rectangle(
      (layout.boardCenterX ?? 0) - halfWidth,
      (layout.boardCenterY ?? 0) - halfHeight,
      width,
      height
    );
  }

  #positionWinPopup() {
    if (!this.winPopup) return;
    const layout = this._lastLayout;
    const fallbackWidth = this.app?.renderer?.width ?? 0;
    const fallbackHeight = this.app?.renderer?.height ?? 0;
    const centerX = layout?.boardCenterX ?? fallbackWidth / 2;
    const centerY = layout?.boardCenterY ?? fallbackHeight / 2;
    this.winPopup.container.position.set(centerX, centerY);
  }

  #getGridPadding() {
    if (!this.app?.renderer) {
      return { horizontal: 0, vertical: 0 };
    }

    if (this.#isPortraitViewport()) {
      return { horizontal: 0, vertical: 0 };
    }

    const rendererWidth = this.app.renderer.width;
    const rendererHeight = this.app.renderer.height;

    const horizontalPadding = rendererWidth > 0 ? rendererWidth * 0.02 : 0;

    let verticalPadding = 0;
    if (typeof window !== "undefined") {
      const viewportHeight = Number(window.innerHeight);
      if (Number.isFinite(viewportHeight) && viewportHeight > 0) {
        verticalPadding = viewportHeight * 0.06;
      }
    }

    if (!(verticalPadding > 0) && rendererHeight > 0) {
      verticalPadding = rendererHeight * 0.06;
    }

    const maxHorizontal = Math.max(0, rendererWidth / 2 - 1);
    const maxVertical = Math.max(0, rendererHeight / 2 - 1);

    return {
      horizontal: Math.max(0, Math.min(horizontalPadding, maxHorizontal)),
      vertical: Math.max(0, Math.min(verticalPadding, maxVertical)),
    };
  }

  #isPortraitViewport() {
    if (typeof window !== "undefined") {
      const viewportWidth = Number(window.innerWidth);
      const viewportHeight = Number(window.innerHeight);
      if (
        Number.isFinite(viewportWidth) &&
        Number.isFinite(viewportHeight) &&
        viewportWidth > 0 &&
        viewportHeight > 0
      ) {
        return viewportHeight >= viewportWidth;
      }

      const mediaQuery = window.matchMedia?.("(orientation: portrait)");
      if (mediaQuery?.matches === true) {
        return true;
      }
      if (mediaQuery?.matches === false) {
        return false;
      }
    }

    const rendererWidth = this.app?.renderer?.width;
    const rendererHeight = this.app?.renderer?.height;
    if (
      Number.isFinite(rendererWidth) &&
      Number.isFinite(rendererHeight) &&
      rendererWidth > 0 &&
      rendererHeight > 0
    ) {
      return rendererHeight > rendererWidth;
    }

    return false;
  }
}
