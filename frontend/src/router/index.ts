import {
  createRouter,
  createWebHistory,
  type RouteLocationNormalized,
} from 'vue-router'
import { useAuthSession } from '../composables/useAuthSession'
import { notifyHostPluginUrlChanged } from '../utils/hostEvents'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    public?: boolean
    requiresAdmin?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/not-allowed',
      name: 'NotAllowed',
      component: () => import('../views/NotAllowed.vue'),
      meta: { public: true, title: '无权限访问' },
    },
    {
      path: '/',
      component: () => import('../layout/AppLayout.vue'),
      redirect: '/configs',
      children: [
        {
          path: 'configs',
          name: 'WhiteLabelWorkspace',
          component: () => import('../views/WhiteLabelWorkspace.vue'),
          meta: {
            title: '白牌配置',
            requiresAdmin: true,
          },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/configs',
    },
  ],
})

export async function adminOnlyGuard(
  to: Pick<RouteLocationNormalized, 'meta' | 'fullPath'>,
) {
  if (to.meta.public || !to.meta.requiresAdmin) return true

  const { fetchSession, hasAdminAccess, isAuthenticated } = useAuthSession()
  try {
    await fetchSession()
    if (hasAdminAccess.value) return true
    return {
      name: 'NotAllowed',
      query: { reason: isAuthenticated.value ? 'role' : 'session' },
    }
  } catch {
    return {
      name: 'NotAllowed',
      query: { reason: 'session' },
    }
  }
}

router.beforeEach(adminOnlyGuard)
router.afterEach((to) => notifyHostPluginUrlChanged(to.fullPath))

export default router
