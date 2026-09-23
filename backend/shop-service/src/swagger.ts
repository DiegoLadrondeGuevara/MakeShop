import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';

const bearerAuth = [{ bearerAuth: [] }];

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Shop Service API',
      version: '1.0.0',
      description: 'API de tiendas, membresías y configuración visual de MakeShop.',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    paths: {
      '/health': {
        get: {
          summary: 'Estado del servicio',
          tags: ['Health'],
          responses: { '200': { description: 'Servicio disponible' } },
        },
      },
      '/healthcheck': {
        get: {
          summary: 'Health check del servicio',
          tags: ['Health'],
          responses: { '200': { description: 'Servicio disponible' } },
        },
      },
      '/shops': {
        get: {
          summary: 'Lista las tiendas',
          tags: ['Shops'],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          ],
          responses: { '200': { description: 'Listado paginado de tiendas' } },
        },
      },
      '/openshop/shop': {
        post: {
          summary: 'Crea una tienda para el owner autenticado',
          tags: ['Shops'],
          security: bearerAuth,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['shopName', 'phoneNumber'],
                  properties: {
                    shopName: { type: 'string' },
                    phoneNumber: { type: 'string' },
                    themeKey: { type: 'string', enum: ['dev', 'enterprise', 'ghetto'] },
                    config: { type: 'object', additionalProperties: true },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Tienda creada' },
            '400': { description: 'Datos inválidos' },
            '401': { description: 'No autenticado' },
            '403': { description: 'Sin permisos o límite del plan alcanzado' },
            '409': { description: 'Nombre de tienda en uso' },
          },
        },
      },
      '/shop/name/{shopName}': {
        get: {
          summary: 'Busca una tienda por nombre',
          tags: ['Shops'],
          parameters: [{ name: 'shopName', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Tienda encontrada' },
            '404': { description: 'Tienda no encontrada' },
          },
        },
      },
      '/shop/owner/{ownerId}': {
        get: {
          summary: 'Lista las tiendas de un owner',
          tags: ['Shops'],
          parameters: [{ name: 'ownerId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Tiendas del owner' } },
        },
      },
      '/shop/{shopId}': {
        get: {
          summary: 'Obtiene una tienda por ID',
          tags: ['Shops'],
          parameters: [{ name: 'shopId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Tienda encontrada' },
            '404': { description: 'Tienda no encontrada' },
          },
        },
        patch: {
          summary: 'Actualiza nombre o teléfono de una tienda',
          tags: ['Shops'],
          security: bearerAuth,
          parameters: [{ name: 'shopId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    shopName: { type: 'string' },
                    phoneNumber: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Tienda actualizada' },
            '401': { description: 'No autenticado' },
            '403': { description: 'La tienda no pertenece al usuario' },
            '404': { description: 'Tienda no encontrada' },
          },
        },
      },
      '/shop/id/{shopId}': {
        delete: {
          summary: 'Elimina una tienda del owner autenticado',
          tags: ['Shops'],
          security: bearerAuth,
          parameters: [{ name: 'shopId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Tienda eliminada' },
            '401': { description: 'No autenticado' },
            '403': { description: 'La tienda no pertenece al usuario' },
            '404': { description: 'Tienda no encontrada' },
          },
        },
      },
      '/shop/{shopId}/theme': {
        get: {
          summary: 'Obtiene el tema público de una tienda',
          tags: ['Themes'],
          parameters: [{ name: 'shopId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Configuración de tema' },
            '404': { description: 'Tienda no encontrada' },
          },
        },
        put: {
          summary: 'Actualiza el tema de una tienda',
          tags: ['Themes'],
          security: bearerAuth,
          parameters: [{ name: 'shopId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    themeKey: { type: 'string', enum: ['dev', 'enterprise', 'ghetto'] },
                    config: { type: 'object', additionalProperties: true },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Tema actualizado' },
            '401': { description: 'No autenticado' },
            '403': { description: 'Sin permisos sobre la tienda' },
            '404': { description: 'Tienda no encontrada' },
          },
        },
      },
      '/shops/{id}/memberships': {
        post: {
          summary: 'Agrega un usuario a una tienda',
          tags: ['Memberships'],
          security: bearerAuth,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['userId', 'role'],
                  properties: {
                    userId: { type: 'string' },
                    role: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Membresía creada' },
            '400': { description: 'Datos inválidos' },
          },
        },
      },
    },
  },
  apis: [],
};

const swaggerSpec = swaggerJSDoc(options);

export const swaggerDocs = (app: Application, port: number) => {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  console.log(`Swagger Docs available at http://localhost:${port}/docs`);
};
