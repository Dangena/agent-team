import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { delimiter, dirname, extname, isAbsolute, join, normalize } from "node:path";
import { buildRolePrompt, type AgentRole, type RolePromptProfile } from "@agent-team/agent-team-core";

export type BuiltInCliAdapterId = "codex" | "claudecode" | "opencode" | "mimocode" | "zcode";
export type CliAdapterId = BuiltInCliAdapterId | "generic";
export type DetectionSource = "configured" | "path" | "well-known-location" | "missing";

export type DetectionDiagnostic = {
  level: "info" | "warning" | "error";
  message: string;
};

export type DetectionResult = {
  id: CliAdapterId;
  displayName: string;
  available: boolean;
  source: DetectionSource;
  executable?: string;
  version?: string;
  reason?: string;
  diagnostics: DetectionDiagnostic[];
};

export type DetectionOptions = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  configuredExecutables?: Partial<Record<BuiltInCliAdapterId, string>>;
};

export type LaunchContext = {
  workspacePath: string;
  role: AgentRole;
  promptProfile?: RolePromptProfile;
  bridgeEnv: Record<string, string>;
};

export type LaunchSpec = {
  executable: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  initialInput?: string;
  initialInputDelayMs?: number;
};

export type CliAdapter = {
  id: CliAdapterId;
  displayName: string;
  detect(): Promise<DetectionResult>;
  buildLaunchSpec(context: LaunchContext): Promise<LaunchSpec>;
};

type CliDefinition = {
  id: BuiltInCliAdapterId;
  displayName: string;
  commands: string[];
  versionArgs: string[];
  macosWellKnownPaths: string[];
  windowsWellKnownPaths: string[];
};

const definitions: Record<BuiltInCliAdapterId, CliDefinition> = {
  codex: {
    id: "codex",
    displayName: "Codex",
    commands: ["codex"],
    versionArgs: ["--version"],
    macosWellKnownPaths: ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"],
    windowsWellKnownPaths: []
  },
  claudecode: {
    id: "claudecode",
    displayName: "Claude Code",
    commands: ["claude", "claudecode", "claude-code"],
    versionArgs: ["--version"],
    macosWellKnownPaths: ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"],
    windowsWellKnownPaths: []
  },
  opencode: {
    id: "opencode",
    displayName: "OpenCode",
    commands: ["opencode"],
    versionArgs: ["--version"],
    macosWellKnownPaths: ["/opt/homebrew/bin/opencode", "/usr/local/bin/opencode"],
    windowsWellKnownPaths: []
  },
  mimocode: {
    id: "mimocode",
    displayName: "MiMo Code",
    commands: ["mimo", "mimocode", "mimo-code"],
    versionArgs: ["--version"],
    macosWellKnownPaths: ["/opt/homebrew/bin/mimo", "/usr/local/bin/mimo"],
    windowsWellKnownPaths: []
  },
  zcode: {
    id: "zcode",
    displayName: "Zcode",
    commands: ["zcode"],
    versionArgs: ["--version"],
    macosWellKnownPaths: ["/opt/homebrew/bin/zcode", "/usr/local/bin/zcode"],
    windowsWellKnownPaths: []
  }
};

export const BUILT_IN_ADAPTER_IDS = ["codex", "claudecode", "opencode", "mimocode", "zcode"] as const;

function pathCandidates(command: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const hasDirectory = command.includes("/") || command.includes("\\") || isAbsolute(command);
  if (hasDirectory) {
    return [normalize(command)];
  }

  const pathValue = env.PATH ?? env.Path ?? "";
  const pathExts =
    platform === "win32"
      ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
      : [""];
  const names =
    platform === "win32" && !extname(command)
      ? pathExts.flatMap((item) => [command + item.toLowerCase(), command + item.toUpperCase()])
      : [command];

  return pathValue
    .split(delimiter)
    .filter(Boolean)
    .flatMap((entry) => names.map((name) => join(entry, name)));
}

function isExecutableFile(filePath: string, platform: NodeJS.Platform): boolean {
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      return false;
    }

    if (platform === "win32") {
      return true;
    }

    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findExecutable(
  definition: CliDefinition,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  configuredExecutable?: string
): Pick<DetectionResult, "source" | "executable" | "reason" | "diagnostics"> {
  const diagnostics: DetectionDiagnostic[] = [];

  if (configuredExecutable) {
    const candidate = normalize(configuredExecutable);
    if (isExecutableFile(candidate, platform)) {
      diagnostics.push({ level: "info", message: `using configured executable: ${candidate}` });
      return { source: "configured", executable: candidate, diagnostics };
    }

    diagnostics.push({
      level: "error",
      message: `configured executable is missing or not executable: ${candidate}`
    });
    return {
      source: "configured",
      reason: "configured executable is missing or not executable",
      diagnostics
    };
  }

  for (const command of definition.commands) {
    for (const candidate of pathCandidates(command, env, platform)) {
      if (isExecutableFile(candidate, platform)) {
        diagnostics.push({ level: "info", message: `found ${command} on PATH` });
        return { source: "path", executable: candidate, diagnostics };
      }
    }
  }

  const wellKnownPaths =
    platform === "darwin"
      ? definition.macosWellKnownPaths
      : platform === "win32"
        ? definition.windowsWellKnownPaths
        : [];

  for (const candidate of wellKnownPaths) {
    if (isExecutableFile(candidate, platform)) {
      diagnostics.push({ level: "info", message: `found in well-known location: ${candidate}` });
      return { source: "well-known-location", executable: candidate, diagnostics };
    }
  }

  diagnostics.push({
    level: "warning",
    message: `${definition.displayName} executable was not found on PATH or known locations`
  });
  return { source: "missing", reason: "executable not found", diagnostics };
}

