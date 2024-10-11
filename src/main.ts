import { Plugin, Workspace, WorkspaceLeaf } from "obsidian";
import type { AppWindow, ExtendedWorkspace } from "./types";
import {
  DEFAULT_SETTINGS,
  QuickOpenSettings,
  QuickOpenSettingTab,
} from "./settings";

export default class QuickOpen extends Plugin {
  private modalObserver: MutationObserver;
  private resultsObserver: MutationObserver;
  private activeModal: HTMLElement | null = null;
  private results: { title: string; element: HTMLElement }[] = [];
  private popoutWindows: Set<Window> = new Set();
  public settings: QuickOpenSettings;

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

    this.resultsObserver = new MutationObserver(
      this.handleResultsMutation.bind(this),
    );

    this.registerEvent(
      this.app.workspace.on(
        "quick-preview",
        this.handleQuickPreview.bind(this),
      ),
    );

    this.registerEvent(
      this.app.workspace.on(
        "layout-change",
        this.handleLayoutChange.bind(this),
      ),
    );

    document.addEventListener("keydown", this.handleKeyPress.bind(this), true);

    // Check if a modal is already active when the plugin loads
    this.checkForActiveModal();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  handleLayoutChange() {
    this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      const bodyEl = leaf.view.containerEl.closest("body");
      if (bodyEl?.classList.contains("is-popout-window")) {
        const win = bodyEl.ownerDocument.defaultView as
          | (Window & typeof globalThis)
          | null;
        if (win && this.isAppWindow(win) && !this.popoutWindows.has(win)) {
          this.initializePopoutWindow(win);
        }
      }
    });
  }

  isAppWindow(win: Window): win is AppWindow {
    return "app" in win && "workspace" in (win as any).app;
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

    win.addEventListener("keydown", this.handleKeyPress.bind(this));

    // Set the stacked tabs for the popout window
    if (this.settings.stackTabsInPopout) {
      this.setStackedTabsForPopoutWindow(win.app.workspace);
    }

    this.register(() => {
      popoutModalObserver.disconnect();
      win.removeEventListener("keydown", this.handleKeyPress.bind(this));
      this.popoutWindows.delete(win);
    });
  }

  setStackedTabsForPopoutWindow(workspace: Workspace) {
    const extendedWorkspace = workspace as ExtendedWorkspace;
    // Wait for the layout to be ready
    extendedWorkspace.onLayoutReady(() => {
      // Ensure we target the floating split of the new workspace
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
            this.handleNewModal(node);
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

  handleNewModal(modalElement: HTMLElement) {
    const resultsContainer = modalElement.querySelector(
      ".suggestion, .prompt-results",
    );
    if (resultsContainer) {
      this.activeModal = modalElement;
      this.injectFunctionality(resultsContainer);
      this.addModalStyles(modalElement.ownerDocument);
      this.disableDefaultHotkeys();
    }
  }

  private originalHotkeys: { [key: string]: any } = {};

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

  handleModalClosed(modalElement: HTMLElement) {
    if (this.activeModal === modalElement) {
      this.activeModal = null;
      this.results = [];
      this.removeModalStyles(modalElement.ownerDocument);
      this.resultsObserver.disconnect();
      this.restoreDefaultHotkeys();
      document.removeEventListener(
        "keydown",
        this.handleKeyPress.bind(this),
        true,
      );
    }
  }

  private restoreDefaultHotkeys() {
    const hotkeyManager = this.app.internalPlugins.app.hotkeyManager;

    for (const [hotkeyId, hotkeys] of Object.entries(this.originalHotkeys)) {
      hotkeyManager.addDefaultHotkeys(hotkeyId, hotkeys);
    }

    hotkeyManager.bake();

    this.originalHotkeys = {};
  }

  injectFunctionality(resultsContainer: Element) {
    this.updateResults(resultsContainer);
    this.resultsObserver.observe(resultsContainer, {
      childList: true,
      subtree: true,
    });
  }

  handleResultsMutation() {
    if (this.activeModal) {
      const resultsContainer = this.activeModal.querySelector(
        ".suggestion, .prompt-results",
      );
      if (resultsContainer) {
        this.updateResults(resultsContainer);
      }
    }
  }

  updateResults(resultsContainer: Element) {
    const items = resultsContainer.querySelectorAll(
      ".suggestion-item:not(.mod-group)",
    );
    this.results = Array.from(items)
      .slice(0, 9)
      .map((item, index) => ({
        title: item.textContent || `Result ${index + 1}`,
        element: item as HTMLElement,
      }));
    this.addModalStyles(resultsContainer.ownerDocument);
  }

  handleKeyPress(event: KeyboardEvent) {
    if (
      this.activeModal &&
      event[this.settings.modifierKey] &&
      event.key >= "1" &&
      event.key <= "9"
    ) {
      const index = parseInt(event.key) - 1;
      if (this.results[index]) {
        event.preventDefault();
        this.results[index].element.click();
      }
    }
  }

  handleQuickPreview() {
    if (this.activeModal) {
      // Ensure styles are added only once
      if (
        !this.activeModal.ownerDocument.body.classList.contains(
          "quick-select-modal-active",
        )
      ) {
        this.addModalStyles(this.activeModal.ownerDocument);
      }
    }
  }

  addModalStyles(doc: Document) {
    doc.body.classList.add("quick-select-modal-active");
  }

  removeModalStyles(doc: Document) {
    doc.body.classList.remove("quick-select-modal-active");
  }

  checkForActiveModal() {
    const modalElement = document.querySelector(
      ".modal-container, .suggestion-container",
    );
    if (modalElement instanceof HTMLElement) {
      this.handleNewModal(modalElement);
    }
  }

  onunload() {
    this.modalObserver.disconnect();
    this.resultsObserver.disconnect();
    document.removeEventListener("keydown", this.handleKeyPress);
    this.removeModalStyles(document);

    // Clean up for popout windows
    this.popoutWindows.forEach((win) => {
      win.removeEventListener("keydown", this.handleKeyPress);
      this.removeModalStyles(win.document);
    });
  }
}
