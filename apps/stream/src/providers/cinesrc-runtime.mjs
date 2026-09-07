import vm from "node:vm";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/138.0.0.0 Safari/537.36";

class RuntimeCustomEvent extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
}

class RuntimeErrorEvent extends Event {
  constructor(type, options = {}) {
    super(type);
    this.error = options.error;
    this.message = options.message ?? "";
  }
}

function noop() {}

function storage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(String(key));
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
  };
}

function canvasContext() {
  return {
    canvas: { width: 300, height: 150 },
    getExtension() {
      return null;
    },
    getParameter() {
      return null;
    },
    getSupportedExtensions() {
      return [];
    },
    measureText() {
      return { width: 0 };
    },
    createLinearGradient() {
      return { addColorStop: noop };
    },
    createRadialGradient() {
      return { addColorStop: noop };
    },
    createPattern() {
      return null;
    },
    fillRect: noop,
    fillText: noop,
    strokeText: noop,
    beginPath: noop,
    closePath: noop,
    arc: noop,
    rect: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    fill: noop,
  };
}

function element(tagName) {
  const node = new EventTarget();
  const context = canvasContext();
  return Object.assign(node, {
    tagName: String(tagName).toUpperCase(),
    style: {},
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove: noop,
    setAttribute: noop,
    getAttribute() {
      return null;
    },
    getContext() {
      return context;
    },
    toDataURL() {
      return "data:image/png;base64,";
    },
    getBoundingClientRect() {
      return { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 };
    },
  });
}

function documentShim(pageUrl) {
  const document = new EventTarget();
  const body = element("body");
  const head = element("head");
  return Object.assign(document, {
    body,
    head,
    documentElement: element("html"),
    visibilityState: "visible",
    hidden: false,
    cookie: "",
    URL: pageUrl.href,
    documentURI: pageUrl.href,
    baseURI: pageUrl.href,
    referrer: pageUrl.origin + "/",
    createElement: (tagName) => element(tagName),
    createElementNS: (_namespace, tagName) => element(tagName),
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getElementById() {
      return null;
    },
    hasFocus() {
      return true;
    },
  });
}

function navigatorShim(userAgent) {
  return {
    userAgent,
    appVersion: userAgent,
    appName: "Netscape",
    appCodeName: "Mozilla",
    product: "Gecko",
    productSub: "20030107",
    vendor: "Google Inc.",
    vendorSub: "",
    platform: "MacIntel",
    language: "en-US",
    languages: ["en-US", "en"],
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    cookieEnabled: true,
    onLine: true,
    pdfViewerEnabled: true,
    webdriver: false,
    plugins: [],
    mimeTypes: [],
    userAgentData: {
      brands: [
        { brand: "Chromium", version: "138" },
        { brand: "Not_A Brand", version: "99" },
      ],
      mobile: false,
      platform: "macOS",
      async getHighEntropyValues() {
        return {
          architecture: "arm",
          bitness: "64",
          brands: this.brands,
          fullVersionList: this.brands,
          mobile: false,
          model: "",
          platform: "macOS",
          platformVersion: "15.0.0",
          uaFullVersion: "138.0.0.0",
          wow64: false,
        };
      },
    },
    permissions: {
      async query() {
        return { state: "prompt", onchange: null };
      },
    },
    async getBattery() {
      return {
        charging: true,
        chargingTime: 0,
        dischargingTime: Infinity,
        level: 1,
      };
    },
  };
}

function absoluteFetch(origin, fetchImpl) {
  return (input, init) => {
    const raw = input instanceof Request ? input.url : String(input);
    return fetchImpl(new URL(raw, origin), init);
  };
}

class InlineWorker extends EventTarget {
  constructor(input, options = {}, fetchImpl = globalThis.fetch) {
    super();
    this.onmessage = null;
    this.onerror = null;
    this.#fetch = fetchImpl;
    this.#ready = this.#load(input, options);
  }

  #closed = false;
  #context = null;
  #fetch;
  #ready;

  async #load(input) {
    const response = await this.#fetch(String(input));
    if (!response.ok) throw new Error(`Worker script returned HTTP ${response.status}`);
    const source = await response.text();
    const self = new EventTarget();
    const deliver = (data) => {
      if (this.#closed) return;
      const event = new MessageEvent("message", { data });
      this.onmessage?.(event);
      this.dispatchEvent(event);
    };
    Object.assign(self, {
      self,
      globalThis: self,
      postMessage: deliver,
      close: () => {
        this.#closed = true;
      },
      fetch: this.#fetch,
      crypto: globalThis.crypto,
      WebAssembly,
      TextEncoder,
      TextDecoder,
      Uint8Array,
      ArrayBuffer,
      DataView,
      URL,
      Blob,
      atob,
      btoa,
      setTimeout,
      clearTimeout,
      console,
    });
    this.#context = vm.createContext(self);
    vm.runInContext(source, this.#context, { timeout: 15_000 });
  }

  postMessage(data) {
    this.#ready
      .then(() => this.#context?.onmessage?.(new MessageEvent("message", { data })))
      .catch((error) => {
        this.onerror?.(error);
        this.dispatchEvent(
          new RuntimeErrorEvent("error", { error, message: error.message }),
        );
      });
  }

  terminate() {
    this.#closed = true;
    this.#context = null;
  }
}

export function evaluateCineSrcScripts(
  sources,
  {
    pageUrl = "https://cinesrc.st/",
    fetchImpl = globalThis.fetch,
    userAgent = DEFAULT_USER_AGENT,
  } = {},
) {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new TypeError("At least one CineSrc runtime script is required");
  }
  const location = new URL(pageUrl);
  const document = documentShim(location);
  const navigator = navigatorShim(userAgent);
  const screen = {
    width: 1512,
    height: 982,
    availWidth: 1512,
    availHeight: 947,
    colorDepth: 30,
    pixelDepth: 30,
    orientation: { angle: 0, type: "landscape-primary" },
  };
  const scope = new EventTarget();
  const runtimeFetch = absoluteFetch(location.origin, fetchImpl);
  const Worker = class extends InlineWorker {
    constructor(input, options) {
      super(input, options, runtimeFetch);
    }
  };
  Object.assign(scope, {
    document,
    navigator,
    screen,
    location,
    origin: location.origin,
    CustomEvent: RuntimeCustomEvent,
    Event,
    EventTarget,
    MessageEvent,
    ErrorEvent: RuntimeErrorEvent,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array,
    ArrayBuffer,
    DataView,
    URL,
    URLSearchParams,
    Headers,
    Request,
    Response,
    Blob,
    Worker,
    fetch: runtimeFetch,
    crypto: globalThis.crypto,
    performance,
    WebAssembly,
    atob,
    btoa,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    console,
    localStorage: storage(),
    sessionStorage: storage(),
    matchMedia() {
      return {
        matches: false,
        media: "",
        onchange: null,
        addEventListener: noop,
        removeEventListener: noop,
        addListener: noop,
        removeListener: noop,
      };
    },
    CSS: { supports: () => false },
    devicePixelRatio: 2,
    innerWidth: 1280,
    innerHeight: 720,
    outerWidth: 1512,
    outerHeight: 982,
  });
  scope.window = scope;
  scope.self = scope;
  scope.globalThis = scope;
  document.defaultView = scope;
  const context = vm.createContext(scope);
  let api = null;
  scope.addEventListener("_cs", (event) => {
    const candidate = scope[event.detail];
    if (candidate?.gc && candidate?.dr) api = candidate;
  });
  for (const source of sources) {
    vm.runInContext(String(source), context, { timeout: 15_000 });
  }
  return { api, scope };
}
