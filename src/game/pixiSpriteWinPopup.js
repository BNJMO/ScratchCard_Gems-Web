import { Container, Sprite, Assets, BitmapText } from "pixi.js";

const DEFAULT_WIN_POPUP_CONFIG = {
	scale: 1,
	offsetX: 0,
	offsetY: 0,
	visibleScale: 1,
	hiddenScale: 0.9,
	fadeDuration: 200,
	zIndex: 10,

	fontName: "Desyrel",
	amountFontSize: 50,
	amountTint: 0xffff00,
	amountOffsetY: -120,
};

export class PixiSpriteWinPopup {
	constructor({ app, parent, config = {} }) {
		this.app = app;
		this.parent = parent ?? app.stage;

		this.config = { ...DEFAULT_WIN_POPUP_CONFIG, ...config };

		this.visible = false;
		this.amountValue = 0;

		this.container = new Container();
		this.container.zIndex = this.config.zIndex;
		this.container.visible = false;

		this.parent.addChild(this.container);

		this.sprite = null;
		this.amountText = null;
	}

	async init(textureUrl) {
		if (!textureUrl) {
			throw new Error("PixiSpriteWinPopup: textureUrl is required");
		}

		await Assets.load("https://pixijs.com/assets/bitmap-font/desyrel.xml");

		await this.#loadTexture(textureUrl);
	}

	async #loadTexture(textureUrl) {
		const texture = await Assets.load(textureUrl);

		this.sprite = new Sprite(texture);
		this.sprite.anchor.set(0.5);
		this.container.addChild(this.sprite);

		this.amountText = new BitmapText(this.formatAmount(this.amountValue), {
			fontName: this.config.fontName,
			fontSize: this.config.amountFontSize,
			align: "center",
		});

		this.amountText.anchor.set(0.5);
		this.amountText.tint = this.config.amountTint;

		this.container.addChild(this.amountText);

		this.#layout();
	}

	#layout() {
		const { scale, offsetX, offsetY, amountOffsetY } = this.config;

		this.container.x = this.app.screen.width / 2 + offsetX;
		this.container.y = this.app.screen.height / 2 + offsetY;
		this.container.scale.set(scale);

		if (this.amountText && this.sprite) {
			this.amountText.y = this.sprite.height * 0.5 + amountOffsetY;
		}
	}

	formatAmount(value) {
		const numeric = Number(value);
		return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
	}

	setAmount(value) {
		this.amountValue = value;

		if (this.amountText) {
			this.amountText.text = this.formatAmount(value);
		}
	}

	show() {
		if (!this.sprite || this.visible) return;

		this.visible = true;

		const { fadeDuration, visibleScale } = this.config;

		this.container.visible = true;
		this.container.alpha = 0;
		this.container.scale.set(visibleScale * 0.9);

		const start = performance.now();

		const animate = (now) => {
			const t = Math.min((now - start) / fadeDuration, 1);

			this.container.alpha = t;
			this.container.scale.set(visibleScale * (0.9 + 0.1 * t));

			if (t < 1) requestAnimationFrame(animate);
		};

		requestAnimationFrame(animate);
	}

	hide() {
		if (!this.sprite || !this.visible) return;

		this.visible = false;

		const { fadeDuration, hiddenScale } = this.config;
		const start = performance.now();

		const animate = (now) => {
			const t = Math.min((now - start) / fadeDuration, 1);

			this.container.alpha = 1 - t;
			this.container.scale.set(hiddenScale + (1 - t) * 0.1);

			if (t < 1) {
				requestAnimationFrame(animate);
			} else {
				this.container.visible = false;
			}
		};

		requestAnimationFrame(animate);
	}

	destroy() {
		this.container.removeFromParent();
		this.container.destroy({ children: true });
	}
}
