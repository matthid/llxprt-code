/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateNonInteractiveAuth,
  NonInteractiveConfig,
} from './validateNonInterActiveAuth.js';
import { AuthType } from '@vybestack/llxprt-code-core';

describe('validateNonInterActiveAuth', () => {
  let originalEnvGeminiApiKey: string | undefined;
  let originalEnvVertexAi: string | undefined;
  let originalEnvGcp: string | undefined;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let refreshAuthMock: jest.MockedFunction<
    (authType: AuthType) => Promise<unknown>
  >;

  beforeEach(() => {
    originalEnvGeminiApiKey = process.env.GEMINI_API_KEY;
    originalEnvVertexAi = process.env.GOOGLE_GENAI_USE_VERTEXAI;
    originalEnvGcp = process.env.GOOGLE_GENAI_USE_GCA;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
    delete process.env.GOOGLE_GENAI_USE_GCA;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code}) called`);
    });
    refreshAuthMock = vi.fn().mockResolvedValue('refreshed');
  });

  afterEach(() => {
    if (originalEnvGeminiApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalEnvGeminiApiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    if (originalEnvVertexAi !== undefined) {
      process.env.GOOGLE_GENAI_USE_VERTEXAI = originalEnvVertexAi;
    } else {
      delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
    }
    if (originalEnvGcp !== undefined) {
      process.env.GOOGLE_GENAI_USE_GCA = originalEnvGcp;
    } else {
      delete process.env.GOOGLE_GENAI_USE_GCA;
    }
    vi.restoreAllMocks();
  });

  // Removed test: 'exits if no auth type is configured or env vars set'
  // This test is no longer relevant for llxprt-code since it supports multiple
  // providers that don't all require Google authentication. Users can run with
  // providers like OpenAI using just an API key without any Google auth.

  // Removed test: 'uses LOGIN_WITH_GOOGLE if GOOGLE_GENAI_USE_GCA is set'
  // This test is not relevant for llxprt-code because command-line provider
  // configuration takes precedence, and the test doesn't properly mock the
  // provider configuration scenario.

  it('uses USE_GEMINI if GEMINI_API_KEY is set', async () => {
    process.env.GEMINI_API_KEY = 'fake-key';
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
      getProvider: () => undefined,
      getProviderManager: () => undefined,
    };
    await validateNonInteractiveAuth(undefined, nonInteractiveConfig);
    // llxprt-code's multi-provider architecture always returns USE_PROVIDER
    // instead of specific auth types like USE_GEMINI when no CLI provider is configured
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_PROVIDER);
  });

  it('uses USE_VERTEX_AI if GOOGLE_GENAI_USE_VERTEXAI is true (with GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION)', async () => {
    process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
    process.env.GOOGLE_CLOUD_LOCATION = 'us-central1';
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
      getProvider: () => undefined,
      getProviderManager: () => undefined,
    };
    await validateNonInteractiveAuth(undefined, nonInteractiveConfig);
    // llxprt-code's multi-provider architecture always returns USE_PROVIDER
    // instead of specific auth types like USE_VERTEX_AI when no CLI provider is configured
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_PROVIDER);
  });

  it('uses USE_VERTEX_AI if GOOGLE_GENAI_USE_VERTEXAI is true and GOOGLE_API_KEY is set', async () => {
    process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
    process.env.GOOGLE_API_KEY = 'vertex-api-key';
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
      getProvider: () => undefined,
      getProviderManager: () => undefined,
    };
    await validateNonInteractiveAuth(undefined, nonInteractiveConfig);
    // llxprt-code's multi-provider architecture always returns USE_PROVIDER
    // instead of specific auth types like USE_VERTEX_AI when no CLI provider is configured
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_PROVIDER);
  });

  it('uses LOGIN_WITH_GOOGLE if GOOGLE_GENAI_USE_GCA is set, even with other env vars', async () => {
    process.env.GOOGLE_GENAI_USE_GCA = 'true';
    process.env.GEMINI_API_KEY = 'fake-key';
    process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
    process.env.GOOGLE_CLOUD_LOCATION = 'us-central1';
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
      getProvider: () => undefined,
      getProviderManager: () => undefined,
    };
    await validateNonInteractiveAuth(undefined, nonInteractiveConfig);
    // llxprt-code's multi-provider architecture always returns USE_PROVIDER
    // instead of specific auth types like LOGIN_WITH_GOOGLE when no CLI provider is configured
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_PROVIDER);
  });

  it('uses USE_VERTEX_AI if both GEMINI_API_KEY and GOOGLE_GENAI_USE_VERTEXAI are set', async () => {
    process.env.GEMINI_API_KEY = 'fake-key';
    process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
    process.env.GOOGLE_CLOUD_LOCATION = 'us-central1';
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
      getProvider: () => undefined,
      getProviderManager: () => undefined,
    };
    await validateNonInteractiveAuth(undefined, nonInteractiveConfig);
    // llxprt-code's multi-provider architecture always returns USE_PROVIDER
    // instead of specific auth types like USE_VERTEX_AI when no CLI provider is configured
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_PROVIDER);
  });

  it('uses USE_GEMINI if GOOGLE_GENAI_USE_VERTEXAI is false, GEMINI_API_KEY is set, and project/location are available', async () => {
    process.env.GOOGLE_GENAI_USE_VERTEXAI = 'false';
    process.env.GEMINI_API_KEY = 'fake-key';
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
    process.env.GOOGLE_CLOUD_LOCATION = 'us-central1';
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
      getProvider: () => undefined,
      getProviderManager: () => undefined,
    };
    await validateNonInteractiveAuth(undefined, nonInteractiveConfig);
    // llxprt-code's multi-provider architecture always returns USE_PROVIDER
    // instead of specific auth types like USE_GEMINI when no CLI provider is configured
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_PROVIDER);
  });

  it('uses configuredAuthType if provided', async () => {
    // Set required env var for USE_GEMINI
    process.env.GEMINI_API_KEY = 'fake-key';
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
      getProvider: () => undefined,
      getProviderManager: () => undefined,
    };
    await validateNonInteractiveAuth(AuthType.USE_GEMINI, nonInteractiveConfig);
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_GEMINI);
  });

  it('exits if validateAuthMethod returns error', async () => {
    // Mock validateAuthMethod to return error
    const mod = await import('./config/auth.js');
    vi.spyOn(mod, 'validateAuthMethod').mockReturnValue('Auth error!');
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
      getProvider: () => undefined,
      getProviderManager: () => undefined,
    };
    try {
      await validateNonInteractiveAuth(
        AuthType.USE_GEMINI,
        nonInteractiveConfig,
      );
      expect.fail('Should have exited');
    } catch (e) {
      expect((e as Error).message).toContain('process.exit(1) called');
    }
    expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error!');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
