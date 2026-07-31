import { defineComponent, h, nextTick, type PropType } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import enUS from '../i18n/locales/en-US'
import type {
  DomainConfigRecord,
  DomainImportCatalog,
  StaticDomainConfig,
} from '../domain/types'

vi.mock('../api/whiteLabelManagement', () => ({
  getDomainImportCatalog: vi.fn(),
}))

import { getDomainImportCatalog } from '../api/whiteLabelManagement'
import DomainConfigDialog from './DomainConfigDialog.vue'

const DialogStub = defineComponent({
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () =>
      h('div', attrs, [slots.default?.(), slots.footer?.()])
  },
})

const AlertStub = defineComponent({
  inheritAttrs: false,
  props: {
    title: { type: String, default: '' },
    description: { type: String, default: '' },
  },
  setup(props, { attrs }) {
    return () => h('div', attrs, `${props.title} ${props.description}`)
  },
})

const FormStub = defineComponent({
  setup(_props, { expose, slots }) {
    expose({
      validate: () => Promise.resolve(true),
      clearValidate: () => undefined,
    })
    return () => h('form', slots.default?.())
  },
})

const FormItemStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('label', slots.default?.())
  },
})

const SelectStub = defineComponent({
  inheritAttrs: false,
  props: {
    modelValue: {
      type: [String, Number] as PropType<string | number>,
      default: '',
    },
    disabled: Boolean,
    loading: Boolean,
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        'select',
        {
          ...attrs,
          value: props.modelValue,
          disabled: props.disabled,
          'data-loading': String(props.loading),
          onChange: (event: Event) =>
            emit(
              'update:modelValue',
              (event.target as HTMLSelectElement).value,
            ),
        },
        slots.default?.(),
      )
  },
})

const OptionStub = defineComponent({
  props: {
    value: { type: [String, Number], required: true },
    label: { type: String, default: '' },
    disabled: Boolean,
  },
  setup(props) {
    return () =>
      h(
        'option',
        { value: props.value, disabled: props.disabled },
        props.label,
      )
  },
})

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean },
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          disabled: props.disabled,
          onClick: () => emit('click'),
        },
        slots.default?.(),
      )
  },
})

const SlotStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('span', slots.default?.())
  },
})

const JsonEditorStub = defineComponent({
  props: { modelValue: { type: String, required: true } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('textarea', {
        'data-testid': 'json-editor',
        value: props.modelValue,
        onInput: (event: Event) =>
          emit(
            'update:modelValue',
            (event.target as HTMLTextAreaElement).value,
          ),
      })
  },
})

const importedConfig: StaticDomainConfig = {
  name: 'xrugc-family',
  description: 'XR UGC agent family',
  is_active: true,
  fallback_domain: null,
  default_config: { theme: 'blue' },
  configs: {},
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function catalog(configKey: string, source: string): DomainImportCatalog {
  const description = `${configKey} description`
  return {
    source,
    items: [
      {
        configKey,
        description,
        isActive: true,
        importable: true,
        materializedFrom: [],
        warnings: [],
        config: {
          ...importedConfig,
          name: configKey,
          description,
        },
      },
    ],
  }
}

function domainRecord(configKey: string): DomainConfigRecord {
  const description = `${configKey} description`
  return {
    domainId: 8,
    configKey,
    description,
    schemaVersion: 1,
    revision: 2,
    enabled: false,
    config: {
      ...importedConfig,
      name: configKey,
      description,
    },
  }
}

function mountDialog(record: DomainConfigRecord | null = null) {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: { 'en-US': enUS },
  })

  return mount(DomainConfigDialog, {
    props: { visible: false, saving: false, record },
    global: {
      plugins: [i18n],
      stubs: {
        'el-dialog': DialogStub,
        'el-alert': AlertStub,
        'el-form': FormStub,
        'el-form-item': FormItemStub,
        'el-select': SelectStub,
        'el-option': OptionStub,
        'el-button': ButtonStub,
        'el-tag': SlotStub,
        JsonObjectEditor: JsonEditorStub,
      },
    },
  })
}

