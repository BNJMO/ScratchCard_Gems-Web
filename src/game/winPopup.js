import dollarIconUrl from "../../assets/sprites/dollarWinPopup.svg";

const DEFAULT_OPTIONS = {
  width: 310,
  height: 106,
  maxWidth: 310,
  minWidth: 310,
  paddingX: 24,
  paddingY: 16,
  borderRadius: 18,
  backgroundColor: "#0B1E29",
  accentColor: "#EAFF00",
  titleColor: "#FFFFFF",
  amountColor: "#EAFF00",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Arial",
  titleFontSize: 22,
  amountFontSize: 16,
  gap: 8,
  iconSize: 18,
  outlineWidth: 2,
  shadowBlur: 20,
  shadowSpread: 6,
  shadowOpacity: 0.78,
  animationDuration: 1000,
  easing: "cubic-bezier(0.445, 0.05, 0.55, 0.95)", // easeInOutSine
  scaleHidden: 0.9,
  scaleVisible: 1,
  zIndex: 10,
};

function formatCurrency(value) {
  const numeric = Number(value);
  const resolved = Number.isFinite(numeric) ? numeric : 0;
  return resolved.toFixed(2);
}

function hexToRgb(color) {
  if (typeof color !== "string") return null;
  const normalized = color.trim();
  const match = /^#?([a-fA-F0-9]{6})$/.exec(normalized);
  if (!match) return null;
  const int = parseInt(match[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return { r, g, b };
}

function colorWithOpacity(color, opacity = 1) {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

export class WinPopup {
  constructor({ parent, fontFamily, ...options } = {}) {
    const {
      width: _width,
      height: _height,
      maxWidth: _maxWidth,
      minWidth: _minWidth,
      ...rest
    } = options;
    this.options = {
      ...DEFAULT_OPTIONS,
      fontFamily: fontFamily || DEFAULT_OPTIONS.fontFamily,
      ...rest,
    };
    this.parent = parent ?? null;
    this.visible = false;
    this._hideTimer = null;
    this.amountValue = 0;

    this.container = this.#createContainer();
    if (this.parent && this.container) {
      this.parent.appendChild(this.container);
    }
  }

  #createContainer() {
    const {
      width,
      height,
      maxWidth,
      minWidth,
      paddingX,
      paddingY,
      borderRadius,
      backgroundColor,
      accentColor,
      titleColor,
      amountColor,
      fontFamily,
      titleFontSize,
      amountFontSize,
      gap,
      outlineWidth,
      shadowBlur,
      shadowSpread,
      shadowOpacity,
      animationDuration,
      easing,
      scaleHidden,
      scaleVisible,
      zIndex,
    } = this.options;

    const container = document.createElement("div");
    container.className = "win-popup";
    container.style.position = "absolute";
    container.style.top = "50%";
    container.style.left = "50%";
    container.style.transform = this.#hiddenTransform();
    container.style.opacity = "0";
    container.style.boxSizing = "border-box";
    container.style.padding = `${paddingY}px ${paddingX}px`;
    container.style.width = width ? `${width}px` : "auto";
    container.style.minWidth = `${minWidth}px`;
    container.style.maxWidth = `${maxWidth}px`;
    container.style.height = height ? `${height}px` : "auto";
    container.style.borderRadius = `${borderRadius}px`;
    container.style.background = backgroundColor;
    const glowColor = colorWithOpacity(accentColor, shadowOpacity);
    container.style.boxShadow = `0 0 ${shadowBlur}px ${shadowSpread}px ${glowColor}, 0 0 0 ${outlineWidth}px ${accentColor}`;
    container.style.color = titleColor;
    container.style.fontFamily = fontFamily;
    container.style.textAlign = "center";
    container.style.pointerEvents = "none";
    container.style.zIndex = `${zIndex}`;
    container.style.transition = `opacity ${animationDuration}ms ${easing}, transform ${animationDuration}ms ${easing}`;
    container.style.display = "none";

    const title = document.createElement("div");
    title.textContent = "YOU WON";
    title.style.fontSize = `${titleFontSize}px`;
    title.style.fontWeight = "800";
    title.style.lineHeight = "1.2";
    title.style.letterSpacing = "0.2px";
    title.style.color = titleColor;
    title.style.marginBottom = `${gap}px`;

    const amountRow = document.createElement("div");
    amountRow.style.display = "inline-flex";
    amountRow.style.alignItems = "center";
    amountRow.style.justifyContent = "center";
    amountRow.style.gap = "8px";
    amountRow.style.color = amountColor;
    amountRow.style.fontSize = `${amountFontSize}px`;
    amountRow.style.fontWeight = "700";

    const amountValue = document.createElement("span");
    amountValue.textContent = formatCurrency(0);
    amountValue.style.color = amountColor;

    const icon = document.createElement("img");
    icon.src = dollarIconUrl;
    icon.alt = "Dollar";
    icon.style.width = `${this.options.iconSize}px`;
    icon.style.height = `${this.options.iconSize}px`;
    icon.style.objectFit = "contain";

    amountRow.append(amountValue, icon);

    container.append(title, amountRow);

    this.amountNode = amountValue;
    this.container = container;
    this.scaleVisible = scaleVisible;
    this.scaleHidden = scaleHidden;

    return container;
  }

  #hiddenTransform() {
    return `translate(-50%, -50%) scale(${this.options.scaleHidden})`;
  }

  #visibleTransform() {
    return `translate(-50%, -50%) scale(${this.options.scaleVisible})`;
  }

  setAmount(value) {
    this.amountValue = value;
    if (this.amountNode) {
      this.amountNode.textContent = formatCurrency(value);
    }
  }

  setSize({ width, height } = {}) {
    const nextWidth = Number.isFinite(width) ? width : this.options.width;
    const nextHeight = Number.isFinite(height) ? height : this.options.height;
    this.options.width = nextWidth;
    this.options.height = nextHeight;
    this.options.minWidth = nextWidth;
    this.options.maxWidth = nextWidth;
    if (!this.container) return;
    this.container.style.width = `${nextWidth}px`;
    this.container.style.height = `${nextHeight}px`;
    this.container.style.minWidth = `${nextWidth}px`;
    this.container.style.maxWidth = `${nextWidth}px`;
  }

  show({ amount } = {}) {
    if (amount != null) {
      this.setAmount(amount);
    }
    if (!this.container) return;
    this.visible = true;
    clearTimeout(this._hideTimer);
    this.container.style.display = "flex";
    this.container.style.flexDirection = "column";
    this.container.style.alignItems = "center";
    this.container.style.justifyContent = "center";
    requestAnimationFrame(() => {
      this.container.style.opacity = "1";
      this.container.style.transform = this.#visibleTransform();
    });
  }

  hide() {
    if (!this.container) return;
    this.visible = false;
    clearTimeout(this._hideTimer);
    this.container.style.opacity = "0";
    this.container.style.transform = this.#hiddenTransform();
    this._hideTimer = setTimeout(() => {
      if (!this.visible && this.container) {
        this.container.style.display = "none";
      }
    }, this.options.animationDuration);
  }

  destroy() {
    clearTimeout(this._hideTimer);
    this._hideTimer = null;
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.amountNode = null;
  }
}
