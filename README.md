# Bot de Vendas para Discord

> Projeto pessoal, escrito em PT-BR e mantido sem compromisso de suporte. Nao e um SaaS: voce clona, configura e roda no seu proprio servidor.

Bot de vendas em PT-BR para Discord com loja por threads privadas, carrinho, PIX, tickets, historico de vendas e banco local SQLite.

## Recursos

- Painel publico de compras com botao `Comprar`
- Atendimento privado por thread para cada cliente
- Produtos principais e complementares
- Carrinho com controle de quantidade, remocao e total em BRL
- Checkout PIX com dados configuraveis no `.env`
- Recebimento de comprovante por imagem ou PDF
- Aprovacao ou reprovacao manual de pagamento pela equipe
- Registro local de pagamentos, carrinhos, tickets e vendas
- Historico de vendas e confirmacao de entrega
- Categorias configuraveis para tickets
- Painel publico de suporte
- Configuracao e conexao em canal de voz
- Canal opcional de logs para vendas aprovadas

## Tecnologias

- Node.js 20+
- Discord.js v14
- SQLite local com `better-sqlite3`
- Slash commands
- Threads privadas do Discord

## Requisitos

- Node.js 20 ou superior
- NPM
- Um bot criado no Discord Developer Portal
- Token do bot
- ID da aplicacao
- ID do servidor
- ID do cargo da equipe

Permissoes recomendadas para o bot:

- `Manage Channels`
- `Manage Threads`
- `Send Messages`
- `Embed Links`
- `Read Message History`
- `Use External Emojis`
- `Connect`
- `Speak`

Ative tambem o intent `Message Content` no Discord Developer Portal para o bot conseguir detectar comprovantes enviados na thread.

## Instalacao

Clone o projeto, instale as dependencias e configure o ambiente:

```bash
cp .env.example .env
npm install
```

Edite o arquivo `.env`:

```env
DISCORD_TOKEN=coloque_o_token_do_bot
DISCORD_CLIENT_ID=id_da_aplicacao
DISCORD_GUILD_ID=id_do_servidor
STAFF_ROLE_ID=id_do_cargo_staff
LOG_CHANNEL_ID=
PIX_KEY=sua_chave_pix
PIX_RECEIVER=Nome da loja
PIX_CITY=Sao Paulo
DATABASE_PATH=./data/vendas.sqlite
```

Registre os comandos no servidor:

```bash
npm run deploy:commands
```

Inicie o bot:

```bash
npm start
```

Durante desenvolvimento, voce pode usar:

```bash
npm run dev
```

## Comandos

### Loja

- `/setup-loja`: envia o painel publico da loja no canal atual.
- `/produto-adicionar`: cadastra um produto principal ou complemento.
- `/produto-listar`: lista produtos ativos cadastrados.

### Tickets

- `/categoria-ticket`: cadastra uma categoria de atendimento.
- `/painel-tickets`: envia o painel publico de tickets.
- `/ticket-fechar`: fecha e arquiva a thread atual.

### Vendas

- `/vendas-historico`: mostra as ultimas vendas registradas.
- `/entrega-confirmar`: marca uma venda como entregue.

### Voz

- `/voz-configurar`: salva o canal de voz que o bot deve usar.
- `/voz-conectar`: conecta o bot ao canal configurado.

## Fluxo de venda

1. A equipe usa `/setup-loja` em um canal publico.
2. O cliente clica em `Comprar`.
3. O bot cria uma thread privada para o pedido.
4. O cliente escolhe produto principal e complementos.
5. O cliente ajusta quantidades com `+1`, `-1` ou `Remover`.
6. O cliente finaliza o pedido.
7. O bot envia os dados PIX e o ID do pagamento.
8. O cliente envia o comprovante na thread.
9. A equipe aprova ou reprova o pagamento.
10. Se aprovado, o bot registra a venda no banco local.
11. A equipe entrega o produto e confirma com `/entrega-confirmar`.

## Banco local

O banco SQLite fica em:

```txt
data/vendas.sqlite
```

Ele armazena:

- Configuracoes
- Produtos
- Categorias de tickets
- Tickets
- Carrinhos
- Itens do carrinho
- Pagamentos
- Vendas

O arquivo do banco fica ignorado no Git para evitar vazamento de dados.

## Observacao sobre PIX automatico

Este projeto ja possui fluxo PIX com comprovante e revisao pela equipe. A validacao 100% automatica de PIX depende de uma API de pagamento, como Mercado Pago, Efi/Gerencianet, Asaas, OpenPix ou outro provedor.

A estrutura foi separada em servicos para facilitar essa evolucao depois.

## Estrutura

```txt
src/
  commands.js              Slash commands
  config.js                Variaveis de ambiente
  db.js                    SQLite e migracoes
  deploy-commands.js       Registro dos comandos
  index.js                 Entrada do bot e eventos Discord
  services/
    cart.js                Carrinho
    payments.js            Pagamentos e vendas
    pix.js                 Instrucoes PIX
    products.js            Produtos
    tickets.js             Tickets
  utils/
    money.js               Formatacao BRL
    permissions.js         Validacao de staff
  ui.js                    Embeds, botoes e menus
```

## Seguranca

- Nunca publique seu `.env`.
- Nunca suba `data/vendas.sqlite` para o GitHub.
- Use um cargo staff exclusivo para aprovar pagamentos.
- Revise comprovantes antes de entregar produtos.
- Garanta que o bot tenha permissoes apenas nos canais necessarios.

## Licenca

Distribuido sob a GNU Lesser General Public License v2.1 (LGPL-2.1). O texto completo esta em [LICENSE](LICENSE).
