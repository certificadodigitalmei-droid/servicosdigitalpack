import * as React from 'react'
import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  empresa?: string
  cnpj?: string
  link?: string
  pixCode?: string
  protocolo?: string
  dataSolicitacao?: string
  validade?: string
}

const Email = ({
  empresa, cnpj, link, pixCode, protocolo, dataSolicitacao, validade }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Guia de pagamento emitida — Certificado Digital e-CNPJ (MEI)</Preview>
    <Body style={main}>
      <Container style={outer}>
        <Section style={topBar} />
        <Section style={header}>
          <Row>
            <Column>
              <Text style={org}>PORTAL CERTIFICADO DIGITAL MEI</Text>
              <Text style={orgSub}>Central de Emissão — Microempreendedor Individual</Text>
            </Column>
            <Column style={{ textAlign: 'right' as const }}>
              <Text style={protoLabel}>PROTOCOLO</Text>
              <Text style={protoValue}>{protocolo || '—'}</Text>
            </Column>
          </Row>
        </Section>

        <Section style={card}>
          <Section style={statusStrip}>
            <Text style={statusText}>SITUAÇÃO: AGUARDANDO PAGAMENTO DA GUIA</Text>
          </Section>

          <Heading style={h1}>Guia de pagamento disponível</Heading>

          <Text style={text}>
            Prezado(a) contribuinte, registramos a solicitação de emissão do
            <strong> Certificado Digital e-CNPJ</strong> referente à inscrição abaixo.
          </Text>

          <Section style={dataBox}>
            <Text style={dataTitle}>DADOS DO REQUERENTE</Text>
            <Row style={dataRow}>
              <Column style={dataKey}>Razão Social</Column>
              <Column style={dataVal}>{empresa || '—'}</Column>
            </Row>
            <Row style={dataRow}>
              <Column style={dataKey}>CNPJ</Column>
              <Column style={dataVal}>{cnpj || '—'}</Column>
            </Row>
            <Row style={dataRow}>
              <Column style={dataKey}>Protocolo</Column>
              <Column style={dataVal}>{protocolo || '—'}</Column>
            </Row>
            <Row style={dataRow}>
              <Column style={dataKey}>Solicitado em</Column>
              <Column style={dataVal}>{dataSolicitacao || '—'}</Column>
            </Row>
            <Row style={dataRow}>
              <Column style={dataKey}>Validade</Column>
              <Column style={dataVal}>{validade || '12 meses'}</Column>
            </Row>
            <Row style={dataRowLast}>
              <Column style={dataKey}>Situação</Column>
              <Column style={dataValWarn}>Aguardando pagamento</Column>
            </Row>
          </Section>

          <Text style={text}>
            Após a confirmação do pagamento, o Certificado Digital é
            <strong> emitido e vinculado automaticamente ao CNPJ</strong>, sem necessidade de
            qualquer outra etapa ou comparecimento presencial.
          </Text>

          {link ? (
            <Section style={{ margin: '0 0 22px' }}>
              <Link style={button} href={link}>
                Acessar guia de pagamento
              </Link>
            </Section>
          ) : null}

          {pixCode ? (
            <Section style={pixBox}>
              <Text style={pixLabel}>PIX COPIA E COLA</Text>
              <Text style={pixValue}>{pixCode}</Text>
            </Section>
          ) : null}

          <Hr style={hr} />
          <Text style={note}>
            Comunicado automático referente à solicitação registrada em nosso portal. Caso o
            pagamento já tenha sido efetuado, desconsidere esta mensagem.
          </Text>
        </Section>

        <Section style={footerBox}>
          <Text style={footer}>
            Portal Certificado Digital MEI — Microempreendedor Individual.
            <br />
            Serviço privado de apoio ao MEI. Este e-mail foi enviado automaticamente; não responda.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Guia de pagamento emitida — Certificado Digital e-CNPJ',
  displayName: 'PIX gerado — guia disponível',
  previewData: {
    empresa: 'EMPRESA EXEMPLO MEI LTDA',
    cnpj: '12.345.678/0001-90',
    link: 'https://certificadodigitalccmei.online/c/exemplo',
    pixCode: '00020126...5802BR6009SAO PAULO62070503***6304ABCD',
    protocolo: 'CD-4F21A9B7',
    dataSolicitacao: '31/07/2026 09:14',
    validade: '12 meses',
  },
} satisfies TemplateEntry

