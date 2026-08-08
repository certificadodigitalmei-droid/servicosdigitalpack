import { CAMPAIGN_VARIANTS } from './src/lib/email-campaign/variants';
import { renderHtml, renderText, substitute } from './src/lib/email-campaign/template';
import { analyzeSpamScore } from './src/lib/email-campaign/spam-score';
const V:Record<string,string>={NOME_EMPRESARIAL:'RAFAEL VALE DA SILVA',RAZAO_SOCIAL:'RAFAEL VALE DA SILVA',NOME_TITULAR:'RAFAEL VALE DA SILVA',CNPJ:'68087737000127',DATA_ABERTURA:'15/03/2024',DATA_SITUACAO:'15/03/2024',SITUACAO:'CNPJ sem certificado pendente',MUNICIPIO:'SÃO PAULO',UF:'SP',EMAIL:'e@e.com',LINK_PUBLICO:'https://x.com/c/abc',LINK_CHECKOUT:'https://x.com/checkout',TOKEN:'a',REFERENCIA:'REF-000001',NOME_REMETENTE:'Central de Atendimento',EMPRESA_REMETENTE:'Certificado Digital MEI'};
for (const v of CAMPAIGN_VARIANTS){
 const r=analyzeSpamScore({subject:substitute(v.subject,V),html:renderHtml(v.design,V),text:renderText(v.design,V),fromAddress:'a@seu-certificado-mei-digital.online'});
 console.log(v.id, r.score, JSON.stringify(r.issues.map(i=>i.id+':'+i.penalty+' '+i.detail)));
}
