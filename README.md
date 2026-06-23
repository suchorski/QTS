# QTS - Quadro de Trabalho Semanal

Sistema para gestão de QTS com autenticação LDAP, controle de perfis e fluxo de geração/validação/aprovação.

## Stack

- Frontend: Next.js 16 + React 19 + Tailwind CSS
- Backend: Node.js 24 + Express + Prisma 7
- Banco: MariaDB externo
- Autenticação: LDAP (read-only) + JWT
- Orquestração: Docker Compose

## Requisitos

- Docker e Docker Compose
- Instância MariaDB acessível pela `DATABASE_URL`
- Servidor LDAP configurado

## Configuração

1. Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

2. Preencha as variáveis no `.env`.

Exemplo mínimo:

```env
# Database
DATABASE_URL="mysql://user:password@host:3306/qts"

# LDAP
LDAP_URL="ldap://directory.example.local:389"
LDAP_BIND_DN="uid=readonly-service,ou=services,dc=example,dc=local"
LDAP_BIND_PASSWORD="change-me"
LDAP_BASE_DN="dc=example,dc=local"

# Auth/App
NEXTAUTH_SECRET="change-me-min-32-chars"
NEXTAUTH_URL="http://localhost:7123"
NEXT_PUBLIC_API_URL="http://localhost:7124"
FRONTEND_URL="http://localhost:7123"

# Runtime
NODE_ENV="production"
TEST_MODE="false"

# Network bind
BIND_HOST="0.0.0.0"
API_BIND_IP="0.0.0.0"

# Seed
INITIAL_USER_CPF="00000000000"
```

Observações:

- `INITIAL_USER_CPF` é obrigatório para o seed.
- Com `TEST_MODE="true"`, o login exige CPF existente no LDAP, mas ignora validação de senha (somente homologação/teste).
- `BIND_HOST` controla o bind da API Node (padrão `0.0.0.0`).
- `API_BIND_IP` controla em qual IP do host Docker a porta da API é publicada.

Exemplo recomendado:

- Teste: `BIND_HOST=0.0.0.0` e `API_BIND_IP=0.0.0.0`
- Produção com nginx local: `BIND_HOST=0.0.0.0` e `API_BIND_IP=127.0.0.1`

## Executar com Docker

```bash
docker-compose up -d --build
```

Serviços padrão:

- Frontend: `http://localhost:7123` (`APP_PORT`, default `7123`)
- API: `http://localhost:7124` (`API_PORT`, default `7124`)

O container da API executa no startup:

1. `prisma db push --accept-data-loss`
2. `node prisma/seed.js`
3. `node src/index.js`

## Acesso inicial

- CPF: valor de `INITIAL_USER_CPF` no `.env`
- Senha inicial: `inicial123!`
- Perfil atribuído no seed: `admin_global`

## Estrutura do projeto

```text
qts/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── src/
│   │   └── index.js
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── app/
│   ├── public/
│   ├── Dockerfile
│   └── package.json
├── data/uploads/
├── docker-compose.yml
├── .env.example
└── rebuild
```

## Desenvolvimento local

Backend:

```bash
cd backend
npm install
npm run prisma:generate
npm run db:push
npm run db:seed
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Perfis disponíveis

1. `admin_global`
2. `admin_local`
3. `editor`
4. `validador`
5. `aprovador`
6. `invalidar_qts`
7. `historico_qts`

## Endpoints principais

Autenticação:

- `POST /auth/login`
- `GET /auth/me`

Usuário/perfil:

- `GET /users`
- `GET /users/:id`
- `PUT /users/:id`
- `PUT /users/:id/roles`
- `GET /roles`

Agenda/Eventos:

- `GET /events`
- `POST /events`
- `PUT /events/:id`
- `DELETE /events/:id`

QTS:

- `GET /qts/preview`
- `GET /qts`
- `GET /qts/:id`
- `POST /qts`
- `PUT /qts/:id/status`
- `DELETE /qts/:id`
- `GET /qts/aprovados`
- `GET /qts/historico`

Saúde/suporte:

- `GET /health`
- `GET /trust`

## Troubleshooting

Erro de LDAP:

- valide `LDAP_URL`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD`, `LDAP_BASE_DN`.

Erro de conexão com banco:

- valide `DATABASE_URL`;
- veja logs da API: `docker-compose logs api`.

Frontend não alcança API após troca de URL:

- `NEXT_PUBLIC_API_URL` é embutida no build do Next;
- após alterar, faça rebuild do app (`docker-compose up -d --build`).

Ambiente com CA interna (SSL):

- se aparecer servidor inacessível no login, acesse o fluxo via `/trust` para aceitar certificado;
- garanta `FRONTEND_URL` e `NEXT_PUBLIC_API_URL` com as URLs públicas corretas.

## Licença

MIT
