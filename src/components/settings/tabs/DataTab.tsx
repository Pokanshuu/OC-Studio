'use client'

import { useSettings } from '@/lib/settings'
import { useImportExport } from '@/components/shared/ImportExportUI'
import { SWITCH_CLASSES, SWITCH_DOT } from '../controls'
export function DataTab() {
  const { settings, updateSetting } = useSettings()
  const { handleExport, handleImportClick, dialog } = useImportExport()

  return (
    <>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleImportClick}
                    className="touch-feedback inline-flex h-8 items-center justify-center px-3 text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]"
                  >
                    导入数据...
                  </button>
                  <button
                    onClick={handleExport}
                    className="touch-feedback inline-flex h-8 items-center justify-center px-3 text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]"
                  >
                    导出所有数据 (JSON)
                  </button>
                  <button
                    disabled
                    className="inline-flex h-8 items-center justify-center px-3 text-[13px] text-ink-faint cursor-not-allowed"
                  >
                    发布为静态网站...
                  </button>
                  <p className="text-xs text-ink-faint mt-1">注：导出不含图片文件，仅包含文本数据</p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-line">
                  <span className="text-sm text-ink">云同步</span>
                  <button
                    role="switch"
                    aria-checked={settings.cloudSyncEnabled}
                    onClick={() =>
                      updateSetting(
                        "cloudSyncEnabled",
                        !settings.cloudSyncEnabled
                      )
                    }
                    className={`${SWITCH_CLASSES.base} ${
                      settings.cloudSyncEnabled
                        ? SWITCH_CLASSES.on
                        : SWITCH_CLASSES.off
                    }`}
                  >
                    <span
                      className={`${SWITCH_DOT} ${
                        settings.cloudSyncEnabled
                          ? "translate-x-[18px] bg-paper"
                          : "translate-x-[2px]"
                      }`}
                    />
                  </button>
                </div>
              </div>

      {dialog}
    </>
  )
}



