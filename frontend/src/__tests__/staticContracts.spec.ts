import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

describe('deployment contracts', () => {
  it('registers the plugin as admin-only', () => {
    const manifest = JSON.parse(
      read('../../public/plugin-manifest.json'),
    ) as Record<string, unknown>
    const registration = JSON.parse(
      read('../../plugins.json.example'),
    ) as Record<string, unknown>
    const systemAdminRegistration = JSON.parse(
      read('../../../system-admin-registration.example.json'),
    ) as Record<string, unknown>

    expect(manifest.accessScope).toBe('admin-only')
    expect(registration.accessScope).toBe('admin-only')
    expect(systemAdminRegistration.access_scope).toBe('admin-only')
    expect(systemAdminRegistration.organization_name).toBeNull()
    expect(systemAdminRegistration).not.toHaveProperty('accessScope')
  })

  it('proxies only the host API and plugin backend', () => {
    const nginx = read('../../nginx.conf.template')
    expect(nginx).toContain('location /api/')
    expect(nginx).toContain('proxy_pass ${APP_API_1_URL}')
    expect(nginx).toContain('location ^~ /backend/api/')
    expect(nginx).toContain('location ^~ /backend/')
    expect(nginx).toContain('proxy_pass ${APP_BACKEND_1_URL}')
    expect(nginx).not.toMatch(
      /location \^~ \/backend\/ \{[\s\S]*?proxy_pass/,
    )
  })

  it('documents the separated reference-only model', () => {
    const readme = read('../../README.md')
    expect(readme).toContain('organizationId + domainId')
    expect(readme).toContain('不复制、不拼接')
  })

  it('pins all writes to the only supported schema version', () => {
    const organizationPanel = read(
      '../components/OrganizationConfigsPanel.vue',
    )
    const domainPanel = read('../components/DomainConfigsPanel.vue')

    expect(organizationPanel).not.toContain(
      'schemaVersion: editing.value.schemaVersion',
    )
    expect(domainPanel).not.toContain(
      'schemaVersion: editing.value.schemaVersion',
    )
    expect(organizationPanel.match(/schemaVersion: 1/g)).toHaveLength(2)
    expect(domainPanel.match(/schemaVersion: 1/g)).toHaveLength(2)
  })

  it('uses one schema-aware JSON editor for both independent configs', () => {
    const organizationDialog = read(
      '../components/OrganizationConfigDialog.vue',
    )
    const domainDialog = read('../components/DomainConfigDialog.vue')
    const editor = read('../components/JsonObjectEditor.vue')

    expect(organizationDialog).toContain('<JsonObjectEditor')
    expect(organizationDialog).toContain('schema="organization"')
    expect(domainDialog).toContain('<JsonObjectEditor')
    expect(domainDialog).toContain('schema="domain"')
    expect(domainDialog).toContain('configKey: config.name')
    expect(domainDialog).toContain(
      'props.record?.enabled && !config.is_active',
    )
    expect(domainDialog).not.toContain('hostnameValidationMessage')
    expect(editor).toContain('basicSetup')
    expect(editor).toContain('jsonParseLinter')
    expect(editor).toContain('formatJsonObjectText')
    expect(editor).toContain('syntaxHighlightTheme')
    expect(editor).toContain('--json-syntax-string')
    expect(editor).toContain("'aria-describedby': statusId")
  })
})
