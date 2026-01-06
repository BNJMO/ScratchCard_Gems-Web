const DEFAULT_OPTIONS = {
  spriteName: "winPopup",
  scale: 0.6,
  offsetX: 0,
  offsetY: 0,
  showDuration: 2000,
  animationDuration: 300,
  easing: "cubic-bezier(0.445, 0.05, 0.55, 0.95)",
  scaleHidden: 0.8,
  scaleVisible: 1.0,
  zIndex: 1000,
  showText: true,
  textColor: "#FFFFFF",
  amountColor: "#EAFF00",
  baseFontSize: 32,
  baseAmountFontSize: 26,
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
    // Scale popup based on parent container size (grid-related)
    if (this.parent) {
      const parentRect = this.parent.getBoundingClientRect();
      const containerSize = Math.min(parentRect.width, parentRect.height);
      // Simple grid-based scaling - popup size relates to grid container
      return Math.max(0.5, Math.min(1.2, containerSize / 400));
    }
    
    return 1.0;
  }

  getResponsiveFontSizes() {
    // Keep font sizes consistent - don't scale with popup
    const fontSize = this.options.baseFontSize;
    const amountFontSize = this.options.baseAmountFontSize;
    const responsiveScale = this.getResponsiveScale();
    const totalScale = this.options.scale * responsiveScale;
    
    return { fontSize, amountFontSize, responsiveScale, totalScale };
  }

  updateResponsiveText() {
    if (!this.titleTextNode || !this.amountTextNode) return;
    
    const { fontSize, amountFontSize, responsiveScale, totalScale } = this.getResponsiveFontSizes();
    
    // Keep font sizes consistent
    this.titleTextNode.style.fontSize = fontSize + "px";
    this.amountTextNode.style.fontSize = amountFontSize + "px";
    
    // Keep text overlay positioning consistent
    if (this.textOverlayNode) {
      this.textOverlayNode.style.top = "50%";
      this.textOverlayNode.style.left = "10%";
      this.textOverlayNode.style.width = "80%";
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
      fallback.textContent = "YOU WON!";
      fallback.style.cssText = "color:#EAFF00;font-size:" + Math.max(32, fontSize * 1.5) + "px;font-weight:bold;text-align:center;padding:30px 50px;background:linear-gradient(135deg,rgba(11,30,41,0.95) 0%,rgba(15,40,55,0.95) 100%);border-radius:20px;border:4px solid #EAFF00;box-shadow:0 0 30px rgba(227,229,82,0.8),inset 0 0 20px rgba(234,255,0,0.1);font-family:Arial,sans-serif;letter-spacing:3px;text-shadow:0 0 20px rgba(234,255,0,1),0 0 40px rgba(234,255,0,0.8);filter:drop-shadow(0 0 15px rgba(234,255,0,0.9))";
      wrapper.appendChild(fallback);
    };

    wrapper.appendChild(image);
    this.imageNode = image;

    if (showText) {
      const textOverlay = document.createElement("div");
      textOverlay.style.cssText = "position:absolute;top:50%;left:10%;width:80%;height:40%;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;user-select:none;z-index:1;box-sizing:border-box;transform:translateY(-50%)";

      const titleText = document.createElement("div");
      titleText.textContent = "YOU WON";
      titleText.style.cssText = "color:#FFFFFF;font-size:" + fontSize + "px;font-weight:900;font-family:Arial,sans-serif;text-shadow:0 0 15px rgba(234,255,0,1),0 0 30px rgba(234,255,0,0.8),0 0 45px rgba(234,255,0,0.6),3px 3px 6px rgba(0,0,0,1);letter-spacing:3px;margin-bottom:12px;text-align:center;line-height:1;width:100%;text-transform:uppercase;filter:drop-shadow(0 0 10px rgba(234,255,0,0.9));-webkit-text-stroke:1px rgba(234,255,0,0.3)";

      const amountContainer = document.createElement("div");
      amountContainer.style.cssText = "background:linear-gradient(135deg,rgba(234,255,0,0.25) 0%,rgba(234,255,0,0.1) 100%);border:3px solid rgba(234,255,0,0.8);border-radius:12px;padding:8px 16px;box-shadow:0 0 20px rgba(234,255,0,0.5),inset 0 0 10px rgba(234,255,0,0.2);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)";

      const amountText = document.createElement("div");
      amountText.textContent = this.formatCurrency(this.amountValue);
      amountText.style.cssText = "color:#EAFF00;font-size:" + amountFontSize + "px;font-weight:bold;font-family:Arial,sans-serif;text-shadow:0 0 12px rgba(234,255,0,1),0 0 24px rgba(234,255,0,0.8),0 0 36px rgba(234,255,0,0.6),2px 2px 4px rgba(0,0,0,1);text-align:center;line-height:1;letter-spacing:2px;filter:drop-shadow(0 0 8px rgba(234,255,0,0.9));-webkit-text-stroke:0.5px rgba(234,255,0,0.3)";

      amountContainer.appendChild(amountText);
      textOverlay.appendChild(titleText);
      textOverlay.appendChild(amountContainer);
      wrapper.appendChild(textOverlay);

      this.titleTextNode = titleText;
      this.amountTextNode = amountText;
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

  formatCurrency(value) {
    const num = Number(value);
    return "$" + (Number.isFinite(num) ? num : 0).toFixed(2);
  }

  setAmount(value) {
    this.amountValue = value;
    if (this.amountTextNode) this.amountTextNode.textContent = this.formatCurrency(value);
  }

  setSize() {}

  updateOptions(newOptions) {
    this.options = { ...this.options, ...newOptions };
    if (this.visible && this.container) {
      this.container.style.transform = this.visibleTransform();
      this.updateResponsiveText();
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
  }
}
