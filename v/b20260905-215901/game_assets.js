(function (root) {
  const ROLES = [
    { id: "portrait", label: "Портрет", hint: "Большой кадр героя или врага" },
    { id: "thumbnail", label: "Миниатюра", hint: "Сжатый вид в списках и компактном бою" },
    { id: "icon", label: "Иконка", hint: "Маленький знак в инвентаре и магазине" },
    { id: "background", label: "Фон", hint: "Задник экрана или локации" },
    { id: "illustration", label: "Иллюстрация", hint: "Сюжет, события, история" },
    { id: "card", label: "Карточка", hint: "Плитка предмета или героя" },
    { id: "combat", label: "Бой", hint: "Кадр именно для боя" },
    { id: "banner", label: "Баннер", hint: "Широкая шапка" },
    { id: "avatar", label: "Аватар", hint: "Круглый или квадратный портрет" },
  ];

  const KINDS = [
    { id: "image", label: "Картинка" },
    { id: "audio", label: "Звук" },
    { id: "video", label: "Видео" },
    { id: "other", label: "Другое" },
  ];

  const FITS = [
    { id: "contain", label: "Вписать" },
    { id: "cover", label: "Обрезать по рамке" },
    { id: "fill", label: "Растянуть" },
    { id: "none", label: "Как есть" },
    { id: "scale-down", label: "Уменьшить при нужде" },
  ];

  const ALIGN = [
    { id: "top-left", x: 0, y: 0, label: "↖" },
    { id: "top", x: 50, y: 0, label: "↑" },
    { id: "top-right", x: 100, y: 0, label: "↗" },
    { id: "left", x: 0, y: 50, label: "←" },
    { id: "center", x: 50, y: 50, label: "●" },
    { id: "right", x: 100, y: 50, label: "→" },
    { id: "bottom-left", x: 0, y: 100, label: "↙" },
    { id: "bottom", x: 50, y: 100, label: "↓" },
    { id: "bottom-right", x: 100, y: 100, label: "↘" },
  ];

  const ROLE_DEFAULTS = {
    portrait: { fit: "contain", scale: 1, x: 50, y: 50, width: 0, height: 0, cropX: 0, cropY: 0, cropW: 100, cropH: 100 },
    thumbnail: { fit: "cover", scale: 1, x: 50, y: 50, width: 96, height: 96, cropX: 0, cropY: 0, cropW: 100, cropH: 100 },
    icon: { fit: "cover", scale: 1, x: 50, y: 50, width: 40, height: 40, cropX: 0, cropY: 0, cropW: 100, cropH: 100 },
    background: { fit: "cover", scale: 1, x: 50, y: 50, width: 0, height: 0, cropX: 0, cropY: 0, cropW: 100, cropH: 100 },
    illustration: { fit: "contain", scale: 1, x: 50, y: 50, width: 0, height: 0, cropX: 0, cropY: 0, cropW: 100, cropH: 100 },
    card: { fit: "cover", scale: 1, x: 50, y: 50, width: 120, height: 120, cropX: 0, cropY: 0, cropW: 100, cropH: 100 },
    combat: { fit: "contain", scale: 1, x: 50, y: 50, width: 0, height: 0, cropX: 0, cropY: 0, cropW: 100, cropH: 100 },
    banner: { fit: "cover", scale: 1, x: 50, y: 40, width: 0, height: 120, cropX: 0, cropY: 0, cropW: 100, cropH: 100 },
    avatar: { fit: "cover", scale: 1, x: 50, y: 20, width: 64, height: 64, cropX: 0, cropY: 0, cropW: 100, cropH: 100 },
  };

  const DISPLAY_KEYS = ["fit", "scale", "x", "y", "width", "height", "cropX", "cropY", "cropW", "cropH"];
  const IMAGE_EXTS = { ".png": 1, ".jpg": 1, ".jpeg": 1, ".gif": 1, ".webp": 1, ".svg": 1 };
  const AUDIO_EXTS = { ".mp3": 1, ".ogg": 1, ".wav": 1 };
  const VIDEO_EXTS = { ".webm": 1, ".mp4": 1 };
  const ART_LISTS = [
    { kind: "class", list: "classes" },
    { kind: "enemy", list: "enemies" },
    { kind: "item", list: "items" },
    { kind: "location", list: "locations" },
    { kind: "event", list: "events" },
    { kind: "achievement", list: "achievements" },
  ];
  const FALLBACK = {
    portrait: ["illustration", "combat"],
    thumbnail: ["portrait", "card", "icon"],
    icon: ["thumbnail", "avatar", "card"],
    background: ["illustration", "banner"],
    illustration: ["portrait", "banner"],
    card: ["thumbnail", "portrait"],
    combat: ["portrait", "illustration"],
    banner: ["background", "illustration"],
    avatar: ["icon", "thumbnail", "portrait"],
  };

  function list(data) {
    if (!data) return [];
    if (!Array.isArray(data.assets)) data.assets = [];
    return data.assets;
  }

  function roleMeta(role) {
    return ROLES.find((row) => row.id === role) || ROLES[0];
  }

  function kindFromName(name) {
    const ext = suffix(name);
    if (IMAGE_EXTS[ext]) return "image";
    if (AUDIO_EXTS[ext]) return "audio";
    if (VIDEO_EXTS[ext]) return "video";
    return "other";
  }

  function suffix(name) {
    const match = String(name || "").toLowerCase().match(/\.[a-z0-9]+$/);
    return match ? match[0] : "";
  }

  function basename(path) {
    const clean = String(path || "").split("?")[0].replace(/\\/g, "/");
    const parts = clean.split("/");
    return parts[parts.length - 1] || "";
  }

  function stem(path) {
    return basename(path).replace(/\.[^.]+$/, "");
  }

  function cleanPath(path) {
    return String(path || "").split("?")[0].trim().replace(/\\/g, "/");
  }

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  function emptyDisplay(role) {
    const base = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.portrait;
    return {
      fit: base.fit,
      scale: base.scale,
      x: base.x,
      y: base.y,
      width: base.width,
      height: base.height,
      cropX: base.cropX,
      cropY: base.cropY,
      cropW: base.cropW,
      cropH: base.cropH,
    };
  }

  function pickDisplay(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    DISPLAY_KEYS.forEach((key) => {
      if (raw[key] == null || raw[key] === "") return;
      out[key] = raw[key];
    });
    return out;
  }

  function sanitizeDisplay(raw, role) {
    const fallback = emptyDisplay(role);
    const src = raw && typeof raw === "object" ? raw : {};
    const fit = FITS.some((row) => row.id === src.fit) ? src.fit : fallback.fit;
    return {
      fit,
      scale: clamp(src.scale == null ? fallback.scale : src.scale, 0.1, 4),
      x: clamp(src.x == null ? fallback.x : src.x, 0, 100),
      y: clamp(src.y == null ? fallback.y : src.y, 0, 100),
      width: Math.max(0, Math.round(Number(src.width == null ? fallback.width : src.width) || 0)),
      height: Math.max(0, Math.round(Number(src.height == null ? fallback.height : src.height) || 0)),
      cropX: clamp(src.cropX == null ? fallback.cropX : src.cropX, 0, 100),
      cropY: clamp(src.cropY == null ? fallback.cropY : src.cropY, 0, 100),
      cropW: clamp(src.cropW == null ? fallback.cropW : src.cropW, 1, 100),
      cropH: clamp(src.cropH == null ? fallback.cropH : src.cropH, 1, 100),
    };
  }

  function mergeDisplay(role, layers) {
    let next = emptyDisplay(role);
    (layers || []).forEach((layer) => {
      next = Object.assign(next, pickDisplay(layer));
    });
    return sanitizeDisplay(next, role);
  }

  function takenIds(data) {
    const taken = Object.create(null);
    list(data).forEach((asset) => {
      if (asset && asset.id) taken[String(asset.id)] = true;
    });
    return taken;
  }

  function makeId(data, hint) {
    const taken = takenIds(data);
    let base = String(hint || "").replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (!base) base = "art_" + Date.now().toString(16);
    if (!/^art_/.test(base)) base = "art_" + base;
    let id = base.slice(0, 72);
    let n = 2;
    while (taken[id]) {
      id = base.slice(0, 60) + "_" + n;
      n += 1;
    }
    return id;
  }

  function find(data, id) {
    if (!id) return null;
    return list(data).find((asset) => asset && asset.id === id) || null;
  }

  function findByPath(data, path) {
    const clean = cleanPath(path);
    if (!clean) return null;
    return list(data).find((asset) => asset && cleanPath(asset.path) === clean) || null;
  }

  function srcOf(asset, extraRev) {
    if (!asset) return "";
    if (asset._preview) return asset._preview;
    const path = cleanPath(asset.path);
    if (!path) return "";
    const rev = asset.rev || extraRev || "";
    return rev ? path + "?v=" + encodeURIComponent(rev) : path;
  }

  function legacySrc(entity, extraRev) {
    if (!entity) return "";
    if (entity._preview) return entity._preview;
    const path = cleanPath(entity.image);
    if (!path) return "";
    if (path.indexOf("data:") === 0) return path;
    const rev = entity.imageRev || extraRev || "";
    return rev ? path + "?v=" + encodeURIComponent(rev) : path;
  }

  function artOf(entity) {
    if (!entity || typeof entity !== "object") return null;
    if (!entity.art || typeof entity.art !== "object") entity.art = {};
    return entity.art;
  }

  function slotOf(entity, role) {
    const art = entity && entity.art;
    if (!art || typeof art !== "object") return null;
    const slot = art[role];
    return slot && typeof slot === "object" ? slot : null;
  }

  function walkArt(data, fn) {
    ART_LISTS.forEach((meta) => {
      (data && data[meta.list] || []).forEach((entity, index) => {
        if (!entity || typeof entity !== "object") return;
        fn(meta.kind, entity, index);
      });
    });
  }

  function ensure(data) {
    if (!data || typeof data !== "object") return data;
    list(data);
    const seen = Object.create(null);
    list(data).forEach((asset, index) => {
      if (!asset || typeof asset !== "object") return;
      if (!asset.id) asset.id = makeId(data, "art_" + index);
      if (seen[asset.id]) asset.id = makeId(data, asset.id);
      seen[asset.id] = true;
      asset.name = asset.name || stem(asset.path) || asset.id;
      asset.kind = asset.kind || kindFromName(asset.path || asset.name);
      asset.path = cleanPath(asset.path);
      asset.originalName = asset.originalName || basename(asset.path);
      if (!asset.views || typeof asset.views !== "object") asset.views = {};
    });
    walkArt(data, (kind, entity) => {
      const path = cleanPath(entity.image);
      if (!path || path.indexOf("data:") === 0) return;
      let asset = findByPath(data, path);
      if (!asset) {
        asset = {
          id: makeId(data, "art_" + stem(path)),
          name: entity.name || entity.key || stem(path),
          kind: kindFromName(path),
          path,
          originalName: basename(path),
          rev: entity.imageRev || data.assetRev || "",
          views: {},
        };
        list(data).push(asset);
      }
      const art = artOf(entity);
      if (!art.portrait) art.portrait = { assetId: asset.id };
    });
    return data;
  }

  function create(data, info) {
    ensure(data);
    info = info || {};
    const original = info.originalName || info.name || "file.png";
    const ext = suffix(original) || suffix(info.path) || ".png";
    const id = makeId(data, info.idHint || stem(original));
    const filename = info.filename || (id + ext);
    const folder = info.folder || "library";
    const asset = {
      id,
      name: String(info.name || stem(original) || "Новый ресурс").trim() || "Новый ресурс",
      kind: info.kind || kindFromName(original),
      path: info.path || ("asset/" + folder + "/" + filename),
      originalName: original,
      rev: String(info.rev || Date.now()),
      views: {},
    };
    if (info.preview) asset._preview = info.preview;
    list(data).push(asset);
    return asset;
  }

  function rename(data, id, name) {
    const asset = find(data, id);
    if (!asset) return null;
    asset.name = String(name || "").trim() || asset.name;
    return asset;
  }

  function replaceFile(data, id, info) {
    const asset = find(data, id);
    if (!asset) return null;
    info = info || {};
    const original = info.originalName || info.name || basename(asset.path);
    const ext = suffix(original) || suffix(asset.path) || ".png";
    const folder = (cleanPath(asset.path).split("/")[1] || "library");
    const filename = asset.id + ext;
    const oldPath = cleanPath(asset.path);
    asset.path = "asset/" + folder + "/" + filename;
    asset.kind = kindFromName(original);
    asset.originalName = original;
    asset.rev = String(info.rev || Date.now());
    if (info.preview) asset._preview = info.preview;
    walkArt(data, (kind, entity) => {
      if (cleanPath(entity.image) === oldPath) {
        entity.image = asset.path;
        entity.imageRev = asset.rev;
      }
    });
    return { asset, oldPath, filename, folder };
  }

  function incoming(data, id) {
    const rows = [];
    if (!id) return rows;
    walkArt(data, (kind, entity) => {
      const art = entity.art;
      if (art && typeof art === "object") {
        Object.keys(art).forEach((role) => {
          const slot = art[role];
          if (slot && slot.assetId === id) {
            rows.push({
              kind,
              id: entity.id,
              name: entity.name || entity.key || entity.id,
              role,
              field: "art." + role,
            });
          }
        });
      }
      const linked = findByPath(data, entity.image);
      if (linked && linked.id === id && !rows.some((row) => row.kind === kind && row.id === entity.id)) {
        rows.push({
          kind,
          id: entity.id,
          name: entity.name || entity.key || entity.id,
          role: "portrait",
          field: "image",
        });
      }
    });
    return rows;
  }

  function clearSlot(entity, role) {
    if (!entity || !entity.art) return;
    delete entity.art[role];
  }

  function assign(data, entity, role, assetId, display) {
    if (!entity) return null;
    const art = artOf(entity);
    if (!assetId) {
      delete art[role];
      if (role === "portrait") {
        entity.image = "";
        delete entity.imageRev;
      }
      return null;
    }
    const slot = Object.assign({ assetId: assetId }, pickDisplay(display));
    art[role] = slot;
    if (role === "portrait") {
      const asset = find(data, assetId);
      if (asset) {
        entity.image = cleanPath(asset.path);
        entity.imageRev = asset.rev || entity.imageRev;
        if (asset._preview) entity._preview = asset._preview;
      }
    }
    return slot;
  }

  function setSlotDisplay(entity, role, display) {
    if (!entity) return null;
    const art = artOf(entity);
    const prev = slotOf(entity, role) || {};
    if (!prev.assetId && !display) {
      delete art[role];
      return null;
    }
    art[role] = Object.assign({ assetId: prev.assetId || "" }, pickDisplay(display));
    return art[role];
  }

  function setAssetView(asset, role, display) {
    if (!asset) return null;
    if (!asset.views || typeof asset.views !== "object") asset.views = {};
    asset.views[role] = pickDisplay(display);
    return asset.views[role];
  }

  function remove(data, id) {
    const asset = find(data, id);
    if (!asset) return { ok: false };
    const path = cleanPath(asset.path);
    walkArt(data, (kind, entity) => {
      if (entity.art && typeof entity.art === "object") {
        Object.keys(entity.art).forEach((role) => {
          const slot = entity.art[role];
          if (slot && slot.assetId === id) delete entity.art[role];
        });
      }
      if (cleanPath(entity.image) === path) {
        entity.image = "";
        delete entity.imageRev;
        delete entity._preview;
      }
    });
    data.assets = list(data).filter((row) => row && row.id !== id);
    return { ok: true, asset, path };
  }

  function syncLegacy(data) {
    walkArt(data, (kind, entity) => {
      const slot = slotOf(entity, "portrait");
      const asset = slot && slot.assetId ? find(data, slot.assetId) : null;
      if (asset) {
        entity.image = cleanPath(asset.path);
        if (asset.rev) entity.imageRev = asset.rev;
      }
    });
    return data;
  }

  function stripRuntime(data) {
    list(data).forEach((asset) => {
      if (asset) delete asset._preview;
    });
    walkArt(data, (kind, entity) => {
      if (entity) {
        delete entity._preview;
        if (entity.image) entity.image = cleanPath(entity.image);
      }
    });
    return data;
  }

  function resolve(data, entity, role, options) {
    const wanted = [role].concat((options && options.fallback) || FALLBACK[role] || []);
    let slot = null;
    let usedRole = role;
    let asset = null;
    for (let i = 0; i < wanted.length; i += 1) {
      const tryRole = wanted[i];
      const trySlot = slotOf(entity, tryRole);
      if (trySlot && trySlot.assetId) {
        const found = find(data, trySlot.assetId);
        if (found) {
          slot = trySlot;
          usedRole = tryRole;
          asset = found;
          break;
        }
      }
    }
    if (!asset && entity) {
      const path = cleanPath(entity.image);
      if (path) asset = findByPath(data, path);
    }
    const src = asset
      ? srcOf(asset, data && data.assetRev)
      : legacySrc(entity, data && data.assetRev);
    if (!src) {
      return { src: "", asset: null, slot: null, role: usedRole, display: emptyDisplay(role), missing: !!(slot && slot.assetId) };
    }
    const display = mergeDisplay(role, [
      ROLE_DEFAULTS[role],
      asset && asset.views && asset.views[role],
      usedRole !== role && asset && asset.views && asset.views[usedRole],
      slot,
    ]);
    return {
      src,
      asset,
      slot,
      role: usedRole,
      display,
      missing: false,
      kind: asset ? asset.kind : kindFromName(src),
    };
  }

  function isCropped(display) {
    const d = sanitizeDisplay(display);
    return d.cropX > 0 || d.cropY > 0 || d.cropW < 100 || d.cropH < 100;
  }

  function cssMap(style) {
    return Object.keys(style).filter((key) => style[key] !== "" && style[key] != null).map((key) => {
      const prop = key.replace(/[A-Z]/g, (ch) => "-" + ch.toLowerCase());
      return prop + ":" + style[key];
    }).join(";");
  }

  function frameCss(display, options) {
    const d = sanitizeDisplay(display);
    const style = { overflow: "hidden", position: "relative" };
    if (d.width > 0) style.width = d.width + "px";
    if (d.height > 0) style.height = d.height + "px";
    if (options && options.fill) {
      if (!style.width) style.width = "100%";
      if (!style.height) style.height = "100%";
    }
    return style;
  }

  function imageCss(display) {
    const d = sanitizeDisplay(display);
    const cropped = isCropped(d);
    const style = {
      display: "block",
      transform: d.scale !== 1 ? "scale(" + d.scale + ")" : "",
      transformOrigin: d.x + "% " + d.y + "%",
    };
    if (cropped) {
      style.position = "absolute";
      style.left = (-d.cropX / d.cropW * 100) + "%";
      style.top = (-d.cropY / d.cropH * 100) + "%";
      style.width = (100 / d.cropW * 100) + "%";
      style.height = (100 / d.cropH * 100) + "%";
      style.maxWidth = "none";
      style.maxHeight = "none";
      style.objectFit = "fill";
    } else {
      style.width = "100%";
      style.height = "100%";
      style.objectFit = d.fit;
      style.objectPosition = d.x + "% " + d.y + "%";
    }
    return style;
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text).replace(/[&<>"]/g, (char) => {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char];
    });
  }

  function imgHtml(src, display, className, extraStyle) {
    const d = sanitizeDisplay(display);
    const frame = frameCss(d);
    const img = imageCss(d);
    if (extraStyle) Object.assign(frame, extraStyle.frame || {});
    if (extraStyle && extraStyle.img) Object.assign(img, extraStyle.img);
    if (!frame.height && !frame.width) {
      img.height = "auto";
      img.maxHeight = "100%";
    }
    return (
      '<div class="ga-frame ' + (className || "") + '" style="' + cssMap(frame) + '">' +
      '<img class="ga-img" src="' + escapeHtml(src) + '" alt="" style="' + cssMap(img) + '">' +
      "</div>"
    );
  }

  function stageHtml(data, entity, roles, options) {
    const listRoles = Array.isArray(roles) ? roles : [roles || "portrait"];
    const primary = listRoles[0] || "portrait";
    const resolved = resolve(data, entity, primary, { fallback: listRoles.slice(1) });
    if (!resolved.src) return "";
    const compact = options && options.compact;
    const display = resolved.display;
    const frame = frameCss(display);
    const img = imageCss(display);
    if (!display.width && !display.height) {
      delete frame.width;
      delete frame.height;
      img.width = "auto";
      img.height = "auto";
      img.maxWidth = "100%";
      img.maxHeight = compact ? "min(28vh, 220px)" : "min(58vh, calc(100dvh - 280px))";
    }
    const cls = "stage-art ga-frame" + (compact ? " compact" : "");
    return (
      '<div class="' + cls + '" data-vx="stage-panel" style="' + cssMap(frame) + '">' +
      '<img class="portrait ga-img" src="' + escapeHtml(resolved.src) + '" alt="" style="' + cssMap(img) + '">' +
      "</div>"
    );
  }

  function glyphHtml(data, entity, role) {
    const resolved = resolve(data, entity, role || "icon", { fallback: FALLBACK[role || "icon"] });
    if (!resolved.src || (resolved.kind && resolved.kind !== "image")) return "";
    const display = Object.assign({}, resolved.display, {
      width: resolved.display.width || 32,
      height: resolved.display.height || 32,
    });
    return imgHtml(resolved.src, display, "ga-glyph");
  }

  function validate(data) {
    const issues = [];
    const counts = Object.create(null);
    list(data).forEach((asset) => {
      if (!asset || !asset.id) return;
      counts[asset.id] = (counts[asset.id] || 0) + 1;
      if (!cleanPath(asset.path)) {
        issues.push({
          type: "empty",
          fromKind: "asset",
          fromId: asset.id,
          fromName: asset.name || asset.id,
          field: "path",
          toKind: "file",
          toId: "",
          message: "Ресурс «" + (asset.name || asset.id) + "»: нет файла.",
        });
      }
    });
    Object.keys(counts).forEach((id) => {
      if (counts[id] < 2) return;
      issues.push({
        type: "duplicate",
        fromKind: "asset",
        fromId: id,
        fromName: id,
        field: "id",
        toKind: "asset",
        toId: id,
        message: "Одинаковый ID у нескольких ресурсов: «" + id + "».",
      });
    });
    walkArt(data, (kind, entity) => {
      const art = entity.art;
      if (!art || typeof art !== "object") return;
      Object.keys(art).forEach((role) => {
        const slot = art[role];
        if (!slot || !slot.assetId) return;
        if (find(data, slot.assetId)) return;
        issues.push({
          type: "missing",
          fromKind: kind,
          fromId: entity.id,
          fromName: entity.name || entity.key || entity.id,
          field: "art." + role,
          toKind: "asset",
          toId: slot.assetId,
          message: "«" + (entity.name || entity.key || entity.id) + "» (" + (roleMeta(role).label) + ") ссылается на ресурс «" + slot.assetId + "», которого нет.",
        });
      });
    });
    return issues;
  }

  function fileRefs(data) {
    const rows = [];
    const seen = Object.create(null);
    list(data).forEach((asset) => {
      const path = cleanPath(asset && asset.path);
      if (!path || seen[path]) return;
      seen[path] = true;
      rows.push({
        type: "image",
        fromKind: "asset",
        fromId: asset.id,
        fromName: asset.name || asset.id,
        field: "path",
        path,
        message: "Ресурс «" + (asset.name || asset.id) + "»: нет файла «" + path + "».",
      });
    });
    walkArt(data, (kind, entity) => {
      const path = cleanPath(entity.image);
      if (!path || seen[path] || path.indexOf("data:") === 0) return;
      seen[path] = true;
      rows.push({
        type: "image",
        fromKind: kind,
        fromId: entity.id,
        fromName: entity.name || entity.key || entity.id,
        field: "image",
        path,
        message: "«" + (entity.name || entity.key || entity.id) + "»: нет файла картинки «" + path + "».",
      });
    });
    return rows;
  }

  async function checkFiles(data) {
    const refs = fileRefs(data);
    const found = [];
    await Promise.all(refs.map(async (row) => {
      try {
        const response = await fetch(row.path, { cache: "no-store" });
        if (!response.ok) found.push(row);
      } catch (error) {
        found.push(row);
      }
    }));
    return found;
  }

  function choices(data, value) {
    const rows = [{ id: "", label: "— нет —", missing: false }];
    list(data).forEach((asset) => {
      rows.push({
        id: asset.id,
        label: asset.name || asset.id,
        missing: false,
        kind: asset.kind,
      });
    });
    if (value && !rows.some((row) => row.id === value)) {
      rows.push({ id: value, label: "нет в библиотеке: " + value, missing: true });
    }
    return rows;
  }

  function previewBox(role) {
    const sizes = {
      icon: [48, 48],
      avatar: [72, 72],
      thumbnail: [110, 110],
      card: [150, 150],
      banner: [280, 88],
      background: [280, 150],
    };
    return sizes[role] || [280, 180];
  }

  root.GameAssets = {
    ROLES,
    KINDS,
    FITS,
    ALIGN,
    ROLE_DEFAULTS,
    list,
    ensure,
    find,
    findByPath,
    makeId,
    create,
    rename,
    replaceFile,
    remove,
    incoming,
    assign,
    clearSlot,
    setSlotDisplay,
    setAssetView,
    resolve,
    srcOf,
    stageHtml,
    glyphHtml,
    imgHtml,
    sanitizeDisplay,
    mergeDisplay,
    emptyDisplay,
    pickDisplay,
    validate,
    checkFiles,
    fileRefs,
    choices,
    syncLegacy,
    stripRuntime,
    kindFromName,
    suffix,
    basename,
    cleanPath,
    cssMap,
    frameCss,
    imageCss,
    previewBox,
    roleMeta,
    ART_LISTS,
  };
})(window);
