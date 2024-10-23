import { AppWindow } from "./types";

export const isKeyboardPresent = async () => {
  // @ts-ignore
  const keyboardLayout = await navigator.keyboard.getLayoutMap();
  return keyboardLayout && keyboardLayout.size > 0;
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
