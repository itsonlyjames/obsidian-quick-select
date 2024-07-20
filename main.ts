import { Plugin, WorkspaceLeaf } from "obsidian";

export default class QuickOpen extends Plugin {
  private modalObserver: MutationObserver;
  private resultsObserver: MutationObserver;
  private activeModal: HTMLElement | null = null;
  private results: { title: string; element: HTMLElement }[] = [];
  private popoutWindows: Set<Window> = new Set();

  async onload() {
    this.modalObserver = new MutationObserver(
      this.handleDOMMutation.bind(this),
    );
    this.modalObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    this.resultsObserver = new MutationObserver(
      this.handleResultsMutation.bind(this),
    );

    this.registerEvent(
      this.app.workspace.on(
        "quick-preview",
        this.handleQuickPreview.bind(this),
      ),
    );

    this.registerEvent(
      this.app.workspace.on(
        "layout-change",
        this.handleLayoutChange.bind(this),
      ),
    );

    document.addEventListener("keydown", this.handleKeyPress.bind(this));

    // Check if a modal is already active when the plugin loads
    this.checkForActiveModal();
  }

  handleLayoutChange() {
    this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      const bodyEl = leaf.view.containerEl.closest("body");
      if (bodyEl?.classList.contains("is-popout-window")) {
        const win = bodyEl.ownerDocument.defaultView;
        if (win && !this.popoutWindows.has(win)) {
          this.initializePopoutWindow(win);
        }
      }
    });
  }

  initializePopoutWindow(win: Window) {
    this.popoutWindows.add(win);

    const popoutModalObserver = new MutationObserver(
      this.handleDOMMutation.bind(this),
    );
    popoutModalObserver.observe(win.document.body, {
      childList: true,
      subtree: true,
    });

    win.addEventListener("keydown", this.handleKeyPress.bind(this));

    this.register(() => {
      popoutModalObserver.disconnect();
      win.removeEventListener("keydown", this.handleKeyPress.bind(this));
      this.popoutWindows.delete(win);
    });
  }

  handleDOMMutation(mutations: MutationRecord[]) {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (
          node instanceof HTMLElement &&
          node.classList.contains("modal-container")
        ) {
          this.handleNewModal(node);
        }
      });

      mutation.removedNodes.forEach((node) => {
        if (
          node instanceof HTMLElement &&
          node.classList.contains("modal-container")
        ) {
          this.handleModalClosed(node);
        }
      });
    }
  }

  handleNewModal(modalElement: HTMLElement) {
    const resultsContainer = modalElement.querySelector(".prompt-results");
    if (resultsContainer) {
      this.activeModal = modalElement;
      this.injectFunctionality(resultsContainer);
      this.addModalStyles(modalElement.ownerDocument);
    }
  }

  handleModalClosed(modalElement: HTMLElement) {
    if (this.activeModal === modalElement) {
      this.activeModal = null;
      this.results = [];
      this.removeModalStyles(modalElement.ownerDocument);
      this.resultsObserver.disconnect();
    }
  }

  injectFunctionality(resultsContainer: Element) {
    this.updateResults(resultsContainer);
    this.resultsObserver.observe(resultsContainer, {
      childList: true,
      subtree: true,
    });
  }

  handleResultsMutation() {
    if (this.activeModal) {
      const resultsContainer = this.activeModal.querySelector(
        ".prompt-results",
      );
      if (resultsContainer) {
        this.updateResults(resultsContainer);
      }
    }
  }

  updateResults(resultsContainer: Element) {
    const items = resultsContainer.querySelectorAll(".suggestion-item");
    this.results = Array.from(items).slice(0, 9).map((item, index) => ({
      title: item.textContent || `Result ${index + 1}`,
      element: item as HTMLElement,
    }));
    this.addModalStyles(resultsContainer.ownerDocument);
  }

  handleKeyPress(event: KeyboardEvent) {
    if (
      (event.metaKey || event.ctrlKey) && event.key >= "1" && event.key <= "9"
    ) {
      const index = parseInt(event.key) - 1;
      if (this.results[index]) {
        event.preventDefault();
        this.results[index].element.click();
      }
    }
  }

  handleQuickPreview() {
    if (this.activeModal) {
      // Ensure styles are added only once
      if (
        !this.activeModal.ownerDocument.body.classList.contains(
          "quick-open-modal-active",
        )
      ) {
        this.addModalStyles(this.activeModal.ownerDocument);
      }
    }
  }

  addModalStyles(doc: Document) {
    doc.body.classList.add("quick-open-modal-active");
  }

  removeModalStyles(doc: Document) {
    doc.body.classList.remove("quick-open-modal-active");
  }

  checkForActiveModal() {
    const modalElement = document.querySelector(".modal-container");
    if (modalElement instanceof HTMLElement) {
      this.handleNewModal(modalElement);
    }
  }

  onunload() {
    this.modalObserver.disconnect();
    this.resultsObserver.disconnect();
    document.removeEventListener("keydown", this.handleKeyPress);
    this.removeModalStyles(document);

    // Clean up for popout windows
    this.popoutWindows.forEach((win) => {
      win.removeEventListener("keydown", this.handleKeyPress);
      this.removeModalStyles(win.document);
    });
  }
}
