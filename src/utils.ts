import { AppWindow } from "./types";

export const canInjectFunctionality = () => {
  const userAgent = navigator.userAgent;

  if (/Android|iPhone|iPod/.test(userAgent)) return false;

  return true;
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
