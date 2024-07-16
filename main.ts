import { Plugin } from "obsidian";

export default class QuickOpen extends Plugin {
  private modalObserver: MutationObserver;
  private resultsObserver: MutationObserver;
  private activeModal: HTMLElement | null = null;
  private results: { title: string; element: HTMLElement }[] = [];

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

    document.addEventListener("keydown", this.handleKeyPress.bind(this));

    // Check if a modal is already active when the plugin loads
    this.checkForActiveModal();
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
      this.addModalStyles();
    }
  }

  handleModalClosed(modalElement: HTMLElement) {
    if (this.activeModal === modalElement) {
      this.activeModal = null;
      this.results = [];
      this.removeModalStyles();
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
    this.addModalStyles();
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
      if (!document.body.classList.contains("quick-open-modal-active")) {
        this.addModalStyles();
      }
    }
  }

  addModalStyles() {
    document.body.classList.add("quick-open-modal-active");
  }

  removeModalStyles() {
    document.body.classList.remove("quick-open-modal-active");
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
    this.removeModalStyles();
  }
}
