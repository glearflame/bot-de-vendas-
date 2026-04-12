import { config } from '../config.js';
import { formatBRL } from '../utils/money.js';

export function pixInstructions(amountCents, paymentId) {
  return [
    `Valor: **${formatBRL(amountCents)}**`,
    `Chave PIX: \`${config.PIX_KEY}\``,
    `Recebedor: **${config.PIX_RECEIVER}**`,
    `Cidade: **${config.PIX_CITY}**`,
    `Identificador do pedido: \`${paymentId}\``,
    '',
    'Depois de pagar, envie o comprovante nesta thread como imagem ou PDF.'
  ].join('\n');
}
