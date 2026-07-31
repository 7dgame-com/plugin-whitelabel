<template>
  <div class="app-shell">
    <header class="app-header">
      <div>
        <h1>{{ t('plugin.name') }}</h1>
        <p>{{ t('plugin.description') }}</p>
      </div>

      <div v-if="user" class="session-badge">
        <div class="session-identity">
          <strong>{{ user.nickname || user.username }}</strong>
          <span>{{ user.username }}</span>
        </div>
        <div class="session-roles">
          <el-tag
            v-for="role in user.roles"
            :key="role"
            size="small"
            effect="plain"
          >
            {{ role }}
          </el-tag>
        </div>
      </div>
    </header>

    <main class="app-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAuthSession } from '../composables/useAuthSession'

const { t } = useI18n()
const { user } = useAuthSession()
</script>
