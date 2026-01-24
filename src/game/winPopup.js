import bitCoinIconUrl from "../../assets/sprites/controlPanel/BitCoin.svg";
import winPopupSpriteUrl from "../../assets/sprites/winPopup.png";

const DEFAULT_OPTIONS = {
  spriteName: "winPopup",
  scale: 0.6,
  offsetX: 0,
  offsetY: 0,
  showDuration: 10000,
  animationDuration: 300,
  easing: "cubic-bezier(0.445, 0.05, 0.55, 0.95)",
  scaleHidden: 0.8,
  scaleVisible: 1.0,
  zIndex: 1000,
  showText: true,
  textColor: "#FFFFFF",
  amountColor: "#EAFF00",
  baseFontSize: 2,
  baseAmountFontSize: 4,
  textOffsetX: 0,
  textOffsetY: 0,
  minScale: 0.15,
  minScaleMobile: 0.2,
  minScaleSmallMobile: 0.25,
  mobileBreakpoint: 768,
  tabletBreakpoint: 600,
  smallMobileBreakpoint: 480,
  mobileMaxWidthPercent: 0.6,
  tabletMaxWidthPercent: 0.7,
  smallMobileMaxWidthPercent: 0.8,

  // Responsive size
  portraitWidthVW: 78, 
  maxWidthPx: 520,
  minWidthPx: 260,

  // Inner padding inside the box
  paddingY: 12,
  paddingX: 12,

  // Typography
  titleLetterSpacing: 0.03,
  amountLetterSpacing: 0.01,

  removeTextShadow: true,
  removeIconShadow: true,

  // Spacing
  gapPx: 8,

  referenceWidthPx: 520,
};

export class WinPopup {
  constructor({ parent, ...options } = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.parent = parent || null;
    this.visible = false;
    this._hideTimer = null;
    this._autoHideTimer = null;
    this._resizeHandler = null;

    this.amountValue = 0;
    this.spriteUrl = winPopupSpriteUrl;

    this.container = this.createContainer();
    if (this.container) {
      document.body.appendChild(this.container);
    }

    this.setupResizeHandler();

    // Apply responsive styling
    this.forceUpdateToLatestDefaults();
  }

  // setupResizeHandler() {
  //   this._resizeHandler = () => {
  //     if (this.visible && this.container) {
  //       this.updatePosition();
  //       this.updateResponsiveText();
  //       // Update the popup scale when window resizes
  //       this.container.style.transform = this.visibleTransform();
  //     }
  //   };
  //   window.addEventListener('resize', this._resizeHandler);
  // }

  setupResizeHandler() {
    this._resizeHandler = () => {
      // ✅ keep wrapper width responsive on resize/orientation change
      if (this.wrapperNode) {
        this.wrapperNode.style.width = this.getPopupWidth() + "px";
      }
      if (this.visible && this.container) {
        // ✅ scale text based on wrapper width (NOT old font logic)
        this.applyResponsiveOverlay();
        this.container.style.transform = this.visibleTransform();
      }
    };
    window.addEventListener("resize", this._resizeHandler);
  }

  getScaledOffset(valuePx) {
  if (!this.wrapperNode) return valuePx;
  const w = this.wrapperNode.getBoundingClientRect().width;
  const scale = w / this.options.referenceWidthPx;
  return valuePx * scale;
}

  getResponsiveScale() {
    const {
      minScale,
      mobileBreakpoint,
      tabletBreakpoint,
      smallMobileBreakpoint,
      mobileMaxWidthPercent,
      tabletMaxWidthPercent,
      smallMobileMaxWidthPercent,
    } = this.options;

    // Check screen size categories - adjusted breakpoints
    const isMobile = window.innerWidth <= mobileBreakpoint; // ≤768px
    const isTablet =
      window.innerWidth <= tabletBreakpoint && window.innerWidth > smallMobileBreakpoint; // 481-600px
    const isSmallMobile = window.innerWidth <= smallMobileBreakpoint; // ≤480px

    // Scale popup based on parent container size (grid-related)
    if (this.parent) {
      const parentRect = this.parent.getBoundingClientRect();
      const containerSize = Math.min(parentRect.width, parentRect.height);
      let scale = Math.max(minScale, Math.min(1.2, containerSize / 500));

      // Apply device-specific scaling - 997px will now be treated as desktop
      if (isSmallMobile) {
        // Very small screens (≤480px) - controlled size
        const maxScale = (window.innerWidth * smallMobileMaxWidthPercent) / 400;
        scale = Math.min(scale, Math.max(minScale, maxScale));
      } else if (isTablet) {
        // Tablet screens (481-600px) - moderate size
        const maxScale = (window.innerWidth * tabletMaxWidthPercent) / 400;
        scale = Math.min(scale, Math.max(minScale, maxScale));
      } else if (isMobile) {
        // Mobile screens (601-768px) - reasonable size
        const maxScale = (window.innerWidth * mobileMaxWidthPercent) / 400;
        scale = Math.min(scale, Math.max(minScale, maxScale));
      }
      // 997px will fall through to desktop scaling (no restrictions)
      return scale;
    }

    // Fallback scaling when no parent
    if (isSmallMobile) {
      return Math.max(
        minScale,
        Math.min(0.6, (window.innerWidth * smallMobileMaxWidthPercent) / 400)
      );
    } else if (isTablet) {
      return Math.max(minScale, Math.min(0.7, (window.innerWidth * tabletMaxWidthPercent) / 400));
    } else if (isMobile) {
      return Math.max(minScale, Math.min(0.8, (window.innerWidth * mobileMaxWidthPercent) / 400));
    }

    return 1.0;
  }

