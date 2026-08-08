/**
 * Analisador de score de spam (heurísticas no estilo SpamAssassin / Mail-Tester).
 *
 * Roda 100% no cliente/servidor sem dependências externas: aplica regras sobre
 * o assunto, o HTML e a versão texto de cada modelo de campanha e devolve uma
 * nota de 0 a 10 (10 = melhor, igual ao Mail-Tester) com a lista de penalidades.
 *
 * Não substitui um teste real de entrega — serve para bloquear erros óbvios
 * ANTES de disparar a campanha.
 */

export type SpamRule = {
  id: string;
  label: string;
  /** Penalidade em pontos (0 quando a regra passou). */
  penalty: number;
  /** Detalhe do que foi encontrado. */
  detail: string;
  severity: 'ok' | 'aviso' | 'critico';
};

export type SpamReport = {
  /** Nota de 0 a 10 (uma casa decimal). */
  score: number;
  rules: SpamRule[];
  /** Somente as regras com penalidade. */
  issues: SpamRule[];
  verdict: 'excelente' | 'bom' | 'atencao' | 'risco';
  stats: {
    subjectLength: number;
    textLength: number;
    htmlLength: number;
    linkCount: number;
    imageCount: number;
    textToHtmlRatio: number;
    capsRatio: number;
    exclamations: number;
    triggerWords: string[];
  };
};

/** Palavras/expressões que os filtros PT-BR tratam como gatilho. */
const TRIGGER_WORDS: { word: string; weight: number }[] = [
  { word: 'grátis', weight: 0.6 },
  { word: 'gratis', weight: 0.6 },
  { word: 'promoção', weight: 0.5 },
  { word: 'desconto', weight: 0.4 },
  { word: 'oferta', weight: 0.4 },
  { word: 'clique aqui', weight: 0.5 },
  { word: 'urgente', weight: 0.7 },
  { word: 'última chance', weight: 0.7 },
  { word: 'imperdível', weight: 0.6 },
  { word: 'garantido', weight: 0.4 },
  { word: 'dinheiro', weight: 0.4 },
  { word: 'renda extra', weight: 0.8 },
  { word: 'ganhe', weight: 0.4 },
  { word: 'bloqueio', weight: 0.5 },
  { word: 'bloqueado', weight: 0.5 },
  { word: 'multa', weight: 0.5 },
  { word: 'processo', weight: 0.3 },
  { word: 'cancelamento', weight: 0.3 },
  { word: 'suspensão', weight: 0.4 },
  { word: 'dívida', weight: 0.5 },
  { word: 'juros', weight: 0.4 },
  { word: 'cobrança', weight: 0.4 },
  { word: 'ação judicial', weight: 0.8 },
  { word: 'penhora', weight: 0.8 },
  { word: 'seu cpf', weight: 0.3 },
  { word: 'confirme seus dados', weight: 0.8 },
  { word: 'atualize seus dados', weight: 0.6 },
  { word: 'clique no link', weight: 0.4 },
  { word: '100%', weight: 0.3 },
  { word: 'r$', weight: 0.2 },
];

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function capsRatioOf(text: string): number {
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length < 20) return 0;
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, '').length;
  return upper / letters.length;
}

export type SpamScoreInput = {
  subject: string;
  html: string;
  text?: string;
  fromAddress?: string;
  hasUnsubscribe?: boolean;
};

