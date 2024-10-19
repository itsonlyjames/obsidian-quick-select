import { NavigatorKeyboard, AppWindow } from "./types";

export const isPhysicalKeyboardPresent = () => {
  const nav = navigator as NavigatorKeyboard;
  return nav.keyboard && nav.keyboard.lock !== undefined;
};

export const addModalStyles = (doc: Document) => {
  doc.body.classList.add("quick-select-modal-active");
};

export const removeModalStyles = (doc: Document) => {
  doc.body.classList.remove("quick-select-modal-active");
};

export const isAppWindow = (win: Window): win is AppWindow => {
  return "app" in win && "workspace" in (win as any).app;
};