function readVersion(executable: string, versionArgs: string[], cwd: string): string | undefined {
  for (const arg of versionArgs) {
    try {
      const output = execFileSync(executable, [arg], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 2_000
      }).trim();
      if (output) {
        return output.split(/\r?\n/)[0]?.trim();
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

export async function detectBuiltInAdapter(
  id: BuiltInCliAdapterId,
  options: DetectionOptions = {}
): Promise<DetectionResult> {
  const definition = definitions[id];
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const found = findExecutable(definition, env, platform, options.configuredExecutables?.[id]);
  const base = {
    id,
    displayName: definition.displayName,
    available: Boolean(found.executable),
    source: found.source,
    diagnostics: found.diagnostics
  };

  if (!found.executable) {
    return {
      ...base,
      reason: found.reason ?? "executable not found"
    };
  }

  const version = readVersion(found.executable, definition.versionArgs, dirname(found.executable));
  return version
    ? { ...base, executable: found.executable, version }
    : { ...base, executable: found.executable };
}

export async function detectAllBuiltInAdapters(options: DetectionOptions = {}): Promise<DetectionResult[]> {
  return Promise.all(BUILT_IN_ADAPTER_IDS.map((id) => detectBuiltInAdapter(id, options)));
}

function configuredExecutableMap(
  id: BuiltInCliAdapterId,
  executable?: string
): Partial<Record<BuiltInCliAdapterId, string>> {
  return executable ? { [id]: executable } : {};
}

function launchArgsFor(id: BuiltInCliAdapterId, role: AgentRole, profile?: RolePromptProfile): string[] {
  if (id === "mimocode" || id === "opencode") return [];
  return [buildRolePrompt(role, profile)];
}

function launchInitialInputFor(
  id: BuiltInCliAdapterId,
  role: AgentRole,
  profile?: RolePromptProfile
): string | undefined {
  if (id !== "mimocode" && id !== "opencode") return undefined;
  return `${buildRolePrompt(role, profile)}\r`;
}

function launchInitialInputDelayFor(id: BuiltInCliAdapterId): number | undefined {
  if (id === "mimocode") return 3_000;
  if (id === "opencode") return 1_500;
  return undefined;
}

export function createBuiltInAdapter(
  id: BuiltInCliAdapterId,
  configuredExecutable?: string,
  detectionOptions: Omit<DetectionOptions, "configuredExecutables"> = {}
): CliAdapter {
  const definition = definitions[id];

  return {
    id,
    displayName: definition.displayName,
    detect() {
      return detectBuiltInAdapter(id, {
        ...detectionOptions,
        configuredExecutables: configuredExecutableMap(id, configuredExecutable)
      });
    },
    async buildLaunchSpec(context) {
      const detection = await detectBuiltInAdapter(id, {
        ...detectionOptions,
        configuredExecutables: configuredExecutableMap(id, configuredExecutable)
      });
      if (!detection.executable) {
        throw new Error(`${definition.displayName} is not available: ${detection.reason ?? "missing executable"}`);
      }

      const launchSpec: LaunchSpec = {
        executable: detection.executable,
        args: launchArgsFor(id, context.role, context.promptProfile),
        env: context.bridgeEnv,
        cwd: context.workspacePath
      };
      const initialInput = launchInitialInputFor(id, context.role, context.promptProfile);
      if (!initialInput) return launchSpec;
      const initialInputDelayMs = launchInitialInputDelayFor(id);
      return initialInputDelayMs
        ? { ...launchSpec, initialInput, initialInputDelayMs }
        : { ...launchSpec, initialInput };
    }
  };
}

export function createGenericAdapter(executable: string, args: string[] = []): CliAdapter {
  return {
    id: "generic",
    displayName: "Generic CLI",
    async detect() {
      const available = Boolean(executable) && existsSync(executable);
      return {
        id: "generic",
        displayName: "Generic CLI",
        available,
        source: executable ? "configured" : "missing",
        ...(executable ? { executable } : {}),
        ...(available ? {} : { reason: "generic executable is not configured or does not exist" }),
        diagnostics: [
          available
            ? { level: "info", message: `using generic executable: ${executable}` }
            : { level: "warning", message: "generic executable is not configured or does not exist" }
        ]
      };
    },
    async buildLaunchSpec(context) {
      return {
        executable,
        args: [...args, buildRolePrompt(context.role)],
        env: context.bridgeEnv,
        cwd: context.workspacePath
      };
    }
  };
}
