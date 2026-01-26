import {
  Application,
  Container,
  Rectangle,
  Sprite,
} from "pixi.js";
import { Card } from "./card.js";
import { WinPopup } from "./winPopup.js";
import gameConfig from "../gameConfig.json";

const DEFAULT_FONT_FAMILY = "Inter, system-ui, -apple-system, Segoe UI, Arial";

export class GameScene {
  constructor({
    root,
    backgroundColor,
    initialSize,
    palette,
    backgroundTexture,
    gridBackgroundTexture,
    fontFamily = DEFAULT_FONT_FAMILY,
    gridRows,
    gridColumns,
    strokeWidth,
    cardOptions,
    layoutOptions,
    gridOptions,
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
    this.gridBackgroundTexture = gridBackgroundTexture ?? null;
    this.gridRows = Math.max(1, gridRows || 1);
    this.gridColumns = Math.max(1, gridColumns || 1);
    this.strokeWidth = strokeWidth;

    this.cardOptions = {
      icon: cardOptions?.icon ?? {},
      matchEffects: cardOptions?.matchEffects ?? {},
      frameTexture: cardOptions?.frameTexture ?? null,
      frameScale: cardOptions?.frameScale ?? 1.0,
      frameOffsetX: cardOptions?.frameOffsetX ?? 0,
      frameOffsetY: cardOptions?.frameOffsetY ?? 0,
      tileScaleFactorX: cardOptions?.tileScaleFactorX ?? 1.0,
      tileScaleFactorY: cardOptions?.tileScaleFactorY ?? 1.0,
      stateTextures: cardOptions?.stateTextures ?? {},
    };

    // NOTE: Keep legacy tilePaddingX/Y for backward compatibility
    // NEW: outerPaddingX/Y and innerPaddingX/Y
    this.layoutOptions = {
      gapBetweenTiles: layoutOptions?.gapBetweenTiles ?? 0.012,

      tilePaddingX: layoutOptions?.tilePaddingX ?? 1.0,
      tilePaddingY: layoutOptions?.tilePaddingY ?? 1.0,

      outerPaddingX: layoutOptions?.outerPaddingX ?? 0,
      outerPaddingY: layoutOptions?.outerPaddingY ?? 0,
      innerPaddingX: layoutOptions?.innerPaddingX ?? 0,
      innerPaddingY: layoutOptions?.innerPaddingY ?? 0,
    };

    this.gridOptions = {
      scaleFactor:
        gridOptions?.scaleFactor ??
        gameConfig?.gameplay?.grid?.scaleFactor ??
        1,
      positionOffsetX:
        gridOptions?.positionOffsetX ??
        gameConfig?.gameplay?.grid?.positionOffsetX ??
        0,
      positionOffsetY:
        gridOptions?.positionOffsetY ??
        gameConfig?.gameplay?.grid?.positionOffsetY ??
        0,
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
      wiggleSelectionIntensity:
        animationOptions?.wiggleSelectionIntensity ?? 0.03,
      wiggleSelectionScale: animationOptions?.wiggleSelectionScale ?? 0.005,
      cardsSpawnDuration: animationOptions?.cardsSpawnDuration ?? 350,
      disableAnimations: animationOptions?.disableAnimations ?? false,
    };

    this.winPopupOptions = {
      spriteName:
        winPopupOptions?.spriteName ??
        gameConfig?.gameplay?.winPopup?.spriteName ??
        "winPopup",
      scale:
        winPopupOptions?.scale ?? gameConfig?.gameplay?.winPopup?.scale ?? 0.6,
      minScale:
        winPopupOptions?.minScale ?? gameConfig?.gameplay?.winPopup?.minScale,
      offsetX:
        winPopupOptions?.offsetX ??
        gameConfig?.gameplay?.winPopup?.offsetX ??
        0,
      offsetY:
        winPopupOptions?.offsetY ??
        gameConfig?.gameplay?.winPopup?.offsetY ??
        0,
      showDuration:
        winPopupOptions?.showDuration ??
        gameConfig?.gameplay?.winPopup?.showDuration ??
        2000,
      animationDuration:
        winPopupOptions?.animationDuration ??
        gameConfig?.gameplay?.winPopup?.animationDuration ??
        300,
      showText:
        winPopupOptions?.showText ??
        gameConfig?.gameplay?.winPopup?.showText ??
        true,
      textColor:
        winPopupOptions?.textColor ??
        gameConfig?.gameplay?.winPopup?.textColor ??
        "#FFFFFF",
      amountColor:
        winPopupOptions?.amountColor ??
        gameConfig?.gameplay?.winPopup?.amountColor ??
        "#EAFF00",
      baseFontSize:
        winPopupOptions?.baseFontSize ??
        winPopupOptions?.fontSize ??
        gameConfig?.gameplay?.winPopup?.fontSize ??
        22,
      baseAmountFontSize:
        winPopupOptions?.baseAmountFontSize ??
        winPopupOptions?.amountFontSize ??
        gameConfig?.gameplay?.winPopup?.amountFontSize ??
        18,
      textOffsetX:
        winPopupOptions?.textOffsetX ??
        gameConfig?.gameplay?.winPopup?.textOffsetX ??
        0,
      textOffsetY:
        winPopupOptions?.textOffsetY ??
        gameConfig?.gameplay?.winPopup?.textOffsetY ??
        0,
      textLinesPadding:
        winPopupOptions?.textLinesPadding ??
        gameConfig?.gameplay?.winPopup?.textLinesPadding ??
        0,
    };

    this.onResize = onResize;

    this.cards = [];
    this.disableAnimations = this.animationOptions.disableAnimations;

    this.app = null;
    this.board = null;
    this.gridBackgroundSprite = null;
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
    const initialResolution = this._getTargetResolution();

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

    if (this.gridBackgroundTexture) {
      this.gridBackgroundSprite = new Sprite(this.gridBackgroundTexture);
      this.gridBackgroundSprite.anchor.set(0.5, 0.5);
      this.gridBackgroundSprite.eventMode = "none";
      this.board.addChild(this.gridBackgroundSprite);
    }

    this.boardShadows = new Container();
    this.boardShadows.eventMode = "none";
    this.boardContent = new Container();
    this.board.addChild(this.boardShadows, this.boardContent);
    this.app.stage.addChild(this.board);

    this.root.innerHTML = "";
    this.root.appendChild(this.app.canvas);

    this.winPopup = new WinPopup({
      parent: this.root,
      spriteName: this.winPopupOptions.spriteName,
      scale: this.winPopupOptions.scale,
      minScale: this.winPopupOptions.minScale,
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
      textLinesPadding: this.winPopupOptions.textLinesPadding,
    });

    this._setupRootSizing();
    this._setupWindowResizeListener();
    this.resize();
  }

  destroy() {
    this.resizeObserver?.disconnect();
    if (this._windowResizeListener && typeof window !== "undefined") {
      window.removeEventListener("resize", this._windowResizeListener);
    }
    this._windowResizeListener = null;

    this.cards.forEach((card) => card?.destroy?.());
    this.cards = [];

    this.app?.destroy(true);
    if (this.app?.canvas?.parentNode === this.root) {
      this.root.removeChild(this.app.canvas);
    }

    this.winPopup?.destroy?.();
  }

  buildGrid({ interactionFactory }) {
    this.clearGrid();
    const layout = this._layoutSizes();

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

  layoutCards(layout = this._layoutSizes()) {
    if (!this.cards.length) return;

    const {
      tileSize,
      gapX,
      gapY,
      scaledTileWidth,
      scaledTileHeight,
      contentWidth,
      contentHeight,
      boardCenterX,
      boardCenterY,
      outerPaddingX,
      outerPaddingY,
    } = layout;

    const gridScale = this._resolveGridScale();
    const { offsetX, offsetY } = this._resolveGridOffsets();

    const stepX = (scaledTileWidth ?? tileSize) + gapX;
    const stepY = (scaledTileHeight ?? tileSize) + gapY;

    const visualOffsetX = (tileSize - (scaledTileWidth ?? tileSize)) / 2;
    const visualOffsetY = (tileSize - (scaledTileHeight ?? tileSize)) / 2;

    // NEW: start position includes outer padding (background stays fixed, tiles shift inward)
    const startX = -contentWidth / 2 + (outerPaddingX ?? 0) - visualOffsetX;
    const startY = -contentHeight / 2 + (outerPaddingY ?? 0) - visualOffsetY;

    for (const card of this.cards) {
      const scale = tileSize / card._tileSize;
      const x = startX + card.col * stepX;
      const y = startY + card.row * stepY;
      card.setLayout({ x, y, scale });
    }

    const centerX = boardCenterX ?? (this.app?.renderer?.width ?? 0) / 2;
    const centerY = boardCenterY ?? (this.app?.renderer?.height ?? 0) / 2;

    this.board.position.set(centerX + offsetX, centerY + offsetY);
    this.board.scale.set(gridScale);

    this._layoutGridBackground(layout);

    layout.gridScale = gridScale;
    layout.gridOffsetX = offsetX;
    layout.gridOffsetY = offsetY;
    this._lastLayout = layout;
  }

  resize() {
    if (!this.app) return;

    const resolution = this._getTargetResolution();
    if (resolution !== this._currentResolution) {
      this._currentResolution = resolution;
      this.app.renderer.resolution = resolution;
    }

    const width = Math.max(1, this.root.clientWidth || this.initialSize);
    const height = Math.max(1, this.root.clientHeight || width);
    this.app.renderer.resize(width, height);
    this._syncCanvasCssSize({ width, height });

    this._layoutBackgroundSprite();

    if (this.cards.length > 0) {
      this.layoutCards();
    }

    this.winPopup?.updatePosition?.();
    this.onResize?.(Math.min(width, height));
  }

  _layoutBackgroundSprite() {
    if (!this.app || !this.backgroundSprite) return;

    const rendererWidth = this.app.renderer.width;
    const rendererHeight = this.app.renderer.height;
    if (rendererWidth <= 0 || rendererHeight <= 0) return;

    const texture = this.backgroundSprite.texture;
    const textureWidth = texture?.orig?.width || texture?.width || 0;
    const textureHeight = texture?.orig?.height || texture?.height || 0;
    if (textureWidth <= 0 || textureHeight <= 0) return;

    const scale = Math.max(
      rendererWidth / textureWidth,
      rendererHeight / textureHeight
    );

    this.backgroundSprite.scale.set(scale);
    this.backgroundSprite.position.set(rendererWidth / 2, rendererHeight / 2);
  }

  _layoutGridBackground(layout) {
    if (!this.gridBackgroundSprite || !layout) return;

    // Background is stable and matches the "board area"
    const width = Math.max(1, layout.contentWidth ?? 0);
    const height = Math.max(1, layout.contentHeight ?? 0);

    this.gridBackgroundSprite.width = width;
    this.gridBackgroundSprite.height = height;
    this.gridBackgroundSprite.position.set(0, 0);
  }

  clearGrid() {
    for (const card of this.cards) card?.destroy?.();
    this.boardShadows?.removeChildren();
    this.boardContent?.removeChildren();
    this.cards = [];
    this._lastLayout = null;
  }

  setAnimationsEnabled(enabled) {
    this.disableAnimations = !enabled;
    for (const card of this.cards) card.setDisableAnimations(!enabled);
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
    this.winPopupOptions = { ...this.winPopupOptions, ...newOptions };
    if (this.winPopup && typeof this.winPopup.updateOptions === "function") {
      this.winPopup.updateOptions(newOptions);
    }
  }

  testWinPopup(amount = 100.5) {
    console.log("Testing win popup with amount:", amount);
    this.showWinPopup({ amount });
  }

  recreatePopup() {
    if (this.winPopup) {
      this.winPopup.destroy();
      this.winPopup = null;
    }

    this.winPopup = new WinPopup({
      parent: this.root,
      spriteName: this.winPopupOptions.spriteName,
      scale: this.winPopupOptions.scale,
      minScale: this.winPopupOptions.minScale,
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
      textLinesPadding: this.winPopupOptions.textLinesPadding,
    });

    console.log("Popup recreated with new settings");
  }

  updatePopupSettings(newSettings = {}) {
    const defaultSettings = {
      scale: 0.5,
      baseFontSize: 90,
      baseAmountFontSize: 22,
      ...newSettings,
    };

    this.winPopupOptions = { ...this.winPopupOptions, ...defaultSettings };
    this.recreatePopup();

    console.log("Updated popup settings:", defaultSettings);

    setTimeout(() => this.testWinPopup(123.45), 100);
  }

  _setupRootSizing() {
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

  _setupWindowResizeListener() {
    if (this._windowResizeListener && typeof window !== "undefined") {
      window.removeEventListener("resize", this._windowResizeListener);
    }

    this._windowResizeListener = () => this.resize();

    if (typeof window !== "undefined") {
      window.addEventListener("resize", this._windowResizeListener, {
        passive: true,
      });
    }
  }

  _syncCanvasCssSize({ width, height }) {
    const canvas = this.app?.canvas;
    if (!canvas) return;

    const cssWidth = `${width}px`;
    const cssHeight = `${height}px`;

    if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
    if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;

    if (canvas.style.maxWidth !== "100%") canvas.style.maxWidth = "100%";
    if (canvas.style.maxHeight !== "100%") canvas.style.maxHeight = "100%";
  }

  _getTargetResolution() {
    if (typeof window === "undefined") return 1;
    const deviceRatio = Number(window.devicePixelRatio) || 1;
    return Math.max(1, Math.min(deviceRatio, 2));
  }

  // -------- NEW GRID LAYOUT (outer + inner padding) --------
  _layoutSizes() {
    const rendererWidth = this.app?.renderer?.width ?? 1;
    const rendererHeight = this.app?.renderer?.height ?? 1;

    const { horizontal, vertical } = this._getGridPadding();
    const availableWidth = Math.max(1, rendererWidth - horizontal * 2);
    const availableHeight = Math.max(1, rendererHeight - vertical * 2);

    const topSpace = 30;

    // Stable "board area"
    const boardWidth = Math.max(1, availableWidth);
    const boardHeight = Math.max(40, availableHeight - topSpace - 5);

    // Background is fixed to the board area
    const contentWidth = boardWidth;
    const contentHeight = boardHeight;
    const contentSize = Math.max(contentWidth, contentHeight);

    const gapValue = Number(this.layoutOptions?.gapBetweenTiles ?? 0.012);
    const gapBasis = Math.min(boardWidth, boardHeight);
    const baseGap = Math.max(1, Math.floor(gapBasis * (Number.isFinite(gapValue) ? gapValue : 0.012)));

    const asNumber = (v, fallback = 0) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };

    // outerPadding: if 0<value<=0.5 => fraction of gapBasis, else pixels
    const resolveOuter = (value) => {
      const v = asNumber(value, 0);
      if (v <= 0) return 0;
      if (v <= 0.5) return Math.floor(gapBasis * v);
      return Math.floor(v);
    };

    // innerPadding: 0 => legacy (baseGap * tilePadding),
    //               0<value<=2 => multiplier of baseGap,
    //               else pixels
    const legacyPadX = asNumber(this.layoutOptions?.tilePaddingX, 1);
    const legacyPadY = asNumber(this.layoutOptions?.tilePaddingY, 1);

    const resolveInner = (value, legacyMultiplier) => {
      const v = asNumber(value, 0);
      if (v === 0) return Math.floor(baseGap * legacyMultiplier);
      if (v > 0 && v <= 2) return Math.floor(baseGap * v);
      return Math.floor(v);
    };

    const outerPaddingX = resolveOuter(this.layoutOptions?.outerPaddingX);
    const outerPaddingY = resolveOuter(this.layoutOptions?.outerPaddingY);

    const gapX = resolveInner(this.layoutOptions?.innerPaddingX, legacyPadX);
    const gapY = resolveInner(this.layoutOptions?.innerPaddingY, legacyPadY);

    const innerWidth = Math.max(1, contentWidth - outerPaddingX * 2);
    const innerHeight = Math.max(1, contentHeight - outerPaddingY * 2);

    const totalHorizontalGaps = gapX * Math.max(0, this.gridColumns - 1);
    const totalVerticalGaps = gapY * Math.max(0, this.gridRows - 1);

    const tileAreaWidth = Math.max(1, innerWidth - totalHorizontalGaps);
    const tileAreaHeight = Math.max(1, innerHeight - totalVerticalGaps);

    const scaleX = asNumber(this.cardOptions?.tileScaleFactorX, 1);
    const scaleY = asNumber(this.cardOptions?.tileScaleFactorY, 1);
    const resolvedScaleX = scaleX > 0 ? scaleX : 1;
    const resolvedScaleY = scaleY > 0 ? scaleY : 1;

    // Cards dynamically rescale (including pivot/portrait) to fit new paddings
    const tileSize = Math.max(
      1,
      Math.floor(
        Math.min(
          tileAreaWidth / (this.gridColumns * resolvedScaleX),
          tileAreaHeight / (this.gridRows * resolvedScaleY)
        )
      )
    );

    const scaledTileWidth = tileSize * resolvedScaleX;
    const scaledTileHeight = tileSize * resolvedScaleY;

    const boardCenterX = horizontal + availableWidth / 2;
    const boardCenterY = vertical + availableHeight / 2;

    return {
      tileSize,
      gapX,
      gapY,
      scaledTileWidth,
      scaledTileHeight,
      contentWidth,
      contentHeight,
      contentSize,
      outerPaddingX,
      outerPaddingY,
      boardCenterX,
      boardCenterY,
    };
  }

  _resolveGridScale() {
    const scaleFactor = Number(this.gridOptions?.scaleFactor ?? 1);
    if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return 1;
    return scaleFactor;
  }

  _resolveGridOffsets() {
    const offsetX = Number(this.gridOptions?.positionOffsetX ?? 0);
    const offsetY = Number(this.gridOptions?.positionOffsetY ?? 0);

    return {
      offsetX: Number.isFinite(offsetX) ? offsetX : 0,
      offsetY: Number.isFinite(offsetY) ? offsetY : 0,
    };
  }

  getBoardLayout() {
    const layout = this._lastLayout;
    if (!layout) return null;
    return { ...layout };
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

  _getGridPadding() {
    if (!this.app?.renderer) return { horizontal: 0, vertical: 0 };

    const configMobilePaddingX = Number(
      gameConfig?.gameplay?.grid?.mobilePaddingX ?? 0
    );
    const configMobilePaddingY = Number(
      gameConfig?.gameplay?.grid?.mobilePaddingY ?? 0
    );

    if (this._isPortraitViewport()) {
      return { horizontal: configMobilePaddingX, vertical: configMobilePaddingY };
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

  _isPortraitViewport() {
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
      if (mediaQuery?.matches === true) return true;
      if (mediaQuery?.matches === false) return false;
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
