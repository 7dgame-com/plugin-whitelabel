<template>
  <el-dialog
    :model-value="visible"
    :title="t('qr.title')"
    width="min(520px, 92vw)"
    @update:model-value="emit('update:visible', $event)"
  >
    <div v-if="assignment && qrValue" class="qr-content">
      <div class="qr-frame">
        <qrcode-vue :value="qrValue" :size="260" level="H" />
      </div>
      <strong>
        {{
          assignment.organizationTitle ||
          assignment.organizationName ||
          `#${assignment.organizationId}`
        }}
        ×
        {{
          domainDescriptionLabel(
            assignment.domainDescription,
            assignment.domainConfigKey,
          ) ||
          `#${assignment.domainId}`
        }}
      </strong>
      <span
        v-if="assignment.organizationName || assignment.domainConfigKey"
        class="qr-context"
      >
        {{ assignment.organizationName }} · {{ assignment.domainConfigKey }}
      </span>
      <el-alert
        :title="t('qr.hint')"
        type="info"
        :closable="false"
        show-icon
      />
      <div class="qr-value">
        <span>{{ t('qr.value') }}</span>
        <code>{{ qrValue }}</code>
      </div>
    </div>
    <el-result
      v-else
      icon="warning"
      :title="t('qr.unavailable')"
      :sub-title="t('qr.unavailableHint')"
    />

    <template #footer>
      <el-button :disabled="!qrValue" @click="copyQrValue">
        {{ t('common.copy') }}
      </el-button>
      <el-button type="primary" @click="emit('update:visible', false)">
        {{ t('common.close') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import QrcodeVue from 'qrcode.vue'
import { useI18n } from 'vue-i18n'
import { domainDescriptionLabel } from '../domain/domainIdentity'
import type { AssignmentRecord } from '../domain/types'
import { isValidWhiteLabelQrUrl } from '../domain/qrUrl'

const props = defineProps<{
  visible: boolean
  assignment: AssignmentRecord | null
}>()

const emit = defineEmits<{
  'update:visible': [visible: boolean]
}>()

const { t } = useI18n()
const qrValue = computed(() => {
  const value = props.assignment?.qrUrl ?? ''
  return isValidWhiteLabelQrUrl(value) ? value : ''
})

async function copyQrValue(): Promise<void> {
  if (!qrValue.value) return
  try {
    await navigator.clipboard.writeText(qrValue.value)
    ElMessage.success(t('qr.copySuccess'))
  } catch {
    ElMessage.warning(t('qr.copyFailed'))
  }
}
</script>
