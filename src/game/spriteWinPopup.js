import bitCoinIconUrl from "../../assets/sprites/controlPanel/BitCoin.svg";

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
  minScale: 0.15,
  minScaleMobile: 0.2,
  minScaleSmallMobile: 0.25,
  mobileBreakpoint: 768,
  tabletBreakpoint: 600,
  smallMobileBreakpoint: 480,
  mobileMaxWidthPercent: 0.6,
  tabletMaxWidthPercent: 0.7,
  smallMobileMaxWidthPercent: 0.8,
};

export class SpriteWinPopup {
  constructor({ parent, ...options } = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.parent = parent || null;
    this.visible = false;
    this._hideTimer = null;
    this._autoHideTimer = null;
    this._resizeHandler = null;
    this.amountValue = 0;
    this.spriteUrl = "/ScratchCard_Gems-Web/assets/sprites/winPopup.png";
    this.container = this.createContainer();
    if (this.container) {
      document.body.appendChild(this.container);
    }
    this.setupResizeHandler();
    
    // Apply responsive styling
    this.forceUpdateToLatestDefaults();
  }

  setupResizeHandler() {
    this._resizeHandler = () => {
      if (this.visible && this.container) {
        this.updatePosition();
        this.updateResponsiveText();
        // Update the popup scale when window resizes
        this.container.style.transform = this.visibleTransform();
      }
    };
    window.addEventListener('resize', this._resizeHandler);
  }

  getResponsiveScale() {
    const { 
      minScale, 
      minScaleMobile, 
      minScaleSmallMobile, 
      mobileBreakpoint,
      tabletBreakpoint, 
      smallMobileBreakpoint,
      mobileMaxWidthPercent,
      tabletMaxWidthPercent,
      smallMobileMaxWidthPercent 
    } = this.options;
    
    // Check screen size categories - adjusted breakpoints
    const isMobile = window.innerWidth <= mobileBreakpoint; // ≤768px
    const isTablet = window.innerWidth <= tabletBreakpoint && window.innerWidth > smallMobileBreakpoint; // 481-600px
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
        scale = Math.min(scale, Math.max(minScaleSmallMobile, maxScale));
        scale = Math.min(0.7, scale);
      } else if (isTablet) {
        // Tablet screens (481-600px) - moderate size
        const maxScale = (window.innerWidth * tabletMaxWidthPercent) / 400;
        scale = Math.min(scale, Math.max(minScaleMobile, maxScale));
        scale = Math.min(0.8, scale);
      } else if (isMobile) {
        // Mobile screens (601-768px) - reasonable size
        const maxScale = (window.innerWidth * mobileMaxWidthPercent) / 400;
        scale = Math.min(scale, Math.max(minScaleMobile, maxScale));
        scale = Math.min(0.9, scale);
      }
      // 997px will fall through to desktop scaling (no restrictions)
      
