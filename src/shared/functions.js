import fs from "fs/promises";
import process from "process";

import { spawn } from "child_process";
import { blue, green, red } from "colorette";

export function info(message) {
  console.log(blue(`i ${message}`));
}

export function success(message) {
  console.log(green(`√ ${message}`));
}

export function error(exit, message) {
  if (message) {
    console.error(red(`× ${message}`));
  }

  if (exit) {
    process.exit(1);
  }
}

export async function measure(callback, ...args) {
  const start = performance.now();
  await callback(...args);

  const end = performance.now();
  return (end - start).toFixed(2);
}

export function executeCommand(command, args, cwd) {
  return new Promise(async function (resolve) {
    const useCMD =
      process.platform === "win32" && !command?.toLowerCase()?.endsWith(".exe");
    const result = await spawn(
      useCMD ? "cmd.exe" : command,
      useCMD ? ["/c", command, ...args] : args,
      {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let output = "";
    let error = "";

    result.stdout.on("data", function (data) {
      output += data;
    });

    result.stderr.on("data", function (data) {
      error += data;
    });

    result.on("close", function (code) {
      resolve({
        success: code === 0,
        output,
        error,
      });
    });
  });
}

export async function clean(folders) {
  await Promise.all(
    folders.map((f) => fs.rm(f, { recursive: true, force: true })),
  );
}

export async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export function hasArgs(remove, ...args) {
  const found = process.argv.slice(2).some((a) => args.includes(a));

  if (remove && found) {
    process.argv = process.argv.filter((a) => !args.includes(a));
  }

  return found;
}

export async function readJSONFile(path) {
  try {
    const contents = await fs.readFile(path, "utf8");
    return JSON.parse(contents);
  } catch {}
}

export async function writeJSONFile(path, json) {
  json = `${JSON.stringify(json, null, 2)}\n`;
  await fs.writeFile(path, json, "utf8");
}
