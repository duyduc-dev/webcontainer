import { bootDWC, DWCError } from "@dwc/core";

async function main() {
  try {
    const dwc = await bootDWC();

    dwc.diagnostics.onEvent((event) => {
      console.log("[dwc]", event.type, event.payload);
    });

    dwc.addEventListener("ready", (e) => {
      console.log("ready", e);
    });
  } catch (error) {
    if (error instanceof DWCError) {
      console.error(`[dwc] boot failed: ${error.code} - ${error.message}`);
      return;
    }
    throw error;
  }
}

main();
