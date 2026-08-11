<template>
  <el-dialog
    :model-value="visible"
    :title="
      readOnly
        ? t('domain.viewTitle')
        : record
          ? t('domain.editTitle')
          : t('domain.createTitle')
    "
    width="min(720px, 92vw)"
    destroy-on-close
    :close-on-click-modal="false"
    @update:model-value="emit('update:visible', $event)"
  >
    <el-alert
      :title="
        readOnly ? t('domain.readOnlyBoundary') : t('domain.editBoundary')
      "
      :type="readOnly ? 'info' : 'warning'"
      :closable="false"
      show-icon
      class="dialog-boundary"
    />

    <section
      v-if="!readOnly && !record"
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
          :loading="catalogLoading"
          :placeholder="t('domain.importSelectPlaceholder')"
          :no-data-text="t('domain.importNoData')"
          data-testid="domain-import-select"
          class="domain-import__select"
          @change="selectCatalogConfig"
        >
          <el-option
            v-for="item in catalogItems"
            :key="item.configKey"
            :value="item.configKey"
            :label="`${item.configKey} · ${item.description}`"
            :disabled="!item.selectable"
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
                <small v-if="!item.selectable">
                  {{ item.reason }}
                </small>
              </div>
            </div>
          </el-option>
        </el-select>
      </div>

      <el-alert
        v-if="catalogLoadFailed"
        :title="t('domain.importLoadFailed')"
        :description="t('domain.importCreateUnavailable')"
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
      </div>
    </section>

    <div v-if="record" class="domain-key-summary">
      <span>{{ t('domain.configKey') }}</span>
      <code>{{ record.configKey }}</code>
      <small>{{ t('domain.configKeyImmutable') }}</small>
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-form-item :label="t('domain.jsonContent')" prop="json">
        <JsonObjectEditor
          :key="`${activeConfigKey}:${readOnly || (!record && !selectedCatalogItem)}`"
          v-model="form.json"
          :read-only="readOnly || (!record && !selectedCatalogItem)"
          :aria-label="t('domain.jsonContent')"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:visible', false)">
        {{ readOnly ? t('common.close') : t('common.cancel') }}
      </el-button>
      <el-button
        v-if="!readOnly"
        type="primary"
        :loading="saving"
        :disabled="!record && !canCreateSelected"
        @click="submit"
      >
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
  type FormInstance,
  type FormRules,
} from 'element-plus'
import { useI18n } from 'vue-i18n'
import JsonObjectEditor from './JsonObjectEditor.vue'
import type {
  DomainConfigRecord,
  DomainImportCatalogItem,
  JsonObject,
} from '../domain/types'
import { validateJsonObjectText } from '../domain/jsonObject'
import { getDomainImportCatalog } from '../api/whiteLabelManagement'

const props = defineProps<{
  visible: boolean
  saving: boolean
  record: DomainConfigRecord | null
  readOnly: boolean
}>()

const emit = defineEmits<{
  'update:visible': [visible: boolean]
  submit: [value: { configKey: string; config: JsonObject }]
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
const canCreateSelected = computed(
  () => Boolean(selectedCatalogItem.value?.selectable),
)
const activeConfigKey = computed(
  () => props.record?.configKey ?? selectedCatalogKey.value,
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

function emptyDomainConfig(): JsonObject {
  return {}
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

function selectCatalogConfig(): void {
  const item = selectedCatalogItem.value
  if (!item?.selectable) return
  formRef.value?.clearValidate('json')
}

function parseJson(): JsonObject | null {
  const parsed = validateJsonObjectText(form.json)
  if (!parsed.valid) {
    ElMessage.error(t('common.jsonInvalid'))
    return null
  }
  return parsed.value
}

async function submit(): Promise<void> {
  if (props.readOnly) return
  if (!formRef.value) return
  if (!props.record && !canCreateSelected.value) {
    ElMessage.error(t('domain.importSelectionRequired'))
    return
  }
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  const config = parseJson()
  if (!config) return
  emit('submit', {
    configKey: activeConfigKey.value,
    config,
  })
}

watch(
  [() => props.visible, () => props.record],
  ([visible]) => {
    if (visible) {
      reset()
      if (props.readOnly || props.record) {
        invalidateImportCatalogRequest()
        catalogItems.value = []
        catalogSource.value = ''
        catalogLoadFailed.value = false
      } else {
        void loadImportCatalog()
      }
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

.domain-key-summary {
  display: grid;
  gap: 4px;
  margin-bottom: 18px;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}

.domain-key-summary span,
.domain-key-summary small {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.domain-key-summary code {
  font-weight: 600;
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

  .domain-import__select {
    width: 100%;
  }
}
</style>
