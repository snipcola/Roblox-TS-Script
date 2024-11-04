import path from "path";
import { measure, clean, info, success, error } from "./shared/functions.js";

async function main(root) {
  const config = {
    clean: [
      path.resolve(root, "out"),
      path.resolve(root, "script.lua"),
      path.resolve(root, "assets", "rojo", "studio", "script.client.lua"),
      path.resolve(root, "node_modules"),
      path.resolve(root, "pnpm-lock.yaml"),
      path.resolve(root, "package-lock.json"),
      path.resolve(root, "yarn.lock"),
      path.resolve(root, ".DS_Store"),
    ],
  };

  try {
    await clean(config.clean);
  } catch {
    error(true, "Failed to clean.");
  }
}

export default async function (root) {
  info("Cleaning.");
  success(`Cleaned (took ${await measure(main, root)}ms).`);
}
