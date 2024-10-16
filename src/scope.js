const path = require("path");
const prompts = require("prompts");
const {
  readJSONFile,
  writeJSONFile,
  info,
  success,
  error,
} = require("./shared/functions");

async function main(root) {
  const config = {
    tsConfigJSON: path.resolve(root, "tsconfig.json"),
    rojoJSON: path.resolve(root, "assets", "rojo", "default.project.json"),
  };

  const npmRegex = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

  function scopeValidation(value) {
    if (value.startsWith("@")) value = value.replace("@", "");
    if (!value) return "Scope cannot be empty.";
    if (!npmRegex.test(value)) return "Scope is formatted incorrectly.";
    return true;
  }

  let { option, scope } = await prompts(
    [
      {
        type: "select",
        name: "option",
        message: "Option",
        choices: [
          { title: "Add", value: "add" },
          { title: "Remove", value: "remove" },
        ],
      },
      {
        type: "text",
        name: "scope",
        message: "Scope",
        initial: "@rbxts",
        validate: scopeValidation,
      },
    ],
    {
      onCancel: async () => await error(true, false),
    },
  );

  if (!scope.startsWith("@")) scope = `@${scope}`;

  const tsConfigJSON = await readJSONFile(config.tsConfigJSON);
  if (!tsConfigJSON) error(true, "'tsconfig.json' not found.");

  const compilerOptions = tsConfigJSON.compilerOptions || {};
  let typeRoots = compilerOptions.typeRoots || [];
  const newTypeRoot = `node_modules/${scope}`;

  if (option === "add") {
    if (typeRoots.includes(newTypeRoot))
      info("Scope already exists in 'tsconfig.json'.");
    else typeRoots.push(newTypeRoot);
  } else {
    if (!typeRoots.includes(newTypeRoot))
      info("Scope doesn't exist in 'tsconfig.json'.");
    else typeRoots = typeRoots.filter((t) => t !== newTypeRoot);
  }

  compilerOptions.typeRoots = typeRoots;
  tsConfigJSON.compilerOptions = compilerOptions;
  await writeJSONFile(config.tsConfigJSON, tsConfigJSON);

  const rojoJSON = await readJSONFile(config.rojoJSON);
  if (!rojoJSON) error(true, "'assets/rojo/default.project.json' not found.");

  const tree = rojoJSON.tree || {};
  const include = tree.include || {};
  const nodeModules = include.node_modules || {};

  if (option === "add") {
    if (nodeModules[scope])
      info("Overwriting scope in 'assets/rojo/default.project.json'.");

    nodeModules[scope] = {
      $path: `../../node_modules/${scope}`,
    };
  } else {
    if (!nodeModules[scope])
      info("Scope doesn't exist in 'assets/rojo/default.project.json'.");
    else delete nodeModules[scope];
  }

  include.node_modules = nodeModules;
  tree.include = include;

  rojoJSON.tree = tree;
  await writeJSONFile(config.rojoJSON, rojoJSON);

  if (option === "add") success(`Added scope '${scope}'.`);
  else success(`Removed scope '${scope}'.`);
}

module.exports = main;
