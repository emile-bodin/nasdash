declare module 'swagger-ui-dist/swagger-ui-es-bundle.js' {
  interface SwaggerRequest {
    credentials?: RequestCredentials;
  }

  interface SwaggerUiOptions {
    domNode: HTMLElement;
    spec: object;
    deepLinking?: boolean;
    displayRequestDuration?: boolean;
    persistAuthorization?: boolean;
    tryItOutEnabled?: boolean;
    requestInterceptor?: (request: SwaggerRequest) => SwaggerRequest;
  }

  export default function SwaggerUI(options: SwaggerUiOptions): unknown;
}
