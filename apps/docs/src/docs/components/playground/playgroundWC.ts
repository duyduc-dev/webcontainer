import { bootWC } from 'duckwc';

type PlaygroundWC = ReturnType<typeof bootWC>;

let instance: PlaygroundWC | undefined;

/** One runtime for the Docs playground page. Individual examples keep their
 * files and servers separate by using their own directories and ports. */
function getPlaygroundWC(): PlaygroundWC {
  instance ??= bootWC();
  return instance;
}

export { getPlaygroundWC };
