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
  protocolo?: string
  dataSolicitacao?: string
}

const Email = ({
  empresa, cnpj, link, protocolo, dataSolicitacao }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head>
      <style>{`
        @media only screen and (max-width:600px) {
          .rowKey, .rowVal { display:block !important; width:100% !important; padding:6px 12px !important; }
          .rowKey { padding-bottom:0 !important; }
        }
      `}</style>
    </Head>
    <Preview>Pendência registrada: guia do Certificado Digital não quitada</Preview>
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
            <Text style={statusText}>AVISO DE PENDÊNCIA — EMISSÃO BLOQUEADA</Text>
          </Section>

          <Heading style={h1}>Guia de pagamento pendente</Heading>

          <Text style={text}>
            A guia da inscrição abaixo
            <strong> permanece PENDENTE</strong> em nosso sistema.
          </Text>

          <Section style={dataBox}>
            <Text style={dataTitle}>DADOS DA SOLICITAÇÃO</Text>
            <Row style={dataRow}>
              <Column className="rowKey" style={dataKey}>Razão Social</Column>
              <Column className="rowVal" style={dataVal}>{empresa || '—'}</Column>
            </Row>
            <Row style={dataRow}>
              <Column className="rowKey" style={dataKey}>CNPJ</Column>
              <Column className="rowVal" style={dataVal}>{cnpj || '—'}</Column>
            </Row>
            <Row style={dataRow}>
              <Column className="rowKey" style={dataKey}>Protocolo</Column>
              <Column className="rowVal" style={dataVal}>{protocolo || '—'}</Column>
            </Row>
            <Row style={dataRow}>
              <Column className="rowKey" style={dataKey}>Solicitado em</Column>
              <Column className="rowVal" style={dataVal}>{dataSolicitacao || '—'}</Column>
            </Row>
            <Row style={dataRowLast}>
              <Column className="rowKey" style={dataKey}>Situação</Column>
              <Column className="rowVal" style={dataValAlert}>Pendente de pagamento</Column>
            </Row>
          </Section>

          <Text style={text}>
            Enquanto pendente, a emissão fica
            <strong> bloqueada</strong>, o que pode acarretar:
          </Text>

          <Section style={listBox}>
            <Text style={listItem}>• Sem acesso ao e-CAC e ao Gov.br</Text>
            <Text style={listItem}>• Restrições na emissão de notas fiscais</Text>
            <Text style={listItem}>• Atraso em obrigações do CNPJ</Text>
            <Text style={listItemLast}>• Cancelamento automático da solicitação</Text>
          </Section>

          <Text style={text}>
            Regularize a guia para vincular o certificado ao CNPJ.
          </Text>

          {link ? (
            <Section style={{ margin: '0 0 22px' }}>
              <Link style={button} href={link}>
                Regularizar agora
              </Link>
            </Section>
          ) : null}

          <Hr style={hr} />
          <Text style={note}>
            Se pagou nos últimos minutos, desconsidere este aviso.
          </Text>
        </Section>

        <Section style={footerBox}>
          <Text style={footer}>
            Portal Certificado Digital MEI.
            <br />
            E-mail automático; não responda.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, unknown>) =>
    `Protocolo pendente de conclusão — CNPJ ${(d?.cnpj as string) || 'MEI'}`,
  displayName: 'Cobrança — PIX pendente (15 min / diário)',
  previewData: {
    empresa: 'EMPRESA EXEMPLO MEI LTDA',
    cnpj: '12.345.678/0001-90',
    link: 'https://seu-certificado-mei-digital.online/c/exemplo',
    protocolo: 'CD-4F21A9B7',
    dataSolicitacao: '31/07/2026 09:14',
  },
} satisfies TemplateEntry

const ALERT = '#a11a1a'
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
  backgroundColor: '#fdecec',
  borderLeft: `4px solid ${ALERT}`,
  padding: '9px 12px',
  margin: '0 0 18px',
}
const statusText = { fontSize: '11px', color: ALERT, fontWeight: 'bold' as const, margin: '0', letterSpacing: '0.4px' }
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
const dataKey = { fontSize: '11px', color: '#6b7671', padding: '9px 14px', width: '38%', verticalAlign: 'top' as const }
const dataVal = { fontSize: '11.5px', color: '#111111', padding: '9px 14px', fontWeight: 'bold' as const }
const dataValAlert = { fontSize: '11.5px', color: ALERT, padding: '9px 14px', fontWeight: 'bold' as const }
const listBox = { backgroundColor: '#f4f7f5', borderRadius: '6px', padding: '13px 15px', margin: '0 0 18px' }
const listItem = { fontSize: '12px', color: '#333333', lineHeight: '1.6', margin: '0 0 6px' }
const listItemLast = { fontSize: '12px', color: '#333333', lineHeight: '1.6', margin: '0' }
const button = {
  backgroundColor: ALERT,
  color: '#ffffff',
  fontSize: '13.5px',
  borderRadius: '6px',
  padding: '13px 24px',
  textDecoration: 'none',
  display: 'inline-block',
  fontWeight: 'bold' as const,
}
const hr = { borderColor: '#e5e7eb', margin: '22px 0 14px' }
const note = { fontSize: '10.5px', color: '#8a8f98', lineHeight: '1.55', margin: '0' }
const footerBox = { backgroundColor: '#f4f7f5', padding: '16px 22px', borderRadius: '0 0 4px 4px' }
const footer = { fontSize: '10px', color: '#6b7671', lineHeight: '1.6', margin: '0' }

export default Email
