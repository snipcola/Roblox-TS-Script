import fs from "fs/promises";
import path from "path";
import { fileExists } from "../shared/functions.js";

const windows = process.platform === "win32";
const separator = windows ? "\\" : "/";

class Stringify {
  process(lua) {
    return lua.trim();
  }

  polyfill = this.process(`
    local __chunks = {}
    local __scripts = {}
    local __cache = {}

    local __require = require
    local __http = game:GetService("HttpService")

    local __json = function(str)
      return function()
        return __http:JSONDecode(str)
      end
    end

    local __tree = function(str)
      local function parse(tree, parent)
        local pair, children = tree[1], tree[2]
        local name, link = pair[1], pair[2]
        
        local proxy = Instance.new(link and "ModuleScript" or "Folder")
        proxy.Parent = parent
        proxy.Name = name
        
        if link then
          __scripts[proxy] = link
          __scripts[link] = proxy
        end

        for _, v in ipairs(children or {}) do
          parse(v, proxy)
        end

        return proxy
      end

      parse(__json(str)())
    end

    local function require(module)
      if typeof(module) == "Instance" then
        module = __scripts[module] or module
      end

      if typeof(module) ~= "string" then
        return __require(module)
      end

      local func = __chunks[module]

      if not func then
        return
      end

      local cached = __cache[module]

      if cached then
        return cached
      end

      local success, result = pcall(func, __scripts[module])
      
      if not success then
        error(result)
        return
      end

      __cache[module] = result
      return result
    end
  `);

  module(name, script) {
    return this.process(`
      __chunks[${name}] = function(script)
        ${script.trim()}
      end
    `);
  }

  prepareJSON(json) {
    return JSON.stringify(JSON.stringify(json));
  }

  json(name, jsonString) {
    return this.process(`
      __chunks[${name}] = __json(${this.prepareJSON(JSON.parse(jsonString))})
    `);
  }

  text(name, textString) {
    return this.json(name, JSON.stringify(textString));
  }

  tree(json) {
    return this.process(`
      __tree(${this.prepareJSON(...json)})
    `);
  }

  footer(index) {
    return this.process(`
      return require(${index});
    `);
  }
}

const stringify = new Stringify();

class Bundler {
  config = {};
  initFiles = ["init.luau", "init.lua"];

  constructor(config) {
    this.config = config;
  }

  transformers = [
    {
      extension: [".luau", ".lua"],
      transform: function (name, contents) {
        contents = contents
          .split("")
          .filter((c) => c !== "\r")
          .join("")
          .split("\n")
          .map((l) => `\t${l}`)
          .map((l) => (l === "\t" ? "" : l))
          .join("\n");

        return stringify.module(name, contents);
      },
    },
    {
      extension: ".json",
      transform: stringify.json.bind(stringify),
    },
    {
      extension: ".txt",
      transform: stringify.text.bind(stringify),
    },
  ];

  getTransformer(extension) {
    return this.transformers.find(function ({ extension: _extension }) {
      return Array.isArray(_extension)
        ? _extension.includes(extension)
        : _extension === extension;
    });
  }

