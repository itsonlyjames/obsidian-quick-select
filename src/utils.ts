import { AppWindow } from "./types";
import { transitionOptions } from "./settings";

export const addModStyles = (doc: Document) => {
  doc.body.classList.add("quick-select-mod-key-active");
};

export const addModTransition = (
  doc: Document,
  transitionStyle: transitionOptions,
) => {
  doc.body.classList.add(`quick-select-transition-${transitionStyle}`);
};

export const removeModStyles = (doc: Document) => {
  doc.body.classList.remove("quick-select-mod-key-active");
};

export const removeModTransition = (
  doc: Document,
  transitionStyle: transitionOptions,
) => {
  doc.body.classList.remove(`quick-select-transition-${transitionStyle}`);
};

export const isAppWindow = (win: Window): win is AppWindow => {
  // @ts-ignore
  return "app" in win && "workspace" in win.app;
};
