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

    await dwc.fs.mount({
      "hello.txt": { file: { contents: "Hello, duck-webcontainer!" } },
      src: {
        directory: {
          "index.js": { file: { contents: "console.log('hi');\n" } },
        },
      },
    });

    const contents = await dwc.fs.readFile("/hello.txt");
    console.log("[dwc] readFile /hello.txt ->", new TextDecoder().decode(contents));

    const entries = await dwc.fs.readdir("/src");
    console.log("[dwc] readdir /src ->", entries);
  } catch (error) {
    if (error instanceof DWCError) {
      console.error(`[dwc] boot failed: ${error.code} - ${error.message}`);
      return;
    }
    throw error;
  }
}

main();