  async fetchFiles(contents, filePath, attemptedPaths) {
    if (attemptedPaths?.has(filePath)) {
      return new Set();
    }

    const fileName = path.basename(filePath);
    const isInit = this.initFiles.includes(fileName);
    const { nodeModules, include } = this.config;

    function scriptToPath(args) {
      const isScript = args[0] === "script";
      const pathList = isScript && !isInit ? [] : [".."];
      if (isScript) args.shift();

      for (const arg of args) {
        pathList.push(arg === "Parent" ? ".." : arg);
      }

      return pathList;
    }

    function toPath(args, forceArgs) {
      if (!args) return;
      const context = args.shift();

      return {
        path: path.resolve(
          filePath,
          [...scriptToPath(context.split(".")), ...args].join(separator),
        ),
        args: forceArgs || args,
      };
    }

    const getPath = async ({ path: _path, args }) => {
      if (!_path) return;

      async function tryGetPath(_path) {
        try {
          const extensions = ["lua", "luau", "json", "txt"];
          const isDirectory =
            (await fileExists(_path)) && (await fs.stat(_path)).isDirectory();

          const paths = isDirectory
            ? extensions.map((e) => path.resolve(_path, `init.${e}`))
            : path.extname(_path)
              ? [_path]
              : extensions.map((e) => `${_path}.${e}`);

          const files = await Promise.all(
            paths.map(async (_path) => {
              if (
                (await fileExists(_path)) &&
                extensions.some((e) => _path.endsWith(`.${e}`))
              ) {
                return _path;
              }
            }),
          );

          return files.find((f) => f !== undefined);
        } catch {}
      }

      let result = await tryGetPath(_path);
      if (result) return result;

      if (
        typeof args === "object" &&
        args
          .join(separator)
          .startsWith(`include${separator}node_modules${separator}`)
      ) {
        const module = args.slice(2).join(separator);

        if (!result) {
          result = await tryGetPath(path.resolve(nodeModules, module));
        }
      } else if (
        typeof args === "string" &&
        args.split(".").slice(-2, 1).join() === "include"
      ) {
        result = await tryGetPath(path.resolve(include, args.split(".").pop()));
      }

      if (result) return result;
    };

    const processPath = async (_path) => {
      if (!_path || paths.has(_path) || _path === filePath) return;

      const contents = await fs.readFile(_path, "utf8");
      if (!contents) return;

      paths.add(_path);
      paths = new Set([
        ...paths,
        ...(await this.fetchFiles(contents, _path, attemptedPaths)),
      ]);
    };

    const tsImportRegex = /TS\.import\(([^)]+)\)/g;
    const tsGetModulesRegex = /TS\.getModule\(([^)]+)\)(?:\.([^)]+))?/g;
    const requireRegex = /require\(([^)]+)\)/g;

    let paths = new Set();
    if (!attemptedPaths) attemptedPaths = new Set();
    attemptedPaths.add(filePath);

    let match;

    while ((match = tsImportRegex.exec(contents)) !== null) {
      const args =
        match[1] &&
        match[1].split(",").map((arg) => arg.trim().replace(/^"|"$/g, ""));
      args.shift();

      if (args[0] && args[0].startsWith("TS.getModule(")) {
        continue;
      }

      await processPath(await getPath(toPath(args)));
    }

    while ((match = tsGetModulesRegex.exec(contents)) !== null) {
      const args =
        match[1] &&
        match[1].split(",").map((arg) => arg.trim().replace(/^"|"$/g, ""));
      if (match[2]) args.push(...match[2].split("."));
      args.shift();

      await processPath(
        await getPath(toPath(["script", "include", "node_modules", ...args])),
      );
    }

    while ((match = requireRegex.exec(contents)) !== null) {
      await processPath(await getPath(toPath([match[1]], match[1])));
    }

    return paths;
  }

  createTree(files) {
    const { root: rootFolder, folder, include } = this.config;

    function toArray(node) {
      return Object.entries(node).map(function ([key, value]) {
        const children = toArray(value.children);

        const initIndex =
          value.directory &&
          children.map(([[c, i]]) => c === "init" && i).find((i) => i);

        const index = value.directory ? initIndex : value.index;
        return [[path.parse(key).name, ...(index ? [index] : [])], children];
      });
    }

    function removeFromArray(array, item) {
      return array.reduce(function (acc, element) {
        if (Array.isArray(element)) {
          if (!(element[0] && element[0].includes(item)))
            acc.push(removeFromArray(element, item));
        } else acc.push(element);
        return acc;
      }, []);
    }

    function cleanArray(array) {
      return array.reduce((acc, item) => {
        if (Array.isArray(item)) {
          const newItem = cleanArray(item);
          if (newItem.length > 0) acc.push(newItem);
        } else acc.push(item);
        return acc;
      }, []);
    }

    const root = {};
    const modules = files.map(function (file, index) {
      let _path = file.split(rootFolder).join("").replace(separator, "");

      if (_path.startsWith(`node_modules${separator}`)) {
        _path = path.resolve(include, _path);
      } else {
        _path = file;
      }

      return {
        file: _path,
        path: file,
        index: index.toString(),
      };
    });

    const filteredModules = modules.map(({ file, ...args }) => ({
      file: file
        .split(folder)
        .join("")
        .split(separator)
        .filter((f) => f),
      ...args,
    }));

    for (const { file, ...args } of filteredModules) {
      let current = root;

      for (const part of file) {
        if (!current[part]) {
          current[part] = {
            children: {},
            directory: !path.extname(part),
            ...args,
          };
        }

        current = current[part].children;
      }
    }

    return {
      modules,
      tree: cleanArray(
        removeFromArray(
          toArray({
            [path.basename(folder)]: {
              children: root,
              directory: true,
            },
          }),
          "init",
        ),
      ),
    };
  }

  async bundle() {
    const { root, input, output } = this.config;
    const contents = await fs.readFile(input, "utf8");

    const { modules, tree } = this.createTree([
      input,
      ...(await this.fetchFiles(contents, input)),
    ]);

    const _output = [stringify.polyfill];

    await Promise.all(
      modules.map(async ({ path: _path, index }) => {
        const extension = path.extname(_path);
        const transformer = this.getTransformer(extension);
        if (!transformer) throw new Error(`No transformer for ${extension}.`);

        const contents = await fs.readFile(_path, "utf8");
        _output.push(transformer.transform(JSON.stringify(index), contents));
      }),
    );

    _output.push(
      stringify.tree(tree),
      stringify.footer(
        JSON.stringify(modules.find(({ file }) => file === input).index),
      ),
    );

    await fs.writeFile(
      path.resolve(root, path.basename(output)),
      _output.join("\n\n"),
      "utf8",
    );
  }
}

export default async function (config) {
  const bundler = new Bundler(config);
  await bundler.bundle();
}
