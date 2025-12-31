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
  fontSize: 22,
  amountFontSize: 18,
};

export class SpriteWinPopup {
  constructor({ parent, ...options } = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.parent = parent || null;
    this.visible = false;
    this._hideTimer = null;
    this._autoHideTimer = null;
    this.amountValue = 0;
    this.spriteUrl = "/ScratchCard_Gems-Web/assets/sprites/winPopup.png";
    this.container = this.createContainer();
    if (this.container) {
      document.body.appendChild(this.container);
    }
  }

  createContainer() {
    const { animationDuration, easing, zIndex, showText, fontSize, amountFontSize } = this.options;
    const container = document.createElement("div");
    container.className = "sprite-win-popup";
    container.style.cssText = "position:fixed;top:50%;left:50%;opacity:0;pointer-events:none;display:none;user-select:none;z-index:" + zIndex + ";transition:opacity " + animationDuration + "ms " + easing + ",transform " + animationDuration + "ms " + easing + ";transform:" + this.hiddenTransform();

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "position:relative;display:inline-block";

    const image = document.createElement("img");
    image.src = this.spriteUrl;
    image.alt = "You Won!";
    image.style.cssText = "display:block;max-width:none;max-height:none;object-fit:contain;user-select:none;pointer-events:none";
    image.onload = () => console.log("Win popup sprite loaded!");
    image.onerror = () => {
      image.style.display = "none";
      const fallback = document.createElement("div");
      fallback.textContent = "YOU WON!";
      fallback.style.cssText = "color:#EAFF00;font-size:32px;font-weight:bold;text-align:center;padding:20px 40px;background:rgba(11,30,41,0.95);border-radius:15px;border:3px solid #EAFF00;box-shadow:0 0 20px rgba(227,229,82,0.5);font-family:Arial,sans-serif;letter-spacing:2px";
      wrapper.appendChild(fallback);
    };

    wrapper.appendChild(image);
    this.imageNode = image;

    if (showText) {
      const textOverlay = document.createElement("div");
      textOverlay.style.cssText = "position:absolute;top:55%;left:15%;width:70%;height:35%;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;user-select:none;z-index:1;box-sizing:border-box";

      const titleText = document.createElement("div");
      titleText.textContent = "YOU WON";
      titleText.style.cssText = "color:#FFFFFF;font-size:" + fontSize + "px;font-weight:900;font-family:Arial,sans-serif;text-shadow:0 0 10px rgba(234,255,0,0.8),0 0 20px rgba(234,255,0,0.6),2px 2px 4px rgba(0,0,0,0.9);letter-spacing:2px;margin-bottom:8px;text-align:center;line-height:1;width:100%;text-transform:uppercase";

      const amountContainer = document.createElement("div");
      amountContainer.style.cssText = "background:linear-gradient(135deg,rgba(234,255,0,0.15) 0%,rgba(234,255,0,0.05) 100%);border:2px solid rgba(234,255,0,0.6);border-radius:8px;padding:6px 12px;box-shadow:0 0 15px rgba(234,255,0,0.3);display:flex;align-items:center;justify-content:center";

      const amountText = document.createElement("div");
      amountText.textContent = this.formatCurrency(this.amountValue);
      amountText.style.cssText = "color:#EAFF00;font-size:" + amountFontSize + "px;font-weight:bold;font-family:Arial,sans-serif;text-shadow:0 0 8px rgba(234,255,0,0.9),0 0 16px rgba(234,255,0,0.6),1px 1px 2px rgba(0,0,0,0.8);text-align:center;line-height:1;letter-spacing:1px";

      amountContainer.appendChild(amountText);
      textOverlay.appendChild(titleText);
      textOverlay.appendChild(amountContainer);
      wrapper.appendChild(textOverlay);

      this.titleTextNode = titleText;
      this.amountTextNode = amountText;
    }

    container.appendChild(wrapper);
    return container;
  }

  hiddenTransform() {
    const { scale, offsetX, offsetY, scaleHidden } = this.options;
    return "translate(-50%,-50%) translate(" + offsetX + "px," + offsetY + "px) scale(" + (scale * scaleHidden) + ")";
  }

  visibleTransform() {
    const { scale, offsetX, offsetY, scaleVisible } = this.options;
    return "translate(-50%,-50%) translate(" + offsetX + "px," + offsetY + "px) scale(" + (scale * scaleVisible) + ")";
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
    if (this.visible && this.container) this.container.style.transform = this.visibleTransform();
  }

  show({ amount, duration } = {}) {
    if (amount != null) this.setAmount(amount);
    if (!this.container) return;
    this.visible = true;
    clearTimeout(this._hideTimer);
    clearTimeout(this._autoHideTimer);
    this.container.style.display = "block";
    if (this.parent) {
      const rect = this.parent.getBoundingClientRect();
      this.container.style.left = (rect.left + rect.width / 2) + "px";
      this.container.style.top = (rect.top + rect.height / 2) + "px";
    }
    requestAnimationFrame(() => {
      if (this.container) {
        this.container.style.opacity = "1";
        this.container.style.transform = this.visibleTransform();
      }
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
    clearTimeout(this._hideTimer);
    clearTimeout(this._autoHideTimer);
    if (this.container && this.container.parentNode) this.container.parentNode.removeChild(this.container);
    this.container = null;
    this.imageNode = null;
  }
}
