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

    <section
      class="domain-import"
      :aria-label="t('domain.importTitle')"
    >
      <div class="domain-import__heading">
        <strong>{{ t('domain.importTitle') }}</strong>
        <span>{{ t('domain.importOneTimeHint') }}</span>
      </div>

      <div class="domain-import__controls">
        <el-select
          v-model="selectedCatalogKey"
          filterable
          clearable
          :loading="catalogLoading"
          :placeholder="t('domain.importSelectPlaceholder')"
          :no-data-text="t('domain.importNoData')"
          data-testid="domain-import-select"
          class="domain-import__select"
        >
          <el-option
            v-for="item in catalogItems"
            :key="item.configKey"
            :value="item.configKey"
            :label="`${item.configKey} · ${item.description}`"
            :disabled="!item.importable || !item.config"
          >
            <div class="domain-import-option">
              <div class="domain-import-option__identity">
                <strong>{{ item.configKey }}</strong>
                <span>{{ item.description }}</span>
              </div>
              <div class="domain-import-option__status">
                <el-tag
                  size="small"
                  :type="item.isActive ? 'success' : 'info'"
                >
                  {{
                    item.isActive
                      ? t('common.enabled')
                      : t('common.disabled')
                  }}
                </el-tag>
                <small v-if="!item.importable || !item.config">
                  {{
                    item.reason ||
                    (!item.config ? t('domain.importMissingConfig') : '')
                  }}
                </small>
              </div>
            </div>
          </el-option>
        </el-select>

        <el-button
          type="primary"
          plain
          :disabled="!canImportSelected"
          data-testid="domain-import-button"
          @click="importSelectedConfig"
        >
          {{ t('domain.importAction') }}
        </el-button>
      </div>

      <el-alert
        v-if="catalogLoadFailed"
        :title="t('domain.importLoadFailed')"
        :description="t('domain.importManualFallback')"
        type="warning"
        :closable="false"
        show-icon
        data-testid="domain-import-error"
      />

      <div
        v-if="selectedCatalogItem"
        class="domain-import__details"
        data-testid="domain-import-details"
      >
        <span v-if="catalogSource">
          {{ t('domain.importSource', { source: catalogSource }) }}
        </span>
        <span v-if="selectedCatalogItem.materializedFrom.length">
          {{
            t('domain.importMaterialized', {
              values: selectedCatalogItem.materializedFrom.join(', '),
            })
          }}
        </span>
        <div v-if="selectedCatalogItem.warnings.length">
          <strong>{{ t('domain.importWarnings') }}</strong>
          <ul>
            <li
              v-for="warning in selectedCatalogItem.warnings"
              :key="warning"
            >
              {{ warning }}
            </li>
          </ul>
        </div>
      </div>
    </section>

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
import {
  computed,
  onBeforeUnmount,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue'
import {
  ElMessage,
  ElMessageBox,
  type FormInstance,
  type FormRules,
} from 'element-plus'
import { useI18n } from 'vue-i18n'
import JsonObjectEditor from './JsonObjectEditor.vue'
import type {
  DomainConfigRecord,
  DomainImportCatalogItem,
  StaticDomainConfig,
} from '../domain/types'
import { validateJsonObjectText } from '../domain/jsonObject'
import { getDomainImportCatalog } from '../api/whiteLabelManagement'

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
const catalogItems = shallowRef<DomainImportCatalogItem[]>([])
const catalogSource = ref('')
const catalogLoading = ref(false)
const catalogLoadFailed = ref(false)
const selectedCatalogKey = ref('')
let catalogRequestGeneration = 0
const selectedCatalogItem = computed<DomainImportCatalogItem | null>(
  () =>
    catalogItems.value.find(
      (item) => item.configKey === selectedCatalogKey.value,
    ) ?? null,
)
const canImportSelected = computed(
  () =>
    Boolean(selectedCatalogItem.value?.importable) &&
    Boolean(selectedCatalogItem.value?.config),
)

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
  selectedCatalogKey.value = ''
  formRef.value?.clearValidate()
}

async function loadImportCatalog(): Promise<void> {
  const requestGeneration = ++catalogRequestGeneration
  catalogLoading.value = true
  catalogLoadFailed.value = false
  catalogItems.value = []
  catalogSource.value = ''
  try {
    const catalog = await getDomainImportCatalog()
    if (requestGeneration !== catalogRequestGeneration) return
    catalogItems.value = catalog.items
    catalogSource.value = catalog.source
  } catch {
    if (requestGeneration !== catalogRequestGeneration) return
    catalogLoadFailed.value = true
  } finally {
    if (requestGeneration === catalogRequestGeneration) {
      catalogLoading.value = false
    }
  }
}

function invalidateImportCatalogRequest(): void {
  catalogRequestGeneration += 1
  catalogLoading.value = false
}

async function importSelectedConfig(): Promise<void> {
  const item = selectedCatalogItem.value
  if (!item?.importable || !item.config) return

  if (form.json.trim()) {
    try {
      await ElMessageBox.confirm(
        t('domain.importConfirmMessage'),
        t('domain.importConfirmTitle'),
        {
          type: 'warning',
          confirmButtonText: t('domain.importConfirmButton'),
          cancelButtonText: t('common.cancel'),
        },
      )
    } catch {
      return
    }
  }

  form.json = JSON.stringify(item.config, null, 2)
  formRef.value?.clearValidate('json')
  ElMessage.success(t('domain.importSuccess'))
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
    if (visible) {
      reset()
      void loadImportCatalog()
    } else {
      invalidateImportCatalogRequest()
    }
  },
  { immediate: true },
)

onBeforeUnmount(invalidateImportCatalogRequest)
</script>

<style scoped>
.domain-import {
  display: grid;
  gap: 12px;
  margin-bottom: 18px;
  padding: 14px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}

.domain-import__heading {
  display: grid;
  gap: 4px;
}

.domain-import__heading span,
.domain-import__details {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.domain-import__controls {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.domain-import__select {
  flex: 1;
  min-width: 0;
}

.domain-import-option {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.domain-import-option__identity,
.domain-import-option__status,
.domain-import__details {
  display: grid;
  gap: 3px;
}

.domain-import-option__identity span,
.domain-import-option__status small {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.domain-import-option__status {
  justify-items: end;
}

.domain-import__details ul {
  margin: 3px 0 0;
  padding-left: 20px;
}

@media (max-width: 600px) {
  .domain-import__controls {
    flex-direction: column;
  }

  .domain-import__select,
  .domain-import__controls :deep(.el-button) {
    width: 100%;
  }
}
</style>
