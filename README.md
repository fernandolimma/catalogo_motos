# Catalogo_Motos

Plataforma web para catálogo de motocicletas, captação de contatos e organização inicial do atendimento comercial da Independência Motos. O projeto é um monorepo npm com React/Vite, Fastify, Prisma e PostgreSQL.

> **Estado do projeto:** o catálogo público, o cadastro persistente de leads, login administrativo, consulta/atualização inicial de leads, CRUD básico de estoque e vendedores, documentação OpenAPI e execução por Docker foram implementados. A lista de limitações abaixo distingue claramente o que ainda não está pronto para produção.

## Arquitetura

- `apps/web`: React, TypeScript, Vite, Tailwind, TanStack Router/Query, Axios, React Hook Form, Zod, Recharts e ícones Lucide. Os componentes locais seguem o padrão de componentes shadcn/ui.
- `apps/api`: Fastify, TypeScript, Prisma, PostgreSQL, Zod, JWT em cookie HttpOnly, bcrypt e logs Pino (logger do Fastify).
- `apps/api/prisma`: modelo relacional e migrações versionadas.
- `docker-compose.yml`: PostgreSQL persistente, API e frontend estático servido pelo Nginx.

O navegador só conversa com a API; a API aplica as regras de acesso e é a única camada que consulta o PostgreSQL. Valores monetários são persistidos como centavos inteiros (`BigInt`) e serializados como strings decimais.

O acesso automatizado à referência pública visual apresentou somente a tela de aviso de cookies. Por isso, o catálogo usa uma identidade própria e configurável, sem inventar preços, ofertas, imagens ou condições comerciais da loja.

## Pré-requisitos

- Node.js 22 ou superior (o Dockerfile usa Node 22).
- npm 9 ou superior.
- Docker Desktop com Docker Compose v2, ou PostgreSQL 16 para execução local.

## Início rápido com Docker

1. Copie e edite o arquivo de ambiente. Defina senhas únicas; `ADMIN_PASSWORD` deve ter ao menos 12 caracteres e `JWT_SECRET` ao menos 32.

   ```powershell
   Copy-Item .env.example .env
   ```

2. Inicie os serviços:

   ```powershell
   docker compose up --build
   ```

   O PostgreSQL aguarda health check. A API aplica migrações e cria/atualiza o administrador inicial a partir das variáveis de ambiente antes de iniciar. Os dados ficam no volume `postgres_data`.

   As portas do banco, API e frontend são publicadas apenas em `127.0.0.1`; um proxy reverso no host pode encaminhar tráfego para `8080` e `3001` sem expor o PostgreSQL à rede.

3. Acesse:

   - Catálogo: <http://localhost:8080>
   - Login/CRM: <http://localhost:8080/login>
   - API e Swagger: <http://localhost:3001/docs>
   - Health check: <http://localhost:3001/health>

   Use `ADMIN_EMAIL` e `ADMIN_PASSWORD` definidos no `.env`.

Para desligar sem apagar os dados: `docker compose down`. **Não** use `docker compose down -v` salvo se quiser remover intencionalmente o banco persistido.

## Desenvolvimento local

