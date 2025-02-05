import os from "os";
import fs from "fs/promises";

import path, { dirname } from "path";
import { fileURLToPath } from "url";
import process from "process";

import yocto from "yocto-spinner";
import { lookpath } from "lookpath";
import {
  executeCommand,
  measure,
  clean,
  hasArgs,
  fileExists,
} from "../shared/functions.js";

import build from "roblox-ts/out/CLI/commands/build.js";
import bundler from "./bundler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function getDarklua() {
  const directory = path.resolve(os.homedir(), ".aftman", "bin");
  return await lookpath("darklua", { include: [directory] });
}

async function minifyFile(darklua, file) {
  const { success } = await executeCommand(darklua, [
    "process",
    "--config",
    path.resolve(__dirname, "config", `${path.basename(file)}.json`),
    file,
    file,
  ]);

  if (!success) {
    throw Error();
  }
}

async function cleanFile(path) {
  const contents = await fs.readFile(path, "utf8");
  await fs.writeFile(path, contents.replace(/(\n|\r)/g, " ").trim(), "utf8");
}

export default async function (root, dev, sync, _package) {
  _package = _package || hasArgs(false, "--package", "-p");

  const outFolder = path.resolve(root, "out");
  const assetsFolder = path.resolve(root, "assets");
  const rojoScript = path.resolve(
    assetsFolder,
    "rojo",
    "studio",
    "script.client.luau",
  );

  const config = {
    root,
    folder: outFolder,
    clean: [outFolder, ...(!sync ? [rojoScript] : [])],
    input: path.resolve(outFolder, "init.luau"),
    output: path.resolve(outFolder, "script.luau"),
    outputMin: path.resolve(outFolder, "script.min.luau"),
    outputRojo: rojoScript,
    rojoConfig: path.resolve(assetsFolder, "rojo", "default.project.json"),
    include: path.resolve(outFolder, "include"),
    nodeModules: path.resolve(root, "node_modules"),
  };

  const darklua = await getDarklua();
  const spinner = yocto().start();

  if (!darklua) {
    await error("Couldn't find 'darklua'");
    return;
  }

  async function error(...args) {
    spinner.error(...args);
    await clean([
      ...config.clean,
      path.resolve(root, path.basename(config.output)),
    ]);
    if (!dev) process.exit(1);
  }

  function changeSpinner(text, color) {
    if (text) spinner.text = `${text} `;
    if (color) spinner.color = color;
  }

  const elapsed = await measure(async function () {
    try {
      changeSpinner("Building", "green");

      await clean(config.clean);
      await build.handler({
        project: ".",
        rojo: config.rojoConfig,
        luau: true,
        ...(!_package
          ? {
              includePath: config.include,
            }
          : {
              type: "package",
              noInclude: true,
            }),
      });

      if (!(await fileExists(config.input))) {
        throw Error();
      }
    } catch {
      await error("Failed to build");
      return;
    }

    if (!_package) {
      try {
        changeSpinner("Bundling", "blue");
        await bundler(config);
      } catch {
        await error("Failed to bundle");
        return;
      }

      try {
        changeSpinner("Moving Files", "yellow");
        await clean(config.clean);

        await fs.mkdir(config.folder, { recursive: true });
        await fs.rename(
          path.resolve(root, path.basename(config.output)),
          config.output,
        );
      } catch {
        await error("Failed to move files");
        return;
      }

      try {
        changeSpinner("Minifying", "magenta");

        await minifyFile(darklua, config.output);
        await fs.cp(config.output, config.outputMin, { force: true });

        if (sync) {
          await fs.cp(config.output, config.outputRojo, { force: true });
        }

        await cleanFile(config.outputMin);
        await minifyFile(darklua, config.outputMin);
      } catch {
        await error("Failed to minify");
        return;
      }
    }
  });

  spinner.success(`Built (took ${elapsed}ms)`);
}
