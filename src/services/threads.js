// Servico de limpeza de threads inativas. A selecao e uma funcao pura (apenas
// leitura) para poder ser testada com um banco SQLite em memoria. A execucao
// recebe o guild do Discord, entao os testes usam um client mockado.
const DAY_MS = 24 * 60 * 60 * 1000;

function toSqliteTimestamp(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export function selectInactiveThreads(db, { days = 7, now = new Date() } = {}) {
  const cutoff = toSqliteTimestamp(new Date(now.getTime() - days * DAY_MS));

  // Uma thread pode ter carrinho (pedido) ou ticket. Quando existe carrinho,
  // ele e a fonte de atividade; tickets so entram quando a thread nao tem
  // carrinho registrado. Em ambos os casos a thread e excluida se houver
  // carrinho aberto, pagamento com comprovante aguardando revisao, ticket
  // fechado ou registro em archived_threads.
  return db.prepare(`
    SELECT
      c.thread_id AS threadId,
      c.user_id AS userId,
      'cart' AS kind,
      COALESCE(c.updated_at, c.created_at) AS lastActivity,
      c.id AS cartId,
      NULL AS ticketId
    FROM carts c
    WHERE COALESCE(c.updated_at, c.created_at) < @cutoff
      AND c.status <> 'open'
      AND NOT EXISTS (
        SELECT 1 FROM carts c2
        WHERE c2.thread_id = c.thread_id AND c2.status = 'open'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM payments p
        JOIN carts pc ON pc.id = p.cart_id
        WHERE pc.thread_id = c.thread_id AND p.status = 'proof_sent'
      )
      AND NOT EXISTS (
        SELECT 1 FROM tickets t
        WHERE t.thread_id = c.thread_id AND t.status = 'closed'
      )
      AND NOT EXISTS (
        SELECT 1 FROM archived_threads a WHERE a.thread_id = c.thread_id
      )

    UNION ALL

    SELECT
      t.thread_id AS threadId,
      t.user_id AS userId,
      'ticket' AS kind,
      t.created_at AS lastActivity,
      NULL AS cartId,
      t.id AS ticketId
    FROM tickets t
    WHERE t.created_at < @cutoff
      AND t.status <> 'closed'
      AND NOT EXISTS (
        SELECT 1 FROM carts c WHERE c.thread_id = t.thread_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM archived_threads a WHERE a.thread_id = t.thread_id
      )

    ORDER BY lastActivity ASC
  `).all({ cutoff });
}

export function markThreadArchived(db, threadId, archivedBy = null) {
  db.prepare(`
    INSERT INTO archived_threads (thread_id, archived_by)
    VALUES (?, ?)
    ON CONFLICT(thread_id) DO NOTHING
  `).run(threadId, archivedBy);
}

async function resolveThread(guild, threadId) {
  const thread = await guild.channels.fetch(threadId);
  if (!thread) throw new Error(`Thread ${threadId} nao encontrada.`);
  return thread;
}

// Executa a limpeza. Em dry-run nada e alterado no Discord nem no banco.
// Falhas individuais sao coletadas para nao interromper as demais threads.
export async function runThreadsCleanup({
  db,
  guild,
  days = 7,
  dryRun = true,
  archivedBy = null,
  now = new Date()
}) {
  const candidates = selectInactiveThreads(db, { days, now });

  if (dryRun) {
    return { dryRun: true, candidates, archived: [], errors: [] };
  }

  const archived = [];
  const errors = [];

  for (const candidate of candidates) {
    try {
      const thread = await resolveThread(guild, candidate.threadId);

      // Thread ja arquivada nao deve gerar erro; apenas registra para que as
      // proximas execucoes nao a selecionem de novo.
      if (!thread.archived) {
        await thread.setArchived(true, 'Limpeza automatica de threads inativas.');
      }

      markThreadArchived(db, candidate.threadId, archivedBy);
      archived.push(candidate);
    } catch (error) {
      errors.push({ threadId: candidate.threadId, message: error.message });
    }
  }

  return { dryRun: false, candidates, archived, errors };
}
