<p align="center">
  <img src="public/assets/logo-rengifo.png" alt="Logo Rengifo Ltda" width="90" />
</p>

<h1 align="center">Sistemas de gestión de clientes Rengifo Ltda</h1>

<p align="center">
  Plataforma centralizada para el registro, búsqueda ultrarrápida, control tributario, seguimiento histórico de pagos/formularios y exportación de clientes.
</p>

---

## ¿Qué hace este sistema?

Centraliza en un único panel toda la información operativa, de acceso y tributaria de los clientes de **Rengifo Ltda**, permitiendo consultar credenciales (correo, clave SIAT, NIT), revisar estados de cumplimiento y filtrar carteras completas en cuestión de segundos.

---

## Funcionalidades principales

### 1. Búsqueda ultrarrápida y filtros intuitivos
- **Buscador instantáneo (`Ctrl + K`):** Busca en tiempo real por Razón Social / Nombre, NIT, correo electrónico, celular o dirección.
- **Chips de filtro directo:** Filtra en un clic por **Estado** (*Todos, Activo, Suspendido, Baja*) y **Rubro** (*Profesional, Industrial, Alquiler, Otro*).
- **Filtros avanzados:** Mes de cierre (*Marzo, Junio, Septiembre, Diciembre*), Declaraciones Juradas, Estados Financieros y Dictamen.
- **Filtros de tiempo:** Rangos rápidos (*Todo, Este mes, Últimos 3 meses, Este año*) o rango personalizado (`Desde` – `Hasta`) aplicado sobre el **Histórico de pagos/formularios**, **Fecha de ingreso**, **Fecha de inactivación** o **Fecha de baja**.

### 2. Previsualización clave y Ficha completa
- **Tabla principal de consulta rápida:** Muestra Razón Social, NIT, Correo electrónico, Clave de correo (oculta con botón *Ver/Ocultar*), Clave SIAT (oculta con botón *Ver/Ocultar*), Rubro, Fecha de ingreso y Estado.
- **Copiado en 1 clic:** Botones de icono para copiar NIT, correo, contraseña, clave SIAT, celular y dirección sin abrir menús extra.
- **Ficha completa del cliente:** Al hacer clic en cualquier fila se despliega la tarjeta completa con indicadores financieros en cabecera, todos los datos generales y el **Histórico de Pagos y Formularios**.

### 3. Histórico de pagos y formularios por cliente
- Registro cronológico de presentaciones y pagos por período (*Declaración Jurada, Pago de Honorarios, Estados Financieros, Dictamen, Actualización de Saldos*).
- Filtrado por rango de fechas dentro de la ficha y registro rápido pre-cargado con los honorarios y saldos actuales del cliente.

### 4. Dashboard visual y cálculos financieros exactos
- **KPIs clicables:** Total de clientes, Activos, Suspendidos, De baja y DD.JJ. pendientes.
- **Totales en tiempo real (precisión decimal):** Honorarios activos mensuales, proyección anual (12 meses), Saldo IVA acumulado y Saldo IT acumulado.
- **Gráficos integrados:** Distribución por Rubro, barras de cumplimiento tributario (DD.JJ. y EE.FF.) y honorarios por mes de cierre.

### 5. Exportación a Excel y PDF
- **Excel (`.xlsx`):** Genera un libro con el directorio filtrado completo (formato numérico contable) y una hoja adicional de *Resumen Financiero*.
- **PDF:** Exporta el reporte general del directorio filtrado en formato horizontal o la **Ficha PDF individual** desde la tarjeta de cada cliente.

### 6. Autenticación y creación de usuarios
- Inicio de sesión mediante **correo electrónico o nombre de usuario** y contraseña.
- Registro de nuevos usuarios directamente desde la pantalla de acceso.

---

## Datos gestionados por cliente

| Categoría | Campos |
| :--- | :--- |
| **Principales (obligatorios)** | Nombre o Razón Social, NIT, Rubro (`profesional`, `industrial`, `alquiler`, `otro`), Estado (`Activo`, `Inactivo / Suspendido`, `Baja`) |
| **Contacto y accesos *(opcional)*** | Celular, Dirección, Correo electrónico, Contraseña de correo, Contraseña del SIAT |
| **Fechas y ciclo *(opcional)*** | Fecha de ingreso, Fecha de inactivación/suspendido, Fecha de baja, Fecha de pago, Mes de cierre |
| **Tributario y saldos *(opcional)*** | Honorarios profesionales (Bs.), Declaraciones juradas, Estados financieros, Dictamen, Saldo IVA (Bs.), Saldo IT (Bs.), Notas |

---

## Despliegue rápido con Docker

### Requisitos
- [Docker](https://www.docker.com/) y Docker Compose instalados.

### Pasos para levantar el sistema

1. Clona el repositorio e ingresa a la carpeta del proyecto:
   ```bash
   git clone https://github.com/rodaltamir/sistema_de_gestion_de_clientes-rengifo-ltda.git
   cd sistema_de_gestion_de_clientes-rengifo-ltda
   ```

2. Construye y levanta los contenedores (Aplicación Web + PostgreSQL):
   ```bash
   docker compose up -d --build
   ```

3. Abre el sistema en tu navegador:
   - **Aplicación:** `http://localhost:3005`
   - **Healthcheck:** `http://localhost:3005/api/health`

> Los datos se almacenan de forma persistente en el volumen Docker `rengifo_pgdata`.

---

## Acceso inicial

Al iniciar por primera vez, el sistema crea automáticamente el usuario administrador y clientes de ejemplo:

- **Usuario:** `Rengifo Ltda`
- **Correo:** `audirengifo.ltda@gmail.com`
- **Contraseña:** `clientes26`

*(También puedes crear nuevos usuarios desde la pestaña **Crear usuario** en la pantalla de inicio de sesión).*

---

## Estructura del proyecto

```text
├── docker-compose.yml            # Orquestación de contenedores (Web + PostgreSQL)
├── Dockerfile                    # Imagen de producción multi-etapa
├── public/assets/                # Logotipo e imágenes del sistema
└── src/
    ├── app/
    │   ├── api/
    │   │   ├── auth/             # Login, registro, sesión y cierre de sesión
    │   │   ├── clients/          # CRUD de clientes, histórico y exportación Excel
    │   │   └── health/           # Verificación de estado de BD y servicio
    │   ├── globals.css           # Estilos del sistema
    │   ├── layout.tsx            # Layout principal y metadatos
    │   └── page.tsx              # Punto de entrada
    ├── components/
    │   ├── AppShell.tsx          # Control de sesión en interfaz
    │   ├── AuthScreen.tsx        # Login y creación de usuarios
    │   ├── ClientDashboard.tsx   # Buscador, filtros, tabla, ficha y formularios
    │   └── DashboardCharts.tsx   # Gráficos del dashboard
    └── lib/
        ├── auth.ts               # Hashing scrypt y manejo de sesiones
        ├── calculations.ts       # Cálculos exactos con Decimal.js
        ├── clients-service.ts    # Consultas, validaciones e histórico en PostgreSQL
        ├── db.ts                 # Conexión, esquema, restricciones CHECK y seed
        ├── pdf-export.ts         # Generación de reportes y fichas en PDF
        └── types.ts              # Definiciones TypeScript
```
