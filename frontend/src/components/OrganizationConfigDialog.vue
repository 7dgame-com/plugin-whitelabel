<template>
  <el-dialog
    :model-value="visible"
    :title="
      record
        ? t('organization.editTitle')
        : t('organization.createTitle')
    "
    width="min(720px, 92vw)"
    destroy-on-close
    :close-on-click-modal="false"
    @update:model-value="emit('update:visible', $event)"
  >
    <el-alert
      :title="t('organization.buyerBoundary')"
      type="info"
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
      <el-form-item :label="t('organization.organization')" prop="organizationId">
        <el-select
          v-model="form.organizationId"
          filterable
          :disabled="Boolean(record)"
          :placeholder="t('organization.selectOrganization')"
          style="width: 100%"
        >
          <el-option
            v-for="organization in organizations"
            :key="organization.id"
            :label="`${organization.title} (${organization.name} · #${organization.id})`"
            :value="organization.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item :label="t('organization.json')" prop="json">
        <JsonObjectEditor
          v-model="form.json"
          schema="organization"
          :aria-label="t('organization.json')"
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
  JsonObject,
  OrganizationConfigRecord,
  OrganizationSummary,
} from '../domain/types'
import { validateJsonObjectText } from '../domain/jsonObject'

const props = defineProps<{
  visible: boolean
  saving: boolean
  record: OrganizationConfigRecord | null
  organizations: OrganizationSummary[]
}>()

const emit = defineEmits<{
  'update:visible': [visible: boolean]
  submit: [organization: OrganizationSummary, config: JsonObject]
}>()

const { t } = useI18n()
const formRef = ref<FormInstance>()
const form = reactive({
  organizationId: 0,
  json: '{}',
})

const rules: FormRules = {
  organizationId: [
    {
      validator: (
        _rule: unknown,
        value: number,
        callback: (error?: Error) => void,
      ) => callback(value > 0 ? undefined : new Error(t('common.required'))),
      trigger: 'change',
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
  form.organizationId = props.record?.organizationId ?? 0
  form.json = JSON.stringify(props.record?.config ?? {}, null, 2)
  formRef.value?.clearValidate()
}

function parseJson(): JsonObject | null {
  const parsed = validateJsonObjectText(form.json, 'organization')
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

  const organization =
    props.organizations.find(
      (item) => item.id === form.organizationId,
    ) ??
    (props.record
      ? {
          id: props.record.organizationId,
          name: props.record.organizationName,
          title: props.record.organizationTitle,
        }
      : null)

  if (!organization) {
    ElMessage.error(t('organization.organizationUnavailable'))
    return
  }

  emit('submit', organization, config)
}

watch(
  [() => props.visible, () => props.record],
  ([visible]) => {
    if (visible) reset()
  },
)
</script>
