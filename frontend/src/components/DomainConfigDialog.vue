<template>
  <el-dialog
    :model-value="visible"
    :title="record ? t('domain.editTitle') : t('domain.createTitle')"
    width="min(720px, 92vw)"
    destroy-on-close
    :close-on-click-modal="false"
    @update:model-value="emit('update:visible', $event)"
  >
    <el-alert
      :title="t('domain.agentBoundary')"
      type="warning"
      :closable="false"
      show-icon
      class="dialog-boundary"
    />

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
    >
      <div class="form-grid">
        <el-form-item :label="t('domain.displayName')" prop="displayName">
          <el-input
            v-model="form.displayName"
            maxlength="191"
            show-word-limit
            :placeholder="t('domain.displayNamePlaceholder')"
          />
        </el-form-item>

        <el-form-item :label="t('domain.hostname')" prop="domain">
          <el-input
            v-model="form.domain"
            autocomplete="off"
            :placeholder="t('domain.hostnamePlaceholder')"
            @blur="normalizeDomain"
          />
        </el-form-item>
      </div>

      <el-form-item :label="t('domain.json')" prop="json">
        <el-input
          v-model="form.json"
          type="textarea"
          :rows="15"
          resize="vertical"
          spellcheck="false"
          class="json-editor"
          :placeholder="t('common.jsonPlaceholder')"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:visible', false)">
        {{ t('common.cancel') }}
      </el-button>
      <el-button type="primary" :loading="saving" @click="submit">
        {{ t('common.save') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useI18n } from 'vue-i18n'
import type {
  DomainConfigRecord,
  JsonObject,
} from '../domain/types'
import {
  hostnameValidationMessage,
  normalizeHostname,
} from '../domain/domainName'

const props = defineProps<{
  visible: boolean
  saving: boolean
  record: DomainConfigRecord | null
}>()

const emit = defineEmits<{
  'update:visible': [visible: boolean]
  submit: [value: { domain: string; displayName: string; config: JsonObject }]
}>()

const { t } = useI18n()
const formRef = ref<FormInstance>()
const form = reactive({
  domain: '',
  displayName: '',
  json: '{}',
})

const rules: FormRules = {
  displayName: [
    {
      required: true,
      message: () => t('common.required'),
      trigger: 'blur',
    },
  ],
  domain: [
    {
      validator: (
        _rule: unknown,
        value: string,
        callback: (error?: Error) => void,
      ) => {
        const message = hostnameValidationMessage(value)
        callback(message ? new Error(message) : undefined)
      },
      trigger: ['blur', 'change'],
    },
  ],
  json: [
    {
      required: true,
      message: () => t('common.required'),
      trigger: 'blur',
    },
  ],
}

function reset(): void {
  form.domain = props.record?.domain ?? ''
  form.displayName = props.record?.displayName ?? ''
  form.json = JSON.stringify(props.record?.config ?? {}, null, 2)
  formRef.value?.clearValidate()
}

function normalizeDomain(): void {
  form.domain = normalizeHostname(form.domain)
}

function parseJson(): JsonObject | null {
  try {
    const parsed = JSON.parse(form.json) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected object')
    }
    return parsed as JsonObject
  } catch {
    ElMessage.error(t('common.jsonInvalid'))
    return null
  }
}

async function submit(): Promise<void> {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  const config = parseJson()
  if (!config) return

  emit('submit', {
    domain: normalizeHostname(form.domain),
    displayName: form.displayName.trim(),
    config,
  })
}

watch(
  [() => props.visible, () => props.record],
  ([visible]) => {
    if (visible) reset()
  },
)
</script>
