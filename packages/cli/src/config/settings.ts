/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { homedir, platform } from 'os';
import * as dotenv from 'dotenv';
import {
  MCPServerConfig,
  LLXPRT_CONFIG_DIR as LLXPRT_DIR,
  getErrorMessage,
  BugCommandSettings,
  TelemetrySettings,
  AuthType,
} from '@vybestack/llxprt-code-core';
import stripJsonComments from 'strip-json-comments';
import { DefaultLight } from '../ui/themes/default-light.js';
import { DefaultDark } from '../ui/themes/default.js';
import { CustomTheme } from '../ui/themes/theme.js';

export const SETTINGS_DIRECTORY_NAME = '.llxprt';
export const USER_SETTINGS_DIR = path.join(homedir(), SETTINGS_DIRECTORY_NAME);
export const USER_SETTINGS_PATH = path.join(USER_SETTINGS_DIR, 'settings.json');

export function getSystemSettingsPath(): string {
  if (process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH) {
    return process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
  }
  if (platform() === 'darwin') {
    return '/Library/Application Support/GeminiCli/settings.json';
  } else if (platform() === 'win32') {
    return 'C:\\ProgramData\\gemini-cli\\settings.json';
  } else {
    return '/etc/gemini-cli/settings.json';
  }
}

export enum SettingScope {
  User = 'User',
  Workspace = 'Workspace',
  System = 'System',
}

export interface CheckpointingSettings {
  enabled?: boolean;
}

export interface SummarizeToolOutputSettings {
  tokenBudget?: number;
}

export interface AccessibilitySettings {
  disableLoadingPhrases?: boolean;
}

export interface Settings {
  theme?: string;
  customThemes?: Record<string, CustomTheme>;
  selectedAuthType?: AuthType;
  sandbox?: boolean | string;
  coreTools?: string[];
  excludeTools?: string[];
  toolDiscoveryCommand?: string;
  toolCallCommand?: string;
  mcpServerCommand?: string;
  mcpServers?: Record<string, MCPServerConfig>;
  allowMCPServers?: string[];
  excludeMCPServers?: string[];
  showMemoryUsage?: boolean;
  contextFileName?: string | string[];
  accessibility?: AccessibilitySettings;
  telemetry?: TelemetrySettings;
  usageStatisticsEnabled?: boolean;
  preferredEditor?: string;
  bugCommand?: BugCommandSettings;
  checkpointing?: CheckpointingSettings;
  autoConfigureMaxOldSpaceSize?: boolean;

  // Git-aware file filtering settings
  fileFiltering?: {
    respectGitIgnore?: boolean;
    respectLlxprtIgnore?: boolean;
    enableRecursiveFileSearch?: boolean;
  };

  hideWindowTitle?: boolean;

  hideTips?: boolean;
  hideBanner?: boolean;

  // Provider configuration settings
  providerApiKeys?: Record<string, string>;
  providerBaseUrls?: Record<string, string>;
  providerToolFormatOverrides?: Record<string, string>;
  providerKeyfiles?: Record<string, string>;

  // Text-based tool call parsing settings
  enableTextToolCallParsing?: boolean;
  textToolCallModels?: string[];

  // OpenAI Responses API settings
  openaiResponsesEnabled?: boolean;

  // Setting for setting maximum number of user/model/tool turns in a session.
  maxSessionTurns?: number;

  // A map of tool names to their summarization settings.
  summarizeToolOutput?: Record<string, SummarizeToolOutputSettings>;

  // Vim mode setting
  vimMode?: boolean;

  // Add other settings here.
  ideMode?: boolean;

  // Default model to use when no model is specified
  defaultModel?: string;

  // Setting for disabling auto-update.
  disableAutoUpdate?: boolean;

  memoryDiscoveryMaxDirs?: number;
}

export interface SettingsError {
  message: string;
  path: string;
}

export interface SettingsFile {
  settings: Settings;
  path: string;
}
export class LoadedSettings {
  constructor(
    system: SettingsFile,
    user: SettingsFile,
    workspace: SettingsFile,
    errors: SettingsError[],
  ) {
    this.system = system;
    this.user = user;
    this.workspace = workspace;
    this.errors = errors;
    this._merged = this.computeMergedSettings();
  }

  readonly system: SettingsFile;
  readonly user: SettingsFile;
  readonly workspace: SettingsFile;
  readonly errors: SettingsError[];

