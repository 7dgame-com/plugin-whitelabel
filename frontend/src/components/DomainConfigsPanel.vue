<template>
  <section v-if="isRootUser" class="resource-panel">
    <div class="section-heading">
      <div>
        <div class="eyebrow warning">{{ t('domain.agentLabel') }}</div>
        <h2>{{ t('domain.title') }}</h2>
        <p>{{ t('domain.description') }}</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">
        {{ t('domain.add') }}
      </el-button>
    </div>

    <el-alert
      :title="t('domain.rootScope')"
      type="warning"
      :closable="false"
      show-icon
    />

    <div class="resource-toolbar">
      <el-input
        v-model="search"
        clearable
        :placeholder="t('domain.searchPlaceholder')"
        class="search-input"
        @keyup.enter="applySearch"
        @clear="applySearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-button @click="applySearch">{{ t('common.search') }}</el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="items"
      row-key="domainId"
      stripe
      :empty-text="t('common.noData')"
    >
      <el-table-column
        prop="description"
        :label="t('domain.descriptionField')"
        min-width="180"
      />
      <el-table-column :label="t('domain.configKey')" min-width="220">
        <template #default="{ row }">
          <div class="identity-cell">
            <code>{{ row.configKey }}</code>
            <span>#{{ row.domainId }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.jsonObject')" min-width="150">
        <template #default="{ row }">
          <code class="json-summary">
            {{ t('common.jsonKeyCount', { count: Object.keys(row.config).length }) }}
          </code>
        </template>
      </el-table-column>
      <el-table-column
        prop="revision"
        :label="t('common.revision')"
        width="90"
        align="center"
      />
      <el-table-column :label="t('common.status')" width="110" align="center">
        <template #default="{ row }">
          <el-switch
            :model-value="row.enabled"
            :loading="togglePending.has(row.domainId)"
            :disabled="togglePending.has(row.domainId)"
            @change="toggleEnabled(row, Boolean($event))"
          />
        </template>
      </el-table-column>
      <el-table-column
        :label="t('common.actions')"
        width="110"
        fixed="right"
      >
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">
            {{ t('common.edit') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      class="pagination"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      @current-change="load"
      @size-change="changePageSize"
    />

    <DomainConfigDialog
      v-model:visible="editorVisible"
      :saving="saving"
      :record="editing"
      @submit="save"
    />
  </section>

  <section v-else class="resource-panel restricted-panel">
    <el-result
      icon="info"
      :title="t('domain.rootOnlyTitle')"
      :sub-title="t('domain.rootOnlyDescription')"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Plus, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import DomainConfigDialog from './DomainConfigDialog.vue'
import {
  createDomainConfig,
  getDomainConfig,
  listDomainConfigs,
  setDomainConfigEnabled,
  updateDomainConfig,
} from '../api/whiteLabelManagement'
import { useAuthSession } from '../composables/useAuthSession'
import type {
  DomainConfigRecord,
  StaticDomainConfig,
} from '../domain/types'

const { t } = useI18n()
const { isRootUser } = useAuthSession()

const loading = ref(false)
const saving = ref(false)
const search = ref('')
const appliedSearch = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const items = ref<DomainConfigRecord[]>([])
const editorVisible = ref(false)
const editing = ref<DomainConfigRecord | null>(null)
const togglePending = ref(new Set<number>())

async function load(): Promise<void> {
  if (!isRootUser.value) return
  loading.value = true
  try {
    const result = await listDomainConfigs({
      q: appliedSearch.value,
      page: page.value,
      pageSize: pageSize.value,
    })
    items.value = result.items
    total.value = result.total
  } catch {
    ElMessage.error(t('domain.loadFailed'))
  } finally {
    loading.value = false
  }
}

function applySearch(): void {
  appliedSearch.value = search.value.trim()
  page.value = 1
  void load()
}

function changePageSize(): void {
  page.value = 1
  void load()
}

function openCreate(): void {
  if (!isRootUser.value) return
  editing.value = null
  editorVisible.value = true
}

async function openEdit(row: DomainConfigRecord): Promise<void> {
  if (!isRootUser.value) return
  try {
    editing.value = await getDomainConfig(row.domainId)
    editorVisible.value = true
  } catch {
    ElMessage.error(t('domain.loadFailed'))
  }
}

async function save(value: {
  configKey: string
  config: StaticDomainConfig
}): Promise<void> {
  if (!isRootUser.value) return
  saving.value = true
  try {
    if (editing.value) {
      await updateDomainConfig(editing.value.domainId, {
        ...value,
        revision: editing.value.revision,
        schemaVersion: 1,
      })
    } else {
      await createDomainConfig({
        ...value,
        schemaVersion: 1,
      })
    }
    editorVisible.value = false
    ElMessage.success(t('common.saveSuccess'))
    await load()
  } catch {
    ElMessage.error(t('common.saveFailed'))
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(
  row: DomainConfigRecord,
  enabled: boolean,
): Promise<void> {
  if (!isRootUser.value) return
  togglePending.value.add(row.domainId)
  try {
    const updated = await setDomainConfigEnabled(
      row.domainId,
      enabled,
      row.revision,
    )
    row.enabled = updated.enabled
    row.revision = updated.revision
    ElMessage.success(t('common.statusUpdated'))
  } catch {
    ElMessage.error(t('common.statusFailed'))
  } finally {
    togglePending.value.delete(row.domainId)
  }
}

onMounted(() => void load())
</script>
