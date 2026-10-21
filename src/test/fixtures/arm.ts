import { TEST_SUB, TEST_TENANT } from '@/test/helpers/fakeJwt'
import apiPolicyXml from './policies/api-policy.xml?raw'
import createOrderPolicyXml from './policies/create-order-policy.xml?raw'
import globalPolicyXml from './policies/global-policy.xml?raw'

/**
 * A fictional APIM setup in raw ARM response shapes (APIM api-version 2024-05-01), served by the
 * MSW handlers in tests and in `pnpm dev:demo`. It follows the target pattern (PROJECT_PLAN.md §1):
 * `orders-api` carries the reference policy, `inventory-api` has no policy and uses its serviceUrl.
 */

export const RESOURCE_GROUP = 'rg-contoso-apim'
export const SERVICE_NAME = 'apim-contoso'
export const SERVICE_ID = `/subscriptions/${TEST_SUB}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.ApiManagement/service/${SERVICE_NAME}`

/** APIM's user-assigned identity; its clientId is the `client-id` in `api-policy.xml`. */
export const APIM_IDENTITY = {
  resourceId: `/subscriptions/${TEST_SUB}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-apim-contoso`,
  clientId: '00000000-0000-0000-0000-000000000011',
  principalId: '00000000-0000-0000-0000-000000000012',
}

const ORDERS_APP_RESOURCE_ID = `/subscriptions/${TEST_SUB}/resourceGroups/rg-contoso-orders/providers/Microsoft.Web/sites/app-contoso-orders`

const operation = (
  apiId: string,
  name: string,
  displayName: string,
  method: string,
  urlTemplate: string,
) => ({
  id: `${SERVICE_ID}/apis/${apiId}/operations/${name}`,
  type: 'Microsoft.ApiManagement/service/apis/operations',
  name,
  properties: { displayName, method, urlTemplate, templateParameters: [], responses: [] },
})

const api = (name: string, displayName: string, path: string, serviceUrl: string) => ({
  id: `${SERVICE_ID}/apis/${name}`,
  type: 'Microsoft.ApiManagement/service/apis',
  name,
  properties: {
    displayName,
    apiRevision: '1',
    subscriptionRequired: false,
    serviceUrl,
    path,
    protocols: ['https'],
    isCurrent: true,
  },
})

const policy = (scopeId: string, xml: string) => ({
  id: `${scopeId}/policies/policy`,
  type: 'Microsoft.ApiManagement/service/policies',
  name: 'policy',
  properties: { format: 'rawxml', value: xml },
})

export const armFixtures = {
  subscriptions: [
    {
      id: `/subscriptions/${TEST_SUB}`,
      subscriptionId: TEST_SUB,
      tenantId: TEST_TENANT,
      displayName: 'Contoso Integration',
      state: 'Enabled',
    },
  ],
  services: [
    {
      id: SERVICE_ID,
      name: SERVICE_NAME,
      type: 'Microsoft.ApiManagement/service',
      location: 'Sweden Central',
      sku: { name: 'Developer', capacity: 1 },
      identity: {
        type: 'SystemAssigned, UserAssigned',
        principalId: '00000000-0000-0000-0000-000000000013',
        tenantId: TEST_TENANT,
        userAssignedIdentities: {
          [APIM_IDENTITY.resourceId]: {
            principalId: APIM_IDENTITY.principalId,
            clientId: APIM_IDENTITY.clientId,
          },
        },
      },
      properties: {
        publisherEmail: 'apim@contoso.example.net',
        publisherName: 'Contoso',
        gatewayUrl: 'https://apim-contoso.example.net',
        provisioningState: 'Succeeded',
      },
    },
  ],
  apis: [
    api('orders-api', 'Orders API', 'orders', 'https://orders-default.contoso.example.net'),
    api('inventory-api', 'Inventory API', 'inventory', 'http://inventory.contoso.example.net'),
  ],
  operations: {
    'orders-api': [
      operation('orders-api', 'list-orders', 'List orders', 'GET', '/orders'),
      operation('orders-api', 'create-order', 'Create order', 'POST', '/orders'),
    ],
    'inventory-api': [
      operation('inventory-api', 'get-stock', 'Get stock level', 'GET', '/stock/{sku}'),
    ],
  } as Readonly<Record<string, readonly unknown[]>>,
  globalPolicy: policy(SERVICE_ID, globalPolicyXml),
  apiPolicies: {
    'orders-api': policy(`${SERVICE_ID}/apis/orders-api`, apiPolicyXml),
  } as Readonly<Record<string, unknown>>,
  operationPolicies: {
    'orders-api/create-order': policy(
      `${SERVICE_ID}/apis/orders-api/operations/create-order`,
      createOrderPolicyXml,
    ),
  } as Readonly<Record<string, unknown>>,
  backends: {
    'orders-backend': {
      id: `${SERVICE_ID}/backends/orders-backend`,
      type: 'Microsoft.ApiManagement/service/backends',
      name: 'orders-backend',
      properties: {
        title: 'Orders service',
        description: 'App Service hosting the orders domain',
        url: 'https://app-contoso-orders.example.net/api',
        protocol: 'http',
        type: 'Single',
        resourceId: `https://management.azure.com${ORDERS_APP_RESOURCE_ID}`,
        tls: { validateCertificateChain: true, validateCertificateName: true },
        credentials: {
          header: { 'x-functions-key': ['{{orders-function-key}}'] },
          query: {},
        },
      },
    },
  } as Readonly<Record<string, unknown>>,
}