  private _merged: Settings;

  get merged(): Settings {
    return this._merged;
  }

  private computeMergedSettings(): Settings {
    const system = this.system.settings;
    const user = this.user.settings;
    const workspace = this.workspace.settings;

    return {
      ...user,
      ...workspace,
      ...system,
      customThemes: {
        ...(user.customThemes || {}),
        ...(workspace.customThemes || {}),
        ...(system.customThemes || {}),
      },
      mcpServers: {
        ...(user.mcpServers || {}),
        ...(workspace.mcpServers || {}),
        ...(system.mcpServers || {}),
      },
    };
  }

  forScope(scope: SettingScope): SettingsFile {
    switch (scope) {
      case SettingScope.User:
        return this.user;
      case SettingScope.Workspace:
        return this.workspace;
      case SettingScope.System:
        return this.system;
      default:
        throw new Error(`Invalid scope: ${scope}`);
    }
  }

  setValue<K extends keyof Settings>(
    scope: SettingScope,
    key: K,
    value: Settings[K],
  ): void {
    const settingsFile = this.forScope(scope);
    settingsFile.settings[key] = value;
    this._merged = this.computeMergedSettings();
    saveSettings(settingsFile);
  }

  // Provider keyfile methods for llxprt multi-provider support
  getProviderKeyfile(providerName: string): string | undefined {
    const keyfiles = this.merged.providerKeyfiles || {};
    return keyfiles[providerName];
  }

  setProviderKeyfile(providerName: string, keyfilePath: string): void {
    const keyfiles = this.merged.providerKeyfiles || {};
    keyfiles[providerName] = keyfilePath;
    this.setValue(SettingScope.User, 'providerKeyfiles', keyfiles);
  }

  removeProviderKeyfile(providerName: string): void {
    const keyfiles = this.merged.providerKeyfiles || {};
    delete keyfiles[providerName];
    this.setValue(SettingScope.User, 'providerKeyfiles', keyfiles);
  }
}

function resolveEnvVarsInString(value: string): string {
  const envVarRegex = /\$(?:(\w+)|{([^}]+)})/g; // Find $VAR_NAME or ${VAR_NAME}
  return value.replace(envVarRegex, (match, varName1, varName2) => {
    const varName = varName1 || varName2;
    if (process && process.env && typeof process.env[varName] === 'string') {
      return process.env[varName]!;
    }
    return match;
  });
}

function resolveEnvVarsInObject<T>(obj: T): T {
  if (
    obj === null ||
    obj === undefined ||
    typeof obj === 'boolean' ||
    typeof obj === 'number'
  ) {
    return obj;
  }

  if (typeof obj === 'string') {
    return resolveEnvVarsInString(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveEnvVarsInObject(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const newObj = { ...obj } as T;
    for (const key in newObj) {
      if (Object.prototype.hasOwnProperty.call(newObj, key)) {
        newObj[key] = resolveEnvVarsInObject(newObj[key]);
      }
    }
    return newObj;
  }

  return obj;
}

function findEnvFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  while (true) {
    // prefer gemini-specific .env under LLXPRT_DIR
    const geminiEnvPath = path.join(currentDir, LLXPRT_DIR, '.env');
    if (fs.existsSync(geminiEnvPath)) {
      return geminiEnvPath;
    }
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      return envPath;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir || !parentDir) {
      // check .env under home as fallback, again preferring gemini-specific .env
      const homeGeminiEnvPath = path.join(homedir(), LLXPRT_DIR, '.env');
      if (fs.existsSync(homeGeminiEnvPath)) {
        return homeGeminiEnvPath;
      }
      const homeEnvPath = path.join(homedir(), '.env');
      if (fs.existsSync(homeEnvPath)) {
        return homeEnvPath;
      }
      return null;
    }
    currentDir = parentDir;
  }
}

