# Arquitectura MultiTenant para Facturación Electrónica

## Objetivo

Esta versión utiliza un solo backend, un solo frontend, un solo MySQL y un solo servicio firmador para atender varios contribuyentes. La separación lógica se realiza con `company_id` como identificador de tenant.

No se requiere crear un proyecto Railway por contribuyente.

## Aislamiento de datos

- `companies`: un registro por contribuyente.
- `users`: los facturadores quedan vinculados a un `company_id` y a su punto de venta.
- `customers`: cada cliente pertenece directamente a un `company_id` y a un establecimiento.
- `products`: cada producto/servicio pertenece directamente a un `company_id` y a un establecimiento.
- `invoices`, `control_numbers`, eventos DTE, establecimientos y puntos de venta mantienen su separación por contribuyente.
- El backend obtiene el tenant de la sesión autenticada. Los `companyId` enviados manualmente por el navegador no se utilizan como autoridad para un facturador.
- El Administrador global puede cambiar el contribuyente activo mediante el selector de la interfaz. El backend valida ese cambio con la cabecera `X-Company-Id`.

Los nombres de usuario continúan siendo globalmente únicos. Esto permite conservar el inicio de sesión solamente con `username + password`, sin solicitar NIT adicional.

## Roles

### ADMIN

Es el administrador global del sistema. Puede:

- registrar y editar contribuyentes;
- seleccionar el contribuyente sobre el que está configurando;
- registrar establecimientos y puntos de venta;
- crear facturadores del contribuyente activo;
- definir correlativos iniciales por contribuyente/punto de venta/tipo DTE/año;
- configurar credenciales de Hacienda y contraseña privada del certificado.

### FACTURADOR

Queda vinculado a un único contribuyente y punto de venta. No puede seleccionar otro tenant ni administrar contribuyentes, establecimientos, puntos de venta, usuarios o correlativos.

## Migración de la base existente

El arranque del backend aplica cambios aditivos:

1. agrega `company_id` a `users`, `customers` y `products` cuando no existe;
2. rellena `users.company_id` a partir de su punto de venta;
3. rellena `customers.company_id` y `products.company_id` a partir de su establecimiento;
4. crea índices compuestos por tenant para las consultas más frecuentes;
5. crea `company_credentials` para las credenciales por contribuyente.

No se borran DTE, clientes, productos, correlativos ni configuraciones existentes.

Antes del primer despliegue de esta versión debe existir un respaldo reciente de MySQL.

## Credenciales de Hacienda por contribuyente

Las credenciales sensibles ya no deben considerarse globales para todos los contribuyentes.

Cada contribuyente puede almacenar:

- usuario/NIT de autenticación de Hacienda;
- contraseña de Hacienda;
- contraseña privada utilizada por el firmador;
- nombre esperado del archivo `.crt`.

Las contraseñas se guardan cifradas con AES-256-GCM. La clave maestra nunca se guarda en MySQL.

### Variable obligatoria

Configure en el backend de Railway una clave larga y aleatoria, y consérvela permanentemente:

```env
TENANT_SECRETS_KEY=<clave-larga-aleatoria-y-estable>
```

No cambie esa clave después de guardar credenciales, porque las credenciales existentes dejarían de poder descifrarse.

Opcional:

```env
TENANT_CREDENTIAL_CACHE_MS=300000
```

El caché evita consultar y descifrar las credenciales en cada operación DTE.

## Certificados `.crt`

La opción recomendada para la arquitectura actual es **un único volumen persistente conectado al servicio firmador**, no un volumen por contribuyente.

Monte ese volumen en:

```text
/uploads
```

Guarde un certificado por NIT, usando únicamente dígitos:

```text
/uploads/06141234567890.crt
/uploads/06149876543210.crt
/uploads/01234567890123.crt
```

El backend firma utilizando el NIT del contribuyente activo y su contraseña privada propia. El certificado no se guarda como BLOB en MySQL.

Esto mantiene MySQL más pequeño y evita duplicar servicios de Railway.

> El campo `certificateFileName` se conserva como metadato administrativo. La versión actual del firmador identifica el certificado por NIT, por lo que el nombre físico recomendado es `<NIT_SOLO_DIGITOS>.crt`.

Mantenga un respaldo del volumen de certificados además del respaldo de MySQL.

## Red privada de Railway

Para minimizar tráfico público y egress evitable:

