// internalBinding('tcp_wrap' | 'stream_wrap' | 'uv' | 'pipe_wrap' | 'cares_wrap')
// — the socket layer beneath Node's real lib/net.js.
//
// Node's net sits on native libuv handles (TCP) that expose the "StreamBase"
// contract consumed by internal/stream_base_commons: writeBuffer/write*String/
// writev + readStart/readStop + an `onread` callback driven through a shared
// `streamBaseState` array, plus listen/connect/onconnection for servers.
//
// We implement that contract as an **in-process loopback**: a module-level
// `port -> serverHandle` registry lets a TCP handle `connect()` to a `listen()`ing
// handle in the SAME process, producing a linked pair of endpoints whose writes
// appear as the peer's reads. This runs Node's unmodified lib/net.js end-to-end
// for the common case of a script talking to its own server.
//
// Cross-process: when a connect() targets a port/path this process doesn't
// serve, `netBridge` (if provided) relays it through the kernel to whichever
// process does — the same architectural pattern as the Phase 7 net-request/
// net-response fetch bridge, generalized to a persistent connection instead
// of one request/response. Our kernel link is plain async postMessage, not a
// synchronous Atomics.wait-backed bridge, so it can't retry listen() on a
// cross-process ephemeral-port conflict the way a synchronous kernel round-
// trip could: listen()/pipeListen() registration is fire-and-forget
// (best-effort — a same-process ephemeral-port conflict is still always
// correctly rejected via the local `listeners` Map, which is synchronous),
// and pipeConnect() returns a Promise instead of a synchronous connId, which
// fits libuv's own contract fine since uv_tcp_connect() itself only ever
// returns "pending" (0) or an immediate local failure — the real connection
// always completes later via a callback, exactly what a Promise resolving
// in a later turn already gives us.

import { isIPv4, isIPv6, parseIPv6 } from "./ip";
import { errname, getErrorMap, UV_CODES } from "./uvErrors";

type Task = (...args: unknown[]) => void;

interface BufferLike extends Uint8Array {
  toString(encoding?: string): string;
}
interface BufferStatic {
  from(data: string | Uint8Array, encoding?: string): BufferLike;
  concat(chunks: Uint8Array[]): BufferLike;
  isBuffer(value: unknown): value is BufferLike;
}

interface PipeRelayMessage {
  type: "pipe-open" | "pipe-data" | "pipe-shutdown" | "pipe-close";
  connId: number;
  path?: string;
  chunk?: Uint8Array;
}

/** The kernel relay for cross-process net. Undefined means same-process-only
 * net — still fully functional for a script that both listens and connects
 * to its own server. */
interface NetBridge {
  listen(port: number): void;
  closeServer(port: number): void;
  pipeListen(key: string): void;
  pipeCloseServer(key: string): void;
  pipeConnect(key: string): Promise<{ connId: number }>;
  postRaw(msg: PipeRelayMessage): void;
  onMessage(handler: (msg: PipeRelayMessage) => void): void;
}

interface NetBindingContext {
  process: { nextTick(fn: Task, ...args: unknown[]): void };
  queueClose(fn: Task, ...args: unknown[]): void;
  ref(): void;
  unref(): void;
  netBridge?: NetBridge;
}

interface NetBindings {
  tcp_wrap: unknown;
  stream_wrap: unknown;
  uv: unknown;
  pipe_wrap: unknown;
  cares_wrap: unknown;
}

