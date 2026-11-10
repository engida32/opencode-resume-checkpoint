#!/usr/bin/env node

import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  defaultConfigDir,
  install,
  uninstall,
} from "./install-lib.js"

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const HELP = `opencode-resume-checkpoint

Usage:
  opencode-resume-checkpoint [options]
  opencode-resume-checkpoint --uninstall [options]

Options:
  --config-dir PATH  OpenCode config directory (default: ~/.config/opencode)
  --source-dir PATH  Package source directory (default: package root)
  --dry-run          Show actions without writing
  --force            Overwrite files that differ
  --uninstall        Remove the plugin, command, and skill
  -h, --help         Show this help

Run "npm run build" before installing from a source checkout.`

function parseArgs(argv) {
  const options = {
    configDir: defaultConfigDir(),
    sourceDir: packageRoot,
    dryRun: false,
    force: false,
    uninstall: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--dry-run") {
      options.dryRun = true
    } else if (arg === "--force") {
      options.force = true
    } else if (arg === "--uninstall") {
      options.uninstall = true
    } else if (arg === "--help" || arg === "-h") {
      options.help = true
    } else if (arg === "--config-dir") {
      const value = argv[index + 1]
      if (!value) throw new Error("--config-dir requires a path")
      options.configDir = value
      index += 1
    } else if (arg === "--source-dir") {
      const value = argv[index + 1]
      if (!value) throw new Error("--source-dir requires a path")
      options.sourceDir = value
      index += 1
    } else {
      throw new Error(`unknown option: ${arg}`)
    }
  }

  return options
}

function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    console.error("Run with --help for usage.")
    process.exitCode = 1
    return
  }

  if (options.help) {
    console.log(HELP)
    return
  }

  try {
    const results = options.uninstall
      ? uninstall({ configDir: options.configDir, dryRun: options.dryRun })
      : install({
          configDir: options.configDir,
          sourceDir: options.sourceDir,
          dryRun: options.dryRun,
          force: options.force,
        })

    for (const item of results) {
      console.log(`${item.action.padEnd(9)} ${item.to}`)
    }

    if (!options.uninstall && results.some((item) => item.action === "skipped")) {
      console.error("Some files were skipped. Re-run with --force to overwrite.")
      process.exitCode = 1
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

main()
