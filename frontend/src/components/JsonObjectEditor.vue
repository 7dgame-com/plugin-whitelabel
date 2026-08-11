<template>
  <div
    class="json-object-editor"
    :class="{ 'is-invalid': !validation.valid }"
  >
    <div class="json-editor-toolbar">
      <span class="json-schema-label">{{ schemaLabel }}</span>
      <div v-if="!readOnly" class="json-editor-actions">
        <el-button
          size="small"
          text
          :disabled="!canReformat"
          @click="reformat(false)"
        >
          {{ t('common.jsonFormat') }}
        </el-button>
        <el-button
          size="small"
          text
          :disabled="!canReformat"
          @click="reformat(true)"
        >
          {{ t('common.jsonCompact') }}
        </el-button>
      </div>
    </div>

    <div ref="editorElement" class="json-codemirror" />

    <div
      :id="statusId"
      class="json-editor-status"
      aria-live="polite"
    >
      <span
        class="status-dot"
        :class="validation.valid ? 'valid' : 'invalid'"
        aria-hidden="true"
      />
      <span :class="validation.valid ? 'valid-text' : 'invalid-text'">
        {{ validationMessage }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from 'vue'
import { basicSetup, EditorView } from 'codemirror'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import {
  forceLinting,
  linter,
  type Diagnostic,
} from '@codemirror/lint'
import { useI18n } from 'vue-i18n'
import {
  formatJsonObjectText,
  type JsonValidationIssue,
  validateJsonObjectText,
} from '../domain/jsonObject'

const props = defineProps<{
  modelValue: string
  readOnly?: boolean
  ariaLabel?: string
  configKey?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'validity-change': [valid: boolean]
}>()

const { t } = useI18n()
const editorElement = ref<HTMLElement>()
const statusId = `json-editor-status-${useId()}`
let editorView: EditorView | null = null
let syncingFromProps = false

const validation = computed(() =>
  validateJsonObjectText(props.modelValue, props.configKey),
)

const canReformat = computed(
  () =>
    formatJsonObjectText(props.modelValue, false) !== null,
)

const schemaLabel = computed(() => t('common.jsonDomainSchema'))

const editorAriaLabel = computed(
  () => props.ariaLabel ?? String(schemaLabel.value),
)

const validationMessage = computed(() => {
  if (validation.value.valid) return t('common.jsonValid')

  const issue = validation.value.issues[0]
  if (!issue) return t('common.jsonInvalid')
  if (issue.code === 'syntax') return t('common.jsonSyntaxInvalid')
  if (issue.code === 'object-required') {
    return t('common.jsonObjectRequired')
  }
  if (issue.code === 'security') {
    return t('common.jsonSecurityInvalid', { detail: issue.message })
  }
  return t('common.jsonSchemaInvalid', { detail: issue.message })
})

type HighlightStyleModuleProvider = {
  value?: { rules?: readonly string[] }
}

/**
 * `codemirror` already bundles the default HighlightStyle but does not
 * re-export HighlightStyle itself. Resolve its generated selectors from the
 * bundled extension and override them with semantic CSS variables. This keeps
 * a real light/dark token palette without adding duplicate CM packages.
 */
function syntaxHighlightTheme() {
  const selectorsByColor = new Map<string, string>()

  function collect(extension: unknown): void {
    if (Array.isArray(extension)) {
      extension.forEach(collect)
      return
    }
    if (!extension || typeof extension !== 'object') return

    const rules = (extension as HighlightStyleModuleProvider).value?.rules
    if (!Array.isArray(rules)) return
    for (const rule of rules) {
      const match = /^(\.[^\s{]+)\s*\{\s*color:\s*(#[0-9a-f]+);/i.exec(
        rule,
      )
      if (match?.[1] && match[2]) {
        selectorsByColor.set(match[2].toLowerCase(), match[1])
      }
    }
  }

  collect(basicSetup)
  const palette: Record<string, string> = {
    '#404740': '--json-syntax-meta',
    '#708': '--json-syntax-keyword',
    '#219': '--json-syntax-atom',
    '#164': '--json-syntax-number',
    '#a11': '--json-syntax-string',
    '#e40': '--json-syntax-escape',
    '#00f': '--json-syntax-definition',
    '#30a': '--json-syntax-variable',
    '#085': '--json-syntax-type',
    '#167': '--json-syntax-class',
    '#256': '--json-syntax-special',
    '#00c': '--json-syntax-property',
    '#940': '--json-syntax-comment',
    '#f00': '--json-syntax-invalid',
  }
  const overrides: Record<string, { color: string }> = {}
  for (const [color, variable] of Object.entries(palette)) {
    const selector = selectorsByColor.get(color)
    if (selector) overrides[selector] = { color: `var(${variable})` }
  }
  return EditorView.theme(overrides)
}

function issueRange(
  text: string,
  issue: JsonValidationIssue,
): Pick<Diagnostic, 'from' | 'to'> {
  const property = issue.path.split('/').filter(Boolean)[0]
  if (property) {
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = new RegExp(`"${escaped}"\\s*:`).exec(text)
    if (match?.index !== undefined) {
      return {
        from: match.index,
        to: Math.min(text.length, match.index + match[0].length),
      }
    }
  }

  return { from: 0, to: Math.min(text.length, 1) }
}

const parseLint = jsonParseLinter()

function jsonLint(view: EditorView): Diagnostic[] {
  const syntaxDiagnostics = parseLint(view)
  if (syntaxDiagnostics.length > 0) return syntaxDiagnostics

  const text = view.state.doc.toString()
  const result = validateJsonObjectText(text, props.configKey)
  if (result.valid) return []

  return result.issues.map((issue) => ({
    ...issueRange(text, issue),
    severity: 'error',
    source: 'JSON Schema',
    message: issue.message,
  }))
}

function replaceDocument(value: string): void {
  if (!editorView) {
    emit('update:modelValue', value)
    return
  }

  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: value,
    },
  })
  editorView.focus()
  forceLinting(editorView)
}

