<template>
  <section class="workspace-page">
    <el-card shadow="never" class="model-card">
      <div class="model-summary">
        <div>
          <span class="eyebrow">{{ t('workspace.modelLabel') }}</span>
          <h2>{{ t('workspace.modelTitle') }}</h2>
          <p>{{ t('workspace.modelDescription') }}</p>
        </div>
        <div class="model-equation" aria-label="white-label data model">
          <span class="model-chip buyer">{{ t('organization.buyerLabel') }}</span>
          <span>+</span>
          <span class="model-chip agent">{{ t('domain.agentLabel') }}</span>
          <span>→</span>
          <span class="model-chip delivery">{{ t('assignment.deliveryLabel') }}</span>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="workspace-card">
      <el-tabs v-model="activeTab" class="workspace-tabs">
        <el-tab-pane name="organizations">
          <template #label>
            <span class="tab-label">
              <OfficeBuilding />
              {{ t('organization.title') }}
            </span>
          </template>
          <OrganizationConfigsPanel v-if="activeTab === 'organizations'" />
        </el-tab-pane>

        <el-tab-pane name="domains">
          <template #label>
            <span class="tab-label">
              <Connection />
              {{ t('domain.title') }}
              <el-tag v-if="!isRootUser" size="small" effect="plain">
                root
              </el-tag>
            </span>
          </template>
          <DomainConfigsPanel v-if="activeTab === 'domains'" />
        </el-tab-pane>

        <el-tab-pane name="assignments">
          <template #label>
            <span class="tab-label">
              <Link />
              {{ t('assignment.title') }}
            </span>
          </template>
          <AssignmentsPanel v-if="activeTab === 'assignments'" />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Connection,
  Link,
  OfficeBuilding,
} from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AssignmentsPanel from '../components/AssignmentsPanel.vue'
import DomainConfigsPanel from '../components/DomainConfigsPanel.vue'
import OrganizationConfigsPanel from '../components/OrganizationConfigsPanel.vue'
import { useAuthSession } from '../composables/useAuthSession'

const { t } = useI18n()
const { isRootUser } = useAuthSession()
const route = useRoute()
const router = useRouter()
const tabs = ['organizations', 'domains', 'assignments'] as const
type WorkspaceTab = (typeof tabs)[number]

function isWorkspaceTab(value: unknown): value is WorkspaceTab {
  return tabs.includes(value as WorkspaceTab)
}

const activeTab = ref<WorkspaceTab>(
  isWorkspaceTab(route.query.view)
    ? route.query.view
    : 'organizations',
)

watch(activeTab, (view) => {
  if (route.query.view === view) return
  void router.replace({
    query: {
      ...route.query,
      view,
    },
  })
})

watch(
  () => route.query.view,
  (view) => {
    if (isWorkspaceTab(view) && activeTab.value !== view) {
      activeTab.value = view
    }
  },
)
</script>
