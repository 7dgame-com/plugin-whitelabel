<template>
  <div class="centered-page">
    <el-result
      icon="warning"
      :title="t('auth.deniedTitle')"
      :sub-title="description"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const { t } = useI18n()
const description = computed(() =>
  route.query.reason === 'session'
    ? t('auth.sessionFailed')
    : t('auth.deniedDescription'),
)
</script>
