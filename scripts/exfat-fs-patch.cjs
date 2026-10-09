/**
 * exFAT filesystem patch — preload with `node -r scripts/exfat-fs-patch.cjs`.
 *
 * A:\ (the project drive) is exFAT: no symlink/reparse-point support and
 * non-standard mkdir semantics. Node calls misbehave there:
 *
 *   fs.readlink(path)  → EISDIR for *every* path (should be EINVAL, since
 *                        exFAT can never contain a symlink)
 *   fs.mkdir(dir)      → intermittent EPERM when the dir already exists
 *                        or immediately after its parent was created
 *
 * The first breaks webpack/enhanced-resolve and Next's build tracing; the
 * second breaks `mkdir .next/types`. This preload normalizes both.
 *
 * Local-only workaround — Vercel builds on Linux and never sees this.
 */
const fs = require("fs");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function einval(syscall, p) {
  const e = new Error(`EINVAL: invalid argument, ${syscall} '${p}'`);
  e.code = "EINVAL";
  e.errno = -4071;
  e.syscall = syscall;
  e.path = p;
  return e;
}

/* ---------- readlink: EISDIR → EINVAL (exFAT has no symlinks) ---------- */

const origReadlink = fs.readlink;
fs.readlink = function (p, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = undefined;
  }
  return origReadlink.call(this, p, options, (err, res) => {
    if (err && err.code === "EISDIR") err = einval("readlink", p);
    callback(err, res);
  });
};

const origReadlinkSync = fs.readlinkSync;
fs.readlinkSync = function (p, options) {
  try {
    return origReadlinkSync.call(this, p, options);
  } catch (e) {
    if (e.code === "EISDIR") throw einval("readlink", p);
    throw e;
  }
};

const origPromiseReadlink = fs.promises.readlink;
fs.promises.readlink = async function (p, options) {
  try {
    return await origPromiseReadlink.call(this, p, options);
  } catch (e) {
    if (e.code === "EISDIR") throw einval("readlink", p);
    throw e;
  }
};

/* ---------- mkdir: retry/normalize transient EPERM ---------- */

function isExistingDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function eexist(syscall, p) {
  const e = new Error(`EEXIST: file already exists, ${syscall} '${p}'`);
  e.code = "EEXIST";
  e.errno = -4075;
  e.syscall = syscall;
  e.path = p;
  return e;
}

const origMkdir = fs.mkdir;
fs.mkdir = function (p, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = undefined;
  }
  const attempt = (n) =>
    origMkdir.call(this, p, options, (err, res) => {
      if (err && err.code === "EPERM") {
        if (isExistingDir(p)) {
          // exFAT reports EPERM instead of EEXIST on existing dirs
          if (options && options.recursive) return callback(null, res);
          return callback(eexist("mkdir", p));
        }
        if (n < 10) return void setTimeout(() => attempt(n + 1), 25 * (n + 1));
      }
      callback(err, res);
    });
  return attempt(0);
};

const origMkdirSync = fs.mkdirSync;
fs.mkdirSync = function (p, options) {
  for (let i = 0; ; i++) {
    try {
      return origMkdirSync.call(this, p, options);
    } catch (e) {
      if (e.code === "EPERM") {
        if (isExistingDir(p)) {
          if (options && options.recursive) return undefined;
          throw eexist("mkdir", p);
        }
        if (i < 10) continue;
      }
      throw e;
    }
  }
};

const origPromiseMkdir = fs.promises.mkdir;
fs.promises.mkdir = async function (p, options) {
  for (let i = 0; ; i++) {
    try {
      return await origPromiseMkdir.call(this, p, options);
    } catch (e) {
      if (e.code === "EPERM") {
        if (isExistingDir(p)) {
          if (options && options.recursive) return undefined;
          throw eexist("mkdir", p);
        }
        if (i < 10) {
          await sleep(25 * (i + 1));
          continue;
        }
      }
      throw e;
    }
  }
};

