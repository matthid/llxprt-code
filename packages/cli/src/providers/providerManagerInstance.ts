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
  sanitizeForByteString,
  needsSanitization,
} from '@vybestack/llxprt-code-core';
import { IFileSystem, NodeFileSystem } from './IFileSystem.js';
import { homedir } from 'os';
import { join } from 'path';
import { Settings, USER_SETTINGS_PATH } from '../config/settings.js';
import stripJsonComments from 'strip-json-comments';

/**
 * Sanitizes API keys to remove problematic characters that cause ByteString errors.
 * This handles cases where API key files have encoding issues or contain
 * Unicode replacement characters (U+FFFD).
 */
function sanitizeApiKey(key: string): string {
  const sanitized = sanitizeForByteString(key);

  if (needsSanitization(key)) {
    console.warn(
      '[ProviderManager] API key contained non-ASCII or control characters that were removed. ' +
        'Please check your API key file encoding (should be UTF-8 without BOM).',
    );
  }

  return sanitized;
}

let providerManagerInstance: ProviderManager | null = null;
let fileSystemInstance: IFileSystem | null = null;

/**
 * Set a custom file system implementation (mainly for testing).
 */
export function setFileSystem(fs: IFileSystem): void {
  fileSystemInstance = fs;
}

/**
 * Get the file system implementation to use.
 */
function getFileSystem(): IFileSystem {
  if (!fileSystemInstance) {
    fileSystemInstance = new NodeFileSystem();
  }
  return fileSystemInstance;
}

export function getProviderManager(
  config?: Config,
  allowBrowserEnvironment = false,
): ProviderManager {
  if (!providerManagerInstance) {
    providerManagerInstance = new ProviderManager();
    const fs = getFileSystem();

    // Load user settings
    let userSettings: Settings | undefined;
    try {
      if (fs.existsSync(USER_SETTINGS_PATH)) {
        const userContent = fs.readFileSync(USER_SETTINGS_PATH, 'utf-8');
        userSettings = JSON.parse(stripJsonComments(userContent)) as Settings;
      }
    } catch (_error) {
      // Failed to load user settings, that's OK
    }

    // Only auto-initialize providers when not in test environment
    if (process.env.NODE_ENV !== 'test') {
      // Register Gemini provider
      const geminiProvider = new GeminiProvider(undefined, undefined, config);
      if (config) {
        geminiProvider.setConfig(config);
      }
      providerManagerInstance.registerProvider(geminiProvider);

      // Configure Gemini auth - check for keyfile only (OAuth otherwise)
      try {
        const keyfilePath = join(homedir(), '.google_key');
        if (fs.existsSync(keyfilePath)) {
          const geminiApiKey = fs.readFileSync(keyfilePath, 'utf-8').trim();
          if (geminiApiKey) {
            geminiProvider.setApiKey(sanitizeApiKey(geminiApiKey));
          }
        }
      } catch (_error) {
        // No Google keyfile available, that's OK - will use OAuth if available
      }

      // Initialize OpenAI provider
      // Priority: Environment variable > keyfile
      let openaiApiKey: string | undefined;

      if (process.env.OPENAI_API_KEY) {
        openaiApiKey = sanitizeApiKey(process.env.OPENAI_API_KEY);
      }

      if (!openaiApiKey) {
        try {
          const apiKeyPath = join(homedir(), '.openai_key');
          if (fs.existsSync(apiKeyPath)) {
            const rawKey = fs.readFileSync(apiKeyPath, 'utf-8').trim();
            openaiApiKey = sanitizeApiKey(rawKey);
          }
        } catch (_error) {
          // No OpenAI keyfile available, that's OK
        }
      }

      const openaiBaseUrl = process.env.OPENAI_BASE_URL;
      if (process.env.DEBUG || process.env.VERBOSE) {
        console.log('[ProviderManager] Initializing OpenAI provider with:', {
          hasApiKey: !!openaiApiKey,
          baseUrl: openaiBaseUrl || 'default',
        });
      }

      // Create provider config from user settings
      const openaiProviderConfig = {
        enableTextToolCallParsing: userSettings?.enableTextToolCallParsing,
        textToolCallModels: userSettings?.textToolCallModels,
        providerToolFormatOverrides: userSettings?.providerToolFormatOverrides,
        openaiResponsesEnabled: userSettings?.openaiResponsesEnabled,
        allowBrowserEnvironment,
      };
      const openaiProvider = new OpenAIProvider(
        openaiApiKey || '',
        openaiBaseUrl,
        openaiProviderConfig,
      );
      providerManagerInstance.registerProvider(openaiProvider);

      // Initialize Anthropic provider
      // Priority: Environment variable > keyfile
      let anthropicApiKey: string | undefined;

      if (process.env.ANTHROPIC_API_KEY) {
        anthropicApiKey = sanitizeApiKey(process.env.ANTHROPIC_API_KEY);
      }

      if (!anthropicApiKey) {
        try {
          const apiKeyPath = join(homedir(), '.anthropic_key');
          if (fs.existsSync(apiKeyPath)) {
            const rawKey = fs.readFileSync(apiKeyPath, 'utf-8').trim();
            anthropicApiKey = sanitizeApiKey(rawKey);
          }
        } catch (_error) {
          // No Anthropic keyfile available, that's OK
        }
      }

      const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
      const anthropicProviderConfig = {
        allowBrowserEnvironment,
      };
      const anthropicProvider = new AnthropicProvider(
        anthropicApiKey || '',
        anthropicBaseUrl,
        anthropicProviderConfig,
      );
      providerManagerInstance.registerProvider(anthropicProvider);

      // Optionally set desired default/active provider from settings
      const desiredProvider = userSettings?.defaultProvider;
      if (
        desiredProvider &&
        providerManagerInstance.listProviders().includes(desiredProvider)
      ) {
        try {
          providerManagerInstance.setActiveProvider(desiredProvider);
        } catch (_error) {
          // Ignore failures here
        }
      }
    }
  }

  return providerManagerInstance;
}

export function resetProviderManager(): void {
  providerManagerInstance = null;
  fileSystemInstance = null;
}

export { getProviderManager as providerManager };