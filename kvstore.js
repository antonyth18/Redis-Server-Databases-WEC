
'use strict';

const readline = require('readline');

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

function patternMatch(pattern, text) {
  let p = 0, t = 0, star = -1, match = 0;
  while (t < text.length) {
    if (p < pattern.length && (pattern[p] === text[t])) {
      p++; t++;
    } else if (p < pattern.length && pattern[p] === '*') {
      star = p++;
      match = t;
    } else if (star !== -1) {
      p = star + 1;
      t = ++match;
    } else {
      return false;
    }
  }
  while (p < pattern.length && pattern[p] === '*') p++;
  return p === pattern.length;
}

// ---------------- Entry (linked list node) ----------------
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

// ---------------- KVStore (hash table with separate chaining) ----------------
class KVStore {
  constructor(initialCapacity = 16) {
    this._cap = Math.max(4, initialCapacity);
    this._buckets = Array(this._cap).fill(null);
    this._size = 0;
    this._maxLoad = 0.75;
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
        if (!cur.isExpired() && patternMatch(pattern, cur.key)) {
          out.push(cur.key);
        }
        cur = cur.next;
      }
    }
    return out;
  }

  mset(pairs) {
      for (const key in pairs) {
          this.set(key, pairs[key]);
      }
      return 'OK';
  }

  mget(keys) {
    return keys.map(k => this.get(k) ?? null);
  }

  incr(key, delta = 1) {
    const curVal = this.get(key);
    let n;
    if (curVal === null) n = 0 + delta;
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
    if (!node) return 0;
    if (node.expiry === null) return 0;
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

function printHelp() {
  console.log(`Commands:
  SET key value [EX seconds]
  GET key
  DEL key
  EXISTS key
  KEYS pattern
  MSET k1 v1 k2 v2 ...
  MGET k1 k2 ...
  INCR key
  DECR key
  APPEND key suffix
  RENAME oldKey newKey
  EXPIRE key seconds
  TTL key
  PERSIST key
  DBSIZE
  FLUSHALL
  HELP
  QUIT / EXIT
`);
}

function parseAndRun(store, line) {
  const parts = line.trim().match(/"[^"]*"|'[^']*'|\S+/g) || [];
  const args = parts.map(s => {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
      return s.slice(1, -1);
    return s;
  });
  if (args.length === 0) return;
  const cmd = args[0].toUpperCase();
  try {
    switch (cmd) {
      case 'SET': {
        if (args.length < 3) { console.log('ERR wrong number of arguments for SET'); break; }
        let ex = null;
        if (args.length >= 5 && args[3].toUpperCase() === 'EX') ex = parseInt(args[4], 10);
        store.set(args[1], args[2], ex);
        console.log('OK');
        break;
      }
      case 'GET': {
        console.log(store.get(args[1]));
        break;
      }
      case 'DEL': {
        console.log(store.del(args[1]));
        break;
      }
      case 'EXISTS': {
        console.log(store.exists(args[1]));
        break;
      }
      case 'KEYS': {
        const pat = args[1] || '*';
        console.log(store.keys(pat));
        break;
      }
      case 'MSET': {
        const res = store.mset(args.slice(1));
        console.log(res);
        break;
      }
      case 'MGET': {
        console.log(store.mget(args.slice(1)));
        break;
      }
      case 'INCR': {
        console.log(store.incr(args[1]));
        break;
      }
      case 'DECR': {
        console.log(store.decr(args[1]));
        break;
      }
      case 'APPEND': {
        console.log(store.append(args[1], args[2] || ''));
        break;
      }
      case 'RENAME': {
        const r = store.rename(args[1], args[2]);
        if (r instanceof Error) console.log(r.message); else console.log(r);
        break;
      }
      case 'EXPIRE': {
        console.log(store.expire(args[1], parseInt(args[2], 10)));
        break;
      }
      case 'TTL': {
        console.log(store.ttl(args[1]));
        break;
      }
      case 'PERSIST': {
        console.log(store.persist(args[1]));
        break;
      }
      case 'DBSIZE': {
        console.log(store.dbsize());
        break;
      }
      case 'FLUSHALL': {
        console.log(store.flushAll());
        break;
      }
      case 'HELP': printHelp(); break;
      case 'QUIT':
      case 'EXIT':
        console.log('Bye'); process.exit(0); break;
      default:
        console.log('ERR unknown command. Type HELP');
    }
  } catch (err) {
    console.log('ERR', err.message || err);
  }
}

module.exports = { KVStore };
