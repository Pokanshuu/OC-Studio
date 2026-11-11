/**
 * Settings.
 *
 * Split by *what the user is trying to change*, not by data model: "API" is about
 * making a request work, "Agent" is about what the model is allowed to do,
 * "Appearance" is about reading, "Data" is about getting things in and out.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { open, save } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Dialog as HostDialog, DialogContent } from '@/components/ui/dialog'
import { AgentLayer } from '@/plugins/agent/host/plugin-layer'
import { Icon } from '@/plugins/agent/components/ui/Icon'
import {
  Dialog,
  Field,
  FieldRow,
  Menu,
  MenuItem,
  Segmented,
  Slider,
  Switch,
  copyText,
  useToast,
  type MenuAnchor,
} from '@/plugins/agent/components/ui/primitives'
import { useSettingsStore } from '@/plugins/agent/state/settings'
import { useChatStore } from '@/plugins/agent/state/chat'
import { useLang, useT } from '@/plugins/agent/i18n'
import { ALL_TOOLS, toolsFor } from '@/plugins/agent/core/agent/tools'
import { editablePrompt } from '@/plugins/agent/core/agent/prompt'
import { WRITING_SKILLS } from '@/plugins/agent/core/agent/writing'
import { chatCompletionsUrl, modelsUrl, PROVIDERS, knownModels, normalizeModelId, type ProviderKind } from '@/plugins/agent/core/provider'
import { fetchRemoteModels } from '@/plugins/agent/api/chat'
import { cmd } from '@/plugins/agent/api/bridge'
import {
  APP_LICENSE,
  APP_NAME,
  APP_VERSION,
  OPEN_SOURCE,
  REPO_URL,
  UPSTREAM_NAME,
  UPSTREAM_URL,
} from '@/plugins/agent/core/meta'
import type { ConversationMode, Preset, ReasoningLevel } from '@/plugins/agent/core/types'

type Tab = 'api' | 'agent' | 'appearance' | 'data' | 'about'

export function SettingsView({
  open: visible,
  tab,
  onClose,
}: {
  open: boolean
  tab: Tab
  onClose: () => void
}) {
  const t = useT()
  const [active, setActive] = useState<Tab>(tab)

  useEffect(() => {
    if (visible) setActive(tab)
  }, [visible, tab])

  if (!visible) return null

  return (
    <HostDialog
      open={visible}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(80vh,820px)] w-[min(680px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <AgentLayer className="flex min-h-0 flex-1 flex-col">
          <div className="settings-dialog flex min-h-0 flex-1 flex-col">
            <div className="dialog-head">
              <div className="dialog-title">{t('settings.title')}</div>
              <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className="settings-tabs">
              {(['api', 'agent', 'appearance', 'data', 'about'] as Tab[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`settings-tab${active === value ? ' active' : ''}`}
                  onClick={() => setActive(value)}
                >
                  {t(`settings.tab.${value}`)}
                </button>
              ))}
            </div>

            <div className="settings-body">
              {active === 'api' && <ApiTab />}
              {active === 'agent' && <AgentTab />}
              {active === 'appearance' && <AppearanceTab />}
              {active === 'data' && <DataTab />}
              {active === 'about' && <AboutTab />}
            </div>
          </div>
        </AgentLayer>
      </DialogContent>
    </HostDialog>
  )
}

// ── API ─────────────────────────────────────────────────────────────────────

function ApiTab() {
  const t = useT()
  const toast = useToast()
  const settings = useSettingsStore((s) => s.settings)
  const patch = useSettingsStore((s) => s.patch)
  const hasKey = useSettingsStore((s) => s.hasKey)
  const keyHint = useSettingsStore((s) => s.keyHint)
  const refreshKeyHint = useSettingsStore((s) => s.refreshKeyHint)

  const [keyInput, setKeyInput] = useState('')
  const [testing, setTesting] = useState(false)
  const [remoteModels, setRemoteModels] = useState<string[]>([])
  const [modelMenu, setModelMenu] = useState<MenuAnchor | null>(null)
  const modelInputRef = useRef<HTMLInputElement>(null)

  const provider = PROVIDERS[settings.api.provider]
  const modelOptions = useMemo(() => {
    const known = knownModels(settings.api.provider).map((m) => m.id)
    const merged = new Set([
      ...known,
      ...remoteModels.map((id) => normalizeModelId(settings.api.provider, id)),
    ])
    if (settings.api.model) merged.add(normalizeModelId(settings.api.provider, settings.api.model))
    return [...merged]
  }, [settings.api.provider, settings.api.model, remoteModels])

  const changeProvider = (kind: ProviderKind) => {
    const meta = PROVIDERS[kind]
    patch((current) => ({
      ...current,
      api: {
        ...current.api,
        provider: kind,
        baseUrl: meta.defaultBaseUrl,
        model: meta.defaultModel || current.api.model,
      },
    }))
    setRemoteModels([])
  }

  const test = async () => {
    setTesting(true)
    try {
      const ids = await fetchRemoteModels(modelsUrl(settings.api.baseUrl))
      setRemoteModels(ids)
      toast.show(t('settings.testOk', { n: ids.length }))
    } catch (error) {
      toast.show(
        t('settings.testFail', { msg: error instanceof Error ? error.message : String(error) }),
        'error',
      )
    } finally {
      setTesting(false)
    }
  }

  const saveKey = async () => {
    try {
      await cmd.saveApiKey(keyInput)
      await refreshKeyHint()
      setKeyInput('')
      toast.show(t('settings.apiKeySaved'))
    } catch (error) {
      toast.show(String(error), 'error')
    }
  }

  const clearKey = async () => {
    await cmd.clearApiKey()
    await refreshKeyHint()
    setKeyInput('')
  }

  return (
    <>
      <div className="section">
        <div className="section-title">{t('settings.tab.api')}</div>

        <Field label={t('settings.provider')}>
          <Segmented
            value={settings.api.provider}
            options={[
              { value: 'DEEPSEEK', label: PROVIDERS.DEEPSEEK.label },
              { value: 'OPENCODE_GO', label: PROVIDERS.OPENCODE_GO.label },
              { value: 'GEMINI', label: PROVIDERS.GEMINI.label },
              { value: 'CUSTOM', label: PROVIDERS.CUSTOM.label },
            ]}
            onChange={(value) => changeProvider(value as ProviderKind)}
          />
        </Field>

        <Field label={t('settings.baseUrl')} hint={chatCompletionsUrl(settings.api.baseUrl)}>
          <input
            className="input"
            value={settings.api.baseUrl}
            placeholder={provider.hint}
            onChange={(event) =>
              patch((current) => ({ ...current, api: { ...current.api, baseUrl: event.target.value } }))
            }
          />
        </Field>

        <Field label={t('settings.model')}>
          <div className="row">
            <input
              ref={modelInputRef}
              className="input"
              value={settings.api.model}
              onChange={(event) =>
                patch((current) => ({ ...current, api: { ...current.api, model: event.target.value } }))
              }
            />
            {/* 原生 datalist 由 WebView 画，圆角 / 阴影 / 暗色都够不着；用宿主菜单 */}
            <button
              type="button"
              className="icon-btn"
              aria-label={t('settings.modelList')}
              title={t('settings.modelList')}
              onClick={(event) => {
                const rect =
                  modelInputRef.current?.getBoundingClientRect() ??
                  event.currentTarget.getBoundingClientRect()
                setModelMenu({ x: rect.left, y: rect.bottom + 4 })
              }}
            >
              <Icon name="chevron-down" size={14} />
            </button>
            <button className="btn quiet" onClick={() => void test()} disabled={testing || !settings.api.baseUrl}>
              {testing ? t('settings.testing') : t('settings.test')}
            </button>
          </div>
          <Menu anchor={modelMenu} onClose={() => setModelMenu(null)}>
            {modelOptions.length === 0 ? (
              <MenuItem onClick={() => setModelMenu(null)} disabled>
                {t('settings.modelListEmpty')}
              </MenuItem>
            ) : (
              modelOptions.map((id) => (
                <MenuItem
                  key={id}
                  onClick={() => {
                    patch((current) => ({ ...current, api: { ...current.api, model: id } }))
                    setModelMenu(null)
                  }}
                >
                  {id}
                </MenuItem>
              ))
            )}
          </Menu>
        </Field>

        <Field
          label={t('settings.apiKey')}
          hint={hasKey ? `${t('settings.apiKeySaved')} · ${keyHint}` : t('settings.apiKeyPlaceholder')}
        >
          <div className="row">
            <input
              className="input"
              type="password"
              value={keyInput}
              placeholder={hasKey ? keyHint : 'sk-…'}
              onChange={(event) => setKeyInput(event.target.value)}
            />
            <button className="btn primary" onClick={() => void saveKey()} disabled={!keyInput.trim()}>
              {t('settings.saveKey')}
            </button>
            {hasKey && (
              <button className="btn danger" onClick={() => void clearKey()}>
                {t('settings.clearKey')}
              </button>
            )}
          </div>
        </Field>
      </div>

      <div className="section">
        <div className="section-title">{t('settings.thinking')}</div>
        <Field label={t('settings.thinking')} >
          <Segmented
            value={settings.api.thinking}
            options={[
              { value: 'off', label: t('composer.reasoningOff') },
              { value: 'high', label: t('composer.reasoningHigh') },
              { value: 'max', label: t('composer.reasoningMax') },
            ]}
            onChange={(value) =>
              patch((current) => ({
                ...current,
                api: { ...current.api, thinking: value as ReasoningLevel },
              }))
            }
          />
        </Field>

        <FieldRow label={t('settings.temperature')} >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 200 }}>
            <Slider
              value={settings.api.temperature}
              min={0}
              max={2}
              step={0.1}
              onChange={(value) =>
                patch((current) => ({ ...current, api: { ...current.api, temperature: value } }))
              }
            />
            <span className="mono" style={{ width: 32, textAlign: 'right' }}>
              {settings.api.temperature.toFixed(1)}
            </span>
          </div>
        </FieldRow>

        <FieldRow label={t('settings.topP')} >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 200 }}>
            <Slider
              value={settings.api.topP}
              min={0.5}
              max={1}
              step={0.01}
              onChange={(value) =>
                patch((current) => ({ ...current, api: { ...current.api, topP: value } }))
              }
            />
            <span className="mono" style={{ width: 32, textAlign: 'right' }}>
              {settings.api.topP.toFixed(2)}
            </span>
          </div>
        </FieldRow>

        <Field label={t('settings.maxTokens')}>
          <input
            className="input"
            inputMode="numeric"
            value={settings.api.maxTokens ?? ''}
            onChange={(event) => {
              const raw = event.target.value.trim()
              const parsed = raw ? Number.parseInt(raw, 10) : null
              patch((current) => ({
                ...current,
                api: {
                  ...current.api,
                  maxTokens: parsed && Number.isFinite(parsed) ? parsed : null,
                },
              }))
            }}
          />
        </Field>
      </div>

      <PromptsSection />
    </>
  )
}

