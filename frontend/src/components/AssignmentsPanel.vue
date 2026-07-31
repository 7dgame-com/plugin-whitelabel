<template>
  <section class="resource-panel">
    <div class="section-heading">
      <div>
        <div class="eyebrow success">{{ t('assignment.deliveryLabel') }}</div>
        <h2>{{ t('assignment.title') }}</h2>
        <p>{{ t('assignment.description') }}</p>
      </div>
      <el-button
        v-if="isRootUser"
        type="primary"
        :icon="Plus"
        @click="openCreate"
      >
        {{ t('assignment.add') }}
      </el-button>
    </div>

    <el-alert
      :title="
        isRootUser
          ? t('assignment.rootScope')
          : t('assignment.adminScope')
      "
      :type="isRootUser ? 'success' : 'info'"
      :closable="false"
      show-icon
    />

    <div class="resource-toolbar">
      <el-input
        v-model="search"
        clearable
        :placeholder="t('assignment.searchPlaceholder')"
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
      row-key="assignmentId"
      stripe
      :empty-text="t('common.noData')"
    >
      <el-table-column :label="t('organization.buyerLabel')" min-width="220">
        <template #default="{ row }">
          <div class="identity-cell">
            <strong>
              {{
                row.organizationTitle ||
                row.organizationName ||
                `${t('organization.buyerLabel')} #${row.organizationId}`
              }}
            </strong>
            <span v-if="row.organizationName">
              {{ row.organizationName }} · #{{ row.organizationId }}
            </span>
            <span v-else>#{{ row.organizationId }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('domain.agentLabel')" min-width="220">
        <template #default="{ row }">
          <div class="identity-cell">
            <strong v-if="row.domainDescription || row.domainConfigKey">
              {{ row.domainDescription || row.domainConfigKey }}
            </strong>
            <strong v-else>
              {{ t('domain.agentLabel') }} #{{ row.domainId }}
            </strong>
            <span v-if="row.domainConfigKey">
              {{ row.domainConfigKey }} · #{{ row.domainId }}
            </span>
            <span v-else>#{{ row.domainId }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        prop="revision"
        :label="t('common.revision')"
        width="90"
        align="center"
      />
      <el-table-column :label="t('common.status')" width="210" align="center">
        <template #default="{ row }">
          <div class="layer-status">
            <div class="assignment-toggle">
              <span>{{ t('assignment.assignmentLayer') }}</span>
              <el-switch
                v-if="isRootUser"
                :model-value="row.enabled"
                :loading="togglePending.has(row.assignmentId)"
                :disabled="togglePending.has(row.assignmentId)"
                @change="toggleEnabled(row, Boolean($event))"
              />
              <el-tag
                v-else
                size="small"
                :type="row.enabled ? 'success' : 'info'"
                effect="plain"
              >
                {{
                  row.enabled
                    ? t('common.enabled')
                    : t('common.disabled')
                }}
              </el-tag>
            </div>
            <div class="dependency-status">
              <el-tag
                size="small"
                :type="row.organizationEnabled ? 'success' : 'info'"
                effect="plain"
              >
                {{ t('assignment.organizationLayer') }} ·
                {{
                  row.organizationEnabled
                    ? t('common.enabled')
                    : t('common.disabled')
                }}
              </el-tag>
              <el-tag
                size="small"
                :type="row.domainEnabled ? 'success' : 'info'"
                effect="plain"
              >
                {{ t('assignment.domainLayer') }} ·
                {{
                  row.domainEnabled
                    ? t('common.enabled')
                    : t('common.disabled')
                }}
              </el-tag>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('assignment.qrCode')"
        width="130"
        fixed="right"
      >
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            :disabled="!canReadQr(row)"
            @click="openQr(row)"
          >
            {{ t('assignment.viewQr') }}
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

    <AssignmentDialog
      v-model:visible="editorVisible"
      :saving="saving"
      :organizations="organizationOptions"
      :domains="domainOptions"
      @submit="save"
    />

    <WhiteLabelQrDialog
      v-model:visible="qrVisible"
      :assignment="qrAssignment"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue'
