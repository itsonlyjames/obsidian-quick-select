import { AppWindow, NavigatorKeyboard } from "./types";

export const canInjectFunctionality = (enableForTablet: boolean) => {
  const userAgent = navigator.userAgent;

  const isTablet =
    /iPad/.test(userAgent) ||
    (/Android/.test(userAgent) && !/Mobile/.test(userAgent));

  if (isTablet) {
    return enableForTablet;
  }

  if (/Android|iPhone|iPod/.test(userAgent)) return false;

  return (navigator as NavigatorKeyboard).keyboard;
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
