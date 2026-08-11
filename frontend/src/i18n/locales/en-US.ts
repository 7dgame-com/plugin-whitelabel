export default {
  plugin: {
    name: 'White-label Configuration',
    description: 'Manage and deliver Unity white-label JSON by request domain',
  },
  common: {
    search: 'Search',
    edit: 'Edit',
    view: 'View',
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    actions: 'Actions',
    enabled: 'Enabled',
    disabled: 'Disabled',
    noData: 'No data',
    required: 'This field is required',
    revision: 'Revision',
    status: 'Status',
    jsonKeyCount: '{count} top-level keys',
    jsonInvalid: 'Configuration must be a valid JSON object matching the schema',
    jsonFormat: 'Format',
    jsonCompact: 'Compact',
    jsonValid: 'JSON and schema are valid',
    jsonSyntaxInvalid: 'Invalid JSON syntax',
    jsonObjectRequired: 'The top-level value must be a JSON object',
    jsonSecurityInvalid: 'Security validation failed: {detail}',
    jsonSchemaInvalid: 'Schema validation failed: {detail}',
    jsonDomainSchema: 'White-label content schema · key stored separately',
    saveSuccess: 'Configuration saved',
    saveFailed: 'Save failed; check the content or revision conflict',
    statusUpdated: 'Status updated',
    statusFailed: 'Status update failed; refresh and retry',
  },
  workspace: {
    modelLabel: 'Domain-only model',
    modelTitle: 'One domain resolution returns one white-label configuration',
    modelDescription:
      'The client sends its request domain. The plugin resolves a deterministic configuration key and returns one self-contained Unity white-label JSON document.',
    accessDomain: 'Request domain',
    configKey: 'Configuration key',
    unityJson: 'Unity white-label JSON',
  },
  domain: {
    scopeLabel: 'Domain white-label configuration',
    title: 'Domain configurations',
    description:
      'The domain configuration key is stored separately. JSON contains editable white-label content only; the backend composes name for Unity responses.',
    rootScope:
      'Root selects a key from the main-frontend catalog to create a record, then edits content and toggles its status.',
    adminScope:
      'Admins can view the domain list and complete JSON, but cannot create, edit, toggle, or import.',
    defaultMatch: 'Default when no more specific key matches',
    subdomainMatch: 'May also match supported subdomain candidates of {domain}',
    descriptionField: 'Description',
    configKey: 'Domain configuration key',
    configKeyImmutable:
      'The key is immutable after creation. Add new keys to the main-frontend domain catalog first.',
    unityJson: 'Unity white-label JSON',
    json: 'Complete Unity white-label JSON',
    jsonContent: 'White-label JSON content (without name)',
    add: 'Add domain configuration',
    createTitle: 'Add domain white-label configuration',
    editTitle: 'Edit domain white-label configuration',
    viewTitle: 'View domain white-label JSON',
    searchPlaceholder: 'Search description or domain configuration key',
    loadFailed: 'Failed to load domain configurations',
    editBoundary:
      'The configuration key is stored separately and immutable. Edit content only; JSON must not contain name.',
    readOnlyBoundary:
      'This is a read-only view. Only root can edit, import, or toggle domain configurations.',
    importTitle: 'Select a main-frontend domain configuration key',
    importOneTimeHint:
      'Selection automatically loads its JSON content. The selection is the only key and must not be repeated in JSON.',
    importSelectPlaceholder: 'Search main-frontend key or description',
    importNoData: 'No main-frontend domain configuration is available',
    importMissingConfig: 'The API did not return copyable JSON',
    importLoadFailed: 'Failed to load the main-frontend domain catalog',
    importCreateUnavailable:
      'Keys can only come from the main-frontend catalog; creation is unavailable until the catalog recovers.',
    importSelectionRequired:
      'Select an importable domain configuration key from the main-frontend catalog first.',
    importSource: 'Source: {source}',
    importMaterialized: 'Materialized during import: {values}',
    importWarnings: 'Import notes:',
    disableBeforeInactive:
      'This domain configuration is enabled. Disable it in the list before setting JSON is_active to false.',
  },
  auth: {
    deniedTitle: 'Access denied',
    deniedDescription: 'Only root or admin users can use this plugin.',
    sessionFailed:
      'The current session could not be verified. Return to the host and retry.',
  },
}
