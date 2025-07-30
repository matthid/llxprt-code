/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  ProviderManager,
  OpenAIProvider,
  AnthropicProvider,
  GeminiProvider,
} from '@vybestack/llxprt-code-core';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { Settings, USER_SETTINGS_PATH, SETTINGS_DIRECTORY_NAME } from '../config/settings.js';
import stripJsonComments from 'strip-json-comments';

let providerManagerInstance: ProviderManager | null = null;

export function getProviderManager(config?: Config): ProviderManager {
  if (!providerManagerInstance) {
    providerManagerInstance = new ProviderManager();

    // Prepare settings and saved keys
    let savedApiKeys: Record<string, string> = {};
    let userSettings: Settings | undefined;

    // Only auto-initialize providers when not in test environment
    // Additionally, load workspace-scoped settings (which should override user settings)
    if (process.env.NODE_ENV !== 'test') {
      // Load user settings file
      try {
        if (existsSync(USER_SETTINGS_PATH)) {
          const userContent = readFileSync(USER_SETTINGS_PATH, 'utf-8');
          userSettings = JSON.parse(stripJsonComments(userContent)) as Settings;
          savedApiKeys = userSettings.providerApiKeys || {};
        }
      } catch (error) {
        if (process.env.DEBUG || process.env.VERBOSE) {
          console.debug('[ProviderManager] Failed to load user settings:', error instanceof Error ? error.message : error);
        }
      }

      // Also load workspace settings (override user settings)
      try {
        const workspaceSettingsPath = join(
          process.cwd(),
          SETTINGS_DIRECTORY_NAME,
          'settings.json',
        );
        if (existsSync(workspaceSettingsPath)) {
          const workspaceContent = readFileSync(workspaceSettingsPath, 'utf-8');
          const workspaceSettings = JSON.parse(
            stripJsonComments(workspaceContent),
          ) as Settings;

          // Merge workspace settings into userSettings, overriding duplicate keys
          userSettings = {
            ...userSettings,
            ...workspaceSettings,
          } as Settings;

          // Merge providerApiKeys separately to avoid clobbering
          if (workspaceSettings.providerApiKeys) {
            savedApiKeys = {
              ...savedApiKeys,
              ...workspaceSettings.providerApiKeys,
            };
          }
        }
      } catch (error) {
        if (process.env.DEBUG || process.env.VERBOSE) {
          console.debug('[ProviderManager] Failed to load workspace settings:', error instanceof Error ? error.message : error);
        }
      }

      // Register GeminiProvider
      // Apply user-configured Gemini base URL
      const geminiBaseUrl = userSettings?.providerBaseUrls?.gemini ?? process.env.GEMINI_BASE_URL;
      if (geminiBaseUrl) {
        process.env.GEMINI_BASE_URL = geminiBaseUrl;
      }
      const geminiProvider = new GeminiProvider();

            // Defer applying defaultModel until the active provider is known

      if (config) {
        geminiProvider.setConfig(config);
      }
      providerManagerInstance.registerProvider(geminiProvider);

      // Configure Gemini auth with priority: keyfile > key > oauth
      // First check for saved API key
      if (savedApiKeys.gemini) {
        geminiProvider.setApiKey(savedApiKeys.gemini);
      }
      // Then check for keyfile
      else {
        try {
          const keyfilePath = join(homedir(), '.google_key');
          const geminiApiKey = readFileSync(keyfilePath, 'utf-8').trim();
          if (geminiApiKey) {
            geminiProvider.setApiKey(geminiApiKey);
          }
        } catch (error) {
          if (process.env.DEBUG || process.env.VERBOSE) {
            console.debug('[ProviderManager] No Google keyfile found:', error instanceof Error ? error.message : error);
          }
          // Will fall back to OAuth
        }
      }

      // Initialize with OpenAI provider if API key is available
      // Priority: CLI /key (in settings) > Environment variable > keyfile
      let openaiApiKey: string | undefined = savedApiKeys.openai;

      if (!openaiApiKey) {
        openaiApiKey = process.env.OPENAI_API_KEY;
      }

      if (!openaiApiKey) {
        try {
          const apiKeyPath = join(homedir(), '.openai_key');
          openaiApiKey = readFileSync(apiKeyPath, 'utf-8').trim();
        } catch (error) {
          if (process.env.DEBUG || process.env.VERBOSE) {
            console.debug('[ProviderManager] No OpenAI keyfile found:', error instanceof Error ? error.message : error);
          }
        }
      }

      const openaiBaseUrl = userSettings?.providerBaseUrls?.openai ?? process.env.OPENAI_BASE_URL;
      if (process.env.DEBUG || process.env.VERBOSE) {
        console.log('[ProviderManager] Initializing OpenAI provider with:', {
          hasApiKey: !!openaiApiKey,
          baseUrl: openaiBaseUrl || 'default',
        });
      }
      const openaiProvider = new OpenAIProvider(
        openaiApiKey || '',
        openaiBaseUrl,
        userSettings,
      );
      providerManagerInstance.registerProvider(openaiProvider);
      // OpenAI provider registered

      // Initialize with Anthropic provider if API key is available
      // Priority: CLI /key (in settings) > Environment variable > keyfile
      let anthropicApiKey: string | undefined = savedApiKeys.anthropic;

      if (!anthropicApiKey) {
        anthropicApiKey = process.env.ANTHROPIC_API_KEY;
      }

      if (!anthropicApiKey) {
        try {
          const apiKeyPath = join(homedir(), '.anthropic_key');
          anthropicApiKey = readFileSync(apiKeyPath, 'utf-8').trim();
        } catch (error) {
          if (process.env.DEBUG || process.env.VERBOSE) {
            console.debug('[ProviderManager] No Anthropic keyfile found:', error instanceof Error ? error.message : error);
          }
        }
      }

      const anthropicBaseUrl = userSettings?.providerBaseUrls?.anthropic ?? process.env.ANTHROPIC_BASE_URL;
      const anthropicProvider = new AnthropicProvider(
        anthropicApiKey || '',
        anthropicBaseUrl,
      );
      providerManagerInstance.registerProvider(anthropicProvider);
      // Anthropic provider registered
    }
    // Determine desired default/active provider
    const desiredProvider = userSettings?.defaultProvider;

    if (process.env.DEBUG || process.env.VERBOSE) {
      console.debug('[ProviderManager] Available providers:', providerManagerInstance.listProviders());
      console.debug('[ProviderManager] Desired default provider:', desiredProvider);
    }
    if (desiredProvider && providerManagerInstance.listProviders().includes(desiredProvider)) {
      try {
        providerManagerInstance.setActiveProvider(desiredProvider);
      } catch (error) {
        if (process.env.DEBUG || process.env.VERBOSE) {
          console.debug('[ProviderManager] Failed to set active provider:', desiredProvider, error instanceof Error ? error.message : error);
        }
      }
    }

    // Apply defaultModel to the now-active provider (if supported)
    if (userSettings?.defaultModel) {
      try {
        const activeProvider = providerManagerInstance.getActiveProvider();
        if (typeof activeProvider.setModel === 'function') {
          activeProvider.setModel(userSettings.defaultModel);
        }
      } catch (error) {
        if (process.env.DEBUG || process.env.VERBOSE) {
          console.debug('[ProviderManager] Failed to set default model:', error instanceof Error ? error.message : error);
        }
      }
    }
  }

  return providerManagerInstance;
}

export function resetProviderManager(): void {
  providerManagerInstance = null;
}

export { getProviderManager as providerManager };
