import { describe, expect, it } from 'vitest'
import {
  BUILTIN_FIELDS,
  DEFAULT_CUSTOM_FIELDS,
  defaultFieldConfig,
  defaultFields,
  missingBuiltinFields,
} from '@/lib/fields/defaults'
import { FIELD_KINDS, isCustomField } from '@/lib/fields/types'

describe('defaultFieldConfig', () => {
  it('四类实体都有配置，且不共享同一批对象', () => {
    const config = defaultFieldConfig()
    for (const kind of FIELD_KINDS) {
      expect(Array.isArray(config[kind])).toBe(true)
    }
    expect(config.country).not.toBe(config.character)
    expect(config.country[0]).not.toBe(BUILTIN_FIELDS.country[0])
  })

  it('国家默认带 6 个自建字段：建立 / 结束 / 政体 / 首都 / 官方语言 / 货币', () => {
    const country = defaultFieldConfig().country
    const ids = country.map((field) => field.id)
    expect(ids).toEqual([
      'f_country_founded',
      'f_country_dissolved',
      'f_country_regime',
      'f_country_capital',
      'f_country_language',
      'f_country_currency',
    ])
    expect(country.find((field) => field.id === 'f_country_founded')?.type).toBe('time')
    expect(country.find((field) => field.id === 'f_country_dissolved')?.type).toBe('time')
    expect(country.find((field) => field.id === 'f_country_regime')?.label).toBe('政体')
  })

  it('政体的落盘键是「政体类型」，避开 system 的读别名「政体」', () => {
    const regime = DEFAULT_CUSTOM_FIELDS.country?.find((field) => field.id === 'f_country_regime')
    expect(regime?.key).toBe('政体类型')
    expect(regime?.key).not.toBe('政体')
  })

  it('每类实体的字段 id 唯一，自建字段的 key 也唯一', () => {
    for (const kind of FIELD_KINDS) {
      const fields = defaultFieldConfig()[kind]
      const ids = fields.map((field) => field.id)
      expect(new Set(ids).size).toBe(ids.length)
      const keys = fields.map((field) => field.key).filter((key): key is string => Boolean(key))
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('自建字段都带 f_ 前缀，内置字段都不带', () => {
    for (const kind of FIELD_KINDS) {
      for (const field of defaultFieldConfig()[kind]) {
        const custom = isCustomField(field)
        expect(custom).toBe(field.id.startsWith('f_'))
        if (!custom) expect(field.key).toBeUndefined()
      }
    }
  })
})

describe('defaultFields', () => {
  it('返回内置字段的副本，改它不影响目录', () => {
    const fields = defaultFields('character')
    fields[0].label = '改过的'
    expect(BUILTIN_FIELDS.character[0].label).not.toBe('改过的')
  })
})

describe('missingBuiltinFields', () => {
  it('只返回配置里还没有的内置字段', () => {
    const current = defaultFields('character').filter((field) => field.id !== 'race')
    const missing = missingBuiltinFields('character', current)
    expect(missing.map((field) => field.id)).toEqual(['race'])
  })

  it('配置包含全部内置字段时返回空', () => {
    expect(missingBuiltinFields('event', defaultFields('event'))).toEqual([])
  })
})
