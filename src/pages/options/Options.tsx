import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@src/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@src/components/ui/card";
import { Input } from "@src/components/ui/input";
import { Label } from "@src/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@src/components/ui/select";
import { Separator } from "@src/components/ui/separator";
import "@pages/content/style.css";
import "@pages/options/Options.css";

interface Settings {
	targetLanguage: string;
	apiKey: string;
	modelUrl: string;
	modelId: string;
}

const defaultSettings: Settings = {
	targetLanguage: "zh-CN",
	apiKey: "",
	modelUrl: "https://api.openai.com/v1",
	modelId: "gpt-3.5-turbo",
};

export default function Options() {
	const [settings, setSettings] = useState<Settings>(defaultSettings);
	const [saved, setSaved] = useState(false);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	useEffect(() => {
		loadSettings();
	}, []);

	const loadSettings = async () => {
		try {
			if (!chrome?.storage?.local) {
				console.warn("Chrome storage API not available");
				return;
			}
			const result = await chrome.storage.local.get(["translationSettings"]);
			if (result.translationSettings) {
				setSettings({ ...defaultSettings, ...result.translationSettings });
			}
		} catch (error) {
			console.error("Failed to load settings:", error);
		} finally {
			setLoading(false);
		}
	};

	const saveSettings = async () => {
		try {
			setSaving(true);
			setSaved(false);

			if (!chrome?.storage?.local) {
				throw new Error("Chrome storage API not available");
			}

			// Add a minimum delay to show the loading animation
			await Promise.all([
				chrome.storage.local.set({ translationSettings: settings }),
				new Promise((resolve) => setTimeout(resolve, 800)),
			]);

			setSaving(false);
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
		} catch (error) {
			console.error("Failed to save settings:", error);
			setSaving(false);
		}
	};

	const handleInputChange = (field: keyof Settings, value: string) => {
		setSettings((prev) => ({ ...prev, [field]: value }));
	};

	if (loading) {
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center">
				<div className="text-lg">Loading settings...</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background p-8">
			<div className="max-w-4xl mx-auto space-y-8">
				<div className="text-center space-y-2">
					<h1 className="text-4xl font-bold tracking-tight">
						Translation Settings
					</h1>
					<p className="text-lg text-muted-foreground">
						Configure your AI-powered translation preferences
					</p>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Translation Configuration</CardTitle>
						<CardDescription>
							Set up your language preferences and API credentials
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="space-y-2">
							<Label htmlFor="targetLanguage">Target Language</Label>
							<Select
								value={settings.targetLanguage}
								onValueChange={(value) =>
									handleInputChange("targetLanguage", value)
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select target language" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="zh-CN">Chinese (Simplified)</SelectItem>
									<SelectItem value="zh-TW">Chinese (Traditional)</SelectItem>
									<SelectItem value="ja">Japanese</SelectItem>
									<SelectItem value="ko">Korean</SelectItem>
									<SelectItem value="es">Spanish</SelectItem>
									<SelectItem value="fr">French</SelectItem>
									<SelectItem value="de">German</SelectItem>
									<SelectItem value="it">Italian</SelectItem>
									<SelectItem value="pt">Portuguese</SelectItem>
									<SelectItem value="ru">Russian</SelectItem>
									<SelectItem value="ar">Arabic</SelectItem>
									<SelectItem value="hi">Hindi</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<Separator />

						<div className="space-y-2">
							<Label htmlFor="apiKey">API Key</Label>
							{/** biome-ignore lint/nursery/useUniqueElementIds: <explanation> */}
							<Input
								id="apiKey"
								type="password"
								value={settings.apiKey}
								onChange={(e) => handleInputChange("apiKey", e.target.value)}
								placeholder="Enter your OpenAI API key"
							/>
							<p className="text-sm text-muted-foreground">
								Your API key is stored locally and never shared
							</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="modelUrl">Model URL</Label>
							{/** biome-ignore lint/nursery/useUniqueElementIds: <explanation> */}
							<Input
								id="modelUrl"
								type="url"
								value={settings.modelUrl}
								onChange={(e) => handleInputChange("modelUrl", e.target.value)}
								placeholder="https://api.openai.com/v1"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="modelId">Model ID</Label>
							{/** biome-ignore lint/nursery/useUniqueElementIds: <explanation> */}
							<Input
								id="modelId"
								type="text"
								value={settings.modelId}
								onChange={(e) => handleInputChange("modelId", e.target.value)}
								placeholder="e.g., gpt-4, gpt-3.5-turbo, claude-3-sonnet"
							/>
							<p className="text-sm text-muted-foreground">
								Enter the model ID for your chosen AI provider
							</p>
						</div>

						<Separator />

						<div className="flex items-center justify-between pt-4">
							<motion.div
								whileTap={!saving ? { scale: 0.95 } : {}}
								whileHover={!saving ? { scale: 1.02 } : {}}
								transition={{ type: "spring", stiffness: 400, damping: 10 }}
							>
								<Button onClick={saveSettings} size="lg" disabled={saving}>
									{saving ? (
										<div className="flex items-center gap-2">
											<motion.div
												className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
												animate={{ rotate: 360 }}
												transition={{
													duration: 1,
													repeat: Infinity,
													ease: "linear",
												}}
											/>
											Saving...
										</div>
									) : (
										"Save Settings"
									)}
								</Button>
							</motion.div>

							{saving && (
								<motion.div
									className="text-blue-600 font-medium flex items-center gap-2"
									initial={{ opacity: 0, x: 20 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: -20 }}
									transition={{ duration: 0.3 }}
								>
									<motion.div
										className="w-2 h-2 bg-blue-600 rounded-full"
										animate={{ scale: [1, 1.2, 1] }}
										transition={{ duration: 0.6, repeat: Infinity }}
									/>
									Saving your settings...
								</motion.div>
							)}

							{saved && !saving && (
								<motion.div
									className="text-green-600 font-medium"
									initial={{ opacity: 0, x: 20 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: -20 }}
									transition={{ duration: 0.3 }}
								>
									Settings saved successfully!
								</motion.div>
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>How to Use</CardTitle>
						<CardDescription>
							Get started with the translation extension
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ol className="space-y-2 text-sm">
							<li className="flex items-start gap-2">
								<span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium">
									1
								</span>
								Configure your translation settings above
							</li>
							<li className="flex items-start gap-2">
								<span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium">
									2
								</span>
								Click the extension icon to access translation options
							</li>
							<li className="flex items-start gap-2">
								<span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium">
									3
								</span>
								Use the Terms page to manage specialized terminology
							</li>
							<li className="flex items-start gap-2">
								<span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium">
									4
								</span>
								Visit any webpage and start translating!
							</li>
						</ol>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
