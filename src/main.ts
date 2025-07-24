import { Plugin, Workspace, WorkspaceLeaf } from "obsidian";
import type { AppWindow, ExtendedWorkspace } from "./types";
import {
  DEFAULT_SETTINGS,
  QuickOpenSettings,
  QuickOpenSettingTab,
} from "./settings";
import {
  addModStyles,
  removeModStyles,
  isAppWindow,
  addModTransition,
  removeModTransition,
} from "./utils";

type NumberKey = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

function isNumberKey(k: string): k is NumberKey {
  return k.length === 1 && k >= "1" && k <= "9";
}

export default class QuickOpen extends Plugin {
  public settings: QuickOpenSettings;
  private modalObserver: MutationObserver;
  private activeModal: HTMLElement | null = null;
  private popoutWindows: Set<Window> = new Set();
  private modalKeyListener?: (ev: KeyboardEvent) => void;
  private isModifierKeyPressed: boolean = false;
  private modifierKeyListener: (ev: KeyboardEvent) => void;
  private modalKeyWindow?: Window;

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

    addModTransition(document, this.settings.transitionStyle);

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

    if (this.settings.stackTabsInPopout) {
      this.setStackedTabsForPopoutWindow(win.app.workspace);
    }

    this.register(() => {
      popoutModalObserver.disconnect();
      win.removeEventListener("keydown", this.modifierKeyListener);
      win.removeEventListener("keyup", this.modifierKeyListener);
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

    this.modalKeyListener = (ev: KeyboardEvent) => this.interceptModalKeys(ev);
    this.modalKeyWindow = modalElement.ownerDocument.defaultView!;

    this.modalKeyWindow.addEventListener(
      "keydown",
      this.modalKeyListener,
      true,
    );

    if (this.isModifierKeyPressed) {
      this.updateModalModifierClass();
    }
  }

  handleModalClosed(modalElement: HTMLElement) {
    if (this.activeModal !== modalElement) return;

    removeModStyles(modalElement.ownerDocument);
    this.activeModal = null;

    if (this.modalKeyListener && this.modalKeyWindow)
      this.modalKeyWindow.removeEventListener(
        "keydown",
        this.modalKeyListener,
        true,
      );

    this.modalKeyListener = undefined;
    this.modalKeyWindow = undefined;
  }

  private interceptModalKeys(ev: KeyboardEvent) {
    if (!ev[this.settings.modifierKey]) return;
    if (!isNumberKey(ev.key)) return;

    ev.preventDefault();
    ev.stopImmediatePropagation();

    const idx = Number(ev.key) - 1;

    const resultsContainer = this.activeModal?.querySelector(
      ".suggestion, .prompt-results",
    );
    if (!resultsContainer) return;

    const items = Array.from(
      resultsContainer.querySelectorAll<HTMLElement>(
        ".suggestion-item:not(.mod-group)",
      ),
    ).slice(0, 9);
    const el = items[idx];
    if (el) el.click();
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

    removeModTransition(document, this.settings.transitionStyle);

    document.removeEventListener("keydown", this.modifierKeyListener);
    document.removeEventListener("keyup", this.modifierKeyListener);

    this.popoutWindows.forEach((win) => {
      win.removeEventListener("keydown", this.modifierKeyListener);
      win.removeEventListener("keyup", this.modifierKeyListener);
    });

    if (this.modalKeyListener && this.modalKeyWindow)
      this.modalKeyWindow.removeEventListener(
        "keydown",
        this.modalKeyListener,
        true,
      );
  }
}
