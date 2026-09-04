import { bootDWC } from "@dwc/core";

const dwc = bootDWC();

dwc.addEventListener("ready", (e) => {
  console.log("e");
});