      return scale;
    }
    
    // Fallback scaling when no parent
    if (isSmallMobile) {
      return Math.max(minScaleSmallMobile, Math.min(0.6, (window.innerWidth * smallMobileMaxWidthPercent) / 400));
    } else if (isTablet) {
      return Math.max(minScaleMobile, Math.min(0.7, (window.innerWidth * tabletMaxWidthPercent) / 400));
    } else if (isMobile) {
      return Math.max(minScaleMobile, Math.min(0.8, (window.innerWidth * mobileMaxWidthPercent) / 400));
    }
    
    return 1.0;
  }

  getResponsiveFontSizes() {
    // Get base font sizes and responsive scale
    const fontSize = this.options.baseFontSize;
    const amountFontSize = this.options.baseAmountFontSize;
    const responsiveScale = this.getResponsiveScale();
    
    // Apply device-specific font adjustments but don't scale down too much
    const isSmallMobile = window.innerWidth <= this.options.smallMobileBreakpoint;
    const isTablet = window.innerWidth <= this.options.tabletBreakpoint && window.innerWidth > this.options.smallMobileBreakpoint;
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
      totalScale: this.options.scale * responsiveScale 
    };
  }

  updateResponsiveText() {
    if (!this.titleTextNode || !this.amountTextNode) return;
    
    const { fontSize, amountFontSize } = this.getResponsiveFontSizes();
    
    // Update font sizes with even smaller multipliers
    this.titleTextNode.style.fontSize = Math.round(fontSize * 1.5) + "px";  // Reduced from 2.0 to 1.5
    this.amountTextNode.style.fontSize = Math.round(amountFontSize * 1.3) + "px";  // Reduced from 1.8 to 1.3
    
    // Keep text overlay positioning consistent
    if (this.textOverlayNode) {
      this.textOverlayNode.style.top = "0";
      this.textOverlayNode.style.left = "0";
      this.textOverlayNode.style.right = "0";
      this.textOverlayNode.style.bottom = "0";
    }
  }

  updatePosition() {
    if (!this.container || !this.parent) return;
    
    // Get the parent element's position and size
    const parentRect = this.parent.getBoundingClientRect();
    const centerX = parentRect.left + parentRect.width / 2;
    const centerY = parentRect.top + parentRect.height / 2;
    
    // Update container position to stay centered on the parent
    this.container.style.left = centerX + "px";
    this.container.style.top = centerY + "px";
  }

  createContainer() {
    const { animationDuration, easing, zIndex, showText } = this.options;
    const { fontSize, amountFontSize } = this.getResponsiveFontSizes();
    
    const container = document.createElement("div");
    container.className = "sprite-win-popup";
    container.style.cssText = "position:fixed;top:50%;left:50%;opacity:0;pointer-events:none;display:none;user-select:none;z-index:" + zIndex + ";transition:opacity " + animationDuration + "ms " + easing + ",transform " + animationDuration + "ms " + easing + ";transform:" + this.hiddenTransform();

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "position:relative;display:inline-block";

    const image = document.createElement("img");
    image.src = this.spriteUrl;
    image.alt = "You Won!";
    image.style.cssText = "display:block;max-width:none;max-height:none;object-fit:contain;user-select:none;pointer-events:none";
    image.onload = () => {};
    image.onerror = () => {
      image.style.display = "none";
      const fallback = document.createElement("div");
      fallback.style.cssText = "background:linear-gradient(135deg,rgba(11,30,41,0.95) 0%,rgba(15,40,55,0.95) 100%);border-radius:20px;border:4px solid #EAFF00;box-shadow:0 0 30px rgba(234,255,0,0.8),0 0 60px rgba(234,255,0,0.4),inset 0 0 20px rgba(234,255,0,0.1);padding:40px 60px;min-width:300px;position:relative";
      wrapper.appendChild(fallback);
    };

    wrapper.appendChild(image);
    this.imageNode = image;

    if (showText) {
      const textOverlay = document.createElement("div");
      textOverlay.style.cssText = "position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;user-select:none;z-index:1;text-align:center";

      const titleText = document.createElement("div");
      titleText.textContent = "YOU WON";
      titleText.style.cssText = "color:#FFFFFF;font-size:" + Math.round(fontSize * 1.5) + "px;font-weight:700;font-family:Arial,sans-serif;text-shadow:0 0 8px rgba(255,255,255,0.6);letter-spacing:" + Math.round(fontSize * 0.15) + "px;margin-bottom:" + Math.round(fontSize * 0.2) + "px;text-transform:uppercase;line-height:0.9;text-align:center";

      const amountContainer = document.createElement("div");
      amountContainer.style.cssText = "display:flex;align-items:center;justify-content:center;gap:" + Math.round(amountFontSize * 0.25) + "px;";

      const amountText = document.createElement("span");
      amountText.textContent = this.formatAmount(this.amountValue);
      amountText.style.cssText = "color:#EAFF00;font-size:" + Math.round(amountFontSize * 1.3) + "px;font-weight:700;font-family:Arial,sans-serif;text-shadow:0 0 8px rgba(234,255,0,0.8);line-height:1;letter-spacing:" + Math.round(amountFontSize * 0.03) + "px";

      const amountIcon = document.createElement("img");
      amountIcon.src = bitCoinIconUrl;
      amountIcon.alt = "Bitcoin";
      amountIcon.style.cssText = "width:" + Math.round(amountFontSize * 1.1) + "px;height:" + Math.round(amountFontSize * 1.1) + "px;display:block;object-fit:contain;flex-shrink:0;filter:drop-shadow(0 0 6px rgba(234,255,0,0.6))";

      amountContainer.appendChild(amountText);
      amountContainer.appendChild(amountIcon);
      textOverlay.appendChild(titleText);
      textOverlay.appendChild(amountContainer);
      wrapper.appendChild(textOverlay);

      this.titleTextNode = titleText;
      this.amountTextNode = amountText;
      this.amountIconNode = amountIcon;
      this.textOverlayNode = textOverlay;
    }

    container.appendChild(wrapper);
    return container;
  }

  hiddenTransform() {
    const { offsetX, offsetY, scaleHidden } = this.options;
    const responsiveScale = this.getResponsiveScale();
    const finalScale = this.options.scale * responsiveScale * scaleHidden;
    return "translate(-50%,-50%) translate(" + offsetX + "px," + offsetY + "px) scale(" + finalScale + ")";
  }

  visibleTransform() {
    const { offsetX, offsetY, scaleVisible } = this.options;
    const responsiveScale = this.getResponsiveScale();
    const finalScale = this.options.scale * responsiveScale * scaleVisible;
    return "translate(-50%,-50%) translate(" + offsetX + "px," + offsetY + "px) scale(" + finalScale + ")";
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
      this.updateResponsiveText();
    }
  }

  forceUpdateToLatestDefaults() {
    // Update options with latest DEFAULT_OPTIONS
    this.options = { ...DEFAULT_OPTIONS, ...this.options };
    
    // Update text elements with responsive styling
    if (this.titleTextNode && this.amountTextNode && this.textOverlayNode) {
      const { fontSize, amountFontSize } = this.getResponsiveFontSizes();
      
      // Update title text styling with smaller multiplier
      this.titleTextNode.style.fontSize = Math.round(fontSize * 1.5) + "px";
      this.titleTextNode.style.fontWeight = "700";
      this.titleTextNode.style.letterSpacing = Math.round(fontSize * 0.15) + "px";
      this.titleTextNode.style.marginBottom = Math.round(fontSize * 0.2) + "px";
      this.titleTextNode.style.lineHeight = "0.9";
      
      // Update amount text styling with smaller multiplier
      this.amountTextNode.style.fontSize = Math.round(amountFontSize * 1.3) + "px";
      this.amountTextNode.style.fontWeight = "700";
      this.amountTextNode.style.letterSpacing = Math.round(amountFontSize * 0.03) + "px";
      
      // Update icon sizing
      if (this.amountIconNode) {
        const iconSize = Math.round(amountFontSize * 1.1);
        this.amountIconNode.style.width = iconSize + "px";
        this.amountIconNode.style.height = iconSize + "px";
      }
      
      // Update container gap
      const amountContainer = this.amountTextNode.parentElement;
      if (amountContainer) {
        amountContainer.style.gap = Math.round(amountFontSize * 0.25) + "px";
      }
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
    this.updateResponsiveText();
    
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
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    
    clearTimeout(this._hideTimer);
    clearTimeout(this._autoHideTimer);
    if (this.container && this.container.parentNode) this.container.parentNode.removeChild(this.container);
    this.container = null;
    this.imageNode = null;
    this.titleTextNode = null;
    this.amountTextNode = null;
    this.amountIconNode = null;
  }
}
