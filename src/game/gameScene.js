import { Application, Container, Graphics, Sprite, Text } from "pixi.js";
import { Card } from "./card.js";

const DEFAULT_FONT_FAMILY = "Inter, system-ui, -apple-system, Segoe UI, Arial";

export class GameScene {
  constructor({
    root,
    backgroundColor,
    initialSize,
    palette,
    backgroundTexture,
    fontFamily = DEFAULT_FONT_FAMILY,
    gridSize,
    strokeWidth,
    cardOptions,
    layoutOptions,
    animationOptions,
    onResize,
  }) {
    this.root = root;
    this.backgroundColor = backgroundColor;
    this.initialSize = Math.max(1, initialSize || 400);
    this.palette = palette;
    this.fontFamily = fontFamily;
    this.backgroundTexture = backgroundTexture ?? null;
    this.gridSize = gridSize;
    this.strokeWidth = strokeWidth;
    this.cardOptions = {
      icon: cardOptions?.icon ?? {},
      winPopupWidth: cardOptions?.winPopupWidth,
      winPopupHeight: cardOptions?.winPopupHeight,
      matchEffects: cardOptions?.matchEffects ?? {},
      frameTexture: cardOptions?.frameTexture ?? null,
      stateTextures: cardOptions?.stateTextures ?? {},
    };
    this.layoutOptions = {
      gapBetweenTiles: layoutOptions?.gapBetweenTiles ?? 0.012,
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
    this.onResize = onResize;

    this.cards = [];
    this.disableAnimations = this.animationOptions.disableAnimations;

    this.app = null;
    this.board = null;
    this.boardShadows = null;
    this.boardContent = null;
    this.ui = null;
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
    this.ui = new Container();
    this.app.stage.addChild(this.board, this.ui);

    this.winPopup = this.#createWinPopup();
    this.ui.addChild(this.winPopup.container);

    this.root.innerHTML = "";
    this.root.appendChild(this.app.canvas);

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
  }

  buildGrid({ interactionFactory }) {
    this.clearGrid();
    const layout = this.#layoutSizes();

    for (let r = 0; r < this.gridSize; r += 1) {
      for (let c = 0; c < this.gridSize; c += 1) {
        const card = new Card({
          app: this.app,
          palette: this.palette,
          animationOptions: this.animationOptions,
          iconOptions: this.cardOptions.icon,
          matchEffects: this.cardOptions.matchEffects,
          frameTexture: this.cardOptions.frameTexture,
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

    const { tileSize, gap, contentSize, boardCenterX, boardCenterY } = layout;
    const startX = -contentSize / 2;
    const startY = -contentSize / 2;

    for (const card of this.cards) {
      const scale = tileSize / card._tileSize;
      const x = startX + card.col * (tileSize + gap);
      const y = startY + card.row * (tileSize + gap);
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
    const size = Math.floor(Math.min(width, height));
    this.app.renderer.resize(size, size);
    this.#syncCanvasCssSize(size);
    this.#layoutBackgroundSprite();
    if (this.cards.length > 0) {
      this.layoutCards();
    }

    this.#positionWinPopup();
    this.onResize?.(size);
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
    if (!this.winPopup) return;
    this.winPopup.container.visible = false;
    this.winPopup.container.scale?.set?.(0, 0);
    this.winPopup.container.alpha = 0;
  }

  showWinPopup({ multiplier, amount }) {
    if (!this.winPopup) return;
    const { container, multiplierText, amountText, layoutAmountRow } = this.winPopup;
    multiplierText.text = multiplier ?? "1.00×";
    amountText.text = amount ?? "0.00";
    layoutAmountRow();
    container.visible = true;
    container.alpha = 1;
    container.scale?.set?.(1, 1);
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

  #syncCanvasCssSize(size) {
    const canvas = this.app?.canvas;
    if (!canvas) return;

    const cssSize = `${size}px`;
    if (canvas.style.width !== cssSize) {
      canvas.style.width = cssSize;
    }
    if (canvas.style.height !== cssSize) {
      canvas.style.height = cssSize;
    }
    if (canvas.style.maxWidth !== "100%") {
      canvas.style.maxWidth = "100%";
    }
    if (canvas.style.maxHeight !== "100%") {
      canvas.style.maxHeight = "100%";
    }
    if (canvas.style.aspectRatio !== "1 / 1") {
      canvas.style.aspectRatio = "1 / 1";
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
    const gap = Math.max(1, Math.floor(boardSpace * gapValue));
    const totalGaps = gap * (this.gridSize - 1);
    const tileArea = Math.max(1, boardSpace - totalGaps);
    const tileSize = Math.max(1, Math.floor(tileArea / this.gridSize));
    const contentSize = tileSize * this.gridSize + totalGaps;
    const boardCenterX = horizontal + availableWidth / 2;
    const boardCenterY = vertical + availableHeight / 2;

    return { tileSize, gap, contentSize, boardCenterX, boardCenterY };
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

  #createWinPopup() {
    const width = this.cardOptions.winPopupWidth ?? 240;
    const height = this.cardOptions.winPopupHeight ?? 170;

    const container = new Container();
    container.visible = false;
    container.scale.set(0);
    container.eventMode = "none";
    container.zIndex = 1000;

    const border = new Graphics();
    border
      .roundRect(-width / 2 - 10, -height / 2 - 10, width + 20, height + 20, 32)
      .fill(this.palette.winPopupBorder);

    const inner = new Graphics();
    inner
      .roundRect(-width / 2, -height / 2, width, height, 28)
      .fill(this.palette.winPopupBackground);

    const multiplierText = new Text({
      text: "1.00×",
      style: {
        fill: this.palette.winPopupMultiplierText,
        fontFamily: this.fontFamily,
        fontSize: 36,
        fontWeight: "700",
        align: "center",
      },
    });
    multiplierText.anchor.set(0.5);
    multiplierText.position.set(0, -height / 2 + height * 0.28);

    const amountRow = new Container();
    const amountText = new Text({
      text: "0.00",
      style: {
        fill: 0xffffff,
        fontFamily: this.fontFamily,
        fontSize: 24,
        fontWeight: "600",
        align: "center",
      },
    });
    amountText.anchor.set(0.5);
    amountRow.addChild(amountText);

    const layoutAmountRow = () => {
      amountRow.position.set(0, height / 2 - height * 0.25);
    };

    container.addChild(border, inner, multiplierText, amountRow);

    return { container, multiplierText, amountText, layoutAmountRow };
  }
}