1. Copie `.env.example` para `.env`, ajuste `DATABASE_URL` para seu PostgreSQL local e configure `JWT_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
2. Instale e gere o cliente Prisma:

   ```powershell
   npm install
   npm run db:generate
   npm run db:migrate -w @catalogo/api
   npm run db:seed
   ```

   `db:migrate` aplica migrações existentes; para criar uma nova durante o desenvolvimento, use `npm run db:migrate:dev -w @catalogo/api -- --name nome_da_mudanca`.
3. Rode API e frontend em dois processos:

   ```powershell
   npm run dev
   ```

   Frontend: <http://localhost:5173>. API: <http://localhost:3001>.

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `NODE_ENV` | Ambiente; use `production` no deploy. |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Banco no Docker Compose. Troque as senhas demonstrativas antes de iniciar. |
| `DATABASE_URL` | Conexão Prisma; Compose define o endereço interno do banco para a API. |
| `API_PORT`, `API_HOST` | Porta e endereço de bind da API. |
| `WEB_ORIGIN` | Origens exatas autorizadas no CORS, separadas por vírgula. Também é verificada nas operações autenticadas que alteram dados. |
| `VITE_API_URL` | URL pública da API embutida no build do frontend. Em produção, use a URL HTTPS pública. |
| `JWT_SECRET` | Segredo da sessão; mínimo de 32 caracteres em produção. Gere um valor aleatório e exclusivo. |
| `COOKIE_SECURE` | Defina `true` em HTTPS. Em desenvolvimento local, `false`. |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Credenciais do administrador criado pelo seed. A senha precisa de pelo menos 12 caracteres. O seed atualiza o usuário para refletir essas variáveis. |
| `SEED_DEMO_DATA` | `true` cria uma única motocicleta DEMO não publicada e indisponível; padrão `false`. |
| `WHATSAPP_PROVIDER`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `EVOLUTION_WEBHOOK_SECRET` | Configuração da integração Evolution API para WhatsApp. O código atual define o adapter e as variáveis sem executar disparos reais em produção. |
| `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Configuração do envio de e-mails via SMTP. O adaptador está preparado, mas o disparo real é bloqueado até decisão de produção. |
| `STORAGE_PROVIDER`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Preparação para armazenamento de mídia/imagens. Ainda não está habilitado em produção. |

O arquivo `.env.example` contém apenas valores demonstrativos. Não o use como configuração de produção.

## Funcionalidades disponíveis

### Catálogo e captação

- Catálogo público paginado com busca textual, marca e faixa de preço suportadas pela API.
- Detalhe por slug, galeria cadastrada, ficha técnica, preço e dados do vendedor principal.
- Catálogo público individual por vendedor e identificação de vendedor/moto no formulário.
- Formulário valida nome, telefone, e-mail opcional, mensagem, horário e consentimento; registra página/UTM, consentimento e atividade.
- Telefones são normalizados e únicos. Contatos repetidos atualizam campos não vazios e registram nova atividade/interesse sem duplicar o lead.
- Leads não são criados para motos não publicadas ou indisponíveis. Rate limits públicos protegem login e captação.

### CRM e estoque

- Login com cookie JWT `HttpOnly`, `SameSite=Strict`, senha bcrypt e bloqueio temporário após tentativas inválidas.
- Perfis iniciais e restrição de vendedor aos próprios leads no backend.
- Lista paginada de leads, busca, filtro de etapa, ficha e histórico; anotações e atualização auditada do funil.
- Indicadores reais por etapa e taxa de conversão (vendas concluídas / todos os leads).
- Relatórios filtráveis por data com recebimento diário, distribuição por etapa/origem/vendedor, conversão dos leads do período, vendas e receita por data de fechamento; exportação agregada em CSV.
- Tela administrativa para cadastrar motos e vendedores, publicar/recolher anúncios e mudar o estado de estoque; API autenticada também permite editar motos.
- API autenticada para cadastrar/editar motos e vendedores.
- Swagger/OpenAPI em `/docs`.

## Endpoints implementados

Prefixo: `/api/v1`.

| Método | Endpoint | Acesso |
|---|---|---|
| `POST` | `/auth/login` | Público, limitado por taxa |
| `POST` | `/auth/logout` | Público |
| `GET` | `/auth/me` | Sessão |
| `GET` | `/public/motorcycles` | Público |
| `GET` | `/public/motorcycles/:slug` | Público |
| `GET` | `/public/sellers` | Público |
| `GET` | `/public/sellers/:slug` | Público |
| `POST` | `/public/leads` | Público, limitado por taxa |
| `GET` | `/leads`, `/leads/:id` | Sessão; escopo de vendedor aplicado |
| `POST` | `/leads/:id/activities` | Sessão |
| `PATCH` | `/crm/leads/:id/stage` | Sessão; alteração auditada |
| `GET` | `/crm/overview` | Sessão; escopo de vendedor aplicado |
| `GET` | `/crm/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` | Sessão; relatório limitado ao escopo do usuário e a períodos de até 365 dias |
| `GET/POST/PATCH` | `/motorcycles`, `/motorcycles/:id` | Administrador/supervisor/gerente |
| `GET/POST` | `/sellers` | Administrador/supervisor/gerente |