  getPopupWidth() {
    const vw = window.innerWidth;
    const target = (vw * this.options.portraitWidthVW) / 100;

    return Math.max(this.options.minWidthPx, Math.min(this.options.maxWidthPx, target));
  }

  getResponsiveFontSizes() {
    // Get base font sizes and responsive scale
    const fontSize = this.options.baseFontSize;
    const amountFontSize = this.options.baseAmountFontSize;
    const responsiveScale = this.getResponsiveScale();

    // Apply device-specific font adjustments but don't scale down too much
    const isSmallMobile = window.innerWidth <= this.options.smallMobileBreakpoint;
    const isTablet =
      window.innerWidth <= this.options.tabletBreakpoint &&
      window.innerWidth > this.options.smallMobileBreakpoint;
    const isMobile = window.innerWidth <= this.options.mobileBreakpoint;

    let fontMultiplier = 1.0;

    // Base multiplier for device type - keep text readable
    if (isSmallMobile) {
      fontMultiplier = 1.1; // Slightly larger for readability
    } else if (isTablet) {
      fontMultiplier = 1.05;
    } else if (isMobile) {
      fontMultiplier = 1.0;
    }

    // Don't scale fonts down too much - maintain minimum readability
    const scaleMultiplier = Math.max(0.8, Math.min(1.2, responsiveScale));
    const finalMultiplier = fontMultiplier * scaleMultiplier;

    return {
      fontSize: Math.round(fontSize * finalMultiplier),
      amountFontSize: Math.round(amountFontSize * finalMultiplier),
      responsiveScale,
      totalScale: this.options.scale * responsiveScale,
    };
  }

  updateResponsiveText() {
    if (!this.titleTextNode || !this.amountTextNode) return;

    const { textOffsetX, textOffsetY } = this.options;

    if (this.textOverlayNode) {
      this.textOverlayNode.style.top = "0";
      this.textOverlayNode.style.left = "0";
      this.textOverlayNode.style.right = "0";
      this.textOverlayNode.style.bottom = "0";
      this.textOverlayNode.style.transform =
        "translate(" + textOffsetX + "px," + textOffsetY + "px)";
    }
  }

  updatePosition() {
    if (!this.container || !this.parent) return;

    // Get the parent element's position and size
    const parentRect = this.parent.getBoundingClientRect();
    const { offsetX, offsetY } = this.options;
    const centerX = parentRect.left + parentRect.width / 2 + offsetX;
    const centerY = parentRect.top + parentRect.height / 2 + offsetY;

    // Update container position to stay centered on the parent
    this.container.style.left = centerX + "px";
    this.container.style.top = centerY + "px";
  }

