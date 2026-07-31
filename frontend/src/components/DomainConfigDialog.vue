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

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-form-item :label="t('domain.json')" prop="json">
        <JsonObjectEditor
          v-model="form.json"
          schema="domain"
          :aria-label="t('domain.json')"
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
import JsonObjectEditor from './JsonObjectEditor.vue'
import type {
  DomainConfigRecord,
  StaticDomainConfig,
} from '../domain/types'
import { validateJsonObjectText } from '../domain/jsonObject'

const props = defineProps<{
  visible: boolean
  saving: boolean
  record: DomainConfigRecord | null
}>()

const emit = defineEmits<{
  'update:visible': [visible: boolean]
  submit: [value: { configKey: string; config: StaticDomainConfig }]
}>()

const { t } = useI18n()
const formRef = ref<FormInstance>()
const form = reactive({
  json: JSON.stringify(emptyDomainConfig(), null, 2),
})

const rules: FormRules = {
  json: [
    {
      required: true,
      message: () => t('common.required'),
      trigger: 'blur',
    },
  ],
}

function emptyDomainConfig(): StaticDomainConfig {
  return {
    name: '',
    description: '',
    is_active: true,
    fallback_domain: null,
    default_config: {},
    configs: {},
  }
}

function reset(): void {
  form.json = JSON.stringify(
    props.record?.config ?? emptyDomainConfig(),
    null,
    2,
  )
  formRef.value?.clearValidate()
}

function parseJson(): StaticDomainConfig | null {
  const parsed = validateJsonObjectText(form.json, 'domain')
  if (!parsed.valid) {
    ElMessage.error(t('common.jsonInvalid'))
    return null
  }
  return parsed.value
}

async function submit(): Promise<void> {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  const config = parseJson()
  if (!config) return
  if (props.record?.enabled && !config.is_active) {
    ElMessage.error(t('domain.disableBeforeInactive'))
    return
  }

  emit('submit', {
    configKey: config.name,
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
