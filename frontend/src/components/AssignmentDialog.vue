<template>
  <el-dialog
    :model-value="visible"
    :title="t('assignment.createTitle')"
    width="min(620px, 92vw)"
    destroy-on-close
    :close-on-click-modal="false"
    @update:model-value="emit('update:visible', $event)"
  >
    <el-alert
      :title="t('assignment.referenceOnly')"
      type="success"
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
      <el-form-item
        :label="t('assignment.organizationConfig')"
        prop="organizationId"
      >
        <el-select
          v-model="form.organizationId"
          filterable
          :placeholder="t('assignment.selectOrganization')"
          style="width: 100%"
        >
          <el-option
            v-for="item in organizations"
            :key="item.organizationId"
            :value="item.organizationId"
            :label="`${item.organizationTitle} (${item.organizationName} · #${item.organizationId})`"
          >
            <span>{{ item.organizationTitle }}</span>
            <el-tag
              size="small"
              :type="item.enabled ? 'success' : 'info'"
              class="option-status"
            >
              {{
                item.enabled
                  ? t('common.enabled')
                  : t('common.disabled')
              }}
            </el-tag>
          </el-option>
        </el-select>
      </el-form-item>

      <el-form-item :label="t('assignment.domainConfig')" prop="domainId">
        <el-select
          v-model="form.domainId"
          filterable
          :placeholder="t('assignment.selectDomain')"
          style="width: 100%"
        >
          <el-option
            v-for="item in domains"
            :key="item.domainId"
            :value="item.domainId"
            :label="`${item.displayName} (${item.domain} · #${item.domainId})`"
          >
            <span>{{ item.displayName }} · {{ item.domain }}</span>
            <el-tag
              size="small"
              :type="item.enabled ? 'success' : 'info'"
              class="option-status"
            >
              {{
                item.enabled
                  ? t('common.enabled')
                  : t('common.disabled')
              }}
            </el-tag>
          </el-option>
        </el-select>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:visible', false)">
        {{ t('common.cancel') }}
      </el-button>
      <el-button type="primary" :loading="saving" @click="submit">
        {{ t('common.create') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { type FormInstance, type FormRules } from 'element-plus'
import { useI18n } from 'vue-i18n'
import type {
  AssignmentInput,
  DomainConfigRecord,
  OrganizationConfigRecord,
} from '../domain/types'

const props = defineProps<{
  visible: boolean
  saving: boolean
  organizations: OrganizationConfigRecord[]
  domains: DomainConfigRecord[]
}>()

const emit = defineEmits<{
  'update:visible': [visible: boolean]
  submit: [input: AssignmentInput]
}>()

const { t } = useI18n()
const formRef = ref<FormInstance>()
const form = reactive({
  organizationId: 0,
  domainId: 0,
})

const positiveIdRule = {
  validator: (
    _rule: unknown,
    value: number,
    callback: (error?: Error) => void,
  ) => callback(value > 0 ? undefined : new Error(t('common.required'))),
  trigger: 'change',
}

const rules: FormRules = {
  organizationId: [positiveIdRule],
  domainId: [positiveIdRule],
}

async function submit(): Promise<void> {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  emit('submit', {
    organizationId: form.organizationId,
    domainId: form.domainId,
  })
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.organizationId = 0
    form.domainId = 0
    formRef.value?.clearValidate()
  },
)
</script>
