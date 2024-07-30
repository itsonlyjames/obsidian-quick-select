import { Workspace } from "obsidian";

interface ExtendedWorkspace extends Workspace {
  floatingSplit: {
    children: {
      children: {
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
