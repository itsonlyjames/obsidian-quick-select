import {
  Modifier,
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

interface WindowWithPlugin extends Window {
  quickOpenPlugin?: QuickOpen;
}

interface SuggestModalInternal {
  app: { keymap: { pushScope: (s: Scope) => void; popScope: (s: Scope) => void } };
  modalEl: HTMLElement;
  scope: Scope;
  chooser?: {
    values?: unknown[];
    length?: number;
    setSelectedItem: (idx: number, evt: KeyboardEvent) => void;
    useSelectedItem?: (evt: KeyboardEvent) => void;
  };
  onChooseItem?: (value: unknown, evt: KeyboardEvent) => void;
}

interface PopoverSuggestInternal {
  app: { keymap: { pushScope: (s: Scope) => void; popScope: (s: Scope) => void } };
  suggestEl: HTMLElement;
  scope: Scope;
  suggestions: {
    values: Array<{ type?: string }>;
    setSelectedItem: (idx: number) => void;
    useSelectedItem?: (evt: KeyboardEvent) => void;
    chooser?: {
      selectSuggestion?: (v: unknown) => void;
    };
    [key: number]: unknown;
  };
}

export default class QuickOpen extends Plugin {
  public settings: QuickOpenSettings;
  public activeModal: HTMLElement | null = null;
  private isModifierKeyPressed: boolean = false;
  private modifierKeyListener = (ev: KeyboardEvent): void =>
    this.handleModifierKeyChange(ev);
  private modalScopeStack: Map<object, Scope> = new Map();
  private popoverScopeStack: Map<object, Scope> = new Map();
  private popoutWindows: Set<AppWindow> = new Set();

  // eslint-disable-next-line @typescript-eslint/unbound-method -- stored unbound intentionally; restored on unload via prototype reassignment
  private origSuggestOpen = SuggestModal.prototype.open;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- stored unbound intentionally; restored on unload via prototype reassignment
  private origSuggestClose = SuggestModal.prototype.close;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- stored unbound intentionally; restored on unload via prototype reassignment
  private origPopoverOpen = PopoverSuggest.prototype.open;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- stored unbound intentionally; restored on unload via prototype reassignment
  private origPopoverClose = PopoverSuggest.prototype.close;

  async onload() {
    (window as WindowWithPlugin).quickOpenPlugin = this;
    await this.loadSettings();

    this.addSettingTab(new QuickOpenSettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on(
        "layout-change",
        this.handleLayoutChange.bind(this),
      ),
    );

    addModTransition(activeDocument, this.settings.transitionStyle);

    activeDocument.addEventListener("keydown", this.modifierKeyListener);
    activeDocument.addEventListener("keyup", this.modifierKeyListener);

    this.patchSuggestModal();
    this.patchPopoverSuggest();
  }

  private patchSuggestModal() {
    const origOpen = this.origSuggestOpen;
    const origClose = this.origSuggestClose;
    const { modalScopeStack } = this;
    const getModifier = (): Modifier => this.getKeymapModifier();
    const setActiveModal = (el: HTMLElement): void => {
      this.activeModal = el;
      this.updateModalModifierClass();
    };
    const clearActiveModal = (): void => {
      this.activeModal = null;
    };

    SuggestModal.prototype.open = function (this: SuggestModalInternal) {
      try {
        origOpen.call(this as unknown as SuggestModal<unknown>);

        const plugin = (window as WindowWithPlugin).quickOpenPlugin;
        if (plugin) setActiveModal(this.modalEl);

        if (modalScopeStack.has(this as object)) {
          const oldScope = modalScopeStack.get(this as object);
          if (oldScope) this.app.keymap.popScope(oldScope);
        }

        const modalScope = new Scope(this.scope);
        modalScopeStack.set(this as object, modalScope);

        for (let i = 1; i <= 9; i++) {
          modalScope.register(
            [getModifier()],
            i.toString(),
            (evt) => {
              evt.preventDefault();
              const idx = i - 1;
              if (!this.chooser?.values || idx >= this.chooser.values.length)
                return;
              this.chooser.setSelectedItem(idx, evt);
              if (this.chooser.useSelectedItem) {
                this.chooser.useSelectedItem(evt);
              } else {
                this.onChooseItem?.(this.chooser.values[idx], evt);
              }
            },
          );
        }

        this.app.keymap.pushScope(modalScope);
      } catch (error) {
        console.error("QuickOpen: Error in SuggestModal.open:", error);
      }
    };

    SuggestModal.prototype.close = function (this: SuggestModalInternal) {
      try {
        const scope = modalScopeStack.get(this as object);
        if (scope) {
          this.app.keymap.popScope(scope);
          modalScopeStack.delete(this as object);
        }

        origClose.call(this as unknown as SuggestModal<unknown>);

        const plugin = (window as WindowWithPlugin).quickOpenPlugin;
        if (plugin) {
          clearActiveModal();
          removeModStyles(activeDocument);
        }
      } catch (error) {
        console.error("QuickOpen: Error in SuggestModal.close:", error);
        const scope = modalScopeStack.get(this as object);
        if (scope) {
          try {
            this.app.keymap.popScope(scope);
          } catch (e) {
            console.error("QuickOpen: Failed to pop scope:", e);
          }
          modalScopeStack.delete(this as object);
        }
      }
    };
  }

  private patchPopoverSuggest() {
    const origOpen = this.origPopoverOpen;
    const origClose = this.origPopoverClose;
    const { popoverScopeStack } = this;
    const getModifier = (): Modifier => this.getKeymapModifier();
    const setActiveModal = (el: HTMLElement): void => {
      this.activeModal = el;
      this.updateModalModifierClass();
    };
    const clearActiveModal = (): void => {
      this.activeModal = null;
    };

    PopoverSuggest.prototype.open = function (this: PopoverSuggestInternal) {
      try {
        origOpen.call(this as unknown as PopoverSuggest<unknown>);

        const plugin = (window as WindowWithPlugin).quickOpenPlugin;
        if (plugin) setActiveModal(this.suggestEl);

        if (this.suggestions.values.length < 1) return;

        if (popoverScopeStack.has(this as object)) {
          const oldScope = popoverScopeStack.get(this as object);
          if (oldScope) this.app.keymap.popScope(oldScope);
        }

        const popoverScope = new Scope(this.scope);
        popoverScopeStack.set(this as object, popoverScope);

        const indexMap = this.suggestions.values
          .map((v, i: number) => ({ i, v }))
          .filter(({ v }) => v.type !== "group")
          .map(({ i }) => i);

        for (let i = 1; i <= 9; i++) {
          popoverScope.register(
            [getModifier()],
            i.toString(),
            (evt) => {
              evt.preventDefault();
              const idx = i - 1;
              const realIdx = indexMap[idx];

              if (realIdx == null) return;

              this.suggestions.setSelectedItem(realIdx);
              if (this.suggestions.useSelectedItem) {
                this.suggestions.useSelectedItem(evt);
              } else if (this.suggestions.chooser?.selectSuggestion) {
                this.suggestions.chooser.selectSuggestion(
                  this.suggestions[idx],
                );
              }
            },
          );
        }

        this.app.keymap.pushScope(popoverScope);
      } catch (error) {
        console.error("QuickOpen: Error in PopoverSuggest.open:", error);
      }
    };

    PopoverSuggest.prototype.close = function (this: PopoverSuggestInternal) {
      try {
        const scope = popoverScopeStack.get(this as object);
        if (scope) {
          this.app.keymap.popScope(scope);
          popoverScopeStack.delete(this as object);
        }

        origClose.call(this as unknown as PopoverSuggest<unknown>);

        const plugin = (window as WindowWithPlugin).quickOpenPlugin;
        if (plugin) {
          clearActiveModal();
          removeModStyles(activeDocument);
        }
      } catch (error) {
        console.error("QuickOpen: Error in PopoverSuggest.close:", error);
        const scope = popoverScopeStack.get(this as object);
        if (scope) {
          try {
            this.app.keymap.popScope(scope);
          } catch (e) {
            console.error("QuickOpen: Failed to pop scope:", e);
          }
          popoverScopeStack.delete(this as object);
        }
      }
    };
  }

  onunload() {
    for (const [, scope] of this.modalScopeStack) {
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

    for (const [, scope] of this.popoverScopeStack) {
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

    removeModTransition(activeDocument, this.settings.transitionStyle);

    if (this.modifierKeyListener) {
      activeDocument.removeEventListener("keydown", this.modifierKeyListener);
      activeDocument.removeEventListener("keyup", this.modifierKeyListener);
    }

    SuggestModal.prototype.open = this.origSuggestOpen;
    SuggestModal.prototype.close = this.origSuggestClose;
    PopoverSuggest.prototype.open = this.origPopoverOpen;
    PopoverSuggest.prototype.close = this.origPopoverClose;

    delete (window as WindowWithPlugin).quickOpenPlugin;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private handleModifierKeyChange(event: KeyboardEvent): void {
    const isModifierEvent = event[this.settings.modifierKey];
    if (this.isModifierKeyPressed !== isModifierEvent) {
      this.isModifierKeyPressed = isModifierEvent;
      if (this.activeModal) {
        this.updateModalModifierClass();
      }
    }
  }

  public updateModalModifierClass(): void {
    if (this.activeModal) {
      if (this.isModifierKeyPressed) {
        window.setTimeout(() => {
          if (this.activeModal && this.isModifierKeyPressed)
            addModStyles(this.activeModal.ownerDocument);
        }, 150);
      } else {
        removeModStyles(this.activeModal.ownerDocument);
      }
    }
  }

  private handleLayoutChange(): void {
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

  private initializePopoutWindow(win: AppWindow): void {
    this.popoutWindows.add(win);

    win.addEventListener("keydown", this.modifierKeyListener);
    win.addEventListener("keyup", this.modifierKeyListener);

    this.register(() => {
      win.removeEventListener("keydown", this.modifierKeyListener);
      win.removeEventListener("keyup", this.modifierKeyListener);
      this.popoutWindows.delete(win);
    });
  }

  private getKeymapModifier(): Modifier {
    switch (this.settings.modifierKey) {
      case "metaKey":
        return "Mod";
      case "ctrlKey":
        return "Ctrl";
      case "altKey":
        return "Alt";
      default:
        return "Mod";
    }
  }
}
