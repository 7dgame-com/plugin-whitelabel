import { defineComponent, h, nextTick, type PropType } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import enUS from '../i18n/locales/en-US'
import type {
  DomainConfigRecord,
  DomainImportCatalog,
  JsonObject,
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
  emits: ['update:modelValue', 'change'],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        'select',
        {
          ...attrs,
          value: props.modelValue,
          disabled: props.disabled,
          'data-loading': String(props.loading),
          onChange: (event: Event) => {
            const value = (event.target as HTMLSelectElement).value
            emit('update:modelValue', value)
            emit('change', value)
          },
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
  props: {
    modelValue: { type: String, required: true },
    readOnly: Boolean,
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('textarea', {
        'data-testid': 'json-editor',
        value: props.modelValue,
        readonly: props.readOnly,
        onInput: (event: Event) =>
          emit(
            'update:modelValue',
            (event.target as HTMLTextAreaElement).value,
          ),
      })
  },
})

const independentConfig: JsonObject = {
  name: '主站',
  theme: { primaryColor: '#409eff' },
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
        selectable: true,
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
      ...independentConfig,
    },
  }
}

function mountDialog(
  record: DomainConfigRecord | null = null,
  readOnly = false,
) {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: { 'en-US': enUS },
  })

  return mount(DomainConfigDialog, {
    props: { visible: false, saving: false, record, readOnly },
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

describe('DomainConfigDialog read-only key selection', () => {
  beforeEach(() => {
    vi.mocked(getDomainImportCatalog).mockReset()
  })

  it('selects identity without copying source JSON, then saves manually entered content', async () => {
    vi.mocked(getDomainImportCatalog).mockResolvedValue({
      source: 'web/public/config/domains/index.json',
      items: [
        {
          configKey: 'xrugc-family',
          description: 'XR UGC agent family',
          isActive: true,
          selectable: true,
        },
        {
          configKey: 'broken-family',
          description: 'Broken family',
          isActive: false,
          selectable: false,
          reason: 'Invalid source schema',
        },
      ],
    })
    const wrapper = mountDialog()

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
    expect(
      (wrapper.get('[data-testid="json-editor"]').element as HTMLTextAreaElement)
        .value,
    ).toBe('{}')
    expect(wrapper.find('[data-testid="domain-import-button"]').exists()).toBe(
      false,
    )

    await wrapper.get('[data-testid="json-editor"]').setValue(
      JSON.stringify(independentConfig),
    )
    const saveButton = wrapper.findAll('button').at(-1)
    expect(saveButton?.attributes('disabled')).toBeUndefined()
    await saveButton?.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('submit')?.[0]).toEqual([
      { configKey: 'xrugc-family', config: independentConfig },
    ])

    wrapper.unmount()
  })

  it('blocks creation when the catalog cannot provide the identity key', async () => {
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
    expect(editor.attributes('readonly')).toBe('')
    expect(wrapper.find('[data-testid="domain-import-button"]').exists()).toBe(
      false,
    )
    expect(wrapper.findAll('button').at(-1)?.attributes('disabled')).toBe('')

    wrapper.unmount()
  })

  it('shows the complete JSON without loading import data in read-only mode', async () => {
    const wrapper = mountDialog(domainRecord('readonly.example.com'), true)

    await wrapper.setProps({ visible: true })
    await flushPromises()

    expect(getDomainImportCatalog).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="domain-import-select"]').exists()).toBe(
      false,
    )
    expect(wrapper.get('.domain-key-summary').text()).toContain(
      'readonly.example.com',
    )
    const editorValue = (
      wrapper.get('[data-testid="json-editor"]').element as HTMLTextAreaElement
    ).value
    expect(editorValue).toContain('主站')
    expect(editorValue).toContain('"name"')
    expect(wrapper.get('[data-testid="json-editor"]').attributes('readonly')).toBe(
      '',
    )
    expect(wrapper.text()).toContain('read-only')

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

  it('keeps an existing external key immutable without loading the catalog', async () => {
    const wrapper = mountDialog(domainRecord('edited-family'))

    await wrapper.setProps({ visible: true })
    await flushPromises()

    expect(getDomainImportCatalog).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="domain-import-select"]').exists()).toBe(
      false,
    )
    expect(wrapper.get('.domain-key-summary').text()).toContain('edited-family')

    const editor = wrapper.get('[data-testid="json-editor"]')
    const editedConfig: JsonObject = {
      ...independentConfig,
      name: '编辑后的品牌',
    }
    await editor.setValue(JSON.stringify(editedConfig))
    await wrapper.findAll('button').at(-1)?.trigger('click')
    await flushPromises()

    expect(wrapper.emitted('submit')?.[0]).toEqual([
      { configKey: 'edited-family', config: editedConfig },
    ])

    wrapper.unmount()
  })
})
