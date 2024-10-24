import { Hotkey, Plugin, Workspace, WorkspaceLeaf } from "obsidian";
import type { AppWindow, ExtendedWorkspace } from "./types";
import {
  DEFAULT_SETTINGS,
  QuickOpenSettings,
  QuickOpenSettingTab,
} from "./settings";
import { addModStyles, removeModStyles, isAppWindow } from "./utils";

export default class QuickOpen extends Plugin {
  public settings: QuickOpenSettings;
  private modalObserver: MutationObserver;
  private activeModal: HTMLElement | null = null;
  private popoutWindows: Set<Window> = new Set();
  private originalHotkeys: { [key: string]: Hotkey } = {};
  private keyListener: EventListener | null;
  private isModifierKeyPressed: boolean = false;
  private modifierKeyListener: (e: KeyboardEvent) => void;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new QuickOpenSettingTab(this.app, this));

    this.modalObserver = new MutationObserver(
      this.handleDOMMutation.bind(this),
    );

    this.modalObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    this.registerEvent(
      this.app.workspace.on(
        "layout-change",
        this.handleLayoutChange.bind(this),
      ),
    );

    this.modifierKeyListener = this.handleModifierKeyChange.bind(this);
    document.addEventListener("keydown", this.modifierKeyListener);
    document.addEventListener("keyup", this.modifierKeyListener);

    this.checkForActiveModal();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private handleModifierKeyChange(event: KeyboardEvent) {
    const isModifierEvent = event[this.settings.modifierKey];
    if (this.isModifierKeyPressed !== isModifierEvent) {
      this.isModifierKeyPressed = isModifierEvent;

      if (this.activeModal) {
        this.updateModalModifierClass();
      }
    }
  }

  private updateModalModifierClass() {
    if (this.activeModal) {
      if (this.isModifierKeyPressed) {
        setTimeout(() => {
          if (this.activeModal && this.isModifierKeyPressed)
            addModStyles(this.activeModal.ownerDocument);
        }, 150);
      } else {
        removeModStyles(this.activeModal.ownerDocument);
      }
    }
  }

  handleLayoutChange() {
    this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      const bodyEl = leaf.view.containerEl.closest("body");
      if (bodyEl?.classList.contains("is-popout-window")) {
        const win = bodyEl.ownerDocument.defaultView as
          | (Window & typeof globalThis)
          | null;
        if (win && isAppWindow(win) && !this.popoutWindows.has(win)) {
          this.initializePopoutWindow(win);
        }
      }
    });
  }

  initializePopoutWindow(win: AppWindow) {
    this.popoutWindows.add(win);

    const popoutModalObserver = new MutationObserver(
      this.handleDOMMutation.bind(this),
    );
    popoutModalObserver.observe(win.document.body, {
      childList: true,
      subtree: true,
    });

    win.addEventListener("keydown", this.modifierKeyListener);
    win.addEventListener("keyup", this.modifierKeyListener);
    win.addEventListener("keydown", this.handleKeyPress.bind(this));

    if (this.settings.stackTabsInPopout) {
      this.setStackedTabsForPopoutWindow(win.app.workspace);
    }

    this.register(() => {
      popoutModalObserver.disconnect();
      win.removeEventListener("keydown", this.modifierKeyListener);
      win.removeEventListener("keyup", this.modifierKeyListener);
      win.removeEventListener("keydown", this.handleKeyPress.bind(this));
      this.popoutWindows.delete(win);
    });
  }

  setStackedTabsForPopoutWindow(workspace: Workspace) {
    const extendedWorkspace = workspace as ExtendedWorkspace;
    extendedWorkspace.onLayoutReady(() => {
      if (extendedWorkspace.floatingSplit) {
        extendedWorkspace.floatingSplit.children.forEach((split) => {
          split.children.forEach((leaf) => {
            const type = leaf.children[0].view.getViewType();
            if (type !== "outline") leaf.setStacked(true);
          });
        });
      }
    });
  }

  handleDOMMutation(mutations: MutationRecord[]) {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          if (
            node.classList.contains("modal-container") ||
            node.classList.contains("suggestion-container")
          ) {
            this.handleModalOpen(node);
          }
        }
      });

      mutation.removedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          if (
            node.classList.contains("modal-container") ||
            node.classList.contains("suggestion-container")
          ) {
            this.handleModalClosed(node);
          }
        }
      });
    }
  }

  handleModalOpen(modalElement: HTMLElement) {
    this.activeModal = modalElement;
    this.disableDefaultHotkeys();
    this.keyListener = this.handleKeyPress.bind(this);
    if (this.keyListener) {
      document.addEventListener("keydown", this.keyListener, true);
    }

    if (this.isModifierKeyPressed) {
      this.updateModalModifierClass();
    }
  }

  handleModalClosed(modalElement: HTMLElement) {
    if (this.activeModal === modalElement) {
      removeModStyles(this.activeModal.ownerDocument);
      this.activeModal = null;
      this.restoreDefaultHotkeys();

      if (this.keyListener) {
        document.removeEventListener("keydown", this.keyListener, true);
        this.keyListener = null;
      }
    }
  }

  private disableDefaultHotkeys() {
    const hotkeyManager = this.app.internalPlugins.app.hotkeyManager;

    for (let i = 1; i < 9; i++) {
      const hotkeyId = `workspace:goto-tab-${i}`;
      this.originalHotkeys[hotkeyId] =
        hotkeyManager.getDefaultHotkeys(hotkeyId);
      hotkeyManager.removeDefaultHotkeys(hotkeyId);
    }

    const lastTabHotkeyId = "workspace:goto-last-tab";
    this.originalHotkeys[lastTabHotkeyId] =
      hotkeyManager.getDefaultHotkeys(lastTabHotkeyId);
    hotkeyManager.removeDefaultHotkeys(lastTabHotkeyId);
  }

  private restoreDefaultHotkeys() {
    const hotkeyManager = this.app.internalPlugins.app.hotkeyManager;
    for (const [hotkeyId, hotkeys] of Object.entries(this.originalHotkeys)) {
      hotkeyManager.addDefaultHotkeys(hotkeyId, hotkeys);
    }

    hotkeyManager.bake();

    this.originalHotkeys = {};
  }

  returnResultsItems(resultsContainer: Element) {
    const items = resultsContainer.querySelectorAll(
      ".suggestion-item:not(.mod-group)",
    );
    return Array.from(items)
      .slice(0, 9)
      .map((item, index) => ({
        title: item.textContent || `Result ${index + 1}`,
        element: item as HTMLElement,
      }));
  }

  handleResultsItemClick(event: KeyboardEvent) {
    if (this.activeModal) {
      const resultsContainer = this.activeModal.querySelector(
        ".suggestion, .prompt-results",
      );
      if (resultsContainer) {
        const results = this.returnResultsItems(resultsContainer);
        const index = parseInt(event.key) - 1;
        if (results && results[index]) {
          event.preventDefault();
          results[index].element.click();
        }
      }
    }
  }

  handleKeyPress(event: KeyboardEvent) {
    if (
      this.activeModal &&
      event[this.settings.modifierKey] &&
      event.key >= "1" &&
      event.key <= "9"
    ) {
      this.handleResultsItemClick(event);
    }
  }

  checkForActiveModal() {
    const modalElement = document.querySelector(
      ".modal-container, .suggestion-container",
    );
    if (modalElement instanceof HTMLElement) {
      this.handleModalOpen(modalElement);
    }
  }

  onunload() {
    this.modalObserver.disconnect();

    document.removeEventListener("keydown", this.modifierKeyListener);
    document.removeEventListener("keyup", this.modifierKeyListener);

    this.popoutWindows.forEach((win) => {
      win.removeEventListener("keydown", this.modifierKeyListener);
      win.removeEventListener("keyup", this.modifierKeyListener);
      if (this.keyListener)
        win.removeEventListener("keydown", this.keyListener);
    });

    if (this.keyListener) {
      document.removeEventListener("keydown", this.keyListener);
      this.keyListener = null;
    }
  }
}
