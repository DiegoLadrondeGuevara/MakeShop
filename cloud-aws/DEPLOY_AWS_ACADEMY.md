# Deploy MakeShop en AWS Academy

Esta ruta usa:

- EC2 + Docker Compose para `backend/` y `database/`.
- API Gateway HTTPS + VPC Link + Application Load Balancer interno para exponer `store-service`.
- Target groups/listeners independientes para `8080` (user), `3000` (shop), `8000` (product), `8004` (store) y `8005` (data analyst).
- AWS Amplify para `frontend/`.
- S3 para imagenes de productos.
- S3, Glue y Athena para la parte de ingesta y analítica.

## 1. Datos que debes tener listos

Necesitas pasar o reemplazar en `cloud-aws/.env`:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN` si tu access key empieza con `ASIA` (AWS Academy normalmente lo requiere)
- `AWS_REGION`, recomendado `us-east-1` salvo que tu Learner Lab indique otra region
- `FRONTEND_AMPLIFY_ACCESS_TOKEN`: token de GitHub para que Amplify conecte el repo
- `FRONTEND_REPO_URL`: URL del repo que Amplify y las EC2 van a clonar
- `FRONTEND_BRANCH_NAME`: normalmente `main`
- `DOCKER_IMAGE_NAMESPACE`: usuario/namespace de Docker Hub donde estan las imagenes `user-service`, `shop-service`, `store-service`, `product-service`, `data-analyst-service`
- `DOCKER_IMAGE_TAG`: normalmente `latest`

Para esta cuenta Docker Hub ya existen las imagenes bajo `diegoladrondeguevara`:

```bash
DOCKER_IMAGE_NAMESPACE=diegoladrondeguevara
DOCKER_IMAGE_TAG=latest
```

Imagenes publicadas:

- `diegoladrondeguevara/user-service:latest`
- `diegoladrondeguevara/shop-service:latest`
- `diegoladrondeguevara/store-service:latest`
- `diegoladrondeguevara/product-service:latest`
- `diegoladrondeguevara/data-analyst-service:latest`

Si quieres desplegar tus propias imagenes, debes configurar en GitHub los secretos:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

Luego haz push a `main` o ejecuta manualmente el workflow **Build and Push Docker Images** desde GitHub Actions. El workflow publica:

- `${DOCKERHUB_USERNAME}/user-service:latest`
- `${DOCKERHUB_USERNAME}/shop-service:latest`
- `${DOCKERHUB_USERNAME}/store-service:latest`
- `${DOCKERHUB_USERNAME}/product-service:latest`
- `${DOCKERHUB_USERNAME}/data-analyst-service:latest`

El valor de `DOCKER_IMAGE_NAMESPACE` en `cloud-aws/.env` debe coincidir con `DOCKERHUB_USERNAME`.

## 2. Token de GitHub para Amplify

Crea un fine-grained token o classic token en GitHub.

Permisos minimos recomendados para repo privado:

- acceso al repositorio `MakeShop`
- `Contents: Read`
- si GitHub lo pide para webhooks/Amplify, permite administracion de webhooks del repo

Para repo publico puede funcionar sin token en algunos casos, pero este proyecto lo exige en `SETUP.sh` para evitar deploys incompletos.

## 3. Ejecutar desde CloudShell

Sube o clona el repo en CloudShell y entra a `cloud-aws`:

```bash
cd MakeShop/cloud-aws
cp .env.example .env
nano .env
```

Reemplaza los valores `CHANGE_ME`, guarda, y ejecuta:

```bash
chmod +x SETUP.sh
./SETUP.sh
```

El script:

- carga credenciales desde `.env` o `aws configure`
- detecta VPC y subnets si no llenaste `VPC_ID`
- crea/reusa un Key Pair
- despliega `cloud-formation.yml`
- inicia el build de Amplify
- muestra outputs finales

## 3.1. Actualizar una cuenta existente sin arriesgar datos

Si la cuenta ya tiene el stack principal desplegado y solo quieres aplicar la versión protegida, usa el script de actualización segura:

```bash
cd MakeShop/cloud-aws
chmod +x UPDATE_SECURITY_SAFE.sh
./UPDATE_SECURITY_SAFE.sh
```

El script crea un CloudFormation Change Set, muestra los recursos que cambiarían y bloquea la ejecución si detecta reemplazo o eliminación de la instancia de DB, la EIP de DB o buckets con datos. Para ejecutarlo sin confirmación interactiva:

```bash
AUTO_APPROVE=1 ./UPDATE_SECURITY_SAFE.sh
```

Despues de la actualización, usa el output `HttpApiEndpoint` como backend público. No uses `LoadBalancerDNS` desde el frontend: el ALB ahora es interno y solo debe recibir tráfico desde API Gateway por VPC Link.

## 4. Verificar backend

Al terminar, copia el output `HttpApiEndpoint` y prueba:

```bash
curl https://TU_API_ID.execute-api.us-east-1.amazonaws.com/health
```

Debe responder algo como:

```json
{"status":"ok"}
```

Tambien puedes revisar Swagger del gateway:

```bash
curl -I https://TU_API_ID.execute-api.us-east-1.amazonaws.com/docs
```

Si falla, entra por SSH a una app EC2 y revisa:

```bash
sudo tail -n 200 /var/log/user-data.log
cd /home/ubuntu/MakeShop/backend
docker compose ps
docker compose logs --tail=100
```

## 5. Verificar frontend

El output `FrontendAmplifyURL` es la URL publica. Si Amplify aun esta compilando, revisa el job en AWS Amplify o espera unos minutos.

La variable `VITE_LOAD_BALANCER_API` se configura automaticamente con el `HttpApiEndpoint`.

El frontend consume la URL HTTPS de API Gateway. `store-service` atiende el tráfico público de aplicación y delega las rutas `/analytics/owner/*` a `data-analyst-service`.

## 6. Data Science: S3, Glue y Athena

Para completar la parte de Data Science, despliega el stack de S3, Glue y Athena:

```bash
aws cloudformation deploy \
  --region "$AWS_REGION" \
  --stack-name openstore-athena \
  --template-file athena-glue.yml \
  --capabilities CAPABILITY_NAMED_IAM
```

Antes de ejecutar la ingesta, asocia a la MV de ingesta el Security Group indicado por el output `IngestServerSecurityGroupId`.

Luego actualiza `dataingest/.env` con:

- `POSTGRES_HOST`, `MYSQL_HOST` y el host de `MONGO_URI` usando `DbServerPrivateIP`
- `S3_BUCKET=openstore-ingest-TU_ACCOUNT_ID`
- credenciales temporales de AWS Academy

Ejecuta ingesta:

```bash
cd ../dataingest
docker compose up --build
```

Despues corre los crawlers Glue indicados por el output `CrawlerNames`.