export function setUpCloudShellEnvironment(envFilePath: string | null): void {
  // Special handling for GOOGLE_CLOUD_PROJECT in Cloud Shell:
  // Because GOOGLE_CLOUD_PROJECT in Cloud Shell tracks the project
  // set by the user using "gcloud config set project" we do not want to
  // use its value. So, unless the user overrides GOOGLE_CLOUD_PROJECT in
  // one of the .env files, we set the Cloud Shell-specific default here.
  if (envFilePath && fs.existsSync(envFilePath)) {
    const envFileContent = fs.readFileSync(envFilePath);
    const parsedEnv = dotenv.parse(envFileContent);
    if (parsedEnv.GOOGLE_CLOUD_PROJECT) {
      // .env file takes precedence in Cloud Shell
      process.env.GOOGLE_CLOUD_PROJECT = parsedEnv.GOOGLE_CLOUD_PROJECT;
    } else {
      // If not in .env, set to default and override global
      process.env.GOOGLE_CLOUD_PROJECT = 'cloudshell-gca';
    }
  } else {
    // If no .env file, set to default and override global
    process.env.GOOGLE_CLOUD_PROJECT = 'cloudshell-gca';
  }
}

export function loadEnvironment(): void {
  const envFilePath = findEnvFile(process.cwd());

  if (process.env.CLOUD_SHELL === 'true') {
    setUpCloudShellEnvironment(envFilePath);
  }

  if (envFilePath) {
    dotenv.config({ path: envFilePath, quiet: true });
  }
}

/**
 * Loads settings from user and workspace directories.
 * Project settings override user settings.
 */
export function loadSettings(workspaceDir: string): LoadedSettings {
  loadEnvironment();
  let systemSettings: Settings = {};
  let userSettings: Settings = {};
  let workspaceSettings: Settings = {};
  const settingsErrors: SettingsError[] = [];
  const systemSettingsPath = getSystemSettingsPath();
  // Load system settings
  try {
    if (fs.existsSync(systemSettingsPath)) {
      const systemContent = fs.readFileSync(systemSettingsPath, 'utf-8');
      const parsedSystemSettings = JSON.parse(
        stripJsonComments(systemContent),
      ) as Settings;
      systemSettings = resolveEnvVarsInObject(parsedSystemSettings);
    }
  } catch (error: unknown) {
    settingsErrors.push({
      message: getErrorMessage(error),
      path: systemSettingsPath,
    });
  }

  // Load user settings
  try {
    if (fs.existsSync(USER_SETTINGS_PATH)) {
      const userContent = fs.readFileSync(USER_SETTINGS_PATH, 'utf-8');
      const parsedUserSettings = JSON.parse(
        stripJsonComments(userContent),
      ) as Settings;
      userSettings = resolveEnvVarsInObject(parsedUserSettings);
      // Support legacy theme names
      if (userSettings.theme && userSettings.theme === 'VS') {
        userSettings.theme = DefaultLight.name;
      } else if (userSettings.theme && userSettings.theme === 'VS2015') {
        userSettings.theme = DefaultDark.name;
      }
    }
  } catch (error: unknown) {
    settingsErrors.push({
      message: getErrorMessage(error),
      path: USER_SETTINGS_PATH,
    });
  }

  const workspaceSettingsPath = path.join(
    workspaceDir,
    SETTINGS_DIRECTORY_NAME,
    'settings.json',
  );

  // Load workspace settings
  try {
    if (fs.existsSync(workspaceSettingsPath)) {
      const projectContent = fs.readFileSync(workspaceSettingsPath, 'utf-8');
      const parsedWorkspaceSettings = JSON.parse(
        stripJsonComments(projectContent),
      ) as Settings;
      workspaceSettings = resolveEnvVarsInObject(parsedWorkspaceSettings);
      if (workspaceSettings.theme && workspaceSettings.theme === 'VS') {
        workspaceSettings.theme = DefaultLight.name;
      } else if (
        workspaceSettings.theme &&
        workspaceSettings.theme === 'VS2015'
      ) {
        workspaceSettings.theme = DefaultDark.name;
      }
    }
  } catch (error: unknown) {
    settingsErrors.push({
      message: getErrorMessage(error),
      path: workspaceSettingsPath,
    });
  }

  return new LoadedSettings(
    {
      path: systemSettingsPath,
      settings: systemSettings,
    },
    {
      path: USER_SETTINGS_PATH,
      settings: userSettings,
    },
    {
      path: workspaceSettingsPath,
      settings: workspaceSettings,
    },
    settingsErrors,
  );
}

export function saveSettings(settingsFile: SettingsFile): void {
  try {
    // Ensure the directory exists
    const dirPath = path.dirname(settingsFile.path);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(
      settingsFile.path,
      JSON.stringify(settingsFile.settings, null, 2),
      'utf-8',
    );
  } catch (error) {
    console.error('Error saving user settings file:', error);
  }
}
