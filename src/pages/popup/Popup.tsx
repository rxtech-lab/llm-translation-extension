import React, { useState, useEffect } from "react";
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
import "@pages/content/style.css";

interface TranslationProgress {
	current: number;
	total: number;
	currentText?: string;
	translatedText?: string;
	cost?: number;
	error?: string;
}

export default function Popup() {
	const [isTranslating, setIsTranslating] = useState(false);
	const [progress, setProgress] = useState<TranslationProgress | null>(null);
	const [settings, setSettings] = useState<any>(null);
	const [loading, setLoading] = useState(true);

	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	useEffect(() => {
		loadSettings();
	}, []);

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
		setProgress({ current: 0, total: 0, cost: 0 });

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
					<CardTitle className="text-xl">LLM Translation</CardTitle>
					<CardDescription>AI-powered webpage translation</CardDescription>
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
							<Card>
								<CardHeader className="pb-3">
									<div className="flex justify-between items-center">
										<CardTitle className="text-sm">
											Translation Progress
										</CardTitle>
										<Badge variant="secondary">
											{progress.current}/{progress.total}
										</Badge>
									</div>
								</CardHeader>
								<CardContent className="space-y-4">
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

									{progress.cost !== undefined && (
										<div className="text-xs text-muted-foreground">
											Estimated cost: ${progress.cost.toFixed(4)}
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
								</CardContent>
							</Card>
						) : null}
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="border-t p-3 bg-muted/30">
				<div className="flex space-x-2">
					<Button
						onClick={openSettings}
						variant="outline"
						size="sm"
						className="flex-1"
					>
						Settings
					</Button>
					<Button
						onClick={openTerms}
						variant="outline"
						size="sm"
						className="flex-1"
					>
						Terms
					</Button>
				</div>
			</div>
		</div>
	);
}
