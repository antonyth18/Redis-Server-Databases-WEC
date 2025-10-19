'use strict';

const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

const DUMP_FILE = path.join(__dirname, 'dump.json');

function fnv1aHash(str) {
  let hash = 1469598103934665603n;
  const fnvPrime = 1099511628211n;
  for (let i = 0; i < str.length; ++i) {
    hash ^= BigInt(str.charCodeAt(i));
    hash *= fnvPrime;
    hash &= (1n << 52n) - 1n;
  }
  return Number(hash);
}

// ---------------- Entry ----------------
class Entry {
  constructor(key, value, hash) {
    this.key = key;
    this.value = value;
    this.hash = hash;
    this.expiry = null;
    this.next = null;
  }

  isExpired() {
    return this.expiry !== null && Date.now() >= this.expiry;
  }
}

// ---------------- KVStore ----------------
class KVStore {
  constructor(initialCapacity = 16) {
    this._cap = Math.max(4, initialCapacity);
    this._buckets = Array(this._cap).fill(null);
    this._size = 0;
    this._maxLoad = 0.75;

    this._loadFromDisk();

    setInterval(() => this._cleanupExpired(), 1000);

    setInterval(() => this._persistAsync(), 5000);
  }

  // ---------------- Persistence ----------------
  _persistAsync() {
    const data = {};
    for (const head of this._buckets) {
      let cur = head;
      while (cur) {
        if (!cur.isExpired()) {
          data[cur.key] = {
            value: cur.value,
            expiry: cur.expiry,
          };
        }
        cur = cur.next;
      }
    }

    const worker = new Worker(
      `
      const { parentPort } = require('worker_threads');
      const fs = require('fs');
      parentPort.on('message', ({ file, data }) => {
        fs.writeFile(file, JSON.stringify(data), err => {
          if (err) console.error('Persistence error:', err);
          parentPort.postMessage('done');
        });
      });
      `,
      { eval: true }
    );

    worker.postMessage({ file: DUMP_FILE, data });
    worker.on('message', () => worker.terminate());
  }

  _loadFromDisk() {
    if (!fs.existsSync(DUMP_FILE)) return;
    try {
      const raw = fs.readFileSync(DUMP_FILE, 'utf-8');
      const obj = JSON.parse(raw);
      for (const k in obj) {
        const e = obj[k];
        const entry = new Entry(k, e.value, fnv1aHash(k));
        entry.expiry = e.expiry;
        const idx = this._indexForHash(entry.hash);
        entry.next = this._buckets[idx];
        this._buckets[idx] = entry;
        this._size++;
      }
    } catch (err) {
      console.error('Failed to load persistence file:', err);
    }
  }

  // ---------------- Internal ----------------
  _cleanupExpired() {
    for (const head of this._buckets) {
      let prev = null;
      let cur = head;
      while (cur) {
        if (cur.isExpired()) {
          if (prev) prev.next = cur.next;
          else this._buckets[this._indexForHash(cur.hash)] = cur.next;
          this._size--;
        } else {
          prev = cur;
        }
        cur = cur.next;
      }
    }
  }

  _indexForHash(h) {
    return Math.abs(h) % this._cap;
  }

  _rehashIfNeeded() {
    if (this._size / this._cap <= this._maxLoad) return;
    this._rehash(this._cap * 2);
  }

  _rehash(newCap) {
    const oldBuckets = this._buckets;
    this._cap = newCap;
    this._buckets = Array(this._cap).fill(null);
    this._size = 0;
    for (const head of oldBuckets) {
      let cur = head;
      while (cur) {
        const next = cur.next;
        if (!cur.isExpired()) {
          cur.next = null;
          const idx = this._indexForHash(cur.hash);
          cur.next = this._buckets[idx];
          this._buckets[idx] = cur;
          this._size++;
        }
        cur = next;
      }
    }
  }

  _findNodeAndPrev(key) {
    const h = fnv1aHash(key);
    const idx = this._indexForHash(h);
    let prev = null;
    let cur = this._buckets[idx];
    while (cur) {
      if (cur.hash === h && cur.key === key) {
        if (cur.isExpired()) {
          if (prev) prev.next = cur.next;
          else this._buckets[idx] = cur.next;
          this._size--;
          return { node: null, prev, idx };
        }
        return { node: cur, prev, idx };
      }
      prev = cur;
      cur = cur.next;
    }
    return { node: null, prev, idx };
  }

