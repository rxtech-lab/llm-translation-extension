import { OpenAILLMTranslator } from "../../translator/llm/openaiTranslator";
import { Category } from "../../translator/llm/translator";
import { PageTranslator } from "../../translator/pageTranslator";
import { extractDomain } from "../../utils/domain";
import "./style.css";

class TranslationContentScript {
  private translator: PageTranslator | null = null;
  private isTranslating = false;
  private currentTranslationGenerator: AsyncGenerator<unknown, unknown> | null =
    null;

  constructor() {
    this.setupMessageListener();
    console.log("Translation content script loaded");
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
      console.log("Content script received message:", message);

      switch (message.action) {
        case "startTranslation":
          this.handleStartTranslation(message.settings);
          break;

        case "stopTranslation":
          this.handleStopTranslation();
          break;

        case "restoreOriginal":
          this.handleRestoreOriginal();
          break;

        case "termsUpdated":
          this.handleTermsUpdated(message.terms);
          break;
      }
    });
  }

  private async handleStartTranslation(settings: {
    apiKey: string;
    modelId: string;
    modelUrl: string;
    targetLanguage: string;
  }) {
    if (this.isTranslating) {
      console.log("Translation already in progress");
      return;
    }

    try {
      // Get current domain
      const currentDomain = extractDomain(window.location.href);

      // Load existing terms for this domain
      const termsResult = await chrome.storage.local.get([
        "translationTermsByDomain",
        "translationTerms",
      ]);
      let existingTerms: Category[] = [];

      if (termsResult.translationTermsByDomain) {
        existingTerms = PageTranslator.filterTermsByDomain(
          termsResult.translationTermsByDomain,
          currentDomain
        );
      } else if (termsResult.translationTerms) {
        // Migrate old format to new format
        existingTerms = termsResult.translationTerms || [];
      }

      // Create translator
      const llmTranslator = new OpenAILLMTranslator(
        {
          apiKey: settings.apiKey,
          model: settings.modelId,
          baseURL: settings.modelUrl,
        },
        settings.targetLanguage
      );

      // Callback function to save terms to Chrome storage
      const saveTermsCallback = async (terms: Category[], domain?: string) => {
        await chrome.runtime.sendMessage({
          action: "saveTerms",
          terms: terms,
          domain,
        });
      };

      this.translator = new PageTranslator(
        llmTranslator,
        existingTerms,
        PageTranslator.DEFAULT_BATCH_SIZE,
        saveTermsCallback,
        currentDomain
      );
      this.isTranslating = true;

      // Start translation
      this.currentTranslationGenerator = this.translator.translate(
        document.body
      );

      for await (const progress of this.currentTranslationGenerator) {
        if (!this.isTranslating) {
          break; // Stop if translation was cancelled
        }

        // Send progress to popup
        chrome.runtime.sendMessage({
          action: "translationProgress",
          progress,
        });
      }

      if (this.isTranslating) {
        // Translation completed successfully
        const finalResult = await this.currentTranslationGenerator?.return(
          undefined
        );

        // Save updated terms
        //@ts-expect-error
        if (finalResult?.value?.terms) {
          await chrome.runtime.sendMessage({
            action: "saveTerms",
            //@ts-expect-error
            terms: finalResult.value.terms,
            domain: currentDomain,
          });
        }

        chrome.runtime.sendMessage({
          action: "translationComplete",
          result: finalResult?.value,
        });
      }
    } catch (error) {
      console.error("Translation error:", error);
      chrome.runtime.sendMessage({
        action: "translationError",
        error: error instanceof Error ? error.message : "Translation failed",
      });
    } finally {
      this.isTranslating = false;
      this.currentTranslationGenerator = null;
    }
  }

  private handleStopTranslation() {
    if (this.isTranslating) {
      this.isTranslating = false;

      // Try to stop the generator gracefully
      if (this.currentTranslationGenerator) {
        this.currentTranslationGenerator.return(undefined);
        this.currentTranslationGenerator = null;
      }

      chrome.runtime.sendMessage({
        action: "translationStopped",
      });
    }
  }

  private handleRestoreOriginal() {
    if (this.translator) {
      this.translator.restoreOriginalText(document.body);
      chrome.runtime.sendMessage({
        action: "textRestored",
      });
    }
  }

  private handleTermsUpdated(
    terms: { [domain: string]: Category[] } | Category[]
  ) {
    console.log("Terms updated:", terms);

    // Handle both old format (array) and new format (object)
    let termsToUpdate: Category[] = [];
    if (Array.isArray(terms)) {
      // Old format - use as is
      termsToUpdate = terms;
    } else {
      // New format - get terms for current domain
      const currentDomain = extractDomain(window.location.href);
      termsToUpdate = PageTranslator.filterTermsByDomain(terms, currentDomain);
    }
  }
}

// Initialize the content script
new TranslationContentScript();
