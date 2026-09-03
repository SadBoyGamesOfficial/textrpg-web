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
  };

  function emptyLayout() {
    return { items: {}, gaps: {}, layers: [], card: {} };
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
        if (el.closest && el.closest(".vx-dock, .studio-bar, .vx-handles, .vx-marquee, .vx-nudge, .guide-overlay, .dev-tools")) return;
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

  function ensureItem(key) {
    if (!state.layout.items[key]) state.layout.items[key] = {};
    return state.layout.items[key];
  }

  function recordOf(key) {
    if (key === "screen-bg") key = "screen-bg:" + (state.screen || "play");
    return layerByKey(key) || ensureItem(key);
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
    const z = parseInt(window.getComputedStyle(el).zIndex, 10);
    return Number.isFinite(z) ? z : 0;
  }

  function canEditText(el) {
    if (!el || SKIP_TEXT[el.id]) return false;
    const layer = layerByKey(el.dataset.vx);
    if (layer && layer.kind === "image") return false;
    return !isImageItem(el, layer || state.layout.items[el.dataset.vx] || {});
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
      const item = layerByKey(key) || state.layout.items[key];
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

  function applyItem(el, item) {
    if (!el || !item) return;
    if (!pinLayoutActive()) {
      if (item.text != null && !SKIP_TEXT[el.id]) writeText(el, item.text);
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
    if (image) styleImageBox(el, item);
    if (item.fontSize != null) el.style.fontSize = item.fontSize + "px";
    if (!image && (isTextItem(el, item) || el.classList.contains("vx-layer"))) el.style.whiteSpace = "nowrap";
    if (item.z != null) {
      if (!el.style.position) el.style.position = "relative";
      el.style.zIndex = String(item.z);
    }
    if (item.text != null && !SKIP_TEXT[el.id]) writeText(el, item.text);
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
    const currentScreen = state.screen || "play";
    (state.layout.layers || []).forEach((layer) => {
      if (layer._hidden) return;
      if (layer.screen && layer.screen !== "all" && layer.screen !== currentScreen) return;
      const node = document.createElement("div");
      node.className = "vx-layer" + (layer.interactive ? " is-live" : "");
      node.dataset.vx = layerKey(layer.id);
      node.style.zIndex = String(layer.z || 1);
      if (layer.kind === "image" && layer.src) {
        const img = document.createElement("img");
        img.src = layer.src;
        img.alt = "";
        img.draggable = false;
        node.appendChild(img);
      } else {
        node.textContent = layer.text || "надпись";
      }
      host.appendChild(node);
      applyItem(node, layer);
    });
  }

  function chromeModes() {
    return ["play", "home", "saves", "class", "achieves", "shop", "settings", "name"];
  }

  function layoutKeyMatchesScreen(key) {
    if (!key || key.indexOf("/") < 0) return true;
    const prefix = key.split("/")[0];
    const modes = chromeModes();
    if (modes.indexOf(prefix) >= 0) return prefix === (state.screen || "play");
    return prefix === screenName() || prefix === (state.screen || "play");
  }

  function screenBgRecord() {
    const items = state.layout.items || {};
    const current = state.screen || "play";
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
      if (!layoutKeyMatchesScreen(key)) return;
      const el = findByKey(key);
      if (!el) return;
      const item = state.layout.items[key];
      if (item && item._hidden) { el.style.display = "none"; return; }
      applyItem(el, item);
    });
    const screenItem = screenBgRecord();
    const bg = document.querySelector('[data-vx="screen-bg"]');
    if (
      state.edit &&
      bg &&
      screenItem &&
      (screenItem.x != null || screenItem.w != null || screenItem.y != null || screenItem.h != null)
    ) {
      applyItem(bg, screenItem);
    } else if (typeof root.placeScreenBg === "function") {
      root.placeScreenBg();
    }
    centerMenuGroup();
    paintSelection();
  }

  function centerMenuGroup() {
    if (!pinLayoutActive()) return;
    const box = $("actions");
    if (!box || !box.classList.contains("menu-spread")) return;
    const buttons = Array.from(box.querySelectorAll("button")).filter((el) => el.dataset.vx);
    if (buttons.length < 1) return;
    const pinned = buttons.filter((el) => {
      const item = state.layout.items[el.dataset.vx];
      return item && item.y != null;
    });
    if (!pinned.length) return;
    const host = card();
    if (!host) return;
    const screen = innerBox();
    const cr = host.getBoundingClientRect();
    let top = Infinity;
    let bottom = -Infinity;
    pinned.forEach((el) => {
      const r = el.getBoundingClientRect();
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
    });
    const groupH = bottom - top;
    const target = cr.top + screen.centerY;
    const current = top + groupH / 2;
    const dy = Math.round(target - current);
    if (!dy) return;
    pinned.forEach((el) => {
      const item = recordOf(el.dataset.vx);
      if (item.y == null) return;
      applyItem(el, Object.assign({}, item, { y: item.y + dy }));
    });
  }

  function markDirty() {
    state.dirty = true;
    setStatus("не сохранено", "");
    placeHandles();
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
    paintSelection();
  }

  function isEmptyHost(el) {
    if (!el) return true;
    if (el === card() || el.id === "vxLayerHost") return true;
    if (el.id === "log" || el.id === "actions" || el.id === "topbar" || el.id === "topbar-end" || el.id === "topbarStart") return true;
    return el.classList.contains("class-board") ||
      el.classList.contains("save-board") ||
      el.classList.contains("topbar-end") ||
      el.classList.contains("topbar-start") ||
      el.classList.contains("vx-layer-host") ||
      el.classList.contains("entry");
  }

  function pickFromEvent(event) {
    if (event.target.closest(".vx-dock, .studio-bar, .vx-handles, .vx-marquee, .vx-nudge, .guide-overlay, .dev-tools")) return null;
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
    pinFromView(el, item);
    applyItem(el, item);
    state.drag = {
      type: "resize",
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
    if (event.target.closest(".vx-dock, .studio-bar, .vx-nudge, .guide-overlay, .dev-tools")) return;
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
    } else if (state.drag.type === "resize") {
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
      item.x = Math.round(x);
      item.y = Math.round(y);
      item.w = Math.max(16, Math.round(w));
      item.h = Math.max(16, Math.round(h));
      applyItem(el, item);
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
  }

  function onClickCapture(event) {
    if (!state.on || !state.edit) return;
    if (event.target.closest(".vx-dock, .studio-bar, .vx-handles, .vx-nudge, .guide-overlay, .dev-tools")) return;
    if (event.target.closest("[contenteditable='true']")) return;
    const host = visualRoot(event.target);
    if (host && host.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function onDblClick(event) {
    if (!state.on || !state.edit) return;
    if (event.target.closest(".vx-dock, .studio-bar, .vx-handles, .vx-nudge, .guide-overlay, .dev-tools")) return;
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
  }

  function deleteSelected() {
    state.selected.forEach((key) => {
      if (key.indexOf("layer:") === 0) {
        const layer = layerByKey(key);
        if (layer) layer._hidden = true;
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
    const first = findByKey(state.selected[0]);
    const second = findByKey(state.selected[1]);
    if (!first || !second) {
      setStatus("выбери два объекта: сначала тот, что выше/ниже, потом относительно чего", "bad");
      return;
    }
    const subject = recordOf(first.dataset.vx);
    const ref = recordOf(second.dataset.vx);
    let az;
    let bz;
    if (dir > 0) {
      bz = 6;
      az = 12;
    } else {
      az = 1;
      bz = 8;
    }
    subject.z = az;
    ref.z = bz;
    applyZOnly(first, az);
    applyZOnly(second, bz);
    markDirty();
    setStatus(dir > 0 ? "первый поверх второго — только в пересечении" : "первый ниже второго — только в пересечении", "ok");
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

  async function uploadFile(file, asCardBg) {
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
        if (asCardBg) {
          const host = card();
          const r = host ? host.getBoundingClientRect() : { width: 640, height: 900 };
          addLayer("image", {
            src,
            x: 0, y: 0,
            w: Math.round(r.width), h: Math.round(r.height),
            z: 0,
            screen: state.screen || "play",
          });
        } else {
          addLayer("image", { src, w: 180, h: 120 });
        }
        markDirty();
        setStatus("файл загружен", "ok");
      } catch (error) {
        setStatus(String(error), "bad");
      }
    };
    reader.readAsDataURL(file);
  }

  function addLayer(kind, extra) {
    const layer = Object.assign({
      id: "l" + Date.now(),
      kind: kind || "text",
      x: 48,
      y: 96,
      w: 160,
      h: 48,
      z: kind === "image" ? 0 : 1,
      interactive: false,
      text: kind === "text" ? "Новая надпись" : "",
      src: "",
      screen: state.screen || "play",
    }, extra || {});
    state.layout.layers = state.layout.layers || [];
    state.layout.layers.push(layer);
    renderLayers();
    selectKey(layerKey(layer.id), false);
    markDirty();
    if (kind === "text") {
      const field = $("vxText");
      if (field) {
        field.disabled = false;
        field.value = layer.text;
        field.focus();
        field.select();
      }
    }
  }

  async function saveLayout() {
    setStatus("сохраняю…", "");
    try {
      const toSave = clone(state.layout);
      Object.keys(toSave.items || {}).forEach((key) => {
        if (toSave.items[key] && toSave.items[key]._hidden) delete toSave.items[key];
      });
      toSave.layers = (toSave.layers || []).filter((l) => !l._hidden);
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
      setStatus("сохранено в тестовую версию", "ok");
    } catch (error) {
      setStatus(String(error), "bad");
    }
  }

  function installLayout(data) {
    const raw = data && data.layout && typeof data.layout === "object" ? data.layout : data;
    state.layout = raw && typeof raw === "object"
      ? {
          items: raw.items && typeof raw.items === "object" ? raw.items : {},
          gaps: raw.gaps && typeof raw.gaps === "object" ? raw.gaps : {},
          layers: Array.isArray(raw.layers) ? raw.layers : [],
          card: raw.card && typeof raw.card === "object" ? raw.card : {},
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

  function bootPlayer() {
    watchViewport();
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
    stripAll();
    applyAll();
    setStatus("правки отменены", "");
  }

  function setEdit(on) {
    state.edit = !!on;
    document.body.classList.toggle("vx-edit", state.edit);
    const editBtn = $("vxEditBtn");
    const playBtn = $("vxPlayBtn");
    if (editBtn) editBtn.classList.toggle("primary", state.edit);
    if (playBtn) playBtn.classList.toggle("primary", !state.edit);
    placeHandles();
  }

  function setOn(on) {
    if (!on && state.on) discardIfNeeded();
    state.on = !!on;
    document.body.classList.toggle("vx-on", state.on);
    const btn = $("visualModeBtn");
    if (btn) btn.textContent = state.on ? "Visual mode · ON" : "Visual mode";
    if (state.on) {
      setEdit(true);
      stamp();
      applyAll();
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
    if (event.key === "s" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); saveLayout(); }
    if (event.key === "Delete") { event.preventDefault(); resetSelected(); }
  }

  function buildDock() {
    if ($("vxDock")) return;
    const dock = document.createElement("div");
    dock.className = "vx-dock";
    dock.id = "vxDock";
    dock.innerHTML =
      '<div class="vx-dock-row"><b>Visual mode</b>' +
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
      '<button type="button" id="vxSave" class="primary">Сохранить</button>' +
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
    $("vxSave").onclick = saveLayout;
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
  }

  function setScreen(mode) {
    const prev = state.screen;
    state.screen = mode || "play";
    if (state.on && prev !== state.screen) renderLayers();
  }

  function bind() {
    if (state.ready) return;
    state.ready = true;
    ensureOverlay();
    buildDock();
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
      return !!(item && (item.x != null || item.y != null || item.w != null || item.h != null));
    },
  };
})(window);
