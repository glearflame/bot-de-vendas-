import {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials
} from 'discord.js';
import { joinVoiceChannel } from '@discordjs/voice';
import { config } from './config.js';
import { db, getSetting, migrate, setSetting } from './db.js';
import { createProductsService } from './services/products.js';
import { createCartService } from './services/cart.js';
import { createPaymentsService } from './services/payments.js';
import { pixInstructions } from './services/pix.js';
import {
  closeTicket,
  createTicket,
  createTicketCategory,
  listTicketCategories
} from './services/tickets.js';
import {
  cartEmbed,
  cartItemRows,
  paymentReviewRows,
  privateThreadOptions,
  productsSelect,
  storePanelEmbed,
  storePanelRows,
  ticketPanelEmbed,
  ticketSelect
} from './ui.js';
import { formatBRL, parseBRL } from './utils/money.js';
import { isStaff, requireStaff } from './utils/permissions.js';

migrate();

const { createProduct, listProducts, updateProductPrice } = createProductsService(db);
const {
  addItem,
  closeCart,
  createCart,
  getCartItems,
  getCartTotal,
  getOpenCartByThread,
  incrementItem,
  removeItem,
  setCartMessageId,
  listOpenCartsContainingProduct
} = createCartService(db);
const {
  attachProof,
  createPayment,
  getPaymentByCart,
  listRecentSales,
  markDelivered,
  approvePayment,
  rejectPayment
} = createPaymentsService(db);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

client.once('ready', () => {
  console.log(`Bot online como ${client.user.tag}.`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
    }
  } catch (error) {
    console.error(error);
    const content = 'Algo deu errado ao processar essa acao. Verifique o console do bot.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.channel.isThread()) return;

  const cart = getOpenCartByThread(message.channel.id);
  if (!cart) return;

  const payment = getPaymentByCart(cart.id);
  if (!payment || payment.status !== 'pending' || !message.attachments.size) return;

  const attachment = message.attachments.first();
  attachProof({ paymentId: payment.id, proofUrl: attachment.url });

  await message.reply({
    content: 'Comprovante recebido. A equipe vai conferir e responder por aqui.',
    components: paymentReviewRows(payment.id)
  });
});