export function analyzeSpamScore(input: SpamScoreInput): SpamReport {
  const subject = (input.subject || '').trim();
  const html = input.html || '';
  const plain = (input.text && input.text.trim()) || stripHtml(html);
  const lower = `${subject}\n${plain}`.toLowerCase();

  const links = html.match(/href\s*=\s*["']([^"']+)["']/gi) ?? [];
  const images = html.match(/<img\b/gi) ?? [];
  const exclamations = (subject.match(/!/g) ?? []).length + (plain.match(/!/g) ?? []).length;
  const ratio = html.length > 0 ? plain.length / html.length : 0;
  const capsSubject = capsRatioOf(subject);
  const capsBody = capsRatioOf(plain);

  const found = TRIGGER_WORDS.filter((t) => lower.includes(t.word));
  const rules: SpamRule[] = [];

  const push = (
    id: string,
    label: string,
    penalty: number,
    detail: string,
    critical = false,
  ) => {
    rules.push({
      id,
      label,
      penalty: Math.max(0, Number(penalty.toFixed(2))),
      detail,
      severity: penalty <= 0 ? 'ok' : critical || penalty >= 1 ? 'critico' : 'aviso',
    });
  };

  // 1. Assunto
  if (!subject) push('subject_empty', 'Assunto preenchido', 2.5, 'Assunto vazio.', true);
  else if (subject.length > 78)
    push('subject_len', 'Tamanho do assunto', 0.6, `${subject.length} caracteres (ideal até 60).`);
  else if (subject.length < 15)
    push('subject_len', 'Tamanho do assunto', 0.4, `${subject.length} caracteres (muito curto).`);
  else push('subject_len', 'Tamanho do assunto', 0, `${subject.length} caracteres — ideal.`);

  // 2. Caixa alta no assunto
  if (capsSubject > 0.5)
    push('subject_caps', 'Caixa alta no assunto', 1.5, `${Math.round(capsSubject * 100)}% em maiúsculas.`, true);
  else if (capsSubject > 0.3)
    push('subject_caps', 'Caixa alta no assunto', 0.7, `${Math.round(capsSubject * 100)}% em maiúsculas.`);
  else push('subject_caps', 'Caixa alta no assunto', 0, 'Sem excesso de maiúsculas.');

  // 3. Pontuação exagerada
  if (exclamations > 4)
    push('punctuation', 'Pontuação exagerada', 0.9, `${exclamations} exclamações no e-mail.`);
  else if (exclamations > 1)
    push('punctuation', 'Pontuação exagerada', 0.4, `${exclamations} exclamações.`);
  else push('punctuation', 'Pontuação exagerada', 0, 'Pontuação equilibrada.');

  // 4. Caixa alta no corpo
  if (capsBody > 0.25)
    push('body_caps', 'Caixa alta no corpo', 1.0, `${Math.round(capsBody * 100)}% do texto em maiúsculas.`, true);
  else if (capsBody > 0.15)
    push('body_caps', 'Caixa alta no corpo', 0.5, `${Math.round(capsBody * 100)}% em maiúsculas.`);
  else push('body_caps', 'Caixa alta no corpo', 0, 'Uso normal de maiúsculas.');

  // 5. Palavras gatilho
  const triggerPenalty = Math.min(2.5, found.reduce((s, t) => s + t.weight, 0));
  if (found.length)
    push(
      'trigger_words',
      'Palavras gatilho de spam',
      triggerPenalty,
      `${found.length} encontrada(s): ${found.map((t) => t.word).join(', ')}.`,
      triggerPenalty >= 1.5,
    );
  else push('trigger_words', 'Palavras gatilho de spam', 0, 'Nenhuma palavra de risco encontrada.');

  // 6. Proporção texto/HTML
  if (ratio < 0.05)
    push('text_ratio', 'Proporção texto/HTML', 1.0, `${(ratio * 100).toFixed(1)}% — HTML muito pesado.`, true);
  else if (ratio < 0.1)
    push('text_ratio', 'Proporção texto/HTML', 0.5, `${(ratio * 100).toFixed(1)}% — pouco texto real.`);
  else push('text_ratio', 'Proporção texto/HTML', 0, `${(ratio * 100).toFixed(1)}% — saudável.`);

  // 7. Versão texto puro
  if (!input.text || input.text.trim().length < 80)
    push('plain_text', 'Versão em texto puro', 1.2, 'Sem alternativa text/plain consistente.', true);
  else push('plain_text', 'Versão em texto puro', 0, `${input.text.trim().length} caracteres.`);

  // 8. Quantidade de texto
  if (plain.length < 200)
    push('body_length', 'Quantidade de texto', 0.8, `${plain.length} caracteres — corpo curto demais.`);
  else if (plain.length > 5000)
    push('body_length', 'Quantidade de texto', 0.3, `${plain.length} caracteres — muito longo.`);
  else push('body_length', 'Quantidade de texto', 0, `${plain.length} caracteres.`);

  // 9. Imagens x texto
  if (images.length > 0 && plain.length < 400)
    push('image_heavy', 'E-mail só de imagem', 1.2, `${images.length} imagem(ns) com pouco texto.`, true);
  else if (images.length > 6)
    push('image_heavy', 'E-mail só de imagem', 0.5, `${images.length} imagens.`);
  else push('image_heavy', 'E-mail só de imagem', 0, `${images.length} imagem(ns).`);

  // 10. Links
  const urls = links.map((l) => l.replace(/^href\s*=\s*["']/i, '').replace(/["']$/, ''));
  const shorteners = urls.filter((u) => /(bit\.ly|tinyurl|is\.gd|goo\.gl|cutt\.ly|encurta)/i.test(u));
  const rawIp = urls.filter((u) => /https?:\/\/\d+\.\d+\.\d+\.\d+/.test(u));
  if (shorteners.length || rawIp.length)
    push(
      'link_quality',
      'Qualidade dos links',
      1.5,
      `${shorteners.length} encurtador(es) e ${rawIp.length} link(s) por IP.`,
      true,
    );
  else if (urls.length > 12)
    push('link_quality', 'Qualidade dos links', 0.6, `${urls.length} links no e-mail.`);
  else if (urls.length === 0)
    push('link_quality', 'Qualidade dos links', 0.3, 'Nenhum link — CTA ausente.');
  else push('link_quality', 'Qualidade dos links', 0, `${urls.length} link(s) próprios.`);

  // 11. Descadastro
  const unsub =
    input.hasUnsubscribe ?? /descadastr|cancelar\s+inscri|unsubscribe|remover\s+da\s+lista/i.test(plain);
  if (!unsub)
    push('unsubscribe', 'Opção de descadastro', 0.8, 'Sem link/aviso de descadastro no rodapé.');
  else push('unsubscribe', 'Opção de descadastro', 0, 'Descadastro presente.');

  // 12. Estrutura HTML
  const hasBody = /<body[\s>]/i.test(html);
  const hasTitleTag = /<title[\s>]/i.test(html);
  if (!hasBody)
    push('html_struct', 'Estrutura HTML', 0.5, 'HTML sem <body> completo.');
  else if (!hasTitleTag)
    push('html_struct', 'Estrutura HTML', 0.2, 'HTML sem <title>.');
  else push('html_struct', 'Estrutura HTML', 0, 'HTML bem formado.');

  // 13. Cores de alarme (vermelho forte é gatilho visual/heurístico)
  const reds = (html.match(/#(dc2626|ef4444|b91c1c|991b1b|f00|ff0000|e11d48)/gi) ?? []).length;
  if (reds > 3) push('alarm_colors', 'Cores de alarme', 0.5, `${reds} usos de vermelho forte.`);
  else push('alarm_colors', 'Cores de alarme', 0, 'Paleta sem excesso de vermelho.');

  // 14. Remetente
  if (input.fromAddress && /@(gmail|hotmail|outlook|yahoo|bol|uol)\./i.test(input.fromAddress))
    push('from_domain', 'Domínio do remetente', 1.5, 'Remetente em domínio gratuito.', true);
  else push('from_domain', 'Domínio do remetente', 0, 'Domínio próprio de envio.');

  // 15. Variáveis não substituídas ({{X}} sobrando quebra a leitura e é gatilho)
  const leftovers = Array.from(
    new Set([...(`${subject} ${plain}`.match(/\{\{\s*[A-Z0-9_]+\s*\}\}/g) ?? [])]),
  );
  if (leftovers.length)
    push(
      'unresolved_vars',
      'Variáveis substituídas',
      1.0,
      `Sobraram: ${leftovers.join(', ')}.`,
      true,
    );
  else push('unresolved_vars', 'Variáveis substituídas', 0, 'Nenhuma variável sobrando.');

  // 16. Imagens sem texto alternativo
  const imgsNoAlt = (html.match(/<img\b(?![^>]*\balt\s*=)[^>]*>/gi) ?? []).length;
  if (imgsNoAlt > 0)
    push('img_alt', 'Texto alternativo nas imagens', 0.4, `${imgsNoAlt} imagem(ns) sem alt.`);
  else push('img_alt', 'Texto alternativo nas imagens', 0, 'Todas as imagens têm alt.');

  // 17. Tamanho do HTML (acima de ~102 KB o Gmail corta a mensagem)
  if (html.length > 102000)
    push('html_size', 'Tamanho do HTML', 0.8, `${Math.round(html.length / 1024)} KB — o Gmail corta.`);
  else push('html_size', 'Tamanho do HTML', 0, `${Math.round(html.length / 1024)} KB.`);

  // 18. Cabeçalho List-Unsubscribe — o Mail-Tester penaliza a ausência e a API
  // de envio atual não permite injetar esse cabeçalho.
  push(
    'list_unsubscribe',
    'Cabeçalho List-Unsubscribe',
    0.8,
    'O provedor de envio não expõe esse cabeçalho; o Mail-Tester desconta por isso.',
  );

  // 19. Fatores que só um teste real mede (SPF/DKIM/DMARC, blacklists,
  // reputação do IP e do domínio). Nunca damos nota cheia sem esse teste.
  push(
    'infra_unverified',
    'Autenticação e reputação (não verificável aqui)',
    0.7,
    'SPF, DKIM, DMARC, blacklists e reputação do IP só são medidos no envio real (Mail-Tester).',
  );

  const totalPenalty = rules.reduce((s, r) => s + r.penalty, 0);
  const score = Math.max(0, Math.min(10, 10 - totalPenalty));
  const rounded = Number(score.toFixed(1));


  return {
    score: rounded,
    rules,
    issues: rules.filter((r) => r.penalty > 0).sort((a, b) => b.penalty - a.penalty),
    verdict: rounded >= 8 ? 'excelente' : rounded >= 6.5 ? 'bom' : rounded >= 4.5 ? 'atencao' : 'risco',
    stats: {
      subjectLength: subject.length,
      textLength: plain.length,
      htmlLength: html.length,
      linkCount: urls.length,
      imageCount: images.length,
      textToHtmlRatio: Number((ratio * 100).toFixed(1)),
      capsRatio: Number((Math.max(capsSubject, capsBody) * 100).toFixed(0)),
      exclamations,
      triggerWords: found.map((t) => t.word),
    },
  };
}
