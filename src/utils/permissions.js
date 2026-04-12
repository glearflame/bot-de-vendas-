import { config } from '../config.js';

export function isStaff(member) {
  return member?.roles?.cache?.has(config.STAFF_ROLE_ID);
}

export function requireStaff(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({
      content: 'Apenas a equipe pode usar este comando.',
      ephemeral: true
    });
  }

  return null;
}