const BRAND = '#1a4a8a'
const BRAND_DARK = '#0e3a70'

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif', margin: '0' }
const outer = { maxWidth: '620px', padding: '0', margin: '0 auto' }
const topBar = { height: '5px', backgroundColor: '#f2c200', lineHeight: '5px', fontSize: '1px' }
const header = { backgroundColor: BRAND_DARK, padding: '18px 22px' }
const org = { color: '#ffffff', fontSize: '13.5px', fontWeight: 'bold' as const, margin: '0', letterSpacing: '0.4px' }
const orgSub = { color: '#c9d8ec', fontSize: '10px', margin: '4px 0 0' }
const protoLabel = { color: '#9fbad8', fontSize: '9px', margin: '0', letterSpacing: '1px' }
const protoValue = { color: '#ffffff', fontSize: '11.5px', fontWeight: 'bold' as const, margin: '2px 0 0' }
const card = { padding: '22px', border: '1px solid #e2e6e4', borderTop: 'none' }
const statusStrip = {
  backgroundColor: '#fff8e1',
  borderLeft: '4px solid #f2c200',
  padding: '9px 12px',
  margin: '0 0 18px',
}
const statusText = { fontSize: '11px', color: '#7a5c00', fontWeight: 'bold' as const, margin: '0', letterSpacing: '0.4px' }
const h1 = { fontSize: '17px', fontWeight: 'bold' as const, color: '#111111', margin: '0 0 14px' }
const text = { fontSize: '13px', color: '#333333', lineHeight: '1.65', margin: '0 0 16px' }
const dataBox = { border: '1px solid #e2e6e4', borderRadius: '6px', padding: '0', margin: '0 0 20px' }
const dataTitle = {
  fontSize: '10px',
  letterSpacing: '1px',
  color: '#5b6b64',
  fontWeight: 'bold' as const,
  margin: '0',
  padding: '9px 14px',
  backgroundColor: '#f4f7f5',
  borderBottom: '1px solid #e2e6e4',
}
const dataRow = { borderBottom: '1px solid #eef1ef' }
const dataRowLast = {}
const dataKey = {
  fontSize: '11px',
  color: '#6b7671',
  padding: '9px 14px',
  width: '38%',
  verticalAlign: 'top' as const,
}
const dataVal = { fontSize: '11.5px', color: '#111111', padding: '9px 14px', fontWeight: 'bold' as const }
const dataValWarn = { fontSize: '11.5px', color: '#a05a00', padding: '9px 14px', fontWeight: 'bold' as const }
const button = {
  backgroundColor: BRAND,
  color: '#ffffff',
  fontSize: '13.5px',
  borderRadius: '6px',
  padding: '13px 24px',
  textDecoration: 'none',
  display: 'inline-block',
  fontWeight: 'bold' as const,
}
const pixBox = { backgroundColor: '#f4f7f5', borderRadius: '6px', padding: '13px 15px', margin: '0 0 18px' }
const pixLabel = { fontSize: '10px', color: '#5b6b64', margin: '0 0 6px', fontWeight: 'bold' as const, letterSpacing: '1px' }
const pixValue = { fontSize: '11px', color: '#111111', margin: '0', wordBreak: 'break-all' as const, fontFamily: 'Courier New, monospace' }
const hr = { borderColor: '#e5e7eb', margin: '22px 0 14px' }
const note = { fontSize: '10.5px', color: '#8a8f98', lineHeight: '1.55', margin: '0' }
const footerBox = { backgroundColor: '#f4f7f5', padding: '16px 22px', borderRadius: '0 0 4px 4px' }
const footer = { fontSize: '10px', color: '#6b7671', lineHeight: '1.6', margin: '0' }

export default Email
