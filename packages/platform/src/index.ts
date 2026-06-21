export type PlatformId = "macos" | "windows";

export type PlatformServices = {
  id: PlatformId;
  bridgeTransport: "unix-socket" | "named-pipe";
  defaultShell(): string;
  openInFileManagerLabel: string;
};

export function createPlatformServices(nodePlatform: NodeJS.Platform): PlatformServices {
  if (nodePlatform === "win32") {
    return {
      id: "windows",
      bridgeTransport: "named-pipe",
      defaultShell: () => process.env.ComSpec ?? "powershell.exe",
      openInFileManagerLabel: "Explorer"
    };
  }

  if (nodePlatform === "darwin") {
    return {
      id: "macos",
      bridgeTransport: "unix-socket",
      defaultShell: () => process.env.SHELL ?? "/bin/zsh",
      openInFileManagerLabel: "Finder"
    };
  }

  throw new Error(`unsupported platform for MVP: ${nodePlatform}`);
}