async function handleCommand(interaction) {
  if (interaction.commandName === 'setup-loja') {
    const denied = requireStaff(interaction);
    if (denied) return;

    await interaction.channel.send({
      embeds: [storePanelEmbed()],
      components: storePanelRows()
    });
    await interaction.reply({ content: 'Painel da loja criado.', ephemeral: true });
  }

  if (interaction.commandName === 'produto-adicionar') {
    const denied = requireStaff(interaction);
    if (denied) return;

    const name = interaction.options.getString('nome', true);
    const priceCents = parseBRL(interaction.options.getString('preco', true));
    const type = interaction.options.getString('tipo', true);
    const description = interaction.options.getString('descricao') ?? '';

    createProduct({ name, description, priceCents, type });
    await interaction.reply({ content: `Produto **${name}** cadastrado por ${formatBRL(priceCents)}.`, ephemeral: true });
  }

  if (interaction.commandName === 'produto-listar') {
    const denied = requireStaff(interaction);
    if (denied) return;

    const products = listProducts();
    const description = products.length
      ? products.map((p) => `#${p.id} | ${p.type === 'main' ? 'Principal' : 'Complemento'} | **${p.name}** | ${formatBRL(p.price_cents)}`).join('\n')
      : 'Nenhum produto cadastrado.';

    await interaction.reply({ content: description, ephemeral: true });
  }

  if (interaction.commandName === 'produto-preco') {
    const denied = requireStaff(interaction);
    if (denied) return;

    const productId = interaction.options.getInteger('id', true);
    const priceCents = parseBRL(interaction.options.getString('preco', true));
    const info = updateProductPrice(productId, priceCents);
    if (info.changes === 0) {
      await interaction.reply({ content: 'Produto ativo nao encontrado.', ephemeral: true });
      return;
    }

    // Atualiza os carrinhos abertos que contem o produto. O valor cobrado
    // continua sendo o preco congelado no item, e o embed mostra o aviso.
    const carts = listOpenCartsContainingProduct(productId);
    let refreshed = 0;
    for (const cart of carts) {
      const channel = await client.channels.fetch(cart.thread_id).catch(() => null);
      if (!channel) continue;
      await refreshCartMessage(channel, cart.id).catch((error) => console.error(error));
      refreshed += 1;
    }

    await interaction.reply({
      content: `Preco atualizado para ${formatBRL(priceCents)}. Carrinhos abertos atualizados: ${refreshed}.`,
      ephemeral: true
    });
  }

  if (interaction.commandName === 'categoria-ticket') {
    const denied = requireStaff(interaction);
    if (denied) return;

    createTicketCategory({
      name: interaction.options.getString('nome', true),
      description: interaction.options.getString('descricao') ?? '',
      emoji: interaction.options.getString('emoji') ?? '🎫'
    });

    await interaction.reply({ content: 'Categoria cadastrada.', ephemeral: true });
  }

  if (interaction.commandName === 'painel-tickets') {
    const denied = requireStaff(interaction);
    if (denied) return;

    const categories = listTicketCategories();
    if (!categories.length) {
      await interaction.reply({ content: 'Cadastre pelo menos uma categoria com `/categoria-ticket`.', ephemeral: true });
      return;
    }

    await interaction.channel.send({
      embeds: [ticketPanelEmbed()],
      components: [ticketSelect(categories)]
    });
    await interaction.reply({ content: 'Painel de tickets criado.', ephemeral: true });
  }

  if (interaction.commandName === 'voz-configurar') {
    const denied = requireStaff(interaction);
    if (denied) return;

    const channel = interaction.options.getChannel('canal', true);
    setSetting('voice_channel_id', channel.id);
    await interaction.reply({ content: `Canal de voz configurado: ${channel}.`, ephemeral: true });
  }

  if (interaction.commandName === 'voz-conectar') {
    const denied = requireStaff(interaction);
    if (denied) return;

    await connectVoice(interaction);
  }

  if (interaction.commandName === 'vendas-historico') {
    const denied = requireStaff(interaction);
    if (denied) return;

    const sales = listRecentSales(10);
    const content = sales.length
      ? sales.map((sale) => [
        `Venda: \`${sale.id}\``,
        `Cliente: <@${sale.user_id}>`,
        `Valor: ${formatBRL(sale.amount_cents)}`,
        `Entrega: ${sale.delivered ? 'confirmada' : 'pendente'}`
      ].join(' | ')).join('\n')
      : 'Nenhuma venda registrada ainda.';

    await interaction.reply({ content, ephemeral: true });
  }

  if (interaction.commandName === 'entrega-confirmar') {
    const denied = requireStaff(interaction);
    if (denied) return;

    const saleId = interaction.options.getString('venda', true);
    markDelivered(saleId);
    await interaction.reply({ content: `Venda \`${saleId}\` marcada como entregue.`, ephemeral: true });
  }

  if (interaction.commandName === 'ticket-fechar') {
    const denied = requireStaff(interaction);
    if (denied) return;

    if (!interaction.channel.isThread()) {
      await interaction.reply({ content: 'Use este comando dentro da thread do ticket.', ephemeral: true });
      return;
    }

    closeTicket(interaction.channel.id);
    await interaction.reply('Ticket fechado. A thread sera arquivada.');
    await interaction.channel.setArchived(true, 'Ticket fechado pela equipe.');
  }
}

async function handleSelect(interaction) {
  if (interaction.customId.startsWith('cart:add:')) {
    const cart = getOpenCartByThread(interaction.channel.id);
    if (!cart) {
      await interaction.reply({ content: 'Nao encontrei um carrinho aberto nesta thread.', ephemeral: true });
      return;
    }

    addItem(cart.id, Number(interaction.values[0]));
    await refreshCartMessage(interaction.channel, cart.id);
    await interaction.reply({ content: 'Produto adicionado ao carrinho.', ephemeral: true });
  }

  if (interaction.customId === 'ticket:create') {
    const categoryId = Number(interaction.values[0]);
    const thread = await interaction.channel.threads.create(
      privateThreadOptions(`ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80))
    );
    await thread.members.add(interaction.user.id);
    createTicket({ userId: interaction.user.id, threadId: thread.id, categoryId });
    await thread.send(`${interaction.user}, seu ticket foi aberto. Conte para a equipe o que voce precisa.`);
    await interaction.reply({ content: `Ticket criado: ${thread}.`, ephemeral: true });
  }
}

async function handleButton(interaction) {
  if (interaction.customId === 'store:buy') {
    const thread = await interaction.channel.threads.create(
      privateThreadOptions(`pedido-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80))
    );
    await thread.members.add(interaction.user.id);

    const cart = createCart({ userId: interaction.user.id, threadId: thread.id });
    const mainProducts = listProducts('main');
    const addons = listProducts('addon');

    await thread.send({
      content: `${interaction.user}, monte seu pedido abaixo.`,
      components: [
        ...(mainProducts.length ? [productsSelect(mainProducts, 'main')] : []),
        ...(addons.length ? [productsSelect(addons, 'addon')] : [])
      ]
    });
    await sendCart(thread, cart.id);
    await interaction.reply({ content: `Atendimento criado: ${thread}.`, ephemeral: true });
  }

  if (interaction.customId.startsWith('cart:')) {
    await handleCartButton(interaction);
  }

  if (interaction.customId.startsWith('payment:')) {
    await handlePaymentButton(interaction);
  }
}

