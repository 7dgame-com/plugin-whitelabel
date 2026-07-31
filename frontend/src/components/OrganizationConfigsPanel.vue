<template>
  <section class="resource-panel">
    <div class="section-heading">
      <div>
        <div class="eyebrow">{{ t('organization.buyerLabel') }}</div>
        <h2>{{ t('organization.title') }}</h2>
        <p>{{ t('organization.description') }}</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">
        {{ t('organization.add') }}
      </el-button>
    </div>

    <el-alert
      :title="
        isRootUser
          ? t('organization.rootScope')
          : t('organization.adminScope')
      "
      type="info"
      :closable="false"
      show-icon
    />

    <div class="resource-toolbar">
      <el-input
        v-model="search"
        clearable
        :placeholder="t('organization.searchPlaceholder')"
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
      row-key="organizationId"
      stripe
      :empty-text="t('common.noData')"
    >
      <el-table-column :label="t('organization.organization')" min-width="230">
        <template #default="{ row }">
          <div class="identity-cell">
            <strong>{{ row.organizationTitle }}</strong>
            <span>{{ row.organizationName }} · #{{ row.organizationId }}</span>
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
            :loading="togglePending.has(row.organizationId)"
            :disabled="
              !canWrite(row.organizationId) ||
              togglePending.has(row.organizationId)
            "
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
          <el-button
            link
            type="primary"
            :disabled="!canWrite(row.organizationId)"
            @click="openEdit(row)"
          >
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

    <OrganizationConfigDialog
      v-model:visible="editorVisible"
      :saving="saving"
      :record="editing"
      :organizations="organizationOptions"
      @submit="save"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Plus, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import OrganizationConfigDialog from './OrganizationConfigDialog.vue'
import { listOrganizations } from '../api/session'
import {
  createOrganizationConfig,
  getOrganizationConfig,
  listOrganizationConfigs,
  setOrganizationConfigEnabled,
  updateOrganizationConfig,
} from '../api/whiteLabelManagement'
import {
  canManageOrganization,
  useAuthSession,
} from '../composables/useAuthSession'
import type {
  JsonObject,
  OrganizationConfigRecord,
  OrganizationSummary,
} from '../domain/types'

const { t } = useI18n()
const { user, isRootUser, fetchSession } = useAuthSession()

const loading = ref(false)
const saving = ref(false)
const search = ref('')
const appliedSearch = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const items = ref<OrganizationConfigRecord[]>([])
const organizationOptions = ref<OrganizationSummary[]>([])
const editorVisible = ref(false)
const editing = ref<OrganizationConfigRecord | null>(null)
const togglePending = ref(new Set<number>())

function canWrite(organizationId: number): boolean {
  return canManageOrganization(user.value, organizationId)
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const result = await listOrganizationConfigs({
      q: appliedSearch.value,
      page: page.value,
      pageSize: pageSize.value,
    })
    items.value = result.items.filter((item) =>
      canWrite(item.organizationId),
    )
    total.value = result.total
  } catch {
    ElMessage.error(t('organization.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function loadOrganizationOptions(): Promise<void> {
  await fetchSession().catch(() => undefined)
  if (!isRootUser.value) {
    organizationOptions.value = [...(user.value?.organizations ?? [])]
    return
  }

  try {
    organizationOptions.value = await listOrganizations()
  } catch {
    organizationOptions.value = [...(user.value?.organizations ?? [])]
    ElMessage.warning(t('organization.optionsFailed'))
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
  editing.value = null
  editorVisible.value = true
}

async function openEdit(row: OrganizationConfigRecord): Promise<void> {
  if (!canWrite(row.organizationId)) return
  try {
    editing.value = await getOrganizationConfig(row.organizationId)
    editorVisible.value = true
  } catch {
    ElMessage.error(t('organization.loadFailed'))
  }
}

async function save(
  organization: OrganizationSummary,
  config: JsonObject,
): Promise<void> {
  if (!canWrite(organization.id)) {
    ElMessage.error(t('auth.deniedDescription'))
    return
  }

  saving.value = true
  try {
    if (editing.value) {
      await updateOrganizationConfig(editing.value.organizationId, {
        revision: editing.value.revision,
        schemaVersion: editing.value.schemaVersion,
        config,
      })
    } else {
      await createOrganizationConfig({
        organizationId: organization.id,
        schemaVersion: 1,
        config,
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
  row: OrganizationConfigRecord,
  enabled: boolean,
): Promise<void> {
  if (!canWrite(row.organizationId)) return
  togglePending.value.add(row.organizationId)
  try {
    const updated = await setOrganizationConfigEnabled(
      row.organizationId,
      enabled,
      row.revision,
    )
    row.enabled = updated.enabled
    row.revision = updated.revision
    ElMessage.success(t('common.statusUpdated'))
  } catch {
    ElMessage.error(t('common.statusFailed'))
  } finally {
    togglePending.value.delete(row.organizationId)
  }
}

onMounted(() => {
  void Promise.all([load(), loadOrganizationOptions()])
})
</script>
