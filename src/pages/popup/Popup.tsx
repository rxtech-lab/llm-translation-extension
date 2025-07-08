import React, { useState, useEffect, useRef } from "react";
import { Button } from "@src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@src/components/ui/card";
import { Progress } from "@src/components/ui/progress";
import { Badge } from "@src/components/ui/badge";
import { MoreVertical } from "lucide-react";
import "@pages/content/style.css";

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface TranslationProgress {
  current: number;
  total: number;
  currentText?: string;
  translatedText?: string;
  usage?: TokenUsage;
  error?: string;
}

export default function Popup() {
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState<TranslationProgress | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdown]);

  const loadSettings = async () => {
    try {
      console.log("Loading settings from storage...", chrome.storage);
      const result = await chrome.storage.local.get(["translationSettings"]);
      setSettings(result.translationSettings);
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const startTranslation = async () => {
    if (!settings?.apiKey) {
      chrome.tabs.create({
        url: chrome.runtime.getURL("src/pages/options/index.html"),
      });
      window.close();
      return;
    }

    setIsTranslating(true);
    setProgress({ current: 0, total: 0 });

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab.id) return;

      // Send message to content script to start translation
      chrome.tabs.sendMessage(tab.id, {
        action: "startTranslation",
        settings,
      });

      // Listen for progress updates
      const messageListener = (message: any) => {
        if (message.action === "translationProgress") {
          console.log("Progress update:", message.progress);
          setProgress(message.progress);
        } else if (message.action === "translationComplete") {
          setIsTranslating(false);
          setProgress(null);
        } else if (message.action === "translationError") {
          setIsTranslating(false);
          setProgress({ current: 0, total: 0, error: message.error });
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);

      // Cleanup listener when component unmounts or translation ends
      return () => chrome.runtime.onMessage.removeListener(messageListener);
    } catch (error) {
      setIsTranslating(false);
      setProgress({
        current: 0,
        total: 0,
        error: "Failed to start translation",
      });
    }
  };

  const stopTranslation = async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: "stopTranslation" });
    }
    setIsTranslating(false);
    setProgress(null);
  };

  const restoreOriginal = async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: "restoreOriginal" });
    }
  };

  const openSettings = () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/pages/options/index.html"),
    });
    window.close();
  };

  const openTerms = () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/pages/terms/index.html"),
    });
  };

  const toggleDropdown = () => {
    setShowDropdown(!showDropdown);
  };

  const handleSettingsClick = () => {
    setShowDropdown(false);
    openSettings();
  };

  const handleTermsClick = () => {
    setShowDropdown(false);
    openTerms();
  };

  if (loading) {
    return (
      <div className="w-96 h-[500px] bg-background p-4 flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-[500px] bg-background flex flex-col">
      {/* Header */}
      <Card className="border-none shadow-none mb-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">LLM Translation</CardTitle>
              <CardDescription>AI-powered webpage translation</CardDescription>
            </div>
            <div className="relative" ref={dropdownRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleDropdown}
                className="h-8 w-8 p-0 rounded-full"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
              {showDropdown && (
                <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                  <div className="py-1">
                    <button
                      onClick={handleSettingsClick}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    >
                      Settings
                    </button>
                    <button
                      onClick={handleTermsClick}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    >
                      Terms
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        {!settings?.apiKey ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="text-muted-foreground">
                  Please configure your API key first
                </div>
                <Button
                  onClick={openSettings}
                  className="w-full"
                  variant={"outline"}
                >
                  Open Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {!isTranslating && !progress ? (
              <div className="space-y-3">
                <Button
                  onClick={startTranslation}
                  className="w-full h-12"
                  size="lg"
                >
                  Start Translation
                </Button>
                <Button
                  onClick={restoreOriginal}
                  variant="secondary"
                  className="w-full"
                >
                  Restore Original
                </Button>
              </div>
            ) : progress ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-semibold">
                    Translation Progress
                  </h3>
                  <Badge variant="secondary">
                    {progress.current}/{progress.total}
                  </Badge>
                </div>

                <Progress
                  value={
                    progress.total > 0
                      ? (progress.current / progress.total) * 100
                      : 0
                  }
                  className="w-full"
                />

                {progress.currentText && (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      Current:
                    </div>
                    <div className="text-sm p-2 bg-muted rounded-md">
                      {progress.currentText.length > 50
                        ? `${progress.currentText.substring(0, 50)}...`
                        : progress.currentText}
                    </div>
                    {progress.translatedText && (
                      <>
                        <div className="text-xs text-muted-foreground">
                          Translation:
                        </div>
                        <div className="text-sm p-2 bg-primary/10 rounded-md text-primary">
                          {progress.translatedText.length > 50
                            ? `${progress.translatedText.substring(0, 50)}...`
                            : progress.translatedText}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {progress.usage && progress.usage.totalTokens > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Token Usage:
                    </div>
                    <div className="text-xs space-y-1">
                      <div className="flex justify-between">
                        <span>Input:</span>
                        <span className="font-mono">
                          {progress.usage.promptTokens.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Output:</span>
                        <span className="font-mono">
                          {progress.usage.completionTokens.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>Total:</span>
                        <span className="font-mono">
                          {progress.usage.totalTokens.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Debug: Show raw progress object */}
                {process.env.NODE_ENV === "development" && (
                  <div className="text-xs text-muted-foreground">
                    <pre>{JSON.stringify(progress, null, 2)}</pre>
                  </div>
                )}

                {progress.error && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                    <div className="text-sm text-destructive">
                      {progress.error}
                    </div>
                  </div>
                )}

                {isTranslating && (
                  <Button
                    onClick={stopTranslation}
                    variant="destructive"
                    className="w-full"
                  >
                    Stop Translation
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
