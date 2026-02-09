export class ServerRelay extends EventTarget {
  constructor() {
    super();
  }

  send(type, payload = {}) {
    const message = { type, payload };
    this.dispatchEvent(new CustomEvent("outgoing", { detail: message }));
  }

  deliver(type, payload = {}) {
    const message = { type, payload };
    this.dispatchEvent(new CustomEvent("incoming", { detail: message }));
  }
}
