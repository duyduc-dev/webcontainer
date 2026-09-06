// VENDORED VERBATIM from Node.js v24.18.0 — lib/internal/events/symbols.js
// Source: https://github.com/nodejs/node/blob/v24.18.0/lib/internal/events/symbols.js
// Wrapped as a builtin factory. Runs unmodified over our internalBinding layer.
// Do not edit the body.
export default function (exports, require, module, process, internalBinding, primordials) {
'use strict';

const {
  Symbol,
} = primordials;

const kFirstEventParam = Symbol('kFirstEventParam');

module.exports = {
  kFirstEventParam,
};

}