// ── prompts + presets ───────────────────────────────────────────────────────

function PromptsSection() {
  const t = useT()
  const lang = useLang()
  const settings = useSettingsStore((s) => s.settings)
  const patch = useSettingsStore((s) => s.patch)
  const presets = useSettingsStore((s) => s.presets)
  const savePreset = useSettingsStore((s) => s.savePreset)
  const deletePreset = useSettingsStore((s) => s.deletePreset)

  const [mode, setMode] = useState<ConversationMode>('CREATIVE')
  const [editing, setEditing] = useState<Preset | 'new' | null>(null)

  // 与发送时完全同一套上下文，所以这里看到的就是实际会发出去的那份提示词
  const ctx = useMemo(
    () => ({
      language: lang,
      workspacePath: settings.agent.workspace,
      workspaceName: settings.agent.workspace
        ? (settings.agent.workspace.split(/[\\/]/).filter(Boolean).pop() ?? null)
        : null,
      toolNames: toolsFor(settings.agent.enabledTools).map((tool) => tool.name),
      platform: navigator.userAgent.includes('Windows') ? 'Windows' : navigator.platform,
      date: new Date().toISOString().slice(0, 10),
    }),
    [lang, settings.agent.workspace, settings.agent.enabledTools],
  )

  const builtin = useMemo(() => editablePrompt(mode, ctx), [mode, ctx])
  const override = settings.systemPrompts?.[mode] ?? ''
  const value = override.length > 0 ? override : builtin
  const edited = override.trim().length > 0

  return (
    <div className="section">
      <div className="section-title">{t('settings.systemPrompt')}</div>

      <Segmented
        value={mode}
        options={[
          { value: 'CREATIVE', label: t('mode.CREATIVE') },
          { value: 'ROLEPLAY', label: t('mode.ROLEPLAY') },
          { value: 'AGENT', label: t('mode.AGENT') },
        ]}
        onChange={(next) => setMode(next as ConversationMode)}
      />

      <textarea
        className="textarea"
        rows={12}
        spellCheck={false}
        value={value}
        onChange={(event) =>
          patch((current) => ({
            ...current,
            systemPrompts: { ...current.systemPrompts, [mode]: event.target.value },
          }))
        }
        style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.6 }}
      />


      <div className="field-hint">
        {edited ? t('settings.promptEdited') : t('settings.promptDefault')}
        <br />
        {t('settings.promptOrder')}
      </div>

      {edited && (
        <button
          className="btn sm quiet"
          style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
          onClick={() =>
            patch((current) => ({
              ...current,
              systemPrompts: { ...current.systemPrompts, [mode]: '' },
            }))
          }
        >
          {t('settings.promptReset')}
        </button>
      )}

      {mode !== 'AGENT' && (
        <>
          <div className="section-title" style={{ marginTop: 8 }}>
            {t('settings.writingSkills')}
          </div>
          {WRITING_SKILLS.filter((skill) => mode === 'CREATIVE' || skill.id !== 'continuity').map(
            (skill) => {
              const enabled = settings.writingSkills.includes(skill.id)
              return (
                <FieldRow
                  key={skill.id}
                  label={lang === 'zh' ? skill.label.zh : skill.label.en}
                  hint={lang === 'zh' ? skill.hint.zh : skill.hint.en}
                >
                  <Switch
                    checked={enabled}
                    onChange={(next) =>
                      patch((current) => ({
                        ...current,
                        writingSkills: next
                          ? [...current.writingSkills, skill.id]
                          : current.writingSkills.filter((id) => id !== skill.id),
                      }))
                    }
                  />
                </FieldRow>
              )
            },
          )}
        </>
      )}

      <div className="section-title" style={{ marginTop: 8 }}>
        {t('settings.presets')}
      </div>

      {presets.map((preset) => {
        const enabled = settings.enabledPresets.includes(preset.id)
        return (
          <div className="field-row" key={preset.id}>
            <div style={{ minWidth: 0 }}>
              <div className="label">{preset.name}</div>
              <div className="hint truncate">{preset.content.slice(0, 90)}</div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm quiet" onClick={() => setEditing(preset)}>
                {t('common.edit')}
              </button>
              <button className="btn sm quiet" onClick={() => void deletePreset(preset.id)}>
                {t('common.delete')}
              </button>
              <Switch
                checked={enabled}
                onChange={(next) =>
                  patch((current) => ({
                    ...current,
                    enabledPresets: next
                      ? [...current.enabledPresets, preset.id]
                      : current.enabledPresets.filter((id) => id !== preset.id),
                  }))
                }
              />
            </div>
          </div>
        )
      })}

      <button className="btn quiet" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing('new')}>
        <Icon name="plus" size={14} />
        {t('settings.presetNew')}
      </button>

      {editing && (
        <PresetEditor
          preset={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (name, content) => {
            await savePreset(editing === 'new' ? null : editing.id, name, content)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
function PresetEditor({
  preset,
  onClose,
  onSave,
}: {
  preset: Preset | null
  onClose: () => void
  onSave: (name: string, content: string) => Promise<void>
}) {
  const t = useT()
  const [name, setName] = useState(preset?.name ?? '')
  const [content, setContent] = useState(preset?.content ?? '')

  return (
    <Dialog
      open
      onClose={onClose}
      title={preset ? t('common.edit') : t('settings.presetNew')}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn primary"
            disabled={!name.trim() || !content.trim()}
            onClick={() => void onSave(name.trim(), content.trim())}
          >
            {t('common.save')}
          </button>
        </>
      }
    >
      <Field label={t('settings.presetName')}>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </Field>
      <Field label={t('settings.presetContent')}>
        <textarea
          className="textarea"
          rows={10}
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
      </Field>
    </Dialog>
  )
}

// ── agent ───────────────────────────────────────────────────────────────────

function AgentTab() {
  const t = useT()
  const settings = useSettingsStore((s) => s.settings)
  const patch = useSettingsStore((s) => s.patch)

  const toggleTool = (name: string) => {
    patch((current) => {
      const enabled = current.agent.enabledTools.includes(name)
      return {
        ...current,
        agent: {
          ...current.agent,
          enabledTools: enabled
            ? current.agent.enabledTools.filter((tool) => tool !== name)
            : [...current.agent.enabledTools, name],
        },
      }
    })
  }


  return (
    <>
      <div className="section">
        <div className="section-title">{t('settings.tab.agent')}</div>

        <FieldRow label={t('settings.maxSteps')} hint={t('settings.maxStepsHint')}>
          <input
            className="input"
            style={{ width: 84, textAlign: 'right' }}
            inputMode="numeric"
            value={settings.agent.maxSteps > 0 ? settings.agent.maxSteps : ''}
            placeholder="∞"
            onChange={(event) => {
              const raw = event.target.value.trim()
              const parsed = raw === '' ? 0 : Number.parseInt(raw, 10)
              patch((current) => ({
                ...current,
                agent: {
                  ...current.agent,
                  maxSteps: Number.isFinite(parsed) ? Math.max(0, parsed) : current.agent.maxSteps,
                },
              }))
            }}
          />
        </FieldRow>

        <Field label={t('settings.approval')} >
          <Segmented
            value={settings.agent.approval}
            options={[
              { value: 'ask', label: t('settings.approvalAsk') },
              { value: 'auto', label: t('settings.approvalAuto') },
              { value: 'never', label: t('settings.approvalNever') },
            ]}
            onChange={(value) =>
              patch((current) => ({
                ...current,
                agent: { ...current.agent, approval: value as 'ask' | 'auto' | 'never' },
              }))
            }
          />
        </Field>

        <FieldRow
          label={t('settings.autoTitle')}
          
        >
          <Switch
            checked={settings.autoTitle}
            onChange={(next) => patch((current) => ({ ...current, autoTitle: next }))}
          />
        </FieldRow>

        <FieldRow label={t('settings.compactKeep')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 200 }}>
            <Slider
              value={settings.compactKeepRecent}
              min={2}
              max={20}
              step={1}
              onChange={(value) => patch((current) => ({ ...current, compactKeepRecent: value }))}
            />
            <span className="mono" style={{ width: 24, textAlign: 'right' }}>
              {settings.compactKeepRecent}
            </span>
          </div>
        </FieldRow>
      </div>

      <div className="section">
        <div className="section-title">{t('settings.tools')}</div>

        {ALL_TOOLS.map((tool) => {
          const enabled = settings.agent.enabledTools.includes(tool.name)
          return (
            <FieldRow
              key={tool.name}
              label={tool.name}
              hint={tool.description.split('. ')[0]}
            >
              <div className="row" style={{ gap: 8 }}>
                {tool.requiresApproval && (
                  <span className="faint" style={{ fontSize: 10.5 }}>
                    {t('agent.toolPending')}
                  </span>
                )}
                <Switch checked={enabled} onChange={() => toggleTool(tool.name)} />
              </div>
            </FieldRow>
          )
        })}
      </div>


    </>
  )
}

// ── appearance ──────────────────────────────────────────────────────────────

function AppearanceTab() {
  const t = useT()
  const settings = useSettingsStore((s) => s.settings)
  const patch = useSettingsStore((s) => s.patch)
  const reset = useSettingsStore((s) => s.reset)

  return (
    <div className="section">
      <div className="section-title">{t('settings.tab.appearance')}</div>

      <FieldRow label={t('settings.theme')}>
        <Segmented
          value={settings.ui.theme}
          options={[
            { value: 'system', label: t('settings.themeSystem') },
            { value: 'light', label: t('settings.themeLight') },
            { value: 'dark', label: t('settings.themeDark') },
          ]}
          onChange={(value) =>
            patch((current) => ({
              ...current,
              ui: { ...current.ui, theme: value as 'system' | 'light' | 'dark' },
            }))
          }
        />
      </FieldRow>

      <FieldRow label={t('settings.fontScale')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 220 }}>
          <Slider
            value={settings.ui.fontScale}
            min={0.85}
            max={1.35}
            step={0.05}
            onChange={(value) =>
              patch((current) => ({ ...current, ui: { ...current.ui, fontScale: value } }))
            }
          />
          <span className="mono" style={{ width: 40, textAlign: 'right' }}>
            {Math.round(settings.ui.fontScale * 100)}%
          </span>
        </div>
      </FieldRow>

      <FieldRow label={t('settings.language')}>
        <Segmented
          value={settings.ui.language}
          options={[
            { value: 'auto', label: t('settings.languageAuto') },
            { value: 'zh', label: '简体中文' },
            { value: 'en', label: 'English' },
          ]}
          onChange={(value) =>
            patch((current) => ({
              ...current,
              ui: { ...current.ui, language: value as 'auto' | 'zh' | 'en' },
            }))
          }
        />
      </FieldRow>

      <FieldRow label={t('settings.density')}>
        <Segmented
          value={settings.ui.density}
          options={[
            { value: 'comfortable', label: t('settings.densityComfortable') },
            { value: 'compact', label: t('settings.densityCompact') },
          ]}
          onChange={(value) =>
            patch((current) => ({
              ...current,
              ui: { ...current.ui, density: value as 'compact' | 'comfortable' },
            }))
          }
        />
      </FieldRow>

      <FieldRow label={t('settings.sendKey')}>
        <Segmented
          value={settings.ui.sendKey}
          options={[
            { value: 'enter', label: t('settings.sendKeyEnter') },
            { value: 'ctrlEnter', label: t('settings.sendKeyCtrlEnter') },
          ]}
          onChange={(value) =>
            patch((current) => ({
              ...current,
              ui: { ...current.ui, sendKey: value as 'enter' | 'ctrlEnter' },
            }))
          }
        />
      </FieldRow>

      <FieldRow label={t('settings.autoCollapseThinking')}>
        <Switch
          checked={settings.ui.autoCollapseThinking}
          onChange={(next) =>
            patch((current) => ({ ...current, ui: { ...current.ui, autoCollapseThinking: next } }))
          }
        />
      </FieldRow>

      <FieldRow label={t('settings.showTokenRing')}>
        <Switch
          checked={settings.ui.showTokenRing}
          onChange={(next) =>
            patch((current) => ({ ...current, ui: { ...current.ui, showTokenRing: next } }))
          }
        />
      </FieldRow>

      <button className="btn danger" onClick={reset}>
        {t('settings.resetAll')}
      </button>
    </div>
  )
}

// ── data ────────────────────────────────────────────────────────────────────

function DataTab() {
  const t = useT()
  const toast = useToast()
  const settings = useSettingsStore((s) => s.settings)
  const reloadConversations = useChatStore((s) => s.reloadConversations)
  const [info, setInfo] = useState<{ dataDir: string; dbPath: string } | null>(null)

  useEffect(() => {
    void cmd
      .appInfo()
      .then((value) => setInfo({ dataDir: value.dataDir, dbPath: value.dbPath }))
      .catch(() => setInfo(null))
  }, [])

  const exportBackup = async () => {
    const path = await save({
      defaultPath: `simple-agent-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (!path) return
    try {
      const bytes = await cmd.exportBackup(path)
      toast.show(t('settings.exportOk', { n: Math.round(bytes / 1024) }))
    } catch (error) {
      toast.show(String(error), 'error')
    }
  }

  const importBackup = async () => {
    const path = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (!path || Array.isArray(path)) return
    try {
      const summary = await cmd.importBackup(path)
      await reloadConversations()
      const added = summary.conversations + summary.messages
      // 同 id 跳过是正常语义（重复导入自己的备份），不能报成「文件是空的」
      if (added > 0) {
        toast.show(t('settings.importOk', { c: summary.conversations, m: summary.messages }))
      } else if (summary.skipped > 0) {
        toast.show(t('settings.importSkipped', { n: summary.skipped }), 'info')
      } else {
        toast.show(t('settings.importEmpty'), 'error')
      }
    } catch (error) {
      toast.show(String(error), 'error')
    }
  }

  const importChatbox = async () => {
    const path = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (!path || Array.isArray(path)) return
    try {
      const summary = await cmd.importChatbox(path, settings.api.provider, settings.api.model)
      await reloadConversations()
      toast.show(t('settings.importOk', { c: summary.conversations, m: summary.messages }))
    } catch (error) {
      toast.show(String(error), 'error')
    }
  }

  return (
    <div className="section">
      <div className="section-title">{t('settings.tab.data')}</div>

      <FieldRow label={t('settings.export')} hint={t('settings.exportHint')}>
        <button className="btn quiet" onClick={() => void exportBackup()}>
          <Icon name="download" size={14} />
          {t('settings.export')}
        </button>
      </FieldRow>

      <FieldRow label={t('settings.import')} hint={t('settings.importHint')}>
        <button className="btn quiet" onClick={() => void importBackup()}>
          <Icon name="upload" size={14} />
          {t('settings.import')}
        </button>
      </FieldRow>

      <FieldRow label={t('settings.importChatbox')}>
        <button className="btn quiet" onClick={() => void importChatbox()}>
          <Icon name="upload" size={14} />
          Chatbox
        </button>
      </FieldRow>

      {info && (
        <Field label={t('settings.dataDir')}>
          <div className="row">
            <input className="input mono" readOnly value={info.dataDir} style={{ fontSize: 11.5 }} />
            <button
              className="btn quiet"
              onClick={async () => {
                await copyText(info.dataDir)
                toast.show(t('msg.copied'))
              }}
            >
              <Icon name="copy" size={14} />
            </button>
          </div>
          <div className="field-hint mono" style={{ fontSize: 11 }}>
            {info.dbPath}
          </div>
        </Field>
      )}
    </div>
  )
}

// ── about ───────────────────────────────────────────────────────────────────

function AboutTab() {
  const t = useT()
  const toast = useToast()
  const [info, setInfo] = useState<{ version: string; dataDir: string } | null>(null)

  useEffect(() => {
    void cmd
      .appInfo()
      .then((value) => setInfo({ version: value.version, dataDir: value.dataDir }))
      .catch(() => setInfo(null))
  }, [])

  const openLink = (url: string) => {
    void openUrl(url).catch(() => toast.show(url, 'error'))
  }

  return (
    <>
      <div className="section">
        <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <div className="empty-mark" style={{ marginBottom: 0 }}>
            <Icon name="zap" size={16} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>
              {APP_NAME}
            </div>
            <div className="faint" style={{ fontSize: 12 }}>
              {info?.version ?? APP_VERSION} · {APP_LICENSE}
            </div>
          </div>
        </div>

        <div className="muted" style={{ fontSize: 13, lineHeight: 1.7, marginTop: 8 }}>
          本项目基于 <LinkText onClick={() => openLink(UPSTREAM_URL)}>{UPSTREAM_NAME}</LinkText> 开发：
          保留消息树、流式 Markdown 渲染与上下文压缩，添加了工具调用、工作区沙箱与审批等agent功能。
        </div>

        <div className="field-row" style={{ marginTop: 4 }}>
          <div className="label">{t('about.repo')}</div>
          <button type="button" className="btn sm quiet mono" onClick={() => openLink(REPO_URL)}>
            {REPO_URL.replace('https://', '')}
          </button>
        </div>
        <div className="field-row">
          <div className="label">{t('about.upstream')}</div>
          <button type="button" className="btn sm quiet mono" onClick={() => openLink(UPSTREAM_URL)}>
            {UPSTREAM_URL.replace('https://', '')}
          </button>
        </div>
      </div>

      <div className="section">
        <div className="section-title">{t('about.licenses')}</div>

        {OPEN_SOURCE.map((entry) => (
          <div className="field-row" key={entry.name} style={{ padding: '6px 0' }}>
            <div style={{ minWidth: 0 }}>
              <button
                type="button"
                className="label"
                style={{ textAlign: 'left', textDecoration: 'underline', textUnderlineOffset: 2 }}
                onClick={() => openLink(entry.url)}
              >
                {entry.name}
              </button>
              <span className="hint" style={{ marginLeft: 8 }}>
                {entry.role}
              </span>
            </div>
            <span className="faint mono" style={{ fontSize: 11 }}>
              {entry.license}
            </span>
          </div>
        ))}
      </div>

      <div className="section">
        <div className="section-title">{t('about.data')}</div>
        <div className="faint mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>
          {info?.dataDir ?? ''}
        </div>
      </div>
    </>
  )
}

function LinkText({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      style={{
        color: 'var(--oc-ink)',
        textDecoration: 'underline',
        textUnderlineOffset: 2,
        textDecorationColor: 'var(--oc-line-hover)',
        font: 'inherit',
      }}
      onClick={onClick}
    >
      {children}
    </button>
  )
}