import { Plus, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import AssignmentDialog from './AssignmentDialog.vue'
import WhiteLabelQrDialog from './WhiteLabelQrDialog.vue'
import {
  createAssignment,
  listAssignments,
  listDomainConfigs,
  listOrganizationConfigs,
  setAssignmentEnabled,
} from '../api/whiteLabelManagement'
import { useAuthSession } from '../composables/useAuthSession'
import {
  canViewAssignment,
  filterAssignmentsForViewer,
  isAssignmentEffective,
} from '../domain/assignment'
import { isValidWhiteLabelQrUrl } from '../domain/qrUrl'
import type {
  AssignmentInput,
  AssignmentRecord,
  DomainConfigRecord,
  OrganizationConfigRecord,
  PagedResult,
} from '../domain/types'

const { t } = useI18n()
const { user, isRootUser } = useAuthSession()

const loading = ref(false)
const saving = ref(false)
const search = ref('')
const appliedSearch = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const items = ref<AssignmentRecord[]>([])
const organizationOptions = ref<OrganizationConfigRecord[]>([])
const domainOptions = shallowRef<DomainConfigRecord[]>([])
const editorVisible = ref(false)
const qrVisible = ref(false)
const qrAssignment = ref<AssignmentRecord | null>(null)
const togglePending = ref(new Set<number>())

function belongsToAdmin(row: AssignmentRecord): boolean {
  return canViewAssignment(user.value, row)
}

function canReadQr(row: AssignmentRecord): boolean {
  return (
    isAssignmentEffective(row) &&
    (isRootUser.value || belongsToAdmin(row)) &&
    Boolean(row.qrUrl) &&
    isValidWhiteLabelQrUrl(row.qrUrl ?? '')
  )
}

function enrichAssignment(row: AssignmentRecord): AssignmentRecord {
  const organization = organizationOptions.value.find(
    (item) => item.organizationId === row.organizationId,
  )
  const domain = domainOptions.value.find(
    (item) => item.domainId === row.domainId,
  )
  return {
    ...row,
    organizationName:
      row.organizationName || organization?.organizationName || '',
    organizationTitle:
      row.organizationTitle || organization?.organizationTitle || '',
    domainConfigKey: row.domainConfigKey || domain?.configKey || '',
    domainDescription:
      row.domainDescription || domain?.description || '',
  }
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const result = await listAssignments({
      q: appliedSearch.value,
      page: page.value,
      pageSize: pageSize.value,
    })
    const visibleItems = filterAssignmentsForViewer(
      result.items,
      user.value,
    )
    items.value = isRootUser.value
      ? visibleItems.map(enrichAssignment)
      : visibleItems
    total.value = result.total
  } catch {
    ElMessage.error(t('assignment.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function loadReferenceOptions(): Promise<void> {
  if (!isRootUser.value) return
  try {
    const [organizations, domains] = await Promise.all([
      loadAllPages((page) =>
        listOrganizationConfigs({ page, pageSize: 100 }),
      ),
      loadAllPages((page) => listDomainConfigs({ page, pageSize: 100 })),
    ])
    organizationOptions.value = organizations
    domainOptions.value = domains
  } catch {
    ElMessage.error(t('assignment.optionsFailed'))
  }
}

async function loadAllPages<T>(
  loadPage: (page: number) => Promise<PagedResult<T>>,
): Promise<T[]> {
  const first = await loadPage(1)
  const items = [...first.items]
  const pageCount = Math.ceil(first.total / first.pageSize)

  for (let nextPage = 2; nextPage <= pageCount; nextPage += 1) {
    const result = await loadPage(nextPage)
    items.push(...result.items)
  }

  return items
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

async function openCreate(): Promise<void> {
  if (!isRootUser.value) return
  await loadReferenceOptions()
  editorVisible.value = true
}

async function save(input: AssignmentInput): Promise<void> {
  if (!isRootUser.value) return
  saving.value = true
  try {
    await createAssignment(input)
    editorVisible.value = false
    ElMessage.success(t('assignment.createSuccess'))
    await load()
  } catch {
    ElMessage.error(t('assignment.createFailed'))
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(
  row: AssignmentRecord,
  enabled: boolean,
): Promise<void> {
  if (!isRootUser.value) return
  togglePending.value.add(row.assignmentId)
  try {
    const updated = await setAssignmentEnabled(
      row.assignmentId,
      enabled,
      row.revision,
    )
    Object.assign(row, updated)
    ElMessage.success(t('common.statusUpdated'))
  } catch {
    ElMessage.error(t('common.statusFailed'))
  } finally {
    togglePending.value.delete(row.assignmentId)
  }
}

function openQr(row: AssignmentRecord): void {
  if (!canReadQr(row)) return
  qrAssignment.value = row
  qrVisible.value = true
}

onMounted(async () => {
  if (isRootUser.value) {
    await loadReferenceOptions()
  }
  await load()
})
</script>
