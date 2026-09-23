# MakeShop Data Lake: diagrama entidad/relacion

El catalogo de Glue contiene cuatro tablas creadas a partir de los archivos que
suben los tres contenedores de ingesta:

```mermaid
erDiagram
    USERS {
        string id PK
        string name
        string email
        string role
        string subscription
        string shop_id FK
        timestamp created_at
    }

    SHOPS_CSV {
        string id PK
        string name
        string owner_id FK
        string phone_number
    }

    MEMBERSHIPS_CSV {
        int id PK
        string user_id FK
        string role
        string shop_id FK
    }

    PRODUCTS {
        string id PK
        string name
        double price
        string availability
        string shop_id FK
        string owner_id
        timestamp created_at
    }

    USERS }o--o| SHOPS_CSV : "shop_id"
    SHOPS_CSV ||--o{ MEMBERSHIPS_CSV : "shop_id"
    USERS ||--o{ MEMBERSHIPS_CSV : "user_id"
    SHOPS_CSV ||--o{ PRODUCTS : "shop_id"
    USERS ||--o{ SHOPS_CSV : "owner_id"
```

Las relaciones se aplican en las consultas de Athena; Glue no crea claves
foraneas fisicas entre tablas provenientes de bases de datos distintas.

## Evidencia requerida

- Consulta 1: productos con tienda y propietario.
- Consulta 2: usuarios asignados a tiendas.
- Consulta 3: membresias con usuario, tienda y propietario.
- Consulta 4: resumen agregado por tienda evitando multiplicacion de conteos.
- Vista 1: `v_tienda_resumen`.
- Vista 2: `v_usuarios_tienda`.

Las consultas ejecutables estan en `athena_queries.sql`.
