import { DuckWebContainer } from "@dwc/core";

const output = document.getElementById("output")!;

const main = async () => {
  try {
    const dwc = DuckWebContainer.initialize();
    console.log("DuckWebContainer instantiated", dwc);
    output.textContent = "DuckWebContainer instantiated successfully.";

    await dwc.fs.mkdir("/project", { recursive: true });
    await dwc.fs.writeFile("/project/hello.txt", "hello world");
    const content = await dwc.fs.readFile("/project/hello.txt", "utf8");
    const list = await dwc.fs.readdir("/project");
    output.textContent = `read back: ${content}, dir: ${list.join(",")}`;

    await dwc.shell.exec("mkdir -p /project");
    await dwc.shell.exec("cd /project");
    const pwd = await dwc.shell.exec("pwd");
    console.log(pwd.stdout); // "/project"
  } catch (error) {
    console.error("Failed to instantiate DuckWebContainer", error);
    output.textContent = `Failed to instantiate DuckWebContainer: ${String(error)}`;
  }
};

main();
