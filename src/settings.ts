import { App, PluginSettingTab, Setting } from "obsidian";
import QuickOpen from "./main";

type modOptions = "metaKey" | "ctrlKey" | "altKey";
export type transitionOptions = "none" | "fade" | "slide" | "permanent";
export interface QuickOpenSettings {
  stackTabsInPopout: boolean;
  modifierKey: modOptions;
  transitionStyle: transitionOptions;
}

export const DEFAULT_SETTINGS: QuickOpenSettings = {
  stackTabsInPopout: true,
  modifierKey: "metaKey",
  transitionStyle: "slide",
};

export class QuickOpenSettingTab extends PluginSettingTab {
  plugin: QuickOpen;

  constructor(app: App, plugin: QuickOpen) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h1", { text: "Quick Select Settings" });

    const keyDisplay = containerEl.createSpan();
    keyDisplay.setText(" (press key)");

    document.addEventListener("keydown", (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey)
        keyDisplay.setText(event.key);
    });

    new Setting(containerEl)
      .setName("Modifier key")
      .setDesc(
        createFragment((frag) => {
          frag.appendText("Choose the key that activates Quick Select: ");
          frag.append(keyDisplay);
        }),
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            metaKey: "Meta",
            ctrlKey: "Control",
            altKey: "Alt",
          })
          .setValue(this.plugin.settings.modifierKey)
          .onChange(async (value: modOptions) => {
            this.plugin.settings.modifierKey = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Counter transition style")
      .setDesc("Set transition style of Quick Select counters")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            none: "None",
            fade: "Fade",
            slide: "Slide",
            permanent: "Permanent",
          })
          .setValue(this.plugin.settings.transitionStyle)
          .onChange(async (value: transitionOptions) => {
            console.log(document.body.classList);
            document.body.classList.forEach((className) => {
              if (/^quick-select-transition-/.test(className)) {
                document.body.classList.remove(className);
              }
            });
            document.body.classList.add(`quick-select-transition-${value}`);
            this.plugin.settings.transitionStyle = value;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl("h2", { text: "Miscellaneous" });

    new Setting(containerEl)
      .setName("Stack tabs in popout windows")
      .setDesc("Enable or disable stacked tabs for popout windows")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.stackTabsInPopout)
          .onChange(async (value) => {
            this.plugin.settings.stackTabsInPopout = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
