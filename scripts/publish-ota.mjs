import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function parseCliArgs(argv) {
  let channelOverride;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: npm run ota -- [-main|-development|--channel <name>]");
      console.log("  -main          Publish to the main OTA channel");
      console.log("  -development   Publish to the development OTA channel");
      console.log("  --channel      Publish to a custom OTA channel");
      process.exit(0);
    }

    if (arg === "-main") {
      channelOverride = "main";
      continue;
    }

    if (arg === "-development") {
      channelOverride = "development";
      continue;
    }
  }

  const channelFlagIndex = argv.findIndex((arg) => arg === "--channel");
  if (channelFlagIndex !== -1) {
    const value = argv[channelFlagIndex + 1];
    if (!value) {
      throw new Error("--channel requires a value");
    }
    channelOverride = value;
  }

  return { channelOverride };
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const { channelOverride } = parseCliArgs(process.argv.slice(2));

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    stdio: options.capture ? ["inherit", "pipe", "inherit"] : "inherit",
    encoding: options.capture ? "utf8" : undefined,
  });
}

const backendUrl = requireEnv("OTA_BACKEND_URL").replace(/\/$/, "");
const backendToken =
  process.env.OTA_BACKEND_TOKEN || process.env.CI_UPLOAD_TOKEN || requireEnv("OTA_BACKEND_TOKEN");
const keyPassword = process.env.HOTSWAP_PRIVATE_KEY_PASSWORD ?? "";
const otaChannel = channelOverride || process.env.OTA_CHANNEL || "testingwjay";
const otaMandatory = process.env.OTA_MANDATORY === "true" ? "true" : "false";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const appVersion = pkg.version;
const otaVersion = `${appVersion}-ota.${otaChannel}.${Date.now()}`;
const minBinaryVersion = process.env.OTA_MIN_BINARY_VERSION || appVersion;
const notes =
  process.env.OTA_NOTES ||
  `Manual OTA upload (${otaChannel}) ${new Date().toISOString()}`;

let keyValue = process.env.HOTSWAP_PRIVATE_KEY?.trim();
let keyPath = process.env.HOTSWAP_PRIVATE_KEY_PATH;

if (!keyValue) {
  if (keyPath) {
    const resolvedKeyPath = path.resolve(keyPath);
    if (existsSync(resolvedKeyPath)) {
      keyPath = resolvedKeyPath;
    } else {
      const fallbackKeyPath = path.resolve("../OpenGrindBackend/secrets/hotswap.key");
      if (existsSync(fallbackKeyPath)) {
        keyPath = fallbackKeyPath;
      }
    }

    if (keyPath && existsSync(keyPath)) {
      keyValue = readFileSync(keyPath, "utf8").trim();
    }
  }

  if (!keyValue) {
    throw new Error(
      `hotswap key not found. Set HOTSWAP_PRIVATE_KEY or HOTSWAP_PRIVATE_KEY_PATH=../OpenGrindBackend/secrets/hotswap.key.`,
    );
  }
}

try {
  console.log(`Publishing OTA channel=${otaChannel} version=${otaVersion}`);

  run("npm", ["run", "build"]);
  run("tar", ["-czf", "frontend.tar.gz", "-C", "dist", "."]);
  run("npx", ["tauri", "signer", "sign", "frontend.tar.gz", "-k", keyValue, "-p", keyPassword]);

  const signature = readFileSync("frontend.tar.gz.sig", "utf8").trim();

  const responseRaw = run(
    "curl",
    [
      "--fail-with-body",
      "-sS",
      "-X",
      "POST",
      `${backendUrl}/api/releases`,
      "-H",
      `Authorization: Bearer ${backendToken}`,
      "-F",
      `channel=${otaChannel}`,
      "-F",
      "platform=all",
      "-F",
      "arch=all",
      "-F",
      `version=${otaVersion}`,
      "-F",
      `minBinaryVersion=${minBinaryVersion}`,
      "-F",
      `signature=${signature}`,
      "-F",
      `notes=${notes}`,
      "-F",
      `mandatory=${otaMandatory}`,
      "-F",
      "bundleFile=@frontend.tar.gz;type=application/gzip",
    ],
    { capture: true },
  );

  let response;
  try {
    response = JSON.parse(responseRaw);
  } catch {
    throw new Error(
      `Backend did not return JSON. Received: ${responseRaw.slice(0, 400)}. Check backend auth/proxy config and CI token.`,
    );
  }
  console.log("OTA uploaded successfully:");
  console.log(
    JSON.stringify(
      {
        channel: otaChannel,
        version: otaVersion,
        sequence: response.sequence,
        bundle_url: response.bundle_url,
      },
      null,
      2,
    ),
  );
} finally {
  // no-op: no temporary key files are created
}