Entradas são validadas no backend. A API retorna erro genérico sem detalhes internos e não inclui hashes de senha em respostas.

## Primeiro administrador

O seed usa `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD` e faz upsert idempotente. Configure a senha por variável de ambiente antes da primeira inicialização. Para trocar a credencial, altere a variável e execute novamente `npm run db:seed` ou recrie o serviço da API. **Nunca** inclua a senha no repositório, seed ou logs.

## Evolution API e WhatsApp

As variáveis de configuração estão reservadas, mas a integração em execução ainda não está implementada: não há provisionamento/QR, caixa de entrada, envio, tratamento de eventos, autenticação de webhooks, fila ou reprocessamento. A aplicação não depende de WhatsApp para persistir e organizar leads. Configure a integração apenas após validar a versão Evolution implantada, seus endpoints e o mecanismo de autenticação do webhook.

## Backup e restauração

Backup do PostgreSQL no Docker:

```powershell
docker compose exec -T db pg_dump -U catalogo -d catalogo_motos > .\catalogo_motos.sql
```

Restauração em um banco vazio (primeiro copie o arquivo para o container):

```powershell
docker compose cp .\catalogo_motos.sql db:/tmp/catalogo_motos.sql
docker compose exec db psql -U catalogo -d catalogo_motos -f /tmp/catalogo_motos.sql
```

Adapte usuário e banco às variáveis `POSTGRES_USER` e `POSTGRES_DB`. Armazene backups criptografados fora do host e teste periodicamente a restauração. O volume Docker, sozinho, não é backup.

## Deploy em VPS

1. Instale Docker Engine/Compose em uma VPS Linux e configure DNS para o domínio.
2. Faça checkout do projeto, crie `.env` com segredos aleatórios e defina `NODE_ENV=production`, `COOKIE_SECURE=true`, `WEB_ORIGIN=https://seudominio`, e `VITE_API_URL=https://api.seudominio/api/v1` (ou uma URL na mesma origem).
3. Restrinja no firewall o acesso externo às portas do banco (`5432`). Em produção, publique somente o Nginx/proxy reverso; a API e o banco devem ficar em rede privada.
4. Configure proxy reverso HTTPS (por exemplo, Caddy ou Nginx com certificado ACME) para o frontend e a API. O proxy da API precisa encaminhar `Host`, `X-Forwarded-For` e `X-Forwarded-Proto`.
5. Execute `docker compose up -d --build`, verifique `/health`, Swagger, login, catálogo e envio de lead, e configure backups externos.
6. Planeje rotação de `JWT_SECRET` (invalida as sessões), atualização de imagens e política de retenção/LGPD.

O Compose fornecido é uma base reproduzível, não substitui hardening de VPS, firewall, TLS, gestão de segredos, observabilidade ou revisão jurídica.

## Qualidade e validação

```powershell
npm run typecheck
npm test --workspaces --if-present
npm run build
```

Teste a persistência de ponta a ponta com PostgreSQL disponível (Docker Compose), crie uma moto pelo endpoint administrativo, publique-a e envie um lead pelo catálogo. O diretório `apps/api/prisma/migrations` contém o histórico aplicado ao banco.

## Limitações conhecidas — não declarar como concluídas

- O escopo completo do prompt ainda não foi concluído. Não há recuperação/renovação de sessão, administração de usuários e permissões configuráveis, sessões revogáveis, workflow de tarefas/agendamentos, distribuição equilibrada, Kanban drag-and-drop ou regras de transição.
- Não há inbox/integração Evolution API, notificações por e-mail, automações, anexos, upload de imagens/S3 ou armazenamento de segredos externos.
- Relatórios além do resumo atual, filtros avançados, CSV, exportação/exclusão formal LGPD, configurações globais e ferramentas para retenção não estão implementados.
- Faltam edição completa de vendedores no painel, SEO dinâmico/Open Graph/sitemap/robots, testes de integração com PostgreSQL, testes E2E e teste de responsividade automatizado.
- O aviso de privacidade é uma base textual; a loja deve revisar finalidade, contato do encarregado, retenção e direitos antes de produção.
- O acesso automatizado à referência CRM não foi realizado e nenhuma credencial de terceiros foi fornecida.