  createContainer() {
    const { animationDuration, easing, zIndex, showText } = this.options;

    const container = document.createElement("div");
    container.className = "sprite-win-popup";
    container.style.cssText = `
      position:fixed;
      top:50%;
      left:50%;
      opacity:0;
      pointer-events:none;
      display:none;
      user-select:none;
      z-index:${zIndex};
      transition:opacity ${animationDuration}ms ${easing},transform ${animationDuration}ms ${easing};
      transform:${this.hiddenTransform()};
    `;

    // Wrapper controls the SIZE (responsive)
    const wrapper = document.createElement("div");
    wrapper.style.cssText = `
      position:relative;
      width:${this.getPopupWidth()}px;
      margin:0 auto;
    `;
    this.wrapperNode = wrapper;

    // Background sprite (glow box)
    const bg = document.createElement("img");
    bg.src = this.spriteUrl; // winPopup.png
    bg.alt = "Win Popup";
    bg.style.cssText = `
      display:block;
      width:100%;
      height:auto;
      object-fit:contain;
      user-select:none;
      pointer-events:none;
    `;
    wrapper.appendChild(bg);
    this.imageNode = bg;

    if (showText) {
      const textOverlay = document.createElement("div");
      textOverlay.style.cssText = `
        position:absolute;
        inset:0;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        text-align:center;
        pointer-events:none;
        user-select:none;
        padding:${this.options.paddingY}px ${this.options.paddingX}px;
        box-sizing:border-box;
      `;

      const titleText = document.createElement("div");
      titleText.textContent = "YOU WON";
      titleText.style.cssText = `
        color:${this.options.textColor};
        font-weight:800;
        font-family:Arial,sans-serif;
        letter-spacing:${this.options.titleLetterSpacing}em;
        text-transform:uppercase;
        line-height:1;
        margin:0;
        ${this.options.removeTextShadow ? "text-shadow:none;" : "text-shadow:0 0 8px rgba(255,255,255,0.5);"}
      `;

      const amountRow = document.createElement("div");
      amountRow.style.cssText = `
        display:flex;
        align-items:center;
        justify-content:center;
        gap:10px;
        margin-top:${this.options.gapPx}px;
      `;

      const amountText = document.createElement("span");
      amountText.textContent = this.formatAmount(this.amountValue);
      amountText.style.cssText = `
        color:${this.options.amountColor};
        font-weight:800;
        font-family:Arial,sans-serif;
        letter-spacing:${this.options.amountLetterSpacing}em;
        line-height:1;
        ${this.options.removeTextShadow ? "text-shadow:none;" : "text-shadow:0 0 8px rgba(234,255,0,0.7);"}
      `;

      const amountIcon = document.createElement("img");
      amountIcon.src = bitCoinIconUrl;
      amountIcon.alt = "Coin";
      amountIcon.style.cssText = `
        display:block;
        object-fit:contain;
        flex-shrink:0;
        ${this.options.removeIconShadow ? "filter:none;" : "filter:drop-shadow(0 0 6px rgba(234,255,0,0.6));"}
      `;

      amountRow.appendChild(amountText);
      amountRow.appendChild(amountIcon);

      textOverlay.appendChild(titleText);
      textOverlay.appendChild(amountRow);
      wrapper.appendChild(textOverlay);

      this.titleTextNode = titleText;
      this.amountTextNode = amountText;
      this.amountIconNode = amountIcon;
      this.textOverlayNode = textOverlay;
    }

    container.appendChild(wrapper);
    return container;
  }

  applyResponsiveOverlay() {
  if (!this.wrapperNode || !this.titleTextNode || !this.amountTextNode || !this.textOverlayNode) return;

  const w = this.wrapperNode.getBoundingClientRect().width;
const { textOffsetX, textOffsetY } = this.options;
const ox = this.getScaledOffset(textOffsetX);
const oy = this.getScaledOffset(textOffsetY);
const titlePx  = Math.round(Math.max(20, Math.min(52, w * 0.11)));  
const amountPx = Math.round(Math.max(16, Math.min(34, w * 0.075))); 
const gapPx    = Math.round(Math.max(8, Math.min(16, w * 0.03)));

  this.textOverlayNode.style.padding = `${this.options.paddingY}px ${this.options.paddingX}px`;
  // this.textOverlayNode.style.paddingBottom = "10px";
  this.textOverlayNode.style.boxSizing = "border-box";

  this.titleTextNode.style.fontSize = titlePx + "px";
  this.titleTextNode.style.fontWeight = "600";
  this.titleTextNode.style.letterSpacing = `${this.options.titleLetterSpacing}em`;
  this.titleTextNode.style.lineHeight = "1";
  this.titleTextNode.style.textShadow = "none";
  this.titleTextNode.style.margin = "0";
  this.titleTextNode.style.marginBottom = Math.max(2, gapPx * 0.4) + "px";
  this.titleTextNode.style.whiteSpace = "nowrap"; 
  this.textOverlayNode.style.transform = `translate(${ox}px, ${oy}px)`;
  this.textOverlayNode.style.transformOrigin = "center";
  const overlayWidth = this.textOverlayNode.getBoundingClientRect().width;
  const titleWidth = this.titleTextNode.getBoundingClientRect().width;

  const desired = overlayWidth * 0.82;

  let sx = 1;
  if (titleWidth > 0) {
    sx = desired / titleWidth;
    // sx = Math.max(1.0, Math.min(1.25, sx));
    sx = Math.max(1.0, Math.min(1.15, sx));
  }
  // this.titleTextNode.style.transform = `scaleX(${sx})`;
  this.titleTextNode.style.transform = "none";
  this.titleTextNode.style.transformOrigin = "center";

  this.amountTextNode.style.fontSize = amountPx + "px";
  this.amountTextNode.style.fontWeight = "400";
  this.amountTextNode.style.letterSpacing = `${this.options.amountLetterSpacing}em`;
  this.amountTextNode.style.lineHeight = "1";
  this.amountTextNode.style.textShadow = "none";

  if (this.amountIconNode) {
    this.amountIconNode.style.width  = Math.round(amountPx * 0.95) + "px";
    this.amountIconNode.style.height = Math.round(amountPx * 0.95) + "px";
    this.amountIconNode.style.filter = "none";
  }

  const row = this.amountTextNode.parentElement;
  if (row) {
    row.style.marginTop = "0px";
    row.style.marginBottom = "5px";
    row.style.gap = Math.round(Math.max(6, Math.min(12, w * 0.02))) + "px";
  }
}