function reformat(compact: boolean): void {
  const formatted = formatJsonObjectText(props.modelValue, compact)
  if (formatted !== null) replaceDocument(formatted)
}

onMounted(() => {
  if (!editorElement.value) return

  editorView = new EditorView({
    parent: editorElement.value,
    doc: props.modelValue,
    extensions: [
      basicSetup,
      json(),
      EditorView.lineWrapping,
      EditorView.editable.of(!props.readOnly),
      EditorView.contentAttributes.of({
        'aria-label': editorAriaLabel.value,
        'aria-describedby': statusId,
        'aria-invalid': String(!validation.value.valid),
        'aria-readonly': String(Boolean(props.readOnly)),
        autocapitalize: 'off',
        autocomplete: 'off',
        spellcheck: 'false',
      }),
      EditorView.theme({
        '&': {
          minHeight: '320px',
          color: 'var(--text-primary)',
          backgroundColor: 'var(--bg-card)',
          fontSize: '13px',
        },
        '&.cm-focused': { outline: 'none' },
        '.cm-scroller': {
          minHeight: '320px',
          maxHeight: '52vh',
          fontFamily:
            "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
          lineHeight: '1.55',
        },
        '.cm-content': { caretColor: 'var(--primary-color)' },
        '.cm-cursor, .cm-dropCursor': {
          borderLeftColor: 'var(--primary-color)',
        },
        '.cm-gutters': {
          color: 'var(--text-muted)',
          backgroundColor: 'var(--bg-hover)',
          borderRightColor: 'var(--border-color)',
        },
        '.cm-activeLine, .cm-activeLineGutter': {
          backgroundColor: 'var(--primary-light)',
        },
        '.cm-selectionBackground, ::selection': {
          backgroundColor: 'rgb(0 186 255 / 24%) !important',
        },
        '.cm-tooltip': {
          color: 'var(--text-primary)',
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-color)',
        },
        '.cm-panels': {
          color: 'var(--text-primary)',
          backgroundColor: 'var(--bg-hover)',
        },
      }),
      syntaxHighlightTheme(),
      linter(jsonLint, { delay: 250 }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || syncingFromProps) return
        emit('update:modelValue', update.state.doc.toString())
      }),
    ],
  })
  forceLinting(editorView)
})

watch(
  () => props.modelValue,
  (value) => {
    if (!editorView || editorView.state.doc.toString() === value) return
    syncingFromProps = true
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: value,
      },
    })
    syncingFromProps = false
    forceLinting(editorView)
  },
)

watch(
  editorAriaLabel,
  (label) => editorView?.contentDOM.setAttribute('aria-label', label),
)

watch(
  () => validation.value.valid,
  (valid) => {
    editorView?.contentDOM.setAttribute('aria-invalid', String(!valid))
    emit('validity-change', valid)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  editorView?.destroy()
  editorView = null
})
</script>

<style scoped>
.json-object-editor {
  --json-syntax-meta: #57606a;
  --json-syntax-keyword: #cf222e;
  --json-syntax-atom: #8250df;
  --json-syntax-number: #953800;
  --json-syntax-string: #0a7f42;
  --json-syntax-escape: #bc4c00;
  --json-syntax-definition: #0969da;
  --json-syntax-variable: #6639ba;
  --json-syntax-type: #116329;
  --json-syntax-class: #1a7f37;
  --json-syntax-special: #0550ae;
  --json-syntax-property: #0550ae;
  --json-syntax-comment: #6e7781;
  --json-syntax-invalid: #cf222e;

  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  transition: border-color 0.2s ease;
}

:global([data-theme='dark'] .json-object-editor) {
  --json-syntax-meta: #8b949e;
  --json-syntax-keyword: #ff7b72;
  --json-syntax-atom: #d2a8ff;
  --json-syntax-number: #ffa657;
  --json-syntax-string: #a5d6ff;
  --json-syntax-escape: #ffa198;
  --json-syntax-definition: #79c0ff;
  --json-syntax-variable: #d2a8ff;
  --json-syntax-type: #7ee787;
  --json-syntax-class: #7ee787;
  --json-syntax-special: #79c0ff;
  --json-syntax-property: #79c0ff;
  --json-syntax-comment: #8b949e;
  --json-syntax-invalid: #ff7b72;
}

.json-object-editor:focus-within {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 1px var(--primary-color) inset;
}

.json-object-editor.is-invalid:not(:focus-within) {
  border-color: var(--el-color-danger, #f56c6c);
}

.json-editor-toolbar,
.json-editor-status {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 7px 10px;
  background: var(--bg-hover);
}

.json-editor-toolbar {
  justify-content: space-between;
  border-bottom: 1px solid var(--border-color);
}

.json-editor-actions {
  display: flex;
  gap: 2px;
}

.json-schema-label {
  color: var(--text-muted);
  font-size: 12px;
}

.json-editor-status {
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  line-height: 1.4;
}

.status-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.status-dot.valid {
  background: var(--el-color-success, #67c23a);
}

.status-dot.invalid {
  background: var(--el-color-danger, #f56c6c);
}

.valid-text {
  color: var(--el-color-success, #529b2e);
}

.invalid-text {
  color: var(--el-color-danger, #f56c6c);
}

.json-codemirror :deep(.cm-editor) {
  width: 100%;
}
</style>