const createNetBindings = (context: NetBindingContext): NetBindings => {
  const { process, queueClose, ref, unref, netBridge } = context;
  const nextTick = (fn: Task, ...args: unknown[]): void => process.nextTick(fn, ...args);
  // A handle's close callback must NOT run on the plain nextTick queue — see
  // eventLoop.ts's queueClose doc comment for the close-before-error ordering
  // bug this avoids (lib/http.js depends on the gap).
  const closePhase = queueClose;
  const buf = (): BufferStatic => (globalThis as unknown as { Buffer: BufferStatic }).Buffer;

  // ---- uv: error constants (Linux errno-negated, matching libuv) ------------
  const uv = { ...UV_CODES, errname, getErrorMap };

  // ---- stream_wrap: the shared read/write scratch state ----------------------
  const kReadBytesOrError = 0;
  const kArrayBufferOffset = 1;
  const kBytesWritten = 2;
  const kLastWriteWasAsync = 3;
  const streamBaseState = [0, 0, 0, 0];

  class WriteWrap {
    [key: string]: unknown;
  }
  class ShutdownWrap {
    [key: string]: unknown;
  }

  const stream_wrap = {
    WriteWrap,
    ShutdownWrap,
    streamBaseState,
    kReadBytesOrError,
    kArrayBufferOffset,
    kBytesWritten,
    kLastWriteWasAsync,
  };

  // ---- tcp_wrap: the loopback TCP handle ------------------------------------
  const TCPConstants = { SOCKET: 0, SERVER: 1, UV_TCP_IPV6ONLY: 1, UV_TCP_REUSEPORT: 2 };
  const listeners = new Map<number, TCP>();
  let ephemeral = 49152;
  const allocPort = (): number => {
    do {
      ephemeral = ephemeral >= 65535 ? 49152 : ephemeral + 1;
    } while (listeners.has(ephemeral));
    return ephemeral;
  };
  // Synthetic pipe path a TCP port is advertised under for CROSS-PROCESS dials.
  // The NUL prefix keeps it out of the real socket-path namespace.
  const TCP_XKEY_PREFIX = "\u0000dwc-tcp:";
  const tcpXKey = (port: number): string => `${TCP_XKEY_PREFIX}${port >>> 0}`;
  const portFromTcpXKey = (key: string): number | null =>
    key.startsWith(TCP_XKEY_PREFIX) ? Number(key.slice(TCP_XKEY_PREFIX.length)) : null;

  // ---- who is a legitimate connect() destination? ---------------------------
  // The virtual network is loopback-only: connecting successfully to the WRONG
  // machine (because a hostname was flattened to 127.0.0.1 by dns.js and then
  // happened to match a port some in-VM server owns) is worse than failing, so
  // the destination is checked and anything genuinely external is rejected.
  const isLoopbackAddress = (addr: unknown): boolean => {
    if (!addr) return true;
    const a = String(addr).toLowerCase();
    if (a.startsWith("::ffff:")) return isLoopbackAddress(a.slice(7));
    return a === "::1" || a === "::" || a === "0.0.0.0" || /^127\./.test(a);
  };
  const isLocalHostname = (host: unknown): boolean => {
    const h = String(host)
      .toLowerCase()
      .replace(/\.$/, "");
    if (h === "" || h === "localhost" || h.endsWith(".localhost")) return true;
    return isLoopbackAddress(h);
  };
  // The hostname the caller actually asked for, or null when it dialled an IP.
  // lib/net.js runs dns.lookup FIRST and hands connect() the resolved address,
  // stashing the original on the Socket as `_host` and the Socket on the handle
  // under `owner_symbol` (minted in internal/events/symbols.js — found here by
  // description since the binding layer has no way to require it directly).
  let ownerSymbol: symbol | null = null;
  const requestedHost = (handle: TCP | Pipe): string | null => {
    let sym = ownerSymbol;
    if (!sym || (handle as unknown as Record<symbol, unknown>)[sym] === undefined) {
      sym = Object.getOwnPropertySymbols(handle).find((s) => s.description === "owner_symbol") ?? null;
      if (!sym) return null;
      ownerSymbol = sym;
    }
    const socket = (handle as unknown as Record<symbol, { _host?: unknown }>)[sym];
    const host = socket && socket._host;
    return typeof host === "string" && host ? host : null;
  };

  const EOF = Symbol("EOF");
  type Endpoint = TCP | Pipe;

  const deliver = (handle: Endpoint): void => {
    while (handle.reading && handle._inbox.length && !handle._closed) {
      const item = handle._inbox[0];
      if (item === EOF) {
        handle._inbox.shift();
        streamBaseState[kReadBytesOrError] = UV_CODES.UV_EOF!;
        if (handle.onread) handle.onread.call(handle, undefined);
        return;
      }
      handle._inbox.shift();
      const chunk = item as Uint8Array;
      handle.bytesRead += chunk.byteLength;
      streamBaseState[kReadBytesOrError] = chunk.byteLength;
      streamBaseState[kArrayBufferOffset] = chunk.byteOffset;
      if (handle.onread) handle.onread.call(handle, chunk.buffer);
    }
  };

  const schedulePump = (handle: Endpoint): void => {
    if (handle._pumpScheduled || handle._closed) return;
    handle._pumpScheduled = true;
    nextTick(() => {
      handle._pumpScheduled = false;
      deliver(handle);
    });
  };

  const enqueueToPeer = (peer: Endpoint | null, chunk: Uint8Array | typeof EOF): void => {
    if (!peer || peer._closed) return;
    peer._inbox.push(chunk);
    schedulePump(peer);
  };

  const doWrite = (handle: Endpoint, _req: unknown, bytes: Uint8Array): number => {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    streamBaseState[kBytesWritten] = copy.byteLength;
    streamBaseState[kLastWriteWasAsync] = 0;
    if (handle._xproc) {
      if (netBridge && !handle._closed) netBridge.postRaw({ type: "pipe-data", connId: handle._connId, chunk: copy });
      return 0;
    }
    if (handle._peer && !handle._peer._closed) enqueueToPeer(handle._peer, copy);
    return 0;
  };

  class TCP {
    type: number;
    reading = false;
    onread: ((this: TCP | Pipe, buffer: ArrayBufferLike | undefined) => void) | null = null;
    onconnection: ((status: number, peer: TCP | Pipe) => void) | null = null;
    _peer: TCP | null = null;
    _inbox: (Uint8Array | typeof EOF)[] = [];
    _closed = false;
    _pumpScheduled = false;
    _refed = true;
    _live = false;
    _counted = false;
    _kernelPort: number | null = null;
    _kernelPipe: string | null = null;
    _xproc = false;
    _connId = 0;
    _localAddress = "0.0.0.0";
    _localPort = 0;
    _remoteAddress = "";
    _remotePort = 0;
    _family = "IPv4";
    bytesRead = 0;
    writeQueueSize = 0;

    constructor(type: number) {
      this.type = type;
    }

    bind(address: string, port: number): number {
      this._localAddress = address;
      this._localPort = port >>> 0;
      return 0;
    }
    bind6(address: string, port: number): number {
      this._family = "IPv6";
      return this.bind(address, port);
    }

    listen(): number {
      const wasEphemeral = this._localPort === 0;
      if (!wasEphemeral && listeners.has(this._localPort)) return UV_CODES.UV_EADDRINUSE!;
      if (wasEphemeral) this._localPort = allocPort();

      if (netBridge) {
        // Best-effort cross-process registration (fire-and-forget — see the
        // file header for why this can't retry on a cross-process ephemeral
        // conflict the way a synchronous kernel bridge could).
        netBridge.listen(this._localPort);
        this._kernelPort = this._localPort;
        const key = tcpXKey(this._localPort);
        netBridge.pipeListen(key);
        pipeServers.set(key, this);
        this._kernelPipe = key;
      }

      listeners.set(this._localPort, this);
      this._live = true;
      recount(this);
      return 0;
    }

    connect(req: ConnectReq, address: string, port: number): number {
      const p = port >>> 0;
      const host = requestedHost(this);
      const unreachable = host === null ? (isLoopbackAddress(address) ? 0 : UV_CODES.UV_EHOSTUNREACH!) : isLocalHostname(host) ? 0 : UV_CODES.UV_ENOTFOUND!;
      if (unreachable) {
        this._remoteAddress = address;
        this._remotePort = p;
        if (host !== null) req.address = host;
        nextTick(() => req.oncomplete(unreachable, this, req, false, false));
        return 0;
      }
      const server = listeners.get(p);
      this._remoteAddress = address;
      this._remotePort = p;
      this._localAddress = "127.0.0.1";
      this._localPort = allocPort();
      if (!server || server._closed) {
        if (netBridge) {
          netBridge.pipeConnect(tcpXKey(p)).then(
            ({ connId }) => {
              if (this._closed) return;
              if (connId > 0) {
                this._xproc = true;
                this._connId = connId;
                xpipeConns.set(connId, this);
                this._live = true;
                recount(this);
                req.oncomplete(0, this, req, true, true);
              } else {
                req.oncomplete(UV_CODES.UV_ECONNREFUSED!, this, req, false, false);
              }
            },
            () => {
              if (!this._closed) req.oncomplete(UV_CODES.UV_ECONNREFUSED!, this, req, false, false);
            },
          );
          return 0;
        }
        nextTick(() => req.oncomplete(UV_CODES.UV_ECONNREFUSED!, this, req, false, false));
        return 0;
      }
      const peer = new TCP(TCPConstants.SOCKET);
      peer._localAddress = address;
      peer._localPort = port >>> 0;
      peer._remoteAddress = "127.0.0.1";
      peer._remotePort = this._localPort;
      this._peer = peer;
      peer._peer = this;
      nextTick(() => {
        if (server._closed) {
          req.oncomplete(UV_CODES.UV_ECONNREFUSED!, this, req, false, false);
          return;
        }
        this._live = true;
        recount(this);
        peer._live = true;
        recount(peer);
        server.onconnection!(0, peer);
        req.oncomplete(0, this, req, true, true);
      });
      return 0;
    }
    connect6(req: ConnectReq, address: string, port: number): number {
      return this.connect(req, address, port);
    }

    readStart(): number {
      this.reading = true;
      schedulePump(this);
      return 0;
    }
    readStop(): number {
      this.reading = false;
      return 0;
    }

    writeBuffer(req: unknown, data: Uint8Array): number {
      return doWrite(this, req, data);
    }
    writeLatin1String(req: unknown, str: string): number {
      return doWrite(this, req, buf().from(str, "latin1"));
    }
    writeUtf8String(req: unknown, str: string): number {
      return doWrite(this, req, buf().from(str, "utf8"));
    }
    writeAsciiString(req: unknown, str: string): number {
      return doWrite(this, req, buf().from(str, "ascii"));
    }
    writeUcs2String(req: unknown, str: string): number {
      return doWrite(this, req, buf().from(str, "ucs2"));
    }
    writev(req: unknown, chunks: unknown[], allBuffers: boolean): number {
      const parts: Uint8Array[] = [];
      if (allBuffers) {
        for (const chunk of chunks) parts.push(chunk as Uint8Array);
      } else {
        for (let i = 0; i < chunks.length; i += 2) {
          const chunk = chunks[i];
          const enc = chunks[i + 1] as string;
          parts.push(typeof chunk === "string" ? buf().from(chunk, enc) : (chunk as Uint8Array));
        }
      }
      const merged = buf().concat(parts.map((p) => (buf().isBuffer(p) ? p : buf().from(p as unknown as string))));
      return doWrite(this, req, merged);
    }

    shutdown(req: { oncomplete: (status: number) => void }): number {
      if (this._xproc) {
        if (netBridge) netBridge.postRaw({ type: "pipe-shutdown", connId: this._connId });
      } else if (this._peer && !this._peer._closed) {
        enqueueToPeer(this._peer, EOF);
      }
      nextTick(() => req.oncomplete(0));
      return 0;
    }

    close(cb?: Task): void {
      if (!this._closed) {
        this._closed = true;
        recount(this);
        if (this.type === TCPConstants.SERVER) {
          listeners.delete(this._localPort);
          if (this._kernelPort != null && netBridge) {
            netBridge.closeServer(this._kernelPort);
            this._kernelPort = null;
          }
          if (this._kernelPipe != null) {
            if (pipeServers.get(this._kernelPipe) === this) pipeServers.delete(this._kernelPipe);
            if (netBridge) netBridge.pipeCloseServer(this._kernelPipe);
            this._kernelPipe = null;
          }
        }
        if (this._xproc) {
          if (netBridge) netBridge.postRaw({ type: "pipe-close", connId: this._connId });
          xpipeConns.delete(this._connId);
        }
        if (this._peer && !this._peer._closed) enqueueToPeer(this._peer, EOF);
      }
      if (typeof cb === "function") closePhase(cb);
    }

    getsockname(out: { address: string; port: number; family: string }): number {
      out.address = this._localAddress;
      out.port = this._localPort;
      out.family = this._family;
      return 0;
    }
    getpeername(out: { address: string; port: number; family: string }): number {
      if (!this._remotePort) return UV_CODES.UV_ENOTCONN!;
      out.address = this._remoteAddress;
      out.port = this._remotePort;
      out.family = this._family;
      return 0;
    }

    setNoDelay(): number {
      return 0;
    }
    setKeepAlive(): number {
      return 0;
    }
    ref(): void {
      this._refed = true;
      recount(this);
    }
    unref(): void {
      this._refed = false;
      recount(this);
    }
    hasRef(): boolean {
      return this._refed;
    }
    getAsyncId(): number {
      return 1;
    }
  }

  interface ConnectReq {
    address?: string;
    oncomplete: (status: number, handle: TCP | Pipe, req: unknown, readable: boolean, writable: boolean) => void;
  }

  class TCPConnectWrap {
    [key: string]: unknown;
  }

  const tcp_wrap = { TCP, TCPConnectWrap, constants: TCPConstants, isLocalDestination: isLocalHostname };

  /** Shared liveness accounting: a listening/connected handle keeps the
   * process alive (libuv "active handles"), reflected through the event
   * loop's ref()/unref() — the same primitive Phase 7's network requests use. */
  function recount(h: Endpoint): void {
    const on = !!h._live && h._refed && !h._closed;
    if (on === h._counted) return;
    h._counted = on;
    if (on) ref();
    else unref();
  }

  // ---- pipe_wrap: in-process UNIX-domain-socket / named-pipe loopback --------
  const PipeConstants = { SOCKET: 0, SERVER: 1, IPC: 2 };
  const pipeServers = new Map<string, TCP | Pipe>();
  const xpipeConns = new Map<number, TCP | Pipe>();

  class Pipe {
    type: number;
    reading = false;
    onread: ((this: TCP | Pipe, buffer: ArrayBufferLike | undefined) => void) | null = null;
    onconnection: ((status: number, peer: TCP | Pipe) => void) | null = null;
    _peer: Pipe | null = null;
    _inbox: (Uint8Array | typeof EOF)[] = [];
    _closed = false;
    _pumpScheduled = false;
    _refed = true;
    _live = false;
    _counted = false;
    _pipePath: string | null = null;
    _remotePath = "";
    _kernelPipe: string | null = null;
    _xproc = false;
    _connId = 0;
    bytesRead = 0;
    writeQueueSize = 0;

    constructor(type: number) {
      this.type = type;
    }

    bind(path: string): number {
      this._pipePath = String(path);
      return 0;
    }

    listen(): number {
      if (this._pipePath == null) return UV_CODES.UV_EINVAL!;
      if (pipeServers.has(this._pipePath)) return UV_CODES.UV_EADDRINUSE!;
      if (netBridge) {
        netBridge.pipeListen(this._pipePath);
        this._kernelPipe = this._pipePath;
      }
      pipeServers.set(this._pipePath, this);
      this._live = true;
      recount(this);
      return 0;
    }

    connect(req: ConnectReq, path: string): number {
      const target = String(path);
      this._pipePath = "";
      this._remotePath = target;
      const server = pipeServers.get(target);
      if (server && !server._closed) {
        const peer = new Pipe(PipeConstants.SOCKET);
        peer._pipePath = target;
        peer._remotePath = target;
        this._peer = peer;
        peer._peer = this;
        nextTick(() => {
          if (server._closed) {
            req.oncomplete(UV_CODES.UV_ECONNREFUSED!, this, req, false, false);
            return;
          }
          this._live = true;
          recount(this);
          peer._live = true;
          recount(peer);
          (server as Pipe).onconnection!(0, peer);
          req.oncomplete(0, this, req, true, true);
        });
        return 0;
      }
      if (netBridge) {
        netBridge.pipeConnect(target).then(
          ({ connId }) => {
            if (this._closed) return;
            if (connId > 0) {
              this._xproc = true;
              this._connId = connId;
              xpipeConns.set(connId, this);
              this._live = true;
              recount(this);
              req.oncomplete(0, this, req, true, true);
            } else {
              req.oncomplete(UV_CODES.UV_ENOENT!, this, req, false, false);
            }
          },
          () => {
            if (!this._closed) req.oncomplete(UV_CODES.UV_ENOENT!, this, req, false, false);
          },
        );
        return 0;
      }
      nextTick(() => req.oncomplete(UV_CODES.UV_ENOENT!, this, req, false, false));
      return 0;
    }

    readStart(): number {
      this.reading = true;
      schedulePump(this);
      return 0;
    }
    readStop(): number {
      this.reading = false;
      return 0;
    }

    writeBuffer(req: unknown, data: Uint8Array): number {
      return doWrite(this, req, data);
    }
    writeLatin1String(req: unknown, str: string): number {
      return doWrite(this, req, buf().from(str, "latin1"));
    }
    writeUtf8String(req: unknown, str: string): number {
      return doWrite(this, req, buf().from(str, "utf8"));
    }
    writeAsciiString(req: unknown, str: string): number {
      return doWrite(this, req, buf().from(str, "ascii"));
    }
    writeUcs2String(req: unknown, str: string): number {
      return doWrite(this, req, buf().from(str, "ucs2"));
    }
    writev(req: unknown, chunks: unknown[], allBuffers: boolean): number {
      const parts: Uint8Array[] = [];
      if (allBuffers) {
        for (const chunk of chunks) parts.push(chunk as Uint8Array);
      } else {
        for (let i = 0; i < chunks.length; i += 2) {
          const chunk = chunks[i];
          const enc = chunks[i + 1] as string;
          parts.push(typeof chunk === "string" ? buf().from(chunk, enc) : (chunk as Uint8Array));
        }
      }
      const merged = buf().concat(parts.map((p) => (buf().isBuffer(p) ? p : buf().from(p as unknown as string))));
      return doWrite(this, req, merged);
    }

    shutdown(req: { oncomplete: (status: number) => void }): number {
      if (this._xproc) {
        if (netBridge) netBridge.postRaw({ type: "pipe-shutdown", connId: this._connId });
      } else if (this._peer && !this._peer._closed) {
        enqueueToPeer(this._peer, EOF);
      }
      nextTick(() => req.oncomplete(0));
      return 0;
    }

    close(cb?: Task): void {
      if (!this._closed) {
        this._closed = true;
        recount(this);
        if (this.type === PipeConstants.SERVER && this._pipePath != null) {
          if (pipeServers.get(this._pipePath) === this) pipeServers.delete(this._pipePath);
          if (this._kernelPipe != null && netBridge) {
            netBridge.pipeCloseServer(this._kernelPipe);
            this._kernelPipe = null;
          }
        }
        if (this._xproc) {
          if (netBridge) netBridge.postRaw({ type: "pipe-close", connId: this._connId });
          xpipeConns.delete(this._connId);
        } else if (this._peer && !this._peer._closed) {
          enqueueToPeer(this._peer, EOF);
        }
      }
      if (typeof cb === "function") closePhase(cb);
    }

    getsockname(out: { address: string }): number {
      out.address = this._pipePath || "";
      return 0;
    }
    getpeername(out: { address: string }): number {
      if (!this._remotePath) return UV_CODES.UV_ENOTCONN!;
      out.address = this._remotePath;
      return 0;
    }

    setNoDelay(): number {
      return 0;
    }
    setKeepAlive(): number {
      return 0;
    }
    ref(): void {
      this._refed = true;
      recount(this);
    }
    unref(): void {
      this._refed = false;
      recount(this);
    }
    hasRef(): boolean {
      return this._refed;
    }
    getAsyncId(): number {
      return 1;
    }
    fchmod(): number {
      return 0;
    }
    setPendingInstances(): number {
      return 0;
    }
  }
  class PipeConnectWrap {
    [key: string]: unknown;
  }
  const pipe_wrap = { Pipe, PipeConnectWrap, constants: PipeConstants };

  /** Routes a kernel-relayed cross-process pipe message to the right local
   * endpoint. `pipe-open` = a client in another process dialed a server we
   * host; `pipe-data`/`pipe-shutdown`/`pipe-close` feed an existing endpoint. */
  function dispatchPipe(msg: PipeRelayMessage): void {
    if (!msg) return;
    const connId = msg.connId | 0;
    if (msg.type === "pipe-open") {
      const server = pipeServers.get(String(msg.path));
      if (!server || server._closed) {
        if (netBridge) netBridge.postRaw({ type: "pipe-close", connId });
        return;
      }
      const peer: TCP | Pipe = server instanceof TCP ? new TCP(TCPConstants.SOCKET) : new Pipe(PipeConstants.SOCKET);
      peer._xproc = true;
      peer._connId = connId;
      if (peer instanceof Pipe) {
        peer._remotePath = String(msg.path);
      } else {
        // getpeername()/getsockname() must report non-null values once accepted:
        // real Node's net.js queries them while wrapping the raw handle into a
        // net.Socket, and TCP.getpeername() treats _remotePort===0 as ENOTCONN
        // (matching libuv), which made an accepted cross-process connection look
        // invalid and get destroyed before any data ever flowed. There's no real
        // remote port to report (the dialer lives in another process, in another
        // realm entirely), so a synthetic-but-never-zero one is used - nothing in
        // this virtual network dials back out on it.
        const localPort = portFromTcpXKey(String(msg.path));
        peer._localAddress = "127.0.0.1";
        if (localPort != null) peer._localPort = localPort;
        peer._remoteAddress = "127.0.0.1";
        peer._remotePort = 40000 + (connId % 20000);
      }
      xpipeConns.set(connId, peer);
      peer._live = true;
      recount(peer);
      nextTick(() => {
        if (server._closed || peer._closed) return;
        (server.onconnection as (status: number, peer: TCP | Pipe) => void)(0, peer);
      });
      return;
    }
    const ep = xpipeConns.get(connId);
    if (!ep) return;
    if (msg.type === "pipe-data") {
      let chunk = msg.chunk;
      if (chunk && !(chunk instanceof Uint8Array)) chunk = new Uint8Array(chunk);
      if (chunk && chunk.byteLength) enqueueToPeer(ep, chunk);
    } else if (msg.type === "pipe-shutdown") {
      ep._inbox.push(EOF);
      schedulePump(ep);
    } else if (msg.type === "pipe-close") {
      ep._inbox.push(EOF);
      schedulePump(ep);
      xpipeConns.delete(connId);
    }
  }
  if (netBridge) netBridge.onMessage(dispatchPipe);

  // ---- cares_wrap: DNS binding. Real name resolution is deferred (loopback
  // connects by IPv4 literal), but the address helpers must be real: lib/net.js
  // calls convertIpv6StringToBuffer() while computing a server's listen
  // address (e.g. when a name resolves to `::1`).
  const cares_wrap = {
    convertIpv6StringToBuffer: parseIPv6,
    isIP: (s: string): number => (isIPv4(s) ? 4 : isIPv6(s) ? 6 : 0),
    isIPv4,
    isIPv6,
  };

  return { tcp_wrap, stream_wrap, uv, pipe_wrap, cares_wrap };
};

export { createNetBindings };
export type { NetBindingContext, NetBridge, PipeRelayMessage };