  hiddenTransform() {
    const { scaleHidden } = this.options;
    const responsiveScale = this.getResponsiveScale();
    const finalScale = this.options.scale * responsiveScale * scaleHidden;

    // return "translate(-50%,-50%) scale(" + finalScale + ")";
    return `translate(-50%,-50%) scale(${this.options.scaleHidden})`;
  }

  visibleTransform() {
    const { scaleVisible } = this.options;
    const responsiveScale = this.getResponsiveScale();
    const finalScale = this.options.scale * responsiveScale * scaleVisible;

    // return "translate(-50%,-50%) scale(" + finalScale + ")";
    return `translate(-50%,-50%) scale(${this.options.scaleVisible})`;
  }

  formatAmount(value) {
    const num = Number(value);
    return (Number.isFinite(num) ? num : 0).toFixed(2);
  }

  formatCurrency(value) {
    const num = Number(value);
    return "$" + (Number.isFinite(num) ? num : 0).toFixed(2);
  }

  setAmount(value) {
    this.amountValue = value;
    if (this.amountTextNode) this.amountTextNode.textContent = this.formatAmount(value);
  }

  setSize() {}

  updateOptions(newOptions) {
    this.options = { ...this.options, ...newOptions };

    // If the popup is visible, update the transform immediately
    if (this.visible && this.container) {
      this.container.style.transform = this.visibleTransform();
      // this.updateResponsiveText();
      this.applyResponsiveOverlay();
    }
  }

  forceUpdateToLatestDefaults() {
    // Update options with latest DEFAULT_OPTIONS
    this.options = { ...DEFAULT_OPTIONS, ...this.options };

    // Update text elements with responsive styling
    if (this.titleTextNode && this.amountTextNode && this.textOverlayNode) {
      // ✅ use new sizing system (do not override with old multipliers)
      this.applyResponsiveOverlay();
    }

    // Update transform if visible
    if (this.visible && this.container) {
      this.container.style.transform = this.visibleTransform();
    }
  }

  show({ amount, duration } = {}) {
    if (amount != null) this.setAmount(amount);
    if (!this.container) return;

    this.visible = true;
    clearTimeout(this._hideTimer);
    clearTimeout(this._autoHideTimer);

    this.container.style.display = "block";

    // Update position and responsive text when showing
    this.updatePosition();
    if (this.wrapperNode) this.wrapperNode.style.width = this.getPopupWidth() + "px";
    this.applyResponsiveOverlay();
    // this.updateResponsiveText(); // ❌ don't call (it overrides sizes)

    // Add a slight delay to ensure proper rendering
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.container) {
          this.container.style.opacity = "1";
          this.container.style.transform = this.visibleTransform();
        }
      });
    });

    const dur = duration !== undefined ? duration : this.options.showDuration;
    if (dur > 0) this._autoHideTimer = setTimeout(() => this.hide(), dur);
  }

  hide() {
    if (!this.container) return;
    this.visible = false;
    clearTimeout(this._hideTimer);
    clearTimeout(this._autoHideTimer);
    this.container.style.opacity = "0";
    this.container.style.transform = this.hiddenTransform();
    this._hideTimer = setTimeout(() => {
      if (!this.visible && this.container) this.container.style.display = "none";
    }, this.options.animationDuration);
  }

  destroy() {
    // Remove resize event listener
    if (this._resizeHandler) {
      window.removeEventListener("resize", this._resizeHandler);
      this._resizeHandler = null;
    }

    clearTimeout(this._hideTimer);
    clearTimeout(this._autoHideTimer);

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    this.container = null;
    this.wrapperNode = null;
    this.imageNode = null;
    this.titleTextNode = null;
    this.amountTextNode = null;
    this.amountIconNode = null;
    this.textOverlayNode = null;
  }
}
