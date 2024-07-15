import { App, Plugin, TFile } from "obsidian";

interface Command {
  id: string;
  name: string;
  callback: () => any;
}

interface Commands {
  commands: { [id: string]: Command };
  executeCommandById(id: string): boolean;
}

interface AppWithCommands extends App {
  commands: Commands;
}

export default class QuickOpen extends Plugin {
  private originalSwitcherOpenCommand: (() => void) | null = null;
  private originalCommandPaletteOpenCommand: (() => void) | null = null;
  private keyPressListener: (event: KeyboardEvent) => void;
  private keyReleaseListener: (event: KeyboardEvent) => void;
  private observer: MutationObserver | null = null;
  private results: { title: string; alias: string | null }[];
  private isCommandPalette = false;

  async onload() {
    this.app.workspace.onLayoutReady(() => {
      this.overrideSwitcherOpenCommand();
      this.overrideCommandPaletteOpenCommand();
    });
  }

  overrideSwitcherOpenCommand() {
    const switcherOpenCommand =
      (this.app as AppWithCommands).commands.commands["switcher:open"];
    if (switcherOpenCommand && !this.originalSwitcherOpenCommand) {
      this.originalSwitcherOpenCommand = switcherOpenCommand.callback;
      switcherOpenCommand.callback = () => this.handleOpen("switcher");
    }
  }

  overrideCommandPaletteOpenCommand() {
    const commandPaletteOpenCommand =
      (this.app as AppWithCommands).commands.commands["command-palette:open"];
    if (commandPaletteOpenCommand && !this.originalCommandPaletteOpenCommand) {
      this.originalCommandPaletteOpenCommand =
        commandPaletteOpenCommand.callback;
      commandPaletteOpenCommand.callback = () =>
        this.handleOpen("command-palette");
    }
  }

  handleOpen(type: "switcher" | "command-palette") {
    this.isCommandPalette = type === "command-palette";
    if (this.isCommandPalette && this.originalCommandPaletteOpenCommand) {
      this.originalCommandPaletteOpenCommand();
    } else if (!this.isCommandPalette && this.originalSwitcherOpenCommand) {
      this.originalSwitcherOpenCommand();
    }

    this.returnResults();

    // Ensure observer is only set up once
    if (!this.observer) {
      this.setupObserver();
    }

    this.setupKeyListeners();

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.removedNodes.length > 0) {
          mutation.removedNodes.forEach((node) => {
            if ((node as HTMLElement).classList?.contains("modal-container")) {
              this.cleanup();
            }
          });
        }
      }
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  returnResults() {
    const results = this.getResults();
    this.results = results;
  }

  setupObserver() {
    const resultsContainer = document.querySelector(".prompt-results");
    if (resultsContainer) {
      const resultsObserver = new MutationObserver(() => {
        this.returnResults();
      });

      resultsObserver.observe(resultsContainer, {
        childList: true,
        subtree: true,
      });
    }
  }

  setupKeyListeners() {
    // Remove existing key listeners before adding new ones
    this.cleanupKeyListeners();
    this.keyPressListener = this.onKeyPress.bind(this);
    this.keyReleaseListener = this.onKeyRelease.bind(this);
    document.addEventListener("keydown", this.keyPressListener);
    document.addEventListener("keyup", this.keyReleaseListener);
  }

  cleanupKeyListeners() {
    if (this.keyPressListener) {
      document.removeEventListener("keydown", this.keyPressListener);
    }
    if (this.keyReleaseListener) {
      document.removeEventListener("keyup", this.keyReleaseListener);
    }
  }

  getResults(): { title: string; alias: string | null }[] {
    const resultItems = document.querySelectorAll(
      ".prompt-results .suggestion-item",
    );
    return Array.from(resultItems).slice(0, 9).map((item) => {
      const titleEl = item.querySelector(".suggestion-title") as HTMLElement;
      if (!titleEl) return { title: "", alias: null };

      const prefixEl = titleEl.querySelector(".suggestion-prefix");
      const title = prefixEl
        ? `${prefixEl.textContent?.trim() || ""}: ${
          Array.from(titleEl.childNodes)
            .filter((node) => node !== prefixEl)
            .map((node) => node.textContent?.trim())
            .join("")
        }`
        : titleEl.innerText.trim();

      const aliasEl = item.querySelector(".suggestion-note") as HTMLElement;
      const alias = aliasEl ? aliasEl.innerText.trim() : null;

      if (alias) {
        return { title: alias, alias: title };
      } else {
        return { title, alias: null };
      }
    }).filter((result) => result.title); // Remove any empty results
  }

  async onKeyPress(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey) {
      document.body.classList.add("show-suggestion-numbers");
    }

    if (event.getModifierState("Control") || event.getModifierState("Meta")) {
      if (event.key >= "1" && event.key <= "9") {
        const resultsIndex: number = parseInt(event.key) - 1;
        const result = this.results[resultsIndex];
        if (!result) return;

        if (this.isCommandPalette) {
          this.executeCommand(result.title);
        } else {
          // Use the alias if it exists, otherwise use the title
          const searchKey = result.title;
          const file = this.app.metadataCache.getFirstLinkpathDest(
            searchKey,
            "",
          );
          if (file) this.openFileByPath(file);
        }
      }
    }
  }

  onKeyRelease(event: KeyboardEvent) {
    if (!event.metaKey && !event.ctrlKey) {
      document.body.classList.remove("show-suggestion-numbers");
    }
  }

  async openFileByPath(file: TFile | null) {
    if (file instanceof TFile) {
      const leaf = this.app.workspace.getLeaf();
      await leaf.openFile(file);
      this.closePalette();
    }
  }

  executeCommand(commandName: string) {
    const command = Object.values(
      (this.app as AppWithCommands).commands.commands,
    ).find((cmd) => cmd.name === commandName);
    if (command) {
      (this.app as AppWithCommands).commands.executeCommandById(command.id);
      this.closePalette();
    }
  }

  closePalette() {
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
    });
    document.dispatchEvent(event);
  }

  cleanup() {
    this.cleanupKeyListeners();
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  onunload() {
    const switcherOpenCommand =
      (this.app as AppWithCommands).commands.commands["switcher:open"];
    if (switcherOpenCommand && this.originalSwitcherOpenCommand) {
      switcherOpenCommand.callback = this.originalSwitcherOpenCommand;
      this.originalSwitcherOpenCommand = null;
    }

    const commandPaletteOpenCommand =
      (this.app as AppWithCommands).commands.commands["command-palette:open"];
    if (commandPaletteOpenCommand && this.originalCommandPaletteOpenCommand) {
      commandPaletteOpenCommand.callback =
        this.originalCommandPaletteOpenCommand;
      this.originalCommandPaletteOpenCommand = null;
    }

    this.cleanup();
  }
}
