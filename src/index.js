#!/usr/bin/env node

import { hasArgs, error } from "./shared/functions.js";

import path from "path";
const _path = path.resolve();

import build from "./build/index.js";
import dev from "./dev.js";
import clean from "./clean.js";
import scope from "./scope.js";

if (hasArgs(true, "--build", "-b")) build(_path);
else if (hasArgs(true, "--dev", "-d")) dev(_path);
else if (hasArgs(true, "--clean", "-c")) clean(_path);
else if (hasArgs(true, "--scope", "-s")) scope(_path);
else error(true, "Invalid arguments!");