  // ---------------- KVStore API ----------------
  set(key, value, exSeconds = null) {
    const h = fnv1aHash(key);
    const idx = this._indexForHash(h);
    let cur = this._buckets[idx];
    while (cur) {
      if (cur.hash === h && cur.key === key) {
        if (cur.isExpired()) {
          const n = new Entry(key, String(value), h);
          if (exSeconds !== null) n.expiry = Date.now() + exSeconds * 1000;
          n.next = cur.next;
          this._buckets[idx] = n;
          return true;
        } else {
          cur.value = String(value);
          cur.expiry = exSeconds === null ? null : Date.now() + exSeconds * 1000;
          return true;
        }
      }
      cur = cur.next;
    }

    const node = new Entry(key, String(value), h);
    if (exSeconds !== null) node.expiry = Date.now() + exSeconds * 1000;
    node.next = this._buckets[idx];
    this._buckets[idx] = node;
    this._size++;
    this._rehashIfNeeded();
    return true;
  }

  get(key) {
    const { node } = this._findNodeAndPrev(key);
    return node ? node.value : null;
  }

  del(key) {
    const h = fnv1aHash(key);
    const idx = this._indexForHash(h);
    let prev = null;
    let cur = this._buckets[idx];
    while (cur) {
      if (cur.hash === h && cur.key === key) {
        if (cur.isExpired()) {
          if (prev) prev.next = cur.next;
          else this._buckets[idx] = cur.next;
          this._size--;
          return 0;
        }
        if (prev) prev.next = cur.next;
        else this._buckets[idx] = cur.next;
        this._size--;
        return 1;
      }
      prev = cur;
      cur = cur.next;
    }
    return 0;
  }

  exists(key) {
    const { node } = this._findNodeAndPrev(key);
    return node ? 1 : 0;
  }

  keys(pattern = '*') {
    const out = [];
    for (const head of this._buckets) {
      let cur = head;
      while (cur) {
        if (!cur.isExpired()) out.push(cur.key);
        cur = cur.next;
      }
    }
    return out;
  }

  mset(pairs) {
    for (const key in pairs) this.set(key, pairs[key]);
    return 'OK';
  }

  mget(keys) {
    return keys.map(k => this.get(k) ?? null);
  }

  incr(key, delta = 1) {
    const curVal = this.get(key);
    let n;
    if (curVal === null) n = delta;
    else {
      if (!/^-?\d+$/.test(curVal)) throw new Error('Value is not an integer');
      n = parseInt(curVal, 10) + delta;
    }
    this.set(key, String(n));
    return n;
  }

  decr(key, delta = 1) {
    return this.incr(key, -delta);
  }

  append(key, suffix) {
    const cur = this.get(key) || '';
    const newv = cur + suffix;
    this.set(key, newv);
    return newv.length;
  }

  rename(oldKey, newKey) {
    const val = this.get(oldKey);
    if (val === null) return new Error('ERR no such key');
    this.set(newKey, val);
    this.del(oldKey);
    return 'OK';
  }

  expire(key, seconds) {
    const { node } = this._findNodeAndPrev(key);
    if (!node) return 0;
    node.expiry = Date.now() + seconds * 1000;
    return 1;
  }

  ttl(key) {
    const { node } = this._findNodeAndPrev(key);
    if (!node) return -2;
    if (node.expiry === null) return -1;
    const remain = Math.floor((node.expiry - Date.now()) / 1000);
    return remain < 0 ? -2 : remain;
  }

  persist(key) {
    const { node } = this._findNodeAndPrev(key);
    if (!node || node.expiry === null) return 0;
    node.expiry = null;
    return 1;
  }

  dbsize() {
    let cnt = 0;
    for (const head of this._buckets) {
      let cur = head;
      while (cur) {
        if (!cur.isExpired()) cnt++;
        cur = cur.next;
      }
    }
    return cnt;
  }

  flushAll() {
    this._buckets = Array(this._cap).fill(null);
    this._size = 0;
    return 'OK';
  }
}

module.exports = { KVStore };

