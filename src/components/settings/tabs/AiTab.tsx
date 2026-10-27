'use client'

import { useSettings } from '@/lib/settings'
import { useInputContextMenu } from '@/lib/use-input-context-menu'
import { SWITCH_CLASSES, SWITCH_DOT } from '../controls'
export function AiTab() {
  const { settings, updateSetting } = useSettings()
  const apiKeyRef = useInputContextMenu()
  const aiModelRef = useInputContextMenu()
  const aiBaseUrlRef = useInputContextMenu()
  const syncServerUrlRef = useInputContextMenu()
  return (
    <>
              <div className="flex flex-col gap-5">
                {/* 云同步：服务未上线，先灰着占位。开关不接后端，能拨动反而误导。 */}
                <div className="flex flex-col gap-1 border-b border-line pb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-faint">云同步</span>
                    <button
                      role="switch"
                      aria-checked={false}
                      aria-disabled="true"
                      disabled
                      title="暂未开放"
                      className={`${SWITCH_CLASSES.base} ${SWITCH_CLASSES.off} disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <span className={`${SWITCH_DOT} translate-x-[2px]`} />
                    </button>
                  </div>
                  <span className="text-xs text-ink-faint">开发中</span>
                </div>

                <label className="flex items-center justify-between">
                  <span className="text-sm text-ink">启用AI概括功能</span>
                  <button
                    role="switch"
                    aria-checked={settings.aiEnabled}
                    onClick={() =>
                      updateSetting("aiEnabled", !settings.aiEnabled)
                    }
                    className={`${SWITCH_CLASSES.base} ${
                      settings.aiEnabled ? SWITCH_CLASSES.on : SWITCH_CLASSES.off
                    }`}
                  >
                    <span
                      className={`${SWITCH_DOT} ${
                        settings.aiEnabled
                          ? "translate-x-[18px] bg-paper"
                          : "translate-x-[2px]"
                      }`}
                    />
                  </button>
                </label>

                {settings.aiEnabled ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm text-ink">API Key</label>
                      <input
                        ref={apiKeyRef}
                        type="password"
                        value={settings.apiKey}
                        onChange={(e) => updateSetting("apiKey", e.target.value)}
                        placeholder="sk-...（从 platform.deepseek.com 获取）"
                        className="h-8 w-full border-b border-line bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
                      />
                      <span className="text-xs text-ink-faint">
                        密钥仅存储在本地，不会上传到任何服务器
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm text-ink">AI 模型</label>
                      <input
                        ref={aiModelRef}
                        type="text"
                        value={settings.aiModel}
                        onChange={(e) => updateSetting("aiModel", e.target.value)}
                        placeholder="deepseek-v4-flash"
                        className="h-8 w-full border-b border-line bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm text-ink">Base URL</label>
                      <input
                        ref={aiBaseUrlRef}
                        type="text"
                        value={settings.aiBaseUrl}
                        onChange={(e) =>
                          updateSetting("aiBaseUrl", e.target.value)
                        }
                        placeholder="https://api.deepseek.com"
                        className="h-8 w-full border-b border-line bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
                      />
                    </div>
                  </>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-ink">同步服务端地址（开发中...）</label>
                  <input
                    ref={syncServerUrlRef}
                    type="text"
                    value={settings.syncServerUrl}
                    onChange={(e) =>
                      updateSetting("syncServerUrl", e.target.value)
                    }
                    placeholder="https://your-sync-server.com"
                    className="h-8 w-full border-b border-line bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
                  />
                </div>
              </div>

    </>
  )
}





