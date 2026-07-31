export class SourceRunGuard {
  #active = null;

  begin(key) {
    if (this.#active === key) return false;
    this.#active = key;
    return true;
  }

  finish(key) {
    if (this.#active === key) this.#active = null;
  }

  clear() {
    this.#active = null;
  }
}
