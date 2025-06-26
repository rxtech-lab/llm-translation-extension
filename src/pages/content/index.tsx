import { PageTranslator } from '../../translator/pageTranslator';
import { OpenAILLMTranslator } from '../../translator/llm/openaiTranslator';
import { Category } from '../../translator/llm/translator';
import './style.css';

class TranslationContentScript {
  private translator: PageTranslator | null = null;
  private isTranslating = false;
  private currentTranslationGenerator: AsyncGenerator<any, any> | null = null;

  constructor() {
    this.setupMessageListener();
    console.log('Translation content script loaded');
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Content script received message:', message);

      switch (message.action) {
        case 'startTranslation':
          this.handleStartTranslation(message.settings);
          break;

        case 'stopTranslation':
          this.handleStopTranslation();
          break;

        case 'restoreOriginal':
          this.handleRestoreOriginal();
          break;

        case 'termsUpdated':
          this.handleTermsUpdated(message.terms);
          break;
      }
    });
  }

  private async handleStartTranslation(settings: any) {
    if (this.isTranslating) {
      console.log('Translation already in progress');
      return;
    }

    try {
      // Load existing terms
      const termsResult = await chrome.storage.local.get(['translationTerms']);
      const existingTerms: Category[] = termsResult.translationTerms || [];

      // Create translator
      const llmTranslator = new OpenAILLMTranslator(
        {
          apiKey: settings.apiKey,
          model: settings.modelId,
          baseURL: settings.modelUrl
        },
        settings.targetLanguage
      );

      this.translator = new PageTranslator(llmTranslator);
      this.isTranslating = true;

      // Start translation
      this.currentTranslationGenerator = this.translator.translate(document.body);
      
      for await (const progress of this.currentTranslationGenerator) {
        if (!this.isTranslating) {
          break; // Stop if translation was cancelled
        }

        // Send progress to popup
        chrome.runtime.sendMessage({
          action: 'translationProgress',
          progress
        });
      }

      if (this.isTranslating) {
        // Translation completed successfully
        const finalResult = await this.currentTranslationGenerator?.return(undefined);
        
        // Save updated terms
        if (finalResult?.value?.terms) {
          await chrome.storage.local.set({ 
            translationTerms: finalResult.value.terms 
          });
        }

        chrome.runtime.sendMessage({
          action: 'translationComplete',
          result: finalResult?.value
        });
      }

    } catch (error) {
      console.error('Translation error:', error);
      chrome.runtime.sendMessage({
        action: 'translationError',
        error: error instanceof Error ? error.message : 'Translation failed'
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
        action: 'translationStopped'
      });
    }
  }

  private handleRestoreOriginal() {
    if (this.translator) {
      this.translator.restoreOriginalText();
      chrome.runtime.sendMessage({
        action: 'textRestored'
      });
    }
  }

  private handleTermsUpdated(terms: Category[]) {
    console.log('Terms updated:', terms);
    // Terms will be automatically loaded on next translation
  }
}

// Initialize the content script
new TranslationContentScript();
