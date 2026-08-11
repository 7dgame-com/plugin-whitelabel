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
    jsonInvalid: 'Configuration must be a valid and safe JSON object',
    jsonFormat: 'Format',
    jsonCompact: 'Compact',
    jsonValid: 'JSON is valid',
    jsonSyntaxInvalid: 'Invalid JSON syntax',
    jsonObjectRequired: 'The top-level value must be a JSON object',
    jsonSecurityInvalid: 'Security validation failed: {detail}',
    jsonSchemaInvalid: 'JSON validation failed: {detail}',
    jsonDomainSchema: 'Independent white-label JSON · key selected separately',
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
      'Select a key from the read-only main-frontend catalog, then author independent white-label JSON that is returned unchanged.',
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
    jsonContent: 'Independent white-label JSON content',
    add: 'Add domain configuration',
    createTitle: 'Add domain white-label configuration',
    editTitle: 'Edit domain white-label configuration',
    viewTitle: 'View domain white-label JSON',
    searchPlaceholder: 'Search description or domain configuration key',
    loadFailed: 'Failed to load domain configurations',
    editBoundary:
      'The key is stored separately and immutable. This JSON belongs to the plugin; name may be used as ordinary brand content.',
    readOnlyBoundary:
      'This is a read-only view. Only root can edit, import, or toggle domain configurations.',
    importTitle: 'Select a key from the read-only main-frontend catalog',
    importOneTimeHint:
      'Only key and description are read. Main-frontend JSON is never loaded, copied, or modified; enter independent JSON below.',
    importSelectPlaceholder: 'Search main-frontend key or description',
    importNoData: 'No main-frontend configuration key is available',
    importMissingConfig: 'The API did not return copyable JSON',
    importLoadFailed: 'Failed to load the main-frontend domain catalog',
    importCreateUnavailable:
      'Keys can only come from the main-frontend catalog; creation is unavailable until the catalog recovers.',
    importSelectionRequired:
      'Select an active key from the read-only main-frontend catalog first.',
    importSource: 'Source: {source}',
  },
  auth: {
    deniedTitle: 'Access denied',
    deniedDescription: 'Only root or admin users can use this plugin.',
    sessionFailed:
      'The current session could not be verified. Return to the host and retry.',
  },
}