describe('DomainConfigDialog main-frontend JSON import', () => {
  beforeEach(() => {
    vi.mocked(getDomainImportCatalog).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requires confirmation and fully replaces existing JSON', async () => {
    vi.mocked(getDomainImportCatalog).mockResolvedValue({
      source: 'web/public/config/domains/index.json',
      items: [
        {
          configKey: 'xrugc-family',
          description: 'XR UGC agent family',
          isActive: true,
          importable: true,
          materializedFrom: ['base.json', 'xrugc-family.json'],
          warnings: ['fallback was materialized'],
          config: importedConfig,
        },
        {
          configKey: 'broken-family',
          description: 'Broken family',
          isActive: false,
          importable: false,
          materializedFrom: [],
          warnings: [],
          reason: 'Invalid source schema',
        },
      ],
    })
    const confirm = vi
      .spyOn(ElMessageBox, 'confirm')
      .mockResolvedValue(
        { value: '', action: 'confirm' } as unknown as Awaited<
          ReturnType<typeof ElMessageBox.confirm>
        >,
      )
    const success = vi.spyOn(ElMessage, 'success').mockImplementation(() => ({
      close: () => undefined,
    }) as ReturnType<typeof ElMessage.success>)
    const record: DomainConfigRecord = {
      domainId: 8,
      configKey: 'old-family',
      description: 'Old family',
      schemaVersion: 1,
      revision: 2,
      enabled: false,
      config: {
        name: 'old-family',
        description: 'Old family',
        is_active: true,
        fallback_domain: null,
        default_config: { legacy: true },
        configs: {},
      },
    }
    const wrapper = mountDialog(record)

    await wrapper.setProps({ visible: true })
    await flushPromises()

    const options = wrapper.findAll('option')
    expect(options).toHaveLength(2)
    expect(options[1]?.attributes('disabled')).toBeDefined()

    await wrapper
      .get('[data-testid="domain-import-select"]')
      .setValue('xrugc-family')
    await nextTick()
    expect(wrapper.get('[data-testid="domain-import-details"]').text()).toContain(
      'web/public/config/domains/index.json',
    )
    expect(wrapper.get('[data-testid="domain-import-details"]').text()).toContain(
      'base.json',
    )
    expect(wrapper.get('[data-testid="domain-import-details"]').text()).toContain(
      'fallback was materialized',
    )

    await wrapper.get('[data-testid="domain-import-button"]').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalledOnce()
    expect(
      (wrapper.get('[data-testid="json-editor"]').element as HTMLTextAreaElement)
        .value,
    ).toBe(JSON.stringify(importedConfig, null, 2))
    expect(wrapper.get('[data-testid="json-editor"]').text()).not.toContain(
      'legacy',
    )
    expect(success).toHaveBeenCalledOnce()

    wrapper.unmount()
  })

  it('keeps the manual editor usable when catalog loading fails', async () => {
    vi.mocked(getDomainImportCatalog).mockRejectedValue(
      new Error('catalog unavailable'),
    )
    const wrapper = mountDialog()

    await wrapper.setProps({ visible: true })
    await flushPromises()

    expect(wrapper.find('[data-testid="domain-import-error"]').exists()).toBe(
      true,
    )
    const editor = wrapper.get('[data-testid="json-editor"]')
    await editor.setValue('{"manual":true}')
    await nextTick()
    expect((editor.element as HTMLTextAreaElement).value).toBe(
      '{"manual":true}',
    )
    expect(
      wrapper.get('[data-testid="domain-import-button"]').attributes('disabled'),
    ).toBeDefined()

    wrapper.unmount()
  })

  it('invalidates a stale request across a fast close and reopen', async () => {
    const stale = deferred<DomainImportCatalog>()
    const current = deferred<DomainImportCatalog>()
    vi.mocked(getDomainImportCatalog)
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(current.promise)
    const wrapper = mountDialog()

    await wrapper.setProps({ visible: true })
    expect(
      wrapper.get('[data-testid="domain-import-select"]').attributes(
        'data-loading',
      ),
    ).toBe('true')
    await wrapper.setProps({ visible: false })
    expect(
      wrapper.get('[data-testid="domain-import-select"]').attributes(
        'data-loading',
      ),
    ).toBe('false')
    await wrapper.setProps({ visible: true })

    stale.reject(new Error('stale request failed after reopen'))
    await flushPromises()
    expect(wrapper.find('[data-testid="domain-import-error"]').exists()).toBe(
      false,
    )
    expect(
      wrapper.get('[data-testid="domain-import-select"]').attributes(
        'data-loading',
      ),
    ).toBe('true')

    current.resolve(catalog('current-family', 'current-source'))
    await flushPromises()
    await wrapper
      .get('[data-testid="domain-import-select"]')
      .setValue('current-family')
    await nextTick()

    expect(wrapper.find('[data-testid="domain-import-error"]').exists()).toBe(
      false,
    )
    expect(wrapper.findAll('option').map((option) => option.attributes('value')))
      .toEqual(['current-family'])
    expect(wrapper.get('[data-testid="domain-import-details"]').text()).toContain(
      'current-source',
    )
    expect(
      wrapper.get('[data-testid="domain-import-select"]').attributes(
        'data-loading',
      ),
    ).toBe('false')

    wrapper.unmount()
  })

  it('ignores an older catalog response after switching records', async () => {
    const stale = deferred<DomainImportCatalog>()
    const current = deferred<DomainImportCatalog>()
    vi.mocked(getDomainImportCatalog)
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(current.promise)
    const wrapper = mountDialog()

    await wrapper.setProps({ visible: true })
    await wrapper.setProps({ record: domainRecord('edited-family') })

    current.resolve(catalog('edited-family', 'edited-source'))
    await flushPromises()
    await wrapper
      .get('[data-testid="domain-import-select"]')
      .setValue('edited-family')
    await nextTick()

    stale.resolve(catalog('stale-family', 'stale-source'))
    await flushPromises()

    expect(wrapper.findAll('option').map((option) => option.attributes('value')))
      .toEqual(['edited-family'])
    expect(wrapper.get('[data-testid="domain-import-details"]').text()).toContain(
      'edited-source',
    )
    expect(wrapper.get('[data-testid="domain-import-details"]').text()).not.toContain(
      'stale-source',
    )
    expect(
      wrapper.get('[data-testid="domain-import-select"]').attributes(
        'data-loading',
      ),
    ).toBe('false')

    wrapper.unmount()
  })
})
