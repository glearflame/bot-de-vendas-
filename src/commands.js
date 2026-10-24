import {
  SlashCommandBuilder,
  PermissionFlagsBits
} from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('setup-loja')
    .setDescription('Cria o painel publico da loja.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('produto-adicionar')
    .setDescription('Cadastra um produto na loja.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) => option.setName('nome').setDescription('Nome do produto').setRequired(true))
    .addStringOption((option) => option.setName('preco').setDescription('Preco em reais, ex: 19,90').setRequired(true))
    .addStringOption((option) => option.setName('tipo').setDescription('Tipo de produto').setRequired(true)
      .addChoices(
        { name: 'Produto principal', value: 'main' },
        { name: 'Complemento', value: 'addon' }
      ))
    .addStringOption((option) => option.setName('descricao').setDescription('Descricao curta').setRequired(false)),

  new SlashCommandBuilder()
    .setName('produto-listar')
    .setDescription('Lista os produtos cadastrados.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('produto-preco')
    .setDescription('Atualiza o preco de um produto (carrinhos abertos mantem o preco congelado).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption((option) => option.setName('id').setDescription('ID do produto').setRequired(true))
    .addStringOption((option) => option.setName('preco').setDescription('Novo preco em reais, ex: 19,90').setRequired(true)),

  new SlashCommandBuilder()
    .setName('categoria-ticket')
    .setDescription('Cadastra uma categoria de ticket.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) => option.setName('nome').setDescription('Nome da categoria').setRequired(true))
    .addStringOption((option) => option.setName('descricao').setDescription('Descricao').setRequired(false))
    .addStringOption((option) => option.setName('emoji').setDescription('Emoji').setRequired(false)),

  new SlashCommandBuilder()
    .setName('painel-tickets')
    .setDescription('Cria o painel publico de tickets.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('voz-configurar')
    .setDescription('Configura o canal de voz do bot.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) => option.setName('canal').setDescription('Canal de voz').setRequired(true)),

  new SlashCommandBuilder()
    .setName('voz-conectar')
    .setDescription('Conecta o bot ao canal de voz configurado.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('vendas-historico')
    .setDescription('Mostra as ultimas vendas registradas.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('entrega-confirmar')
    .setDescription('Marca uma venda como entregue.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) => option.setName('venda').setDescription('ID da venda').setRequired(true)),

  new SlashCommandBuilder()
    .setName('ticket-fechar')
    .setDescription('Fecha o ticket da thread atual.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads),

  new SlashCommandBuilder()
    .setName('threads-limpar')
    .setDescription('Lista ou arquiva threads de compra/ticket sem atividade.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads)
    .addIntegerOption((option) => option
      .setName('dias')
      .setDescription('Inatividade minima em dias (padrao: 7)')
      .setMinValue(1)
      .setRequired(false))
    .addBooleanOption((option) => option
      .setName('dry-run')
      .setDescription('Apenas listar, sem arquivar (padrao: true)')
      .setRequired(false))
].map((command) => command.toJSON());
