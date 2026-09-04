import EventEmitter from "./events";
import pathModule from "./path";
import utilModule from "./util";

/** Bare specifiers resolved without going through the FS - checked before any relative/npm lookup. */
const builtinModules: Record<string, unknown> = {
  path: pathModule,
  events: EventEmitter,
  util: utilModule,
};

export { builtinModules };