- Backend -> MySQL: usar hostname/red privada de Railway.
- Backend -> Firmador: usar hostname/red privada de Railway.
- No publicar MySQL a Internet.
- No publicar el firmador a Internet si solo el backend lo consume.
- Solo Frontend/Backend deben exponer los endpoints que realmente necesite el usuario.

Ejemplo conceptual:

```env
MYSQL_HOST=<hostname-privado-mysql>
SIGNER_URL=http://<hostname-privado-firmador>:8113
SIGNER_TIMEOUT_MS=30000
```

Use los valores reales que Railway genere para sus servicios.

## URLs de Hacienda por ambiente

Las URLs son infraestructura compartida; las credenciales son por contribuyente.

La versión multitenant admite variables específicas por ambiente y mantiene compatibilidad con las variables globales anteriores:

```env
MH_TEST_AUTH_URL=...
MH_PRODUCTION_AUTH_URL=...

MH_TEST_RECEPCION_DTE_URL=...
MH_PRODUCTION_RECEPCION_DTE_URL=...

MH_TEST_INVALIDACION_DTE_URL=...
MH_PRODUCTION_INVALIDACION_DTE_URL=...

MH_TEST_RECEPCION_EVENTO_URL=...
MH_PRODUCTION_RECEPCION_EVENTO_URL=...

MH_TEST_CONTINGENCIA_DTE_URL=...
MH_PRODUCTION_CONTINGENCIA_DTE_URL=...
```

Cada contribuyente continúa conservando su propio campo `environment` (`TEST` o `PRODUCTION`).

## Compatibilidad con el contribuyente que ya existe

Para facilitar el primer despliegue, las variables antiguas:

```env
MH_USER
MH_NIT
MH_PASSWORD
SIGNER_PRIVATE_KEY_PASSWORD
```

solo se utilizan como respaldo cuando su NIT coincide exactamente con el NIT del contribuyente que está ejecutando la operación. Nunca se reutilizan automáticamente para otro tenant.

Después de migrar las credenciales del contribuyente existente desde la pantalla administrativa, puede retirar esas credenciales globales de Railway.

## Reportes y consumo de memoria

Los reportes Excel se generan en streaming y las facturas se leen de MySQL por lotes. Variables opcionales:

```env
REPORT_EXPORT_BATCH_SIZE=500
REPORT_PREVIEW_LIMIT=200
```

No aumente indiscriminadamente el tamaño del lote. Un lote moderado suele reducir los picos de RAM y mantener buen rendimiento.

## Pool MySQL

El proyecto conserva un pool pequeño por backend, adecuado para Railway:

```env
DB_POOL_MAX=5
DB_POOL_MIN=0
DB_POOL_ACQUIRE_MS=30000
DB_POOL_IDLE_MS=10000
DB_POOL_EVICT_MS=10000
```

No cree un pool por contribuyente. Todos los tenants comparten el mismo pool y las consultas se aíslan mediante `company_id`.

## Flujo recomendado para registrar un nuevo contribuyente

1. Ingresar como `ADMIN`.
2. Ir a **Contribuyentes** y seleccionar **Nuevo contribuyente**.
3. Registrar datos fiscales, ambiente, documentos permitidos y credenciales.
4. Colocar el certificado `<NIT>.crt` en el volumen `/uploads` del firmador.
5. Seleccionar el nuevo contribuyente en el selector superior.
6. Crear/ajustar Casa Matriz y sucursales.
7. Crear sus puntos de venta.
8. Crear los usuarios `FACTURADOR` y asignarles su punto de venta.
9. Configurar el último correlativo utilizado si el contribuyente migra desde otro sistema.
10. Emitir primero un DTE de prueba y verificar firma, transmisión, PDF, correo y anulación antes de habilitar operación completa.

## Recomendaciones de despliegue

- Hacer respaldo de MySQL antes de aplicar el patch.
- Aplicar primero en un ambiente de prueba/staging.
- No guardar secretos reales en archivos `.env` versionados en Git.
- Mantener `TENANT_SECRETS_KEY`, cookies, JWT y credenciales SMTP solamente como variables privadas de Railway.
- Verificar que el `.gitignore` continúe excluyendo certificados, llaves y `.env`.
- Ejecutar una prueba de aislamiento: crear dos contribuyentes con clientes/productos/DTE distintos y verificar que ninguno aparece al cambiar al otro tenant.
- Ejecutar pruebas DTE independientes para TEST y PRODUCTION según el ambiente configurado en cada contribuyente.
