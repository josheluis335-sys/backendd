import { METHOD_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import { getMetadataStorage } from 'class-validator';
import { DiscoveryService, Reflector } from '@nestjs/core';
import type {
  OpenAPIObject,
  OperationObject,
  ResponseObject,
  SchemaObject,
} from '@nestjs/swagger';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../common/constants/roles.constant.js';

const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'] as const;

export function completeOpenApiDocument(
  document: OpenAPIObject,
  discovery: DiscoveryService,
  reflector: Reflector,
): OpenAPIObject {
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas.ApiErrorResponse = {
    type: 'object',
    description: 'Error seguro en español; nunca incluye stack trace ni credenciales.',
    required: ['statusCode', 'message', 'path'],
    properties: {
      statusCode: { type: 'integer', example: 400 },
      message: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
      path: { type: 'string', example: '/api/tickets' },
    },
  };

  for (const wrapper of discovery.getControllers()) {
    const controller = wrapper.metatype;
    if (!controller) continue;
    const controllerName = controller.name;
    for (const methodName of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = Reflect.get(controller.prototype, methodName);
      if (typeof handler !== 'function') continue;
      const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler);
      if (typeof requestMethod !== 'number') continue;

      const publicRoute = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        handler,
        controller,
      ]);
      const roles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        handler,
        controller,
      ]);
      const operationId = `${controllerName}_${methodName}`;
      const operation = findOperation(document, operationId);
      if (!operation) continue;

      operation.description = [
        operation.description,
        publicRoute
          ? 'Acceso: público.'
          : `Autenticación: JWT. Roles permitidos: ${(roles ?? []).join(', ')}.`,
      ]
        .filter(Boolean)
        .join('\n\n');
      if (publicRoute) delete operation.security;

      for (const [status, description] of [
        ['400', 'Solicitud inválida; el mensaje está sanitizado.'],
        ['401', 'Autenticación requerida o sesión no válida.'],
        ['403', 'El rol autenticado no está autorizado.'],
        ['404', 'No se encontró el recurso solicitado.'],
        ['409', 'Conflicto con el estado actual del recurso.'],
        ['500', 'Error interno genérico, sin detalles técnicos.'],
      ]) {
        if (!operation.responses[status]) {
          operation.responses[status] = errorResponse(description);
        }
      }
      for (const response of Object.values(operation.responses)) {
        if (response && !('$ref' in response) && !response.description) {
          response.description = 'Respuesta de la operación.';
        }
      }
      for (const [status, response] of Object.entries(operation.responses)) {
        if (
          Number(status) >= 400 &&
          response &&
          !('$ref' in response) &&
          !response.content
        ) {
          response.content = {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiErrorResponse' },
            },
          };
        }
      }

      const routeArguments = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        controller,
        methodName,
      ) as Record<string, unknown> | undefined;
      const parameterTypes = Reflect.getMetadata(
        'design:paramtypes',
        controller.prototype,
        methodName,
      ) as unknown[] | undefined;
      for (const key of Object.keys(routeArguments ?? {})) {
        const [rawKind, rawIndex] = key.split(':');
        const index = Number(rawIndex);
        const dto = parameterTypes?.[index];
        if (
          !Number.isInteger(index) ||
          typeof dto !== 'function' ||
          dto === Object ||
          dto === String ||
          dto === Number
        ) {
          continue;
        }
        const kind = Number(rawKind);
        if (kind !== RouteParamtypes.BODY && kind !== RouteParamtypes.QUERY) continue;
        const schema = addDtoSchema(document, dto);
        if (kind === RouteParamtypes.QUERY) {
          addQueryParameters(operation, schema);
        } else if (
          controllerName === 'PublicoController' &&
          methodName === 'consultar'
        ) {
          operation.requestBody = {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['numeroCaso', 'correo'],
                  properties: {
                    numeroCaso: { type: 'string', pattern: '^(INC|REQ)\\d{4,}$' },
                    correo: { type: 'string', format: 'email', maxLength: 254 },
                  },
                },
              },
            },
          };
        }
      }
    }
  }
  return document;
}

