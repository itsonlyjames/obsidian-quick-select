import { Workspace } from "obsidian";

interface ExtendedWorkspace extends Workspace {
  floatingSplit: {
    children: {
      children: {
        children: {
          view: {
            getViewType: () => string;
          };
        }[];
        setStacked: (isStacked: boolean) => void;
      }[];
    }[];
  };
}

interface AppWindow extends Window {
  app: {
    workspace: Workspace;
  };
}

declare module "obsidian" {
  interface App {
    internalPlugins: {
      app: {
        hotkeyManager: {
          getDefaultHotkeys: (hotkeyId: string) => Hotkey;
          removeDefaultHotkeys: (hotkeyId: string) => void;
          addDefaultHotkeys: (hotkeyId: string, hotkeys: Hotkey) => void;
          bake: () => void;
        };
      };
    };
  }
}
