<template>
  <section class="workspace-page">
    <el-card shadow="never" class="model-card">
      <div class="model-summary">
        <div>
          <span class="eyebrow">{{ t('workspace.modelLabel') }}</span>
          <h2>{{ t('workspace.modelTitle') }}</h2>
          <p>{{ t('workspace.modelDescription') }}</p>
        </div>

        <div class="domain-resolution-flow" aria-label="domain white-label flow">
          <span class="flow-chip request">{{ t('workspace.accessDomain') }}</span>
          <span aria-hidden="true">→</span>
          <span class="flow-chip key">{{ t('workspace.configKey') }}</span>
          <span aria-hidden="true">→</span>
          <span class="flow-chip json">{{ t('workspace.unityJson') }}</span>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="workspace-card">
      <DomainConfigsPanel />
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import DomainConfigsPanel from '../components/DomainConfigsPanel.vue'

const { t } = useI18n()
</script>
