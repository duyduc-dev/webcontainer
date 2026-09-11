import { bootDWC } from "@dwc/core";

const dwc = bootDWC();

const main = async () => {
  const npm = await dwc.npm.install("10.9.2");
  console.log("npm loaded result:", npm.version, npm.fileCount);

  const shellResult = await dwc.shell.exec("npm -v");
  console.log("shell exec result:", shellResult);

  const shell = await dwc.shell.exec("ls -la /bin");
  console.log("shell exec result 1:", shell.output.split("\n"));

  const shell2 = await dwc.shell.exec(
    "npm create vite@latest my-vite-app -- --template vanilla",
  );
  console.log("shell exec result 2:", shell2.output);

  // const createProc = await dwc.process.spawn("/bin/npm.js", {
  //   argv: ["create", "vite@latest", "my-app", "--", "--template", "vanilla"],
  //   cwd: "/",
  // });

  // pipeToTerminal(createProc.stdout);

  // await createProc.exit;

  const shell3 = await dwc.shell.exec("ls -la /");
  console.log("shell exec result:", shell3.output.split("\n"));
};

main();
