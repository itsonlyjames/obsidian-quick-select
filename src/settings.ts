import { App, PluginSettingTab, Setting } from "obsidian";
import QuickOpen from "./main";

export interface QuickOpenSettings {
  stackTabsInPopout: boolean;
}

export const DEFAULT_SETTINGS: QuickOpenSettings = {
  stackTabsInPopout: true,
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

    containerEl.createEl("h2", { text: "Quick Select Settings" });

    new Setting(containerEl)
      .setName("Stack Tabs in Popout Windows")
      .setDesc("Enable or disable stacked tabs for popout windows.")
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
