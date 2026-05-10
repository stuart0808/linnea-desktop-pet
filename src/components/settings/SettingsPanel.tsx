import React from "react";
import { Bell, FolderOpen, Image as ImageIcon, KeyRound, RotateCcw, Settings, Sparkles, Trash2 } from "lucide-react";
import type { AppSettings, CodexApprovalPolicy, CodexSandboxPolicy, DesktopPetApi } from "../../../shared/types";
import { aiProviderPresets, workspaceThemePresets } from "../../utils/constants";
import { getCodexApprovalLabel, getCodexSandboxLabel } from "../../utils/codexHelpers";
import { Toggle } from "./Toggle";

export function SettingsPanel({
  settings,
  onChange,
  onClearMessages,
  onSelectPetAppearance,
  onResetPetAppearance,
  onTestReminder,
  api
}: {
  settings: AppSettings;
  onChange(patch: Partial<AppSettings>): void | Promise<void>;
  onClearMessages(): void;
  onSelectPetAppearance(): void;
  onResetPetAppearance(): void;
  onTestReminder(): Promise<void>;
  api?: DesktopPetApi;
}) {
  const [apiKey, setApiKey] = React.useState(settings.aiApiKey ?? settings.openAiApiKey ?? "");
  const [aiProviderName, setAiProviderName] = React.useState(settings.aiProviderName ?? aiProviderPresets[settings.aiProvider].label);
  const [aiBaseUrl, setAiBaseUrl] = React.useState(settings.aiBaseUrl ?? aiProviderPresets[settings.aiProvider].baseUrl);
  const [aiModel, setAiModel] = React.useState(settings.aiModel ?? settings.openAiModel);
  const [themeColor, setThemeColor] = React.useState(settings.workspaceThemeColor);
  const [quickAiRecordShortcut, setQuickAiRecordShortcut] = React.useState(settings.quickAiRecordShortcut);
  const [codexExecutable, setCodexExecutable] = React.useState(settings.codexExecutable);
  const [apiTestBusy, setApiTestBusy] = React.useState(false);
  const [apiTestResult, setApiTestResult] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [updateCheckBusy, setUpdateCheckBusy] = React.useState(false);
  const [codexCacheBusy, setCodexCacheBusy] = React.useState(false);
  const [codexCacheResult, setCodexCacheResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  React.useEffect(() => {
    setThemeColor(settings.workspaceThemeColor);
  }, [settings.workspaceThemeColor]);

  React.useEffect(() => {
    setApiKey(settings.aiApiKey ?? settings.openAiApiKey ?? "");
  }, [settings.aiApiKey, settings.openAiApiKey]);

  React.useEffect(() => {
    setAiProviderName(settings.aiProviderName ?? aiProviderPresets[settings.aiProvider].label);
    setAiBaseUrl(settings.aiBaseUrl ?? aiProviderPresets[settings.aiProvider].baseUrl);
    setAiModel(settings.aiModel ?? settings.openAiModel);
  }, [settings.aiBaseUrl, settings.aiModel, settings.aiProvider, settings.aiProviderName, settings.openAiModel]);

  React.useEffect(() => {
    setQuickAiRecordShortcut(settings.quickAiRecordShortcut);
  }, [settings.quickAiRecordShortcut]);

  React.useEffect(() => {
    setCodexExecutable(settings.codexExecutable);
  }, [settings.codexExecutable]);

  function updateThemeColor(value: string) {
    setThemeColor(value);
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      onChange({ workspaceThemeColor: value });
    }
  }

  function changeAiProvider(provider: AppSettings["aiProvider"]) {
    const preset = aiProviderPresets[provider];
    setAiProviderName(preset.label);
    setAiBaseUrl(preset.baseUrl);
    setAiModel(preset.model);
    setApiTestResult(null);
    onChange({
      aiProvider: provider,
      aiProviderName: preset.label,
      aiBaseUrl: preset.baseUrl,
      aiModel: preset.model,
      openAiModel: preset.model
    });
  }

  function persistAiConfig(patch: Partial<AppSettings>) {
    setApiTestResult(null);
    return Promise.resolve(onChange(patch));
  }

  async function testApi() {
    if (!api || apiTestBusy) return;
    await persistAiConfig({
      aiApiKey: apiKey || undefined,
      openAiApiKey: apiKey || undefined,
      aiProviderName: aiProviderName || aiProviderPresets[settings.aiProvider].label,
      aiBaseUrl: aiBaseUrl || undefined,
      aiModel: aiModel || aiProviderPresets[settings.aiProvider].model,
      openAiModel: aiModel || aiProviderPresets[settings.aiProvider].model
    });
    setApiTestBusy(true);
    setApiTestResult(null);
    try {
      const result = await api.chat.testApi(apiKey || undefined);
      setApiTestResult(result);
    } catch (error) {
      setApiTestResult({
        ok: false,
        message: error instanceof Error ? error.message : "连接测试失败。"
      });
    } finally {
      setApiTestBusy(false);
    }
  }

  async function checkForUpdates() {
    if (!api || updateCheckBusy) return;
    setUpdateCheckBusy(true);
    try {
      await api.app.checkForUpdates();
    } finally {
      setUpdateCheckBusy(false);
    }
  }

  async function clearCodexCache() {
    if (!api || codexCacheBusy) return;
    setCodexCacheBusy(true);
    setCodexCacheResult(null);
    try {
      const result = await api.codex.clearCache();
      const freed = formatBytes(result.freedBytes);
      const skipped = result.skippedCount ? `；跳过 ${result.skippedCount} 个运行中会话` : "";
      setCodexCacheResult({
        ok: true,
        message: result.deletedCount
          ? `已清理 ${result.deletedCount} 个临时会话，释放 ${freed}${skipped}`
          : `没有可清理的 Codex 缓存${skipped}`
      });
    } catch (error) {
      setCodexCacheResult({
        ok: false,
        message: error instanceof Error ? error.message : "清理 Codex 缓存失败。"
      });
    } finally {
      setCodexCacheBusy(false);
    }
  }

  function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
  }

  return (
    <section className="settings">
      <div className="settings-overview">
        <div>
          <strong>设置</strong>
          <span>调整 Linnea 主窗口、模型服务和桌宠行为。</span>
        </div>
        <div className="settings-status">
          <span>{settings.aiProviderName ?? aiProviderPresets[settings.aiProvider].label}</span>
          <span>{settings.aiModel ?? settings.openAiModel}</span>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-section ai-setting" aria-label="模型服务设置">
          <div className="settings-section-header">
            <div className="setting-icon"><Sparkles size={15} /></div>
            <div>
              <strong>模型服务</strong>
              <span>配置对话和待办识别使用的模型服务。</span>
            </div>
          </div>
          <label>
            提供商
            <select
              value={settings.aiProvider}
              onChange={(event) => changeAiProvider(event.target.value as AppSettings["aiProvider"])}
            >
              <option value="deepseek">DeepSeek</option>
              <option value="openai">OpenAI</option>
              <option value="custom">自定义提供商</option>
            </select>
          </label>
          {settings.aiProvider === "custom" && (
            <label>
              提供商名称
              <input
                value={aiProviderName}
                onChange={(event) => setAiProviderName(event.target.value)}
                onBlur={() => persistAiConfig({ aiProviderName: aiProviderName || "自定义提供商" })}
                placeholder="例如 OpenRouter / SiliconFlow"
              />
            </label>
          )}
          <div className="settings-two-column">
            <label>
              服务地址
              <input
                value={aiBaseUrl}
                onChange={(event) => setAiBaseUrl(event.target.value)}
                onBlur={() => persistAiConfig({ aiBaseUrl: aiBaseUrl || undefined })}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label>
              模型
              <input
                value={aiModel}
                onChange={(event) => setAiModel(event.target.value)}
                onBlur={() => persistAiConfig({ aiModel: aiModel || aiProviderPresets[settings.aiProvider].model, openAiModel: aiModel || aiProviderPresets[settings.aiProvider].model })}
                placeholder={aiProviderPresets[settings.aiProvider].model}
              />
            </label>
          </div>
          <label>
            访问密钥
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              onBlur={() => persistAiConfig({ aiApiKey: apiKey || undefined, openAiApiKey: apiKey || undefined })}
              placeholder="填写模型服务提供的访问密钥"
            />
          </label>
          <div className="settings-inline-actions">
            <button className="settings-action primary" onClick={() => void testApi()} disabled={apiTestBusy}>
              <Sparkles size={15} /> {apiTestBusy ? "测试中..." : "测试连接"}
            </button>
            {apiTestResult && (
              <div className={`api-test-result ${apiTestResult.ok ? "ok" : "error"}`}>
                {apiTestResult.message}
              </div>
            )}
          </div>
        </section>

        <section className="settings-section codex-setting" aria-label="Codex 设置">
          <div className="settings-section-header">
            <div className="setting-icon"><Sparkles size={15} /></div>
            <div>
              <strong>Codex</strong>
              <span>设置 Linnea 主窗口中 Codex 面板的默认启动方式。</span>
            </div>
          </div>
          <label>
            启动命令
            <input
              value={codexExecutable}
              onChange={(event) => setCodexExecutable(event.target.value)}
              onBlur={() => onChange({ codexExecutable: codexExecutable.trim() || "codex" })}
              placeholder="codex"
            />
          </label>
          <div className="settings-two-column">
            <label>
              默认权限范围
              <select
                value={settings.codexDefaultSandbox}
                onChange={(event) => onChange({ codexDefaultSandbox: event.target.value as CodexSandboxPolicy })}
              >
                <option value="read-only">{getCodexSandboxLabel("read-only")}</option>
                <option value="workspace-write">{getCodexSandboxLabel("workspace-write")}</option>
                <option value="danger-full-access">{getCodexSandboxLabel("danger-full-access")}</option>
              </select>
            </label>
            <label>
              默认执行前确认
              <select
                value={settings.codexDefaultApproval}
                onChange={(event) => onChange({ codexDefaultApproval: event.target.value as CodexApprovalPolicy })}
              >
                <option value="on-request">{getCodexApprovalLabel("on-request")}</option>
                <option value="never">{getCodexApprovalLabel("never")}</option>
              </select>
            </label>
          </div>
          <div className="setting-hint">保持默认即可使用 Codex；拖拽文件会先复制到隔离工作目录。</div>
          <div className="settings-inline-actions">
            <button className="settings-action danger" onClick={() => void clearCodexCache()} disabled={codexCacheBusy}>
              <Trash2 size={15} /> {codexCacheBusy ? "清理中..." : "清除缓存"}
            </button>
            {codexCacheResult && (
              <div className={`api-test-result ${codexCacheResult.ok ? "ok" : "error"}`}>
                {codexCacheResult.message}
              </div>
            )}
          </div>
        </section>

        <section className="settings-section shortcut-setting" aria-label="快捷键设置">
          <div className="settings-section-header">
            <div className="setting-icon"><KeyRound size={15} /></div>
            <div>
              <strong>快捷键</strong>
              <span>快速唤出桌宠气泡，直接记录想法和任务。</span>
            </div>
          </div>
          <label>
            快速 AI 记录
            <input
              value={quickAiRecordShortcut}
              onChange={(event) => setQuickAiRecordShortcut(event.target.value)}
              onBlur={() => onChange({ quickAiRecordShortcut: quickAiRecordShortcut.trim() || "CommandOrControl+Shift+Space" })}
              placeholder="CommandOrControl+Shift+Space"
            />
          </label>
          <div className="setting-hint">格式示例：CommandOrControl+Shift+Space。</div>
        </section>

        <section className="settings-section theme-setting" aria-label="Linnea 主窗口主题颜色">
          <div className="settings-section-header">
            <div className="setting-icon"><Settings size={15} /></div>
            <div>
              <strong>Linnea 主窗口主题颜色</strong>
              <span>同步工作台、提醒气泡和分区强调色。</span>
            </div>
          </div>
          <div className="theme-swatches">
            {workspaceThemePresets.map((color) => (
              <button
                key={color}
                type="button"
                className={`theme-swatch ${settings.workspaceThemeColor.toLowerCase() === color.toLowerCase() ? "active" : ""}`}
                style={{ backgroundColor: color }}
                onClick={() => updateThemeColor(color)}
                aria-label={`使用主题色 ${color}`}
              />
            ))}
            <label className="theme-picker" aria-label="自定义主题颜色">
              <input type="color" value={themeColor} onChange={(event) => updateThemeColor(event.target.value)} />
            </label>
          </div>
        </section>

        <section className="settings-section appearance-setting" aria-label="更换桌宠形象">
          <div className="settings-section-header">
            <div className="setting-icon"><ImageIcon size={15} /></div>
            <div>
              <strong>桌宠形象</strong>
              <span>替换完整状态图组，保持所有情绪状态可用。</span>
            </div>
          </div>
          <div className="appearance-current">
            <strong>{settings.petAppearance?.name ?? "默认 Linnea"}</strong>
            <span>{settings.petAppearance?.directory ?? "使用内置状态图片"}</span>
          </div>
          <div className="appearance-actions">
            <button className="settings-action" onClick={onSelectPetAppearance}>
              <FolderOpen size={15} /> 选择形象文件夹
            </button>
            {settings.petAppearance && (
              <button className="settings-action" onClick={onResetPetAppearance}>
                <RotateCcw size={15} /> 恢复默认
              </button>
            )}
          </div>
          <div className="setting-hint">文件夹名需为 {"{角色名}_state"}，图片文件名如 _Idle_.png、_Talking_.png。</div>
        </section>

        <section className="settings-section behavior-setting" aria-label="行为设置">
          <div className="settings-section-header">
            <div className="setting-icon"><Bell size={15} /></div>
            <div>
              <strong>桌宠行为</strong>
              <span>控制全局浮窗、系统提醒和窗口层级。</span>
            </div>
          </div>
          <div className="toggle-list">
            <Toggle label="浮窗工具" checked={settings.selectionToolsEnabled} onChange={(value) => onChange({ selectionToolsEnabled: value })} />
            <Toggle label="系统通知" checked={settings.systemNotifications} onChange={(value) => onChange({ systemNotifications: value })} />
            <Toggle label="始终置顶" checked={settings.alwaysOnTop} onChange={(value) => onChange({ alwaysOnTop: value })} />
          </div>
          <div className="settings-note">AI 识别到的任务会先生成草案，确认后才保存。</div>
        </section>
      </div>

      <div className="settings-footer">
        <button className="settings-action danger" onClick={onClearMessages}>
          <Trash2 size={15} /> 清除对话记录
        </button>
        <button className="settings-action" onClick={() => void onTestReminder()}>
          <Bell size={15} /> 测试 Windows 提醒
        </button>
        <button className="settings-action" onClick={() => void checkForUpdates()} disabled={updateCheckBusy}>
          <RotateCcw size={15} /> {updateCheckBusy ? "检查中..." : "检查更新"}
        </button>
      </div>
    </section>
  );
}