async function handleCartButton(interaction) {
  const cart = getOpenCartByThread(interaction.channel.id);
  if (!cart) {
    await interaction.reply({ content: 'Esse carrinho ja foi fechado.', ephemeral: true });
    return;
  }

  const [, action, productId] = interaction.customId.split(':');

  if (action === 'inc') incrementItem(cart.id, Number(productId), 1);
  if (action === 'dec') incrementItem(cart.id, Number(productId), -1);
  if (action === 'remove') removeItem(cart.id, Number(productId));

  if (action === 'close') {
    closeCart(cart.id, 'cancelled');
    await interaction.reply('Pedido cancelado. Esta thread pode ser fechada pela equipe.');
    return;
  }

  if (action === 'checkout') {
    const total = getCartTotal(cart.id);
    if (total <= 0) {
      await interaction.reply({ content: 'Adicione pelo menos um produto antes de finalizar.', ephemeral: true });
      return;
    }

    const payment = createPayment({ cartId: cart.id, userId: interaction.user.id, amountCents: total });
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x16a34a)
          .setTitle('Pagamento PIX')
          .setDescription(pixInstructions(total, payment.id))
      ]
    });
    return;
  }

  await refreshCart(interaction, cart.id);
}

async function handlePaymentButton(interaction) {
  if (!isStaff(interaction.member)) {
    await interaction.reply({ content: 'Apenas a equipe pode revisar pagamentos.', ephemeral: true });
    return;
  }

  const [, action, paymentId] = interaction.customId.split(':');
  const reviewerId = interaction.user.id;

  if (action === 'reject') {
    const result = rejectPayment({ paymentId, reviewerId });
    if (!result.ok) {
      await interaction.reply({ content: reviewErrorMessage(result), ephemeral: true });
      return;
    }
    await interaction.reply('Pagamento reprovado. Cliente, envie um novo comprovante ou fale com a equipe.');
    return;
  }

  // Aprovacao: update do pagamento + venda + fechamento do carrinho sao
  // atomicos dentro do servico.
  const result = approvePayment({ paymentId, reviewerId });
  if (!result.ok) {
    await interaction.reply({ content: reviewErrorMessage(result), ephemeral: true });
    return;
  }

  const { sale } = result;
  await interaction.reply(`Pagamento aprovado. Venda \`${sale.id}\` registrada. A equipe pode entregar o produto.`);
  await logSale(interaction, sale);
}

function reviewErrorMessage(result) {
  if (result.reason === 'not_found') return 'Pagamento nao encontrado.';
  return 'Esse pagamento ja foi processado por outra pessoa. Nenhuma venda nova foi criada.';
}

async function refreshCart(interaction, cartId) {
  const items = getCartItems(cartId);
  const total = getCartTotal(cartId);
  await interaction.update({
    embeds: [cartEmbed(items, total)],
    components: cartItemRows(items)
  });
}

async function sendCart(channel, cartId) {
  const items = getCartItems(cartId);
  const total = getCartTotal(cartId);
  const message = await channel.send({
    embeds: [cartEmbed(items, total)],
    components: cartItemRows(items)
  });
  setCartMessageId(cartId, message.id);
}

async function refreshCartMessage(channel, cartId) {
  const cart = db.prepare('SELECT cart_message_id FROM carts WHERE id = ?').get(cartId);
  if (!cart?.cart_message_id) {
    await sendCart(channel, cartId);
    return;
  }

  const message = await channel.messages.fetch(cart.cart_message_id).catch(() => null);
  if (!message) {
    await sendCart(channel, cartId);
    return;
  }

  const items = getCartItems(cartId);
  const total = getCartTotal(cartId);
  await message.edit({
    embeds: [cartEmbed(items, total)],
    components: cartItemRows(items)
  });
}

async function logSale(interaction, sale) {
  if (!config.LOG_CHANNEL_ID) return;
  const channel = await interaction.guild.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle('Venda aprovada')
        .addFields(
          { name: 'Venda', value: sale.id, inline: true },
          { name: 'Cliente', value: `<@${sale.user_id}>`, inline: true },
          { name: 'Valor', value: formatBRL(sale.amount_cents), inline: true }
        )
    ]
  });
}

async function connectVoice(interaction) {
  const channelId = getSetting('voice_channel_id');
  if (!channelId) {
    await interaction.reply({ content: 'Configure um canal com `/voz-configurar` primeiro.', ephemeral: true });
    return;
  }

  const channel = await interaction.guild.channels.fetch(channelId);
  joinVoiceChannel({
    channelId: channel.id,
    guildId: interaction.guild.id,
    adapterCreator: interaction.guild.voiceAdapterCreator,
    selfDeaf: true
  });

  await interaction.reply({ content: `Conectado em ${channel}.`, ephemeral: true });
}

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

await client.login(config.DISCORD_TOKEN);
