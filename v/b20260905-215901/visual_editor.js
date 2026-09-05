(function (root) {
  const SKIP_IDS = { goldHudValue: true, achieveToastOk: true, publishBtn: true, publishNewBtn: true, visualModeBtn: true, detailOverlayClose: true, devToolsBtn: true, devToolsClose: true };
  const SKIP_TEXT = { goldHud: true, goldHudValue: true };
  const SNAP = 14;
  const DRAG_THRESHOLD = 8;
  const Z_FLOOR = 4;

  const state = {
    ready: false,
    on: false,
    edit: false,
    screen: "play",
    layout: emptyLayout(),
    saved: emptyLayout(),
    dirty: false,
    selected: [],
    drag: null,
    editScreen: "",
    breakpoint: "desktop",
    ghosts: {},
    locks: {},
    collapsed: {},
    isolate: null,
    panelScope: "shared",
  };

  const BREAKS = ["desktop", "tablet", "mobile"];
  const BREAK_WIDTH = { desktop: 1440, tablet: 768, mobile: 390 };
  const BREAK_HEIGHT = { desktop: 900, tablet: 1024, mobile: 844 };
  const PANEL_BASES = {
    "stage-panel": true,
    "stage-panel-spare": true,
    "content-panel": true,
    "screen-bg": true,
  };
  const FLOW_DEFAULTS = {
    "stage-panel": true,
    "stage-panel-spare": true,
    "content-panel": true,
    "screen-bg": true,
    "craft-bench": true,
    "craft-grid": true,
    "fight-screen": true,
    "hero-view": true,
  };
  const PANEL_NAMES = {
    "stage-panel": "Панель сцены",
    "stage-panel-spare": "Запасная панель сцены",
    "content-panel": "Панель контента",
    "screen-bg": "Фон экрана (запасной)",
    "card-bg": "Фон карточки",
    "craft-bench": "Крафт",
    "craft-grid": "Ячейки крафта",
    "fight-screen": "Боевой экран",
    "hero-view": "Экран персонажа",
  };

  function defaultScreens() {
    return [
      { id: "play", name: "Игра", builtin: true, logic: "play" },
      { id: "home", name: "Главное меню", builtin: true, logic: "home" },
      { id: "saves", name: "Сохранения", builtin: true, logic: "saves" },
      { id: "class", name: "Класс", builtin: true, logic: "class" },
      { id: "achieves", name: "Достижения", builtin: true, logic: "achieves" },
      { id: "shop", name: "Магазин", builtin: true, logic: "shop" },
      { id: "settings", name: "Настройки", builtin: true, logic: "settings" },
      { id: "name", name: "Имя", builtin: true, logic: "name" },
    ];
  }

  function defaultLibrary() {
    return [
      { id: "lib_text", name: "Надпись", kind: "text", icon: "T" },
      { id: "lib_image", name: "Картинка", kind: "image", icon: "🖼" },
      { id: "lib_button", name: "Кнопка", kind: "button", icon: "▢" },
      { id: "lib_info", name: "Инфо-блок", kind: "info", icon: "ℹ" },
      { id: "lib_frame", name: "Рамка", kind: "frame", icon: "▭" },
      { id: "lib_group", name: "Группа", kind: "group", icon: "⧉" },
    ];
  }

  function emptyLayout() {
    return { items: {}, gaps: {}, layers: [], card: {}, screens: defaultScreens(), library: defaultLibrary() };
  }

  function clone(data) {
    return JSON.parse(JSON.stringify(data || emptyLayout()));
  }

  function $(id) {
    return document.getElementById(id);
  }

  function card() {
    return document.querySelector("main.card");
  }

  function screenName() {
    const title = $("topTitle");
    if (title && !title.hidden && title.textContent) return title.textContent;
    return state.screen || "play";
  }

  function classListOf(el) {
    return String(el.className || "")
      .split(/\s+/)
      .filter((name) => name && name.indexOf("vx-") !== 0)
      .slice(0, 2)
      .join(".");
  }

  function visualRoot(el) {
    if (!el || !el.closest) return card();
    const toast = el.closest("#achieveToast, .achieve-toast");
    if (toast) return toast;
    const overlay = el.closest("#detailOverlay, .game-overlay");
    if (overlay) return overlay;
    const pop = el.closest("#contactPop, .contact-pop");
    if (pop) return pop;
    return card();
  }

  function visualKey(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.dataset.vx) return el.dataset.vx;
    if (el.id && !SKIP_IDS[el.id]) return el.id;
    const host = visualRoot(el) || card();
    const parts = [];
    let node = el;
    while (node && node !== host) {
      if (node.id && !SKIP_IDS[node.id]) {
        parts.unshift("#" + node.id);
        break;
      }
      const parent = node.parentElement;
      if (!parent) break;
      const tag = node.tagName.toLowerCase();
      const cls = classListOf(node);
      const role = [node.getAttribute("data-slot-action"), node.getAttribute("data-class-key")].filter(Boolean).join(":");
      const same = Array.from(parent.children).filter((child) => {
        return child.tagName === node.tagName && classListOf(child) === cls;
      });
      parts.unshift([tag, cls, role, String(Math.max(0, same.indexOf(node)))].filter(Boolean).join(":"));
      node = parent;
    }
    return [screenName(), ...parts].filter(Boolean).join("/");
  }

  function stamp(root) {
    const hosts = root ? [root] : [card(), $("achieveToast"), $("detailOverlay"), $("contactPop")].filter(Boolean);
    hosts.forEach((host) => {
      const walk = (el) => {
        if (el.nodeType !== 1) return;
        if (el.closest && el.closest(".vx-dock, .vx-studio, .studio-bar, .vx-handles, .vx-marquee, .vx-nudge, .guide-overlay, .dev-tools")) return;
        if (el.id === "vxLayerHost") {
          for (let i = 0; i < el.children.length; i += 1) walk(el.children[i]);
          return;
        }
        if (el.classList && el.classList.contains("entry")) {
          for (let i = 0; i < el.children.length; i += 1) walk(el.children[i]);
          return;
        }
        if (!el.dataset.vx) {
          const key = visualKey(el);
          if (key) el.dataset.vx = key;
        }
        for (let i = 0; i < el.children.length; i += 1) walk(el.children[i]);
      };
      walk(host);
    });
  }

  function cssEscape(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function findByKey(key) {
    if (!key) return null;
    return document.querySelector('[data-vx="' + cssEscape(key) + '"]') || ($(key) || null);
  }

  function containingBlock(el) {
    let node = el && el.parentElement;
    while (node) {
      if (node.id === "log") {
        node = node.parentElement;
        continue;
      }
      const style = window.getComputedStyle(node);
      const pos = style.position;
      if (pos === "absolute" || pos === "relative" || pos === "fixed" || pos === "sticky") return node;
      if (style.transform && style.transform !== "none") return node;
      node = node.parentElement;
    }
    return card();
  }

  function innerBox() {
    const box = card();
    if (!box) return { x: 0, y: 0, w: 0, h: 0, padL: 0, padT: 0, centerX: 0, centerY: 0 };
    const bounds = box.getBoundingClientRect();
    const style = window.getComputedStyle(box);
    const padL = parseFloat(style.paddingLeft || 0);
    const padT = parseFloat(style.paddingTop || 0);
    const padR = parseFloat(style.paddingRight || 0);
    const padB = parseFloat(style.paddingBottom || 0);
    return {
      x: padL,
      y: padT,
      w: bounds.width - padL - padR,
      h: bounds.height - padT - padB,
      padL,
      padT,
      centerX: padL + (bounds.width - padL - padR) / 2,
      centerY: padT + (bounds.height - padT - padB) / 2,
    };
  }

  function localPoint(el) {
    const box = containingBlock(el);
    if (!box || !el) return { x: 0, y: 0, w: el ? el.offsetWidth : 0, h: el ? el.offsetHeight : 0 };
    const pr = box.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const style = window.getComputedStyle(box);
    return {
      x: er.left - pr.left - parseFloat(style.borderLeftWidth || 0),
      y: er.top - pr.top - parseFloat(style.borderTopWidth || 0),
      w: er.width,
      h: er.height,
    };
  }

  function editorScreen() {
    if (state.edit && state.editScreen) return state.editScreen;
    return state.screen || "play";
  }

  function isLiveChromeScreen() {
    const id = editorScreen();
    return id === (state.screen || "play") && chromeModes().indexOf(id) >= 0;
  }

  function playBreak() {
    const w = window.innerWidth;
    if (w < 600) return "mobile";
    if (w < 900) return "tablet";
    return "desktop";
  }

  function currentBreak() {
    return state.edit ? (state.breakpoint || "desktop") : playBreak();
  }

  function ensureScreens() {
    if (!Array.isArray(state.layout.screens) || !state.layout.screens.length) {
      state.layout.screens = defaultScreens();
    }
    if (!Array.isArray(state.layout.library) || !state.layout.library.length) {
      state.layout.library = defaultLibrary();
    }
  }

  function screenMeta(id) {
    ensureScreens();
    return (state.layout.screens || []).find((row) => row && row.id === id) || null;
  }

  function panelBase(key) {
    return String(key || "").split(":")[0];
  }

  function detectPanelContext() {
    const entry = document.querySelector("#log > .entry");
    if (entry) {
      if (entry.querySelector(".fight-screen")) return "combat";
      if (entry.querySelector(".hero-view")) return "hero";
      if (entry.querySelector(".inv-screen")) return "inv";
      if (entry.querySelector(".craft-screen")) return "craft";
    }
    return editorScreen() || "play";
  }

  function scopedPanelKey(base) {
    if (base === "screen-bg") return "screen-bg:" + (editorScreen() || "play");
    return base + ":" + detectPanelContext();
  }

  function isPanelKey(key) {
    return !!(key && PANEL_BASES[panelBase(key)]);
  }

  function isFlowRecord(item, key) {
    if (item && item.pin) return false;
    if (item && item.flow) return true;
    if (item && item.x != null && item.y != null) return false;
    return !!(key && FLOW_DEFAULTS[panelBase(key)]);
  }

  function targetRecord(raw) {
    if (!raw) return raw;
    const bp = currentBreak();
    if (!state.edit || bp === "desktop") return raw;
    raw.bp = raw.bp || {};
    if (!raw.bp[bp]) raw.bp[bp] = {};
    return raw.bp[bp];
  }

  function resolvedView(raw, key) {
    if (!raw) return raw;
    const bp = currentBreak();
    const isLayer = !!(raw.kind || (key && String(key).indexOf("layer:") === 0));
    if (bp === "desktop") return raw;
    const over = raw.bp && raw.bp[bp];
    if (!over) {
      if (isLayer || raw.pin) return raw;
      const inherited = Object.assign({}, raw);
      delete inherited.x;
      delete inherited.y;
      return inherited;
    }
    const view = Object.assign({}, raw, over);
    if (over.x == null && over.y == null && !over.pin) {
      delete view.x;
      delete view.y;
      view.flow = true;
    }
    return view;
  }

  function ensureItem(key) {
    if (!state.layout.items[key]) state.layout.items[key] = {};
    return state.layout.items[key];
  }

  function storageKey(key) {
    if (!key) return key;
    if (key === "screen-bg") return scopedPanelKey("screen-bg");
    if (PANEL_BASES[key] && state.panelScope === "local") return scopedPanelKey(key);
    if (PANEL_BASES[key] && state.layout.items[scopedPanelKey(key)] && state.panelScope !== "shared") {
      return scopedPanelKey(key);
    }
    return key;
  }

  function rawRecord(key) {
    const stored = storageKey(key);
    return layerByKey(stored) || layerByKey(key) || ensureItem(stored);
  }

  function mergedPanelView(base) {
    const shared = resolvedView(state.layout.items[base] || {}) || {};
    const scoped = state.layout.items[scopedPanelKey(base)];
    const local = scoped ? (resolvedView(scoped) || {}) : {};
    return Object.assign({}, shared, local);
  }

  function recordOf(key) {
    return targetRecord(rawRecord(key));
  }

  function pinFromView(el, item) {
    const pos = localPoint(el);
    if (item.x == null || item.y == null || item.w == null || item.h == null) {
      item.x = Math.round(pos.x);
      item.y = Math.round(pos.y);
      item.w = Math.round(pos.w);
      item.h = Math.round(pos.h);
    } else if (!item.rot) {
      item.x = Math.round(pos.x);
      item.y = Math.round(pos.y);
      item.w = Math.round(pos.w);
      item.h = Math.round(pos.h);
    }
    if (item.fontSize == null) {
      item.fontSize = Math.round(parseFloat(window.getComputedStyle(el).fontSize) || 16);
    }
    if (item.baseW == null) item.baseW = item.w;
    if (item.baseH == null) item.baseH = item.h;
    if (item.rot == null) item.rot = 0;
  }

  function selectedRoots() {
    const els = selectedEls();
    return els.filter((el) => !els.some((other) => other !== el && other.contains(el)));
  }

  function boxOf(host) {
    const box = host || card();
    if (!box) return innerBox();
    if (box === card()) return innerBox();
    const bounds = box.getBoundingClientRect();
    const style = window.getComputedStyle(box);
    const padL = parseFloat(style.paddingLeft || 0);
    const padT = parseFloat(style.paddingTop || 0);
    const padR = parseFloat(style.paddingRight || 0);
    const padB = parseFloat(style.paddingBottom || 0);
    return {
      padL,
      padT,
      w: bounds.width - padL - padR,
      h: bounds.height - padT - padB,
      centerX: padL + (bounds.width - padL - padR) / 2,
      centerY: padT + (bounds.height - padT - padB) / 2,
    };
  }

  function readZ(el, item) {
    if (item && item.z != null && item.z !== "") return Number(item.z) || 0;
    if (!el) return 0;
    const z = parseInt(window.getComputedStyle(el).zIndex, 10);
    return Number.isFinite(z) ? z : 0;
  }

  function canEditText(el) {
    if (el && SKIP_TEXT[el.id]) return false;
    const key = el && el.dataset ? el.dataset.vx : "";
    const layer = layerByKey(key);
    if (layer) return layer.kind !== "image";
    if (!el) return false;
    return !isImageItem(el, state.layout.items[key] || {});
  }

  function releaseNested(root) {
    selectedEls().forEach((el) => {
      if (el === root || !root.contains(el)) return;
      if (layerByKey(el.dataset.vx)) return;
      delete state.layout.items[el.dataset.vx];
      stripEl(el);
    });
  }

  function followParent(root, dx, dy) {
    if (!dx && !dy) return;
    root.querySelectorAll("[data-vx]").forEach((child) => {
      const key = child.dataset.vx;
      const item = recordOf(key);
      if (!item || item.x == null) return;
      const host = containingBlock(child);
      if (host === root || root.contains(host)) return;
      item.x = Math.round(item.x + dx);
      item.y = Math.round(item.y + dy);
      applyItem(child, item);
    });
  }

  function isImageItem(el, item) {
    if (item && item.kind === "image") return true;
    if (!el) return false;
    return el.tagName === "IMG" ||
      el.classList.contains("portrait") ||
      el.classList.contains("stage-art") ||
      !!(el.querySelector && el.querySelector("img"));
  }

  function isTextItem(el, item) {
    if (isImageItem(el, item)) return false;
    if (item && item.kind === "text") return true;
    if (!el) return false;
    if (el.id === "topTitle" || el.classList.contains("vx-label") || el.classList.contains("vx-layer")) return true;
    const tag = el.tagName;
    return tag === "STRONG" || tag === "B" || tag === "SPAN" || tag === "P" || tag === "SMALL" || tag === "LABEL";
  }

  function pinLayoutActive() {
    if (state.edit) return true;
    const box = card();
    if (!box) return true;
    const w = box.clientWidth;
    const h = box.clientHeight;
    const items = state.layout.items || {};
    let maxBottom = 0;
    let maxRight = 0;
    Object.keys(items).forEach((key) => {
      if (key === "card-bg" || key.indexOf("screen-bg") === 0) return;
      const item = items[key];
      if (!item) return;
      if (item.x != null) maxRight = Math.max(maxRight, item.x + (Number(item.w) || 0));
      else if (item.w != null) maxRight = Math.max(maxRight, Number(item.w) || 0);
      if (item.y != null) maxBottom = Math.max(maxBottom, item.y + (Number(item.h) || 0));
    });
    if (maxRight > w + 8) return false;
    if (maxBottom > h + 8) return false;
    return true;
  }

  function sizeValue(value) {
    if (value == null || value === "") return "";
    if (typeof value === "string" && /[a-z%]/i.test(value)) return value;
    const num = Number(value);
    return Number.isFinite(num) ? num + "px" : String(value);
  }

  function applyFlow(el, item) {
    if (!el || !item) return;
    el.classList.toggle("is-compact", !!item.compact);
    if (item.w != null) el.style.width = sizeValue(item.w);
    if (item.h != null) el.style.height = sizeValue(item.h);
    if (item.minW != null) el.style.minWidth = sizeValue(item.minW);
    if (item.minH != null) el.style.minHeight = sizeValue(item.minH);
    if (item.maxW != null) el.style.maxWidth = sizeValue(item.maxW);
    if (item.maxH != null) el.style.maxHeight = sizeValue(item.maxH);
    if (item.fontSize != null) el.style.fontSize = Number(item.fontSize) + "px";
    if (item.pad != null) el.style.padding = Number(item.pad) + "px";
    if (item.margin != null) el.style.margin = Number(item.margin) + "px";
    if (item.mt != null) el.style.marginTop = Number(item.mt) + "px";
    if (item.mb != null) el.style.marginBottom = Number(item.mb) + "px";
    if (item.ml != null) el.style.marginLeft = Number(item.ml) + "px";
    if (item.mr != null) el.style.marginRight = Number(item.mr) + "px";
    if (item.gap != null) el.style.gap = Number(item.gap) + "px";
    if (item.order != null) el.style.order = String(item.order);
    if (item.align) el.style.textAlign = item.align;
    if (item.justify) el.style.justifyContent = item.justify;
    if (item.alignItems) el.style.alignItems = item.alignItems;
    if (item.cols > 0) {
      el.style.display = "grid";
      el.style.gridTemplateColumns = "repeat(" + Math.max(1, Number(item.cols) || 1) + ", minmax(0, 1fr))";
    } else if (item.dir) {
      el.style.display = "flex";
      el.style.flexDirection = item.dir;
    }
    if (item.z != null) {
      if (!el.style.position || el.style.position === "static") el.style.position = "relative";
      el.style.zIndex = String(item.z);
    }
  }

  function applyPanelHide(el, item, key) {
    const hidden = !!(item && (item.hidden || item._hidden));
    const base = panelBase(key || (el && el.dataset && el.dataset.vx));
    const chromePanel = base === "content-panel" || base === "stage-panel";
    if (el) {
      el.classList.toggle("vx-panel-off", !!(hidden && chromePanel));
      if (base === "stage-panel-spare") {
        el.hidden = hidden || !item || !(item.w != null || item.h != null || item.visible);
        el.classList.toggle("is-on", !el.hidden);
      } else if (base === "screen-bg") {
        el.style.display = hidden ? "none" : "";
        el.hidden = hidden;
      } else if (hidden && !chromePanel) {
        el.style.display = "none";
      } else if (!hidden && el.style.display === "none" && (el.classList.contains("vx-layer") || state.edit || chromePanel)) {
        el.style.display = "";
      }
    }
    return hidden && !chromePanel;
  }

  function applyItem(el, item) {
    if (!el || !item) return;
    const key = el.dataset && el.dataset.vx;
    if (applyPanelHide(el, item, key)) return;
    if (!pinLayoutActive() && !el.classList.contains("vx-layer") && !isFlowRecord(item, key)) {
      if (item.text != null && !SKIP_TEXT[el.id]) writeText(el, item.text);
      return;
    }
    const flow = isFlowRecord(item, key);
    if (flow) {
      applyFlow(el, item);
      if (item.kind !== "image" && item.text != null && !SKIP_TEXT[el.id]) writeText(el, item.text);
      if (isGameControl(el)) el.style.pointerEvents = "auto";
      return;
    }
    const image = isImageItem(el, item);
    const baseW = Number(item.baseW) || 0;
    const baseH = Number(item.baseH) || 0;
    const stretch = !image && isTextItem(el, item) && baseW > 0 && baseH > 0 && item.w != null && item.h != null;
    const sx = stretch ? item.w / baseW : 1;
    const sy = stretch ? item.h / baseH : 1;
    const rot = Number(item.rot) || 0;
    if (item.x != null || item.y != null) {
      el.style.position = "absolute";
      el.style.margin = "0";
      if (el.tagName === "SPAN" || el.tagName === "STRONG" || el.tagName === "B" || el.tagName === "P") {
        el.style.display = "block";
      }
      let left = item.x;
      let top = item.y;
      if (stretch) {
        left = item.x + (item.w - baseW) / 2;
        top = item.y + (item.h - baseH) / 2;
      }
      if (left != null) el.style.left = Math.round(left) + "px";
      if (top != null) el.style.top = Math.round(top) + "px";
    }
    const parts = [];
    if (stretch && (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001)) {
      el.style.width = baseW + "px";
      el.style.height = baseH + "px";
      parts.push("scale(" + sx + ", " + sy + ")");
    } else {
      if (item.w != null) el.style.width = item.w + "px";
      if (item.h != null) el.style.height = item.h + "px";
    }
    if (rot) parts.push("rotate(" + rot + "deg)");
    el.style.transform = parts.join(" ");
    el.style.transformOrigin = "center center";
    if (image && !isPanelKey(key)) styleImageBox(el, item);
    applyFlow(el, item);
    if (!image && item.kind !== "info" && item.kind !== "frame" && (isTextItem(el, item) || el.classList.contains("vx-layer"))) el.style.whiteSpace = "nowrap";
    if (isGameControl(el)) {
      el.style.pointerEvents = "auto";
      const z = item.z != null ? Number(item.z) : parseInt(el.style.zIndex || "0", 10);
      if (!Number.isFinite(z) || z < 2) el.style.zIndex = "2";
    }
    if (item.kind !== "image" && item.text != null && !SKIP_TEXT[el.id]) writeText(el, item.text);
  }

  function isGameControl(el) {
    if (!el) return false;
    return el.tagName === "BUTTON" || el.tagName === "A" || el.classList.contains("icon-btn") || el.classList.contains("class-slot") || el.classList.contains("save-slot");
  }

  function isGhost(key) {
    if (!key) return false;
    if (state.ghosts[key]) return true;
    if (state.isolate && !state.isolate[key]) return true;
    return false;
  }

  function isLocked(key) {
    return !!(key && state.locks[key]);
  }

  function applyEditorChrome() {
    document.querySelectorAll("[data-vx]").forEach((el) => {
      const key = el.dataset.vx;
      el.classList.toggle("vx-ghost", !!(state.edit && isGhost(key)));
      el.classList.toggle("vx-locked", !!(state.edit && isLocked(key)));
    });
  }

  function styleImageBox(el, item) {
    el.style.maxWidth = "none";
    el.style.maxHeight = "none";
    el.style.overflow = "visible";
    if (item.w != null) el.style.width = item.w + "px";
    if (item.h != null) el.style.height = item.h + "px";
    const img = el.tagName === "IMG" ? el : el.querySelector("img");
    if (!img) return;
    img.style.maxWidth = "none";
    img.style.maxHeight = "none";
    img.style.width = img === el ? item.w + "px" : "100%";
    img.style.height = img === el ? item.h + "px" : "100%";
    img.style.objectFit = "fill";
    img.style.objectPosition = "center";
    img.style.display = "block";
  }

  function writeText(el, text) {
    if (!el) return;
    if (el.classList.contains("vx-label") || el.classList.contains("vx-layer") || el.childElementCount === 0) {
      if (!el.querySelector("img")) el.textContent = text;
      return;
    }
    const label = el.querySelector(":scope > .vx-label");
    if (label) {
      label.textContent = text;
      return;
    }
    if (el.tagName === "BUTTON" || el.tagName === "STRONG" || el.tagName === "B") {
      el.textContent = text;
    }
  }

  function readText(el) {
    if (!el) return "";
    const label = el.classList.contains("vx-label") ? el : el.querySelector(":scope > .vx-label");
    const node = label || el;
    return String(node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
  }

  function stripEl(el) {
    if (!el) return;
    el.style.position = "";
    el.style.left = "";
    el.style.top = "";
    el.style.width = "";
    el.style.height = "";
    el.style.fontSize = "";
    el.style.margin = "";
    el.style.whiteSpace = "";
    el.style.zIndex = "";
    el.style.gap = "";
    el.style.display = "";
    el.style.transform = "";
    el.style.transformOrigin = "";
    el.style.maxWidth = "";
    el.style.maxHeight = "";
    el.style.objectFit = "";
    el.style.overflow = "";
    el.style.backgroundImage = "";
    el.style.backgroundSize = "";
    el.style.minWidth = "";
    el.style.minHeight = "";
    el.style.maxWidth = "";
    el.style.maxHeight = "";
    el.style.padding = "";
    el.style.order = "";
    el.style.justifyContent = "";
    el.style.alignItems = "";
    el.style.flexDirection = "";
    el.style.gridTemplateColumns = "";
    el.style.textAlign = "";
    el.classList.remove("is-compact", "vx-panel-off");
    const img = el.tagName === "IMG" ? el : el.querySelector && el.querySelector("img");
    if (img && img !== el) {
      img.style.maxWidth = "";
      img.style.maxHeight = "";
      img.style.width = "";
      img.style.height = "";
      img.style.objectFit = "";
    }
  }

  function stripAll() {
    document.querySelectorAll("[data-vx]").forEach(stripEl);
    const box = card();
    if (box) {
      box.style.backgroundImage = "";
      box.style.backgroundSize = "";
    }
    const host = $("vxLayerHost");
    if (host) host.innerHTML = "";
  }

  function applyCard() {
    const box = card();
    const meta = state.layout.card || {};
    if (!box) return;
    box.style.backgroundImage = "";
    box.style.backgroundSize = "";
    let bg = $("vxScreenBg");
    if (!bg) {
      bg = document.createElement("div");
      bg.id = "vxScreenBg";
      bg.className = "vx-screen-bg";
      bg.dataset.vx = "card-bg";
      box.insertBefore(bg, box.firstChild);
    }
    bg.dataset.vx = "card-bg";
    if (meta.bg) {
      bg.style.backgroundImage = 'url("' + meta.bg + '")';
      bg.style.backgroundSize = "100% 100%";
      bg.style.backgroundRepeat = "no-repeat";
    } else {
      bg.style.backgroundImage = "";
    }
    const item = state.layout.items["card-bg"];
    if (pinLayoutActive() && item && (item.x != null || item.w != null)) applyItem(bg, item);
    else {
      bg.style.position = "absolute";
      bg.style.left = "0";
      bg.style.top = "0";
      bg.style.width = "100%";
      bg.style.height = "100%";
      bg.style.right = "";
      bg.style.bottom = "";
    }
  }

  function layerKey(id) {
    return "layer:" + id;
  }

  function renderLayers() {
    const box = card();
    if (!box) return;
    let host = $("vxLayerHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "vxLayerHost";
      host.className = "vx-layer-host";
      box.insertBefore(host, box.firstChild);
    }
    host.innerHTML = "";
    const currentScreen = editorScreen();
    const visible = (state.layout.layers || []).filter((layer) => {
      if (layer._hidden) return false;
      if (resolvedView(layer).hidden) return false;
      if (layer.screen && layer.screen !== "all" && layer.screen !== currentScreen) return false;
      return true;
    });
    const byId = {};
    visible.forEach((layer) => { byId[layer.id] = layer; });
    visible.sort((a, b) => layerDepth(a, byId) - layerDepth(b, byId));
    const nodes = {};
    visible.forEach((layer) => {
      const node = document.createElement("div");
      node.className = "vx-layer vx-kind-" + (layer.kind || "text") + (layer.interactive ? " is-live" : "");
      node.dataset.vx = layerKey(layer.id);
      node.style.zIndex = String(layer.z || 1);
      if (layer.kind === "group") {
        node.textContent = "";
      } else if (layer.kind === "image") {
        if (layer.src) {
          const img = document.createElement("img");
          img.src = layer.src;
          img.alt = "";
          img.draggable = false;
          node.appendChild(img);
        } else {
          node.textContent = "картинка";
        }
      } else if (layer.kind === "frame") {
        node.textContent = layer.text || "";
      } else {
        node.textContent = layer.text || (layer.kind === "button" ? "Кнопка" : layer.kind === "info" ? "Информация" : "надпись");
      }
      const parentNode = layer.parentId && nodes[layer.parentId];
      (parentNode || host).appendChild(node);
      nodes[layer.id] = node;
      applyItem(node, resolvedView(layer));
    });
  }

  function layerDepth(layer, byId) {
    let depth = 0;
    let id = layer && layer.parentId;
    const seen = {};
    while (id && byId[id] && !seen[id]) {
      seen[id] = true;
      depth += 1;
      id = byId[id].parentId;
    }
    return depth;
  }

  function chromeModes() {
    return ["play", "home", "saves", "class", "achieves", "shop", "settings", "name"];
  }

  function layoutKeyMatchesScreen(key) {
    if (!isLiveChromeScreen()) return false;
    if (!key || key.indexOf("/") < 0) return true;
    const prefix = key.split("/")[0];
    const modes = chromeModes();
    if (modes.indexOf(prefix) >= 0) return prefix === (state.screen || "play");
    return prefix === screenName() || prefix === (state.screen || "play");
  }

  function screenBgRecord() {
    const items = state.layout.items || {};
    const current = editorScreen();
    if (items["screen-bg:" + current]) return items["screen-bg:" + current];
    const shared = items["screen-bg"];
    if (shared && (shared.screen == null || shared.screen === current || shared.screen === "all")) return shared;
    return null;
  }

  function applyAll() {
    stamp();
    const pin = pinLayoutActive();
    document.body.classList.toggle("vx-fluid", !pin);
    if (!pin) {
      Object.keys(state.layout.items || {}).forEach((key) => {
        const el = findByKey(key);
        if (el) stripEl(el);
      });
    }
    applyCard();
    renderLayers();
    Object.keys(state.layout.gaps || {}).forEach((key) => {
      if (!layoutKeyMatchesScreen(key)) return;
      const el = findByKey(key);
      if (el) el.style.gap = state.layout.gaps[key] + "px";
    });
    Object.keys(state.layout.items || {}).forEach((key) => {
      if (key === "screen-bg" || key.indexOf("screen-bg:") === 0) return;
      if (PANEL_BASES[panelBase(key)]) return;
      if (!layoutKeyMatchesScreen(key)) return;
      const el = findByKey(key);
      if (!el) return;
      const item = state.layout.items[key];
      const view = resolvedView(item, key);
      if (item && (item._hidden || (view && view.hidden))) { el.style.display = "none"; return; }
      applyItem(el, view);
    });
    ["stage-panel", "stage-panel-spare", "content-panel"].forEach((base) => {
      const el = findByKey(base);
      if (!el) return;
      applyItem(el, mergedPanelView(base));
    });
    const screenItem = screenBgRecord();
    const bg = document.querySelector('[data-vx="screen-bg"]');
    if (bg && screenItem && (screenItem.hidden || screenItem._hidden || (resolvedView(screenItem) || {}).hidden)) {
      applyItem(bg, resolvedView(screenItem));
    } else if (
      state.edit &&
      bg &&
      screenItem &&
      (screenItem.x != null || screenItem.w != null || screenItem.y != null || screenItem.h != null || screenItem.flow)
    ) {
      applyItem(bg, resolvedView(screenItem));
    } else if (isLiveChromeScreen() && typeof root.placeScreenBg === "function") {
      root.placeScreenBg();
    }
    applyEditorChrome();
    syncStudioBody();
    paintSelection();
  }

  function centerMenuGroup() {
    return;
  }

  function markDirty() {
    state.dirty = true;
    setStatus("не сохранено", "");
    placeHandles();
    if (!state.drag) refreshInspector(false);
  }

  function setStatus(text, kind) {
    const node = $("vxStatus");
    if (!node) return;
    node.textContent = text;
    node.className = "vx-status" + (kind ? " " + kind : "");
  }

  function selectedEls() {
    return state.selected.map(findByKey).filter(Boolean);
  }

  function layerByKey(key) {
    if (!key || key.indexOf("layer:") !== 0) return null;
    const id = key.slice(6);
    return (state.layout.layers || []).find((row) => row.id === id) || null;
  }

  function paintSelection() {
    document.querySelectorAll(".vx-selected, .vx-picked").forEach((el) => {
      el.classList.remove("vx-selected", "vx-picked");
    });
    state.selected.forEach((key, index) => {
      const el = findByKey(key);
      if (!el) return;
      el.classList.add(index === 0 ? "vx-selected" : "vx-picked");
    });
    const label = $("vxSelected");
    if (label) {
      if (!state.selected.length) {
        label.textContent = "ничего не выбрано — клик по объекту, Ctrl+клик или обведи мышью";
      } else if (state.selected.length >= 2) {
        label.textContent = "выбрано " + state.selected.length + " — двигайте рамку целиком, плюс и минус масштабируют от центра";
      } else {
        label.textContent = "выбрано " + state.selected.length + " — ручки по краям, стрелки справа на 1px";
      }
    }
    const field = $("vxText");
    if (field && document.activeElement !== field) {
      const key = state.selected[0];
      const layer = layerByKey(key);
      const el = findByKey(key);
      const item = key ? state.layout.items[key] || {} : {};
      field.value = layer ? (layer.text || "") : item.text != null ? item.text : el ? readText(el) : "";
      field.disabled = !key || !canEditText(el);
    }
    const live = $("vxLive");
    if (live) {
      const layer = layerByKey(state.selected[0]);
      live.checked = !!(layer && layer.interactive);
      live.disabled = !layer;
    }
    const screenSel = $("vxScreen");
    if (screenSel) {
      const layer = layerByKey(state.selected[0]);
      screenSel.value = layer ? (layer.screen || "") : "";
      screenSel.disabled = !layer;
    }
    placeHandles();
    highlightHierarchy();
    refreshInspector(false);
  }

  function selectKey(key, add) {
    if (!key) return;
    if (add) {
      const at = state.selected.indexOf(key);
      if (at >= 0) state.selected.splice(at, 1);
      else state.selected.push(key);
    } else {
      state.selected = [key];
    }
    if (panelBase(key) === "stage-panel-spare") state.panelScope = "local";
    else if (panelBase(key) === "stage-panel" || panelBase(key) === "content-panel") state.panelScope = "shared";
    paintSelection();
  }

  function isEmptyHost(el) {
    if (!el) return true;
    if (el === card() || el.id === "vxLayerHost") return true;
    if (el.id === "log" || el.id === "actions" || el.id === "topbar" || el.id === "topbar-end" || el.id === "topbarStart") return true;
    if (el.dataset && (el.dataset.vx === "content-panel" || el.dataset.vx === "stage-panel" || el.dataset.vx === "stage-panel-spare" || el.dataset.vx === "screen-bg")) return false;
    return el.classList.contains("class-board") ||
      el.classList.contains("save-board") ||
      el.classList.contains("topbar-end") ||
      el.classList.contains("topbar-start") ||
      el.classList.contains("vx-layer-host") ||
      (el.classList.contains("entry") && el.dataset.vx !== "content-panel");
  }

  function pickFromEvent(event) {
    if (event.target.closest(".vx-dock, .vx-studio, .studio-bar, .vx-handles, .vx-marquee, .vx-nudge, .guide-overlay, .dev-tools")) return null;
    const host = visualRoot(event.target);
    if (!host || host.hidden || !host.contains(event.target)) return null;
    if (event.target === host || event.target.id === "vxLayerHost") return null;
    let el = event.target;
    if (el.closest && el.closest(".vx-layer")) return el.closest(".vx-layer");
    if (el.tagName === "IMG") el = el.parentElement;
    while (el && el !== host && !el.dataset.vx) el = el.parentElement;
    if (!el || el === host || isEmptyHost(el)) return null;
    return el;
  }

  function ensureOverlay() {
    if (!$("vxHandles")) {
      const handles = document.createElement("div");
      handles.id = "vxHandles";
      handles.className = "vx-handles";
      ["nw", "n", "ne", "w", "e", "sw", "s", "se", "rot"].forEach((name) => {
        const node = document.createElement("i");
        node.className = "vx-handle";
        node.dataset.h = name;
        handles.appendChild(node);
      });
      const mid = document.createElement("i");
      mid.className = "vx-center";
      handles.appendChild(mid);
      document.body.appendChild(handles);
    }
    if (!$("vxMarquee")) {
      const box = document.createElement("div");
      box.id = "vxMarquee";
      box.className = "vx-marquee";
      document.body.appendChild(box);
    }
  }

  function selectionBox() {
    const els = selectedEls();
    if (!els.length) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    });
    return { left, top, width: right - left, height: bottom - top };
  }

  function placeHandles() {
    const wrap = $("vxHandles");
    if (!wrap) return;
    const box = state.edit && state.selected.length ? selectionBox() : null;
    if (!box || box.width < 1 || box.height < 1) {
      wrap.classList.remove("is-on");
      return;
    }
    wrap.classList.add("is-on");
    wrap.style.left = box.left + "px";
    wrap.style.top = box.top + "px";
    wrap.style.width = box.width + "px";
    wrap.style.height = box.height + "px";
    wrap.classList.toggle("is-group", state.selected.length > 1);
    const spots = {
      nw: [-5, -5], n: [box.width / 2 - 5, -5], ne: [box.width - 5, -5],
      w: [-5, box.height / 2 - 5], e: [box.width - 5, box.height / 2 - 5],
      sw: [-5, box.height - 5], s: [box.width / 2 - 5, box.height - 5], se: [box.width - 5, box.height - 5],
      rot: [box.width / 2 - 8, -34],
    };
    wrap.querySelectorAll(".vx-handle").forEach((node) => {
      const pair = spots[node.dataset.h];
      if (!pair) return;
      node.style.left = pair[0] + "px";
      node.style.top = pair[1] + "px";
    });
    const mid = wrap.querySelector(".vx-center");
    if (mid) {
      mid.style.left = box.width / 2 - 7 + "px";
      mid.style.top = box.height / 2 - 7 + "px";
    }
  }

  function groupSnapshot() {
    return selectedRoots().map((el) => {
      const item = recordOf(el.dataset.vx);
      pinFromView(el, item);
      const r = el.getBoundingClientRect();
      return {
        key: el.dataset.vx,
        origX: item.x,
        origY: item.y,
        origW: item.w,
        origH: item.h,
        origRot: Number(item.rot) || 0,
        origFont: item.fontSize || 16,
        left: r.left,
        top: r.top,
        vw: r.width,
        vh: r.height,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
      };
    });
  }

  function applyVisualRect(el, item, left, top, w, h) {
    const host = containingBlock(el);
    const pr = host.getBoundingClientRect();
    const style = window.getComputedStyle(host);
    item.x = Math.round(left - pr.left - parseFloat(style.borderLeftWidth || 0));
    item.y = Math.round(top - pr.top - parseFloat(style.borderTopWidth || 0));
    item.w = Math.max(16, Math.round(w));
    item.h = Math.max(16, Math.round(h));
    applyItem(el, item);
  }

  function beginMove(key, startX, startY) {
    if (isLocked(key) || state.selected.some(isLocked)) {
      setStatus("слой заблокирован", "bad");
      return;
    }
    if (state.selected.length > 1) {
      const box = selectionBox();
      state.drag = {
        type: "group-move",
        startX,
        startY,
        box,
        items: groupSnapshot(),
      };
      document.body.classList.add("vx-dragging");
      return;
    }
    const el = findByKey(key);
    const item = recordOf(key);
    if (!el || !item) return;
    if (isFlowRecord(item, key)) {
      setStatus("Этот блок в потоке: меняйте размер, не позицию", "");
      return;
    }
    pinFromView(el, item);
    applyItem(el, item);
    state.drag = {
      type: "move",
      key,
      startX,
      startY,
      origX: item.x,
      origY: item.y,
    };
    document.body.classList.add("vx-dragging");
  }

  function startRotate(key, event) {
    if (isLocked(key) || state.selected.some(isLocked)) return;
    if (state.selected.length > 1) {
      const box = selectionBox();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      state.drag = {
        type: "group-rotate",
        cx,
        cy,
        startAngle: Math.atan2(event.clientY - cy, event.clientX - cx),
        items: groupSnapshot(),
      };
      document.body.classList.add("vx-dragging");
      return;
    }
    const el = findByKey(key);
    const item = recordOf(key);
    if (!el || !item) return;
    const r = el.getBoundingClientRect();
    state.drag = {
      type: "rotate",
      key,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      startAngle: Math.atan2(event.clientY - (r.top + r.height / 2), event.clientX - (r.left + r.width / 2)),
      origRot: Number(item.rot) || 0,
    };
    document.body.classList.add("vx-dragging");
  }

  function startResize(handle, key, event) {
    if (isLocked(key) || state.selected.some(isLocked)) {
      setStatus("слой заблокирован", "bad");
      return;
    }
    if (state.selected.length > 1) {
      const box = selectionBox();
      state.drag = {
        type: "group-resize",
        handle,
        startX: event.clientX,
        startY: event.clientY,
        box,
        items: groupSnapshot(),
      };
      document.body.classList.add("vx-dragging");
      return;
    }
    const el = findByKey(key);
    const item = recordOf(key);
    if (!el || !item) return;
    const flow = isFlowRecord(item, key);
    if (flow) {
      const pos = localPoint(el);
      item.flow = true;
      item.w = Math.round(pos.w);
      item.h = Math.round(pos.h);
      delete item.x;
      delete item.y;
    } else {
      pinFromView(el, item);
    }
    applyItem(el, resolvedView(rawRecord(key)));
    state.drag = {
      type: flow ? "flow-resize" : "resize",
      handle,
      key,
      startX: event.clientX,
      startY: event.clientY,
      origX: item.x,
      origY: item.y,
      origW: item.w,
      origH: item.h,
      origFont: item.fontSize || Math.round(parseFloat(window.getComputedStyle(el).fontSize) || 16),
    };
    document.body.classList.add("vx-dragging");
  }

  function startMarquee(event) {
    state.drag = { type: "marquee", x0: event.clientX, y0: event.clientY };
    const box = $("vxMarquee");
    if (box) {
      box.style.display = "block";
      box.style.left = event.clientX + "px";
      box.style.top = event.clientY + "px";
      box.style.width = "0px";
      box.style.height = "0px";
    }
  }

  function onPointerDown(event) {
    if (!state.on || !state.edit) return;
    if (event.button !== 0) return;
    if (event.target.closest("[contenteditable='true']")) return;
    const handle = event.target.closest && event.target.closest(".vx-handle");
    if (handle && state.selected.length) {
      event.preventDefault();
      event.stopPropagation();
      const name = handle.getAttribute("data-h");
      if (name === "rot") startRotate(state.selected[0], event);
      else startResize(name, state.selected[0], event);
      if (handle.setPointerCapture && event.pointerId != null) {
        try { handle.setPointerCapture(event.pointerId); } catch (error) {}
      }
      return;
    }
    if (event.target.closest && event.target.closest(".vx-handles") && state.selected.length) {
      event.preventDefault();
      event.stopPropagation();
      beginMove(state.selected[0], event.clientX, event.clientY);
      return;
    }
    if (event.target.closest(".vx-dock, .vx-studio, .studio-bar, .vx-nudge, .guide-overlay, .dev-tools")) return;
    const el = pickFromEvent(event);
    if (!el) {
      const host = visualRoot(event.target);
      if (host && host.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.ctrlKey && !event.metaKey) state.selected = [];
        paintSelection();
        state.drag = {
          type: "pending-marquee",
          add: event.ctrlKey || event.metaKey,
          startX: event.clientX,
          startY: event.clientY,
        };
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    stamp();
    const key = el.dataset.vx || visualKey(el);
    el.dataset.vx = key;
    const already = state.selected.indexOf(key) >= 0;
    const add = event.ctrlKey || event.metaKey || event.shiftKey;
    if (already && !add) paintSelection();
    else selectKey(key, add);
    state.drag = {
      type: "pending-move",
      key,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function snapValue(value, target) {
    return Math.abs(value - target) <= SNAP ? target : value;
  }

  function onPointerMove(event) {
    if (!state.drag) return;
    if (state.drag.type === "pending-move") {
      const dist = Math.hypot(event.clientX - state.drag.startX, event.clientY - state.drag.startY);
      if (dist < DRAG_THRESHOLD) return;
      if (isFlowRecord(recordOf(state.drag.key), state.drag.key)) {
        state.drag = null;
        setStatus("Этот блок в потоке: меняйте размер, не позицию", "");
        return;
      }
      beginMove(state.drag.key, state.drag.startX, state.drag.startY);
    }
    if (state.drag.type === "pending-marquee") {
      const dist = Math.hypot(event.clientX - state.drag.startX, event.clientY - state.drag.startY);
      if (dist < DRAG_THRESHOLD) return;
      startMarquee({ clientX: state.drag.startX, clientY: state.drag.startY });
    }
    if (state.drag.type === "marquee") {
      const x = Math.min(state.drag.x0, event.clientX);
      const y = Math.min(state.drag.y0, event.clientY);
      const w = Math.abs(event.clientX - state.drag.x0);
      const h = Math.abs(event.clientY - state.drag.y0);
      const box = $("vxMarquee");
      if (box) {
        box.style.left = x + "px";
        box.style.top = y + "px";
        box.style.width = w + "px";
        box.style.height = h + "px";
      }
      return;
    }
    const key = state.drag.key;
    const item = key ? recordOf(key) : null;
    const el = key ? findByKey(key) : null;
    if (state.drag.type === "group-move" || state.drag.type === "group-resize" || state.drag.type === "group-rotate") {
      applyGroupDrag(event);
      markDirty();
      return;
    }
    if (!item || !el || !state.drag.type) return;
    if (state.drag.type === "rotate") {
      const angle = Math.atan2(event.clientY - state.drag.cy, event.clientX - state.drag.cx);
      item.rot = Math.round(state.drag.origRot + (angle - state.drag.startAngle) * 180 / Math.PI);
      applyItem(el, item);
      markDirty();
      return;
    }
    if (state.drag.type === "move") {
      const box = boxOf(containingBlock(el));
      const nextX = Math.round(state.drag.origX + (event.clientX - state.drag.startX));
      const nextY = Math.round(state.drag.origY + (event.clientY - state.drag.startY));
      const snappedX = Math.round(snapValue(nextX + item.w / 2, box.centerX) - item.w / 2);
      const snappedY = Math.round(snapValue(nextY + item.h / 2, box.centerY) - item.h / 2);
      const dx = snappedX - item.x;
      const dy = snappedY - item.y;
      item.x = snappedX;
      item.y = snappedY;
      applyItem(el, item);
      followParent(el, dx, dy);
    } else if (state.drag.type === "resize" || state.drag.type === "flow-resize") {
      const ox = state.drag.origX;
      const oy = state.drag.origY;
      const ow = state.drag.origW;
      const oh = state.drag.origH;
      const handle = state.drag.handle;
      const rx = event.clientX - state.drag.startX;
      const ry = event.clientY - state.drag.startY;
      let w = ow;
      let h = oh;
      let x = ox;
      let y = oy;
      if (handle.indexOf("e") !== -1) w = ow + rx;
      if (handle.indexOf("s") !== -1) h = oh + ry;
      if (handle.indexOf("w") !== -1) {
        w = ow - rx;
        x = ox + rx;
      }
      if (handle.indexOf("n") !== -1) {
        h = oh - ry;
        y = oy + ry;
      }
      const corner = handle.length === 2;
      if (corner) {
        const axis = handle.indexOf("e") !== -1 || handle.indexOf("w") !== -1 ? w / Math.max(1, ow) : h / Math.max(1, oh);
        const ratio = Math.max(0.15, axis);
        w = Math.max(16, Math.round(ow * ratio));
        h = Math.max(16, Math.round(oh * ratio));
        if (handle.indexOf("w") !== -1) x = ox + (ow - w);
        if (handle.indexOf("n") !== -1) y = oy + (oh - h);
      }
      if (state.drag.type !== "flow-resize") {
        item.x = Math.round(x);
        item.y = Math.round(y);
      } else {
        item.flow = true;
        delete item.x;
        delete item.y;
      }
      item.w = Math.max(16, Math.round(w));
      item.h = Math.max(16, Math.round(h));
      applyItem(el, resolvedView(rawRecord(key)));
    }
    markDirty();
  }

  function applyGroupDrag(event) {
    const drag = state.drag;
    const items = drag.items || [];
    if (drag.type === "group-move") {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      items.forEach((row) => {
        const node = findByKey(row.key);
        const rec = recordOf(row.key);
        if (!node || !rec) return;
        applyVisualRect(node, rec, row.left + dx, row.top + dy, row.vw, row.vh);
      });
      return;
    }
    if (drag.type === "group-rotate") {
      const angle = Math.atan2(event.clientY - drag.cy, event.clientX - drag.cx);
      const delta = angle - drag.startAngle;
      const cos = Math.cos(delta);
      const sin = Math.sin(delta);
      const deg = delta * 180 / Math.PI;
      items.forEach((row) => {
        const node = findByKey(row.key);
        const rec = recordOf(row.key);
        if (!node || !rec) return;
        const dx = row.cx - drag.cx;
        const dy = row.cy - drag.cy;
        const nx = drag.cx + dx * cos - dy * sin;
        const ny = drag.cy + dx * sin + dy * cos;
        rec.rot = Math.round(row.origRot + deg);
        applyVisualRect(node, rec, nx - row.vw / 2, ny - row.vh / 2, row.vw, row.vh);
      });
      return;
    }
    if (drag.type !== "group-resize") return;
    const box = drag.box;
    const handle = drag.handle;
    const rx = event.clientX - drag.startX;
    const ry = event.clientY - drag.startY;
    let w = box.width;
    let h = box.height;
    if (handle.indexOf("e") !== -1) w = box.width + rx;
    if (handle.indexOf("s") !== -1) h = box.height + ry;
    if (handle.indexOf("w") !== -1) w = box.width - rx;
    if (handle.indexOf("n") !== -1) h = box.height - ry;
    const corner = handle.length === 2;
    let sx = w / Math.max(1, box.width);
    let sy = h / Math.max(1, box.height);
    if (corner) {
      const ratio = Math.max(0.15, handle.indexOf("e") !== -1 || handle.indexOf("w") !== -1 ? sx : sy);
      sx = ratio;
      sy = ratio;
    } else {
      if (handle === "e" || handle === "w") sy = 1;
      if (handle === "n" || handle === "s") sx = 1;
    }
    sx = Math.max(0.15, sx);
    sy = Math.max(0.15, sy);
    let ox = box.left;
    let oy = box.top;
    if (handle.indexOf("w") !== -1) ox = box.left + box.width;
    if (handle.indexOf("n") !== -1) oy = box.top + box.height;
    if (handle === "e" || handle === "w") oy = box.top;
    if (handle === "n" || handle === "s") ox = box.left;
    items.forEach((row) => {
      const node = findByKey(row.key);
      const rec = recordOf(row.key);
      if (!node || !rec) return;
      const left = ox + (row.left - ox) * sx;
      const top = oy + (row.top - oy) * sy;
      rec.fontSize = Math.max(8, Math.round(row.origFont * (corner ? sx : (sx !== 1 ? sx : sy))));
      applyVisualRect(node, rec, left, top, row.vw * sx, row.vh * sy);
    });
  }

  function finishMarquee(event) {
    const box = $("vxMarquee");
    if (box) box.style.display = "none";
    const x1 = Math.min(state.drag.x0, event.clientX);
    const y1 = Math.min(state.drag.y0, event.clientY);
    const x2 = Math.max(state.drag.x0, event.clientX);
    const y2 = Math.max(state.drag.y0, event.clientY);
    if (x2 - x1 < 6 && y2 - y1 < 6) return;
    const next = state.drag.add ? state.selected.slice() : [];
    const hosts = [card(), $("achieveToast"), $("detailOverlay"), $("contactPop")].filter(Boolean);
    hosts.forEach((root) => {
      root.querySelectorAll("[data-vx]").forEach((el) => {
        if (el.id === "vxLayerHost") return;
        if (isEmptyHost(el)) return;
        const r = el.getBoundingClientRect();
        if (r.right < x1 || r.left > x2 || r.bottom < y1 || r.top > y2) return;
        if (next.indexOf(el.dataset.vx) < 0) next.push(el.dataset.vx);
      });
    });
    state.selected = next;
    paintSelection();
  }

  function onPointerUp(event) {
    if (!state.drag) return;
    if (state.drag.type === "marquee") finishMarquee(event);
    if (state.drag.type === "pending-move" && state.drag.key) {
      const el = findByKey(state.drag.key);
      if (el && canEditText(el)) {
        const field = $("vxText");
        if (field) {
          field.disabled = false;
          field.value = layerByKey(el.dataset.vx) ? (layerByKey(el.dataset.vx).text || "") : (state.layout.items[el.dataset.vx] && state.layout.items[el.dataset.vx].text != null ? state.layout.items[el.dataset.vx].text : readText(el));
          field.focus();
          field.select();
        }
      }
    }
    state.drag = null;
    document.body.classList.remove("vx-dragging");
    placeHandles();
    refreshInspector(false);
  }

  function onClickCapture(event) {
    if (!state.on || !state.edit) return;
    if (event.target.closest(".vx-dock, .vx-studio, .studio-bar, .vx-handles, .vx-nudge, .guide-overlay, .dev-tools")) return;
    if (event.target.closest("[contenteditable='true']")) return;
    const host = visualRoot(event.target);
    if (host && host.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function onDblClick(event) {
    if (!state.on || !state.edit) return;
    if (event.target.closest(".vx-dock, .vx-studio, .studio-bar, .vx-handles, .vx-nudge, .guide-overlay, .dev-tools")) return;
    const el = pickFromEvent(event);
    if (!el) return;
    event.preventDefault();
    event.stopPropagation();
    startInlineEdit(el);
  }

  function startInlineEdit(el) {
    const key = el.dataset.vx;
    const layer = layerByKey(key);
    if (!canEditText(el)) {
      setStatus("этот объект без текста", "bad");
      return;
    }
    let target = el;
    if (el.querySelector(":scope > .vx-label")) target = el.querySelector(":scope > .vx-label");
    else if (layer && layer.kind === "text") target = el;
    else if (el.childElementCount > 0) {
      const field = $("vxText");
      if (field && !field.disabled) field.focus();
      return;
    }
    target.setAttribute("contenteditable", "true");
    target.focus();
    const range = document.createRange();
    range.selectNodeContents(target);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const stop = () => {
      target.removeAttribute("contenteditable");
      const text = readText(target);
      applyTextValue(key, text);
      target.removeEventListener("blur", stop);
    };
    target.addEventListener("blur", stop);
  }

  function applyTextValue(key, text) {
    if (!key) return;
    const layer = layerByKey(key);
    if (layer) {
      layer.text = text;
      const node = findByKey(key);
      if (node && !node.querySelector("img")) node.textContent = text;
    } else {
      const el = findByKey(key);
      if (!el || SKIP_TEXT[el.id]) return;
      ensureItem(key).text = text;
      writeText(el, text);
    }
    const field = $("vxText");
    if (field && document.activeElement !== field) field.value = text;
    const insp = $("vxInspText");
    if (insp && document.activeElement !== insp) insp.value = text;
    markDirty();
  }

  function align(mode) {
    const roots = selectedRoots();
    if (roots.length >= 2) {
      const box = selectionBox();
      const host = card();
      if (!box || !host) return;
      const screen = innerBox();
      const cr = host.getBoundingClientRect();
      const groupCx = box.left + box.width / 2;
      const groupCy = box.top + box.height / 2;
      const targetCx = cr.left + screen.centerX;
      const targetCy = cr.top + screen.centerY;
      let dx = 0;
      let dy = 0;
      if (mode === "center-x" || mode === "center") dx = targetCx - groupCx;
      if (mode === "center-y" || mode === "center") dy = targetCy - groupCy;
      groupSnapshot().forEach((row) => {
        const node = findByKey(row.key);
        const rec = recordOf(row.key);
        if (!node || !rec) return;
        applyVisualRect(node, rec, row.left + dx, row.top + dy, row.vw, row.vh);
      });
      markDirty();
      return;
    }
    selectedRoots().forEach((el) => {
      releaseNested(el);
      const item = recordOf(el.dataset.vx);
      pinFromView(el, item);
      const box = innerBox();
      const oldX = item.x;
      const oldY = item.y;
      if (mode === "center-x" || mode === "center") item.x = Math.round(box.centerX - item.w / 2);
      if (mode === "center-y" || mode === "center") item.y = Math.round(box.centerY - item.h / 2);
      applyItem(el, item);
      followParent(el, item.x - oldX, item.y - oldY);
    });
    markDirty();
  }

  function nudge(dx, dy) {
    if (state.selected.some(isLocked)) {
      setStatus("слой заблокирован", "bad");
      return;
    }
    selectedRoots().forEach((el) => {
      const item = recordOf(el.dataset.vx);
      pinFromView(el, item);
      item.x += dx;
      item.y += dy;
      applyItem(el, item);
      followParent(el, dx, dy);
    });
    markDirty();
  }

  function resize(dw, dh, font) {
    if (state.selected.some(isLocked)) {
      setStatus("слой заблокирован", "bad");
      return;
    }
    const roots = selectedRoots();
    if (roots.length >= 2 && (dw || dh) && !font) {
      const box = selectionBox();
      if (box && box.width > 1 && box.height > 1) {
        const sx = dw ? Math.max(0.15, (box.width + dw) / box.width) : 1;
        const sy = dh ? Math.max(0.15, (box.height + dh) / box.height) : 1;
        const ratio = dw && dh ? Math.max(0.15, Math.min(sx, sy)) : 0;
        const useX = ratio || sx;
        const useY = ratio || sy;
        const ox = box.left + box.width / 2;
        const oy = box.top + box.height / 2;
        groupSnapshot().forEach((row) => {
          const node = findByKey(row.key);
          const rec = recordOf(row.key);
          if (!node || !rec) return;
          rec.fontSize = Math.max(8, Math.round(row.origFont * (ratio || (useX !== 1 ? useX : useY))));
          applyVisualRect(
            node,
            rec,
            ox + (row.left - ox) * useX,
            oy + (row.top - oy) * useY,
            row.vw * useX,
            row.vh * useY
          );
        });
        markDirty();
        return;
      }
    }
    selectedEls().forEach((el) => {
      const item = recordOf(el.dataset.vx);
      pinFromView(el, item);
      if (font) item.fontSize = Math.max(8, item.fontSize + font);
      if (dw || dh) {
        const cx = item.x + item.w / 2;
        const cy = item.y + item.h / 2;
        const ratio = dw ? (item.w + dw) / Math.max(1, item.w) : (item.h + dh) / Math.max(1, item.h);
        if (dw && dh) {
          item.w = Math.max(16, Math.round(item.w * ratio));
          item.h = Math.max(16, Math.round(item.h * ratio));
          item.fontSize = Math.max(8, Math.round(item.fontSize * ratio));
        } else {
          item.w = Math.max(16, item.w + dw);
          item.h = Math.max(16, item.h + dh);
        }
        item.x = Math.round(cx - item.w / 2);
        item.y = Math.round(cy - item.h / 2);
      }
      applyItem(el, item);
    });
    markDirty();
  }

  function applyGap(axis) {
    const field = $("vxGap");
    const gap = Math.max(0, Number(field && field.value) || 0);
    const els = selectedRoots();
    if (els.length < 2) {
      setStatus("выдели несколько блоков", "bad");
      return;
    }
    const horizontal = axis === "row";
    const ordered = els.slice().sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return horizontal ? ra.left - rb.left : ra.top - rb.top;
    });
    let cursor = null;
    ordered.forEach((el, index) => {
      releaseNested(el);
      const rec = recordOf(el.dataset.vx);
      pinFromView(el, rec);
      const r = el.getBoundingClientRect();
      if (index === 0) {
        cursor = { left: r.left, top: r.top, w: r.width, h: r.height };
        applyItem(el, rec);
        return;
      }
      const left = horizontal ? cursor.left + cursor.w + gap : cursor.left;
      const top = horizontal ? cursor.top : cursor.top + cursor.h + gap;
      applyVisualRect(el, rec, left, top, r.width, r.height);
      cursor = { left, top, w: r.width, h: r.height };
    });
    markDirty();
  }

  function applyText() {
    const field = $("vxText");
    if (!field || !state.selected[0] || field.disabled) return;
    applyTextValue(state.selected[0], field.value);
  }

  function resetSelected() {
    state.selected.forEach((key) => {
      if (key.indexOf("layer:") === 0) {
        state.layout.layers = (state.layout.layers || []).filter((row) => layerKey(row.id) !== key);
      } else {
        delete state.layout.items[key];
        stripEl(findByKey(key));
      }
    });
    renderLayers();
    markDirty();
    state.selected = [];
    paintSelection();
    refreshHierarchy();
  }

  function deleteSelected() {
    state.selected.forEach((key) => {
      if (key.indexOf("layer:") === 0) {
        const layer = layerByKey(key);
        if (layer) layer._hidden = true;
      } else if (isPanelKey(key)) {
        const scoped = ensureItem(scopedPanelKey(panelBase(key)));
        targetRecord(scoped).hidden = true;
        scoped.visible = false;
        const el = findByKey(panelBase(key));
        applyItem(el, mergedPanelView(panelBase(key)));
      } else {
        ensureItem(key)._hidden = true;
        const el = findByKey(key);
        if (el) el.style.display = "none";
      }
    });
    renderLayers();
    markDirty();
    state.selected = [];
    paintSelection();
    refreshHierarchy();
  }

  function stackEl(el) {
    if (!el) return null;
    return el.closest("button, a.icon-btn, .class-slot, .save-slot, .mode-tag, .vx-layer, #topTitle, #locationTag, #settingsBtn, #goldHud, #supportBtn, #contactBtn") || el;
  }

  function applyZOnly(el, z) {
    const node = stackEl(el) || el;
    const pos = window.getComputedStyle(node).position;
    if (pos === "static") node.style.position = "relative";
    node.style.zIndex = String(z);
  }

  function changeZ(dir) {
    if (!state.selected[0]) {
      setStatus("выбери элемент в иерархии", "bad");
      return;
    }
    shiftLayer(state.selected[0], dir > 0 ? 1 : -1);
  }

  function toggleLive() {
    const layer = layerByKey(state.selected[0]);
    const box = $("vxLive");
    if (!layer || !box) return;
    layer.interactive = !!box.checked;
    const el = findByKey(state.selected[0]);
    if (el) el.classList.toggle("is-live", layer.interactive);
    markDirty();
  }

  async function uploadFile(file, asCardBg, replaceKey) {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const filename = "vx-" + Date.now() + "." + ext;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const response = await fetch("/dev/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder: "ui", filename, content: String(reader.result || "") }),
        });
        const data = await response.json();
        if (!data.ok) throw new Error(data.log || "upload failed");
        const src = data.path + "?v=" + Date.now();
        const target = replaceKey ? layerByKey(replaceKey) : null;
        if (target && target.kind === "image") {
          target.src = src;
          renderLayers();
          selectKey(replaceKey, false);
        } else if (asCardBg) {
          const host = card();
          const r = host ? host.getBoundingClientRect() : { width: 640, height: 900 };
          addLayer("image", {
            src,
            x: 0, y: 0,
            w: Math.round(r.width), h: Math.round(r.height),
            z: 0,
            screen: editorScreen(),
          });
        } else {
          addLayer("image", { src, w: 180, h: 120 });
        }
        markDirty();
        refreshHierarchy();
        setStatus("файл загружен", "ok");
      } catch (error) {
        setStatus(String(error), "bad");
      }
    };
    reader.readAsDataURL(file);
  }

  function layerDefaults(kind) {
    if (kind === "image") return { text: "", w: 180, h: 120, z: 0 };
    if (kind === "button") return { text: "Кнопка", w: 180, h: 48, z: 3, interactive: true, align: "center", pad: 10 };
    if (kind === "info") return { text: "Информация", w: 220, h: 90, z: 2, pad: 12, align: "left" };
    if (kind === "frame") return { text: "", w: 240, h: 160, z: 1 };
    if (kind === "group") return { text: "", name: "Группа", w: 280, h: 180, z: 1 };
    return { text: "Новая надпись", w: 160, h: 48, z: 2 };
  }

  function addLayer(kind, extra) {
    const parentLayer = layerByKey(state.selected[0]);
    const layer = Object.assign({
      id: "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      kind: kind || "text",
      x: 48,
      y: 96,
      interactive: false,
      src: "",
      screen: editorScreen(),
    }, layerDefaults(kind), extra || {});
    if (!layer.parentId && parentLayer && parentLayer.kind === "group") layer.parentId = parentLayer.id;
    state.layout.layers = state.layout.layers || [];
    state.layout.layers.push(layer);
    renderLayers();
    selectKey(layerKey(layer.id), false);
    markDirty();
    refreshHierarchy();
    if (kind === "text" || kind === "button" || kind === "info") {
      const field = $("vxInspText") || $("vxText");
      if (field) {
        field.disabled = false;
        field.value = layer.text;
        field.focus();
        field.select();
      }
    }
  }

  function pinDirtyItems() {
    stamp();
    Object.keys(state.layout.items || {}).forEach((key) => {
      const item = state.layout.items[key];
      if (!item || item._hidden) return;
      if (isFlowRecord(item, key) || PANEL_BASES[panelBase(key)]) return;
      if (item.x == null && item.y == null && item.w == null && item.h == null) return;
      const el = findByKey(key);
      if (!el) return;
      pinFromView(el, targetRecord(item));
    });
    (state.layout.layers || []).forEach((layer) => {
      if (!layer || layer._hidden) return;
      const el = findByKey(layerKey(layer.id));
      if (el) pinFromView(el, targetRecord(layer));
    });
  }

  function persistableLayout() {
    const toSave = clone(state.layout);
    Object.keys(toSave.items || {}).forEach((key) => {
      const item = toSave.items[key];
      if (!item) {
        delete toSave.items[key];
        return;
      }
      if (item._hidden) {
        if (PANEL_BASES[panelBase(key)] || key.indexOf("screen-bg") === 0) {
          item.hidden = true;
          delete item._hidden;
        } else {
          delete toSave.items[key];
          return;
        }
      }
      delete item.editorHidden;
      delete item.locked;
    });
    toSave.layers = (toSave.layers || []).filter((layer) => layer && !layer._hidden).map((layer) => {
      delete layer.editorHidden;
      delete layer.locked;
      return layer;
    });
    return toSave;
  }

  async function applyLayout() {
    setStatus("сохраняю…", "");
    try {
      ensureScreens();
      pinDirtyItems();
      const toSave = persistableLayout();
      const response = await fetch("/dev/visual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toSave),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.log || "save failed");
      state.layout = clone(toSave);
      state.saved = clone(toSave);
      state.dirty = false;
      applyAll();
      refreshHierarchy();
      setStatus("применено и сохранено", "ok");
    } catch (error) {
      setStatus(String(error), "bad");
    }
  }

  function cancelLayout() {
    if (!state.dirty) {
      setStatus("нет несохранённых правок", "");
      return;
    }
    state.layout = clone(state.saved);
    state.dirty = false;
    state.ghosts = {};
    state.locks = {};
    state.isolate = null;
    stripAll();
    applyAll();
    refreshStudio();
    setStatus("правки отменены", "");
  }

  async function saveLayout() {
    return applyLayout();
  }

  function mergeBuiltinScreens(screens) {
    const list = Array.isArray(screens) ? screens.slice() : [];
    const have = new Set(list.map((row) => row && row.id).filter(Boolean));
    defaultScreens().forEach((row) => {
      if (!have.has(row.id)) list.push(row);
    });
    return list;
  }

  function installLayout(data) {
    const raw = data && data.layout && typeof data.layout === "object" ? data.layout : data;
    state.layout = raw && typeof raw === "object"
      ? {
          items: raw.items && typeof raw.items === "object" ? raw.items : {},
          gaps: raw.gaps && typeof raw.gaps === "object" ? raw.gaps : {},
          layers: Array.isArray(raw.layers) ? raw.layers : [],
          card: raw.card && typeof raw.card === "object" ? raw.card : {},
          screens: mergeBuiltinScreens(raw.screens),
          library: Array.isArray(raw.library) && raw.library.length ? raw.library : defaultLibrary(),
        }
      : emptyLayout();
    state.saved = clone(state.layout);
  }

  function watchViewport() {
    if (state.resizeHook) return;
    state.resizeHook = true;
    window.addEventListener("resize", () => {
      if (state.edit || state.drag) return;
      applyAll();
    });
  }

  function startLiveReload() {
    if (state.liveHook) return;
    const host = location.hostname;
    if (host !== "127.0.0.1" && host !== "localhost") return;
    state.liveHook = true;
    let last = "";
    setInterval(() => {
      if (state.edit || state.drag || state.dirty) return;
      fetch("/dev/watch", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((data) => {
          const stamp = String((data && data.t) || "");
          if (!last) {
            last = stamp;
            return;
          }
          if (stamp && stamp !== last) location.reload();
        })
        .catch(() => {});
    }, 1500);
  }

  function bootPlayer() {
    watchViewport();
    startLiveReload();
    const hasItems = state.layout && state.layout.items && Object.keys(state.layout.items).length;
    const hasBg = state.layout && state.layout.card && state.layout.card.bg;
    if (hasItems || hasBg) {
      applyAll();
      return;
    }
    fetch("visual_layout.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        installLayout(data);
        applyAll();
      })
      .catch(() => {});
  }

  async function loadLayout() {
    try {
      let data = null;
      try {
        const response = await fetch("/dev/visual", { cache: "no-store" });
        if (response.ok) data = await response.json();
      } catch (error) {
        data = null;
      }
      if (!data) {
        const response = await fetch("visual_layout.json", { cache: "no-store" });
        if (response.ok) data = await response.json();
      }
      installLayout(data);
      applyAll();
    } catch (error) {
      state.layout = emptyLayout();
      state.saved = emptyLayout();
    }
  }

  function discardIfNeeded() {
    if (!state.dirty) return;
    state.layout = clone(state.saved);
    state.dirty = false;
    state.ghosts = {};
    state.locks = {};
    state.isolate = null;
    stripAll();
    applyAll();
    setStatus("правки отменены", "");
  }

  function setEdit(on) {
    state.edit = !!on;
    if (state.edit && !state.editScreen) state.editScreen = state.screen || "play";
    document.body.classList.toggle("vx-edit", state.edit);
    const editBtn = $("vxEditBtn");
    const playBtn = $("vxPlayBtn");
    if (editBtn) editBtn.classList.toggle("primary", state.edit);
    if (playBtn) playBtn.classList.toggle("primary", !state.edit);
    syncStudioBody();
    placeHandles();
    if (state.edit) refreshStudio();
  }

  function setOn(on) {
    if (!on && state.on) discardIfNeeded();
    state.on = !!on;
    document.body.classList.toggle("vx-on", state.on);
    const btn = $("visualModeBtn");
    if (btn) btn.textContent = state.on ? "Visual Layout · ON" : "Visual Layout";
    if (state.on) {
      if (!state.editScreen) state.editScreen = state.screen || "play";
      setEdit(true);
      stamp();
      applyAll();
      refreshStudio();
    } else {
      setEdit(false);
      state.selected = [];
      paintSelection();
      applyAll();
    }
    const guide = $("guideOverlay");
    if (state.on && guide) {
      guide.hidden = true;
      guide.classList.remove("is-on");
    }
  }

  function editingField(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
  }

  function onKey(event) {
    if (!state.on || !state.edit) return;
    if (editingField(event.target)) return;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "Escape") {
      event.preventDefault();
      state.selected = [];
      paintSelection();
      return;
    }
    if (event.key === "ArrowLeft") { event.preventDefault(); nudge(-step, 0); }
    if (event.key === "ArrowRight") { event.preventDefault(); nudge(step, 0); }
    if (event.key === "ArrowUp") { event.preventDefault(); nudge(0, -step); }
    if (event.key === "ArrowDown") { event.preventDefault(); nudge(0, step); }
    if (event.key === "[") { event.preventDefault(); resize(-8, 0, 0); }
    if (event.key === "]") { event.preventDefault(); resize(8, 0, 0); }
    if (event.key === "-" || event.key === "_") { event.preventDefault(); resize(-16, -16, 0); }
    if (event.key === "=" || event.key === "+") { event.preventDefault(); resize(16, 16, 0); }
    if (event.key === "h" || event.key === "H") { event.preventDefault(); align("center-x"); }
    if (event.key === "v" || event.key === "V") { event.preventDefault(); align("center-y"); }
    if (event.key === "s" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); applyLayout(); }
    if (event.key === "Delete") { event.preventDefault(); deleteSelected(); }
  }

  function kindLabel(kind) {
    return ({ text: "Надпись", image: "Картинка", button: "Кнопка", info: "Инфо", frame: "Рамка", group: "Группа" })[kind] || kind || "Элемент";
  }

  function shortKey(key) {
    if (!key) return "элемент";
    if (key.indexOf("layer:") === 0) return key.slice(6);
    const parts = String(key).split("/");
    return parts[parts.length - 1] || key;
  }

  function displayName(key, el, rec, layer) {
    const base = panelBase(key);
    if (PANEL_NAMES[base]) return PANEL_NAMES[base];
    if (rec && rec.name) return rec.name;
    if (layer && layer.name) return layer.name;
    if (layer && layer.text) return String(layer.text).trim();
    if (rec && rec.text) return String(rec.text).trim();
    if (el) {
      const text = readText(el);
      if (text) return text.slice(0, 48);
    }
    return layer ? kindLabel(layer.kind) : shortKey(key);
  }

  function collectChromeNodes() {
    const rows = [];
    if (!isLiveChromeScreen()) return rows;
    stamp();
    const host = card();
    if (!host) return rows;
    const walk = (el, parentKey) => {
      if (!el || el.nodeType !== 1) return;
      if (el.closest && el.closest(".vx-dock, .vx-studio, .studio-bar, .vx-handles, .vx-marquee")) return;
      if (el.id === "vxLayerHost") return;
      const key = el.dataset.vx;
      const usable = key && key.indexOf("layer:") !== 0;
      const item = usable ? (state.layout.items[key] || {}) : null;
      if (usable && !(item && item._hidden)) {
        const view = resolvedView(item) || item || {};
        rows.push({
          key,
          parentKey: parentKey || "",
          label: displayName(key, el, item, null),
          kind: "chrome",
          z: view.z != null ? Number(view.z) : readZ(el, item),
          layer: false,
        });
      }
      const nextParent = usable ? key : parentKey;
      Array.from(el.children || []).forEach((child) => walk(child, nextParent));
    };
    Array.from(host.children || []).forEach((child) => walk(child, ""));
    return rows;
  }

  function collectLayerNodes() {
    const screen = editorScreen();
    const rows = [];
    (state.layout.layers || []).forEach((layer) => {
      if (layer._hidden) return;
      if (layer.screen && layer.screen !== "all" && layer.screen !== screen) return;
      const view = resolvedView(layer) || layer;
      rows.push({
        key: layerKey(layer.id),
        parentKey: layer.parentId ? layerKey(layer.parentId) : "",
        label: displayName(layerKey(layer.id), null, layer, layer),
        kind: layer.kind || "text",
        z: view.z != null ? Number(view.z) : (layer.z || 0),
        layer: true,
      });
    });
    return rows;
  }

  function hierarchyNodes() {
    return collectLayerNodes().concat(collectChromeNodes());
  }

  function hierarchyRows() {
    return hierarchyNodes();
  }

  function siblingsOf(key) {
    const rows = hierarchyNodes();
    const self = rows.find((row) => row.key === key);
    const parent = self ? self.parentKey : "";
    return rows.filter((row) => row.parentKey === parent).sort((a, b) => (b.z - a.z) || a.label.localeCompare(b.label, "ru"));
  }

  function descendantsOf(key, rows) {
    const list = rows || hierarchyNodes();
    const found = [key];
    const walk = (parent) => {
      list.forEach((row) => {
        if (row.parentKey === parent && found.indexOf(row.key) < 0) {
          found.push(row.key);
          walk(row.key);
        }
      });
    };
    walk(key);
    return found;
  }

  function ancestorsOf(key, rows) {
    const list = rows || hierarchyNodes();
    const found = [];
    let cur = key;
    const seen = {};
    while (cur && !seen[cur]) {
      seen[cur] = true;
      const row = list.find((item) => item.key === cur);
      if (!row || !row.parentKey) break;
      found.push(row.parentKey);
      cur = row.parentKey;
    }
    return found;
  }

  function toggleGhost(key) {
    if (!key) return;
    if (state.ghosts[key]) delete state.ghosts[key];
    else state.ghosts[key] = true;
    applyEditorChrome();
    refreshHierarchy();
  }

  function toggleLock(key) {
    if (!key) return;
    if (state.locks[key]) delete state.locks[key];
    else state.locks[key] = true;
    applyEditorChrome();
    refreshHierarchy();
  }

  function hideAll() {
    hierarchyNodes().forEach((row) => { state.ghosts[row.key] = true; });
    state.isolate = null;
    applyEditorChrome();
    refreshHierarchy();
  }

  function showAll() {
    state.ghosts = {};
    state.isolate = null;
    applyEditorChrome();
    refreshHierarchy();
  }

  function isolateSelected() {
    const rows = hierarchyNodes();
    const keep = {};
    state.selected.forEach((key) => {
      keep[key] = true;
      descendantsOf(key, rows).forEach((id) => { keep[id] = true; });
      ancestorsOf(key, rows).forEach((id) => { keep[id] = true; });
    });
    if (!Object.keys(keep).length) {
      setStatus("выбери элемент для изоляции", "bad");
      return;
    }
    state.isolate = keep;
    applyEditorChrome();
    refreshHierarchy();
  }

  function shiftLayer(key, dir) {
    const sibs = siblingsOf(key);
    const index = sibs.findIndex((row) => row.key === key);
    if (index < 0) return;
    const swapWith = sibs[index - dir];
    if (!swapWith) return;
    const a = recordOf(key);
    const b = recordOf(swapWith.key);
    if (!a || !b) return;
    const az = a.z != null ? Number(a.z) : sibs[index].z;
    const bz = b.z != null ? Number(b.z) : swapWith.z;
    a.z = bz;
    b.z = az;
    if (a.z === b.z) a.z = (Number(a.z) || 0) + dir;
    const elA = findByKey(key);
    const elB = findByKey(swapWith.key);
    if (elA) applyZOnly(elA, a.z);
    if (elB) applyZOnly(elB, b.z);
    markDirty();
    refreshHierarchy();
    applyEditorChrome();
    setStatus(dir > 0 ? "слой выше" : "слой ниже", "ok");
  }

  function renameElement(key) {
    const raw = rawRecord(key);
    const layer = layerByKey(key);
    const current = (raw && raw.name) || (layer && layer.name) || displayName(key, findByKey(key), raw, layer);
    const next = window.prompt("Имя в иерархии", current || "");
    if (next == null) return;
    const rec = layer || raw;
    if (!rec) return;
    rec.name = String(next).trim();
    markDirty();
    refreshHierarchy();
    refreshInspector(true);
  }

  function duplicateElement(key) {
    const layer = layerByKey(key);
    if (layer) {
      const copies = [];
      const map = {};
      descendantsOf(key).forEach((childKey) => {
        const src = layerByKey(childKey);
        if (!src || src._hidden) return;
        const copy = clone(src);
        copy.id = "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        copy.name = (src.name || src.text || kindLabel(src.kind)) + " копия";
        copy.x = (Number(src.x) || 0) + (childKey === key ? 20 : 0);
        copy.y = (Number(src.y) || 0) + (childKey === key ? 20 : 0);
        map[src.id] = copy.id;
        copies.push({ src, copy });
      });
      copies.forEach((row) => {
        if (row.src.parentId && map[row.src.parentId]) row.copy.parentId = map[row.src.parentId];
        else if (row.src.id === layer.id) row.copy.parentId = layer.parentId;
        state.layout.layers.push(row.copy);
      });
      renderLayers();
      selectKey(layerKey(map[layer.id]), false);
      markDirty();
      refreshHierarchy();
      return;
    }
    const el = findByKey(key);
    const raw = rawRecord(key);
    const view = resolvedView(raw) || {};
    addLayer(isImageItem(el, raw) ? "image" : "button", {
      text: (raw && raw.text) || (el ? readText(el) : "копия"),
      name: displayName(key, el, raw, null) + " копия",
      x: (view.x || 48) + 20,
      y: (view.y || 96) + 20,
      w: view.w || 160,
      h: view.h || 48,
      z: (view.z || 2) + 1,
    });
  }

  function groupSelected() {
    const keys = state.selected.filter((key) => layerByKey(key));
    if (keys.length < 1) {
      setStatus("сгруппировать можно слои из библиотеки", "bad");
      return;
    }
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    keys.forEach((key) => {
      const rec = resolvedView(layerByKey(key)) || {};
      left = Math.min(left, Number(rec.x) || 0);
      top = Math.min(top, Number(rec.y) || 0);
      right = Math.max(right, (Number(rec.x) || 0) + (Number(rec.w) || 0));
      bottom = Math.max(bottom, (Number(rec.y) || 0) + (Number(rec.h) || 0));
    });
    const group = {
      id: "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      kind: "group",
      name: "Группа",
      x: left,
      y: top,
      w: Math.max(40, right - left),
      h: Math.max(40, bottom - top),
      z: 1,
      screen: editorScreen(),
    };
    keys.forEach((key) => {
      const layer = layerByKey(key);
      if (!layer) return;
      layer.parentId = group.id;
      layer.x = (Number(layer.x) || 0) - group.x;
      layer.y = (Number(layer.y) || 0) - group.y;
    });
    state.layout.layers.push(group);
    renderLayers();
    selectKey(layerKey(group.id), false);
    markDirty();
    refreshHierarchy();
  }

  function syncStudioBody() {
    const bp = currentBreak();
    document.body.classList.toggle("vx-custom-screen", !!(state.edit && !isLiveChromeScreen()));
    BREAKS.forEach((name) => {
      document.body.classList.toggle("bp-" + name, bp === name);
      document.documentElement.classList.toggle("bp-" + name, bp === name);
      document.body.classList.toggle("vx-bp-" + name, !!(state.edit && bp === name));
    });
  }

  function switchEditScreen(id) {
    state.editScreen = id || state.screen || "play";
    state.selected = [];
    ensureScreens();
    renderLayers();
    applyAll();
    refreshStudio();
  }

  function nextScreenId() {
    ensureScreens();
    const have = new Set((state.layout.screens || []).map((row) => row && row.id));
    let n = 1;
    while (have.has("screen_custom_" + n)) n += 1;
    return "screen_custom_" + n;
  }

  function createScreen() {
    ensureScreens();
    const id = nextScreenId();
    state.layout.screens.push({ id, name: "Новый экран", builtin: false, logic: "custom" });
    addLayer("text", { text: "Новый экран", x: 48, y: 48, w: 220, h: 40, screen: id });
    markDirty();
    switchEditScreen(id);
  }

  function duplicateScreen(id) {
    ensureScreens();
    const srcId = id || editorScreen();
    const src = screenMeta(srcId);
    const newId = nextScreenId();
    const name = ((src && src.name) || srcId) + " копия";
    state.layout.screens.push({ id: newId, name, builtin: false, logic: "custom" });
    (state.layout.layers || []).forEach((layer) => {
      if (layer._hidden) return;
      if (layer.screen !== srcId) return;
      const copy = clone(layer);
      copy.id = "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      copy.screen = newId;
      copy._hidden = false;
      state.layout.layers.push(copy);
    });
    const bg = state.layout.items["screen-bg:" + srcId];
    if (bg) state.layout.items["screen-bg:" + newId] = clone(bg);
    markDirty();
    switchEditScreen(newId);
  }

  function deleteScreen(id) {
    ensureScreens();
    const target = id || editorScreen();
    const meta = screenMeta(target);
    if (!meta || meta.builtin) {
      setStatus("встроенный экран нельзя удалить", "bad");
      return;
    }
    state.layout.screens = state.layout.screens.filter((row) => row && row.id !== target);
    (state.layout.layers || []).forEach((layer) => {
      if (layer.screen === target) layer._hidden = true;
    });
    delete state.layout.items["screen-bg:" + target];
    markDirty();
    switchEditScreen(state.screen || "play");
  }

  function setBreakpoint(bp) {
    state.breakpoint = BREAKS.indexOf(bp) >= 0 ? bp : "desktop";
    applyAll();
    refreshStudio();
  }

  function fillField(id, value, force) {
    const el = $(id);
    if (!el) return;
    if (!force && document.activeElement === el) return;
    if (el.type === "checkbox") el.checked = !!value;
    else el.value = value == null ? "" : value;
  }

  function highlightHierarchy() {
    document.querySelectorAll(".vx-hier-item").forEach((btn) => {
      btn.classList.toggle("is-on", state.selected.indexOf(btn.getAttribute("data-key")) >= 0);
    });
  }

  function refreshScreenSelect() {
    ensureScreens();
    const sel = $("vxEditScreen");
    if (!sel) return;
    const current = editorScreen();
    sel.innerHTML = (state.layout.screens || []).map((row) => {
      const mark = row.builtin ? "" : " · свой";
      return '<option value="' + row.id + '"' + (row.id === current ? " selected" : "") + ">" + escapeStudio(row.name || row.id) + mark + "</option>";
    }).join("");
    const name = $("vxScreenName");
    const meta = screenMeta(current);
    if (name && document.activeElement !== name) name.value = meta ? (meta.name || "") : "";
    if (name) name.disabled = !!(meta && meta.builtin);
    const del = $("vxDelScreen");
    if (del) del.disabled = !!(meta && meta.builtin);
    const hint = $("vxScreenHint");
    if (hint) {
      const mismatch = !!(meta && meta.builtin && !isLiveChromeScreen());
      hint.hidden = !mismatch;
      hint.textContent = mismatch ? "Откройте этот экран в игре, чтобы править встроенные кнопки и панели. Слои экрана доступны здесь." : "";
    }
    const dock = $("vxScreen");
    if (dock) {
      const keep = dock.value;
      const extras = (state.layout.screens || []).filter((row) => !row.builtin);
      const base = '<option value="">Текущий</option><option value="all">Все</option>' +
        (state.layout.screens || []).filter((row) => row.builtin).map((row) => '<option value="' + row.id + '">' + escapeStudio(row.name) + "</option>").join("") +
        extras.map((row) => '<option value="' + row.id + '">' + escapeStudio(row.name) + "</option>").join("");
      dock.innerHTML = base;
      dock.value = keep;
    }
  }

  function escapeStudio(text) {
    return String(text || "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  }

  function refreshLibrary() {
    ensureScreens();
    const host = $("vxLibrary");
    if (!host) return;
    host.innerHTML = (state.layout.library || defaultLibrary()).map((row) => {
      return '<button type="button" class="vx-lib-item" data-lib="' + row.kind + '"><span>' + (row.icon || "") + "</span><span>" + escapeStudio(row.name) + "</span></button>";
    }).join("");
    host.querySelectorAll("[data-lib]").forEach((btn) => {
      btn.onclick = () => addLayer(btn.getAttribute("data-lib"));
    });
  }

  function refreshHierarchy() {
    const host = $("vxHierarchy");
    if (!host) return;
    const rows = hierarchyNodes();
    if (!rows.length) {
      host.innerHTML = '<div class="vx-hint">На этом экране пока нет элементов. Добавьте из библиотеки.</div>';
      return;
    }
    const kids = {};
    rows.forEach((row) => {
      const parent = row.parentKey || "";
      (kids[parent] = kids[parent] || []).push(row);
    });
    Object.keys(kids).forEach((key) => {
      kids[key].sort((a, b) => (b.z - a.z) || a.label.localeCompare(b.label, "ru"));
    });
    const render = (parent, depth) => {
      return (kids[parent] || []).map((row) => {
        const hasKids = !!(kids[row.key] && kids[row.key].length);
        const closed = !!state.collapsed[row.key];
        const on = state.selected.indexOf(row.key) >= 0 ? " is-on" : "";
        const ghost = isGhost(row.key) ? " is-ghost" : "";
        const lock = isLocked(row.key) ? " is-locked" : "";
        const twirl = hasKids ? (closed ? "▸" : "▾") : "·";
        const html = '<div class="vx-hier-item' + on + ghost + lock + '" data-key="' + escapeStudio(row.key) + '" style="padding-left:' + (6 + depth * 12) + 'px">' +
          '<button type="button" class="vx-hier-tool" data-act="twirl" title="Свернуть">' + twirl + "</button>" +
          '<button type="button" class="vx-hier-tool" data-act="ghost" title="Скрыть в редакторе">' + (isGhost(row.key) ? "🙈" : "👁") + "</button>" +
          '<button type="button" class="vx-hier-tool" data-act="lock" title="Замок">' + (isLocked(row.key) ? "🔒" : "🔓") + "</button>" +
          '<button type="button" class="vx-hier-label" data-act="pick">' + escapeStudio(row.label) + "</button>" +
          '<button type="button" class="vx-hier-tool" data-act="up" title="Выше">↑</button>' +
          '<button type="button" class="vx-hier-tool" data-act="down" title="Ниже">↓</button>' +
          '<button type="button" class="vx-hier-tool" data-act="dup" title="Дублировать">⧉</button>' +
          '<button type="button" class="vx-hier-tool" data-act="ren" title="Переименовать">✏</button>' +
          '<button type="button" class="vx-hier-tool" data-act="del" title="Удалить">🗑</button>' +
          "</div>" + (hasKids && !closed ? render(row.key, depth + 1) : "");
        return html;
      }).join("");
    };
    host.innerHTML = render("", 0);
    if (!host.dataset.bound) {
      host.dataset.bound = "1";
      host.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-act]");
        const row = event.target.closest("[data-key]");
        if (!row) return;
        const key = row.getAttribute("data-key");
        const act = btn ? btn.getAttribute("data-act") : "pick";
        event.preventDefault();
        event.stopPropagation();
        if (act === "twirl") {
          if (state.collapsed[key]) delete state.collapsed[key];
          else state.collapsed[key] = true;
          refreshHierarchy();
          return;
        }
        if (act === "ghost") { toggleGhost(key); return; }
        if (act === "lock") { toggleLock(key); return; }
        if (act === "up") { shiftLayer(key, 1); return; }
        if (act === "down") { shiftLayer(key, -1); return; }
        if (act === "dup") { duplicateElement(key); return; }
        if (act === "ren") { renameElement(key); return; }
        if (act === "del") {
          state.selected = [key];
          deleteSelected();
          return;
        }
        selectKey(key, event.ctrlKey || event.metaKey || event.shiftKey);
      });
    }
  }

  function selectedRaw() {
    const key = state.selected[0];
    if (!key) return null;
    return rawRecord(key);
  }

  function adaptModeOf(raw) {
    const bp = currentBreak();
    if (bp === "desktop") return "desktop";
    if (raw && raw.bp && raw.bp[bp] && raw.bp[bp].hidden) return "hide";
    if (raw && raw.bp && raw.bp[bp]) return "custom";
    return "inherit";
  }

  function applyAdaptMode(mode) {
    const raw = selectedRaw();
    const bp = currentBreak();
    if (!raw || bp === "desktop") return;
    raw.bp = raw.bp || {};
    if (mode === "inherit") {
      delete raw.bp[bp];
    } else if (mode === "hide") {
      raw.bp[bp] = raw.bp[bp] || {};
      raw.bp[bp].hidden = true;
    } else {
      targetRecord(raw);
      if (raw.bp[bp]) raw.bp[bp].hidden = false;
    }
    renderLayers();
    applyAll();
    markDirty();
    refreshHierarchy();
  }

  function refreshInspector(force) {
    const empty = $("vxInspectorEmpty");
    const box = $("vxInspector");
    const key = state.selected[0];
    if (!box || !empty) return;
    if (!key) {
      empty.hidden = false;
      box.hidden = true;
      return;
    }
    empty.hidden = true;
    box.hidden = false;
    const raw = rawRecord(key);
    const view = resolvedView(raw) || {};
    const layer = layerByKey(key);
    const node = findByKey(key);
    const pos = node ? localPoint(node) : null;
    fillField("vxInspX", view.x != null ? view.x : pos && Math.round(pos.x), force);
    fillField("vxInspY", view.y != null ? view.y : pos && Math.round(pos.y), force);
    fillField("vxInspW", view.w != null ? view.w : pos && Math.round(pos.w), force);
    fillField("vxInspH", view.h != null ? view.h : pos && Math.round(pos.h), force);
    fillField("vxInspPad", view.pad, force);
    fillField("vxInspFont", view.fontSize, force);
    fillField("vxInspMargin", view.margin, force);
    fillField("vxInspGap", view.gap, force);
    fillField("vxInspOrder", view.order, force);
    fillField("vxInspCols", view.cols, force);
    fillField("vxInspZ", view.z, force);
    fillField("vxInspDir", view.dir || "", force);
    fillField("vxInspAlign", view.align || "left", force);
    fillField("vxInspJustify", view.justify || "", force);
    fillField("vxInspAlignItems", view.alignItems || "", force);
    fillField("vxInspName", (raw && raw.name) || (layer && layer.name) || "", force);
    fillField("vxInspText", layer ? (layer.text || "") : (raw && raw.text != null ? raw.text : (findByKey(key) ? readText(findByKey(key)) : "")), force);
    fillField("vxInspSrc", layer ? (layer.src || "") : "", force);
    fillField("vxInspVisible", !(view.hidden || (raw && raw._hidden)), force);
    fillField("vxInspCompact", !!view.compact, force);
    const scope = $("vxInspScope");
    if (scope) {
      scope.disabled = !isPanelKey(key);
      if (force || document.activeElement !== scope) scope.value = state.panelScope || "shared";
    }
    const adapt = $("vxInspAdapt");
    if (adapt) {
      adapt.disabled = currentBreak() === "desktop";
      if (force || document.activeElement !== adapt) adapt.value = adaptModeOf(raw);
    }
    const text = $("vxInspText");
    if (text) text.disabled = layer ? layer.kind === "image" : !canEditText(findByKey(key));
    const src = $("vxInspSrc");
    const srcBtn = $("vxInspPick");
    if (src) src.disabled = !layer || layer.kind !== "image";
    if (srcBtn) srcBtn.disabled = !layer || layer.kind !== "image";
    const note = $("vxInspNote");
    if (note) {
      const bp = currentBreak();
      const flow = isFlowRecord(view, key);
      note.textContent = (bp === "desktop"
        ? "Desktop 1440×900 — базовая раскладка. "
        : "Сейчас правите " + bp + ". ") +
        (flow
          ? "Блок в потоке: ширина, отступы и сетка, без свободного перетаскивания."
          : "Слои можно двигать точечно. Контейнеры лучше править через размер и направление.");
    }
  }

  function writeInspNumber(field, key) {
    const raw = selectedRaw();
    const sel = state.selected[0];
    const el = findByKey(sel);
    if (!raw) return;
    const rec = targetRecord(raw);
    const flow = isFlowRecord(raw, sel) || isFlowRecord(rec, sel) || ["w", "h", "pad", "fontSize", "margin", "gap", "order", "cols"].indexOf(key) >= 0;
    if (el && (key === "x" || key === "y") && !flow) {
      if (rec.x == null || rec.y == null) pinFromView(el, rec);
    }
    if (flow && key !== "x" && key !== "y") {
      rec.flow = true;
    }
    const num = field.value === "" ? null : Number(field.value);
    rec[key] = num == null || Number.isNaN(num) ? null : num;
    if (el) applyItem(el, isPanelKey(sel) ? mergedPanelView(panelBase(sel)) : resolvedView(raw));
    else renderLayers();
    markDirty();
    refreshHierarchy();
  }

  function bindStudioEvents() {
    const screenSel = $("vxEditScreen");
    if (screenSel) screenSel.onchange = () => switchEditScreen(screenSel.value);
    const name = $("vxScreenName");
    if (name) name.oninput = () => {
      const meta = screenMeta(editorScreen());
      if (!meta || meta.builtin) return;
      meta.name = name.value || "Экран";
      markDirty();
      refreshScreenSelect();
    };
    const neu = $("vxNewScreen");
    const dup = $("vxDupScreen");
    const del = $("vxDelScreen");
    if (neu) neu.onclick = createScreen;
    if (dup) dup.onclick = () => duplicateScreen(editorScreen());
    if (del) del.onclick = () => deleteScreen(editorScreen());
    const hideAllBtn = $("vxHideAll");
    const showAllBtn = $("vxShowAll");
    const isolateBtn = $("vxIsolate");
    const groupBtn = $("vxGroupSel");
    if (hideAllBtn) hideAllBtn.onclick = hideAll;
    if (showAllBtn) showAllBtn.onclick = showAll;
    if (isolateBtn) isolateBtn.onclick = isolateSelected;
    if (groupBtn) groupBtn.onclick = groupSelected;
    document.querySelectorAll("#vxBreaks [data-bp]").forEach((btn) => {
      btn.onclick = () => setBreakpoint(btn.getAttribute("data-bp"));
    });
    [["vxInspX", "x"], ["vxInspY", "y"], ["vxInspW", "w"], ["vxInspH", "h"], ["vxInspPad", "pad"], ["vxInspZ", "z"], ["vxInspFont", "fontSize"], ["vxInspMargin", "margin"], ["vxInspGap", "gap"], ["vxInspOrder", "order"], ["vxInspCols", "cols"]].forEach((pair) => {
      const field = $(pair[0]);
      if (!field) return;
      field.onchange = () => writeInspNumber(field, pair[1]);
      field.oninput = () => writeInspNumber(field, pair[1]);
    });
    const align = $("vxInspAlign");
    if (align) align.onchange = () => {
      const raw = selectedRaw();
      const el = findByKey(state.selected[0]);
      if (!raw) return;
      targetRecord(raw).align = align.value || "";
      if (el) applyItem(el, resolvedView(raw));
      markDirty();
    };
    [["vxInspDir", "dir"], ["vxInspJustify", "justify"], ["vxInspAlignItems", "alignItems"]].forEach((pair) => {
      const field = $(pair[0]);
      if (!field) return;
      field.onchange = () => {
        const raw = selectedRaw();
        const sel = state.selected[0];
        const el = findByKey(sel);
        if (!raw) return;
        const rec = targetRecord(raw);
        rec[pair[1]] = field.value || "";
        rec.flow = true;
        if (el) applyItem(el, isPanelKey(sel) ? mergedPanelView(panelBase(sel)) : resolvedView(raw));
        markDirty();
      };
    });
    const compact = $("vxInspCompact");
    if (compact) compact.onchange = () => {
      const raw = selectedRaw();
      const sel = state.selected[0];
      if (!raw) return;
      targetRecord(raw).compact = !!compact.checked;
      const el = findByKey(sel);
      if (el) applyItem(el, isPanelKey(sel) ? mergedPanelView(panelBase(sel)) : resolvedView(raw));
      markDirty();
    };
    const scope = $("vxInspScope");
    if (scope) scope.onchange = () => {
      state.panelScope = scope.value === "local" ? "local" : "shared";
      refreshInspector(true);
    };
    const nameField = $("vxInspName");
    if (nameField) nameField.oninput = () => {
      const raw = selectedRaw();
      if (!raw) return;
      raw.name = nameField.value;
      markDirty();
      refreshHierarchy();
    };
    const text = $("vxInspText");
    if (text) text.oninput = () => applyTextValue(state.selected[0], text.value);
    const src = $("vxInspSrc");
    if (src) src.onchange = () => {
      const layer = layerByKey(state.selected[0]);
      if (!layer) return;
      layer.src = src.value;
      renderLayers();
      markDirty();
    };
    const vis = $("vxInspVisible");
    if (vis) vis.onchange = () => {
      const raw = selectedRaw();
      if (!raw) return;
      const rec = targetRecord(raw);
      rec.hidden = !vis.checked;
      rec.visible = !!vis.checked;
      renderLayers();
      applyAll();
      markDirty();
      refreshHierarchy();
    };
    const adapt = $("vxInspAdapt");
    if (adapt) adapt.onchange = () => applyAdaptMode(adapt.value);
    const pick = $("vxInspPick");
    const file = $("vxInspFile");
    if (pick && file) {
      pick.onclick = () => file.click();
      file.onchange = () => {
        const picked = file.files && file.files[0];
        file.value = "";
        const key = state.selected[0];
        if (!picked) return;
        uploadFile(picked, false, key && layerByKey(key) && layerByKey(key).kind === "image" ? key : "");
      };
    }
  }

  function refreshStudio() {
    if (!state.on || !state.edit) return;
    refreshScreenSelect();
    refreshLibrary();
    refreshHierarchy();
    refreshInspector(false);
    document.querySelectorAll("#vxBreaks [data-bp]").forEach((btn) => {
      btn.classList.toggle("is-on", btn.getAttribute("data-bp") === currentBreak());
    });
    syncStudioBody();
  }

  function buildStudioChrome() {
    if ($("vxStudioLeft")) return;
    const left = document.createElement("aside");
    left.id = "vxStudioLeft";
    left.className = "vx-studio vx-studio-col vx-studio-left";
    left.innerHTML =
      "<h3>Экраны</h3>" +
      '<div class="vx-studio-row"><select id="vxEditScreen"></select></div>' +
      '<div class="vx-studio-row">' +
      '<button type="button" id="vxNewScreen">Новый</button>' +
      '<button type="button" id="vxDupScreen">Дублировать</button>' +
      '<button type="button" id="vxDelScreen">Удалить</button></div>' +
      '<div class="vx-studio-row"><input type="text" id="vxScreenName" maxlength="60" placeholder="Название экрана"></div>' +
      '<p id="vxScreenHint" class="vx-hint" hidden></p>' +
      '<h3>Устройство</h3>' +
      '<div class="vx-studio-row vx-bp" id="vxBreaks">' +
      '<button type="button" data-bp="desktop">Desktop 1440</button>' +
      '<button type="button" data-bp="tablet">Tablet 768</button>' +
      '<button type="button" data-bp="mobile">Mobile 390</button></div>' +
      '<p id="vxViewportHint" class="vx-hint">Desktop 1440×900 · Tablet 768×1024 · Mobile 390×844</p>' +
      "<h3>Библиотека</h3><div id=\"vxLibrary\"></div>" +
      "<h3>Иерархия / Слои</h3>" +
      '<div class="vx-studio-row">' +
      '<button type="button" id="vxHideAll">Скрыть все</button>' +
      '<button type="button" id="vxShowAll">Показать все</button>' +
      '<button type="button" id="vxIsolate">Изолировать</button>' +
      '<button type="button" id="vxGroupSel">Группа</button></div>' +
      '<p class="vx-hint">Глаз скрывает только в редакторе. После Apply игровая видимость не меняется.</p>' +
      '<div id="vxHierarchy"></div>';
    const right = document.createElement("aside");
    right.id = "vxStudioRight";
    right.className = "vx-studio vx-studio-col vx-studio-right";
    right.innerHTML =
      "<h3>Инспектор</h3>" +
      '<div id="vxInspectorEmpty" class="vx-hint">Выберите элемент в иерархии или на экране. Иерархия достаёт даже перекрытые объекты.</div>' +
      '<div id="vxInspector" hidden>' +
      '<div class="vx-insp-grid">' +
      '<label>X<input type="number" id="vxInspX"></label>' +
      '<label>Y<input type="number" id="vxInspY"></label>' +
      '<label>Ширина<input type="number" id="vxInspW" min="1"></label>' +
      '<label>Высота<input type="number" id="vxInspH" min="1"></label>' +
      '<label>Текст px<input type="number" id="vxInspFont" min="8"></label>' +
      '<label>Отступ<input type="number" id="vxInspPad" min="0"></label>' +
      '<label>Поля<input type="number" id="vxInspMargin" min="0"></label>' +
      '<label>Зазор<input type="number" id="vxInspGap" min="0"></label>' +
      '<label>Порядок<input type="number" id="vxInspOrder"></label>' +
      '<label>Колонки<input type="number" id="vxInspCols" min="0"></label>' +
      '<label>Слой Z<input type="number" id="vxInspZ"></label>' +
      '<label class="span2">Направление<select id="vxInspDir"><option value="">Как есть</option><option value="row">В ряд</option><option value="column">В столбик</option></select></label>' +
      '<label class="span2">Выравнивание текста<select id="vxInspAlign"><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option></select></label>' +
      '<label class="span2">Выравнивание блока<select id="vxInspJustify"><option value="">Как есть</option><option value="flex-start">К началу</option><option value="center">По центру</option><option value="flex-end">К концу</option><option value="space-between">По краям</option></select></label>' +
      '<label class="span2">Ось поперечная<select id="vxInspAlignItems"><option value="">Как есть</option><option value="flex-start">К началу</option><option value="center">По центру</option><option value="flex-end">К концу</option><option value="stretch">Растянуть</option></select></label>' +
      '<label class="span2">Имя в иерархии<input type="text" id="vxInspName" maxlength="80"></label>' +
      '<label class="span2">Текст<input type="text" id="vxInspText" maxlength="200"></label>' +
      '<label class="span2">Картинка<input type="text" id="vxInspSrc" placeholder="assets/ui/…"></label>' +
      "</div>" +
      '<div class="vx-studio-row"><button type="button" id="vxInspPick">Загрузить картинку</button>' +
      '<input type="file" id="vxInspFile" accept="image/*" hidden></div>' +
      '<label class="vx-studio-check"><input type="checkbox" id="vxInspVisible"> Видно в игре</label>' +
      '<label class="vx-studio-check"><input type="checkbox" id="vxInspCompact"> Компактный Mobile</label>' +
      '<label class="span2">Область панели<select id="vxInspScope"><option value="shared">Общая панель</option><option value="local">Только это меню</option></select></label>' +
      '<label class="span2">Адаптив<select id="vxInspAdapt"><option value="inherit">Как на desktop</option><option value="custom">Своё расположение</option><option value="hide">Скрыть на этом размере</option></select></label>' +
      '<p id="vxInspNote" class="vx-hint"></p></div>';
    document.body.appendChild(left);
    document.body.appendChild(right);
    bindStudioEvents();
  }

  function buildDock() {
    if ($("vxDock")) return;
    const dock = document.createElement("div");
    dock.className = "vx-dock";
    dock.id = "vxDock";
    dock.innerHTML =
      '<div class="vx-dock-row"><b>Visual Layout Mode</b>' +
      '<button type="button" id="vxEditBtn" class="primary">Редактировать</button>' +
      '<button type="button" id="vxPlayBtn">Играть</button>' +
      '<span id="vxStatus" class="vx-status"></span></div>' +
      '<div class="vx-dock-row"><span id="vxSelected">ничего не выбрано</span></div>' +
      '<div class="vx-dock-row">' +
      '<button type="button" id="vxSnapX">Центр по горизонтали</button>' +
      '<button type="button" id="vxSnapY">Центр по вертикали</button>' +
      '<button type="button" id="vxFront">Поверх</button>' +
      '<button type="button" id="vxBack">Ниже</button>' +
      "</div>" +
      '<div class="vx-dock-row">' +
      '<span>Интервал</span><input type="number" id="vxGap" min="0" value="12">' +
      '<button type="button" id="vxGapRow">В ряд</button>' +
      '<button type="button" id="vxGapCol">В столбик</button>' +
      '<button type="button" id="vxSmaller">Меньше</button>' +
      '<button type="button" id="vxBigger">Больше</button>' +
      "</div>" +
      '<div class="vx-dock-row vx-dock-nudge">' +
      '<div class="vx-nudge" id="vxNudge">' +
      '<div class="vx-nudge-title">Сдвиг 1px</div>' +
      '<div class="vx-pad">' +
      '<button type="button" data-nudge-x="-1" data-nudge-y="-1">↖</button>' +
      '<button type="button" data-nudge-x="0" data-nudge-y="-1">↑</button>' +
      '<button type="button" data-nudge-x="1" data-nudge-y="-1">↗</button>' +
      '<button type="button" data-nudge-x="-1" data-nudge-y="0">←</button>' +
      '<span class="vx-nudge-mid"></span>' +
      '<button type="button" data-nudge-x="1" data-nudge-y="0">→</button>' +
      '<button type="button" data-nudge-x="-1" data-nudge-y="1">↙</button>' +
      '<button type="button" data-nudge-x="0" data-nudge-y="1">↓</button>' +
      '<button type="button" data-nudge-x="1" data-nudge-y="1">↘</button>' +
      "</div></div>" +
      '<div class="vx-nudge-scale">' +
      '<div class="vx-nudge-title">Размер</div>' +
      '<button type="button" id="vxNudgeMinus">−</button>' +
      '<button type="button" id="vxNudgePlus">+</button>' +
      "</div>" +
      '<span class="vx-hint">Плюс и минус масштабируют от центра выделения.</span>' +
      "</div>" +
      '<div class="vx-dock-row">' +
      '<span>Текст</span><input type="text" id="vxText" maxlength="120" placeholder="напиши текст выбранного объекта">' +
      "</div>" +
      '<div class="vx-dock-row">' +
      '<button type="button" id="vxAddText">+ Надпись</button>' +
      '<button type="button" id="vxAddImg">+ Картинка</button>' +
      '<button type="button" id="vxAddBg">Фон экрана</button>' +
      '<label class="vx-hint"><input type="checkbox" id="vxLive"> нажимается в игре</label>' +
      '<label class="vx-hint">Экран: <select id="vxScreen"><option value="">Текущий</option><option value="all">Все</option><option value="home">Главное</option><option value="play">Игра</option><option value="class">Класс</option><option value="shop">Магазин</option><option value="achieves">Достижения</option><option value="settings">Настройки</option></select></label>' +
      '<input type="file" id="vxFile" accept="image/*" hidden>' +
      '<button type="button" id="vxDelete">Удалить</button>' +
      '<button type="button" id="vxReset">Сбросить</button>' +
      '<button type="button" id="vxCancel">Отмена</button>' +
      '<button type="button" id="vxSave" class="primary">Сохранить / Apply</button>' +
      "</div>" +
      '<div class="vx-dock-row"><span class="vx-hint">Ctrl или Shift + клик — несколько объектов. Клик внутри рамки двигает всё выделенное. Стрелки в панели — сдвиг на 1px.</span></div>';
    const bar = $("studioBar");
    if (bar && bar.parentNode) bar.parentNode.insertBefore(dock, bar.nextSibling);
    else document.body.insertBefore(dock, document.body.firstChild);

    $("vxEditBtn").onclick = () => setEdit(true);
    $("vxPlayBtn").onclick = () => setEdit(false);
    $("vxGapRow").onclick = () => applyGap("row");
    $("vxGapCol").onclick = () => applyGap("col");
    $("vxDelete").onclick = deleteSelected;
    $("vxReset").onclick = resetSelected;
    $("vxCancel").onclick = cancelLayout;
    $("vxSave").onclick = applyLayout;
    $("vxSmaller").onclick = () => resize(-16, -16, 0);
    $("vxBigger").onclick = () => resize(16, 16, 0);
    $("vxSnapX").onclick = () => align("center-x");
    $("vxSnapY").onclick = () => align("center-y");
    $("vxFront").onclick = () => changeZ(1);
    $("vxBack").onclick = () => changeZ(-1);
    $("vxAddText").onclick = () => addLayer("text");
    $("vxLive").onchange = toggleLive;
    $("vxScreen").onchange = () => {
      const layer = layerByKey(state.selected[0]);
      if (!layer) return;
      layer.screen = $("vxScreen").value || "";
      renderLayers();
      markDirty();
      refreshHierarchy();
    };
    $("vxText").oninput = applyText;
    const file = $("vxFile");
    let asBg = false;
    $("vxAddImg").onclick = () => { asBg = false; file.click(); };
    $("vxAddBg").onclick = () => { asBg = true; file.click(); };
    file.onchange = () => {
      const picked = file.files && file.files[0];
      file.value = "";
      uploadFile(picked, asBg);
    };
    dock.querySelectorAll("[data-nudge-x]").forEach((btn) => {
      btn.onclick = () => {
        if (!state.edit || !state.selected.length) return;
        nudge(Number(btn.getAttribute("data-nudge-x")) || 0, Number(btn.getAttribute("data-nudge-y")) || 0);
      };
    });
    const minusBtn = $("vxNudgeMinus");
    const plusBtn = $("vxNudgePlus");
    if (minusBtn) minusBtn.onclick = () => resize(-16, -16, 0);
    if (plusBtn) plusBtn.onclick = () => resize(16, 16, 0);
    window.addEventListener("resize", placeHandles);
  }

  function afterRender() {
    if (state.drag) return;
    stamp();
    applyAll();
    if (state.edit) refreshHierarchy();
  }

  function setScreen(mode) {
    const prev = state.screen;
    state.screen = mode || "play";
    if (!state.edit) state.editScreen = state.screen;
    if (state.on && prev !== state.screen) {
      renderLayers();
      if (state.edit) refreshStudio();
    }
  }

  function bind() {
    if (state.ready) return;
    state.ready = true;
    ensureOverlay();
    buildDock();
    buildStudioChrome();
    const btn = $("visualModeBtn");
    if (btn) {
      btn.hidden = false;
      btn.onclick = () => setOn(!state.on);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("dblclick", onDblClick, true);
    document.addEventListener("keydown", onKey);
    watchViewport();
    loadLayout();
  }

  root.VisualEditor = {
    afterRender,
    setScreen,
    bind,
    bootPlayer,
    applyAll,
    hasCustomText: (key) => !!(state.layout.items[key] && state.layout.items[key].text != null),
    hasItem: (key) => {
      const item = key === "screen-bg" ? screenBgRecord() : state.layout.items[key];
      return !!(item && (item.x != null || item.y != null || item.w != null || item.h != null || item.flow || item.hidden || item.pad != null));
    },
  };
})(window);
