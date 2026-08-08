import { CAMPAIGN_VARIANTS } from '../src/lib/email-campaign/variants';
import { DEFAULT_DESIGN, DEFAULT_SUBJECT, renderHtml, renderText, substitute } from '../src/lib/email-campaign/template';
import { analyzeSpamScore } from '../src/lib/email-campaign/spam-score';
const vars:any = { NOME:'Empresa Teste', EMPRESA:'EMPRESA TESTE LTDA', CNPJ:'12.345.678/0001-90', LINK:'https://certificadodigitalccmei.online/c/abc123', RAZAO_SOCIAL:'EMPRESA TESTE LTDA', NOME_FANTASIA:'Teste', SITUACAO:'CNPJ sem certificado pendente', DATA:'08/08/2026', REFERENCIA:'411BD505', REMETENTE:'Central MEI', EMPRESA_REMETENTE:'Central MEI Digital' };
const list = [{id:'__principal',name:'principal',subject:DEFAULT_SUBJECT,design:DEFAULT_DESIGN}, ...CAMPAIGN_VARIANTS.map(v=>({id:v.id,name:v.name,subject:v.subject,design:v.design}))];
for (const it of list) {
  const html = renderHtml(it.design as any, vars);
  const text = renderText(it.design as any, vars);
  const r = analyzeSpamScore({ subject: substitute(it.subject, vars), html, text, fromAddress:'certificado@notify.seu-certificado-mei-digital.online' });
  console.log('==', it.id, r.score, r.verdict);
  for (const i of r.issues) console.log('   -', i.id, i.penalty, i.detail.slice(0,140));
}
