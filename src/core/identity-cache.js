(() => {
  "use strict";

  const Studio = globalThis.CMStudio ||= {};

  const DATABASE_NAME = "civitai-metadata-studio";
  const DATABASE_VERSION = 1;
  const ENTRY_STORE = "entries";
  const META_STORE = "meta";
  const META_STATS_KEY = "stats";
  const LEGACY_STORAGE_KEY = "civitai-metadata-studio.identity-cache.v3";
  const FALLBACK_STORAGE_KEY = "civitai-metadata-studio.identity-cache.v4";
  const FALLBACK_SCHEMA = "civitai-metadata-studio.identity-cache";
  const POSITIVE_TTL = 7 * 24 * 60 * 60 * 1000;
  const NEGATIVE_TTL = 15 * 60 * 1000;
  const SEARCH_TTL = 10 * 60 * 1000;
  const MAX_BYTES = 16 * 1024 * 1024;
  const MAX_RECORDS = 50_000;
  const MAX_VERSIONS = 2_000;
  const MAX_RECORD_BYTES = 4 * 1024 * 1024;
  const MEMORY_LIMIT = 512;
  const FALLBACK_LIMIT = 250;
  const TOUCH_INTERVAL = 60 * 60 * 1000;
  const MAX_KEY_LENGTH = 512;
  const ALLOWED_KEY = /^(?:version|model|hash-candidates|hash-id|hash-miss|hash|search):/u;
  const encoder = new TextEncoder();
  const memory = new Map();
  const fallbackEntries = new Map();

  let databasePromise = null;
  let databaseUnavailable = false;
  let fallbackLoaded = false;
  let backend = "initializing";
  let persistentStats = emptyStats();

  function emptyStats() {
    return {
      key: META_STATS_KEY,
      bytes: 0,
      records: 0,
      versions: 0,
      lastPrunedAt: 0
    };
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function safeKey(value) {
    const key = String(value || "");
    return key.length > 0 && key.length <= MAX_KEY_LENGTH && ALLOWED_KEY.test(key) ? key : "";
  }

  function kindForKey(key) {
    return String(key).slice(0, String(key).indexOf(":")) || "unknown";
  }

  function ttlFor(kind, negative, requested) {
    if (negative) return NEGATIVE_TTL;
    if (Number.isFinite(requested) && requested > 0) return requested;
    return kind === "search" ? SEARCH_TTL : POSITIVE_TTL;
  }

  function groupFor(key, value, provided) {
    const explicit = safeKey(provided);
    if (explicit) return explicit;
    const kind = kindForKey(key);
    if (kind === "hash-id") {
      const versionId = Number(value?.modelVersionId);
      if (Number.isSafeInteger(versionId) && versionId > 0) return `version:${versionId}`;
    }
    if (kind === "version" || kind === "model" || kind === "search") return key;
    return key;
  }

  function approximateBytes(record) {
    try {
      return encoder.encode(JSON.stringify({
        key: record.key,
        kind: record.kind,
        groupId: record.groupId,
        cachedAt: record.cachedAt,
        expiresAt: record.expiresAt,
        lastUsedAt: record.lastUsedAt,
        negative: record.negative,
        value: record.value
      })).byteLength;
    } catch {
      return MAX_RECORD_BYTES + 1;
    }
  }

  function normalizeRecord(raw, keyOverride = "", requestedTtl) {
    if (!isPlainObject(raw)) return null;
    const key = safeKey(keyOverride || raw.key);
    if (!key) return null;
    const current = Date.now();
    const cachedAt = Math.min(
      Number.isFinite(raw.cachedAt) ? Number(raw.cachedAt) : current,
      current
    );
    const negative = Boolean(raw.negative);
    const kind = kindForKey(key);
    const expiresAt = Number.isFinite(raw.expiresAt)
      ? Number(raw.expiresAt)
      : cachedAt + ttlFor(kind, negative, requestedTtl);
    const record = {
      key,
      kind,
      groupId: groupFor(key, raw.value, raw.groupId),
      cachedAt,
      expiresAt,
      lastUsedAt: Math.min(
        Number.isFinite(raw.lastUsedAt) ? Number(raw.lastUsedAt) : cachedAt,
        current
      ),
      negative,
      value: raw.value
    };
    record.approxBytes = approximateBytes(record);
    return record.approxBytes <= MAX_RECORD_BYTES ? record : null;
  }

  function recordFromDescriptor(descriptor, current = Date.now()) {
    if (!isPlainObject(descriptor)) return null;
    const key = safeKey(descriptor.key);
    if (!key) return null;
    const kind = kindForKey(key);
    const negative = descriptor.negative === undefined
      ? descriptor.value === null
      : Boolean(descriptor.negative);
    const cachedAt = Number.isFinite(descriptor.cachedAt)
      ? Math.min(Number(descriptor.cachedAt), current)
      : current;
    const record = {
      key,
      kind,
      groupId: groupFor(key, descriptor.value, descriptor.groupId),
      cachedAt,
      expiresAt: Number.isFinite(descriptor.expiresAt)
        ? Number(descriptor.expiresAt)
        : cachedAt + ttlFor(kind, negative, descriptor.ttl),
      lastUsedAt: Number.isFinite(descriptor.lastUsedAt)
        ? Math.min(Number(descriptor.lastUsedAt), current)
        : current,
      negative,
      value: descriptor.value
    };
    record.approxBytes = approximateBytes(record);
    return record.approxBytes <= MAX_RECORD_BYTES ? record : null;
  }

  function remember(record) {
    memory.delete(record.key);
    memory.set(record.key, record);
    while (memory.size > MEMORY_LIMIT) {
      memory.delete(memory.keys().next().value);
    }
  }

  function forget(keys) {
    for (const key of keys) memory.delete(key);
  }

  function summarize(records, lastPrunedAt = 0) {
    const stats = emptyStats();
    stats.lastPrunedAt = lastPrunedAt;
    for (const record of records) {
      stats.records += 1;
      stats.bytes += Number(record.approxBytes || 0);
      if (record.kind === "version" && !record.negative) stats.versions += 1;
    }
    return stats;
  }

  function normalizeStats(value) {
    if (!isPlainObject(value)) return emptyStats();
    return {
      key: META_STATS_KEY,
      bytes: Math.max(0, Number(value.bytes) || 0),
      records: Math.max(0, Number(value.records) || 0),
      versions: Math.max(0, Number(value.versions) || 0),
      lastPrunedAt: Math.max(0, Number(value.lastPrunedAt) || 0)
    };
  }

  function overLimit(stats) {
    return stats.bytes > MAX_BYTES
      || stats.records > MAX_RECORDS
      || stats.versions > MAX_VERSIONS;
  }

  function transaction(database, stores, mode, callback) {
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = mode === "readwrite"
          ? database.transaction(stores, mode, { durability: "relaxed" })
          : database.transaction(stores, mode);
      } catch (error) {
        reject(error);
        return;
      }
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || new DOMException("Cache transaction was aborted.", "AbortError"));
      tx.onerror = () => {};
      try {
        callback(tx, (value) => {
          result = value;
        });
      } catch (error) {
        try {
          tx.abort();
        } catch {
          // The transaction may already be inactive.
        }
        reject(error);
      }
    });
  }

  function readAllFromDatabase(database) {
    return transaction(database, [ENTRY_STORE], "readonly", (tx, setResult) => {
      const request = tx.objectStore(ENTRY_STORE).getAll();
      request.onsuccess = () => setResult(Array.isArray(request.result) ? request.result : []);
    });
  }

  function readManyFromDatabase(database, keys) {
    return transaction(database, [ENTRY_STORE], "readonly", (tx, setResult) => {
      const result = new Map();
      const store = tx.objectStore(ENTRY_STORE);
      if (!keys.length) {
        setResult(result);
        return;
      }
      let remaining = keys.length;
      for (const key of keys) {
        const request = store.get(key);
        request.onsuccess = () => {
          if (request.result !== undefined) result.set(key, request.result);
          remaining -= 1;
          if (!remaining) setResult(result);
        };
      }
    });
  }

  function readStatsFromDatabase(database) {
    return transaction(database, [META_STORE], "readonly", (tx, setResult) => {
      const request = tx.objectStore(META_STORE).get(META_STATS_KEY);
      request.onsuccess = () => setResult(normalizeStats(request.result));
    });
  }

  function writeRawRecords(database, records) {
    return transaction(database, [ENTRY_STORE], "readwrite", (tx) => {
      const store = tx.objectStore(ENTRY_STORE);
      for (const record of records) store.put(record);
    });
  }

  function writeRecordsToDatabase(database, records) {
    if (!records.length) return Promise.resolve(persistentStats);
    return transaction(database, [ENTRY_STORE, META_STORE], "readwrite", (tx, setResult) => {
      const store = tx.objectStore(ENTRY_STORE);
      const meta = tx.objectStore(META_STORE);
      const existing = new Map();
      let stats = null;
      let remaining = records.length + 1;

      const finishReads = () => {
        remaining -= 1;
        if (remaining) return;
        const next = normalizeStats(stats);
        for (const record of records) {
          const previous = existing.get(record.key);
          if (previous) {
            next.records = Math.max(0, next.records - 1);
            next.bytes = Math.max(0, next.bytes - Number(previous.approxBytes || 0));
            if (previous.kind === "version" && !previous.negative) {
              next.versions = Math.max(0, next.versions - 1);
            }
          }
          next.records += 1;
          next.bytes += Number(record.approxBytes || 0);
          if (record.kind === "version" && !record.negative) next.versions += 1;
          store.put(record);
        }
        meta.put(next);
        setResult(next);
      };

      const statsRequest = meta.get(META_STATS_KEY);
      statsRequest.onsuccess = () => {
        stats = statsRequest.result;
        finishReads();
      };
      for (const record of records) {
        const request = store.get(record.key);
        request.onsuccess = () => {
          if (request.result !== undefined) existing.set(record.key, request.result);
          finishReads();
        };
      }
    });
  }

  function deleteRecordsFromDatabase(database, keys) {
    const unique = [...new Set(keys.map(safeKey).filter(Boolean))];
    if (!unique.length) return Promise.resolve(persistentStats);
    return transaction(database, [ENTRY_STORE, META_STORE], "readwrite", (tx, setResult) => {
      const store = tx.objectStore(ENTRY_STORE);
      const meta = tx.objectStore(META_STORE);
      const existing = new Map();
      let stats = null;
      let remaining = unique.length + 1;

      const finishReads = () => {
        remaining -= 1;
        if (remaining) return;
        const next = normalizeStats(stats);
        for (const key of unique) {
          const previous = existing.get(key);
          if (!previous) continue;
          next.records = Math.max(0, next.records - 1);
          next.bytes = Math.max(0, next.bytes - Number(previous.approxBytes || 0));
          if (previous.kind === "version" && !previous.negative) {
            next.versions = Math.max(0, next.versions - 1);
          }
          store.delete(key);
        }
        meta.put(next);
        setResult(next);
      };

      const statsRequest = meta.get(META_STATS_KEY);
      statsRequest.onsuccess = () => {
        stats = statsRequest.result;
        finishReads();
      };
      for (const key of unique) {
        const request = store.get(key);
        request.onsuccess = () => {
          if (request.result !== undefined) existing.set(key, request.result);
          finishReads();
        };
      }
    });
  }

  function planPrune(records, current = Date.now()) {
    const live = [];
    const removed = new Set();
    for (const raw of records) {
      const record = normalizeRecord(raw);
      if (!record || record.expiresAt <= current) {
        const key = safeKey(raw?.key);
        if (key) removed.add(key);
        continue;
      }
      live.push(record);
    }

    const groups = new Map();
    for (const record of live) {
      const groupId = record.groupId || record.key;
      if (!groups.has(groupId)) groups.set(groupId, []);
      groups.get(groupId).push(record);
    }
    const groupOrder = [...groups.entries()]
      .map(([groupId, entries]) => ({
        groupId,
        entries,
        lastUsedAt: Math.max(...entries.map((entry) => Number(entry.lastUsedAt || entry.cachedAt || 0))),
        hasVersion: entries.some((entry) => entry.kind === "version" && !entry.negative)
      }))
      .sort((left, right) => left.lastUsedAt - right.lastUsedAt);

    let kept = live.filter((record) => !removed.has(record.key));
    let stats = summarize(kept);
    for (const group of groupOrder.filter((item) => item.hasVersion)) {
      if (stats.versions <= MAX_VERSIONS) break;
      for (const record of group.entries) removed.add(record.key);
      kept = kept.filter((record) => !removed.has(record.key));
      stats = summarize(kept);
    }
    for (const group of groupOrder) {
      if (!overLimit(stats)) break;
      for (const record of group.entries) removed.add(record.key);
      kept = kept.filter((record) => !removed.has(record.key));
      stats = summarize(kept);
    }
    stats.lastPrunedAt = current;
    return { kept, removed: [...removed], stats };
  }

  async function maintainDatabase(database) {
    const records = await readAllFromDatabase(database);
    const plan = planPrune(records);
    await transaction(database, [ENTRY_STORE, META_STORE], "readwrite", (tx) => {
      const store = tx.objectStore(ENTRY_STORE);
      for (const key of plan.removed) store.delete(key);
      tx.objectStore(META_STORE).put(plan.stats);
    });
    persistentStats = plan.stats;
    forget(plan.removed);
    return plan.stats;
  }

  function localStorageDocuments() {
    const documents = [];
    try {
      for (const key of [FALLBACK_STORAGE_KEY, LEGACY_STORAGE_KEY]) {
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
        const entries = parsed.schema === FALLBACK_SCHEMA && isPlainObject(parsed.entries)
          ? parsed.entries
          : parsed;
        documents.push({ key, entries });
      }
    } catch {
      // Browser storage is optional.
    }
    return documents;
  }

  function readLocalStorageRecords() {
    const records = new Map();
    for (const document of localStorageDocuments()) {
      for (const [key, raw] of Object.entries(document.entries)) {
        if (records.has(key)) continue;
        const record = normalizeRecord(raw, key);
        if (record) records.set(key, record);
      }
    }
    return records;
  }

  function removeLocalStorageDocuments() {
    try {
      localStorage.removeItem(FALLBACK_STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Browser storage is optional.
    }
  }

  function writeFallback() {
    const entries = [...fallbackEntries.values()]
      .filter((entry) => entry.expiresAt > Date.now())
      .sort((left, right) => Number(right.lastUsedAt || 0) - Number(left.lastUsedAt || 0))
      .slice(0, FALLBACK_LIMIT);
    fallbackEntries.clear();
    for (const entry of entries) fallbackEntries.set(entry.key, entry);
    try {
      localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify({
        schema: FALLBACK_SCHEMA,
        version: 4,
        entries: Object.fromEntries(entries.map((entry) => [entry.key, entry]))
      }));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      backend = "localStorage";
    } catch {
      backend = "memory";
    }
  }

  function ensureFallbackLoaded() {
    if (fallbackLoaded) return;
    fallbackLoaded = true;
    const records = readLocalStorageRecords();
    for (const record of records.values()) {
      fallbackEntries.set(record.key, record);
      remember(record);
    }
    backend = typeof localStorage === "undefined" ? "memory" : "localStorage";
    if (localStorageDocuments().some((document) => document.key === LEGACY_STORAGE_KEY)) {
      writeFallback();
    }
  }

  async function migrateLocalStorage(database) {
    const records = [...readLocalStorageRecords().values()];
    if (records.length) await writeRawRecords(database, records);
    removeLocalStorageDocuments();
  }

  function openDatabaseRequest() {
    return new Promise((resolve) => {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      let request;
      let settled = false;
      const finish = (value) => {
        if (settled) {
          if (value) value.close();
          return;
        }
        settled = true;
        resolve(value);
      };
      try {
        request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      } catch {
        finish(null);
        return;
      }
      request.onupgradeneeded = () => {
        const database = request.result;
        const entries = database.objectStoreNames.contains(ENTRY_STORE)
          ? request.transaction.objectStore(ENTRY_STORE)
          : database.createObjectStore(ENTRY_STORE, { keyPath: "key" });
        if (!entries.indexNames.contains("expiresAt")) entries.createIndex("expiresAt", "expiresAt");
        if (!entries.indexNames.contains("lastUsedAt")) entries.createIndex("lastUsedAt", "lastUsedAt");
        if (!entries.indexNames.contains("kind")) entries.createIndex("kind", "kind");
        if (!entries.indexNames.contains("groupId")) entries.createIndex("groupId", "groupId");
        if (!database.objectStoreNames.contains(META_STORE)) {
          database.createObjectStore(META_STORE, { keyPath: "key" });
        }
      };
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
      request.onsuccess = () => finish(request.result);
    });
  }

  function disableDatabase(database) {
    try {
      database?.close();
    } catch {
      // Ignore close failures from an already-closed database.
    }
    databaseUnavailable = true;
    databasePromise = null;
    ensureFallbackLoaded();
  }

  function openDatabase() {
    if (databaseUnavailable) {
      ensureFallbackLoaded();
      return Promise.resolve(null);
    }
    if (databasePromise) return databasePromise;
    databasePromise = openDatabaseRequest().then(async (database) => {
      if (!database) {
        databaseUnavailable = true;
        ensureFallbackLoaded();
        return null;
      }
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
        backend = "initializing";
      };
      try {
        await migrateLocalStorage(database);
        await maintainDatabase(database);
        backend = "indexeddb";
        return database;
      } catch {
        disableDatabase(database);
        return null;
      }
    });
    return databasePromise;
  }

  function fallbackGetMany(keys) {
    ensureFallbackLoaded();
    const result = new Map();
    const expired = [];
    const current = Date.now();
    for (const key of keys) {
      const record = fallbackEntries.get(key);
      if (!record) continue;
      if (record.expiresAt <= current) {
        fallbackEntries.delete(key);
        memory.delete(key);
        expired.push(key);
        continue;
      }
      record.lastUsedAt = current;
      remember(record);
      result.set(key, record);
    }
    if (expired.length) writeFallback();
    return result;
  }

  function fallbackPut(records) {
    ensureFallbackLoaded();
    for (const record of records) {
      fallbackEntries.set(record.key, record);
      remember(record);
    }
    writeFallback();
  }

  function fallbackDelete(keys) {
    ensureFallbackLoaded();
    for (const key of keys) fallbackEntries.delete(key);
    forget(keys);
    writeFallback();
  }

  async function deleteMany(keys) {
    const unique = [...new Set(keys.map(safeKey).filter(Boolean))];
    if (!unique.length) return;
    forget(unique);
    const database = await openDatabase();
    if (!database) {
      fallbackDelete(unique);
      return;
    }
    try {
      persistentStats = await deleteRecordsFromDatabase(database, unique);
    } catch {
      disableDatabase(database);
      fallbackDelete(unique);
    }
  }

  async function getMany(keys) {
    const unique = [...new Set(keys.map(safeKey).filter(Boolean))];
    const output = new Map();
    const missing = [];
    const expired = [];
    const touches = [];
    const current = Date.now();

    for (const key of unique) {
      const record = memory.get(key);
      if (!record) {
        missing.push(key);
        continue;
      }
      if (record.expiresAt <= current) {
        memory.delete(key);
        expired.push(key);
        continue;
      }
      memory.delete(key);
      memory.set(key, record);
      if (current - Number(record.lastUsedAt || 0) >= TOUCH_INTERVAL) {
        record.lastUsedAt = current;
        touches.push(record);
      }
      output.set(key, { hit: true, value: record.value, negative: record.negative });
    }

    const database = await openDatabase();
    if (!database) {
      const fallback = fallbackGetMany(missing);
      for (const [key, record] of fallback) {
        output.set(key, { hit: true, value: record.value, negative: record.negative });
      }
      for (const key of unique) {
        if (!output.has(key)) output.set(key, { hit: false, value: null, negative: false });
      }
      return output;
    }

    try {
      if (missing.length) {
        const records = await readManyFromDatabase(database, missing);
        for (const key of missing) {
          const record = normalizeRecord(records.get(key));
          if (!record) continue;
          if (record.expiresAt <= current) {
            expired.push(key);
            continue;
          }
          if (current - Number(record.lastUsedAt || 0) >= TOUCH_INTERVAL) {
            record.lastUsedAt = current;
            touches.push(record);
          }
          remember(record);
          output.set(key, { hit: true, value: record.value, negative: record.negative });
        }
      }
      if (expired.length) {
        persistentStats = await deleteRecordsFromDatabase(database, expired);
        forget(expired);
      }
      if (touches.length) {
        void writeRecordsToDatabase(database, touches).then((stats) => {
          persistentStats = stats;
        }).catch(() => {});
      }
    } catch {
      disableDatabase(database);
      const fallback = fallbackGetMany(missing);
      for (const [key, record] of fallback) {
        output.set(key, { hit: true, value: record.value, negative: record.negative });
      }
    }
    for (const key of unique) {
      if (!output.has(key)) output.set(key, { hit: false, value: null, negative: false });
    }
    return output;
  }

  async function get(key) {
    const safe = safeKey(key);
    if (!safe) return { hit: false, value: null, negative: false };
    const values = await getMany([safe]);
    return values.get(safe) || { hit: false, value: null, negative: false };
  }

  async function setMany(descriptors) {
    const current = Date.now();
    const indexed = new Map();
    for (const descriptor of Array.isArray(descriptors) ? descriptors : []) {
      const record = recordFromDescriptor(descriptor, current);
      if (record) indexed.set(record.key, record);
    }
    const records = [...indexed.values()];
    if (!records.length) return stats();
    for (const record of records) remember(record);

    const database = await openDatabase();
    if (!database) {
      fallbackPut(records);
      const fallbackStats = summarize([...fallbackEntries.values()]);
      return {
        backend,
        bytes: fallbackStats.bytes,
        records: fallbackStats.records,
        versions: fallbackStats.versions,
        lastPrunedAt: 0,
        limits: { bytes: MAX_BYTES, records: FALLBACK_LIMIT, versions: MAX_VERSIONS }
      };
    }
    try {
      persistentStats = await writeRecordsToDatabase(database, records);
      if (overLimit(persistentStats)) await maintainDatabase(database);
    } catch {
      disableDatabase(database);
      fallbackPut(records);
      const fallbackStats = summarize([...fallbackEntries.values()]);
      return {
        backend,
        bytes: fallbackStats.bytes,
        records: fallbackStats.records,
        versions: fallbackStats.versions,
        lastPrunedAt: 0,
        limits: { bytes: MAX_BYTES, records: FALLBACK_LIMIT, versions: MAX_VERSIONS }
      };
    }
    return {
      backend,
      bytes: persistentStats.bytes,
      records: persistentStats.records,
      versions: persistentStats.versions,
      lastPrunedAt: persistentStats.lastPrunedAt,
      limits: { bytes: MAX_BYTES, records: MAX_RECORDS, versions: MAX_VERSIONS }
    };
  }

  function set(key, value, options = {}) {
    return setMany([{ key, value, ...options }]);
  }

  async function clear() {
    memory.clear();
    fallbackEntries.clear();
    fallbackLoaded = true;
    removeLocalStorageDocuments();
    const database = await openDatabase();
    if (!database) {
      backend = typeof localStorage === "undefined" ? "memory" : "localStorage";
      return;
    }
    try {
      const next = emptyStats();
      await transaction(database, [ENTRY_STORE, META_STORE], "readwrite", (tx) => {
        tx.objectStore(ENTRY_STORE).clear();
        const meta = tx.objectStore(META_STORE);
        meta.clear();
        meta.put(next);
      });
      persistentStats = next;
    } catch {
      disableDatabase(database);
    }
  }

  async function stats() {
    const database = await openDatabase();
    if (database) {
      try {
        persistentStats = await readStatsFromDatabase(database);
      } catch {
        disableDatabase(database);
      }
    }
    if (backend === "indexeddb") {
      return {
        backend,
        bytes: persistentStats.bytes,
        records: persistentStats.records,
        versions: persistentStats.versions,
        lastPrunedAt: persistentStats.lastPrunedAt,
        limits: { bytes: MAX_BYTES, records: MAX_RECORDS, versions: MAX_VERSIONS }
      };
    }
    ensureFallbackLoaded();
    const fallbackStats = summarize([...fallbackEntries.values()]);
    return {
      backend,
      bytes: fallbackStats.bytes,
      records: fallbackStats.records,
      versions: fallbackStats.versions,
      lastPrunedAt: 0,
      limits: { bytes: MAX_BYTES, records: FALLBACK_LIMIT, versions: MAX_VERSIONS }
    };
  }

  Studio.identityCache = Object.freeze({
    TTL: Object.freeze({
      positive: POSITIVE_TTL,
      negative: NEGATIVE_TTL,
      search: SEARCH_TTL
    }),
    clear,
    deleteMany,
    get,
    getMany,
    planPrune,
    set,
    setMany,
    stats
  });
})();
