import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

describe('domain-only deployment contracts', () => {
  it('keeps the host route admin-only while describing a domain-only plugin', () => {
    const manifest = JSON.parse(
      read('../../public/plugin-manifest.json'),
    ) as Record<string, unknown>
    const registration = JSON.parse(
      read('../../plugins.json.example'),
    ) as Record<string, unknown>

    expect(manifest.accessScope).toBe('admin-only')
    expect(registration.accessScope).toBe('admin-only')
    expect(JSON.stringify(manifest.descriptionI18n)).toContain('域名')
    expect(JSON.stringify(manifest.descriptionI18n)).not.toContain('组织')
    expect(JSON.stringify(manifest.descriptionI18n)).not.toContain('二维码')
  })

  it('proxies only the host session API, plugin management API, and public resolver', () => {
    const nginx = read('../../nginx.conf.template')
    const entrypoint = read('../../docker-entrypoint.sh')
    expect(nginx).toContain('location /api/')
    expect(nginx).toContain('proxy_pass ${APP_API_1_URL}')
    expect(nginx).toContain('location ^~ /backend/api/')
    expect(nginx).toContain('location ^~ /backend/')
    expect(nginx).toContain('proxy_pass ${APP_BACKEND_1_URL}')
    expect(nginx).toContain('location = /v1/white-label-configs')
    expect(nginx).not.toMatch(/location \^~ \/backend\/ \{[\s\S]*?proxy_pass/)
    expect(entrypoint).toContain('APP_API_2_URL')
    expect(entrypoint).toContain('APP_BACKEND_2_URL')
    expect(entrypoint).toContain('error_page 502 503 504 = @api_failover')
    expect(entrypoint).toContain('error_page 502 503 504 = @backend_failover')
  })

  it('documents only the access-domain to Unity JSON model', () => {
    const readme = read('../../README.md')
    expect(readme).toContain('访问域名 → 配置键 → Unity 白牌 JSON')
    expect(readme).not.toContain('organizationId')
    expect(readme).not.toContain('assignment')
    expect(readme).not.toContain('?o=')
  })

  it('pins all writes to the only supported schema version', () => {
    const domainPanel = read('../components/DomainConfigsPanel.vue')

    expect(domainPanel).not.toContain(
      'schemaVersion: editing.value.schemaVersion',
    )
    expect(domainPanel.match(/schemaVersion: 1/g)).toHaveLength(2)
  })

  it('uses one domain-schema JSON editor for Unity snapshots', () => {
    const domainDialog = read('../components/DomainConfigDialog.vue')
    const editor = read('../components/JsonObjectEditor.vue')
    const schema = read('../domain/jsonObject.ts')

    expect(domainDialog).toContain('<JsonObjectEditor')
    expect(domainDialog).toContain('configKey: config.name')
    expect(domainDialog).toContain(':read-only="readOnly"')
    expect(domainDialog).toContain('props.record?.enabled && !config.is_active')
    expect(editor).toContain('basicSetup')
    expect(editor).toContain('jsonParseLinter')
    expect(editor).toContain('formatJsonObjectText')
    expect(editor).toContain('EditorView.editable.of(!props.readOnly)')
    expect(schema).toContain('const domainSchema')
    expect(schema).not.toContain('organizationSchema')
  })

  it('keeps import and all writes root-only while admins can view JSON', () => {
    const domainDialog = read('../components/DomainConfigDialog.vue')
    const domainPanel = read('../components/DomainConfigsPanel.vue')

    expect(domainDialog).toContain('v-if="!readOnly"')
    expect(domainDialog).toContain('ElMessageBox.confirm')
    expect(domainPanel).toContain('v-if="isRootUser"')
    expect(domainPanel).toContain(':read-only="editorReadOnly"')
    expect(domainPanel).toContain('editorReadOnly.value = !isRootUser.value')
    expect(domainPanel).not.toContain('if (!isRootUser.value) return\n  loading')
  })

  it('renders one workspace without tabs or plugin-generated QR', () => {
    const workspace = read('../views/WhiteLabelWorkspace.vue')
    const packageJson = read('../../package.json')

    expect(workspace).toContain('<DomainConfigsPanel />')
    expect(workspace).toContain('workspace.accessDomain')
    expect(workspace).toContain('workspace.configKey')
    expect(workspace).toContain('workspace.unityJson')
    expect(workspace).not.toContain('<el-tabs')
    expect(packageJson).not.toContain('qrcode.vue')
    expect(
      existsSync(new URL('../components/WhiteLabelQrDialog.vue', import.meta.url)),
    ).toBe(false)
  })

  it('verifies only identity and roles from the host session', () => {
    const session = read('../api/session.ts')
    expect(session).toContain("mainApi.get('/plugin/verify-token')")
    expect(session).not.toContain('/organization/list')
    expect(session).not.toContain('payload?.organizations')
  })
})
