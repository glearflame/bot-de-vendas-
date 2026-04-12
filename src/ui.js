import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  StringSelectMenuBuilder
} from 'discord.js';
import { formatBRL } from './utils/money.js';

export function storePanelEmbed() {
  return new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle('Loja')
    .setDescription('Clique em comprar para abrir seu atendimento privado e montar seu pedido.');
}

export function storePanelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('store:buy')
        .setLabel('Comprar')
        .setStyle(ButtonStyle.Success)
    )
  ];
}

export function productsSelect(products, type) {
  const label = type === 'main' ? 'Escolha o produto principal' : 'Adicionar complementos';
  const customId = type === 'main' ? 'cart:add:main' : 'cart:add:addon';

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(label)
      .addOptions(products.slice(0, 25).map((product) => ({
        label: product.name.slice(0, 100),
        description: formatBRL(product.price_cents),
        value: String(product.id)
      })))
  );
}

export function cartEmbed(items, totalCents) {
  const mains = items.filter((item) => item.type === 'main');
  const addons = items.filter((item) => item.type === 'addon');

  const embed = new EmbedBuilder()
    .setColor(0x2563eb)
    .setTitle('Seu carrinho')
    .setDescription(items.length ? 'Confira seu pedido antes de finalizar.' : 'Seu carrinho ainda esta vazio.')
    .addFields(
      {
        name: 'Produtos principais',
        value: formatItems(mains),
        inline: false
      },
      {
        name: 'Complementos',
        value: formatItems(addons),
        inline: false
      },
      {
        name: 'Total',
        value: `**${formatBRL(totalCents)}**`,
        inline: false
      }
    );

  return embed;
}

export function cartItemRows(items) {
  const rows = [];

  for (const item of items.slice(0, 4)) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`cart:dec:${item.id}`)
          .setLabel(`-1 ${item.name}`.slice(0, 80))
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`cart:inc:${item.id}`)
          .setLabel(`+1 ${item.name}`.slice(0, 80))
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`cart:remove:${item.id}`)
          .setLabel('Remover')
          .setStyle(ButtonStyle.Danger)
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('cart:checkout')
        .setLabel('Finalizar pedido')
        .setStyle(ButtonStyle.Success)
        .setDisabled(items.length === 0),
      new ButtonBuilder()
        .setCustomId('cart:close')
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return rows;
}

export function paymentReviewRows(paymentId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`payment:approve:${paymentId}`)
        .setLabel('Aprovar pagamento')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`payment:reject:${paymentId}`)
        .setLabel('Reprovar')
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

export function ticketPanelEmbed() {
  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle('Atendimento')
    .setDescription('Escolha uma categoria para abrir um ticket privado com a equipe.');
}

export function ticketSelect(categories) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket:create')
      .setPlaceholder('Abrir ticket')
      .addOptions(categories.slice(0, 25).map((category) => ({
        label: category.name,
        description: category.description || 'Atendimento',
        emoji: category.emoji,
        value: String(category.id)
      })))
  );
}

export function privateThreadOptions(name) {
  return {
    name,
    autoArchiveDuration: 1440,
    type: ChannelType.PrivateThread,
    invitable: false
  };
}

function formatItems(items) {
  if (!items.length) return 'Nenhum item.';

  return items
    .map((item) => `**${item.quantity}x** ${item.name} - ${formatBRL(item.subtotal_cents)}`)
    .join('\n');
}
