export default {
  plugin: {
    name: 'White-label Configuration',
    description:
      'Manage buyer organizations, agent domains, and their authorized assignments',
  },
  common: {
    search: 'Search',
    create: 'Create',
    edit: 'Edit',
    save: 'Save',
    cancel: 'Cancel',
    actions: 'Actions',
    enabled: 'Enabled',
    disabled: 'Disabled',
    copy: 'Copy',
    close: 'Close',
    noData: 'No data',
    required: 'This field is required',
    revision: 'Revision',
    status: 'Status',
    jsonObject: 'Independent JSON',
    jsonKeyCount: '{count} top-level keys',
    jsonPlaceholder: 'Enter one complete, valid JSON object',
    jsonInvalid:
      'Configuration must be a valid JSON object, not an array or primitive',
    jsonFormat: 'Format',
    jsonCompact: 'Compact',
    jsonValid: 'JSON and schema are valid',
    jsonSyntaxInvalid: 'Invalid JSON syntax',
    jsonObjectRequired: 'The top-level value must be a JSON object',
    jsonSecurityInvalid: 'Security validation failed: {detail}',
    jsonSchemaInvalid: 'Schema validation failed: {detail}',
    jsonObjectSchema: 'Organization schema · top-level JSON object',
    jsonDomainSchema: 'Domain schema · main-frontend StaticDomainConfig',
    saveSuccess: 'Configuration saved',
    saveFailed: 'Save failed; check the content or revision conflict',
    statusUpdated: 'Status updated',
    statusFailed: 'Status update failed; refresh and retry',
  },
  workspace: {
    modelLabel: 'Three-entity model',
    modelTitle: 'Independent data ownership; assignments only reference',
    modelDescription:
      'Buyer organization JSON and agent domain JSON are stored and versioned separately. Assignments neither copy nor merge them.',
  },
  organization: {
    buyerLabel: 'Buyer organization',
    title: 'Organization JSON',
    description:
      'Stores Unity settings owned by the buyer/customer organization, never agent-domain settings.',
    buyerBoundary:
      'Edit only the buyer organization JSON here. Agent domain JSON is managed separately and is never merged into this record.',
    rootScope: 'Root can view and manage every organization configuration.',
    adminScope:
      'Admins can only create, edit, and toggle organizations returned by verify-token.',
    organization: 'Host organization',
    selectOrganization: 'Select buyer organization',
    json: 'Buyer organization JSON',
    add: 'Add organization JSON',
    createTitle: 'Add buyer organization JSON',
    editTitle: 'Edit buyer organization JSON',
    searchPlaceholder: 'Search organization name or key',
    organizationUnavailable:
      'The selected organization is outside your authorized scope',
    loadFailed: 'Failed to load organization configurations',
    optionsFailed: 'Could not load the complete organization list',
  },
  domain: {
    agentLabel: 'Agent domain configuration',
    title: 'Domain JSON',
    description:
      'Stores agent settings aligned with the main frontend domains/*.json. name is a domain-family configuration key, not an exact request hostname.',
    agentBoundary:
      'Edit one complete StaticDomainConfig JSON object. name is the main-frontend key (for example dev.xrugc.com), description is the list label, and buyer organization JSON stays separate.',
    rootScope:
      'Domain JSON is a global agent-side resource; only root can create, edit, or toggle it.',
    rootOnlyTitle: 'Domain JSON is root-only',
    rootOnlyDescription:
      'Admins do not read standalone agent-domain configuration. They only see assignments in their organization scope; QR is available only when all three layers are enabled.',
    descriptionField: 'Configuration description',
    configKey: 'Main-frontend domain configuration key',
    json: 'Agent domain JSON',
    add: 'Add domain JSON',
    createTitle: 'Add agent domain JSON',
    editTitle: 'Edit agent domain JSON',
    searchPlaceholder: 'Search description or domain configuration key',
    loadFailed: 'Failed to load domain configurations',
    disableBeforeInactive:
      'This domain configuration is enabled. Disable it in the list before setting JSON is_active to false.',
  },
  assignment: {
    deliveryLabel: 'Authorized assignment',
    title: 'Assignments & QR',
    description:
      'Authorizes one buyer organization on one agent domain configuration key; the backend provides the QR URL.',
    referenceOnly:
      'An assignment stores only organizationId and domainId references. It never copies or merges either JSON. New assignments are disabled.',
    rootScope:
      'Only root can create or toggle assignments and can view all assignments.',
    adminScope:
      'Admins have read-only access to every assignment in their organization scope, including disabled ones. QR requires all three layers to be enabled.',
    organizationConfig: 'Buyer organization JSON',
    domainConfig: 'Agent domain JSON',
    assignmentLayer: 'Assignment',
    organizationLayer: 'Organization',
    domainLayer: 'Domain',
    selectOrganization: 'Select organization configuration',
    selectDomain: 'Select domain configuration',
    add: 'Add assignment',
    createTitle: 'Add organization × domain assignment',
    searchPlaceholder: 'Search organization or domain',
    qrCode: 'QR code',
    viewQr: 'View QR',
    loadFailed: 'Failed to load assignments',
    optionsFailed: 'Failed to load organization or domain options',
    createSuccess: 'Assignment created and left disabled',
    createFailed: 'Failed to create assignment',
  },
  qr: {
    title: 'Unity white-label configuration QR',
    hint:
      'The QR value is the complete yii3-a1 HTTPS GET URL returned by the backend. The frontend neither constructs nor calls A1.',
    value: 'Complete A1 URL',
    unavailable: 'QR code unavailable',
    unavailableHint:
      'Only enabled, authorized assignments can expose a valid backend-provided HTTPS QR URL.',
    copySuccess: 'QR URL copied',
    copyFailed: 'Copy failed; please copy it manually',
  },
  auth: {
    deniedTitle: 'Access denied',
    deniedDescription: 'Only root or admin users can use this plugin.',
    sessionFailed:
      'The current session could not be verified. Return to the host and retry.',
  },
}
