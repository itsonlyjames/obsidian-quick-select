import {
  Plugin,
  PopoverSuggest,
  Scope,
  SuggestModal,
  WorkspaceLeaf,
} from "obsidian";
import type { AppWindow } from "./types";
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

export default class QuickOpen extends Plugin {
  public settings: QuickOpenSettings;
  private activeModal: HTMLElement | null = null;
  private isModifierKeyPressed: boolean = false;
  private modifierKeyListener: (ev: KeyboardEvent) => void;
  private modalScopeStack: Map<any, Scope> = new Map();
  private popoverScopeStack: Map<any, Scope> = new Map();
  private popoutWindows: Set<AppWindow> = new Set();

  async onload() {
    (window as any).quickOpenPlugin = this;
    await this.loadSettings();

    this.addSettingTab(new QuickOpenSettingTab(this.app, this));

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

    this.patchSuggestModal();
    this.patchPopoverSuggest();
  }

  private patchSuggestModal() {
    const self = this;
    const origOpen = SuggestModal.prototype.open;
    const origClose = SuggestModal.prototype.close;

    SuggestModal.prototype.open = function (...args: any[]) {
      try {
        origOpen.apply(this, args);

        const pluginInstance = (window as any).quickOpenPlugin as QuickOpen;
        if (pluginInstance) {
          pluginInstance.activeModal = this.modalEl;
          pluginInstance.updateModalModifierClass();
        }

        if (self.modalScopeStack.has(this)) {
          const oldScope = self.modalScopeStack.get(this);
          if (oldScope) {
            this.app.keymap.popScope(oldScope);
          }
        }

        const modalScope = new Scope(this.scope);
        self.modalScopeStack.set(this, modalScope);

        for (let i = 1; i <= 9; i++) {
          modalScope.register(["Mod"], i.toString(), (evt) => {
            evt.preventDefault();
            const idx = i - 1;
            if (!this.chooser?.values || idx >= this.chooser.values.length)
              return;
            this.chooser.setSelectedItem(idx, evt);
            this.chooser.useSelectedItem?.(evt) ??
              this.onChooseItem?.(this.chooser.values[idx], evt);
          });
        }

        this.app.keymap.pushScope(modalScope);
      } catch (error) {
        console.error("QuickOpen: Error in SuggestModal.open:", error);
      }
    };

    SuggestModal.prototype.close = function (...args: any[]) {
      try {
        const scope = self.modalScopeStack.get(this);
        if (scope) {
          this.app.keymap.popScope(scope);
          self.modalScopeStack.delete(this);
        }

        origClose.apply(this, args);

        const pluginInstance = (window as any).quickOpenPlugin as QuickOpen;
        if (pluginInstance) {
          pluginInstance.activeModal = null;
          removeModStyles(document);
        }
      } catch (error) {
        console.error("QuickOpen: Error in SuggestModal.close:", error);
        const scope = self.modalScopeStack.get(this);
        if (scope) {
          try {
            this.app.keymap.popScope(scope);
          } catch (e) {
            console.error("QuickOpen: Failed to pop scope:", e);
          }
          self.modalScopeStack.delete(this);
        }
      }
    };
  }

  private patchPopoverSuggest() {
    const self = this;
    const origPopoverOpen = PopoverSuggest.prototype.open;
    const origPopoverClose = PopoverSuggest.prototype.close;

    PopoverSuggest.prototype.open = function (...args: any[]) {
      try {
        origPopoverOpen.apply(this, args);

        const pluginInstance = (window as any).quickOpenPlugin as QuickOpen;
        if (pluginInstance) {
          pluginInstance.activeModal = this.suggestEl;
          pluginInstance.updateModalModifierClass();
        }

        if (this.suggestions.values.length < 1) return;

        if (self.popoverScopeStack.has(this)) {
          const oldScope = self.popoverScopeStack.get(this);
          if (oldScope) {
            this.app.keymap.popScope(oldScope);
          }
        }

        const popoverScope = new Scope(this.scope);
        self.popoverScopeStack.set(this, popoverScope);

        for (let i = 1; i <= 9; i++) {
          popoverScope.register(["Mod"], i.toString(), (evt) => {
            evt.preventDefault();
            let idx = i - 1;
            if (this.suggestEl.classList.contains("mod-search-suggestion")) {
              idx = idx + 1;
            }
            if (!this.suggestions || idx >= this.suggestions.length) return;

            this.suggestions.setSelectedItem(idx);
            if (this.suggestions.useSelectedItem) {
              this.suggestions.useSelectedItem(evt);
            } else if (this.suggestions.chooser.selectSuggestion) {
              this.suggestions.chooser.selectSuggestion(this.suggestions[idx]);
            }
          });
        }

        this.app.keymap.pushScope(popoverScope);
      } catch (error) {
        console.error("QuickOpen: Error in PopoverSuggest.open:", error);
      }
    };

    PopoverSuggest.prototype.close = function (...args: any[]) {
      try {
        const scope = self.popoverScopeStack.get(this);
        if (scope) {
          this.app.keymap.popScope(scope);
          self.popoverScopeStack.delete(this);
        }

        origPopoverClose.apply(this, args);

        const pluginInstance = (window as any).quickOpenPlugin as QuickOpen;
        if (pluginInstance) {
          pluginInstance.activeModal = null;
          removeModStyles(document);
        }
      } catch (error) {
        console.error("QuickOpen: Error in PopoverSuggest.close:", error);
        const scope = self.popoverScopeStack.get(this);
        if (scope) {
          try {
            this.app.keymap.popScope(scope);
          } catch (e) {
            console.error("QuickOpen: Failed to pop scope:", e);
          }
          self.popoverScopeStack.delete(this);
        }
      }
    };
  }

  onunload() {
    for (const [_, scope] of this.modalScopeStack) {
      try {
        this.app.keymap.popScope(scope);
      } catch (error) {
        console.warn(
          "QuickOpen: Failed to pop modal scope during unload:",
          error,
        );
      }
    }
    this.modalScopeStack.clear();

    for (const [_, scope] of this.popoverScopeStack) {
      try {
        this.app.keymap.popScope(scope);
      } catch (error) {
        console.warn(
          "QuickOpen: Failed to pop popover scope during unload:",
          error,
        );
      }
    }
    this.popoverScopeStack.clear();

    removeModTransition(document, this.settings.transitionStyle);

    if (this.modifierKeyListener) {
      document.removeEventListener("keydown", this.modifierKeyListener);
      document.removeEventListener("keyup", this.modifierKeyListener);
    }
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

  private handleLayoutChange() {
    this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      const bodyEl = leaf.view.containerEl.closest("body");
      if (!bodyEl) return;

      if (bodyEl.classList.contains("is-popout-window")) {
        const win = bodyEl.ownerDocument.defaultView as AppWindow | null;
        if (win && isAppWindow(win) && !this.popoutWindows.has(win)) {
          this.initializePopoutWindow(win);
        }
      }
    });
  }

  private initializePopoutWindow(win: AppWindow) {
    this.popoutWindows.add(win);

    win.addEventListener("keydown", this.modifierKeyListener);
    win.addEventListener("keyup", this.modifierKeyListener);

    this.register(() => {
      win.removeEventListener("keydown", this.modifierKeyListener);
      win.removeEventListener("keyup", this.modifierKeyListener);
      this.popoutWindows.delete(win);
    });
  }
}
