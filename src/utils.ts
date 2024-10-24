import { AppWindow } from "./types";

export const addModStyles = (doc: Document) => {
  doc.body.classList.add("quick-select-mod-key-active");
};

export const removeModStyles = (doc: Document) => {
  doc.body.classList.remove("quick-select-mod-key-active");
};

export const isAppWindow = (win: Window): win is AppWindow => {
  // @ts-ignore
  return "app" in win && "workspace" in win.app;
};
