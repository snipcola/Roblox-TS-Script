import os from "os";
import path from "path";

import { watch } from "chokidar";
import { executeCommand, error, hasArgs } from "./shared/functions.js";

import { lookpath } from "lookpath";
import build from "./build/index.js";

let lock = false;

const _package = hasArgs(false, "--package", "-p");
const sync = !_package && hasArgs(false, "--sync", "-s");

function watchFolder(root, folder) {
  const watcher = watch(folder, {
    usePolling: true,
    interval: 100,
    depth: 100,
  });

  watcher.once("ready", function () {
    watcher.on("all", async function (_, path) {
      if (lock || !path) return;
      lock = true;

      try {
        await build(root, true, sync, _package);
      } catch {}

      lock = false;
    });
  });
}

async function getRojo() {
  const directory = path.resolve(os.homedir(), ".aftman", "bin");
  return await lookpath("rojo", { include: [directory] });
}

async function syncRojo(rojoConfig) {
  const rojo = await getRojo();

  if (!rojo) {
    error(true, "'rojo' not found.");
  }

  await executeCommand(rojo, ["plugin", "install"]);
  await executeCommand(rojo, ["serve", rojoConfig]);
}

export default async function (root) {
  const config = {
    folder: path.resolve(root, "src"),
    rojoConfig: path.resolve(root, "assets", "rojo", "studio"),
  };

  try {
    await build(root, true, sync, _package);
  } catch {}

  watchFolder(root, config.folder);
  if (sync) syncRojo(config.rojoConfig);
}
