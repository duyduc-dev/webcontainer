import { dispatchMessage } from "./service";

self.onmessage = (event) => {
  const data = event.data;

  if (data.type === "ping") {
    dispatchMessage("pong");
    return;
  }

  if (data.type === "initialize") {
    initialize();
    return;
  }
};

function initialize() {}