function findOperation(
  document: OpenAPIObject,
  operationId: string,
): OperationObject | undefined {
  for (const pathItem of Object.values(document.paths)) {
    for (const method of methods) {
      const operation = pathItem[method];
      if (operation?.operationId === operationId) return operation;
    }
  }
  return undefined;
}

function errorResponse(description: string): ResponseObject {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiErrorResponse' },
      },
    },
  };
}

function addDtoSchema(document: OpenAPIObject, dto: Function): SchemaObject {
  const schemas = document.components?.schemas;
  const existing = schemas?.[dto.name];
  const schema: SchemaObject =
    existing && !('$ref' in existing) ? existing : { type: 'object' };
  schema.type = 'object';
  const propertyNames = new Set<string>();
  const required = new Set<string>();
  const validationMetadata = getMetadataStorage().getTargetValidationMetadatas(
    dto,
    '',
    false,
    false,
  );

  for (const metadata of validationMetadata) {
    propertyNames.add(metadata.propertyName);
    if (metadata.name !== 'isOptional') required.add(metadata.propertyName);
  }

  const properties: Record<string, SchemaObject> = {};
  for (const propertyName of propertyNames) {
    const reflectedType = Reflect.getMetadata(
      'design:type',
      dto.prototype,
      propertyName,
    );
    const typeName = typeof reflectedType === 'function' ? reflectedType.name : '';
    const property: SchemaObject = {
      type:
        typeName === 'Number'
          ? 'number'
          : typeName === 'Boolean'
            ? 'boolean'
            : typeName === 'Array'
              ? 'array'
              : 'string',
    };
    const validations = validationMetadata.filter(
      (metadata) => metadata.propertyName === propertyName,
    );
    for (const validation of validations) {
      const constraints = validation.constraints ?? [];
      if (validation.name === 'isEnum') {
        const enumValues = constraints[1];
        if (
          Array.isArray(enumValues) &&
          enumValues.every(
            (value): value is string | number =>
              typeof value === 'string' || typeof value === 'number',
          )
        ) {
          property.enum = enumValues;
          property.type = enumValues.every((value) => typeof value === 'number')
            ? 'number'
            : 'string';
        }
      } else if (validation.name === 'isEmail') {
        property.format = 'email';
      } else if (validation.name === 'isUuid') {
        property.format = 'uuid';
      } else if (validation.name === 'isUrl') {
        property.format = 'uri';
      } else if (validation.name === 'isInt') {
        property.type = 'integer';
      } else if (validation.name === 'isLength') {
        if (typeof constraints[0] === 'number') property.minLength = constraints[0];
        if (typeof constraints[1] === 'number') property.maxLength = constraints[1];
      } else if (validation.name === 'minLength' && typeof constraints[0] === 'number') {
        property.minLength = constraints[0];
      } else if (validation.name === 'maxLength' && typeof constraints[0] === 'number') {
        property.maxLength = constraints[0];
      } else if (validation.name === 'min' && typeof constraints[0] === 'number') {
        property.minimum = constraints[0];
      } else if (validation.name === 'max' && typeof constraints[0] === 'number') {
        property.maximum = constraints[0];
      }
    }
    properties[propertyName] = property;
  }
  schema.properties = properties;
  schema.required = [...required].filter((property) => propertyNames.has(property));
  if (schemas) schemas[dto.name] = schema;
  return schema;
}

function addQueryParameters(operation: OperationObject, schema: SchemaObject): void {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  operation.parameters ??= [];
  for (const [name, propertySchema] of Object.entries(properties)) {
    if (
      operation.parameters.some(
        (parameter) => !('$ref' in parameter) && parameter.name === name,
      )
    ) {
      continue;
    }
    operation.parameters.push({
      name,
      in: 'query',
      required: required.has(name),
      schema: propertySchema,
    });
  }
}
