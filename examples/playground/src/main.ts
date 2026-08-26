import { DuckWebContainer } from "@dwc/core";

const output = document.getElementById("output")!;

try {
  const dwc = DuckWebContainer.initialize();
  console.log("DuckWebContainer instantiated", dwc);
  output.textContent = "DuckWebContainer instantiated successfully.";
} catch (error) {
  console.error("Failed to instantiate DuckWebContainer", error);
  output.textContent = `Failed to instantiate DuckWebContainer: ${String(error)}`;
}
