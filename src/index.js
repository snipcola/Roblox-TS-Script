#!/usr/bin/env node

const { hasArgs, error } = require("./shared/functions");
const path = require("path").resolve();

if (hasArgs(true, "--build", "-b")) require("./build")(path);
else if (hasArgs(true, "--dev", "-d")) require("./dev")(path);
else if (hasArgs(true, "--clean", "-c")) require("./clean")(path);
else error(true, "Invalid arguments!");
