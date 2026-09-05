(function (root) {
  const PREFIX = {
    class: "hero",
    enemy: "enemy",
    item: "item",
    recipe: "recipe",
    shop: "shop",
    location: "location",
    loot: "loot",
    event: "event",
    achievement: "ach",
    phrase: "phrase",
    tutorial: "tut",
    quest: "quest",
    asset: "art",
  };

  const LISTS = {
    class: "classes",
    enemy: "enemies",
    item: "items",
    recipe: "recipes",
    shop: "shops",
    location: "locations",
    loot: "lootTables",
    event: "events",
    achievement: "achievements",
    phrase: "phrases",
    tutorial: "tutorials",
  };

  const ITEM_FORBIDDEN = ["shop_", "craft_", "drop_", "loot_", "quest_", "recipe_"];

  function listOf(data, kind) {
    const key = LISTS[kind];
    if (!data || !key) return [];
    if (!Array.isArray(data[key])) data[key] = [];
    return data[key];
  }

  function aliasesOf(data, kind) {
    if (!data.idAliases || typeof data.idAliases !== "object") data.idAliases = {};
    if (!data.idAliases[kind] || typeof data.idAliases[kind] !== "object") data.idAliases[kind] = {};
    return data.idAliases[kind];
  }

  function addAlias(data, kind, from, to) {
    if (!from || !to || from === to) return;
    aliasesOf(data, kind)[from] = to;
  }

  function resolve(data, kind, id) {
    if (!id) return "";
    const raw = String(id);
    const seen = Object.create(null);
    let current = raw;
    const map = data && data.idAliases && data.idAliases[kind];
    while (map && map[current] && !seen[current]) {
      seen[current] = true;
      current = map[current];
    }
    const list = listOf(data, kind);
    if (list.some((row) => row && row.id === current)) return current;
    if (list.some((row) => row && row.id === raw)) return raw;
    return current;
  }

  function find(data, kind, id) {
    const canon = resolve(data, kind, id);
    if (!canon) return null;
    return listOf(data, kind).find((row) => row && (row.id === canon || row.id === id)) || null;
  }

  function hasPrefix(id, kind) {
    const prefix = PREFIX[kind];
    if (!prefix || !id) return false;
    return String(id).indexOf(prefix + "_") === 0;
  }

  function withPrefix(kind, id) {
    const prefix = PREFIX[kind];
    const raw = String(id || "").trim();
    if (!raw || !prefix) return raw;
    if (raw.indexOf(prefix + "_") === 0) return raw;
    if (kind === "recipe" && raw.indexOf("craft_") === 0) return "recipe_" + raw.slice(6);
    return prefix + "_" + raw;
  }

  function stripKindPrefix(kind, id) {
    const prefix = PREFIX[kind] + "_";
    const raw = String(id || "");
    return raw.indexOf(prefix) === 0 ? raw.slice(prefix.length) : raw;
  }

  function remapItemRef(data, id) {
    return resolve(data, "item", id);
  }

  function rewriteRefs(data, maps) {
    const item = (id) => (id ? maps.item[id] || id : id);
    const enemy = (id) => (id ? maps.enemy[id] || id : id);
    const place = (id) => (id ? maps.location[id] || id : id);
    const recipe = (id) => (id ? maps.recipe[id] || id : id);

    (data.items || []).forEach((row) => {
      if (row && maps.item[row.id]) row.id = maps.item[row.id];
    });
    (data.recipes || []).forEach((row) => {
      if (!row) return;
      if (maps.recipe[row.id]) row.id = maps.recipe[row.id];
      row.resultItemId = item(row.resultItemId);
      (row.ingredients || []).forEach((ing) => {
        if (ing) ing.itemId = item(ing.itemId);
      });
    });
    (data.enemies || []).forEach((row) => {
      if (!row) return;
      if (maps.enemy[row.id]) row.id = maps.enemy[row.id];
      (row.loot || []).forEach((drop) => {
        if (drop) drop.itemId = item(drop.itemId);
      });
      if (row.lootTableId && maps.loot[row.lootTableId]) row.lootTableId = maps.loot[row.lootTableId];
    });
    (data.locations || []).forEach((row) => {
      if (row && maps.location[row.id]) row.id = maps.location[row.id];
    });
    if (data.location && maps.location[data.location.id]) data.location.id = maps.location[data.location.id];
    (data.events || []).forEach((row) => {
      if (!row) return;
      if (maps.event[row.id]) row.id = maps.event[row.id];
      row.locationId = place(row.locationId);
      (row.effects || []).forEach((effect) => {
        if (!effect) return;
        if (effect.itemId) effect.itemId = item(effect.itemId);
        if (effect.locationId) effect.locationId = place(effect.locationId);
      });
    });
    (data.phrases || []).forEach((row) => {
      if (row && row.locationId) row.locationId = place(row.locationId);
    });
    (data.achievements || []).forEach((row) => {
      (row && row.conditions || []).forEach((cond) => {
        if (!cond) return;
        if (cond.itemId) cond.itemId = item(cond.itemId);
        if (cond.enemyId) cond.enemyId = enemy(cond.enemyId);
        if (cond.locationId) cond.locationId = place(cond.locationId);
      });
    });
    (data.lootTables || []).forEach((row) => {
      if (!row) return;
      if (maps.loot[row.id]) row.id = maps.loot[row.id];
      (row.drops || []).forEach((drop) => {
        if (drop) drop.itemId = item(drop.itemId);
      });
    });
    (data.shops || []).forEach((shop) => {
      if (!shop) return;
      if (maps.shop[shop.id]) shop.id = maps.shop[shop.id];
      shop.locationId = place(shop.locationId);
      (shop.stock || []).forEach((line) => {
        if (!line) return;
        line.itemId = item(line.itemId);
        if (line.locationId) line.locationId = place(line.locationId);
      });
    });
    (data.shop || []).forEach((row) => {
      if (!row) return;
      row.itemId = item(row.itemId);
      if (row.locationId) row.locationId = place(row.locationId);
    });
    return { item, enemy, place, recipe };
  }

  function flattenShops(data) {
    const rows = [];
    (data.shops || []).forEach((shop) => {
      (shop.stock || []).forEach((line, index) => {
        if (!line) return;
        rows.push({
          id: shop.id + "::" + (line.itemId || index),
          shopId: shop.id,
          itemId: line.itemId,
          price: line.price,
          enabled: line.enabled !== false && shop.enabled !== false,
          tab: line.tab || "loot",
          setId: line.setId || "",
          setName: line.setName || "",
          locationId: line.locationId || shop.locationId || "",
        });
      });
    });
    data.shop = rows;
    return rows;
  }

  function groupShops(data) {
    if (Array.isArray(data.shops) && data.shops.length) {
      flattenShops(data);
      return;
    }
    const place = (data.locations && data.locations[0] && data.locations[0].id) || "location_forgotten_forest";
    const shopId = "shop_forgotten_forest";
    const stock = (data.shop || []).map((row) => ({
      itemId: row.itemId,
      price: Number(row.price) || 0,
      enabled: row.enabled !== false,
      tab: row.tab || "loot",
      setId: row.setId || "",
      setName: row.setName || "",
      locationId: row.locationId || "",
    }));
    (data.shop || []).forEach((row) => addAlias(data, "shop", row.id, shopId));
    data.shops = [{
      id: shopId,
      name: "Лавка забытого леса",
      locationId: place,
      enabled: true,
      stock,
    }];
    flattenShops(data);
  }

  function syncLoot(data) {
    if (!Array.isArray(data.lootTables)) data.lootTables = [];
    const byId = Object.create(null);
    data.lootTables.forEach((row) => {
      if (row && row.id) byId[row.id] = row;
    });
    (data.enemies || []).forEach((enemy) => {
      if (!enemy) return;
      let table = enemy.lootTableId ? byId[enemy.lootTableId] : null;
      if (!table) {
        const slug = stripKindPrefix("enemy", enemy.id) || enemy.id;
        const id = "loot_" + slug;
        table = byId[id];
        if (!table) {
          table = {
            id,
            name: enemy.name || slug,
            drops: Array.isArray(enemy.loot) ? enemy.loot : [],
          };
          data.lootTables.push(table);
          byId[id] = table;
        }
        enemy.lootTableId = table.id;
      }
      if (!Array.isArray(table.drops)) table.drops = [];
      enemy.loot = table.drops;
    });
  }

  function lootOf(data, enemy) {
    if (!enemy) return [];
    const table = enemy.lootTableId ? find(data, "loot", enemy.lootTableId) : null;
    if (table && Array.isArray(table.drops)) return table.drops;
    return Array.isArray(enemy.loot) ? enemy.loot : [];
  }

  function dropsOf(data, enemy) {
    if (!enemy) return [];
    syncLoot(data);
    const table = enemy.lootTableId ? find(data, "loot", enemy.lootTableId) : null;
    if (table) {
      if (!Array.isArray(table.drops)) table.drops = [];
      enemy.loot = table.drops;
      return table.drops;
    }
    if (!Array.isArray(enemy.loot)) enemy.loot = [];
    return enemy.loot;
  }

  function canonicalize(data) {
    if (!data || typeof data !== "object") return data;
    const maps = { item: {}, enemy: {}, recipe: {}, location: {}, event: {}, loot: {}, shop: {} };

    (data.items || []).forEach((row) => {
      if (!row || !row.id) return;
      const next = withPrefix("item", row.id);
      if (next !== row.id) {
        maps.item[row.id] = next;
        addAlias(data, "item", row.id, next);
      }
    });
    (data.enemies || []).forEach((row) => {
      if (!row || !row.id) return;
      const next = withPrefix("enemy", row.id);
      if (next !== row.id) {
        maps.enemy[row.id] = next;
        addAlias(data, "enemy", row.id, next);
      }
    });
    (data.recipes || []).forEach((row) => {
      if (!row || !row.id) return;
      const next = withPrefix("recipe", row.id);
      if (next !== row.id) {
        maps.recipe[row.id] = next;
        addAlias(data, "recipe", row.id, next);
      }
    });
    (data.locations || []).forEach((row) => {
      if (!row || !row.id) return;
      const next = withPrefix("location", row.id);
      if (next !== row.id) {
        maps.location[row.id] = next;
        addAlias(data, "location", row.id, next);
      }
    });
    if (data.location && data.location.id) {
      const next = withPrefix("location", data.location.id);
      if (next !== data.location.id) {
        maps.location[data.location.id] = next;
        addAlias(data, "location", data.location.id, next);
      }
    }
    (data.events || []).forEach((row) => {
      if (!row || !row.id) return;
      const next = withPrefix("event", row.id);
      if (next !== row.id) {
        maps.event[row.id] = next;
        addAlias(data, "event", row.id, next);
      }
    });

    rewriteRefs(data, maps);
    groupShops(data);
    syncLoot(data);
    (data.lootTables || []).forEach((row) => {
      if (!row || !row.id) return;
      const next = withPrefix("loot", row.id);
      if (next !== row.id) {
        addAlias(data, "loot", row.id, next);
        (data.enemies || []).forEach((enemy) => {
          if (enemy && enemy.lootTableId === row.id) enemy.lootTableId = next;
        });
        row.id = next;
      }
    });
    flattenShops(data);
    return data;
  }

  function remapKeyMap(map, resolveId) {
    if (!map || typeof map !== "object") return map;
    const next = {};
    Object.keys(map).forEach((key) => {
      const canon = resolveId(key) || key;
      const value = map[key];
      if (next[canon] && typeof value === "number" && typeof next[canon] === "number") {
        next[canon] += value;
      } else if (next[canon] == null) {
        next[canon] = value;
      }
    });
    return next;
  }

  function remapSave(save, data) {
    if (!save || !data) return save;
    const item = (id) => resolve(data, "item", id);
    const enemy = (id) => resolve(data, "enemy", id);
    const place = (id) => resolve(data, "location", id);
    const recipe = (id) => resolve(data, "recipe", id);
    const remapHero = (hero) => {
      if (!hero) return hero;
      (hero.inventory || []).forEach((row) => {
        if (row && row.id) row.id = item(row.id);
      });
      if (hero.equipped) {
        Object.keys(hero.equipped).forEach((slot) => {
          if (hero.equipped[slot]) hero.equipped[slot] = item(hero.equipped[slot]);
        });
      }
      if (hero.locationId) hero.locationId = place(hero.locationId);
      if (hero.stats) {
        hero.stats.itemsFound = remapKeyMap(hero.stats.itemsFound, item);
        hero.stats.kills = remapKeyMap(hero.stats.kills, enemy);
        hero.stats.locations = remapKeyMap(hero.stats.locations, place);
      }
      if (hero.recipeBook) hero.recipeBook = remapKeyMap(hero.recipeBook, recipe);
      return hero;
    };
    (save.slots || []).forEach((slot, index) => {
      if (slot) save.slots[index] = remapHero(slot);
    });
    if (save.stats) {
      save.stats.itemsFound = remapKeyMap(save.stats.itemsFound, item);
      save.stats.kills = remapKeyMap(save.stats.kills, enemy);
      save.stats.locations = remapKeyMap(save.stats.locations, place);
    }
    if (save.recipeBook) save.recipeBook = remapKeyMap(save.recipeBook, recipe);
    if (save.locationId) save.locationId = place(save.locationId);
    return save;
  }

  function statValue(map, id, resolveId) {
    if (!map) return 0;
    const canon = resolveId(id);
    let total = Number(map[id] || 0) || 0;
    if (canon && canon !== id) total += Number(map[canon] || 0) || 0;
    return total;
  }

  function itemUses(data, itemId) {
    const id = resolve(data, "item", itemId);
    const rows = [];
    (data.recipes || []).forEach((recipe) => {
      if (!recipe) return;
      if (resolve(data, "item", recipe.resultItemId) === id) {
        rows.push({ kind: "recipe", id: recipe.id, name: recipe.name || recipe.id, role: "результат" });
      }
      (recipe.ingredients || []).forEach((ing) => {
        if (resolve(data, "item", ing && ing.itemId) === id) {
          rows.push({ kind: "recipe", id: recipe.id, name: recipe.name || recipe.id, role: "ингредиент" });
        }
      });
    });
    (data.shops || []).forEach((shop) => {
      (shop.stock || []).forEach((line) => {
        if (resolve(data, "item", line && line.itemId) === id) {
          rows.push({ kind: "shop", id: shop.id, name: shop.name || shop.id, role: "продажа" });
        }
      });
    });
    (data.lootTables || []).forEach((table) => {
      (table.drops || []).forEach((drop) => {
        if (resolve(data, "item", drop && drop.itemId) === id) {
          rows.push({ kind: "loot", id: table.id, name: table.name || table.id, role: "лут" });
        }
      });
    });
    (data.events || []).forEach((event) => {
      (event.effects || []).forEach((effect) => {
        if (effect && effect.type === "item" && resolve(data, "item", effect.itemId) === id) {
          rows.push({ kind: "event", id: event.id, name: event.name || event.id, role: "награда" });
        }
      });
    });
    return rows;
  }

  function itemIdLooksWrong(id) {
    const raw = String(id || "");
    return ITEM_FORBIDDEN.some((prefix) => raw.indexOf(prefix) === 0);
  }

  const CYR = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };

  function transliterate(text) {
    return String(text || "").split("").map((ch) => {
      const lower = ch.toLowerCase();
      if (CYR[lower] == null) return ch;
      const mapped = CYR[lower];
      if (!mapped) return "";
      return ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
    }).join("");
  }

  function slugPart(text) {
    const raw = transliterate(text).toLowerCase()
      .replace(/['’`]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    return raw.slice(0, 48);
  }

  function isDraftId(id) {
    return /__new(?:_|$)/.test(String(id || ""));
  }

  function isDraft(entity) {
    return !!(entity && (entity._new || isDraftId(entity.id)));
  }

  function retiredList(data, kind) {
    const bag = data && data.retiredIds;
    if (!bag || !Array.isArray(bag[kind])) return [];
    return bag[kind];
  }

  function retireId(data, kind, id) {
    if (!data || !id || isDraftId(id)) return;
    if (!data.retiredIds || typeof data.retiredIds !== "object") data.retiredIds = {};
    if (!Array.isArray(data.retiredIds[kind])) data.retiredIds[kind] = [];
    if (data.retiredIds[kind].indexOf(id) < 0) data.retiredIds[kind].push(id);
  }

  function takenSet(data, kind, ignoreId) {
    const taken = Object.create(null);
    listOf(data, kind).forEach((row) => {
      if (row && row.id) taken[row.id] = true;
    });
    retiredList(data, kind).forEach((id) => {
      if (id) taken[id] = true;
    });
    const map = data && data.idAliases && data.idAliases[kind];
    if (map) {
      Object.keys(map).forEach((from) => {
        taken[from] = true;
        if (map[from]) taken[map[from]] = true;
      });
    }
    if (ignoreId) delete taken[ignoreId];
    return taken;
  }

  function recipeStemFromResult(data, resultItemId) {
    if (!resultItemId) return "";
    const result = find(data, "item", resultItemId);
    if (result && result.id && !isDraft(result) && !isDraftId(result.id)) {
      return slugPart(stripKindPrefix("item", result.id));
    }
    if (result && result.name) return slugPart(result.name);
    return slugPart(stripKindPrefix("item", resultItemId) || resultItemId);
  }

  function uniqueId(data, kind, base, ignoreId, extra) {
    extra = extra || {};
    const prefix = PREFIX[kind] || "ent";
    let stem = "";
    if (kind === "recipe") stem = recipeStemFromResult(data, extra.resultItemId);
    if (!stem) stem = slugPart(base);
    if (!stem) stem = "entity";
    let rootId = stem.indexOf(prefix + "_") === 0 ? stem : prefix + "_" + stem;
    if (kind === "item" && itemIdLooksWrong(rootId)) rootId = prefix + "_" + stem;
    const taken = takenSet(data, kind, ignoreId);
    if (!taken[rootId]) return rootId;
    let n = 2;
    while (taken[rootId + "_" + n]) n += 1;
    return rootId + "_" + n;
  }

  function nextDraftId(data, kind) {
    const prefix = PREFIX[kind] || "ent";
    const taken = takenSet(data, kind);
    let id = prefix + "__new";
    let n = 2;
    while (taken[id]) {
      id = prefix + "__new_" + n;
      n += 1;
    }
    return id;
  }

  function previewId(data, kind, name, ignoreId, extra) {
    return uniqueId(data, kind, name || "entity", ignoreId, extra);
  }

  function rewriteEntityId(data, kind, from, to) {
    if (!data || !from || !to || from === to) return;
    const bump = (obj, key) => {
      if (obj && obj[key] === from) obj[key] = to;
    };
    listOf(data, kind).forEach((row) => {
      if (row && row.id === from) row.id = to;
    });
    if (kind === "item") {
      (data.recipes || []).forEach((row) => {
        bump(row, "resultItemId");
        (row.ingredients || []).forEach((ing) => bump(ing, "itemId"));
      });
      (data.shops || []).forEach((shop) => {
        (shop.stock || []).forEach((line) => bump(line, "itemId"));
      });
      (data.shop || []).forEach((row) => bump(row, "itemId"));
      (data.lootTables || []).forEach((table) => {
        (table.drops || []).forEach((drop) => bump(drop, "itemId"));
      });
      (data.enemies || []).forEach((enemy) => {
        (enemy.loot || []).forEach((drop) => bump(drop, "itemId"));
      });
      (data.events || []).forEach((event) => {
        (event.effects || []).forEach((fx) => bump(fx, "itemId"));
      });
      (data.achievements || []).forEach((row) => {
        (row.conditions || []).forEach((cond) => bump(cond, "itemId"));
      });
    }
    if (kind === "enemy") {
      (data.achievements || []).forEach((row) => {
        (row.conditions || []).forEach((cond) => bump(cond, "enemyId"));
      });
    }
    if (kind === "location") {
      if (data.location) bump(data.location, "id");
      (data.events || []).forEach((row) => {
        bump(row, "locationId");
        (row.effects || []).forEach((fx) => bump(fx, "locationId"));
      });
      (data.phrases || []).forEach((row) => bump(row, "locationId"));
      (data.shops || []).forEach((row) => bump(row, "locationId"));
      (data.shop || []).forEach((row) => bump(row, "locationId"));
    }
    if (kind === "loot") {
      (data.enemies || []).forEach((row) => bump(row, "lootTableId"));
    }
    if (kind === "shop") {
      (data.shop || []).forEach((row) => bump(row, "shopId"));
    }
    if (kind === "class") {
      (data.classes || []).forEach((cls) => {
        if (cls && cls.id === to && cls.key === from) cls.key = to;
      });
      (data.achievements || []).forEach((row) => {
        if (row && row.classKey === from) row.classKey = to;
      });
    }
    addAlias(data, kind, from, to);
  }

  function finalizeNew(data) {
    const changed = {};
    Object.keys(LISTS).forEach((kind) => {
      listOf(data, kind).slice().forEach((entity) => {
        if (!entity || !isDraft(entity)) return;
        const source = entity.name || entity.key || entity.text || "entity";
        const next = uniqueId(data, kind, source, entity.id, { resultItemId: entity.resultItemId });
        const prev = entity.id;
        if (next !== prev) rewriteEntityId(data, kind, prev, next);
        else entity.id = next;
        entity.type = kind;
        delete entity._new;
        if (!changed[kind]) changed[kind] = {};
        changed[kind][prev] = entity.id;
      });
    });
    flattenShops(data);
    return changed;
  }

  function validate(data) {
    const issues = [];
    (data.items || []).forEach((item) => {
      if (!item || !item.id) return;
      if (itemIdLooksWrong(item.id)) {
        issues.push({
          type: "id",
          fromKind: "item",
          fromId: item.id,
          fromName: item.name || item.id,
          field: "id",
          message: "«" + (item.name || item.id) + "»: ID предмета не должен содержать способ получения (shop_/craft_/drop_).",
        });
      }
    });
    return issues;
  }

  root.GameIds = {
    PREFIX,
    LISTS,
    resolve,
    find,
    canonicalize,
    remapSave,
    flattenShops,
    lootOf,
    dropsOf,
    syncLoot,
    itemUses,
    validate,
    withPrefix,
    hasPrefix,
    aliasesOf,
    addAlias,
    listOf,
    statValue,
    slugPart,
    uniqueId,
    nextDraftId,
    previewId,
    isDraft,
    isDraftId,
    rewriteEntityId,
    finalizeNew,
    retireId,
    takenSet,
  };
})(window);