/* ---------- generic EPERM retry (AV/locking on exFAT) ---------- */

const RETRY_OPS = [
  "open", "readFile", "writeFile", "appendFile", "copyFile", "rename",
  "unlink", "rm", "rmdir", "truncate", "stat", "lstat", "access",
  "readdir", "realpath", "cp", "utimes", "chmod",
];
const RETRIES = 12;

// Callback-style fs.*
for (const name of RETRY_OPS) {
  const orig = fs[name];
  if (typeof orig !== "function") continue;
  fs[name] = function (...args) {
    const cb = args[args.length - 1];
    if (typeof cb !== "function") return orig.apply(this, args);
    const attempt = (n) =>
      orig.apply(this, [
        ...args.slice(0, -1),
        (err, ...rest) => {
          if (err && err.code === "EPERM" && n < RETRIES) {
            return void setTimeout(() => attempt(n + 1), 20 * (n + 1));
          }
          cb(err, ...rest);
        },
      ]);
    return attempt(0);
  };
}

// Sync fs.*Sync
for (const name of RETRY_OPS) {
  const orig = fs[name + "Sync"];
  if (typeof orig !== "function") continue;
  fs[name + "Sync"] = function (...args) {
    for (let i = 0; ; i++) {
      try {
        return orig.apply(this, args);
      } catch (e) {
        if (e.code === "EPERM" && i < RETRIES) continue;
        throw e;
      }
    }
  };
}

// Promise-style fs.promises.*
for (const name of RETRY_OPS) {
  const orig = fs.promises[name];
  if (typeof orig !== "function") continue;
  fs.promises[name] = async function (...args) {
    for (let i = 0; ; i++) {
      try {
        return await orig.apply(this, args);
      } catch (e) {
        if (e.code === "EPERM" && i < RETRIES) {
          await sleep(20 * (i + 1));
          continue;
        }
        throw e;
      }
    }
  };
}

/* ---------- .next/trace: diagnostics file that AV loves to lock ----------
   A failed trace write must never kill the dev server — it is optional
   telemetry. Swallow stream errors and redirect direct opens to a sidecar. */

const DIAG_FILE = /[\\/]\.next[\\/]trace$/;
const isDiag = (p) => DIAG_FILE.test(String(p));

// createWriteStream emits 'error' events → uncaughtException with no listener
const origCreateWriteStream = fs.createWriteStream;
fs.createWriteStream = function (p, options) {
  const ws = origCreateWriteStream.call(this, p, options);
  if (isDiag(p)) ws.on("error", () => {});
  return ws;
};

// fs.open / openSync / promises.open on the trace file → sidecar fallback
const origOpenCb = fs.open;
fs.open = function (p, ...rest) {
  const cb = rest[rest.length - 1];
  if (isDiag(p) && typeof cb === "function") {
    return origOpenCb.call(this, p, ...rest.slice(0, -1), (err, fd) => {
      if (err && (err.code === "EPERM" || err.code === "EBUSY")) {
        return origOpenCb.call(this, p + ".fb", ...rest.slice(0, -1), cb);
      }
      cb(err, fd);
    });
  }
  return origOpenCb.call(this, p, ...rest);
};

const origOpenSync = fs.openSync;
fs.openSync = function (p, ...rest) {
  try {
    return origOpenSync.call(this, p, ...rest);
  } catch (e) {
    if (isDiag(p) && (e.code === "EPERM" || e.code === "EBUSY")) {
      return origOpenSync.call(this, p + ".fb", ...rest);
    }
    throw e;
  }
};

const origPromiseOpen = fs.promises.open;
fs.promises.open = async function (p, ...rest) {
  try {
    return await origPromiseOpen.call(this, p, ...rest);
  } catch (e) {
    if (isDiag(p) && (e.code === "EPERM" || e.code === "EBUSY")) {
      return origPromiseOpen.call(this, p + ".fb", ...rest);
    }
    throw e;
  }
};
